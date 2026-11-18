/**
 * Motor Determinista de Recomendaciones de Ahorro + Adaptador de Contrato AI Gateway (RF-013 / HU-09).
 *
 * Puro TypeScript: sin dependencias de UI ni de SQLite.
 */
import {
  AiGatewayRecommendationsPayload,
  AnalyticsBudgetMeta,
  AnalyticsGoalMeta,
  ConsumptionPatternsResult,
  RecommendationPriority,
  RecommendationType,
  SavingsRecommendation,
} from './types';

export interface RecommendationContext {
  activeBudgets?: AnalyticsBudgetMeta[];
  activeGoals?: AnalyticsGoalMeta[];
  monthlyIncomeCents?: number;
}

const PRIORITY_WEIGHT: Record<RecommendationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function formatSoles(cents: number): string {
  return `S/ ${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/**
 * Genera recomendaciones concretas, explicables y accionables a partir de los patrones de consumo (RF-013).
 */
export function generateSavingsRecommendations(
  patterns: ConsumptionPatternsResult,
  context: RecommendationContext = {}
): {
  recommendations: SavingsRecommendation[];
  totalPotentialSavingsCents: number;
} {
  const recommendations: SavingsRecommendation[] = [];
  const activeBudgets = context.activeBudgets ?? [];
  const activeGoals = context.activeGoals ?? [];
  const primaryGoal = activeGoals[0] ?? null;

  if (patterns.expenseTransactionsCount === 0 || patterns.totalExpenseCents <= 0) {
    return {
      recommendations: [],
      totalPotentialSavingsCents: 0,
    };
  }

  // 1. Recomendación por Gastos Hormiga (recorte sugerido del 35%)
  if (patterns.antExpenses.detected && patterns.antExpenses.totalAntCents >= 1000) {
    const cutRate = 0.35;
    const estimatedSavingsCents = Math.max(
      100,
      Math.round(patterns.antExpenses.totalAntCents * cutRate)
    );
    const isHighImpact =
      patterns.antExpenses.percentageOfMonthlySpend >= 20 ||
      patterns.antExpenses.occurrenceCount >= 6;
    const catLabel = patterns.antExpenses.topCategoryName ?? 'compras menores';
    const conceptLabel = patterns.antExpenses.topConcept
      ? ` (como "${patterns.antExpenses.topConcept}")`
      : '';

    recommendations.push({
      id: 'rec-ant-expenses',
      type: 'ant_expenses',
      priority: isHighImpact ? 'high' : 'medium',
      title: `Reduce tus gastos hormiga en ${catLabel}`,
      description: `Registraste ${patterns.antExpenses.occurrenceCount} compras menores a ${formatSoles(
        patterns.antExpenses.thresholdCents
      )}${conceptLabel}, acumulando ${formatSoles(
        patterns.antExpenses.totalAntCents
      )} (${patterns.antExpenses.percentageOfMonthlySpend}% de tu gasto mensual).`,
      actionableTip: `Si reemplazas o evitas 1 de cada 3 micro-compras, liberarás cerca de ${formatSoles(
        estimatedSavingsCents
      )} al mes.`,
      estimatedMonthlySavingsCents: estimatedSavingsCents,
      relatedCategoryId: patterns.antExpenses.topCategoryId ?? undefined,
      relatedCategoryName: patterns.antExpenses.topCategoryName ?? undefined,
      relatedGoalId: primaryGoal?.id,
      relatedGoalName: primaryGoal?.name,
      source: 'deterministic',
    });
  }

  // 2. Recomendación por categorías con incremento > 15% respecto al mes pasado
  if (patterns.monthlyComparison.hasPreviousMonthData) {
    const spikedCategories = patterns.monthlyComparison.categoryDeltas.filter(
      (d) =>
        d.previousMonthCents > 0 &&
        d.deltaPercentage > 15 &&
        d.deltaCents >= 1500 // al menos S/ 15.00 de incremento real
    );

    for (const spike of spikedCategories.slice(0, 2)) {
      // Sugerir recortar el 50% del excedente intermensual
      const estimatedSavingsCents = Math.max(100, Math.round(spike.deltaCents * 0.5));
      const priority: RecommendationPriority =
        spike.deltaPercentage >= 35 || spike.deltaCents >= 5000 ? 'high' : 'medium';

      recommendations.push({
        id: `rec-spike-${spike.categoryId}`,
        type: 'category_spike',
        priority,
        title: `Ajusta el alza de +${spike.deltaPercentage}% en ${spike.categoryName}`,
        description: `Este mes llevas ${formatSoles(
          spike.currentMonthCents
        )} en ${spike.categoryName} frente a ${formatSoles(
          spike.previousMonthCents
        )} del mes anterior (+${formatSoles(spike.deltaCents)}).`,
        actionableTip: `Establece un tope semanal en ${spike.categoryName} para recuperar al menos la mitad del sobrecosto (${formatSoles(
          estimatedSavingsCents
        )}).`,
        estimatedMonthlySavingsCents: estimatedSavingsCents,
        relatedCategoryId: spike.categoryId,
        relatedCategoryName: spike.categoryName,
        relatedGoalId: primaryGoal?.id,
        relatedGoalName: primaryGoal?.name,
        source: 'deterministic',
      });
    }
  }

  // 3. Recomendación por riesgo o exceso de Presupuesto Activo (>= 80%)
  for (const budget of activeBudgets) {
    if (budget.amountCents <= 0) continue;
    const ratio = budget.spentCents / budget.amountCents;
    if (ratio >= 0.8) {
      const pct = Math.round(ratio * 100);
      const isExceeded = budget.spentCents > budget.amountCents;
      const excessOrTargetSave = isExceeded
        ? budget.spentCents - budget.amountCents
        : Math.max(500, Math.round(budget.amountCents * 0.15));

      // Evitar duplicar si ya hay una recomendación de spike de la misma categoría con prioridad alta
      const alreadyCovered = recommendations.some(
        (r) => r.relatedCategoryId === budget.categoryId && r.type === 'category_spike'
      );
      if (!alreadyCovered) {
        recommendations.push({
          id: `rec-budget-${budget.id}`,
          type: 'budget_risk',
          priority: isExceeded ? 'high' : 'medium',
          title: isExceeded
            ? `Presupuesto superado en ${budget.categoryName} (${pct}%)`
            : `Cuidado: ${budget.categoryName} al ${pct}% de su límite`,
          description: `Has consumido ${formatSoles(budget.spentCents)} de tu presupuesto de ${formatSoles(
            budget.amountCents
          )} en ${budget.categoryName}.`,
          actionableTip: isExceeded
            ? `Pausa compras no esenciales en ${budget.categoryName} para compensar ${formatSoles(
                excessOrTargetSave
              )} en el próximo ciclo.`
            : `Limita gastos variables en ${budget.categoryName} durante los próximos días para proteger ${formatSoles(
                excessOrTargetSave
              )}.`,
          estimatedMonthlySavingsCents: excessOrTargetSave,
          relatedCategoryId: budget.categoryId,
          relatedCategoryName: budget.categoryName,
          relatedGoalId: primaryGoal?.id,
          relatedGoalName: primaryGoal?.name,
          source: 'deterministic',
        });
      }
    }
  }

  // 4. Recomendación por alta concentración en una sola categoría (>= 45% del gasto total)
  const topCat = patterns.categoryPatterns[0];
  if (
    topCat &&
    topCat.percentageOfTotal >= 45 &&
    topCat.totalCents >= 5000 &&
    !recommendations.some((r) => r.relatedCategoryId === topCat.categoryId)
  ) {
    const estimatedSavingsCents = Math.max(500, Math.round(topCat.totalCents * 0.15));
    recommendations.push({
      id: `rec-concentration-${topCat.categoryId}`,
      type: 'category_spike',
      priority: 'medium',
      title: `Optimiza tu categoría principal: ${topCat.categoryName}`,
      description: `${topCat.categoryName} concentra el ${topCat.percentageOfTotal}% de todo tu gasto mensual (${formatSoles(
        topCat.totalCents
      )} en ${topCat.transactionCount} compras).`,
      actionableTip: `Reducir un 15% tus compras en ${topCat.categoryName} te permitirá ahorrar ${formatSoles(
        estimatedSavingsCents
      )} este mes.`,
      estimatedMonthlySavingsCents: estimatedSavingsCents,
      relatedCategoryId: topCat.categoryId,
      relatedCategoryName: topCat.categoryName,
      relatedGoalId: primaryGoal?.id,
      relatedGoalName: primaryGoal?.name,
      source: 'deterministic',
    });
  }

  // 5. Recomendación por Día Pico de consumo (>= 35% concentrado en un día de la semana)
  if (
    patterns.peakDay &&
    patterns.peakDay.percentageOfTotal >= 35 &&
    patterns.peakDay.totalCents >= 3000 &&
    patterns.peakDay.transactionCount >= 2
  ) {
    const estimatedSavingsCents = Math.max(
      300,
      Math.round(patterns.peakDay.totalCents * 0.2)
    );
    recommendations.push({
      id: `rec-peak-day-${patterns.peakDay.dayIndex}`,
      type: 'peak_day_control',
      priority: 'low',
      title: `Planifica tus gastos de los ${patterns.peakDay.dayName}`,
      description: `Los días ${patterns.peakDay.dayName} concentran el ${patterns.peakDay.percentageOfTotal}% de tu gasto (${formatSoles(
        patterns.peakDay.totalCents
      )}).`,
      actionableTip: `Fija un presupuesto máximo antes de salir los ${patterns.peakDay.dayName} para ahorrar alrededor de ${formatSoles(
        estimatedSavingsCents
      )}.`,
      estimatedMonthlySavingsCents: estimatedSavingsCents,
      relatedGoalId: primaryGoal?.id,
      relatedGoalName: primaryGoal?.name,
      source: 'deterministic',
    });
  }

  // Ordenar por prioridad y mayor ahorro potencial
  recommendations.sort(
    (a, b) =>
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      b.estimatedMonthlySavingsCents - a.estimatedMonthlySavingsCents
  );

  // Calcular el ahorro potencial acumulado (sin duplicar con la tarjeta de asignación a meta)
  const basePotentialSavingsCents = recommendations.reduce(
    (sum, r) => sum + r.estimatedMonthlySavingsCents,
    0
  );

  // 6. Recomendación de vinculación con Meta de Ahorro Activa (RF-013 + RF-007)
  if (primaryGoal) {
    const remainingForGoal = Math.max(
      0,
      primaryGoal.targetAmountCents - primaryGoal.currentAmountCents
    );
    const transferableCents =
      basePotentialSavingsCents > 0
        ? basePotentialSavingsCents
        : Math.max(500, Math.round(patterns.totalExpenseCents * 0.1));

    if (remainingForGoal > 0) {
      const progressBoostPct = Math.min(
        100,
        Math.max(1, Math.round((transferableCents / primaryGoal.targetAmountCents) * 100))
      );

      recommendations.push({
        id: `rec-goal-${primaryGoal.id}`,
        type: 'goal_allocation',
        priority: basePotentialSavingsCents >= 3000 ? 'high' : 'medium',
        title: `Impulsa tu meta "${primaryGoal.name}"`,
        description: `Destinando tu ahorro potencial identificado (${formatSoles(
          transferableCents
        )}) avanzarías un +${progressBoostPct}% adicional hacia tu objetivo de ${formatSoles(
          primaryGoal.targetAmountCents
        )}.`,
        actionableTip: `Transfiere hoy una parte de este ahorro a tu meta "${primaryGoal.name}" para acortar tu fecha estimada.`,
        estimatedMonthlySavingsCents:
          basePotentialSavingsCents > 0 ? 0 : transferableCents,
        relatedGoalId: primaryGoal.id,
        relatedGoalName: primaryGoal.name,
        source: 'deterministic',
      });
    }
  }

  // Fallback positivo si el usuario tiene gastos muy equilibrados y aún no se activó ninguna regla
  if (recommendations.length === 0) {
    const suggestedSave = Math.max(500, Math.round(patterns.totalExpenseCents * 0.1));
    recommendations.push({
      id: 'rec-healthy-habit',
      type: 'healthy_habit',
      priority: 'low',
      title: 'Consumo equilibrado este mes',
      description: `Tu gasto actual de ${formatSoles(
        patterns.totalExpenseCents
      )} se mantiene sin picos abruptos ni exceso de gastos hormiga.`,
      actionableTip: `Separa preventivamente el 10% (${formatSoles(
        suggestedSave
      )}) hacia una meta de ahorro para consolidar tu hábito.`,
      estimatedMonthlySavingsCents: suggestedSave,
      relatedGoalId: primaryGoal?.id,
      relatedGoalName: primaryGoal?.name,
      source: 'deterministic',
    });
  }

  const totalPotentialSavingsCents = recommendations.reduce(
    (sum, r) => sum + r.estimatedMonthlySavingsCents,
    0
  );

  return {
    recommendations,
    totalPotentialSavingsCents,
  };
}

/**
 * Serializa las recomendaciones al contrato JSON oficial del AI Gateway (`core/ai`).
 */
export function toAiGatewayContractPayload(
  recommendations: SavingsRecommendation[],
  nowISO: string = new Date().toISOString()
): AiGatewayRecommendationsPayload {
  return {
    schemaVersion: '1.0',
    generatedAt: nowISO,
    recommendations: recommendations.map((r) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      title: r.title,
      description: r.description,
      actionableTip: r.actionableTip,
      estimatedMonthlySavingsCents: r.estimatedMonthlySavingsCents,
      relatedCategoryId: r.relatedCategoryId,
      relatedCategoryName: r.relatedCategoryName,
      relatedGoalId: r.relatedGoalId,
      relatedGoalName: r.relatedGoalName,
    })),
  };
}

const VALID_PRIORITIES = new Set<RecommendationPriority>(['high', 'medium', 'low']);
const VALID_TYPES = new Set<RecommendationType>([
  'ant_expenses',
  'category_spike',
  'budget_risk',
  'peak_day_control',
  'goal_allocation',
  'healthy_habit',
]);

/**
 * Parsea y valida una respuesta JSON proveniente del AI Gateway (`core/ai`).
 * Si el JSON es inválido o incompleto, retorna de forma segura las recomendaciones deterministas (fallback offline).
 */
export function parseAiGatewayRecommendationsJson(
  rawJson: string,
  deterministicFallback: SavingsRecommendation[]
): SavingsRecommendation[] {
  try {
    const parsed = JSON.parse(rawJson) as Partial<AiGatewayRecommendationsPayload>;
    if (!parsed || !Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
      return deterministicFallback;
    }

    const validated: SavingsRecommendation[] = [];
    for (let i = 0; i < parsed.recommendations.length; i++) {
      const item = parsed.recommendations[i];
      if (
        !item ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        typeof item.description !== 'string' ||
        !item.description.trim() ||
        typeof item.actionableTip !== 'string' ||
        !item.actionableTip.trim()
      ) {
        continue;
      }

      const priority: RecommendationPriority = VALID_PRIORITIES.has(item.priority)
        ? item.priority
        : 'medium';
      const type: RecommendationType = VALID_TYPES.has(item.type)
        ? item.type
        : 'healthy_habit';
      const savings =
        typeof item.estimatedMonthlySavingsCents === 'number' &&
        Number.isFinite(item.estimatedMonthlySavingsCents) &&
        item.estimatedMonthlySavingsCents >= 0
          ? Math.round(item.estimatedMonthlySavingsCents)
          : 0;

      validated.push({
        id: item.id?.trim() || `ai-rec-${i + 1}`,
        type,
        priority,
        title: item.title.trim(),
        description: item.description.trim(),
        actionableTip: item.actionableTip.trim(),
        estimatedMonthlySavingsCents: savings,
        relatedCategoryId: item.relatedCategoryId,
        relatedCategoryName: item.relatedCategoryName,
        relatedGoalId: item.relatedGoalId,
        relatedGoalName: item.relatedGoalName,
        source: 'ai_gateway',
      });
    }

    return validated.length > 0 ? validated : deterministicFallback;
  } catch {
    return deterministicFallback;
  }
}
