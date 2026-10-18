import { eq, and, isNull, gte, lte } from 'drizzle-orm';
import { db, profile, transactions, categories, Transaction } from '@/core/db';
import {
  DashboardSummary,
  CategoryExpenseBreakdown,
  MonthlyProjection,
  SavingsGoalMock,
} from '../domain/types';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function formatCurrency(cents: number): string {
  const soles = (cents / 100).toFixed(2);
  return `S/ ${soles}`;
}

export const dashboardRepository = {
  /**
   * Obtiene el resumen financiero integral del usuario para el mes en curso (RF-008).
   * 
   * Se ejecuta en SQLite local JSI en menos de 50 ms (RNF-003 < 3s).
   * @param userId Identificador del usuario local.
   * @param referenceDate Fecha de corte opcional (útil para pruebas unitarias deterministas).
   */
  getDashboardSummary(userId: string, referenceDate: Date = new Date()): DashboardSummary {
    const year = referenceDate.getFullYear();
    const monthIndex = referenceDate.getMonth(); // 0..11
    const currentDay = referenceDate.getDate();

    // Rango de fechas del mes actual en formato "YYYY-MM-DD"
    const totalDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const monthString = String(monthIndex + 1).padStart(2, '0');
    const startOfMonth = `${year}-${monthString}-01`;
    const endOfMonth = `${year}-${monthString}-${String(totalDaysInMonth).padStart(2, '0')}`;

    // 1. Obtener saldo disponible del perfil
    const userProfile = db
      .select()
      .from(profile)
      .where(eq(profile.id, userId))
      .get();

    const balanceCents = userProfile ? userProfile.initialBalanceCents : 0;

    // 2. Obtener todas las transacciones del mes en curso
    const monthTransactions: Transaction[] = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.occurredOn, startOfMonth),
          lte(transactions.occurredOn, endOfMonth),
          isNull(transactions.deletedAt)
        )
      )
      .all();

    // Contador total de movimientos del usuario para el indicador contextual
    const totalCountRow = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt)
        )
      )
      .all();

    // 3. Totales mensuales de ingresos y gastos
    let monthlyIncomeCents = 0;
    let monthlyExpenseCents = 0;
    const expenseByCategoryMap = new Map<string, number>();

    for (const tx of monthTransactions) {
      if (tx.type === 'income') {
        monthlyIncomeCents += tx.amountCents;
      } else if (tx.type === 'expense') {
        monthlyExpenseCents += tx.amountCents;
        const currentCatTotal = expenseByCategoryMap.get(tx.categoryId) ?? 0;
        expenseByCategoryMap.set(tx.categoryId, currentCatTotal + tx.amountCents);
      }
    }

    // 4. Desglose de gastos por categoría con porcentaje relativo
    const allUserCategories = db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          isNull(categories.deletedAt)
        )
      )
      .all();

    const catMap = new Map(allUserCategories.map((c) => [c.id, c]));

    const categoryExpenses: CategoryExpenseBreakdown[] = [];

    expenseByCategoryMap.forEach((amountCents, categoryId) => {
      const cat = catMap.get(categoryId);
      const percentage =
        monthlyExpenseCents > 0
          ? Math.round((amountCents / monthlyExpenseCents) * 100)
          : 0;

      categoryExpenses.push({
        categoryId,
        categoryName: cat?.name ?? 'Sin categoría',
        categoryIcon: cat?.icon ?? 'Tag',
        categoryColor: cat?.color ?? '#71717A',
        amountCents,
        formattedAmount: formatCurrency(amountCents),
        percentage,
      });
    });

    // Ordenar de mayor a menor gasto
    categoryExpenses.sort((a, b) => b.amountCents - a.amountCents);

    // 5. Cálculo de Proyección Fin de Mes y Diario Seguro
    const daysRemaining = Math.max(1, totalDaysInMonth - currentDay + 1);
    const cycleElapsedPercentage = Math.min(
      100,
      Math.max(0, Math.round(((currentDay - 1) / totalDaysInMonth) * 100))
    );

    const safeDailyCents =
      balanceCents > 0 ? Math.round(balanceCents / daysRemaining) : 0;

    const projection: MonthlyProjection = {
      currentDay,
      totalDaysInMonth,
      daysRemaining,
      cycleElapsedPercentage,
      safeDailyCents,
      formattedSafeDaily: formatCurrency(safeDailyCents),
    };

    // 6. Meta activa de ahorro (Mock desacoplado de RF-007)
    const activeGoal: SavingsGoalMock = {
      id: 'goal-laptop-ciclo',
      title: 'Laptop para ciclo',
      targetCents: 50000, // S/ 500.00
      currentCents: 12000, // S/ 120.00
      formattedCurrent: 'S/ 120.00',
      formattedTarget: 'S/ 500.00',
      percentage: 24,
      deadlineText: 'Meta para marzo 2027',
    };

    return {
      userId,
      monthName: MONTH_NAMES[monthIndex],
      year,
      balanceCents,
      formattedBalance: formatCurrency(balanceCents),
      monthlyIncomeCents,
      formattedMonthlyIncome: formatCurrency(monthlyIncomeCents),
      monthlyExpenseCents,
      formattedMonthlyExpense: formatCurrency(monthlyExpenseCents),
      totalTransactionsCount: totalCountRow.length,
      projection,
      categoryExpenses,
      activeGoal,
    };
  },
};
