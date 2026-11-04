import { DEV_USER_ID } from '@/core/dev/constants';
import {
  resetDatabase,
  getOutboxEntries,
  OTHER_USER_ID,
} from '../../../../../test/helpers/test-db';
import { savingsRepository } from '../savings.repository';
import { SavingsGoalError } from '../../domain/errors';

beforeEach(() => {
  resetDatabase();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('savingsRepository (HU-08 / RF-007 / RF-014)', () => {
  describe('create', () => {
    it('crea exitosamente una meta de ahorro con simulación y registra en Outbox', () => {
      const created = savingsRepository.create(DEV_USER_ID, {
        name: 'Fondo de Emergencia',
        targetAmountCents: 50000, // S/ 500.00
        currentAmountCents: 10000, // S/ 100.00
        periodicSavingsCents: 10000, // S/ 100.00
        frequency: 'monthly',
      });

      expect(created.id).toBeDefined();
      expect(created.userId).toBe(DEV_USER_ID);
      expect(created.name).toBe('Fondo de Emergencia');
      expect(created.targetAmountCents).toBe(50000);
      expect(created.currentAmountCents).toBe(10000);
      expect(created.periodicSavingsCents).toBe(10000);
      expect(created.frequency).toBe('monthly');
      expect(created.status).toBe('active');
      expect(created.deletedAt).toBeNull();

      // Validación de simulación reactiva integrada
      expect(created.simulation).toBeDefined();
      expect(created.simulation.periodsNeeded).toBe(4);
      expect(created.simulation.remainingAmountCents).toBe(40000);
      expect(created.simulation.progressPercentage).toBe(20);

      // Comprobar persistencia
      const inDb = savingsRepository.getById(DEV_USER_ID, created.id);
      expect(inDb).not.toBeNull();
      expect(inDb?.name).toBe('Fondo de Emergencia');

      // Comprobar Outbox
      const outbox = getOutboxEntries('savings_goals' as any, 'upsert');
      expect(outbox).toHaveLength(1);
      expect(outbox[0].entityId).toBe(created.id);

      const payload = JSON.parse(outbox[0].payload);
      expect(payload.user_id).toBe(DEV_USER_ID);
      expect(payload.name).toBe('Fondo de Emergencia');
      expect(payload.target_amount).toBe('500.00');
      expect(payload.current_amount).toBe('100.00');
      expect(payload.periodic_savings).toBe('100.00');
      expect(payload.frequency).toBe('monthly');
      expect(payload.status).toBe('active');
    });

    it('falla con montos inválidos lanzando SavingsGoalError', () => {
      expect(() =>
        savingsRepository.create(DEV_USER_ID, {
          name: 'Meta Inválida',
          targetAmountCents: 0,
          periodicSavingsCents: 1000,
          frequency: 'weekly',
        })
      ).toThrow(SavingsGoalError);
    });
  });

  describe('listActive y getById', () => {
    it('lista únicamente las metas activas y no eliminadas del usuario', () => {
      const g1 = savingsRepository.create(DEV_USER_ID, {
        name: 'Meta 1',
        targetAmountCents: 30000,
        periodicSavingsCents: 5000,
        frequency: 'weekly',
      });

      const g2 = savingsRepository.create(DEV_USER_ID, {
        name: 'Meta 2',
        targetAmountCents: 40000,
        periodicSavingsCents: 10000,
        frequency: 'biweekly',
      });

      // Crear meta para otro usuario
      savingsRepository.create(OTHER_USER_ID, {
        name: 'Meta Otro',
        targetAmountCents: 20000,
        periodicSavingsCents: 5000,
        frequency: 'weekly',
      });

      const activeList = savingsRepository.listActive(DEV_USER_ID);
      expect(activeList).toHaveLength(2);
      expect(activeList.map((g) => g.id)).toContain(g1.id);
      expect(activeList.map((g) => g.id)).toContain(g2.id);

      // Eliminar una meta y verificar que ya no figure en listActive
      savingsRepository.delete(DEV_USER_ID, g1.id);
      const updatedList = savingsRepository.listActive(DEV_USER_ID);
      expect(updatedList).toHaveLength(1);
      expect(updatedList[0].id).toBe(g2.id);
    });
  });

  describe('updateProgress', () => {
    it('incrementa el ahorro acumulado y recalcula la simulación', () => {
      const goal = savingsRepository.create(DEV_USER_ID, {
        name: 'Ahorro vacaciones',
        targetAmountCents: 100000, // S/ 1000.00
        currentAmountCents: 20000,  // S/ 200.00
        periodicSavingsCents: 20000, // S/ 200.00
        frequency: 'monthly',
      });

      expect(goal.simulation.periodsNeeded).toBe(4);

      // Abonar S/ 200.00
      const updated = savingsRepository.updateProgress(DEV_USER_ID, goal.id, {
        addAmountCents: 20000,
      });

      expect(updated.currentAmountCents).toBe(40000);
      expect(updated.status).toBe('active');
      expect(updated.simulation.periodsNeeded).toBe(3);
      expect(updated.simulation.remainingAmountCents).toBe(60000);
      expect(updated.simulation.progressPercentage).toBe(40);
    });

    it('marca la meta como "completed" cuando el acumulado alcanza o supera el objetivo', () => {
      const goal = savingsRepository.create(DEV_USER_ID, {
        name: 'Bicicleta',
        targetAmountCents: 50000,
        currentAmountCents: 40000,
        periodicSavingsCents: 10000,
        frequency: 'weekly',
      });

      const updated = savingsRepository.updateProgress(DEV_USER_ID, goal.id, {
        addAmountCents: 15000, // Supera por 5000
      });

      expect(updated.currentAmountCents).toBe(55000);
      expect(updated.status).toBe('completed');
      expect(updated.simulation.isCompleted).toBe(true);
      expect(updated.simulation.periodsNeeded).toBe(0);
      expect(updated.simulation.progressPercentage).toBe(100);

      // No debe figurar en listActive
      const activeList = savingsRepository.listActive(DEV_USER_ID);
      expect(activeList.some((g) => g.id === goal.id)).toBe(false);
    });

    it('falla si se intenta abonar a una meta ya completada', () => {
      const goal = savingsRepository.create(DEV_USER_ID, {
        name: 'Curso',
        targetAmountCents: 10000,
        currentAmountCents: 10000,
        periodicSavingsCents: 5000,
        frequency: 'weekly',
      });

      expect(goal.status).toBe('completed');

      expect(() =>
        savingsRepository.updateProgress(DEV_USER_ID, goal.id, {
          addAmountCents: 2000,
        })
      ).toThrow(SavingsGoalError);
    });
  });

  describe('delete', () => {
    it('aplica soft-delete y registra en Outbox con op delete', () => {
      const goal = savingsRepository.create(DEV_USER_ID, {
        name: 'Meta a borrar',
        targetAmountCents: 50000,
        periodicSavingsCents: 10000,
        frequency: 'monthly',
      });

      savingsRepository.delete(DEV_USER_ID, goal.id);

      expect(savingsRepository.getById(DEV_USER_ID, goal.id)).toBeNull();

      const outboxEntries = getOutboxEntries('savings_goals' as any, 'delete');
      expect(outboxEntries).toHaveLength(1);
      expect(outboxEntries[0].entityId).toBe(goal.id);
    });

    it('falla con NOT_FOUND si la meta no existe o ya está eliminada', () => {
      expect(() =>
        savingsRepository.delete(DEV_USER_ID, 'non-existent-uuid')
      ).toThrow(SavingsGoalError);
    });
  });
});
