/**
 * AhorRaso - Modelos de Dominio para el Dashboard Financiero (RF-008 / HU-04)
 */

export interface CategoryExpenseBreakdown {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amountCents: number;
  formattedAmount: string; // ej. "S/ 185.00"
  percentage: number;      // ej. 54 (representa 54%)
}

export interface MonthlyProjection {
  currentDay: number;
  totalDaysInMonth: number;
  daysRemaining: number;
  cycleElapsedPercentage: number; // ej. 55%
  safeDailyCents: number;
  formattedSafeDaily: string;     // ej. "S/ 2.48"
}

export interface SavingsGoalMock {
  id: string;
  title: string;
  targetCents: number;
  currentCents: number;
  formattedCurrent: string;
  formattedTarget: string;
  percentage: number;
  deadlineText: string;
}

export interface DashboardSummary {
  userId: string;
  monthName: string;            // ej. "Octubre"
  year: number;                 // ej. 2026
  balanceCents: number;
  formattedBalance: string;     // ej. "S/ 34.70"
  monthlyIncomeCents: number;
  formattedMonthlyIncome: string; // ej. "S/ 380.00"
  monthlyExpenseCents: number;
  formattedMonthlyExpense: string; // ej. "S/ 345.30"
  totalTransactionsCount: number;
  projection: MonthlyProjection;
  categoryExpenses: CategoryExpenseBreakdown[];
  activeGoal: SavingsGoalMock;
}
