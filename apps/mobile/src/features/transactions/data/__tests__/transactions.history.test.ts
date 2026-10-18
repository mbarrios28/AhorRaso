/**
 * Pruebas de integración de la consulta del historial de movimientos
 * (RF-009 / HU-05): orden cronológico, filtros combinados, búsqueda por
 * establecimiento, totales y paginación keyset sobre SQLite en memoria.
 */
import { db, transactions, Transaction } from '@/core/db';
import { eq } from 'drizzle-orm';
import { DEV_USER_ID } from '@/core/dev/constants';
import { resetDatabase, countRows, OTHER_USER_ID } from '../../../../../test/helpers/test-db';
import { categoriesRepository } from '../../../categories/data/categories.repository';
import { HistoryQueryError } from '../../domain/errors';
import { transactionsRepository } from '../transactions.repository';

/** Reloj lógico: garantiza `created_at` crecientes y deterministas en los tests. */
let clock = 0;

function nextTimestamp(): string {
  clock += 1;
  return `2026-10-01T10:${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(
    clock % 60
  ).padStart(2, '0')}.000Z`;
}

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

interface SeedParams {
  occurredOn: string;
  amountCents: number;
  categoryId: string;
  merchantId?: string | null;
  note?: string | null;
  userId?: string;
}

/** Inserta un gasto con `created_at` controlado (para orden y paginación). */
function seedExpense(params: SeedParams): Transaction {
  const now = nextTimestamp();
  const tx: Transaction = {
    id: `tx-exp-${clock}`,
    userId: params.userId ?? DEV_USER_ID,
    type: 'expense',
    amountCents: params.amountCents,
    occurredOn: params.occurredOn,
    categoryId: params.categoryId,
    merchantId: params.merchantId ?? null,
    paymentMethod: 'cash',
    source: null,
    note: params.note ?? null,
    entryMethod: 'manual',
    createdAt: now,
    clientUpdatedAt: now,
    updatedAt: null,
    deletedAt: null,
  };
  db.insert(transactions).values(tx).run();
  return tx;
}

/** Inserta un ingreso con `created_at` controlado. */
function seedIncome(params: SeedParams & { source: string }): Transaction {
  const now = nextTimestamp();
  const tx: Transaction = {
    id: `tx-inc-${clock}`,
    userId: params.userId ?? DEV_USER_ID,
    type: 'income',
    amountCents: params.amountCents,
    occurredOn: params.occurredOn,
    categoryId: params.categoryId,
    merchantId: null,
    paymentMethod: null,
    source: params.source,
    note: params.note ?? null,
    entryMethod: 'manual',
    createdAt: now,
    clientUpdatedAt: now,
    updatedAt: null,
    deletedAt: null,
  };
  db.insert(transactions).values(tx).run();
  return tx;
}

beforeEach(() => {
  clock = 0;
  resetDatabase();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('searchHistory: listado cronológico (RF-009)', () => {
  it('ordena de más reciente a más antiguo por fecha de ocurrencia', () => {
    const cat = expenseCategory('Orden');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-05', amountCents: 2000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-03', amountCents: 3000, categoryId: cat });

    const page = transactionsRepository.searchHistory(DEV_USER_ID);

    expect(page.items.map((item) => item.occurredOn)).toEqual([
      '2026-10-05',
      '2026-10-03',
      '2026-10-01',
    ]);
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('desempata por created_at descendente cuando comparten fecha', () => {
    const cat = expenseCategory('Mismo día');

    const first = seedExpense({ occurredOn: '2026-10-02', amountCents: 1000, categoryId: cat });
    const second = seedExpense({ occurredOn: '2026-10-02', amountCents: 2000, categoryId: cat });
    const third = seedExpense({ occurredOn: '2026-10-02', amountCents: 3000, categoryId: cat });

    const page = transactionsRepository.searchHistory(DEV_USER_ID);

    expect(page.items.map((item) => item.id)).toEqual([third.id, second.id, first.id]);
  });

  it('soporta orden cronológico ascendente (más antiguo primero)', () => {
    const cat = expenseCategory('Ascendente');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-05', amountCents: 2000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-03', amountCents: 3000, categoryId: cat });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, { order: 'date_asc' });

    expect(page.items.map((item) => item.occurredOn)).toEqual([
      '2026-10-01',
      '2026-10-03',
      '2026-10-05',
    ]);
  });

  it('enriquece cada movimiento con su categoría y establecimiento', () => {
    const cat = expenseCategory('Enriquecida');
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1500,
      occurredOn: '2026-10-04',
      categoryId: cat,
      merchantName: 'Menú UNSA',
      paymentMethod: 'digital',
    });

    const page = transactionsRepository.searchHistory(DEV_USER_ID);

    expect(page.items).toHaveLength(1);
    expect(page.items[0].category?.name).toBe('Enriquecida');
    expect(page.items[0].merchant?.name).toBe('Menú UNSA');
  });
});

describe('searchHistory: filtros dinámicos (RF-009 / HU-05)', () => {
  it('filtra por rango de fechas inclusivo en ambos extremos', () => {
    const cat = expenseCategory('Fechas');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-02', amountCents: 2000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-04', amountCents: 3000, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-09', amountCents: 4000, categoryId: cat });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, {
      from: '2026-10-02',
      to: '2026-10-04',
    });

    expect(page.items.map((item) => item.occurredOn)).toEqual(['2026-10-04', '2026-10-02']);
    expect(page.total).toBe(2);
    expect(page.totals.expenseCents).toBe(5000);
  });

  it('filtra por tipo de movimiento (ingreso o gasto)', () => {
    const catExpense = expenseCategory('Tipo gasto');
    const catIncome = incomeCategory('Tipo ingreso');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: catExpense });
    seedIncome({
      occurredOn: '2026-10-02',
      amountCents: 5000,
      categoryId: catIncome,
      source: 'Freelance',
    });

    const onlyIncome = transactionsRepository.searchHistory(DEV_USER_ID, { type: 'income' });
    expect(onlyIncome.items).toHaveLength(1);
    expect(onlyIncome.items[0].type).toBe('income');
    expect(onlyIncome.totals).toEqual({ incomeCents: 5000, expenseCents: 0, netCents: 5000 });

    const onlyExpense = transactionsRepository.searchHistory(DEV_USER_ID, { type: 'expense' });
    expect(onlyExpense.items).toHaveLength(1);
    expect(onlyExpense.items[0].type).toBe('expense');
  });

  it('filtra por categoría', () => {
    const catA = expenseCategory('Comida');
    const catB = expenseCategory('Transporte Urbano');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: catA });
    seedExpense({ occurredOn: '2026-10-02', amountCents: 2000, categoryId: catB });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, { categoryId: catB });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].categoryId).toBe(catB);
    expect(page.items[0].category?.name).toBe('Transporte Urbano');
  });

  it('filtra por un establecimiento específico (Escenario 1 de HU-05)', () => {
    const cat = expenseCategory('Establecimientos');

    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1500,
      occurredOn: '2026-10-01',
      categoryId: cat,
      merchantName: 'Menú UNSA',
      paymentMethod: 'cash',
    });
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 700,
      occurredOn: '2026-10-02',
      categoryId: cat,
      merchantName: 'Fotocopias Central',
      paymentMethod: 'cash',
    });

    const merchants = transactionsRepository.getMerchantOptions(DEV_USER_ID);
    expect(merchants.map((m) => m.name)).toEqual(['Fotocopias Central', 'Menú UNSA']);

    const target = merchants.find((m) => m.name === 'Menú UNSA');
    const page = transactionsRepository.searchHistory(DEV_USER_ID, { merchantId: target?.id });

    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].merchant?.name).toBe('Menú UNSA');
    expect(page.totals.expenseCents).toBe(1500);
  });

  it('filtra por nombre de establecimiento sin distinguir mayúsculas', () => {
    const cat = expenseCategory('Búsqueda comercio');

    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1500,
      occurredOn: '2026-10-01',
      categoryId: cat,
      merchantName: 'Menú UNSA',
      paymentMethod: 'cash',
    });
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 900,
      occurredOn: '2026-10-02',
      categoryId: cat,
      merchantName: 'Tambo+',
      paymentMethod: 'cash',
    });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, { merchantQuery: 'tambo' });

    expect(page.total).toBe(1);
    expect(page.items[0].merchant?.name).toBe('Tambo+');
  });

  it('busca texto libre en nota, fuente y establecimiento', () => {
    const catExpense = expenseCategory('Texto gasto');
    const catIncome = incomeCategory('Texto ingreso');

    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1200,
      occurredOn: '2026-10-01',
      categoryId: catExpense,
      merchantName: 'Fotocopias Central',
      paymentMethod: 'cash',
      note: 'Impresión de apuntes',
    });
    seedIncome({
      occurredOn: '2026-10-02',
      amountCents: 5000,
      categoryId: catIncome,
      source: 'Propina mensual',
      note: 'Apoyo de mamá',
    });

    const byMerchant = transactionsRepository.searchHistory(DEV_USER_ID, { search: 'fotocopias' });
    expect(byMerchant.total).toBe(1);
    expect(byMerchant.items[0].type).toBe('expense');

    const bySource = transactionsRepository.searchHistory(DEV_USER_ID, { search: 'propina' });
    expect(bySource.total).toBe(1);
    expect(bySource.items[0].type).toBe('income');

    const byNote = transactionsRepository.searchHistory(DEV_USER_ID, { search: 'apuntes' });
    expect(byNote.total).toBe(1);
    expect(byNote.items[0].type).toBe('expense');
  });

  it('filtra por rango de monto en céntimos', () => {
    const cat = expenseCategory('Montos');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 500, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-02', amountCents: 2500, categoryId: cat });
    seedExpense({ occurredOn: '2026-10-03', amountCents: 9000, categoryId: cat });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, {
      minAmountCents: 1000,
      maxAmountCents: 5000,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].amountCents).toBe(2500);
  });

  it('combina varios filtros a la vez (fecha + categoría + tipo)', () => {
    const catComida = expenseCategory('Combinada comida');
    const catTransporte = expenseCategory('Combinada transporte');
    const catIngreso = incomeCategory('Combinada ingreso');

    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: catComida });
    seedExpense({ occurredOn: '2026-10-05', amountCents: 2000, categoryId: catComida });
    seedExpense({ occurredOn: '2026-10-05', amountCents: 3000, categoryId: catTransporte });
    seedIncome({
      occurredOn: '2026-10-05',
      amountCents: 4000,
      categoryId: catIngreso,
      source: 'Extra',
    });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, {
      type: 'expense',
      categoryId: catComida,
      from: '2026-10-02',
      to: '2026-10-31',
    });

    expect(page.total).toBe(1);
    expect(page.items[0].amountCents).toBe(2000);
    expect(page.items[0].categoryId).toBe(catComida);
  });

  it('excluye movimientos soft-deleted y de otros usuarios (RNF-005)', () => {
    const cat = expenseCategory('Aislamiento');

    const active = seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: cat });
    const deleted = seedExpense({ occurredOn: '2026-10-02', amountCents: 2000, categoryId: cat });
    seedExpense({
      occurredOn: '2026-10-03',
      amountCents: 3000,
      categoryId: cat,
      userId: OTHER_USER_ID,
    });

    db.update(transactions)
      .set({ deletedAt: '2026-10-03T00:00:00.000Z' })
      .where(eq(transactions.id, deleted.id))
      .run();

    const page = transactionsRepository.searchHistory(DEV_USER_ID);

    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.id)).toEqual([active.id]);
  });

  it('devuelve una página vacía con totales en cero cuando no hay coincidencias', () => {
    const cat = expenseCategory('Sin resultados');
    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: cat });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, { search: 'inexistente' });

    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.totals).toEqual({ incomeCents: 0, expenseCents: 0, netCents: 0 });
  });

  it('calcula los totales sobre todo el conjunto filtrado, no solo la página', () => {
    const catExpense = expenseCategory('Totales gasto');
    const catIncome = incomeCategory('Totales ingreso');

    for (let i = 1; i <= 5; i += 1) {
      const day = String(i).padStart(2, '0');
      seedExpense({ occurredOn: `2026-10-${day}`, amountCents: 1000, categoryId: catExpense });
    }
    seedIncome({
      occurredOn: '2026-10-06',
      amountCents: 7000,
      categoryId: catIncome,
      source: 'Sueldo',
    });

    const page = transactionsRepository.searchHistory(DEV_USER_ID, {}, { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(6);
    expect(page.totals).toEqual({ incomeCents: 7000, expenseCents: 5000, netCents: 2000 });
  });
});

describe('searchHistory: paginación keyset (RF-009)', () => {
  it('recorre el historial en páginas sin duplicados ni saltos', () => {
    const cat = expenseCategory('Paginada');

    for (let i = 1; i <= 5; i += 1) {
      const day = String(i).padStart(2, '0');
      seedExpense({ occurredOn: `2026-10-${day}`, amountCents: i * 100, categoryId: cat });
    }

    const first = transactionsRepository.searchHistory(DEV_USER_ID, {}, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    expect(first.total).toBe(5);

    const second = transactionsRepository.searchHistory(
      DEV_USER_ID,
      {},
      { limit: 2, cursor: first.nextCursor }
    );
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(true);

    const third = transactionsRepository.searchHistory(
      DEV_USER_ID,
      {},
      { limit: 2, cursor: second.nextCursor }
    );
    expect(third.items).toHaveLength(1);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([
      'tx-exp-5',
      'tx-exp-4',
      'tx-exp-3',
      'tx-exp-2',
      'tx-exp-1',
    ]);
  });

  it('pagina correctamente en orden ascendente', () => {
    const cat = expenseCategory('Paginada asc');

    for (let i = 1; i <= 3; i += 1) {
      const day = String(i).padStart(2, '0');
      seedExpense({ occurredOn: `2026-10-${day}`, amountCents: i * 100, categoryId: cat });
    }

    const first = transactionsRepository.searchHistory(
      DEV_USER_ID,
      { order: 'date_asc' },
      { limit: 2 }
    );
    const second = transactionsRepository.searchHistory(
      DEV_USER_ID,
      { order: 'date_asc' },
      { limit: 2, cursor: first.nextCursor }
    );

    expect([...first.items, ...second.items].map((item) => item.occurredOn)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('mantiene la paginación estable cuando se insertan movimientos nuevos', () => {
    const cat = expenseCategory('Estable');

    for (let i = 1; i <= 4; i += 1) {
      const day = String(i).padStart(2, '0');
      seedExpense({ occurredOn: `2026-10-${day}`, amountCents: i * 100, categoryId: cat });
    }

    const first = transactionsRepository.searchHistory(DEV_USER_ID, {}, { limit: 2 });

    // Un movimiento nuevo (más reciente) no debe desplazar la página siguiente.
    seedExpense({ occurredOn: '2026-10-10', amountCents: 999, categoryId: cat });

    const second = transactionsRepository.searchHistory(
      DEV_USER_ID,
      {},
      { limit: 2, cursor: first.nextCursor }
    );

    expect(second.items.map((item) => item.occurredOn)).toEqual(['2026-10-02', '2026-10-01']);
  });
});

describe('searchHistory: validación de parámetros (RF-009)', () => {
  it('rechaza un rango de fechas invertido', () => {
    expect(() =>
      transactionsRepository.searchHistory(DEV_USER_ID, { from: '2026-10-10', to: '2026-10-01' })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
  });

  it('rechaza fechas con formato inválido', () => {
    expect(() =>
      transactionsRepository.searchHistory(DEV_USER_ID, { from: '10/10/2026' })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
  });

  it('rechaza un rango de montos invertido', () => {
    expect(() =>
      transactionsRepository.searchHistory(DEV_USER_ID, {
        minAmountCents: 5000,
        maxAmountCents: 1000,
      })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
  });

  it('rechaza un cursor de paginación corrupto', () => {
    let thrown: HistoryQueryError | null = null;
    try {
      transactionsRepository.searchHistory(DEV_USER_ID, {}, { cursor: 'cursor-invalido' });
    } catch (error) {
      thrown = error as HistoryQueryError;
    }

    expect(thrown?.code).toBe('INVALID_CURSOR');
    expect(thrown?.message).toContain('paginación');
  });

  it('no escribe nada en la base de datos al validar los filtros', () => {
    const cat = expenseCategory('Solo lectura');
    seedExpense({ occurredOn: '2026-10-01', amountCents: 1000, categoryId: cat });
    const before = countRows('transactions');

    try {
      transactionsRepository.searchHistory(DEV_USER_ID, { from: 'mal-formato' });
    } catch {
      // esperado
    }

    expect(countRows('transactions')).toBe(before);
  });
});
