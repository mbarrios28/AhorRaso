/**
 * Pruebas de integración de la validación de categorías en movimientos
 * (RF-004) y del cambio de categoría de un movimiento existente.
 */
import { db, categories, transactions, Transaction } from '@/core/db';
import { eq } from 'drizzle-orm';
import { DEV_USER_ID } from '@/core/dev/constants';
import {
  resetDatabase,
  getOutboxEntries,
  countRows,
  OTHER_USER_ID,
} from '../../../../../test/helpers/test-db';
import { categoriesRepository } from '../../../categories/data/categories.repository';
import { CategoryError } from '../../../categories/domain/errors';
import { transactionsRepository } from '../transactions.repository';

function expenseCategory(name: string): string {
  return categoriesRepository.create(DEV_USER_ID, {
    name,
    type: 'expense',
    icon: 'Tag',
    color: '#64748B',
  }).id;
}

function incomeCategory(name: string): string {
  return categoriesRepository.create(DEV_USER_ID, {
    name,
    type: 'income',
    icon: 'Coins',
    color: '#10B981',
  }).id;
}

function createExpense(categoryId: string, amountCents = 2500): Transaction {
  return transactionsRepository.createExpense(DEV_USER_ID, {
    amountCents,
    occurredOn: '2026-10-01',
    categoryId,
    paymentMethod: 'cash',
    entryMethod: 'manual',
  });
}

beforeEach(() => {
  resetDatabase();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createExpense: validación de categoría (RF-004)', () => {
  it('acepta una categoría de gasto válida y persiste la relación lógica', () => {
    const categoryId = expenseCategory('Mascotas');

    const tx = createExpense(categoryId);

    expect(tx.categoryId).toBe(categoryId);
    const persisted = transactionsRepository.getById(DEV_USER_ID, tx.id);
    expect(persisted?.categoryId).toBe(categoryId);

    // Outbox con la referencia a la categoría en payload Postgres.
    const entries = getOutboxEntries('transactions', 'upsert');
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].payload).category_id).toBe(categoryId);
  });

  it('rechaza una categoría de ingreso en un gasto (TYPE_MISMATCH) sin escribir nada', () => {
    const incomeCat = incomeCategory('Propina extra');

    const before = { tx: countRows('transactions'), merchants: countRows('merchants') };

    let thrown: CategoryError | null = null;
    try {
      createExpense(incomeCat);
    } catch (error) {
      thrown = error as CategoryError;
    }

    expect(thrown?.code).toBe('TYPE_MISMATCH');
    expect(thrown?.message).toContain('ingreso');
    expect(countRows('transactions')).toBe(before.tx);
    expect(countRows('merchants')).toBe(before.merchants);
    expect(getOutboxEntries('transactions')).toHaveLength(0);
  });

  it('rechaza una categoría inexistente (NOT_FOUND)', () => {
    expect(() => createExpense('cat-inexistente')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(countRows('transactions')).toBe(0);
  });

  it('rechaza una categoría de otro usuario sin filtrar su existencia (NOT_FOUND)', () => {
    const now = new Date().toISOString();
    db.insert(categories)
      .values({
        id: 'other-user-cat',
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
      })
      .run();

    expect(() => createExpense('other-user-cat')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(countRows('transactions')).toBe(0);
    expect(getOutboxEntries('transactions')).toHaveLength(0);
  });

  it('rechaza una categoría eliminada (soft delete) con NOT_FOUND', () => {
    const categoryId = expenseCategory('Temporal');
    categoriesRepository.delete(DEV_USER_ID, categoryId);
    expect(() => createExpense(categoryId)).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});

describe('updateCategory: cambiar categoría de un movimiento (RF-004)', () => {
  it('cambia la categoría, persiste y encola outbox con la nueva referencia', () => {
    const first = expenseCategory('Alimentación diaria');
    const second = expenseCategory('Restaurantes');
    const tx = createExpense(first);

    const updated = transactionsRepository.updateCategory(DEV_USER_ID, tx.id, second);

    expect(updated.categoryId).toBe(second);
    expect(transactionsRepository.getById(DEV_USER_ID, tx.id)?.categoryId).toBe(second);

    const entries = getOutboxEntries('transactions', 'upsert');
    expect(entries).toHaveLength(2); // creación + cambio de categoría
    const lastPayload = JSON.parse(entries[entries.length - 1].payload);
    expect(lastPayload.category_id).toBe(second);
    expect(lastPayload.id).toBe(tx.id);
  });

  it('rechaza cambiar a una categoría de tipo incompatible', () => {
    const expenseCat = expenseCategory('Gastos varios');
    const incomeCat = incomeCategory('Bonos');
    const tx = createExpense(expenseCat);

    let thrown: CategoryError | null = null;
    try {
      transactionsRepository.updateCategory(DEV_USER_ID, tx.id, incomeCat);
    } catch (error) {
      thrown = error as CategoryError;
    }

    expect(thrown?.code).toBe('TYPE_MISMATCH');
    expect(transactionsRepository.getById(DEV_USER_ID, tx.id)?.categoryId).toBe(expenseCat);
    expect(getOutboxEntries('transactions', 'upsert')).toHaveLength(1); // solo la creación
  });

  it('es idempotente si la categoría es la misma (no encola de nuevo)', () => {
    const categoryId = expenseCategory('Única');
    const tx = createExpense(categoryId);

    const result = transactionsRepository.updateCategory(DEV_USER_ID, tx.id, categoryId);

    // updateCategory devuelve la transacción existente (misma categoría):
    // es idempotente y no debe encolar de nuevo.
    expect(result).toStrictEqual(tx);
    expect(getOutboxEntries('transactions', 'upsert')).toHaveLength(1);
  });

  it('rechaza mover un movimiento inexistente o ajeno', () => {
    const categoryId = expenseCategory('Gastos');
    const tx = createExpense(categoryId);

    expect(() =>
      transactionsRepository.updateCategory(DEV_USER_ID, 'tx-inexistente', categoryId),
    ).toThrowError(/no existe/);

    expect(() =>
      transactionsRepository.updateCategory(OTHER_USER_ID, tx.id, categoryId),
    ).toThrowError(/no existe/);

    expect(transactionsRepository.getById(DEV_USER_ID, tx.id)?.categoryId).toBe(categoryId);
  });
});

describe('flujo integrado RF-004 + RF-005 (reasignación libera la categoría)', () => {
  it('restaurar IN_USE: al reasignar el movimiento, la categoría vuelve a ser eliminable', () => {
    const catA = expenseCategory('Categoría A');
    const catB = expenseCategory('Categoría B');
    const tx = createExpense(catA);

    // 1) Con el movimiento asociado, la eliminación está restringida.
    let thrown: CategoryError | null = null;
    try {
      categoriesRepository.delete(DEV_USER_ID, catA);
    } catch (error) {
      thrown = error as CategoryError;
    }
    expect(thrown?.code).toBe('IN_USE');
    expect(thrown?.count).toBe(1);
    expect(thrown?.message).toContain('1 movimiento asociado');

    // 2) Reasignar el movimiento a otra categoría compatible.
    transactionsRepository.updateCategory(DEV_USER_ID, tx.id, catB);

    // 3) Ahora la categoría original puede eliminarse (soft delete).
    expect(() => categoriesRepository.delete(DEV_USER_ID, catA)).not.toThrow();
    expect(categoriesRepository.getById(DEV_USER_ID, catA)).toBeNull();
    expect(transactionsRepository.getById(DEV_USER_ID, tx.id)?.categoryId).toBe(catB);
  });

  it('los movimientos soft-eliminados no restringen la eliminación de la categoría', () => {
    const categoryId = expenseCategory('Con historial borrado');
    const tx = createExpense(categoryId);

    db.update(transactions)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(transactions.id, tx.id))
      .run();

    expect(categoriesRepository.countActiveTransactions(categoryId)).toBe(0);
    expect(() => categoriesRepository.delete(DEV_USER_ID, categoryId)).not.toThrow();
  });
});
