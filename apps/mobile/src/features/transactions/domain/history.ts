/**
 * AhorRaso - Dominio del historial de movimientos (RF-009 / HU-05)
 *
 * Define el contrato de consulta del historial: filtros dinámicos combinables
 * (rango de fechas, categoría, tipo, monto y establecimiento), orden
 * cronológico, cursores opacos de paginación keyset y la forma de la página
 * que consume la UI.
 *
 * Es dominio puro: no importa React ni el driver de SQLite.
 */
import { z } from 'zod';
import { Category, Merchant, Transaction } from '@/core/db';
import { HISTORY_ERROR_MESSAGES, HistoryQueryError } from './errors';

/** Movimientos por página (una pantalla y media en móvil). */
export const DEFAULT_HISTORY_PAGE_SIZE = 20;

/** Tope duro de página: protege la memoria del cliente ante límites externos. */
export const MAX_HISTORY_PAGE_SIZE = 100;

/** Formato de fecha canónico del proyecto ("YYYY-MM-DD"). */
export const HISTORY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const historyTypeSchema = z.enum(['income', 'expense']);
export type HistoryType = z.infer<typeof historyTypeSchema>;

export const historyOrderSchema = z.enum(['date_desc', 'date_asc']);
export type HistoryOrder = z.infer<typeof historyOrderSchema>;

const isoDateSchema = z
  .string()
  .regex(HISTORY_DATE_REGEX, 'Formato de fecha inválido (YYYY-MM-DD)');

/**
 * Contrato de los filtros del historial. Todos son opcionales: el repositorio
 * los aplica de forma aditiva (AND) para soportar filtros combinados.
 *
 * - `search`: texto libre que busca en nota, fuente y nombre del establecimiento.
 * - `merchantQuery`: texto que busca solo por nombre de establecimiento.
 * - `merchantId`: establecimiento exacto (Escenario 1 de HU-05).
 * - Montos en céntimos, coherentes con el esquema (`amount_cents` INTEGER).
 */
export const historyFiltersSchema = z
  .object({
    type: historyTypeSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    categoryId: z.string().min(1).optional(),
    merchantId: z.string().min(1).optional(),
    merchantQuery: z.string().max(80, 'Máximo 80 caracteres').optional(),
    search: z.string().max(200, 'Máximo 200 caracteres').optional(),
    minAmountCents: z.number().int().nonnegative().optional(),
    maxAmountCents: z.number().int().positive().optional(),
    order: historyOrderSchema.default('date_desc'),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'La fecha "desde" no puede ser posterior a la fecha "hasta".',
    path: ['from'],
  })
  .refine(
    (f) =>
      f.minAmountCents === undefined ||
      f.maxAmountCents === undefined ||
      f.minAmountCents <= f.maxAmountCents,
    {
      message: 'El monto mínimo no puede superar al monto máximo.',
      path: ['minAmountCents'],
    }
  );

/** Filtros tal como los entrega la UI (`order` es opcional, se asume `date_desc`). */
export type HistoryFilters = z.input<typeof historyFiltersSchema>;

/** Filtros ya validados y normalizados por el dominio. */
export type NormalizedHistoryFilters = z.output<typeof historyFiltersSchema>;

/**
 * Convierte un error de Zod en un `HistoryQueryError` legible, evitando que la
 * UI muestre el JSON crudo de la librería de validación.
 */
export function toHistoryFilterError(error: unknown): HistoryQueryError {
  if (error instanceof HistoryQueryError) return error;

  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    const field = first && first.path.length > 0 ? `${first.path.join('.')}: ` : '';
    return new HistoryQueryError(
      'INVALID_FILTER',
      first ? `${field}${first.message}` : HISTORY_ERROR_MESSAGES.INVALID_FILTER
    );
  }

  return new HistoryQueryError('INVALID_FILTER', HISTORY_ERROR_MESSAGES.INVALID_FILTER);
}

/**
 * Normaliza un término de búsqueda para `LIKE`: recorta, pasa a minúsculas y
 * elimina los comodines de SQLite (`%`, `_`) para que el texto del usuario se
 * compare literalmente. Devuelve `null` si no queda nada útil.
 */
export function normalizeHistorySearchTerm(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().replace(/[%_]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

/** Posición (keyset) desde la que continuar una página del historial. */
export interface HistoryCursor {
  occurredOn: string;
  createdAt: string;
  id: string;
}

const CURSOR_SEPARATOR = '|';
const CURSOR_VERSION = 'v1';

/**
 * Serializa un movimiento como cursor opaco y estable. Se usa la tupla
 * (occurredOn, createdAt, id), que es exactamente el criterio de orden, de modo
 * que nuevos registros no desplazan las páginas siguientes (a diferencia de
 * OFFSET).
 */
export function encodeHistoryCursor(
  transaction: Pick<Transaction, 'id' | 'occurredOn' | 'createdAt'>
): string {
  return [
    CURSOR_VERSION,
    transaction.occurredOn,
    transaction.createdAt,
    transaction.id,
  ].join(CURSOR_SEPARATOR);
}

/** Decodifica un cursor; lanza `INVALID_CURSOR` si está corrupto. */
export function decodeHistoryCursor(raw: string): HistoryCursor {
  const parts = raw.split(CURSOR_SEPARATOR);
  if (parts.length !== 4 || parts[0] !== CURSOR_VERSION) {
    throw new HistoryQueryError('INVALID_CURSOR', HISTORY_ERROR_MESSAGES.INVALID_CURSOR);
  }

  const [, occurredOn, createdAt, id] = parts;
  if (!HISTORY_DATE_REGEX.test(occurredOn) || createdAt.length === 0 || id.length === 0) {
    throw new HistoryQueryError('INVALID_CURSOR', HISTORY_ERROR_MESSAGES.INVALID_CURSOR);
  }

  return { occurredOn, createdAt, id };
}

/** Movimiento del historial enriquecido con sus referencias lógicas. */
export interface HistoryItem extends Transaction {
  category: Category | null;
  merchant: Merchant | null;
}

/** Sumas del conjunto filtrado completo (no solo de la página visible). */
export interface HistoryTotals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

/** Página de historial devuelta por el repositorio. */
export interface HistoryPage {
  items: HistoryItem[];
  /** Cursor para pedir la siguiente página; `null` si no hay más resultados. */
  nextCursor: string | null;
  hasMore: boolean;
  /** Total de movimientos que cumplen los filtros. */
  total: number;
  totals: HistoryTotals;
}

/** Parámetros de paginación de la consulta. */
export interface HistoryQueryOptions {
  limit?: number;
  cursor?: string | null;
}

/** Acota el tamaño de página al rango soportado por el dominio. */
export function normalizeHistoryLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_HISTORY_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_HISTORY_PAGE_SIZE);
}

/** Página vacía con totales en cero (estado inicial y sin coincidencias). */
export const EMPTY_HISTORY_PAGE: HistoryPage = {
  items: [],
  nextCursor: null,
  hasMore: false,
  total: 0,
  totals: { incomeCents: 0, expenseCents: 0, netCents: 0 },
};

/**
 * Cuenta los filtros activos (excluye el orden, que siempre tiene valor). Se usa
 * en la UI para el badge del botón de filtros y el estado del botón "Limpiar".
 */
export function countActiveHistoryFilters(filters: HistoryFilters): number {
  return [
    filters.type,
    filters.from,
    filters.to,
    filters.categoryId,
    filters.merchantId,
    filters.merchantQuery,
    filters.search,
    filters.minAmountCents,
    filters.maxAmountCents,
  ].filter((value) => value !== undefined && value !== null && value !== '').length;
}

/** Indica si hay al menos un filtro activo (para la UI de chips/reset). */
export function hasActiveHistoryFilters(filters: HistoryFilters): boolean {
  return countActiveHistoryFilters(filters) > 0;
}

// ==========================================
// Atajos de rango de fechas (UI de filtros)
// ==========================================

/** Formatea una fecha local como "YYYY-MM-DD" (formato canónico del proyecto). */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type HistoryRangePreset = 'today' | 'week' | 'month' | 'lastMonth' | 'all';

/** Atajos temporales ofrecidos por la barra de filtros. */
export const HISTORY_RANGE_PRESETS: { id: HistoryRangePreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Últimos 7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
  { id: 'all', label: 'Todo' },
];

/**
 * Traduce un atajo temporal al rango (`from`/`to`) en la zona horaria del
 * usuario. `all` no acota nada (devuelve un rango vacío).
 */
export function resolveHistoryRangePreset(
  preset: HistoryRangePreset,
  today: Date = new Date()
): { from?: string; to?: string } {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  switch (preset) {
    case 'today':
      return { from: toIsoDate(end), to: toIsoDate(end) };
    case 'week': {
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'month': {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'lastMonth': {
      const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      const lastDay = new Date(end.getFullYear(), end.getMonth(), 0);
      return { from: toIsoDate(start), to: toIsoDate(lastDay) };
    }
    case 'all':
    default:
      return {};
  }
}

// ==========================================
// Entrada de montos (UI de filtros)
// ==========================================

/**
 * Convierte el texto de un monto en soles a céntimos (entero).
 * - `undefined`: el campo está vacío (sin filtro de ese extremo).
 * - `null`: el texto no es un monto válido (se reporta en la UI de filtros).
 */
export function parseAmountToCents(raw: string): number | undefined | null {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!/^\d+([.,]\d{0,2})?$/.test(trimmed)) return null;

  const cents = Math.round(Number(trimmed.replace(',', '.')) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : null;
}
