import {
  createBudgetSchema,
  updateBudgetSchema,
  calculatePeriodRange,
  toBudgetValidationError,
} from '../types';
import { BudgetError } from '../errors';

describe('createBudgetSchema', () => {
  const validPayload = {
    categoryId: 'cat-uuid-1',
    amountCents: 15000,
    periodType: 'monthly' as const,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  };

  it('acepta datos válidos de presupuesto', () => {
    const result = createBudgetSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rechaza montos menores o iguales a cero (RNF-009)', () => {
    const zeroAmount = createBudgetSchema.safeParse({ ...validPayload, amountCents: 0 });
    expect(zeroAmount.success).toBe(false);

    const negativeAmount = createBudgetSchema.safeParse({ ...validPayload, amountCents: -5000 });
    expect(negativeAmount.success).toBe(false);
  });

  it('rechaza montos con decimales (deben ser céntimos enteros)', () => {
    const floatAmount = createBudgetSchema.safeParse({ ...validPayload, amountCents: 150.5 });
    expect(floatAmount.success).toBe(false);
  });

  it('rechaza categoría vacía', () => {
    const emptyCat = createBudgetSchema.safeParse({ ...validPayload, categoryId: '   ' });
    expect(emptyCat.success).toBe(false);
  });

  it('rechaza tipos de periodo no admitidos', () => {
    const invalidPeriod = createBudgetSchema.safeParse({
      ...validPayload,
      periodType: 'yearly' as any,
    });
    expect(invalidPeriod.success).toBe(false);
  });

  it('rechaza formatos de fecha que no sigan YYYY-MM-DD', () => {
    const invalidDate = createBudgetSchema.safeParse({
      ...validPayload,
      periodStart: '01/10/2026',
    });
    expect(invalidDate.success).toBe(false);
  });

  it('rechaza periodEnd anterior a periodStart', () => {
    const invertedDates = createBudgetSchema.safeParse({
      ...validPayload,
      periodStart: '2026-10-31',
      periodEnd: '2026-10-01',
    });
    expect(invertedDates.success).toBe(false);
  });
});

describe('updateBudgetSchema', () => {
  it('valida actualización con monto positivo', () => {
    expect(updateBudgetSchema.safeParse({ amountCents: 20000 }).success).toBe(true);
  });

  it('rechaza actualización con monto <= 0', () => {
    expect(updateBudgetSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(updateBudgetSchema.safeParse({ amountCents: -100 }).success).toBe(false);
  });
});

describe('calculatePeriodRange', () => {
  it('calcula rango mensual exacto (primer y último día del mes)', () => {
    const range = calculatePeriodRange('monthly', '2026-10-15');
    expect(range.periodStart).toBe('2026-10-01');
    expect(range.periodEnd).toBe('2026-10-31');
  });

  it('calcula primera quincena (1 al 15)', () => {
    const range = calculatePeriodRange('biweekly', '2026-10-08');
    expect(range.periodStart).toBe('2026-10-01');
    expect(range.periodEnd).toBe('2026-10-15');
  });

  it('calcula segunda quincena (16 al fin de mes)', () => {
    const range = calculatePeriodRange('biweekly', '2026-10-20');
    expect(range.periodStart).toBe('2026-10-16');
    expect(range.periodEnd).toBe('2026-10-31');
  });

  it('calcula semana de Lunes a Domingo', () => {
    // 2026-10-28 es Miércoles
    const range = calculatePeriodRange('weekly', '2026-10-28');
    expect(range.periodStart).toBe('2026-10-26'); // Lunes
    expect(range.periodEnd).toBe('2026-11-01'); // Domingo
  });
});

describe('toBudgetValidationError', () => {
  it('convierte un error de Zod a BudgetError con código VALIDATION', () => {
    const result = createBudgetSchema.safeParse({ categoryId: '', amountCents: 0 });
    if (!result.success) {
      const err = toBudgetValidationError(result.error);
      expect(err).toBeInstanceOf(BudgetError);
      expect(err.code).toBe('VALIDATION');
      expect(err.message).toBeDefined();
    }
  });
});
