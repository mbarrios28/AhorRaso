/// <reference types="jest" />
/**
 * Pruebas unitarias e integración local para el Dashboard Financiero (RF-008 / HU-04 / RNF-003).
 */
import { resetDatabase, OTHER_USER_ID } from '../../../../../test/helpers/test-db';
import { DEV_USER_ID } from '@/core/dev/constants';
import { db, profile } from '@/core/db';
import { eq } from 'drizzle-orm';
import { categoriesRepository } from '@/features/categories/data/categories.repository';
import { transactionsRepository } from '@/features/transactions/data/transactions.repository';
import { dashboardRepository } from '../dashboard.repository';

describe('dashboardRepository (RF-008)', () => {
  let alimentacionCatId: string;
  let transporteCatId: string;
  let sueldoCatId: string;

  beforeEach(() => {
    resetDatabase();
    jest.spyOn(console, 'info').mockImplementation(() => {});

    // Establecer saldo inicial del perfil en 0 para pruebas de balance aisladas
    db.update(profile)
      .set({ initialBalanceCents: 0 })
      .where(eq(profile.id, DEV_USER_ID))
      .run();

    // Obtener IDs de categorías pre-sembradas usando getByUser
    const userCats = categoriesRepository.getByUser(DEV_USER_ID);
    const alim = userCats.find((c) => c.name === 'Alimentación');
    const trans = userCats.find((c) => c.name === 'Transporte');
    const sueldo = userCats.find((c) => c.name === 'Sueldo');

    alimentacionCatId = alim ? alim.id : categoriesRepository.create(DEV_USER_ID, {
      name: 'Alimentación',
      type: 'expense',
      icon: 'Utensils',
      color: '#F97316',
    }).id;

    transporteCatId = trans ? trans.id : categoriesRepository.create(DEV_USER_ID, {
      name: 'Transporte',
      type: 'expense',
      icon: 'Bus',
      color: '#3B82F6',
    }).id;

    sueldoCatId = sueldo ? sueldo.id : categoriesRepository.create(DEV_USER_ID, {
      name: 'Sueldo',
      type: 'income',
      icon: 'Wallet',
      color: '#10B981',
    }).id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calcula correctamente el saldo y los totales de ingresos y gastos del mes actual', () => {
    // Corte de prueba: 15 de Octubre de 2026
    const refDate = new Date('2026-10-15T12:00:00Z');

    // Registrar ingreso en octubre
    transactionsRepository.createIncome(DEV_USER_ID, {
      amountCents: 50000, // S/ 500.00
      occurredOn: '2026-10-02',
      categoryId: sueldoCatId,
      source: 'Mesada UNSA',
      entryMethod: 'manual',
    });

    // Registrar 2 gastos en octubre
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 15000, // S/ 150.00
      occurredOn: '2026-10-05',
      categoryId: alimentacionCatId,
      paymentMethod: 'cash',
      entryMethod: 'manual',
    });

    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 5000, // S/ 50.00
      occurredOn: '2026-10-10',
      categoryId: transporteCatId,
      paymentMethod: 'digital',
      entryMethod: 'manual',
    });

    // Registrar un gasto fuera del mes (Septiembre) que NO debe sumarse al mes de octubre
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 8000, // S/ 80.00
      occurredOn: '2026-09-28',
      categoryId: alimentacionCatId,
      paymentMethod: 'cash',
      entryMethod: 'manual',
    });

    const summary = dashboardRepository.getDashboardSummary(DEV_USER_ID, refDate);

    // Saldo disponible total: 500 - 150 - 50 - 80 = S/ 220.00 (22000 céntimos)
    expect(summary.balanceCents).toBe(22000);
    expect(summary.formattedBalance).toBe('S/ 220.00');

    // Totales del mes en curso (solo octubre):
    expect(summary.monthlyIncomeCents).toBe(50000);
    expect(summary.formattedMonthlyIncome).toBe('S/ 500.00');

    expect(summary.monthlyExpenseCents).toBe(20000); // 150 + 50 = S/ 200.00
    expect(summary.formattedMonthlyExpense).toBe('S/ 200.00');
  });

  it('agrupa gastos por categoría y calcula porcentajes relativos en orden descendente', () => {
    const refDate = new Date('2026-10-18T10:00:00Z');

    // Gasto 1: Alimentación S/ 120.00 (60% de S/ 200.00)
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 12000,
      occurredOn: '2026-10-03',
      categoryId: alimentacionCatId,
      paymentMethod: 'cash',
      entryMethod: 'manual',
    });

    // Gasto 2: Transporte S/ 80.00 (40% de S/ 200.00)
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 8000,
      occurredOn: '2026-10-08',
      categoryId: transporteCatId,
      paymentMethod: 'digital',
      entryMethod: 'manual',
    });

    const summary = dashboardRepository.getDashboardSummary(DEV_USER_ID, refDate);

    expect(summary.categoryExpenses).toHaveLength(2);

    // Debe venir ordenado de mayor a menor
    const [first, second] = summary.categoryExpenses;

    expect(first.categoryName).toBe('Alimentación');
    expect(first.amountCents).toBe(12000);
    expect(first.percentage).toBe(60);

    expect(second.categoryName).toBe('Transporte');
    expect(second.amountCents).toBe(8000);
    expect(second.percentage).toBe(40);
  });

  it('calcula la proyección de fin de mes y el gasto diario seguro correctamente', () => {
    // 18 de Octubre: en un mes de 31 días quedan 31 - 18 + 1 = 14 días
    const refDate = new Date('2026-10-18T12:00:00Z');

    // Ingresamos S/ 280.00 para que el saldo sea S/ 280.00 (28000 céntimos)
    transactionsRepository.createIncome(DEV_USER_ID, {
      amountCents: 28000,
      occurredOn: '2026-10-01',
      categoryId: sueldoCatId,
      source: 'Ingreso inicial',
      entryMethod: 'manual',
    });

    const summary = dashboardRepository.getDashboardSummary(DEV_USER_ID, refDate);

    // 14 días restantes
    expect(summary.projection.daysRemaining).toBe(14);

    // Diario seguro: S/ 280.00 / 14 días = S/ 20.00 al día (2000 céntimos)
    expect(summary.projection.safeDailyCents).toBe(2000);
    expect(summary.projection.formattedSafeDaily).toBe('S/ 20.00');

    // Porcentaje de ciclo consumido: (18 - 1) / 31 = 54.8% -> 55%
    expect(summary.projection.cycleElapsedPercentage).toBe(55);
  });

  it('maneja adecuadamente el caso de usuario sin movimientos en el mes', () => {
    const refDate = new Date('2026-10-01T08:00:00Z');

    const summary = dashboardRepository.getDashboardSummary(DEV_USER_ID, refDate);

    expect(summary.monthlyIncomeCents).toBe(0);
    expect(summary.monthlyExpenseCents).toBe(0);
    expect(summary.categoryExpenses).toEqual([]);
    expect(summary.projection.safeDailyCents).toBe(0);
  });

  it('respeta el aislamiento estricto de usuario (RNF-005)', () => {
    const refDate = new Date('2026-10-10T12:00:00Z');

    // Gasto del usuario actual
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 3000,
      occurredOn: '2026-10-04',
      categoryId: alimentacionCatId,
      paymentMethod: 'cash',
      entryMethod: 'manual',
    });

    // Sembrar categoría y gasto para otro usuario (OTHER_USER_ID)
    const otherCat = categoriesRepository.create(OTHER_USER_ID, {
      name: 'Comida ajena',
      type: 'expense',
      icon: 'Utensils',
      color: '#F97316',
    });

    transactionsRepository.createExpense(OTHER_USER_ID, {
      amountCents: 99000, // S/ 990.00
      occurredOn: '2026-10-04',
      categoryId: otherCat.id,
      paymentMethod: 'cash',
      entryMethod: 'manual',
    });

    const summary = dashboardRepository.getDashboardSummary(DEV_USER_ID, refDate);

    // Solo debe sumar los S/ 30.00 del usuario logueado
    expect(summary.monthlyExpenseCents).toBe(3000);
    expect(summary.formattedMonthlyExpense).toBe('S/ 30.00');
    expect(summary.categoryExpenses).toHaveLength(1);
    expect(summary.categoryExpenses[0].amountCents).toBe(3000);
  });
});
