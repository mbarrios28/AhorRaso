import { z } from 'zod';
import { AlertError, ALERT_ERROR_MESSAGES } from './errors';

export const DEFAULT_ALERT_THRESHOLDS = [50, 80, 100] as const;

/**
 * Esquema para un umbral individual (porcentaje de 1 a 200).
 */
export const alertThresholdItemSchema = z
  .number({ message: 'El umbral debe ser numérico' })
  .int('El porcentaje debe ser entero')
  .min(1, 'El umbral mínimo es 1%')
  .max(200, 'El umbral máximo es 200%');

/**
 * Esquema de lista de umbrales con protección de valores por defecto (RNF-010).
 */
export const alertThresholdsListSchema = z
  .array(alertThresholdItemSchema)
  .min(1, 'Debes definir al menos un umbral de alerta')
  .transform((items) => Array.from(new Set(items)).sort((a, b) => a - b));

/**
 * Esquema de validación para actualizar preferencias de notificación (RF-010).
 */
export const updateNotificationPrefsSchema = z.object({
  enabled: z.boolean({ message: 'El estado debe ser booleano' }),
  thresholds: alertThresholdsListSchema,
  channelInApp: z.boolean({ message: 'El canal in-app debe ser booleano' }),
  channelPush: z.boolean({ message: 'El canal push debe ser booleano' }),
});

export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;

/**
 * Modelo de Dominio de Preferencias de Notificación tipado limpio.
 */
export interface NotificationPreferences {
  id: string;
  userId: string;
  enabled: boolean;
  thresholds: number[];
  channelInApp: boolean;
  channelPush: boolean;
  createdAt: string;
  clientUpdatedAt: string;
}

/**
 * Información de una alerta disparada al usuario.
 */
export interface BudgetAlertTriggered {
  id?: string;
  userId: string;
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  thresholdPercent: number;
  periodStart: string;
  periodEnd: string;
  spentCents: number;
  budgetAmountCents: number;
  currentPercent: number;
  createdAt: string;
}

/**
 * Resultado de evaluación reactiva de alertas tras registrar o consultar transacciones.
 */
export interface BudgetAlertEvaluationResult {
  triggered: boolean;
  alerts: BudgetAlertTriggered[];
}

/**
 * Parser resiliente de umbrales desde SQLite / JSON con protección de fallback
 * por defecto [50, 80, 100] ante cualquier corrupción o formato inválido (RNF-010).
 */
export function parseThresholdsSafely(raw: unknown): number[] {
  if (!raw) return [...DEFAULT_ALERT_THRESHOLDS];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [...DEFAULT_ALERT_THRESHOLDS];
    }
  }

  const result = alertThresholdsListSchema.safeParse(parsed);
  if (result.success && result.data.length > 0) {
    return result.data;
  }

  return [...DEFAULT_ALERT_THRESHOLDS];
}

/**
 * Convierte un error de Zod a AlertError de dominio.
 */
export function toAlertValidationError(error: unknown): AlertError {
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : ALERT_ERROR_MESSAGES.VALIDATION;
    return new AlertError('VALIDATION', message);
  }
  return error instanceof AlertError
    ? error
    : new AlertError('VALIDATION', ALERT_ERROR_MESSAGES.VALIDATION);
}
