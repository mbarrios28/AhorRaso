/**
 * Tipos e interfaces de Dominio para Analítica de Patrones de Consumo (RF-012)
 * y Recomendaciones Inteligentes de Ahorro (RF-013) — HU-09.
 *
 * 100% agnóstico de UI y de motor de persistencia.
 */

export interface AnalyticsTransactionInput {
  id: string;
  type: 'income' | 'expense';
  amountCents: number;
  occurredOn: string; // "YYYY-MM-DD"
  categoryId: string;
  merchantName?: string | null;
  note?: string | null;
  paymentMethod?: 'cash' | 'digital' | null;
}

export interface AnalyticsCategoryMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

export interface AnalyticsBudgetMeta {
  id: string;
  categoryId: string;
  categoryName: string;
  amountCents: number;
  spentCents: number;
  periodType: 'weekly' | 'biweekly' | 'monthly';
}

export interface AnalyticsGoalMeta {
  id: string;
  name: string;
  targetAmountCents: number;
  currentAmountCents: number;
  periodicSavingsCents: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
}

/**
 * 1. Distribución y concentración de gasto por categoría (RF-012)
 */
export interface CategorySpendingPattern {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  totalCents: number;
  transactionCount: number;
  percentageOfTotal: number;
  averageTicketCents: number;
}

/**
 * 2. Variación intermensual por categoría y global (RF-012)
 */
export type TrendDirection = 'up' | 'down' | 'stable';

export interface MonthlyCategoryDelta {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  currentMonthCents: number;
  previousMonthCents: number;
  deltaCents: number;
  deltaPercentage: number; // Ej: +25 para +25%, -15 para -15%
  trend: TrendDirection;
}

export interface MonthlyComparison {
  currentMonthCents: number;
  previousMonthCents: number;
  deltaCents: number;
  deltaPercentage: number;
  trend: TrendDirection;
  hasPreviousMonthData: boolean;
  categoryDeltas: MonthlyCategoryDelta[];
}

/**
 * 3. Detección de Gastos Hormiga (RF-012)
 */
export interface AntExpenseOptions {
  /** Umbral máximo por compra individual para considerarse gasto hormiga (default: 2000 = S/ 20.00) */
  maxUnitAmountCents?: number;
  /** Mínimo de ocurrencias en el periodo para activar alerta de patrón hormiga (default: 3) */
  minOccurrences?: number;
}

export interface AntExpenseCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalCents: number;
  count: number;
}

export interface AntExpensePattern {
  detected: boolean;
  thresholdCents: number;
  totalAntCents: number;
  occurrenceCount: number;
  averageAntCents: number;
  percentageOfMonthlySpend: number;
  topCategoryId: string | null;
  topCategoryName: string | null;
  topConcept: string | null;
  byCategory: AntExpenseCategoryBreakdown[];
}

/**
 * 4. Patrón temporal y día pico de la semana (RF-012)
 */
export interface WeekdaySpending {
  /** 0 = Domingo, 1 = Lunes, ..., 6 = Sábado */
  dayIndex: number;
  dayName: string;
  shortName: string;
  totalCents: number;
  transactionCount: number;
  percentageOfTotal: number;
}

export interface PeakDayPattern {
  dayIndex: number;
  dayName: string;
  totalCents: number;
  transactionCount: number;
  percentageOfTotal: number;
}

/**
 * Resultado consolidado del motor de patrones (RF-012)
 */
export interface ConsumptionPatternsResult {
  totalExpenseCents: number;
  expenseTransactionsCount: number;
  categoryPatterns: CategorySpendingPattern[];
  monthlyComparison: MonthlyComparison;
  antExpenses: AntExpensePattern;
  weekdayBreakdown: WeekdaySpending[];
  peakDay: PeakDayPattern | null;
}

/**
 * 5. Recomendaciones de Ahorro y Contrato AI Gateway (RF-013)
 */
export type RecommendationPriority = 'high' | 'medium' | 'low';

export type RecommendationType =
  | 'ant_expenses'
  | 'category_spike'
  | 'budget_risk'
  | 'peak_day_control'
  | 'goal_allocation'
  | 'healthy_habit';

export interface SavingsRecommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  actionableTip: string;
  estimatedMonthlySavingsCents: number;
  relatedCategoryId?: string;
  relatedCategoryName?: string;
  relatedGoalId?: string;
  relatedGoalName?: string;
  source: 'deterministic' | 'ai_gateway';
}

/**
 * Contrato JSON del AI Gateway (`core/ai`) para enriquecimiento futuro con LLM
 * sin romper el funcionamiento 100% offline.
 */
export interface AiGatewayRecommendationsPayload {
  schemaVersion: '1.0';
  generatedAt: string;
  recommendations: {
    id?: string;
    type: RecommendationType;
    priority: RecommendationPriority;
    title: string;
    description: string;
    actionableTip: string;
    estimatedMonthlySavingsCents: number;
    relatedCategoryId?: string;
    relatedCategoryName?: string;
    relatedGoalId?: string;
    relatedGoalName?: string;
  }[];
}

/**
 * Reporte completo entregado por `analytics.repository` a la capa de UI.
 */
export interface ConsumptionAnalysisReport {
  userId: string;
  periodMonthName: string;
  periodYear: number;
  periodStart: string;
  periodEnd: string;
  totalExpenseCents: number;
  totalIncomeCents: number;
  transactionCount: number;
  hasEnoughData: boolean;
  categoryPatterns: CategorySpendingPattern[];
  monthlyComparison: MonthlyComparison;
  antExpenses: AntExpensePattern;
  weekdayBreakdown: WeekdaySpending[];
  peakDay: PeakDayPattern | null;
  recommendations: SavingsRecommendation[];
  totalPotentialSavingsCents: number;
  activeGoal: AnalyticsGoalMeta | null;
  fromCache: boolean;
  generatedAt: string;
}
