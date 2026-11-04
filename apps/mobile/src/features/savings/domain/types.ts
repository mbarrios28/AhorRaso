import { z } from 'zod';
import { SavingsGoal } from '@/core/db';
import { SavingsGoalError, SAVINGS_GOAL_ERROR_MESSAGES } from './errors';

export const savingsFrequencySchema = z.enum(['weekly', 'biweekly', 'monthly']);
export type SavingsFrequency = z.infer<typeof savingsFrequencySchema>;

export const savingsStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export type SavingsStatus = z.infer<typeof savingsStatusSchema>;

/**
 * Esquema Zod de validación para la creación de metas de ahorro (RF-007).
 */
export const createSavingsGoalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre de la meta es obligatorio')
    .max(60, 'El nombre no puede exceder 60 caracteres'),
  targetAmountCents: z
    .number()
    .int('El monto objetivo debe ser un entero en céntimos')
    .positive('El monto objetivo debe ser mayor a 0'),
  currentAmountCents: z
    .number()
    .int('El monto acumulado debe ser un entero en céntimos')
    .min(0, 'El monto acumulado no puede ser negativo')
    .optional()
    .default(0),
  periodicSavingsCents: z
    .number()
    .int('El ahorro periódico debe ser un entero en céntimos')
    .positive('El ahorro periódico debe ser mayor a 0'),
  frequency: savingsFrequencySchema,
  targetDate: z.string().optional(),
});

export type CreateSavingsGoalInput = z.input<typeof createSavingsGoalSchema>;
export type ParsedCreateSavingsGoal = z.output<typeof createSavingsGoalSchema>;

/**
 * Esquema Zod para registrar abonos y actualizar el progreso acumulado.
 */
export const updateSavingsGoalProgressSchema = z.object({
  addAmountCents: z
    .number()
    .int('El abono debe ser un entero en céntimos')
    .positive('El monto a abonar debe ser mayor a 0'),
});

export type UpdateSavingsGoalProgressInput = z.infer<typeof updateSavingsGoalProgressSchema>;

/**
 * Resultado de la simulación pura de proyección (RF-014).
 */
export interface SavingsSimulationResult {
  targetAmountCents: number;
  currentAmountCents: number;
  remainingAmountCents: number;
  periodicSavingsCents: number;
  frequency: SavingsFrequency;
  periodsNeeded: number;
  estimatedDate: string; // Formato YYYY-MM-DD
  progressPercentage: number; // 0 a 100
  isCompleted: boolean;
}

/**
 * Meta de ahorro enriquecida con datos calculados reactivamente de simulación.
 */
export interface SavingsGoalWithSimulation extends SavingsGoal {
  simulation: SavingsSimulationResult;
}

/**
 * Convierte un error de Zod a un `SavingsGoalError` con código 'VALIDATION' y un mensaje claro.
 */
export function toSavingsValidationError(error: unknown): SavingsGoalError {
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : SAVINGS_GOAL_ERROR_MESSAGES.VALIDATION;
    return new SavingsGoalError('VALIDATION', message);
  }
  return error instanceof SavingsGoalError
    ? error
    : new SavingsGoalError('VALIDATION', SAVINGS_GOAL_ERROR_MESSAGES.VALIDATION);
}
