import {
  createSavingsGoalSchema,
  updateSavingsGoalProgressSchema,
  toSavingsValidationError,
} from '../types';
import { SavingsGoalError } from '../errors';

describe('Savings Domain Schemas (HU-08 / RF-007)', () => {
  describe('createSavingsGoalSchema', () => {
    it('valida exitosamente un input correcto', () => {
      const valid = {
        name: 'Fondo de Emergencia',
        targetAmountCents: 150000,
        currentAmountCents: 20000,
        periodicSavingsCents: 10000,
        frequency: 'monthly' as const,
      };

      const result = createSavingsGoalSchema.parse(valid);
      expect(result.name).toBe('Fondo de Emergencia');
      expect(result.targetAmountCents).toBe(150000);
      expect(result.currentAmountCents).toBe(20000);
      expect(result.periodicSavingsCents).toBe(10000);
      expect(result.frequency).toBe('monthly');
    });

    it('aplica default 0 en currentAmountCents si se omite', () => {
      const input = {
        name: 'Viaje a Cusco',
        targetAmountCents: 80000,
        periodicSavingsCents: 5000,
        frequency: 'weekly' as const,
      };

      const result = createSavingsGoalSchema.parse(input);
      expect(result.currentAmountCents).toBe(0);
    });

    it('falla si el nombre está vacío', () => {
      const invalid = {
        name: '   ',
        targetAmountCents: 50000,
        periodicSavingsCents: 5000,
        frequency: 'weekly' as const,
      };

      expect(() => createSavingsGoalSchema.parse(invalid)).toThrow();
    });

    it('falla si el monto objetivo es menor o igual a 0', () => {
      expect(() =>
        createSavingsGoalSchema.parse({
          name: 'Laptop',
          targetAmountCents: 0,
          periodicSavingsCents: 5000,
          frequency: 'biweekly' as const,
        })
      ).toThrow();

      expect(() =>
        createSavingsGoalSchema.parse({
          name: 'Laptop',
          targetAmountCents: -100,
          periodicSavingsCents: 5000,
          frequency: 'biweekly' as const,
        })
      ).toThrow();
    });

    it('falla si el ahorro periódico es menor o igual a 0', () => {
      expect(() =>
        createSavingsGoalSchema.parse({
          name: 'Laptop',
          targetAmountCents: 100000,
          periodicSavingsCents: 0,
          frequency: 'biweekly' as const,
        })
      ).toThrow();
    });

    it('falla si la frecuencia no es admitida', () => {
      expect(() =>
        createSavingsGoalSchema.parse({
          name: 'Laptop',
          targetAmountCents: 100000,
          periodicSavingsCents: 5000,
          frequency: 'yearly' as any,
        })
      ).toThrow();
    });
  });

  describe('updateSavingsGoalProgressSchema', () => {
    it('valida abonos positivos', () => {
      const valid = { addAmountCents: 5000 };
      expect(updateSavingsGoalProgressSchema.parse(valid)).toEqual(valid);
    });

    it('rechaza abonos de 0 o negativos', () => {
      expect(() => updateSavingsGoalProgressSchema.parse({ addAmountCents: 0 })).toThrow();
      expect(() => updateSavingsGoalProgressSchema.parse({ addAmountCents: -500 })).toThrow();
    });
  });

  describe('toSavingsValidationError', () => {
    it('convierte un error de Zod a SavingsGoalError con código VALIDATION', () => {
      try {
        createSavingsGoalSchema.parse({ name: '' });
      } catch (err) {
        const domainErr = toSavingsValidationError(err);
        expect(domainErr).toBeInstanceOf(SavingsGoalError);
        expect(domainErr.code).toBe('VALIDATION');
        expect(domainErr.message).toBeTruthy();
      }
    });
  });
});
