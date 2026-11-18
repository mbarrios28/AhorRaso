/**
 * Motor Determinista de Análisis de Patrones de Consumo (RF-012 / HU-09).
 *
 * Puro TypeScript: sin dependencias de React Native, UI ni SQLite.
 */
import {
  AnalyticsCategoryMeta,
  AnalyticsTransactionInput,
  AntExpenseCategoryBreakdown,
  AntExpenseOptions,
  AntExpensePattern,
  CategorySpendingPattern,
  ConsumptionPatternsResult,
  MonthlyCategoryDelta,
  MonthlyComparison,
  PeakDayPattern,
  TrendDirection,
  WeekdaySpending,
} from './types';

export const DEFAULT_ANT_MAX_UNIT_CENTS = 2000; // S/ 20.00
export const DEFAULT_ANT_MIN_OCCURRENCES = 3;

const WEEKDAYS_META: { dayIndex: number; dayName: string; shortName: string }[] = [
  { dayIndex: 1, dayName: 'Lunes', shortName: 'L' },
  { dayIndex: 2, dayName: 'Martes', shortName: 'M' },
  { dayIndex: 3, dayName: 'Miércoles', shortName: 'X' },
  { dayIndex: 4, dayName: 'Jueves', shortName: 'J' },
  { dayIndex: 5, dayName: 'Viernes', shortName: 'V' },
  { dayIndex: 6, dayName: 'Sábado', shortName: 'S' },
  { dayIndex: 0, dayName: 'Domingo', shortName: 'D' },
];

/**
 * Parsea "YYYY-MM-DD" en componentes locales sin desfase UTC.
 */
function parseLocalDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(year, month, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

function computeTrend(deltaPercentage: number, deltaCents: number): TrendDirection {
  if (Math.abs(deltaPercentage) < 3 || Math.abs(deltaCents) < 100) {
    return 'stable';
  }
  return deltaCents > 0 ? 'up' : 'down';
}

/**
 * 1. Distribución y concentración por categoría (RF-012)
 */
export function analyzeCategoryDistribution(
  transactions: AnalyticsTransactionInput[],
  categoriesMap: Map<string, AnalyticsCategoryMeta>
): CategorySpendingPattern[] {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.amountCents > 0);
  if (expenses.length === 0) return [];

  const totalExpenseCents = expenses.reduce((sum, tx) => sum + tx.amountCents, 0);
  if (totalExpenseCents <= 0) return [];

  const grouped = new Map<string, { totalCents: number; count: number }>();

  for (const tx of expenses) {
    const current = grouped.get(tx.categoryId) ?? { totalCents: 0, count: 0 };
    current.totalCents += tx.amountCents;
    current.count += 1;
    grouped.set(tx.categoryId, current);
  }

  const patterns: CategorySpendingPattern[] = [];

  for (const [categoryId, stats] of grouped.entries()) {
    const cat = categoriesMap.get(categoryId);
    const percentageOfTotal = Math.round((stats.totalCents / totalExpenseCents) * 100);
    const averageTicketCents = Math.round(stats.totalCents / stats.count);

    patterns.push({
      categoryId,
      categoryName: cat?.name ?? 'Sin categoría',
      categoryIcon: cat?.icon ?? 'Tag',
      categoryColor: cat?.color ?? '#64748B',
      totalCents: stats.totalCents,
      transactionCount: stats.count,
      percentageOfTotal,
      averageTicketCents,
    });
  }

  patterns.sort((a, b) => b.totalCents - a.totalCents || b.transactionCount - a.transactionCount);
  return patterns;
}

/**
 * 2. Variación intermensual global y por categoría (RF-012)
 */
export function analyzeMonthlyComparison(
  currentMonthTransactions: AnalyticsTransactionInput[],
  previousMonthTransactions: AnalyticsTransactionInput[],
  categoriesMap: Map<string, AnalyticsCategoryMeta>
): MonthlyComparison {
  const currentExpenses = currentMonthTransactions.filter(
    (t) => t.type === 'expense' && t.amountCents > 0
  );
  const previousExpenses = previousMonthTransactions.filter(
    (t) => t.type === 'expense' && t.amountCents > 0
  );

  const currentMonthCents = currentExpenses.reduce((acc, tx) => acc + tx.amountCents, 0);
  const previousMonthCents = previousExpenses.reduce((acc, tx) => acc + tx.amountCents, 0);
  const hasPreviousMonthData = previousMonthCents > 0;

  const deltaCents = currentMonthCents - previousMonthCents;
  const deltaPercentage =
    previousMonthCents > 0
      ? Math.round(((currentMonthCents - previousMonthCents) / previousMonthCents) * 100)
      : currentMonthCents > 0
      ? 100
      : 0;

  const currentByCat = new Map<string, number>();
  const prevByCat = new Map<string, number>();
  const allCatIds = new Set<string>();

  for (const tx of currentExpenses) {
    currentByCat.set(tx.categoryId, (currentByCat.get(tx.categoryId) ?? 0) + tx.amountCents);
    allCatIds.add(tx.categoryId);
  }
  for (const tx of previousExpenses) {
    prevByCat.set(tx.categoryId, (prevByCat.get(tx.categoryId) ?? 0) + tx.amountCents);
    allCatIds.add(tx.categoryId);
  }

  const categoryDeltas: MonthlyCategoryDelta[] = [];

  for (const catId of allCatIds) {
    const curr = currentByCat.get(catId) ?? 0;
    const prev = prevByCat.get(catId) ?? 0;
    const catDelta = curr - prev;
    const catPct =
      prev > 0
        ? Math.round(((curr - prev) / prev) * 100)
        : curr > 0
        ? 100
        : 0;
    const catMeta = categoriesMap.get(catId);

    categoryDeltas.push({
      categoryId: catId,
      categoryName: catMeta?.name ?? 'Sin categoría',
      categoryIcon: catMeta?.icon ?? 'Tag',
      categoryColor: catMeta?.color ?? '#64748B',
      currentMonthCents: curr,
      previousMonthCents: prev,
      deltaCents: catDelta,
      deltaPercentage: catPct,
      trend: computeTrend(catPct, catDelta),
    });
  }

  // Ordenar primero por mayor incremento absoluto en céntimos
  categoryDeltas.sort((a, b) => b.deltaCents - a.deltaCents || b.currentMonthCents - a.currentMonthCents);

  return {
    currentMonthCents,
    previousMonthCents,
    deltaCents,
    deltaPercentage,
    trend: computeTrend(deltaPercentage, deltaCents),
    hasPreviousMonthData,
    categoryDeltas,
  };
}

/**
 * 3. Detección de gastos hormiga (RF-012):
 * Compras pequeñas recurrentes (ej. <= S/ 20.00 con >= 3 ocurrencias en el periodo).
 */
export function detectAntExpenses(
  transactions: AnalyticsTransactionInput[],
  categoriesMap: Map<string, AnalyticsCategoryMeta>,
  options: AntExpenseOptions = {}
): AntExpensePattern {
  const thresholdCents = options.maxUnitAmountCents ?? DEFAULT_ANT_MAX_UNIT_CENTS;
  const minOccurrences = options.minOccurrences ?? DEFAULT_ANT_MIN_OCCURRENCES;

  const expenses = transactions.filter((t) => t.type === 'expense' && t.amountCents > 0);
  const totalMonthlyExpenseCents = expenses.reduce((acc, tx) => acc + tx.amountCents, 0);

  const antTxs = expenses.filter((tx) => tx.amountCents <= thresholdCents);
  const occurrenceCount = antTxs.length;
  const totalAntCents = antTxs.reduce((acc, tx) => acc + tx.amountCents, 0);

  if (occurrenceCount === 0 || totalMonthlyExpenseCents <= 0) {
    return {
      detected: false,
      thresholdCents,
      totalAntCents: 0,
      occurrenceCount: 0,
      averageAntCents: 0,
      percentageOfMonthlySpend: 0,
      topCategoryId: null,
      topCategoryName: null,
      topConcept: null,
      byCategory: [],
    };
  }

  const byCatMap = new Map<string, { totalCents: number; count: number }>();
  const conceptCounts = new Map<string, { label: string; count: number; totalCents: number }>();

  for (const tx of antTxs) {
    const catStats = byCatMap.get(tx.categoryId) ?? { totalCents: 0, count: 0 };
    catStats.totalCents += tx.amountCents;
    catStats.count += 1;
    byCatMap.set(tx.categoryId, catStats);

    const rawLabel = (tx.merchantName?.trim() || tx.note?.trim() || '').trim();
    if (rawLabel.length >= 2) {
      const key = rawLabel.toLowerCase();
      const prev = conceptCounts.get(key) ?? { label: rawLabel, count: 0, totalCents: 0 };
      prev.count += 1;
      prev.totalCents += tx.amountCents;
      conceptCounts.set(key, prev);
    }
  }

  const byCategory: AntExpenseCategoryBreakdown[] = [];
  for (const [catId, stats] of byCatMap.entries()) {
    const cat = categoriesMap.get(catId);
    byCategory.push({
      categoryId: catId,
      categoryName: cat?.name ?? 'Sin categoría',
      categoryColor: cat?.color ?? '#64748B',
      totalCents: stats.totalCents,
      count: stats.count,
    });
  }

  byCategory.sort((a, b) => b.count - a.count || b.totalCents - a.totalCents);

  const conceptsSorted = Array.from(conceptCounts.values()).sort(
    (a, b) => b.count - a.count || b.totalCents - a.totalCents
  );

  const topCat = byCategory[0] ?? null;
  const topConcept = conceptsSorted[0]?.label ?? topCat?.categoryName ?? null;
  const detected = occurrenceCount >= minOccurrences;

  return {
    detected,
    thresholdCents,
    totalAntCents,
    occurrenceCount,
    averageAntCents: Math.round(totalAntCents / occurrenceCount),
    percentageOfMonthlySpend: Math.round((totalAntCents / totalMonthlyExpenseCents) * 100),
    topCategoryId: topCat?.categoryId ?? null,
    topCategoryName: topCat?.categoryName ?? null,
    topConcept,
    byCategory,
  };
}

/**
 * 4. Patrón temporal y día pico de la semana (RF-012)
 */
export function analyzeTemporalPatterns(
  transactions: AnalyticsTransactionInput[]
): {
  weekdayBreakdown: WeekdaySpending[];
  peakDay: PeakDayPattern | null;
} {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.amountCents > 0);
  const totalExpenseCents = expenses.reduce((acc, tx) => acc + tx.amountCents, 0);

  const dayTotals = new Map<number, { totalCents: number; count: number }>();
  for (const meta of WEEKDAYS_META) {
    dayTotals.set(meta.dayIndex, { totalCents: 0, count: 0 });
  }

  for (const tx of expenses) {
    const dt = parseLocalDate(tx.occurredOn);
    if (!dt) continue;
    const dayIdx = dt.getDay(); // 0..6
    const stats = dayTotals.get(dayIdx) ?? { totalCents: 0, count: 0 };
    stats.totalCents += tx.amountCents;
    stats.count += 1;
    dayTotals.set(dayIdx, stats);
  }

  const weekdayBreakdown: WeekdaySpending[] = WEEKDAYS_META.map((meta) => {
    const stats = dayTotals.get(meta.dayIndex) ?? { totalCents: 0, count: 0 };
    const pct =
      totalExpenseCents > 0 ? Math.round((stats.totalCents / totalExpenseCents) * 100) : 0;

    return {
      dayIndex: meta.dayIndex,
      dayName: meta.dayName,
      shortName: meta.shortName,
      totalCents: stats.totalCents,
      transactionCount: stats.count,
      percentageOfTotal: pct,
    };
  });

  if (totalExpenseCents <= 0) {
    return {
      weekdayBreakdown,
      peakDay: null,
    };
  }

  const sortedBySpend = [...weekdayBreakdown].sort(
    (a, b) => b.totalCents - a.totalCents || b.transactionCount - a.transactionCount
  );
  const topDay = sortedBySpend[0];

  const peakDay: PeakDayPattern | null =
    topDay && topDay.totalCents > 0
      ? {
          dayIndex: topDay.dayIndex,
          dayName: topDay.dayName,
          totalCents: topDay.totalCents,
          transactionCount: topDay.transactionCount,
          percentageOfTotal: topDay.percentageOfTotal,
        }
      : null;

  return {
    weekdayBreakdown,
    peakDay,
  };
}

/**
 * Orquestador completo de Patrones de Consumo (RF-012)
 */
export function buildConsumptionPatterns(params: {
  currentMonthTransactions: AnalyticsTransactionInput[];
  previousMonthTransactions: AnalyticsTransactionInput[];
  categories: AnalyticsCategoryMeta[];
  antOptions?: AntExpenseOptions;
}): ConsumptionPatternsResult {
  const categoriesMap = new Map(params.categories.map((c) => [c.id, c]));
  const currentExpenses = params.currentMonthTransactions.filter(
    (t) => t.type === 'expense' && t.amountCents > 0
  );
  const totalExpenseCents = currentExpenses.reduce((acc, tx) => acc + tx.amountCents, 0);

  const categoryPatterns = analyzeCategoryDistribution(
    params.currentMonthTransactions,
    categoriesMap
  );
  const monthlyComparison = analyzeMonthlyComparison(
    params.currentMonthTransactions,
    params.previousMonthTransactions,
    categoriesMap
  );
  const antExpenses = detectAntExpenses(
    params.currentMonthTransactions,
    categoriesMap,
    params.antOptions
  );
  const { weekdayBreakdown, peakDay } = analyzeTemporalPatterns(
    params.currentMonthTransactions
  );

  return {
    totalExpenseCents,
    expenseTransactionsCount: currentExpenses.length,
    categoryPatterns,
    monthlyComparison,
    antExpenses,
    weekdayBreakdown,
    peakDay,
  };
}
