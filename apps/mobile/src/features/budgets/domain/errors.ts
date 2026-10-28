/**
 * AhorRaso - Errores de dominio del feature Budgets (RF-006 / RNF-009)
 *
 * Dominio puro (sin React ni SQLite): el repositorio lanza `BudgetError`
 * con un código tipado y la UI traduce ese código a un mensaje amigable.
 */

export type BudgetErrorCode =
  | 'VALIDATION'              // Datos de entrada inválidos (monto <= 0, fecha errónea...)
  | 'NOT_FOUND'               // El presupuesto no existe o pertenece a otro usuario
  | 'DUPLICATE_BUDGET'        // Ya existe un presupuesto para la misma categoría en este periodo (RNF-009)
  | 'CATEGORY_NOT_FOUND'      // La categoría no existe o está dada de baja
  | 'CATEGORY_TYPE_MISMATCH'; // La categoría no es de tipo gasto

export class BudgetError extends Error {
  readonly code: BudgetErrorCode;

  constructor(code: BudgetErrorCode, message: string) {
    super(message);
    this.name = 'BudgetError';
    this.code = code;
  }
}

/**
 * Mensajes canónicos centralizados para la UI y afirmaciones en pruebas.
 */
export const BUDGET_ERROR_MESSAGES: Record<BudgetErrorCode, string> = {
  VALIDATION: 'El monto del presupuesto debe ser mayor a 0 y los campos son obligatorios.',
  NOT_FOUND: 'El presupuesto solicitado no existe o ya no está disponible.',
  DUPLICATE_BUDGET: 'Ya existe un presupuesto asignado a esta categoría para el mismo periodo seleccionado.',
  CATEGORY_NOT_FOUND: 'La categoría seleccionada no existe o ya no está disponible.',
  CATEGORY_TYPE_MISMATCH: 'Solo se pueden establecer presupuestos sobre categorías de gastos.',
};
