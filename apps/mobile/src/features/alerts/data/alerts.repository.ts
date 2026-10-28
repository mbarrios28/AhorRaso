import * as Crypto from 'expo-crypto';
import { eq, and, desc, isNull } from 'drizzle-orm';
import {
  db,
  notificationPrefs,
  budgetAlertsHistory,
  budgets,
  categories,
  NotificationPrefs,
  BudgetAlertHistory,
  Category,
  enqueueOutbox,
  sqliteDb,
} from '@/core/db';
import {
  NotificationPreferences,
  UpdateNotificationPrefsInput,
  updateNotificationPrefsSchema,
  BudgetAlertTriggered,
  BudgetAlertEvaluationResult,
  parseThresholdsSafely,
  toAlertValidationError,
  DEFAULT_ALERT_THRESHOLDS,
} from '../domain/types';
import { AlertError, ALERT_ERROR_MESSAGES } from '../domain/errors';

/**
 * Convierte una fila de base de datos a modelo de dominio limpio.
 */
function toDomainPreferences(row: NotificationPrefs): NotificationPreferences {
  return {
    id: row.id,
    userId: row.userId,
    enabled: row.enabled === 1,
    thresholds: parseThresholdsSafely(row.thresholds),
    channelInApp: row.channelInApp === 1,
    channelPush: row.channelPush === 1,
    createdAt: row.createdAt,
    clientUpdatedAt: row.clientUpdatedAt,
  };
}

/**
 * Repositorio de Alertas y Notificaciones (RF-010 / RF-011 / RNF-010).
 * Maneja preferencias, evaluación reactiva contra umbrales de presupuesto y
 * control anti-spam mediante historial de alertas emitidas.
 */
export const alertsRepository = {
  /**
   * Obtiene las preferencias de notificación del usuario.
   * Si no existen, inicializa las preferencias por defecto de forma idempotente.
   */
  getPreferences(userId: string): NotificationPreferences {
    const existing = db
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, userId))
      .get();

    if (existing) {
      return toDomainPreferences(existing);
    }

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultThresholdsStr = JSON.stringify(DEFAULT_ALERT_THRESHOLDS);

    const newPrefsRow: NotificationPrefs = {
      id,
      userId,
      enabled: 1,
      thresholds: defaultThresholdsStr,
      channelInApp: 1,
      channelPush: 0,
      createdAt: now,
      clientUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    };

    db.transaction((tx) => {
      tx.insert(notificationPrefs).values(newPrefsRow).run();
      enqueueOutbox({
        entity: 'notification_prefs',
        entityId: id,
        op: 'upsert',
        payload: {
          id,
          user_id: userId,
          enabled: true,
          thresholds: DEFAULT_ALERT_THRESHOLDS,
          channel_in_app: true,
          channel_push: false,
          created_at: now,
          client_updated_at: now,
        },
      });
    });

    return toDomainPreferences(newPrefsRow);
  },

  /**
   * Actualiza las preferencias de alerta del usuario (RF-010).
   */
  savePreferences(
    userId: string,
    input: UpdateNotificationPrefsInput
  ): NotificationPreferences {
    let validated: UpdateNotificationPrefsInput;
    try {
      validated = updateNotificationPrefsSchema.parse(input);
    } catch (error) {
      throw toAlertValidationError(error);
    }

    const current = this.getPreferences(userId);
    const now = new Date().toISOString();
    const serializedThresholds = JSON.stringify(validated.thresholds);

    db.transaction((tx) => {
      tx.update(notificationPrefs)
        .set({
          enabled: validated.enabled ? 1 : 0,
          thresholds: serializedThresholds,
          channelInApp: validated.channelInApp ? 1 : 0,
          channelPush: validated.channelPush ? 1 : 0,
          clientUpdatedAt: now,
        })
        .where(eq(notificationPrefs.userId, userId))
        .run();

      enqueueOutbox({
        entity: 'notification_prefs',
        entityId: current.id,
        op: 'upsert',
        payload: {
          id: current.id,
          user_id: userId,
          enabled: validated.enabled,
          thresholds: validated.thresholds,
          channel_in_app: validated.channelInApp,
          channel_push: validated.channelPush,
          created_at: current.createdAt,
          client_updated_at: now,
        },
      });
    });

    return {
      ...current,
      enabled: validated.enabled,
      thresholds: validated.thresholds,
      channelInApp: validated.channelInApp,
      channelPush: validated.channelPush,
      clientUpdatedAt: now,
    };
  },

  /**
   * Verifica si ya fue emitida una alerta para un presupuesto y umbral específico
   * dentro del periodo activo (Regla Anti-Spam RNF-010).
   */
  hasAlertBeenSent(
    userId: string,
    budgetId: string,
    periodStart: string,
    thresholdPercent: number
  ): boolean {
    const existing = db
      .select({ id: budgetAlertsHistory.id })
      .from(budgetAlertsHistory)
      .where(
        and(
          eq(budgetAlertsHistory.userId, userId),
          eq(budgetAlertsHistory.budgetId, budgetId),
          eq(budgetAlertsHistory.periodStart, periodStart),
          eq(budgetAlertsHistory.thresholdPercent, thresholdPercent)
        )
      )
      .get();

    return !!existing;
  },

  /**
   * Registra una alerta en el historial local y outbox.
   */
  recordAlertSent(
    userId: string,
    alert: Omit<BudgetAlertTriggered, 'id'>
  ): BudgetAlertHistory {
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    const record: BudgetAlertHistory = {
      id,
      userId,
      budgetId: alert.budgetId,
      categoryId: alert.categoryId,
      thresholdPercent: alert.thresholdPercent,
      periodStart: alert.periodStart,
      periodEnd: alert.periodEnd,
      spentCents: alert.spentCents,
      budgetAmountCents: alert.budgetAmountCents,
      createdAt: now,
    };

    try {
      db.transaction((tx) => {
        tx.insert(budgetAlertsHistory).values(record).run();
        enqueueOutbox({
          entity: 'budget_alerts_history',
          entityId: id,
          op: 'upsert',
          payload: {
            id,
            user_id: userId,
            budget_id: alert.budgetId,
            category_id: alert.categoryId,
            threshold_percent: alert.thresholdPercent,
            period_start: alert.periodStart,
            period_end: alert.periodEnd,
            spent_cents: alert.spentCents,
            budget_amount_cents: alert.budgetAmountCents,
            created_at: now,
          },
        });
      });
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE') || error?.message?.includes('idx_budget_alerts_history_unique')) {
        throw new AlertError('DUPLICATE_ALERT', ALERT_ERROR_MESSAGES.DUPLICATE_ALERT);
      }
      throw error;
    }

    return record;
  },

  /**
   * Evalúa de forma reactiva si el gasto acumulado en los presupuestos activos
   * ha cruzado algún umbral configurado (ej. 50%, 80%, 100%) que aún no haya
   * sido notificado en el periodo (RF-011 / RNF-010).
   *
   * Puede invocarse de forma reactiva tras registrar un nuevo gasto
   * o al consultar el estado presupuestal.
   */
  evaluateBudgetAlerts(
    userId: string,
    targetCategoryId?: string
  ): BudgetAlertEvaluationResult {
    const prefs = this.getPreferences(userId);
    if (!prefs.enabled) {
      return { triggered: false, alerts: [] };
    }

    // Obtener presupuestos activos del usuario
    const allBudgets = db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)))
      .all();

    const relevantBudgets = targetCategoryId
      ? allBudgets.filter((b) => b.categoryId === targetCategoryId)
      : allBudgets;

    if (relevantBudgets.length === 0) {
      return { triggered: false, alerts: [] };
    }

    // Mapa de categorías para resolver nombres e iconos en memoria sin N+1
    const userCategories = db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .all();
    const catMap = new Map<string, Category>(userCategories.map((c) => [c.id, c]));

    const triggeredAlerts: BudgetAlertTriggered[] = [];

    for (const budget of relevantBudgets) {
      // Calcular gasto acumulado en el periodo del presupuesto
      const spentRow = sqliteDb.getFirstSync<{ total_spent: number }>(
        `SELECT coalesce(sum(amount_cents), 0) AS total_spent
         FROM transactions
         WHERE user_id = ?
           AND category_id = ?
           AND type = 'expense'
           AND occurred_on >= ?
           AND occurred_on <= ?
           AND deleted_at IS NULL`,
        [userId, budget.categoryId, budget.periodStart, budget.periodEnd]
      );

      const spentCents = spentRow?.total_spent ?? 0;
      if (budget.amountCents <= 0) continue;

      const currentPercent = Math.round((spentCents / budget.amountCents) * 100);
      const cat = catMap.get(budget.categoryId);

      // Evaluar cada umbral configurado por el usuario en orden ascendente (ej. 50, 80, 100)
      for (const threshold of prefs.thresholds) {
        if (currentPercent >= threshold) {
          const alreadySent = this.hasAlertBeenSent(
            userId,
            budget.id,
            budget.periodStart,
            threshold
          );

          if (!alreadySent) {
            const alertData: Omit<BudgetAlertTriggered, 'id'> = {
              userId,
              budgetId: budget.id,
              categoryId: budget.categoryId,
              categoryName: cat?.name ?? 'Categoría',
              categoryIcon: cat?.icon ?? 'AlertTriangle',
              categoryColor: cat?.color ?? '#EF4444',
              thresholdPercent: threshold,
              periodStart: budget.periodStart,
              periodEnd: budget.periodEnd,
              spentCents,
              budgetAmountCents: budget.amountCents,
              currentPercent,
              createdAt: new Date().toISOString(),
            };

            const recorded = this.recordAlertSent(userId, alertData);

            triggeredAlerts.push({
              ...alertData,
              id: recorded.id,
            });
          }
        }
      }
    }

    return {
      triggered: triggeredAlerts.length > 0,
      alerts: triggeredAlerts,
    };
  },

  /**
   * Obtiene el historial de alertas emitidas recientemente.
   */
  getRecentAlerts(userId: string, limit: number = 10): BudgetAlertTriggered[] {
    const rows = db
      .select()
      .from(budgetAlertsHistory)
      .where(eq(budgetAlertsHistory.userId, userId))
      .orderBy(desc(budgetAlertsHistory.createdAt))
      .limit(limit)
      .all();

    if (rows.length === 0) return [];

    const userCategories = db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .all();
    const catMap = new Map<string, Category>(userCategories.map((c) => [c.id, c]));

    return rows.map((r) => {
      const cat = catMap.get(r.categoryId);
      const currentPercent =
        r.budgetAmountCents > 0
          ? Math.round((r.spentCents / r.budgetAmountCents) * 100)
          : 0;

      return {
        id: r.id,
        userId: r.userId,
        budgetId: r.budgetId,
        categoryId: r.categoryId,
        categoryName: cat?.name ?? 'Categoría',
        categoryIcon: cat?.icon ?? 'AlertTriangle',
        categoryColor: cat?.color ?? '#EF4444',
        thresholdPercent: r.thresholdPercent,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        spentCents: r.spentCents,
        budgetAmountCents: r.budgetAmountCents,
        currentPercent,
        createdAt: r.createdAt,
      };
    });
  },
};
