import { DEV_USER_ID } from '@/core/dev/constants';
import {
  countRows,
  resetDatabase,
} from '../../../../../test/helpers/test-db';
import { categoriesRepository } from '@/features/categories/data/categories.repository';
import { transactionsRepository } from '@/features/transactions/data/transactions.repository';
import { savingsRepository } from '@/features/savings/data/savings.repository';
import { analyticsRepository } from '../analytics.repository';

describe('analytics.repository (RF-012 / RF-013 + Caché en ai_cache)', () => {
  beforeEach(() => {
    resetDatabase();
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retorna reporte vacío amigable (hasEnoughData=false) cuando no hay gastos registrados', () => {
    const refDate = new Date(2026, 9, 20); // Octubre 2026
    const report = analyticsRepository.getConsumptionReport(DEV_USER_ID, refDate);

    expect(report.userId).toBe(DEV_USER_ID);
    expect(report.hasEnoughData).toBe(false);
    expect(report.totalExpenseCents).toBe(0);
    expect(report.recommendations).toHaveLength(0);
    expect(report.fromCache).toBe(false);
  });

  it('analiza transacciones reales de SQLite, genera recomendaciones y utiliza la caché ai_cache', () => {
    const refDate = new Date(2026, 9, 20); // Octubre 2026
    const expenseCats = categoriesRepository.getByUser(DEV_USER_ID, 'expense');
    const foodCat = expenseCats.find((c) => c.name === 'Alimentación') ?? expenseCats[0];

    // Crear meta activa
    savingsRepository.create(DEV_USER_ID, {
      name: 'Fondo Laptop',
      targetAmountCents: 120000,
      currentAmountCents: 20000,
      periodicSavingsCents: 15000,
      frequency: 'monthly',
      targetDate: '2027-03-30',
    });

    // Registrar 3 gastos hormiga en Octubre 2026
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1200, // S/ 12.00
      occurredOn: '2026-10-10',
      categoryId: foodCat.id,
      merchantName: 'Tambo+',
      paymentMethod: 'digital',
    });
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1500, // S/ 15.00
      occurredOn: '2026-10-11',
      categoryId: foodCat.id,
      merchantName: 'Tambo+',
      paymentMethod: 'digital',
    });
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1000, // S/ 10.00
      occurredOn: '2026-10-12',
      categoryId: foodCat.id,
      merchantName: 'Tambo+',
      paymentMethod: 'cash',
    });

    // 1. Primera consulta: calcula y persiste en ai_cache
    const firstReport = analyticsRepository.getConsumptionReport(DEV_USER_ID, refDate);
    expect(firstReport.hasEnoughData).toBe(true);
    expect(firstReport.fromCache).toBe(false);
    expect(firstReport.totalExpenseCents).toBe(3700);
    expect(firstReport.antExpenses.detected).toBe(true);
    expect(firstReport.antExpenses.occurrenceCount).toBe(3);
    expect(firstReport.recommendations.length).toBeGreaterThan(0);
    expect(countRows('ai_cache')).toBe(1);

    // 2. Segunda consulta sin nuevos movimientos: sirve desde caché (fromCache = true)
    const cachedReport = analyticsRepository.getConsumptionReport(DEV_USER_ID, refDate);
    expect(cachedReport.fromCache).toBe(true);
    expect(cachedReport.totalExpenseCents).toBe(3700);

    // 3. Al registrar un nuevo gasto, el data_hash cambia e invalida automáticamente la caché
    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 5000, // S/ 50.00
      occurredOn: '2026-10-15',
      categoryId: foodCat.id,
      merchantName: 'Restaurante',
      paymentMethod: 'digital',
    });

    const updatedReport = analyticsRepository.getConsumptionReport(DEV_USER_ID, refDate);
    expect(updatedReport.fromCache).toBe(false);
    expect(updatedReport.totalExpenseCents).toBe(8700);
    expect(updatedReport.transactionCount).toBe(4);
  });
});
