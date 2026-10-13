/**
 * Pruebas de integración del repositorio de categorías (RF-004 / RF-005):
 * CRUD, validación de dominio, protección de defaults, política de
 * eliminación restringida (IN_USE) y encolamiento en outbox.
 */
import { db, categories, Category } from '@/core/db';
import { eq } from 'drizzle-orm';
import { DEV_USER_ID } from '@/core/dev/constants';
import {
  resetDatabase,
  getOutboxEntries,
  countRows,
  OTHER_USER_ID,
} from '../../../../../test/helpers/test-db';
import { categoriesRepository } from '../categories.repository';
import { CategoryError, CATEGORY_ERROR_MESSAGES } from '../../domain/errors';

function createCustom(input: {
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
}): Category {
  return categoriesRepository.create(DEV_USER_ID, {
    name: input.name,
    type: input.type,
    icon: input.icon ?? 'Tag',
    color: input.color ?? '#64748B',
  });
}

function seedCategoryForOtherUser(): Category {
  const now = new Date().toISOString();
  const other: Category = {
    id: 'other-cat-1',
    userId: OTHER_USER_ID,
    name: 'Ajena',
    type: 'expense',
    icon: 'Tag',
    color: '#111827',
    isDefault: 0,
    sortOrder: 1,
    createdAt: now,
    clientUpdatedAt: now,
    updatedAt: null,
    deletedAt: null,
  };
  db.insert(categories).values(other).run();
  return other;
}

beforeEach(() => {
  resetDatabase();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getByUser / getById', () => {
  it('lista solo categorías activas del usuario, ordenadas por sortOrder', () => {
    const custom = createCustom({ name: 'Mascotas', type: 'expense' });
    const all = categoriesRepository.getByUser(DEV_USER_ID);

    expect(all).toHaveLength(17);
    expect(all.map((c) => c.id)).toContain(custom.id);
    expect(all.map((c) => c.sortOrder)).toEqual(
      [...all.map((c) => c.sortOrder)].sort((a, b) => a - b),
    );

    // La personalizada queda al final del listado de su tipo.
    const expenses = categoriesRepository.getByUser(DEV_USER_ID, 'expense');
    expect(expenses[expenses.length - 1].id).toBe(custom.id);
  });

  it('filtra por tipo (income/expense)', () => {
    expect(categoriesRepository.getByUser(DEV_USER_ID, 'expense')).toHaveLength(10);
    expect(categoriesRepository.getByUser(DEV_USER_ID, 'income')).toHaveLength(6);
  });

  it('excluye las categorías soft-eliminadas', () => {
    const custom = createCustom({ name: 'Temporal', type: 'expense' });
    categoriesRepository.delete(DEV_USER_ID, custom.id);
    expect(categoriesRepository.getByUser(DEV_USER_ID).map((c) => c.id)).not.toContain(custom.id);
  });

  it('getById respeta el aislamiento por usuario y las eliminaciones', () => {
    const other = seedCategoryForOtherUser();
    expect(categoriesRepository.getById(OTHER_USER_ID, other.id)?.name).toBe('Ajena');
    expect(categoriesRepository.getById(DEV_USER_ID, other.id)).toBeNull();

    const custom = createCustom({ name: 'Viajes', type: 'income' });
    categoriesRepository.delete(DEV_USER_ID, custom.id);
    expect(categoriesRepository.getById(DEV_USER_ID, custom.id)).toBeNull();
  });
});

describe('create (RF-005)', () => {
  it('crea una categoría personalizada con is_default=0 y sortOrder incremental', () => {
    const created = createCustom({ name: 'Mascotas', type: 'expense' });

    expect(created.isDefault).toBe(0);
    expect(created.userId).toBe(DEV_USER_ID);
    expect(created.sortOrder).toBe(11); // después de las 10 por defecto de gastos
    expect(categoriesRepository.getById(DEV_USER_ID, created.id)).toMatchObject({
      name: 'Mascotas',
    });
  });

  it('encola la creación en outbox con payload Postgres snake_case', () => {
    const created = createCustom({ name: 'Mascotas', type: 'expense' });

    const entries = getOutboxEntries('categories', 'upsert');
    expect(entries).toHaveLength(1);
    const payload = JSON.parse(entries[0].payload);
    expect(payload.id).toBe(created.id);
    expect(payload.user_id).toBe(DEV_USER_ID);
    expect(payload.name).toBe('Mascotas');
    expect(payload.type).toBe('expense');
    expect(payload.is_default).toBe(false);
    expect(payload.deleted_at).toBeNull();
  });

  it('rechaza nombres duplicados en el mismo tipo sin importar caja o espacios', () => {
    createCustom({ name: 'Mascotas', type: 'expense' });

    expect(() => createCustom({ name: '  MASCOTAS ', type: 'expense' })).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }),
    );
    // Mismo nombre en otro tipo sí está permitido.
    expect(() => createCustom({ name: 'mascotas', type: 'income' })).not.toThrow();
  });

  it('valida los atributos con mensajes legibles (VALIDATION)', () => {
    let thrown: CategoryError | null = null;
    try {
      categoriesRepository.create(DEV_USER_ID, {
        name: '',
        type: 'expense',
        icon: 'Tag',
        color: '#111827',
      });
    } catch (error) {
      thrown = error as CategoryError;
    }
    expect(thrown?.code).toBe('VALIDATION');
    expect(thrown?.message).toMatch(/nombre/i);

    expect(() =>
      categoriesRepository.create(DEV_USER_ID, {
        name: 'Rara',
        type: 'expense',
        icon: 'Tag',
        color: 'no-es-color',
      }),
    ).toThrowError(CategoryError);
  });

  it('no escribe nada si la validación falla', () => {
    const before = countRows('categories');
    expect(() =>
      categoriesRepository.create(DEV_USER_ID, {
        name: '   ',
        type: 'income',
        icon: '',
        color: '#000000',
      }),
    ).toThrow();
    expect(countRows('categories')).toBe(before);
    expect(getOutboxEntries('categories')).toHaveLength(0);
  });
});

describe('update (RF-005)', () => {
  it('actualiza nombre, icono y color de una categoría personalizada y encola outbox', () => {
    const custom = createCustom({ name: 'Mascotas', type: 'expense' });

    const updated = categoriesRepository.update(DEV_USER_ID, custom.id, {
      name: 'Mascotas y veterinaria',
      type: 'expense',
      icon: 'HeartPulse',
      color: '#22C55E',
    });

    expect(updated.name).toBe('Mascotas y veterinaria');
    expect(updated.icon).toBe('HeartPulse');
    expect(updated.color).toBe('#22C55E');
    expect(categoriesRepository.getById(DEV_USER_ID, custom.id)?.name).toBe('Mascotas y veterinaria');

    // createCustom encoló el upsert de creación y update encola el de edición.
    const entries = getOutboxEntries('categories', 'upsert');
    expect(entries).toHaveLength(2);
    expect(JSON.parse(entries[entries.length - 1].payload).name).toBe('Mascotas y veterinaria');
  });

  it('bloquea la edición de categorías por defecto (PROTECTED)', () => {
    const alimentacion = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .find((c) => c.name === 'Alimentación')!;

    expect(() =>
      categoriesRepository.update(DEV_USER_ID, alimentacion.id, {
        name: 'Comida',
        type: 'expense',
        icon: 'Utensils',
        color: '#F97316',
      }),
    ).toThrowError(expect.objectContaining({ code: 'PROTECTED' }));

    // Nada cambió ni se encoló.
    expect(categoriesRepository.getById(DEV_USER_ID, alimentacion.id)?.name).toBe('Alimentación');
    expect(getOutboxEntries('categories')).toHaveLength(0);
  });

  it('rechaza renombrar a un nombre duplicado del mismo tipo', () => {
    createCustom({ name: 'Mascotas', type: 'expense' });
    const viajes = createCustom({ name: 'Viajes', type: 'expense' });

    expect(() =>
      categoriesRepository.update(DEV_USER_ID, viajes.id, {
        name: 'mascotas',
        type: 'expense',
        icon: 'Tag',
        color: '#64748B',
      }),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_NAME' }));
  });

  it('permite conservar el propio nombre al actualizar (no se auto-duplica)', () => {
    const viajes = createCustom({ name: 'Viajes', type: 'expense' });
    expect(() =>
      categoriesRepository.update(DEV_USER_ID, viajes.id, {
        name: 'Viajes',
        type: 'expense',
        icon: 'Plane',
        color: '#64748B',
      }),
    ).not.toThrow();
  });

  it('lanza NOT_FOUND para categorías inexistentes o ajenas', () => {
    const other = seedCategoryForOtherUser();

    expect(() =>
      categoriesRepository.update(DEV_USER_ID, 'no-existe', {
        name: 'X',
        type: 'expense',
        icon: 'Tag',
        color: '#000000',
      }),
    ).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));

    expect(() =>
      categoriesRepository.update(DEV_USER_ID, other.id, {
        name: 'Hackeada',
        type: 'expense',
        icon: 'Tag',
        color: '#000000',
      }),
    ).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('delete (política Alternativa A: restringir)', () => {
  it('elimina (soft delete) una categoría personalizada sin movimientos y encola outbox delete', () => {
    const custom = createCustom({ name: 'Mascotas', type: 'expense' });

    categoriesRepository.delete(DEV_USER_ID, custom.id);

    expect(categoriesRepository.getById(DEV_USER_ID, custom.id)).toBeNull();
    const row = db.select().from(categories).where(eq(categories.id, custom.id)).get();
    expect(row?.deletedAt).not.toBeNull();

    const entries = getOutboxEntries('categories', 'delete');
    expect(entries).toHaveLength(1);
    expect(entries[0].entityId).toBe(custom.id);
  });

  it('bloquea la eliminación de categorías por defecto (PROTECTED)', () => {
    const sueldo = categoriesRepository
      .getByUser(DEV_USER_ID, 'income')
      .find((c) => c.name === 'Sueldo')!;

    expect(() => categoriesRepository.delete(DEV_USER_ID, sueldo.id)).toThrowError(
      expect.objectContaining({ code: 'PROTECTED' }),
    );
    expect(categoriesRepository.getById(DEV_USER_ID, sueldo.id)).not.toBeNull();
  });

  it('lanza NOT_FOUND al intentar eliminar una categoría ajena', () => {
    const other = seedCategoryForOtherUser();
    expect(() => categoriesRepository.delete(DEV_USER_ID, other.id)).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('reutiliza el mensaje canónico de PROTECTED', () => {
    const alimentacion = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .find((c) => c.name === 'Alimentación')!;
    let thrown: CategoryError | null = null;
    try {
      categoriesRepository.delete(DEV_USER_ID, alimentacion.id);
    } catch (error) {
      thrown = error as CategoryError;
    }
    expect(thrown).not.toBeNull();
    expect(thrown?.message).toBe(CATEGORY_ERROR_MESSAGES.PROTECTED);
  });
});
