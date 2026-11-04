import {
  calculateSavingsSimulation,
  formatSimulationPeriodLabel,
  formatDateToYMD,
} from '../simulation';

describe('calculateSavingsSimulation (HU-08 / RF-014)', () => {
  const baseDate = new Date(2026, 0, 1); // 2026-01-01

  describe('Proyección semanal (weekly)', () => {
    it('calcula los periodos exactos y la fecha estimada', () => {
      // Meta S/ 400.00, cuota S/ 100.00 semanal
      const result = calculateSavingsSimulation({
        targetAmountCents: 40000,
        currentAmountCents: 0,
        periodicSavingsCents: 10000,
        frequency: 'weekly',
        startDate: baseDate,
      });

      expect(result.periodsNeeded).toBe(4);
      expect(result.remainingAmountCents).toBe(40000);
      expect(result.progressPercentage).toBe(0);
      expect(result.isCompleted).toBe(false);
      // 2026-01-01 + 28 días = 2026-01-29
      expect(result.estimatedDate).toBe('2026-01-29');
    });

    it('redondea hacia arriba cuando el saldo restante no es múltiplo exacto de la cuota', () => {
      // Meta S/ 250.00, acumulado S/ 50.00, resta S/ 200.00, cuota S/ 60.00 -> ceil(200 / 60) = 4
      const result = calculateSavingsSimulation({
        targetAmountCents: 25000,
        currentAmountCents: 5000,
        periodicSavingsCents: 6000,
        frequency: 'weekly',
        startDate: baseDate,
      });

      expect(result.periodsNeeded).toBe(4);
      expect(result.remainingAmountCents).toBe(20000);
      expect(result.progressPercentage).toBe(20);
      expect(result.estimatedDate).toBe('2026-01-29');
    });
  });

  describe('Proyección quincenal (biweekly)', () => {
    it('calcula los periodos quincenales (14 días por periodo)', () => {
      // Meta S/ 300.00, cuota S/ 100.00 quincenal -> 3 periodos = 42 días
      const result = calculateSavingsSimulation({
        targetAmountCents: 30000,
        currentAmountCents: 0,
        periodicSavingsCents: 10000,
        frequency: 'biweekly',
        startDate: baseDate,
      });

      expect(result.periodsNeeded).toBe(3);
      expect(result.remainingAmountCents).toBe(30000);
      // 2026-01-01 + 42 días = 2026-02-12
      expect(result.estimatedDate).toBe('2026-02-12');
    });
  });

  describe('Proyección mensual (monthly)', () => {
    it('calcula los meses de proyección respetando calendarios', () => {
      // Meta S/ 600.00, cuota S/ 100.00 mensual -> 6 meses
      const result = calculateSavingsSimulation({
        targetAmountCents: 60000,
        currentAmountCents: 0,
        periodicSavingsCents: 10000,
        frequency: 'monthly',
        startDate: baseDate,
      });

      expect(result.periodsNeeded).toBe(6);
      expect(result.remainingAmountCents).toBe(60000);
      // 2026-01-01 + 6 meses = 2026-07-01
      expect(result.estimatedDate).toBe('2026-07-01');
    });

    it('ajusta los días al último día del mes en meses más cortos (ej. 31 de enero)', () => {
      const jan31 = new Date(2026, 0, 31); // 2026-01-31
      // 1 mes desde 31 de enero -> febrero 2026 (28 días)
      const result = calculateSavingsSimulation({
        targetAmountCents: 20000,
        currentAmountCents: 0,
        periodicSavingsCents: 20000,
        frequency: 'monthly',
        startDate: jan31,
      });

      expect(result.periodsNeeded).toBe(1);
      expect(result.estimatedDate).toBe('2026-02-28');
    });
  });

  describe('Casos límite y metas completadas', () => {
    it('retorna 0 periodos y 100% cuando la meta ya fue alcanzada o superada', () => {
      const result = calculateSavingsSimulation({
        targetAmountCents: 50000,
        currentAmountCents: 55000,
        periodicSavingsCents: 5000,
        frequency: 'weekly',
        startDate: baseDate,
      });

      expect(result.periodsNeeded).toBe(0);
      expect(result.remainingAmountCents).toBe(0);
      expect(result.progressPercentage).toBe(100);
      expect(result.isCompleted).toBe(true);
      expect(result.estimatedDate).toBe(formatDateToYMD(baseDate));
    });

    it('maneja de forma segura cuota periódica igual a 0', () => {
      const result = calculateSavingsSimulation({
        targetAmountCents: 50000,
        currentAmountCents: 10000,
        periodicSavingsCents: 0,
        frequency: 'weekly',
        startDate: baseDate,
      });

      expect(result.periodsNeeded).toBe(0);
      expect(result.remainingAmountCents).toBe(40000);
      expect(result.isCompleted).toBe(false);
    });
  });

  describe('formatSimulationPeriodLabel', () => {
    it('formatea singular y plural correctamente para cada frecuencia', () => {
      expect(formatSimulationPeriodLabel(0, 'weekly')).toBe('Meta alcanzada');
      expect(formatSimulationPeriodLabel(1, 'weekly')).toBe('1 semana');
      expect(formatSimulationPeriodLabel(3, 'weekly')).toBe('3 semanas');

      expect(formatSimulationPeriodLabel(1, 'biweekly')).toBe('1 quincena');
      expect(formatSimulationPeriodLabel(4, 'biweekly')).toBe('4 quincenas');

      expect(formatSimulationPeriodLabel(1, 'monthly')).toBe('1 mes');
      expect(formatSimulationPeriodLabel(6, 'monthly')).toBe('6 meses');
    });
  });
});
