/**
 * AhorRaso - Errores de dominio del feature Categories (RF-004 / RF-005)
 *
 * Dominio puro (sin React ni SQLite): los repositorios lanzan `CategoryError`
 * con un código estable y la UI traduce ese código a un mensaje comprensible
 * sin depender del texto exacto de la excepción.
 */

export type CategoryErrorCode =
  | 'VALIDATION'      // Datos de entrada inválidos (nombre vacío, color malformado…)
  | 'NOT_FOUND'       // La categoría no existe, no está activa o pertenece a otro usuario
  | 'DUPLICATE_NAME'  // Ya existe una categoría activa con ese nombre (mismo usuario y tipo)
  | 'PROTECTED'       // Categoría por defecto del sistema: no editable ni eliminable
  | 'IN_USE'          // La categoría tiene movimientos asociados (eliminación restringida)
  | 'TYPE_MISMATCH';  // La categoría no es compatible con el tipo de movimiento

export class CategoryError extends Error {
  readonly code: CategoryErrorCode;

  /** Contexto numérico opcional: nº de movimientos asociados en `IN_USE`. */
  readonly count?: number;

  constructor(code: CategoryErrorCode, message: string, options?: { count?: number }) {
    super(message);
    this.name = 'CategoryError';
    this.code = code;
    this.count = options?.count;
  }
}

/**
 * Mensajes canónicos por código. Se centralizan aquí para que la UI y los
 * repositorios usen exactamente el mismo texto y las pruebas puedan afirmar
 * contra constantes.
 */
export const CATEGORY_ERROR_MESSAGES: Record<CategoryErrorCode, string> = {
  VALIDATION: 'Revisa los datos de la categoría: nombre, tipo, icono y color son obligatorios.',
  NOT_FOUND: 'La categoría seleccionada no existe o ya no está disponible.',
  DUPLICATE_NAME: 'Ya existe una categoría con ese nombre en el mismo tipo.',
  PROTECTED: 'Las categorías por defecto de AhorRaso no pueden modificarse ni eliminarse.',
  IN_USE: 'No puedes eliminar esta categoría: tiene movimientos asociados.',
  TYPE_MISMATCH: 'La categoría no corresponde al tipo de movimiento (ingreso o gasto).',
};

/**
 * Crea el error `IN_USE` incluyendo el número de movimientos asociados,
 * para que la UI pueda informar al usuario qué debe reasignar.
 */
export function categoryInUseError(count: number): CategoryError {
  return new CategoryError(
    'IN_USE',
    count === 1
      ? 'No puedes eliminar esta categoría: tiene 1 movimiento asociado. Reasígnalo antes de eliminarla.'
      : `No puedes eliminar esta categoría: tiene ${count} movimientos asociados. Reasígnalos antes de eliminarla.`,
    { count }
  );
}
