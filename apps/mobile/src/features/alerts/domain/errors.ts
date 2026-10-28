/**
 * AhorRaso - Errores de dominio del feature Alerts (RF-010 / RF-011 / RNF-010)
 */

export type AlertErrorCode =
  | 'VALIDATION'       // Datos de preferencias o umbrales inválidos
  | 'NOT_FOUND'        // Preferencias no encontradas
  | 'DUPLICATE_ALERT'; // Alerta ya emitida en el periodo para el mismo umbral (Anti-spam)

export class AlertError extends Error {
  readonly code: AlertErrorCode;

  constructor(code: AlertErrorCode, message: string) {
    super(message);
    this.name = 'AlertError';
    this.code = code;
  }
}

export const ALERT_ERROR_MESSAGES: Record<AlertErrorCode, string> = {
  VALIDATION: 'Los parámetros de configuración de alertas son inválidos.',
  NOT_FOUND: 'No se encontraron preferencias de notificación configuradas.',
  DUPLICATE_ALERT: 'Esta alerta de umbral ya fue emitida en el periodo activo.',
};
