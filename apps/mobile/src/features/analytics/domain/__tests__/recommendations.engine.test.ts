import { buildConsumptionPatterns } from '../patterns.engine';
import {
  generateSavingsRecommendations,
  parseAiGatewayRecommendationsJson,
  toAiGatewayContractPayload,
} from '../recommendations.engine';
import {
  AnalyticsCategoryMeta,
  AnalyticsTransactionInput,
} from '../types';

const TEST_CATEGORIES: AnalyticsCategoryMeta[] = [
  {
    id: 'cat-food',
    name: 'Alimentación',
    icon: 'Utensils',
    color: '#F97316',
    type: 'expense',
  },
  {
    id: 'cat-fun',
    name: 'Diversión',
    icon: 'Gamepad2',
    color: '#A855F7',
    type: 'expense',
  },
];

describe('recommendations.engine (RF-013: Recomendaciones de ahorro y Contrato AI Gateway)', () => {
  it('genera recomendaciones concretas para gastos hormiga, incremento intermensual > 15% y meta activa', () => {
    const prevTxs: AnalyticsTransactionInput[] = [
      {
        id: 'p-1',
        type: 'expense',
        amountCents: 10000, // S/ 100.00 en Diversión el mes pasado
        occurredOn: '2026-09-12',
        categoryId: 'cat-fun',
      },
    ];

    const currentTxs: AnalyticsTransactionInput[] = [
      // 4 gastos hormiga en Alimentación (total S/ 40.00)
      {
        id: 'a-1',
        type: 'expense',
        amountCents: 1000,
        occurredOn: '2026-10-03',
        categoryId: 'cat-food',
        merchantName: 'Tambo+',
      },
      {
        id: 'a-2',
        type: 'expense',
        amountCents: 1000,
        occurredOn: '2026-10-04',
        categoryId: 'cat-food',
        merchantName: 'Tambo+',
      },
      {
        id: 'a-3',
        type: 'expense',
        amountCents: 1000,
        occurredOn: '2026-10-05',
        categoryId: 'cat-food',
        merchantName: 'Tambo+',
      },
      {
        id: 'a-4',
        type: 'expense',
        amountCents: 1000,
        occurredOn: '2026-10-06',
        categoryId: 'cat-food',
        merchantName: 'Tambo+',
      },
      // Incremento de +50% en Diversión (de S/ 100 a S/ 150)
      {
        id: 'f-1',
        type: 'expense',
        amountCents: 15000,
        occurredOn: '2026-10-16',
        categoryId: 'cat-fun',
      },
    ];

    const patterns = buildConsumptionPatterns({
      currentMonthTransactions: currentTxs,
      previousMonthTransactions: prevTxs,
      categories: TEST_CATEGORIES,
    });

    const { recommendations, totalPotentialSavingsCents } =
      generateSavingsRecommendations(patterns, {
        activeGoals: [
          {
            id: 'goal-1',
            name: 'Laptop UNSA',
            targetAmountCents: 100000,
            currentAmountCents: 20000,
            periodicSavingsCents: 10000,
            frequency: 'monthly',
          },
        ],
      });

    expect(recommendations.length).toBeGreaterThanOrEqual(3);
    expect(totalPotentialSavingsCents).toBeGreaterThan(0);

    const antRec = recommendations.find((r) => r.type === 'ant_expenses');
    expect(antRec).toBeDefined();
    expect(antRec?.estimatedMonthlySavingsCents).toBe(1400); // 35% de 4000

    const spikeRec = recommendations.find((r) => r.type === 'category_spike');
    expect(spikeRec).toBeDefined();
    expect(spikeRec?.relatedCategoryId).toBe('cat-fun');
    expect(spikeRec?.estimatedMonthlySavingsCents).toBe(2500); // 50% del delta de 5000

    const goalRec = recommendations.find((r) => r.type === 'goal_allocation');
    expect(goalRec).toBeDefined();
    expect(goalRec?.relatedGoalName).toBe('Laptop UNSA');
  });

  it('genera alerta de presupuesto cuando el gasto supera el 80% del límite activo', () => {
    const currentTxs: AnalyticsTransactionInput[] = [
      {
        id: 'b-1',
        type: 'expense',
        amountCents: 9000, // S/ 90 de S/ 100 (90%)
        occurredOn: '2026-10-10',
        categoryId: 'cat-food',
      },
    ];

    const patterns = buildConsumptionPatterns({
      currentMonthTransactions: currentTxs,
      previousMonthTransactions: [],
      categories: TEST_CATEGORIES,
    });

    const { recommendations } = generateSavingsRecommendations(patterns, {
      activeBudgets: [
        {
          id: 'bud-1',
          categoryId: 'cat-food',
          categoryName: 'Alimentación',
          amountCents: 10000,
          spentCents: 9000,
          periodType: 'monthly',
        },
      ],
    });

    const budgetRec = recommendations.find((r) => r.type === 'budget_risk');
    expect(budgetRec).toBeDefined();
    expect(budgetRec?.title).toContain('90%');
  });

  it('serializa y parsea el contrato JSON del AI Gateway con fallback determinista seguro en offline', () => {
    const currentTxs: AnalyticsTransactionInput[] = [
      {
        id: '1',
        type: 'expense',
        amountCents: 3000,
        occurredOn: '2026-10-10',
        categoryId: 'cat-food',
      },
    ];

    const patterns = buildConsumptionPatterns({
      currentMonthTransactions: currentTxs,
      previousMonthTransactions: [],
      categories: TEST_CATEGORIES,
    });

    const { recommendations } = generateSavingsRecommendations(patterns);
    const payload = toAiGatewayContractPayload(
      recommendations,
      '2026-10-15T10:00:00.000Z'
    );

    expect(payload.schemaVersion).toBe('1.0');

    const parsedFromGateway = parseAiGatewayRecommendationsJson(
      JSON.stringify(payload),
      recommendations
    );
    expect(parsedFromGateway).toHaveLength(recommendations.length);
    expect(parsedFromGateway[0].source).toBe('ai_gateway');

    // Si el JSON del gateway es corrupto, debe retornar el fallback determinista sin fallar
    const fallbackResult = parseAiGatewayRecommendationsJson(
      '{invalid_json',
      recommendations
    );
    expect(fallbackResult).toEqual(recommendations);
  });
});
