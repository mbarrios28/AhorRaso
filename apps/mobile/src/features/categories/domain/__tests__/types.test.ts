/**
 * Pruebas unitarias del dominio de categorías (RF-004 / RF-005).
 * Dominio puro sin React ni SQLite (ARQUITECTURA_TECNICA §3.1).
 */
import {
  createCategorySchema,
  updateCategorySchema,
  CATEGORY_NAME_MAX_LENGTH,
  normalizeCategoryName,
  toCategoryValidationError,
  assertCategoryUsableForTransaction,
  assertCategoryEditable,
  assertCategoryDeletable,
} from '../types';
import { CategoryError, CATEGORY_ERROR_MESSAGES, categoryInUseError } from '../errors';
import { Category } from '@/core/db';

const baseCategory: Category = {
  id: 'cat-1',
  userId: 'user-1',
  name: 'Alimentación',
  type: 'expense',
  icon: 'Utensils',
  color: '#F97316',
  isDefault: 0,
  sortOrder: 11,
  createdAt: '2026-01-01T00:00:00.000Z',
  clientUpdatedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
};

describe('normalizeCategoryName', () => {
  it('recorta espacios y pasa a minúsculas (replica lower(trim(name)) de SQLite)', () => {
    expect(normalizeCategoryName('  Alimentación  ')).toBe('alimentación');
    expect(normalizeCategoryName('MASCOTAS')).toBe('mascotas');
  });
});

describe('createCategorySchema', () => {
  it('acepta una categoría válida', () => {
    const result = createCategorySchema.parse({
      name: 'Mascotas',
      type: 'expense',
      icon: 'PawPrint',
      color: '#8B5CF6',
    });
    expect(result.name).toBe('Mascotas');
    expect(result.type).toBe('expense');
  });

  it('recorta el nombre almacenado', () => {
    const result = createCategorySchema.parse({
      name: '  Gimnasio  ',
      type: 'expense',
      icon: 'Dumbbell',
      color: '#111827',
    });
    expect(result.name).toBe('Gimnasio');
  });

  it('rechaza el nombre vacío', () => {
    const attempt = createCategorySchema.safeParse({
      name: '   ',
      type: 'expense',
      icon: 'Tag',
      color: '#111827',
    });
    expect(attempt.success).toBe(false);
  });

  it(`rechaza nombres de más de ${CATEGORY_NAME_MAX_LENGTH} caracteres`, () => {
    const attempt = createCategorySchema.safeParse({
      name: 'x'.repeat(CATEGORY_NAME_MAX_LENGTH + 1),
      type: 'expense',
      icon: 'Tag',
      color: '#111827',
    });
    expect(attempt.success).toBe(false);
  });

  it('rechaza colores que no sean hexadecimal #RRGGBB', () => {
    for (const color of ['rojo', '#12345', 'FF0000', '#GGG']) {
      const attempt = createCategorySchema.safeParse({
        name: 'Varios',
        type: 'expense',
        icon: 'Tag',
        color,
      });
      expect(attempt.success).toBe(false);
    }
  });

  it('rechaza tipos fuera de income/expense', () => {
    const attempt = createCategorySchema.safeParse({
      name: 'Varios',
      type: 'otro',
      icon: 'Tag',
      color: '#111827',
    });
    expect(attempt.success).toBe(false);
  });

  it('updateCategorySchema exige los mismos atributos', () => {
    const attempt = updateCategorySchema.safeParse({ name: '', type: 'income', icon: 'X', color: '#000000' });
    expect(attempt.success).toBe(false);
  });
});

describe('toCategoryValidationError', () => {
  it('convierte un ZodError en CategoryError VALIDATION con el primer mensaje legible', () => {
    const parsed = createCategorySchema.safeParse({ name: '', type: 'expense', icon: 'Tag', color: '#111827' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const error = toCategoryValidationError(parsed.error);
    expect(error.name).toBe('CategoryError');
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toContain('nombre');
  });

  it('propaga un CategoryError existente sin modificarlo', () => {
    const original = new CategoryError('PROTECTED', 'protegida');
    expect(toCategoryValidationError(original)).toBe(original);
  });

  it('cualquier error desconocido se traduce a VALIDATION con mensaje canónico', () => {
    const error = toCategoryValidationError(new Error('boom'));
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toBe(CATEGORY_ERROR_MESSAGES.VALIDATION);
  });
});

describe('assertCategoryUsableForTransaction (RF-004)', () => {
  it('devuelve la categoría cuando existe, está activa y el tipo coincide', () => {
    const result = assertCategoryUsableForTransaction(baseCategory, 'expense', 'user-1');
    expect(result).toBe(baseCategory);
  });

  it('lanza NOT_FOUND si la categoría no existe', () => {
    expect(() => assertCategoryUsableForTransaction(null, 'expense', 'user-1')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('lanza NOT_FOUND si la categoría está soft-eliminada', () => {
    const deleted = { ...baseCategory, deletedAt: '2026-01-02T00:00:00.000Z' };
    expect(() => assertCategoryUsableForTransaction(deleted, 'expense', 'user-1')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('lanza NOT_FOUND (no expone datos ajenos) si pertenece a otro usuario', () => {
    expect(() => assertCategoryUsableForTransaction(baseCategory, 'expense', 'user-2')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('lanza TYPE_MISMATCH con mensaje claro si el tipo no corresponde', () => {
    let thrown: any = null;
    try {
      assertCategoryUsableForTransaction(baseCategory, 'income', 'user-1');
    } catch (error) {
      thrown = error;
    }
    expect(thrown?.code).toBe('TYPE_MISMATCH');
    expect(thrown?.message).toContain('gasto');
    expect(thrown?.message).toContain('ingreso');
  });
});

describe('assertCategoryEditable / assertCategoryDeletable (RF-005)', () => {
  it('permite editar y eliminar categorías personalizadas propias', () => {
    expect(() => assertCategoryEditable(baseCategory, 'user-1')).not.toThrow();
    expect(() => assertCategoryDeletable(baseCategory, 'user-1')).not.toThrow();
  });

  it('bloquea editar/eliminar categorías por defecto del sistema (PROTECTED)', () => {
    const defaultCategory = { ...baseCategory, isDefault: 1 as const };
    expect(() => assertCategoryEditable(defaultCategory, 'user-1')).toThrowError(
      expect.objectContaining({ code: 'PROTECTED' }),
    );
    expect(() => assertCategoryDeletable(defaultCategory, 'user-1')).toThrowError(
      expect.objectContaining({ code: 'PROTECTED' }),
    );
  });

  it('lanza NOT_FOUND para categorías ajenas o eliminadas', () => {
    expect(() => assertCategoryEditable(baseCategory, 'user-2')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    const deleted = { ...baseCategory, deletedAt: '2026-01-02T00:00:00.000Z' };
    expect(() => assertCategoryDeletable(deleted, 'user-1')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});

describe('CategoryError / categoryInUseError', () => {
  it('incluye el conteo de movimientos asociados y singular/plural correctos', () => {
    const one = categoryInUseError(1);
    const many = categoryInUseError(5);
    expect(one.code).toBe('IN_USE');
    expect(one.count).toBe(1);
    expect(one.message).toContain('1 movimiento asociado');
    expect(many.message).toContain('5 movimientos asociados');
  });
});
