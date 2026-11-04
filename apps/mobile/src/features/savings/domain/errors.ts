/**
 * AhorRaso - Errores de dominio del feature Savings Goals (HU-08 / RF-007 / RF-014)
 *
 * Dominio puro (desacoplado de React y SQLite): el repositorio y la lógica de validación
 * lanzan `SavingsGoalError` con un código tipado y la UI traduce ese código al usuario.
 */

export type SavingsGoalErrorCode =
  | 'VALIDATION'               // Datos de entrada inválidos (nombre vacío, monto <= 0...)
  | 'NOT_FOUND'                // La meta no existe o pertenece a otro usuario
  | 'INVALID_AMOUNT'           // Monto de ahorro periódico o meta inconsistente
  | 'GOAL_ALREADY_COMPLETED';  // Intento de operar sobre una meta ya completada

export class SavingsGoalError extends Error {
  readonly code: SavingsGoalErrorCode;

  constructor(code: SavingsGoalErrorCode, message: string) {
    super(message);
    this.name = 'SavingsGoalError';
    this.code = code;
  }
}

/**
 * Mensajes canónicos centralizados para la UI y afirmaciones en pruebas.
 */
export const SAVINGS_GOAL_ERROR_MESSAGES: Record<SavingsGoalErrorCode, string> = {
  VALIDATION: 'Los datos de la meta de ahorro son inválidos. Revisa los campos obligatorios.',
  NOT_FOUND: 'La meta de ahorro solicitada no existe o ya no está disponible.',
  INVALID_AMOUNT: 'El monto objetivo y el ahorro periódico deben ser valores positivos mayores a cero.',
  GOAL_ALREADY_COMPLETED: 'Esta meta de ahorro ya ha sido alcanzada en su totalidad.',
};
