/**
 * AhorRaso - Errores de dominio del feature Transactions (RF-009)
 *
 * Dominio puro (sin React ni SQLite): el repositorio lanza `HistoryQueryError`
 * con un código estable y la UI traduce ese código a un mensaje comprensible
 * sin depender del texto exacto de la excepción.
 */

export type HistoryQueryErrorCode =
  | 'INVALID_FILTER'   // Los parámetros de búsqueda no cumplen el contrato (fechas o montos)
  | 'INVALID_CURSOR';  // El cursor de paginación (keyset) está corrupto o es de otra versión

export class HistoryQueryError extends Error {
  readonly code: HistoryQueryErrorCode;

  constructor(code: HistoryQueryErrorCode, message: string) {
    super(message);
    this.name = 'HistoryQueryError';
    this.code = code;
  }
}

/**
 * Mensajes canónicos por código. Se centralizan aquí para que la UI y el
 * repositorio usen exactamente el mismo texto y las pruebas puedan afirmar
 * contra constantes.
 */
export const HISTORY_ERROR_MESSAGES: Record<HistoryQueryErrorCode, string> = {
  INVALID_FILTER: 'Revisa los filtros del historial: las fechas y los montos deben ser válidos.',
  INVALID_CURSOR: 'La paginación del historial venció. Vuelve a cargar la lista.',
};
