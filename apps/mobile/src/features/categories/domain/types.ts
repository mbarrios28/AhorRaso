import { z } from 'zod';
import { Category } from '@/core/db';
import { CategoryError, CATEGORY_ERROR_MESSAGES } from './errors';

/** Longitud máxima del nombre, coherente con el esquema SQLite (1..40). */
export const CATEGORY_NAME_MAX_LENGTH = 40;

export const categoryTypeSchema = z.enum(['income', 'expense']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

/**
 * Atributos editables/creables de una categoría (RF-005).
 * `type` se valida aparte porque la regla de negocio añade restricciones
 * más allá del enum (ver `assertCategoryTypeCompatible`).
 */
export const categoryAttributesSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(CATEGORY_NAME_MAX_LENGTH, `Máximo ${CATEGORY_NAME_MAX_LENGTH} caracteres`),
  type: categoryTypeSchema,
  icon: z.string().min(1, 'El icono es obligatorio'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato hexadecimal inválido (#RRGGBB)'),
});

export const createCategorySchema = categoryAttributesSchema;

/** Actualización: mismos atributos obligatorios (no se admite cambio de tipo). */
export const updateCategorySchema = categoryAttributesSchema;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Convierte un error de Zod en un `CategoryError` de dominio con el primer
 * mensaje legible, evitante que la UI muestre el JSON crudo de Zod.
 */
export function toCategoryValidationError(error: unknown): CategoryError {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    const message = first
      ? `${first.path.join('.') || 'categoría'}: ${first.message}`
      : CATEGORY_ERROR_MESSAGES.VALIDATION;
    return new CategoryError('VALIDATION', message);
  }
  return error instanceof CategoryError
    ? error
    : new CategoryError('VALIDATION', CATEGORY_ERROR_MESSAGES.VALIDATION);
}

/**
 * Normaliza el nombre para comparaciones de unicidad: recorta espacios y
 * minúsculas (replica el índice único parcial `lower(trim(name))` de SQLite).
 */
export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Regla de negocio: una categoría solo puede usarse en un movimiento si
 * existe, está activa, pertenece al usuario y su tipo coincide con el
 * movimiento (RF-004).
 */
export function assertCategoryUsableForTransaction(
  category: Category | null | undefined,
  transactionType: CategoryType,
  userId: string
): Category {
  if (!category || category.deletedAt) {
    throw new CategoryError('NOT_FOUND', CATEGORY_ERROR_MESSAGES.NOT_FOUND);
  }
  if (category.userId !== userId) {
    // No se filtra información de otros usuarios (RNF-005): mismo mensaje.
    throw new CategoryError('NOT_FOUND', CATEGORY_ERROR_MESSAGES.NOT_FOUND);
  }
  if (category.type !== transactionType) {
    throw new CategoryError(
      'TYPE_MISMATCH',
      `La categoría «${category.name}» es de tipo ${category.type === 'income' ? 'ingreso' : 'gasto'} y no puede usarse en un movimiento de tipo ${transactionType === 'income' ? 'ingreso' : 'gasto'}.`
    );
  }
  return category;
}

/**
 * Regla de negocio: solo se pueden eliminar categorías personalizadas
 * (no predeterminadas) que pertenezcan al usuario y estén activas.
 * La protección de movimientos asociados se resuelve en el repositorio
 * (capa de datos) consultando la tabla `transactions`.
 */
export function assertCategoryDeletable(category: Category, userId: string): void {
  if (category.userId !== userId || category.deletedAt) {
    throw new CategoryError('NOT_FOUND', CATEGORY_ERROR_MESSAGES.NOT_FOUND);
  }
  if (category.isDefault === 1) {
    throw new CategoryError('PROTECTED', CATEGORY_ERROR_MESSAGES.PROTECTED);
  }
}

/**
 * Regla de negocio: las categorías por defecto del sistema son protegidas
 * (no se pueden editar). Solo las personalizadas son editables.
 */
export function assertCategoryEditable(category: Category, userId: string): void {
  if (category.userId !== userId || category.deletedAt) {
    throw new CategoryError('NOT_FOUND', CATEGORY_ERROR_MESSAGES.NOT_FOUND);
  }
  if (category.isDefault === 1) {
    throw new CategoryError('PROTECTED', CATEGORY_ERROR_MESSAGES.PROTECTED);
  }
}

export type { Category };
