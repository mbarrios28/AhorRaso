import * as Crypto from 'expo-crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import {
  db,
  savingsGoals,
  SavingsGoal,
  enqueueOutbox,
  centsToPostgresAmount,
} from '@/core/db';
import {
  CreateSavingsGoalInput,
  ParsedCreateSavingsGoal,
  createSavingsGoalSchema,
  UpdateSavingsGoalProgressInput,
  updateSavingsGoalProgressSchema,
  SavingsGoalWithSimulation,
  toSavingsValidationError,
} from '../domain/types';
import { calculateSavingsSimulation } from '../domain/simulation';
import { SavingsGoalError, SAVINGS_GOAL_ERROR_MESSAGES } from '../domain/errors';

/**
 * Prepara el payload con convención Postgres snake_case y montos decimales
 * para sincronización en la nube vía outbox.
 */
function savingsGoalToOutboxPayload(goal: SavingsGoal): Record<string, any> {
  return {
    id: goal.id,
    user_id: goal.userId,
    name: goal.name,
    target_amount: centsToPostgresAmount(goal.targetAmountCents),
    current_amount: centsToPostgresAmount(goal.currentAmountCents),
    periodic_savings: centsToPostgresAmount(goal.periodicSavingsCents),
    frequency: goal.frequency,
    target_date: goal.targetDate,
    status: goal.status,
    created_at: goal.createdAt,
    updated_at: goal.updatedAt,
    deleted_at: goal.deletedAt,
  };
}

/**
 * Enriquece un registro de base de datos con los cálculos reactivos de simulación (RF-014).
 */
function enrichWithSimulation(goal: SavingsGoal): SavingsGoalWithSimulation {
  const simulation = calculateSavingsSimulation({
    targetAmountCents: goal.targetAmountCents,
    currentAmountCents: goal.currentAmountCents,
    periodicSavingsCents: goal.periodicSavingsCents,
    frequency: goal.frequency,
    startDate: goal.createdAt,
  });

  return {
    ...goal,
    simulation,
  };
}

/**
 * Repositorio de Metas de Ahorro y Simulación (HU-08 / RF-007 / RF-014).
 * Maneja persistencia local en SQLite con Drizzle ORM y registro outbox local-first.
 */
export const savingsRepository = {
  /**
   * Crea una nueva meta de ahorro con simulación inicial de proyección.
   */
  create(userId: string, input: CreateSavingsGoalInput): SavingsGoalWithSimulation {
    let validated: ParsedCreateSavingsGoal;
    try {
      validated = createSavingsGoalSchema.parse(input);
    } catch (error) {
      throw toSavingsValidationError(error);
    }

    const simulation = calculateSavingsSimulation({
      targetAmountCents: validated.targetAmountCents,
      currentAmountCents: validated.currentAmountCents,
      periodicSavingsCents: validated.periodicSavingsCents,
      frequency: validated.frequency,
    });

    const goalId = Crypto.randomUUID();
    const now = new Date().toISOString();
    const targetDate = validated.targetDate || simulation.estimatedDate;
    const initialStatus = simulation.isCompleted ? 'completed' : 'active';

    const newGoal: SavingsGoal = {
      id: goalId,
      userId,
      name: validated.name,
      targetAmountCents: validated.targetAmountCents,
      currentAmountCents: validated.currentAmountCents ?? 0,
      periodicSavingsCents: validated.periodicSavingsCents,
      frequency: validated.frequency,
      targetDate,
      status: initialStatus,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    db.transaction((tx) => {
      tx.insert(savingsGoals).values(newGoal).run();
      enqueueOutbox({
        entity: 'savings_goals',
        entityId: goalId,
        op: 'upsert',
        payload: savingsGoalToOutboxPayload(newGoal),
      });
    });

    return enrichWithSimulation(newGoal);
  },

  /**
   * Obtiene una meta de ahorro por su ID y usuario.
   */
  getById(userId: string, goalId: string): SavingsGoalWithSimulation | null {
    const row = db
      .select()
      .from(savingsGoals)
      .where(
        and(
          eq(savingsGoals.id, goalId),
          eq(savingsGoals.userId, userId),
          isNull(savingsGoals.deletedAt)
        )
      )
      .get();

    return row ? enrichWithSimulation(row) : null;
  },

  /**
   * Lista todas las metas activas del usuario ordenadas cronológicamente.
   */
  listActive(userId: string): SavingsGoalWithSimulation[] {
    const rows = db
      .select()
      .from(savingsGoals)
      .where(
        and(
          eq(savingsGoals.userId, userId),
          eq(savingsGoals.status, 'active'),
          isNull(savingsGoals.deletedAt)
        )
      )
      .orderBy(desc(savingsGoals.createdAt))
      .all();

    return rows.map(enrichWithSimulation);
  },

  /**
   * Actualiza el progreso de una meta sumando un abono de ahorro (RF-007).
   * Si el monto acumulado alcanza o supera el objetivo, marca el estado como 'completed'.
   */
  updateProgress(
    userId: string,
    goalId: string,
    input: UpdateSavingsGoalProgressInput
  ): SavingsGoalWithSimulation {
    let validated: UpdateSavingsGoalProgressInput;
    try {
      validated = updateSavingsGoalProgressSchema.parse(input);
    } catch (error) {
      throw toSavingsValidationError(error);
    }

    const existing = this.getById(userId, goalId);
    if (!existing) {
      throw new SavingsGoalError('NOT_FOUND', SAVINGS_GOAL_ERROR_MESSAGES.NOT_FOUND);
    }

    if (existing.status === 'completed') {
      throw new SavingsGoalError(
        'GOAL_ALREADY_COMPLETED',
        SAVINGS_GOAL_ERROR_MESSAGES.GOAL_ALREADY_COMPLETED
      );
    }

    const updatedCurrentAmount = existing.currentAmountCents + validated.addAmountCents;
    const isNowCompleted = updatedCurrentAmount >= existing.targetAmountCents;
    const newStatus = isNowCompleted ? 'completed' : existing.status;
    const now = new Date().toISOString();

    const updatedGoal: SavingsGoal = {
      ...existing,
      currentAmountCents: updatedCurrentAmount,
      status: newStatus,
      updatedAt: now,
    };

    db.transaction((tx) => {
      tx.update(savingsGoals)
        .set({
          currentAmountCents: updatedCurrentAmount,
          status: newStatus,
          updatedAt: now,
        })
        .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId)))
        .run();

      enqueueOutbox({
        entity: 'savings_goals',
        entityId: goalId,
        op: 'upsert',
        payload: savingsGoalToOutboxPayload(updatedGoal),
      });
    });

    return enrichWithSimulation(updatedGoal);
  },

  /**
   * Elimina una meta de ahorro (Soft-delete) y encola la mutación en outbox.
   */
  delete(userId: string, goalId: string): void {
    const existing = this.getById(userId, goalId);
    if (!existing) {
      throw new SavingsGoalError('NOT_FOUND', SAVINGS_GOAL_ERROR_MESSAGES.NOT_FOUND);
    }

    const now = new Date().toISOString();
    const softDeleted: SavingsGoal = {
      ...existing,
      deletedAt: now,
      updatedAt: now,
    };

    db.transaction((tx) => {
      tx.update(savingsGoals)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId)))
        .run();

      enqueueOutbox({
        entity: 'savings_goals',
        entityId: goalId,
        op: 'delete',
        payload: savingsGoalToOutboxPayload(softDeleted),
      });
    });
  },
};
