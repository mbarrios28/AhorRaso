/**
 * Pruebas unitarias de registro de ingresos (RF-001) y validación de categorías
 * en movimientos de ingreso (RF-004) sobre SQLite en memoria y cola outbox.
 */
import { db, categories, profile, Transaction } from '@/core/db';
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

function incomeCategory(name: string): string {
  return categoriesRepository.create(DEV_USER_ID, {
    name,
    type: 'income',
    icon: 'Coins',
    color: '#10B981',
  }).id;
}

function expenseCategory(name: string): string {
  return categoriesRepository.create(DEV_USER_ID, {
    name,
    type: 'expense',
    icon: 'Tag',
    color: '#EF4444',
  }).id;
}

function createIncome(categoryId: string, amountCents = 15000, source = 'Sueldo UNSA'): Transaction {
  return transactionsRepository.createIncome(DEV_USER_ID, {
    amountCents,
    occurredOn: '2026-10-13',
    categoryId,
    source,
    note: 'Bono de fin de mes',
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

describe('createIncome: registro de ingresos en SQLite y Outbox (RF-001)', () => {
  it('persiste el ingreso en SQLite con los campos obligatorios y encola en outbox', () => {
    const catId = incomeCategory('Salario Empresa');
    const beforeTx = countRows('transactions');

    const tx = createIncome(catId, 25000, 'Salario UNSA');

    // 1. Verificación del objeto retornado
    expect(tx.id).toBeDefined();
    expect(tx.type).toBe('income');
    expect(tx.amountCents).toBe(25000);
    expect(tx.occurredOn).toBe('2026-10-13');
    expect(tx.categoryId).toBe(catId);
    expect(tx.source).toBe('Salario UNSA');
    expect(tx.note).toBe('Bono de fin de mes');
    expect(tx.paymentMethod).toBeNull();
    expect(tx.merchantId).toBeNull();

    // 2. Persistencia en SQLite local
    expect(countRows('transactions')).toBe(beforeTx + 1);
    const persisted = transactionsRepository.getById(DEV_USER_ID, tx.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.source).toBe('Salario UNSA');
    expect(persisted?.type).toBe('income');

    // 3. Encolado en outbox para PostgreSQL con montos decimales formateados
    const outboxItems = getOutboxEntries('transactions', 'upsert');
    expect(outboxItems).toHaveLength(1);
    const payload = JSON.parse(outboxItems[0].payload);
    expect(payload.id).toBe(tx.id);
    expect(payload.user_id).toBe(DEV_USER_ID);
    expect(payload.type).toBe('income');
    expect(payload.amount).toBe('250.00'); // centsToPostgresAmount(25000)
    expect(payload.category_id).toBe(catId);
    expect(payload.source).toBe('Salario UNSA');
    expect(payload.payment_method).toBeNull();
    expect(payload.merchant_id).toBeNull();
  });

  it('incrementa el saldo disponible del perfil en tiempo real (RF-001 / RNF-003)', () => {
    const catId = incomeCategory('Mesada Familiar');
    const userProfBefore = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
    const initialBalance = userProfBefore?.initialBalanceCents ?? 0;

    createIncome(catId, 5000, 'Apoyo familiar');

    const userProfAfter = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
    expect(userProfAfter?.initialBalanceCents).toBe(initialBalance + 5000);
  });

  it('rechaza montos inválidos menores o iguales a cero según el esquema Zod', () => {
    const catId = incomeCategory('Propinas Test');

    expect(() =>
      transactionsRepository.createIncome(DEV_USER_ID, {
        amountCents: 0,
        occurredOn: '2026-10-13',
        categoryId: catId,
        source: 'Propina',
      })
    ).toThrow();

    expect(() =>
      transactionsRepository.createIncome(DEV_USER_ID, {
        amountCents: -100,
        occurredOn: '2026-10-13',
        categoryId: catId,
        source: 'Propina',
      })
    ).toThrow();

    expect(countRows('transactions')).toBe(0);
    expect(getOutboxEntries('transactions')).toHaveLength(0);
  });

  it('rechaza fuentes de ingreso vacías o en blanco', () => {
    const catId = incomeCategory('Ingresos Varios Test');

    expect(() =>
      transactionsRepository.createIncome(DEV_USER_ID, {
        amountCents: 1000,
        occurredOn: '2026-10-13',
        categoryId: catId,
        source: '   ',
      })
    ).toThrow();

    expect(countRows('transactions')).toBe(0);
  });

  it('rechaza fechas con formato diferente a YYYY-MM-DD', () => {
    const catId = incomeCategory('Fechas Test');

    expect(() =>
      transactionsRepository.createIncome(DEV_USER_ID, {
        amountCents: 1000,
        occurredOn: '13-10-2026',
        categoryId: catId,
        source: 'Trabajo',
      })
    ).toThrow();

    expect(countRows('transactions')).toBe(0);
  });
});

describe('createIncome: validación de categorías (RF-004)', () => {
  it('rechaza una categoría de gasto en un ingreso con TYPE_MISMATCH sin escribir nada', () => {
    const expenseCat = expenseCategory('Comida');

    let thrown: CategoryError | null = null;
    try {
      createIncome(expenseCat);
    } catch (error) {
      thrown = error as CategoryError;
    }

    expect(thrown?.code).toBe('TYPE_MISMATCH');
    expect(thrown?.message).toContain('gasto');
    expect(countRows('transactions')).toBe(0);
    expect(getOutboxEntries('transactions')).toHaveLength(0);
  });

  it('rechaza una categoría inexistente con NOT_FOUND', () => {
    expect(() => createIncome('cat-no-existe')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
    expect(countRows('transactions')).toBe(0);
    expect(getOutboxEntries('transactions')).toHaveLength(0);
  });

  it('rechaza una categoría de otro usuario (RNF-005) con NOT_FOUND', () => {
    const now = new Date().toISOString();
    db.insert(categories)
      .values({
        id: 'foreign-income-cat',
        userId: OTHER_USER_ID,
        name: 'Ingreso Ajeno',
        type: 'income',
        icon: 'Coins',
        color: '#10B981',
        isDefault: 0,
        sortOrder: 1,
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    expect(() => createIncome('foreign-income-cat')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
    expect(countRows('transactions')).toBe(0);
    expect(getOutboxEntries('transactions')).toHaveLength(0);
  });

  it('rechaza una categoría de ingreso soft-deleted con NOT_FOUND', () => {
    const catId = incomeCategory('Temporal');
    categoriesRepository.delete(DEV_USER_ID, catId);

    expect(() => createIncome(catId)).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
    expect(countRows('transactions')).toBe(0);
  });
});

describe('getRecentIncomes: consulta de ingresos recientes', () => {
  it('solo retorna transacciones activas de tipo ingreso ordenadas por fecha', () => {
    const catIncome = incomeCategory('Honorarios');
    const catExpense = expenseCategory('Transporte Especial');

    // Crear 1 ingreso ayer, 1 ingreso hoy, 1 gasto
    transactionsRepository.createIncome(DEV_USER_ID, {
      amountCents: 5000,
      occurredOn: '2026-10-12',
      categoryId: catIncome,
      source: 'Freelance 1',
    });
    transactionsRepository.createIncome(DEV_USER_ID, {
      amountCents: 8000,
      occurredOn: '2026-10-13',
      categoryId: catIncome,
      source: 'Freelance 2',
    });
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 2000,
      occurredOn: '2026-10-13',
      categoryId: catExpense,
      paymentMethod: 'cash',
    });

    const recentIncomes = transactionsRepository.getRecentIncomes(DEV_USER_ID);

    expect(recentIncomes).toHaveLength(2);
    expect(recentIncomes.every((tx) => tx.type === 'income')).toBe(true);
    expect(recentIncomes[0].amountCents).toBe(8000); // 2026-10-13 primero
    expect(recentIncomes[1].amountCents).toBe(5000); // 2026-10-12 después
  });
});
