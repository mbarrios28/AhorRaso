import {
  analyzeCategoryDistribution,
  analyzeMonthlyComparison,
  analyzeTemporalPatterns,
  buildConsumptionPatterns,
  detectAntExpenses,
} from '../patterns.engine';
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
    id: 'cat-transport',
    name: 'Transporte',
    icon: 'Bus',
    color: '#3B82F6',
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

const CATEGORIES_MAP = new Map(TEST_CATEGORIES.map((c) => [c.id, c]));

describe('patterns.engine (RF-012: Análisis de patrones de consumo)', () => {
  describe('1. analyzeCategoryDistribution', () => {
    it('calcula distribución por categoría ordenada por monto total, porcentaje y ticket promedio', () => {
      const txs: AnalyticsTransactionInput[] = [
        {
          id: 'tx-1',
          type: 'expense',
          amountCents: 6000, // S/ 60
          occurredOn: '2026-10-05',
          categoryId: 'cat-food',
        },
        {
          id: 'tx-2',
          type: 'expense',
          amountCents: 2000, // S/ 20
          occurredOn: '2026-10-06',
          categoryId: 'cat-food',
        },
        {
          id: 'tx-3',
          type: 'expense',
          amountCents: 2000, // S/ 20
          occurredOn: '2026-10-07',
          categoryId: 'cat-transport',
        },
        // Un ingreso no debe mezclarse en la distribución de gastos
        {
          id: 'tx-inc',
          type: 'income',
          amountCents: 50000,
          occurredOn: '2026-10-01',
          categoryId: 'cat-income',
        },
      ];

      const dist = analyzeCategoryDistribution(txs, CATEGORIES_MAP);
      expect(dist).toHaveLength(2);

      // Alimentación: 8000 de 10000 (80%), 2 compras, promedio 4000
      expect(dist[0].categoryId).toBe('cat-food');
      expect(dist[0].categoryName).toBe('Alimentación');
      expect(dist[0].totalCents).toBe(8000);
      expect(dist[0].transactionCount).toBe(2);
      expect(dist[0].percentageOfTotal).toBe(80);
      expect(dist[0].averageTicketCents).toBe(4000);

      // Transporte: 2000 de 10000 (20%), 1 compra
      expect(dist[1].categoryId).toBe('cat-transport');
      expect(dist[1].totalCents).toBe(2000);
      expect(dist[1].percentageOfTotal).toBe(20);
    });

    it('retorna arreglo vacío cuando no hay transacciones de gasto', () => {
      expect(analyzeCategoryDistribution([], CATEGORIES_MAP)).toEqual([]);
    });
  });

  describe('2. analyzeMonthlyComparison', () => {
    it('calcula variación intermensual global y por categoría (mes actual vs. mes anterior)', () => {
      const prevMonth: AnalyticsTransactionInput[] = [
        {
          id: 'p-1',
          type: 'expense',
          amountCents: 10000, // S/ 100.00 en Alimentación
          occurredOn: '2026-09-10',
          categoryId: 'cat-food',
        },
        {
          id: 'p-2',
          type: 'expense',
          amountCents: 5000, // S/ 50.00 en Transporte
          occurredOn: '2026-09-15',
          categoryId: 'cat-transport',
        },
      ];

      const currentMonth: AnalyticsTransactionInput[] = [
        {
          id: 'c-1',
          type: 'expense',
          amountCents: 14000, // S/ 140.00 en Alimentación (+40%)
          occurredOn: '2026-10-10',
          categoryId: 'cat-food',
        },
        {
          id: 'c-2',
          type: 'expense',
          amountCents: 4000, // S/ 40.00 en Transporte (-20%)
          occurredOn: '2026-10-15',
          categoryId: 'cat-transport',
        },
      ];

      const comparison = analyzeMonthlyComparison(currentMonth, prevMonth, CATEGORIES_MAP);

      expect(comparison.hasPreviousMonthData).toBe(true);
      expect(comparison.previousMonthCents).toBe(15000);
      expect(comparison.currentMonthCents).toBe(18000);
      expect(comparison.deltaCents).toBe(3000);
      expect(comparison.deltaPercentage).toBe(20); // +20% global
      expect(comparison.trend).toBe('up');

      const foodDelta = comparison.categoryDeltas.find((d) => d.categoryId === 'cat-food')!;
      expect(foodDelta.deltaCents).toBe(4000);
      expect(foodDelta.deltaPercentage).toBe(40);
      expect(foodDelta.trend).toBe('up');

      const transportDelta = comparison.categoryDeltas.find(
        (d) => d.categoryId === 'cat-transport'
      )!;
      expect(transportDelta.deltaCents).toBe(-1000);
      expect(transportDelta.deltaPercentage).toBe(-20);
      expect(transportDelta.trend).toBe('down');
    });

    it('marca hasPreviousMonthData=false cuando el mes anterior no tiene gastos', () => {
      const currentMonth: AnalyticsTransactionInput[] = [
        {
          id: 'c-1',
          type: 'expense',
          amountCents: 5000,
          occurredOn: '2026-10-10',
          categoryId: 'cat-food',
        },
      ];
      const comparison = analyzeMonthlyComparison(currentMonth, [], CATEGORIES_MAP);
      expect(comparison.hasPreviousMonthData).toBe(false);
      expect(comparison.currentMonthCents).toBe(5000);
      expect(comparison.previousMonthCents).toBe(0);
    });
  });

  describe('3. detectAntExpenses (Gastos Hormiga)', () => {
    it('detecta patrón de gastos hormiga cuando hay >= 3 compras <= S/ 20.00 y calcula su impacto', () => {
      const txs: AnalyticsTransactionInput[] = [
        {
          id: 'ant-1',
          type: 'expense',
          amountCents: 800, // S/ 8.00
          occurredOn: '2026-10-02',
          categoryId: 'cat-food',
          merchantName: 'Tambo+',
        },
        {
          id: 'ant-2',
          type: 'expense',
          amountCents: 1200, // S/ 12.00
          occurredOn: '2026-10-03',
          categoryId: 'cat-food',
          merchantName: 'Tambo+',
        },
        {
          id: 'ant-3',
          type: 'expense',
          amountCents: 500, // S/ 5.00
          occurredOn: '2026-10-04',
          categoryId: 'cat-transport',
          note: 'Taxi corto',
        },
        {
          id: 'big-1',
          type: 'expense',
          amountCents: 7500, // S/ 75.00 (no es hormiga)
          occurredOn: '2026-10-05',
          categoryId: 'cat-fun',
        },
      ];

      const ant = detectAntExpenses(txs, CATEGORIES_MAP);

      expect(ant.detected).toBe(true);
      expect(ant.occurrenceCount).toBe(3);
      expect(ant.totalAntCents).toBe(2500); // S/ 25.00
      expect(ant.percentageOfMonthlySpend).toBe(25); // 2500 / 10000
      expect(ant.topCategoryId).toBe('cat-food');
      expect(ant.topCategoryName).toBe('Alimentación');
      expect(ant.topConcept).toBe('Tambo+');
    });

    it('no activa alerta de patrón hormiga si hay menos de 3 micro-compras', () => {
      const txs: AnalyticsTransactionInput[] = [
        {
          id: 'ant-1',
          type: 'expense',
          amountCents: 1000,
          occurredOn: '2026-10-02',
          categoryId: 'cat-food',
        },
        {
          id: 'ant-2',
          type: 'expense',
          amountCents: 1500,
          occurredOn: '2026-10-03',
          categoryId: 'cat-food',
        },
      ];

      const ant = detectAntExpenses(txs, CATEGORIES_MAP);
      expect(ant.detected).toBe(false);
      expect(ant.occurrenceCount).toBe(2);
      expect(ant.totalAntCents).toBe(2500);
    });
  });

  describe('4. analyzeTemporalPatterns (Día Pico de la Semana)', () => {
    it('identifica el día de la semana con mayor volumen de gasto sin desfase UTC', () => {
      // 2026-10-16 es Viernes, 2026-10-12 es Lunes
      const txs: AnalyticsTransactionInput[] = [
        {
          id: 't-mon',
          type: 'expense',
          amountCents: 2000,
          occurredOn: '2026-10-12', // Lunes
          categoryId: 'cat-food',
        },
        {
          id: 't-fri-1',
          type: 'expense',
          amountCents: 5000,
          occurredOn: '2026-10-16', // Viernes
          categoryId: 'cat-fun',
        },
        {
          id: 't-fri-2',
          type: 'expense',
          amountCents: 3000,
          occurredOn: '2026-10-23', // Viernes
          categoryId: 'cat-food',
        },
      ];

      const { weekdayBreakdown, peakDay } = analyzeTemporalPatterns(txs);

      expect(weekdayBreakdown).toHaveLength(7);
      expect(peakDay).not.toBeNull();
      expect(peakDay?.dayName).toBe('Viernes');
      expect(peakDay?.totalCents).toBe(8000);
      expect(peakDay?.transactionCount).toBe(2);
      expect(peakDay?.percentageOfTotal).toBe(80);
    });
  });

  describe('5. buildConsumptionPatterns (Orquestador)', () => {
    it('integra todos los indicadores de RF-012 en un único resultado consistente', () => {
      const currentTxs: AnalyticsTransactionInput[] = [
        {
          id: '1',
          type: 'expense',
          amountCents: 1200,
          occurredOn: '2026-10-16',
          categoryId: 'cat-food',
          merchantName: 'Cafetería UNSA',
        },
        {
          id: '2',
          type: 'expense',
          amountCents: 1500,
          occurredOn: '2026-10-17',
          categoryId: 'cat-food',
          merchantName: 'Cafetería UNSA',
        },
        {
          id: '3',
          type: 'expense',
          amountCents: 1300,
          occurredOn: '2026-10-18',
          categoryId: 'cat-food',
          merchantName: 'Cafetería UNSA',
        },
      ];

      const result = buildConsumptionPatterns({
        currentMonthTransactions: currentTxs,
        previousMonthTransactions: [],
        categories: TEST_CATEGORIES,
      });

      expect(result.totalExpenseCents).toBe(4000);
      expect(result.expenseTransactionsCount).toBe(3);
      expect(result.antExpenses.detected).toBe(true);
      expect(result.categoryPatterns[0].categoryName).toBe('Alimentación');
      expect(result.peakDay).not.toBeNull();
    });
  });
});
