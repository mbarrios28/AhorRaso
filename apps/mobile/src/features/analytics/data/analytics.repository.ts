/**
 * Repositorio Local de Analítica de Patrones y Recomendaciones (RF-012 y RF-013 / HU-09).
 *
 * Consulta SQLite local (transacciones, categorías, presupuestos activos y metas de ahorro)
 * y gestiona caché ligero en `ai_cache` con invalidación automática por huella de datos (`data_hash`)
 * y TTL para evitar recálculos innecesarios (< 50 ms, RNF-003).
 */
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import {
  aiCache,
  categories,
  db,
  merchants,
  sqliteDb,
  transactions,
  Transaction,
} from '@/core/db';
import { budgetsRepository } from '@/features/budgets/data/budgets.repository';
import { savingsRepository } from '@/features/savings/data/savings.repository';
import {
  AnalyticsBudgetMeta,
  AnalyticsCategoryMeta,
  AnalyticsGoalMeta,
  AnalyticsTransactionInput,
  ConsumptionAnalysisReport,
} from '../domain/types';
import { buildConsumptionPatterns } from '../domain/patterns.engine';
import { generateSavingsRecommendations } from '../domain/recommendations.engine';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** TTL de caché por defecto: 6 horas */
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getMonthDateRange(year: number, monthIndex: number): {
  startISO: string;
  endISO: string;
} {
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const monthStr = String(monthIndex + 1).padStart(2, '0');
  return {
    startISO: `${year}-${monthStr}-01`,
    endISO: `${year}-${monthStr}-${String(totalDays).padStart(2, '0')}`,
  };
}

/**
 * Construye una huella determinista (fingerprint) del estado de transacciones, presupuestos y metas
 * del usuario para invalidar automáticamente la entrada en `ai_cache` en cuanto haya un nuevo movimiento.
 */
function computeAnalyticsDataHash(params: {
  currentMonthTxs: Transaction[];
  previousMonthTxs: Transaction[];
  budgets: AnalyticsBudgetMeta[];
  goals: AnalyticsGoalMeta[];
}): string {
  const txPart = params.currentMonthTxs
    .map(
      (t) =>
        `${t.id}:${t.amountCents}:${t.categoryId}:${t.occurredOn}:${t.clientUpdatedAt}`
    )
    .sort()
    .join('|');
  const prevTxSum = params.previousMonthTxs.reduce((s, t) => s + t.amountCents, 0);
  const prevPart = `${params.previousMonthTxs.length}:${prevTxSum}`;
  const budgetPart = params.budgets
    .map((b) => `${b.id}:${b.amountCents}:${b.spentCents}`)
    .sort()
    .join('|');
  const goalPart = params.goals
    .map((g) => `${g.id}:${g.currentAmountCents}:${g.targetAmountCents}`)
    .sort()
    .join('|');

  return `v1::tx[${txPart}]::prev[${prevPart}]::b[${budgetPart}]::g[${goalPart}]`;
}

export const analyticsRepository = {
  /**
   * Obtiene el reporte completo de análisis de patrones de consumo (RF-012)
   * y recomendaciones personalizadas de ahorro (RF-013) para el mes de referencia.
   *
   * @param userId ID del usuario local
   * @param referenceDate Fecha de corte (por defecto `new Date()`)
   * @param options.forceRefresh Si es `true`, ignora la caché y recalcula
   */
  getConsumptionReport(
    userId: string,
    referenceDate: Date = new Date(),
    options: { forceRefresh?: boolean } = {}
  ): ConsumptionAnalysisReport {
    const year = referenceDate.getFullYear();
    const monthIndex = referenceDate.getMonth();
    const { startISO: currentStart, endISO: currentEnd } = getMonthDateRange(year, monthIndex);

    // Mes inmediatamente anterior
    const prevDate = new Date(year, monthIndex - 1, 1);
    const { startISO: prevStart, endISO: prevEnd } = getMonthDateRange(
      prevDate.getFullYear(),
      prevDate.getMonth()
    );

    const cacheKey = `analytics_report::${userId}::${year}-${String(monthIndex + 1).padStart(
      2,
      '0'
    )}`;

    // 1. Consultar transacciones del mes actual y del mes anterior
    const currentMonthTxs = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.occurredOn, currentStart),
          lte(transactions.occurredOn, currentEnd),
          isNull(transactions.deletedAt)
        )
      )
      .all();

    const previousMonthTxs = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.occurredOn, prevStart),
          lte(transactions.occurredOn, prevEnd),
          isNull(transactions.deletedAt)
        )
      )
      .all();

    // 2. Presupuestos activos y metas de ahorro activas
    const referenceISO = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(
      referenceDate.getDate()
    ).padStart(2, '0')}`;

    const activeBudgetsRaw = budgetsRepository.listActive(userId, referenceISO);
    const activeBudgets: AnalyticsBudgetMeta[] = activeBudgetsRaw.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      amountCents: b.amountCents,
      spentCents: b.spentCents,
      periodType: b.periodType,
    }));

    const activeGoalsRaw = savingsRepository.listActive(userId);
    const activeGoals: AnalyticsGoalMeta[] = activeGoalsRaw
      .filter((g) => g.status === 'active')
      .map((g) => ({
        id: g.id,
        name: g.name,
        targetAmountCents: g.targetAmountCents,
        currentAmountCents: g.currentAmountCents,
        periodicSavingsCents: g.periodicSavingsCents,
        frequency: g.frequency,
      }));

    // 3. Verificar caché local en `ai_cache` con data_hash y TTL
    const dataHash = computeAnalyticsDataHash({
      currentMonthTxs,
      previousMonthTxs,
      budgets: activeBudgets,
      goals: activeGoals,
    });

    const nowMs = Date.now();
    const nowISO = new Date(nowMs).toISOString();

    if (!options.forceRefresh) {
      try {
        const cachedRow = db
          .select()
          .from(aiCache)
          .where(eq(aiCache.cacheKey, cacheKey))
          .get();

        if (
          cachedRow &&
          cachedRow.userId === userId &&
          cachedRow.dataHash === dataHash &&
          cachedRow.expiresAt > nowISO
        ) {
          const parsedReport = JSON.parse(cachedRow.payload) as ConsumptionAnalysisReport;
          return {
            ...parsedReport,
            fromCache: true,
          };
        }
      } catch {
        // Si la lectura de caché falla o la tabla aún no existe, continuar con el cálculo directo
      }
    }

    // 4. Cargar categorías y establecimientos para enriquecer el análisis
    const userCategories = db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.deletedAt)))
      .all();

    const userMerchants = db
      .select()
      .from(merchants)
      .where(and(eq(merchants.userId, userId), isNull(merchants.deletedAt)))
      .all();

    const merchantMap = new Map(userMerchants.map((m) => [m.id, m.name]));

    const mapTxToDomain = (tx: Transaction): AnalyticsTransactionInput => ({
      id: tx.id,
      type: tx.type,
      amountCents: tx.amountCents,
      occurredOn: tx.occurredOn,
      categoryId: tx.categoryId,
      merchantName: tx.merchantId ? merchantMap.get(tx.merchantId) ?? null : null,
      note: tx.note,
      paymentMethod: tx.paymentMethod,
    });

    const domainCurrentTxs = currentMonthTxs.map(mapTxToDomain);
    const domainPreviousTxs = previousMonthTxs.map(mapTxToDomain);

    const domainCategories: AnalyticsCategoryMeta[] = userCategories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
    }));

    const totalIncomeCents = domainCurrentTxs
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + t.amountCents, 0);

    // 5. Ejecutar motores de dominio (RF-012 y RF-013)
    const patterns = buildConsumptionPatterns({
      currentMonthTransactions: domainCurrentTxs,
      previousMonthTransactions: domainPreviousTxs,
      categories: domainCategories,
    });

    const { recommendations, totalPotentialSavingsCents } = generateSavingsRecommendations(
      patterns,
      {
        activeBudgets,
        activeGoals,
        monthlyIncomeCents: totalIncomeCents,
      }
    );

    const report: ConsumptionAnalysisReport = {
      userId,
      periodMonthName: MONTH_NAMES[monthIndex],
      periodYear: year,
      periodStart: currentStart,
      periodEnd: currentEnd,
      totalExpenseCents: patterns.totalExpenseCents,
      totalIncomeCents,
      transactionCount: patterns.expenseTransactionsCount,
      hasEnoughData: patterns.expenseTransactionsCount > 0,
      categoryPatterns: patterns.categoryPatterns,
      monthlyComparison: patterns.monthlyComparison,
      antExpenses: patterns.antExpenses,
      weekdayBreakdown: patterns.weekdayBreakdown,
      peakDay: patterns.peakDay,
      recommendations,
      totalPotentialSavingsCents,
      activeGoal: activeGoals[0] ?? null,
      fromCache: false,
      generatedAt: nowISO,
    };

    // 6. Guardar en `ai_cache` (UPSERT idempotente)
    try {
      const expiresAtISO = new Date(nowMs + DEFAULT_CACHE_TTL_MS).toISOString();
      sqliteDb.runSync(
        `INSERT INTO ai_cache (cache_key, user_id, data_hash, payload, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           data_hash = excluded.data_hash,
           payload = excluded.payload,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
        [cacheKey, userId, dataHash, JSON.stringify(report), nowISO, expiresAtISO]
      );
    } catch {
      // Fallo no bloqueante de escritura de caché
    }

    return report;
  },

  /**
   * Invalida todas las entradas de caché analítica del usuario.
   */
  invalidateCache(userId: string): void {
    try {
      sqliteDb.runSync('DELETE FROM ai_cache WHERE user_id = ?', [userId]);
    } catch {
      // Ignorar si la tabla no está lista
    }
  },
};
