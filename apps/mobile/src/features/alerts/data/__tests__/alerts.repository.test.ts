import { db, transactions, budgets, categories, Category } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import {
  resetDatabase,
  getOutboxEntries,
} from '../../../../../test/helpers/test-db';
import { alertsRepository } from '../alerts.repository';
import { budgetsRepository } from '@/features/budgets/data/budgets.repository';
import { categoriesRepository } from '@/features/categories/data/categories.repository';

beforeEach(() => {
  resetDatabase();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function getExpenseCategory(): Category {
  const cats = categoriesRepository.getByUser(DEV_USER_ID, 'expense');
  return cats[0];
}

describe('alertsRepository.getPreferences y savePreferences (RF-010)', () => {
  it('obtiene las preferencias por defecto del usuario', () => {
    const prefs = alertsRepository.getPreferences(DEV_USER_ID);
    expect(prefs.userId).toBe(DEV_USER_ID);
    expect(prefs.enabled).toBe(true);
    expect(prefs.thresholds).toEqual([50, 80, 100]);
    expect(prefs.channelInApp).toBe(true);
  });

  it('actualiza y persiste preferencias de alertas encolando outbox (Escenario c)', () => {
    const updated = alertsRepository.savePreferences(DEV_USER_ID, {
      enabled: true,
      thresholds: [80, 100],
      channelInApp: true,
      channelPush: true,
    });

    expect(updated.thresholds).toEqual([80, 100]);
    expect(updated.channelPush).toBe(true);

    const fetched = alertsRepository.getPreferences(DEV_USER_ID);
    expect(fetched.thresholds).toEqual([80, 100]);
    expect(fetched.channelPush).toBe(true);

    const outboxItems = getOutboxEntries('notification_prefs', 'upsert');
    expect(outboxItems.length).toBeGreaterThan(0);
  });
});

describe('alertsRepository.evaluateBudgetAlerts (RF-011 & RNF-010)', () => {
  it('dispara alertas cuando el gasto cruza los umbrales configurados (Escenario a)', () => {
    const cat = getExpenseCategory();

    // 1. Crear presupuesto de S/ 100.00 para Octubre
    const budget = budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 10000,
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    // 2. Registrar gasto de S/ 81.00 (81% consumido)
    const now = new Date().toISOString();
    db.insert(transactions)
      .values({
        id: 'tx-eval-1',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 8100,
        occurredOn: '2026-10-15',
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'digital',
        source: null,
        note: 'Supermercado',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    // 3. Evaluar alertas
    const result = alertsRepository.evaluateBudgetAlerts(DEV_USER_ID);

    expect(result.triggered).toBe(true);
    // 81% cruza el umbral de 50% y de 80%
    expect(result.alerts).toHaveLength(2);

    const threshold50Alert = result.alerts.find((a) => a.thresholdPercent === 50);
    const threshold80Alert = result.alerts.find((a) => a.thresholdPercent === 80);

    expect(threshold50Alert).toBeDefined();
    expect(threshold50Alert?.spentCents).toBe(8100);
    expect(threshold50Alert?.currentPercent).toBe(81);

    expect(threshold80Alert).toBeDefined();
    expect(threshold80Alert?.thresholdPercent).toBe(80);

    // Comprobar registro en historial de alertas (para outbox y anti-spam)
    const alertOutbox = getOutboxEntries('budget_alerts_history', 'upsert');
    expect(alertOutbox).toHaveLength(2);
  });

  it('control anti-spam: previene alertas repetidas para el mismo umbral en el mismo periodo (Escenario b - RNF-010)', () => {
    const cat = getExpenseCategory();

    // 1. Crear presupuesto de S/ 100.00
    budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 10000,
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    // 2. Primer gasto al 81%
    const now = new Date().toISOString();
    db.insert(transactions)
      .values({
        id: 'tx-spam-1',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 8100,
        occurredOn: '2026-10-15',
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'cash',
        source: null,
        note: 'Compra inicial',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    const firstEval = alertsRepository.evaluateBudgetAlerts(DEV_USER_ID);
    expect(firstEval.triggered).toBe(true);
    expect(firstEval.alerts.map((a) => a.thresholdPercent)).toEqual([50, 80]);

    // 3. Segundo gasto menor (S/ 5.00) que eleva el consumo a 86%
    db.insert(transactions)
      .values({
        id: 'tx-spam-2',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 500,
        occurredOn: '2026-10-16',
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'cash',
        source: null,
        note: 'Compra extra',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    // 4. Evaluar nuevamente: 50% y 80% NO deben volver a notificarse
    const secondEval = alertsRepository.evaluateBudgetAlerts(DEV_USER_ID);
    expect(secondEval.triggered).toBe(false);
    expect(secondEval.alerts).toHaveLength(0);

    // 5. Tercer gasto que supera el 100% (S/ 15.00 -> total S/ 101.00)
    db.insert(transactions)
      .values({
        id: 'tx-spam-3',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 1500,
        occurredOn: '2026-10-17',
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'cash',
        source: null,
        note: 'Sobregiro',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    // 6. Evaluar: ÚNICAMENTE debe dispararse el umbral de 100%
    const thirdEval = alertsRepository.evaluateBudgetAlerts(DEV_USER_ID);
    expect(thirdEval.triggered).toBe(true);
    expect(thirdEval.alerts).toHaveLength(1);
    expect(thirdEval.alerts[0].thresholdPercent).toBe(100);
    expect(thirdEval.alerts[0].currentPercent).toBe(101);
  });

  it('no dispara alertas si las notificaciones están desactivadas globalmente', () => {
    alertsRepository.savePreferences(DEV_USER_ID, {
      enabled: false,
      thresholds: [50, 80, 100],
      channelInApp: true,
      channelPush: false,
    });

    const cat = getExpenseCategory();
    budgetsRepository.create(DEV_USER_ID, {
      categoryId: cat.id,
      amountCents: 5000,
      periodType: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    const now = new Date().toISOString();
    db.insert(transactions)
      .values({
        id: 'tx-disabled-1',
        userId: DEV_USER_ID,
        type: 'expense',
        amountCents: 6000, // 120%
        occurredOn: '2026-10-10',
        categoryId: cat.id,
        merchantId: null,
        paymentMethod: 'cash',
        source: null,
        note: 'Gasto grande',
        entryMethod: 'manual',
        createdAt: now,
        clientUpdatedAt: now,
        updatedAt: null,
        deletedAt: null,
      })
      .run();

    const evalResult = alertsRepository.evaluateBudgetAlerts(DEV_USER_ID);
    expect(evalResult.triggered).toBe(false);
    expect(evalResult.alerts).toHaveLength(0);
  });
});
