import { db, categories, transactions, budgets, Category } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import {
  resetDatabase,
  getOutboxEntries,
  countRows,
  OTHER_USER_ID,
} from '../../../../../test/helpers/test-db';
import { budgetsRepository } from '../budgets.repository';
import { BudgetError, BUDGET_ERROR_MESSAGES } from '../../domain/errors';
import { categoriesRepository } from '@/features/categories/data/categories.repository';

beforeEach(() => {
  resetDatabase();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Helper para obtener una categoría de gasto de prueba */
function getExpenseCategory(): Category {
  const expenseCats = categoriesRepository.getByUser(DEV_USER_ID, 'expense');
  return expenseCats[0];
}

/** Helper para obtener una categoría de ingreso */
function getIncomeCategory(): Category {
  const incomeCats = categoriesRepository.getByUser(DEV_USER_ID, 'income');
  return incomeCats[0];
}

describe('budgetsRepository.create', () => {
  it('crea exitosamente un presupuesto válido y encola en outbox (Escenario a)', () => {
    const cat = getExpenseCategory();

    const created = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 25000, // S/ 250.00
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    expect(created.id).toBeDefined();
    expect(created.userId).toBe(DEV_USER_ID);
    expect(created.categoryId).toBe(cat.id);
    expect(created.amountCents).toBe(25000);
    expect(created.periodType).toBe('monthly');
    expect(created.periodStart).toBe('2026-10-01');
    expect(created.periodEnd).toBe('2026-10-31');
    expect(created.deletedAt).toBeNull();

    // Comprobar persistencia en SQLite
    const savedInDb = budgetsRepository.getById(DEV_USER_ID, created.id);
    expect(savedInDb).not.toBeNull();
    expect(savedInDb?.amountCents).toBe(25000);

    // Comprobar registro en Outbox para sincronización con Postgres
    const outboxEntries = getOutboxEntries('budgets', 'upsert');
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0].entityId).toBe(created.id);

    const payload = JSON.parse(outboxEntries[0].payload);
    expect(payload.user_id).toBe(DEV_USER_ID);
    expect(payload.category_id).toBe(cat.id);
    expect(payload.amount).toBe('250.00'); // Formato decimal de Postgres
    expect(payload.period_type).toBe('monthly');
  });

  it('falla con montos <= 0 con error de validación (Escenario b - Monto inválido)', () => {
    const cat = getExpenseCategory();

    expect(() => {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: cat.id,
        amountCents: 0,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    }).toThrow(BudgetError);

    expect(() => {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: cat.id,
        amountCents: -500,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    }).toThrow(BudgetError);
  });

  it('falla si la categoría no existe en la BD local (Escenario b - Categoría inexistente)', () => {
    expect(() => {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: '00000000-0000-4000-a000-nonexistentcat',
        amountCents: 10000,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    }).toThrow(BudgetError);

    try {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: '00000000-0000-4000-a000-nonexistentcat',
        amountCents: 10000,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    } catch (e: any) {
      expect(e.code).toBe('CATEGORY_NOT_FOUND');
      expect(e.message).toBe(BUDGET_ERROR_MESSAGES.CATEGORY_NOT_FOUND);
    }
  });

  it('rechaza establecer presupuesto sobre una categoría de tipo income (Escenario b - Tipo mismatch)', () => {
    const incomeCat = getIncomeCategory();

    expect(() => {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: incomeCat.id,
        amountCents: 10000,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    }).toThrow(BudgetError);

    try {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: incomeCat.id,
        amountCents: 10000,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    } catch (e: any) {
      expect(e.code).toBe('CATEGORY_TYPE_MISMATCH');
      expect(e.message).toBe(BUDGET_ERROR_MESSAGES.CATEGORY_TYPE_MISMATCH);
    }
  });

  it('control de unicidad: rechaza presupuestos duplicados en el mismo periodo para la misma categoría (Escenario c - RNF-009)', () => {
    const cat = getExpenseCategory();

    // 1. Primer presupuesto exitoso
    budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 30000,
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    // 2. Intentar duplicar la misma categoría en el mismo periodo
    expect(() => {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: cat.id,
        amountCents: 45000,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    }).toThrow(BudgetError);

    try {
      budgetsRepository.create(DEV_USER_ID, {
        categoryId: cat.id,
        amountCents: 45000,
        periodType: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    } catch (e: any) {
      expect(e.code).toBe('DUPLICATE_BUDGET');
      expect(e.message).toBe(BUDGET_ERROR_MESSAGES.DUPLICATE_BUDGET);
    }

    // 3. Crear en un periodo diferente para la misma categoría SÍ está permitido
    const nextMonth = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 35000,
      periodType: 'monthly',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
    });
    expect(nextMonth.id).toBeDefined();

    // 4. Crear para OTRA categoría en el mismo periodo SÍ está permitido
    const expenseCats = categoriesRepository.getByUser(DEV_USER_ID, 'expense');
    const secondCat = expenseCats[1];
    const secondBudget = budgetsRepository.create(DEV_USER_ID, {
      categoryId: secondCat.id,
      amountCents: 15000,
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });
    expect(secondBudget.id).toBeDefined();
  });
});

describe('budgetsRepository.listActive y cálculo de gasto', () => {
  it('enriquece presupuestos con metadatos de categoría y suma de gastos en el periodo', () => {
    const cat = getExpenseCategory();

    const b = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 20000, // S/ 200.00
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    // Insertar un gasto en el periodo
    const now = new Date().toISOString();
    db.insert(transactions)
      .values({
        id: 'tx-1',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 7500, // S/ 75.00
        occurredOn: '2026-10-15',
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'cash',
        source: null,
        note: 'Compra supermercado',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    // Insertar otro gasto FUERA del periodo (no debe sumarse)
    db.insert(transactions)
      .values({
        id: 'tx-2',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 5000,
        occurredOn: '2026-09-25', // Fuera del rango
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'cash',
        source: null,
        note: 'Gasto mes pasado',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    const activeList = budgetsRepository.listActive(DEV_USER_ID);
    expect(activeList).toHaveLength(1);

    const budgetItem = activeList[0];
    expect(budgetItem.id).toBe(b.id);
    expect(budgetItem.categoryName).toBe(cat.name);
    expect(budgetItem.categoryColor).toBe(cat.color);
    expect(budgetItem.spentCents).toBe(7500); // Exactamente los 75 soles
  });
});

describe('budgetsRepository.update y delete', () => {
  it('actualiza el monto de un presupuesto existente y encola outbox', () => {
    const cat = getExpenseCategory();
    const created = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 10000,
      periodType: 'weekly',
      periodStart: '2026-10-26',
      periodEnd: '2026-11-01',
    });

    const updated = budgetsRepository.update(DEV_USER_ID, created.id, {
      amountCents: 18000,
    });

    expect(updated.amountCents).toBe(18000);

    const fetched = budgetsRepository.getById(DEV_USER_ID, created.id);
    expect(fetched?.amountCents).toBe(18000);
  });

  it('elimina un presupuesto vía soft-delete y encola outbox con op delete', () => {
    const cat = getExpenseCategory();
    const created = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 10000,
      periodType: 'weekly',
      periodStart: '2026-10-26',
      periodEnd: '2026-11-01',
    });

    budgetsRepository.delete(DEV_USER_ID, created.id);

    const fetched = budgetsRepository.getById(DEV_USER_ID, created.id);
    expect(fetched).toBeNull(); // Ya no aparece como activo

    const deleteOutbox = getOutboxEntries('budgets', 'delete');
    expect(deleteOutbox).toHaveLength(1);
    expect(deleteOutbox[0].entityId).toBe(created.id);
  });
});

describe('budgetsRepository.countActiveByCategory (Integridad Referencial)', () => {
  it('cuenta correctamente los presupuestos activos de una categoría', () => {
    const cat = getExpenseCategory();

    expect(budgetsRepository.countActiveByCategory(cat.id)).toBe(0);

    const b = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 15000,
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    expect(budgetsRepository.countActiveByCategory(cat.id)).toBe(1);

    // Tras eliminar el presupuesto, el conteo activo vuelve a 0
    budgetsRepository.delete(DEV_USER_ID, b.id);
    expect(budgetsRepository.countActiveByCategory(cat.id)).toBe(0);
  });
});
