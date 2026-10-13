/**
 * Pruebas de integración de la inicialización y la semilla de categorías
 * (RF-005): idempotencia, ausencia de duplicados y respeto de datos del usuario.
 */
import { sqliteDb, db, categories, Category } from '@/core/db';
import { initDatabase, DEFAULT_CATEGORIES } from '@/core/db/init';
import { DEV_USER_ID } from '@/core/dev/constants';
import { resetDatabase, countRows } from '../../../../test/helpers/test-db';
import { categoriesRepository } from '../../../features/categories/data/categories.repository';
import { CategoryError } from '../../../features/categories/domain/errors';

const expenseDefaults = DEFAULT_CATEGORIES.filter((c) => c.type === 'expense');
const incomeDefaults = DEFAULT_CATEGORIES.filter((c) => c.type === 'income');

function allDevCategories(): Category[] {
  return db.select().from(categories).all().filter((c) => c.userId === DEV_USER_ID);
}

describe('initDatabase (DDL + semilla de categorías)', () => {
  beforeEach(() => {
    resetDatabase({ seed: false });
    // Silencia el console.info de la semilla para una salida limpia.
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('crea el catálogo completo de categorías por defecto (10 gastos + 6 ingresos)', () => {
    initDatabase();

    const seeded = allDevCategories();
    expect(seeded).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(seeded.filter((c) => c.type === 'expense')).toHaveLength(expenseDefaults.length);
    expect(seeded.filter((c) => c.type === 'income')).toHaveLength(incomeDefaults.length);
    expect(seeded.every((c) => c.isDefault === 1)).toBe(true);

    // Nombres oficiales preservados del catálogo original del proyecto.
    const names = seeded.map((c) => c.name);
    expect(names).toContain('Alimentación');
    expect(names).toContain('Diversión');
    expect(names).toContain('Sueldo');
    expect(names).toContain('Vivienda');
    expect(names).toContain('Trabajo independiente');
  });

  it('es idempotente: re-ejecutarla 3 veces no duplica categorías', () => {
    initDatabase();
    initDatabase();
    initDatabase();
    initDatabase();

    expect(countRows('categories')).toBe(DEFAULT_CATEGORIES.length);
    const names = allDevCategories().map((c) => `${c.type}::${c.name}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('crea el perfil DEV una sola vez (re-ejecutable)', () => {
    initDatabase();
    initDatabase();

    const profiles = sqliteDb.getAllSync<{ id: string }>('SELECT id FROM profile');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(DEV_USER_ID);
  });

  it('no duplica ni pisa categorías personalizadas del usuario al re-ejecutar la semilla', () => {
    initDatabase();
    const custom = categoriesRepository.create(DEV_USER_ID, {
      name: 'Mascotas',
      type: 'expense',
      icon: 'PawPrint',
      color: '#8B5CF6',
    });

    initDatabase();
    initDatabase();

    const active = categoriesRepository.getByUser(DEV_USER_ID);
    expect(active).toHaveLength(DEFAULT_CATEGORIES.length + 1);
    const mascotas = active.find((c) => c.name === 'Mascotas');
    expect(mascotas).toBeDefined();
    expect(mascotas?.id).toBe(custom.id);
    expect(mascotas?.isDefault).toBe(0);
  });

  it('respeta una categoría renombrada por el usuario que coincida con un nombre por defecto', () => {
    initDatabase();
    const custom = categoriesRepository.create(DEV_USER_ID, {
      name: 'Mercado semanal',
      type: 'expense',
      icon: 'ShoppingCart',
      color: '#0EA5E9',
    });
    categoriesRepository.update(DEV_USER_ID, custom.id, {
      name: 'Mercado semanal',
      type: 'expense',
      icon: 'ShoppingCart',
      color: '#0EA5E9',
    });

    initDatabase();

    const active = categoriesRepository.getByUser(DEV_USER_ID);
    expect(active.filter((c) => c.name === 'Mercado semanal')).toHaveLength(1);
  });

  it('restaura una categoría por defecto eliminada directamente (catálogo protegido)', () => {
    initDatabase();
    const vivienda = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .find((c) => c.name === 'Vivienda')!;

    // Soft delete directo (simula una manipulación externa; la UI no permite borrar defaults).
    sqliteDb.runSync('UPDATE categories SET deleted_at = ? WHERE id = ?', [
      new Date().toISOString(),
      vivienda.id,
    ]);
    expect(categoriesRepository.getByUser(DEV_USER_ID, 'expense').map((c) => c.name)).not.toContain(
      'Vivienda',
    );

    initDatabase();

    const restored = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .filter((c) => c.name === 'Vivienda');
    expect(restored).toHaveLength(1);
    expect(restored[0].isDefault).toBe(1);
  });

  it('el índice único parcial impide nombres duplicados por usuario y tipo a nivel SQL', () => {
    initDatabase();
    const transporte = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .find((c) => c.name === 'Transporte')!;

    // Mismo nombre con distinta caja/espacios vía SQL directo (bypasea el
    // repositorio). Se usa 'TRANSPORTE' (solo ASCII) porque `lower()` de
    // SQLite convierte únicamente caracteres ASCII: las mayúsculas acentuadas
    // (p. ej. 'Ó') no se normalizan a nivel SQL, y esa capa de protección
    // Unicode queda cubierta por el repositorio (normalizeCategoryName usa
    // toLowerCase() de JavaScript, que sí es Unicode-aware).
    expect(() =>
      sqliteDb.runSync(
        `INSERT INTO categories (id, user_id, name, type, icon, color, is_default, sort_order, created_at, client_updated_at)
         VALUES ('x-dup', ?, '  TRANSPORTE ', 'expense', 'Bus', '#3B82F6', 0, 99, ?, ?)`,
        [DEV_USER_ID, new Date().toISOString(), new Date().toISOString()],
      ),
    ).toThrowError(/UNIQUE constraint failed/);

    // La original sigue intacta.
    expect(categoriesRepository.getById(DEV_USER_ID, transporte.id)?.name).toBe('Transporte');

    // Y el repositorio rechaza además la variante acentuada que el índice
    // SQL no detecta (diferencia de caja en 'Ó').
    expect(() =>
      categoriesRepository.create(DEV_USER_ID, {
        name: 'ALIMENTACIÓN',
        type: 'expense',
        icon: 'Utensils',
        color: '#F97316',
      }),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_NAME' }));
  });

  it('rechaza tipos inválidos a nivel SQL (CHECK type IN income/expense)', () => {
    initDatabase();
    expect(() =>
      sqliteDb.runSync(
        `INSERT INTO categories (id, user_id, name, type, icon, color, is_default, sort_order, created_at, client_updated_at)
         VALUES ('x-badtype', ?, 'Rara', 'otro', 'Tag', '#000000', 0, 99, ?, ?)`,
        [DEV_USER_ID, new Date().toISOString(), new Date().toISOString()],
      ),
    ).toThrowError(/CHECK constraint failed/);
  });
});

describe('CategoryError en la inicialización', () => {
  it('no lanza errores de dominio al sembrar sobre una BD ya poblada', () => {
    resetDatabase();
    expect(() => initDatabase()).not.toThrow();
    expect(() => initDatabase()).not.toThrow(CategoryError);
  });
});
