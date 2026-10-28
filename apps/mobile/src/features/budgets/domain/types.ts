import { z } from 'zod';
import { Budget } from '@/core/db';
import { BudgetError, BUDGET_ERROR_MESSAGES } from './errors';

export const budgetPeriodSchema = z.enum(['weekly', 'biweekly', 'monthly']);
export type BudgetPeriod = z.infer<typeof budgetPeriodSchema>;

/**
 * Esquema Zod de validación estricta para crear presupuestos (RF-006 / RNF-009).
 * - Monto positivo estricto (> 0 céntimos).
 * - Categoría requerida.
 * - Periodo válido ('weekly', 'biweekly', 'monthly').
 * - Fechas válidas en formato YYYY-MM-DD.
 */
export const createBudgetSchema = z
  .object({
    categoryId: z.string().trim().min(1, 'La categoría es obligatoria'),
    amountCents: z
      .number()
      .int('El monto debe ser un valor entero en céntimos')
      .positive('El monto debe ser mayor a 0'),
    periodType: budgetPeriodSchema,
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: 'La fecha final debe ser mayor o igual a la fecha inicial',
    path: ['periodEnd'],
  });

export const updateBudgetSchema = z.object({
  amountCents: z
    .number()
    .int('El monto debe ser un valor entero en céntimos')
    .positive('El monto debe ser mayor a 0'),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

/**
 * Convierte cualquier error de Zod a un `BudgetError` con código 'VALIDATION'
 * y un mensaje claro para el usuario.
 */
export function toBudgetValidationError(error: unknown): BudgetError {
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : BUDGET_ERROR_MESSAGES.VALIDATION;
    return new BudgetError('VALIDATION', message);
  }
  return error instanceof BudgetError
    ? error
    : new BudgetError('VALIDATION', BUDGET_ERROR_MESSAGES.VALIDATION);
}

/**
 * Formatea una fecha local a string YYYY-MM-DD sin desajustes por zona horaria.
 */
export function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula determinísticamente el rango de fechas (periodStart y periodEnd)
 * para un tipo de periodo ('weekly', 'biweekly', 'monthly') dado una fecha de referencia.
 *
 * - 'weekly': Semana de Lunes a Domingo.
 * - 'biweekly': Quincena financiera estándar (Día 1-15, o Día 16-Fin de mes).
 * - 'monthly': Mes calendario completo (Día 1 al último día del mes).
 */
export function calculatePeriodRange(
  periodType: BudgetPeriod,
  ref: string | Date = new Date()
): { periodStart: string; periodEnd: string } {
  let date: Date;
  if (typeof ref === 'string') {
    const [y, m, d] = ref.split('-').map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  }

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const day = date.getDate();

  if (periodType === 'monthly') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0); // Último día del mes
    return {
      periodStart: formatDateToYMD(start),
      periodEnd: formatDateToYMD(end),
    };
  }

  if (periodType === 'biweekly') {
    if (day <= 15) {
      const start = new Date(year, month, 1);
      const end = new Date(year, month, 15);
      return {
        periodStart: formatDateToYMD(start),
        periodEnd: formatDateToYMD(end),
      };
    } else {
      const start = new Date(year, month, 16);
      const end = new Date(year, month + 1, 0);
      return {
        periodStart: formatDateToYMD(start),
        periodEnd: formatDateToYMD(end),
      };
    }
  }

  // 'weekly': Lunes a Domingo
  // getDay() devuelve 0 para domingo, 1 para lunes, ..., 6 para sábado
  const currentDay = date.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(year, month, day + diffToMonday);
  const sunday = new Date(year, month, monday.getDate() + 6);

  return {
    periodStart: formatDateToYMD(monday),
    periodEnd: formatDateToYMD(sunday),
  };
}

/** Presupuesto enriquecido con metadatos de categoría y métricas de gasto. */
export interface BudgetWithCategory extends Budget {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  spentCents: number;
}

export type { Budget };
