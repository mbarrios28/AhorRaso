/**
 * Pruebas unitarias del dominio del historial (RF-009): validación de filtros,
 * normalización de búsqueda y cursores de paginación keyset. Son puras (sin
 * SQLite ni React).
 */
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  HISTORY_RANGE_PRESETS,
  MAX_HISTORY_PAGE_SIZE,
  countActiveHistoryFilters,
  decodeHistoryCursor,
  encodeHistoryCursor,
  hasActiveHistoryFilters,
  historyFiltersSchema,
  normalizeHistoryLimit,
  normalizeHistorySearchTerm,
  parseAmountToCents,
  resolveHistoryRangePreset,
  toIsoDate,
} from '../history';
import { HistoryQueryError } from '../errors';

describe('historyFiltersSchema', () => {
  it('aplica el orden por defecto (más reciente primero)', () => {
    const parsed = historyFiltersSchema.parse({});

    expect(parsed.order).toBe('date_desc');
  });

  it('acepta filtros combinados válidos', () => {
    const parsed = historyFiltersSchema.parse({
      type: 'expense',
      from: '2026-10-01',
      to: '2026-10-31',
      categoryId: 'cat-1',
      merchantId: 'mer-1',
      minAmountCents: 500,
      maxAmountCents: 5000,
      search: 'menú',
      order: 'date_asc',
    });

    expect(parsed.type).toBe('expense');
    expect(parsed.from).toBe('2026-10-01');
    expect(parsed.order).toBe('date_asc');
  });

  it('rechaza fechas con formato distinto a YYYY-MM-DD', () => {
    const result = historyFiltersSchema.safeParse({ from: '01-10-2026' });

    expect(result.success).toBe(false);
  });

  it('rechaza un rango de fechas invertido', () => {
    const result = historyFiltersSchema.safeParse({ from: '2026-10-31', to: '2026-10-01' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('posterior');
    }
  });

  it('rechaza un rango de montos invertido', () => {
    const result = historyFiltersSchema.safeParse({
      minAmountCents: 9000,
      maxAmountCents: 100,
    });

    expect(result.success).toBe(false);
  });

  it('rechaza montos decimales o negativos (los montos son céntimos enteros)', () => {
    expect(historyFiltersSchema.safeParse({ minAmountCents: 10.5 }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ minAmountCents: -1 }).success).toBe(false);
  });
});

describe('cursores de paginación keyset', () => {
  const tx = {
    id: 'tx-1',
    occurredOn: '2026-10-05',
    createdAt: '2026-10-05T15:04:05.123Z',
  };

  it('serializa y deserializa un movimiento sin pérdida de datos', () => {
    const cursor = encodeHistoryCursor(tx);

    expect(decodeHistoryCursor(cursor)).toEqual({
      occurredOn: tx.occurredOn,
      createdAt: tx.createdAt,
      id: tx.id,
    });
  });

  it('rechaza cursores sin versión, incompletos o con fecha inválida', () => {
    const invalid = [
      '',
      'cursor-invalido',
      '2026-10-05|2026-10-05T15:04:05.123Z|tx-1',
      'v1|2026-10-05|tx-1',
      'v1|05-10-2026|2026-10-05T15:04:05.123Z|tx-1',
      'v2|2026-10-05|2026-10-05T15:04:05.123Z|tx-1',
    ];

    for (const raw of invalid) {
      let thrown: HistoryQueryError | null = null;
      try {
        decodeHistoryCursor(raw);
      } catch (error) {
        thrown = error as HistoryQueryError;
      }
      expect(thrown?.code).toBe('INVALID_CURSOR');
    }
  });
});

describe('utilidades del historial', () => {
  it('acota el tamaño de página al rango soportado', () => {
    expect(normalizeHistoryLimit(undefined)).toBe(DEFAULT_HISTORY_PAGE_SIZE);
    expect(normalizeHistoryLimit(0)).toBe(1);
    expect(normalizeHistoryLimit(-5)).toBe(1);
    expect(normalizeHistoryLimit(500)).toBe(MAX_HISTORY_PAGE_SIZE);
    expect(normalizeHistoryLimit(Number.NaN)).toBe(DEFAULT_HISTORY_PAGE_SIZE);
    expect(normalizeHistoryLimit(7)).toBe(7);
  });

  it('normaliza el término de búsqueda y descarta comodines de LIKE', () => {
    expect(normalizeHistorySearchTerm('  Menú UNSA ')).toBe('menú unsa');
    expect(normalizeHistorySearchTerm('%Tambo%')).toBe('tambo');
    expect(normalizeHistorySearchTerm('a_b')).toBe('ab');
    expect(normalizeHistorySearchTerm('   ')).toBeNull();
    expect(normalizeHistorySearchTerm(undefined)).toBeNull();
    expect(normalizeHistorySearchTerm('%')).toBeNull();
  });

  it('cuenta solo los filtros activos e ignora el orden', () => {
    expect(countActiveHistoryFilters({ order: 'date_asc' })).toBe(0);
    expect(hasActiveHistoryFilters({ order: 'date_asc' })).toBe(false);
    expect(countActiveHistoryFilters({ type: 'expense', categoryId: 'c1' })).toBe(2);
    expect(hasActiveHistoryFilters({ search: 'tambo' })).toBe(true);
  });
});

describe('atajos de rango de fechas', () => {
  // Fecha de referencia fija: domingo 18 de octubre de 2026.
  const today = new Date(2026, 9, 18);

  it('formatea fechas locales como YYYY-MM-DD', () => {
    expect(toIsoDate(today)).toBe('2026-10-18');
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('expone los atajos esperados por la UI', () => {
    expect(HISTORY_RANGE_PRESETS.map((preset) => preset.id)).toEqual([
      'today',
      'week',
      'month',
      'lastMonth',
      'all',
    ]);
  });

  it('resuelve el rango de cada atajo', () => {
    expect(resolveHistoryRangePreset('today', today)).toEqual({
      from: '2026-10-18',
      to: '2026-10-18',
    });
    expect(resolveHistoryRangePreset('week', today)).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(resolveHistoryRangePreset('month', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-18',
    });
    expect(resolveHistoryRangePreset('lastMonth', today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(resolveHistoryRangePreset('all', today)).toEqual({});
  });

  it('calcula el mes pasado correctamente cruzando de año y en febrero', () => {
    expect(resolveHistoryRangePreset('lastMonth', new Date(2026, 0, 15))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(resolveHistoryRangePreset('lastMonth', new Date(2026, 2, 10))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

describe('parseAmountToCents', () => {
  it('convierte montos en soles a céntimos', () => {
    expect(parseAmountToCents('15.50')).toBe(1550);
    expect(parseAmountToCents('15,50')).toBe(1550);
    expect(parseAmountToCents('7')).toBe(700);
    expect(parseAmountToCents(' 20.5 ')).toBe(2050);
    expect(parseAmountToCents('0')).toBe(0);
  });

  it('devuelve undefined cuando el campo está vacío (sin filtro)', () => {
    expect(parseAmountToCents('')).toBeUndefined();
    expect(parseAmountToCents('   ')).toBeUndefined();
  });

  it('devuelve null cuando el texto no es un monto válido', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-5')).toBeNull();
    expect(parseAmountToCents('15.505')).toBeNull();
    expect(parseAmountToCents('15.5.5')).toBeNull();
  });
});
