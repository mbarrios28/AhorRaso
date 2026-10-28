import * as Crypto from 'expo-crypto';
import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  db,
  budgets,
  categories,
  transactions,
  Budget,
  Category,
  enqueueOutbox,
  centsToPostgresAmount,
  sqliteDb,
} from '@/core/db';
import {
  CreateBudgetInput,
  createBudgetSchema,
  UpdateBudgetInput,
  updateBudgetSchema,
  toBudgetValidationError,
  BudgetPeriod,
  BudgetWithCategory,
  calculatePeriodRange,
} from '../domain/types';
import { BudgetError, BUDGET_ERROR_MESSAGES } from '../domain/errors';

/**
 * Prepara el payload con convención Postgres snake_case y montos decimales
 * para sincronización en la nube vía outbox.
 */
function budgetToOutboxPayload(budget: Budget): Record<string, any> {
  return {
    id: budget.id,
    user_id: budget.userId,
    category_id: budget.categoryId,
    amount: centsToPostgresAmount(budget.amountCents),
    period_type: budget.periodType,
    period_start: budget.periodStart,
    period_end: budget.periodEnd,
    created_at: budget.createdAt,
    client_updated_at: budget.clientUpdatedAt,
    updated_at: budget.updatedAt,
    deleted_at: budget.deletedAt,
  };
}

/**
 * Repositorio de Presupuestos (RF-006 / RNF-009).
 * Maneja persistencia local en SQLite con Drizzle ORM y registro outbox local-first.
 */
export const budgetsRepository = {
  /**
   * Crea un nuevo presupuesto por categoría y periodo.
   *
   * Validaciones de Negocio y Confiabilidad (RNF-009):
   * 1. Validar esquema Zod (monto > 0, fechas válidas, periodo admitido).
   * 2. Verificar existencia, pertenencia y estado activo de la categoría.
   * 3. Verificar que la categoría sea estrictamente de tipo 'expense'.
   * 4. Prevenir registros duplicados en el mismo periodo para la categoría.
   * 5. Persistir en SQLite y encolar inmediatamente en outbox.
   */
  create(userId: string, input: CreateBudgetInput): Budget {
    // 1. Validación de Dominio con Zod
    let validated: CreateBudgetInput;
    try {
      validated = createBudgetSchema.parse(input);
    } catch (error) {
      throw toBudgetValidationError(error);
    }

    // 2. Validación de Integridad de la Categoría
    const category = db
      .select()
      .from(categories)
      .where(and(eq(categories.id, validated.categoryId), eq(categories.userId, userId)))
      .get();

    if (!category || category.deletedAt) {
      throw new BudgetError('CATEGORY_NOT_FOUND', BUDGET_ERROR_MESSAGES.CATEGORY_NOT_FOUND);
    }

    if (category.type !== 'expense') {
      throw new BudgetError(
        'CATEGORY_TYPE_MISMATCH',
        BUDGET_ERROR_MESSAGES.CATEGORY_TYPE_MISMATCH
      );
    }

    // 3. Control de Unicidad (RNF-009): evitar duplicados en el mismo periodo
    const existing = db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.categoryId, validated.categoryId),
          eq(budgets.periodStart, validated.periodStart),
          eq(budgets.periodType, validated.periodType),
          isNull(budgets.deletedAt)
        )
      )
      .get();

    if (existing) {
      throw new BudgetError('DUPLICATE_BUDGET', BUDGET_ERROR_MESSAGES.DUPLICATE_BUDGET);
    }

    const budgetId = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newBudget: Budget = {
      id: budgetId,
      userId,
      categoryId: validated.categoryId,
      amountCents: validated.amountCents,
      periodType: validated.periodType,
      periodStart: validated.periodStart,
      periodEnd: validated.periodEnd,
      createdAt: now,
      clientUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    };

    // 4. Inserción atómica y outbox
    try {
      db.transaction((tx) => {
        tx.insert(budgets).values(newBudget).run();
        enqueueOutbox({
          entity: 'budgets',
          entityId: budgetId,
          op: 'upsert',
          payload: budgetToOutboxPayload(newBudget),
        });
      });
    } catch (error: any) {
      // Manejo de violación de constraint UNIQUE a nivel de BD
      if (
        error?.message?.includes('UNIQUE') ||
        error?.message?.includes('idx_budgets_unique_period')
      ) {
        throw new BudgetError('DUPLICATE_BUDGET', BUDGET_ERROR_MESSAGES.DUPLICATE_BUDGET);
      }
      throw error;
    }

    return newBudget;
  },

  /**
   * Obtiene un presupuesto por su ID para el usuario.
   */
  getById(userId: string, budgetId: string): Budget | null {
    const row = db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId), isNull(budgets.deletedAt)))
      .get();
    return row ?? null;
  },

  /**
   * Obtiene el presupuesto activo para una categoría en un periodo específico.
   */
  getByCategoryAndPeriod(
    userId: string,
    categoryId: string,
    periodType: BudgetPeriod,
    periodStart: string
  ): Budget | null {
    const row = db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.categoryId, categoryId),
          eq(budgets.periodType, periodType),
          eq(budgets.periodStart, periodStart),
          isNull(budgets.deletedAt)
        )
      )
      .get();
    return row ?? null;
  },

  /**
   * Lista todos los presupuestos activos del usuario enriquecidos con su
   * categoría y el gasto acumulado en el periodo en curso (RF-006 / Filtrado Estricto).
   * Al comenzar un nuevo periodo, el cálculo se ajusta automáticamente y el gasto inicia en 0.
   */
  listActive(userId: string, refDate: Date | string = new Date()): BudgetWithCategory[] {
    const activeBudgets = db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)))
      .all();

    if (activeBudgets.length === 0) return [];

    // Cargar mapa de categorías para evitar N+1
    const userCategories = db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.deletedAt)))
      .all();
    const catMap = new Map<string, Category>(userCategories.map((c) => [c.id, c]));

    return activeBudgets.map((b) => {
      const cat = catMap.get(b.categoryId);

      // Calcular el rango del periodo en curso para el tipo de periodo (RF-006 / Filtrado Estricto)
      const currentPeriod = calculatePeriodRange(b.periodType, refDate);

      // Calcular el gasto acumulado estrictamente dentro del periodo activo
      const spentRow = sqliteDb.getFirstSync<{ total_spent: number }>(
        `SELECT coalesce(sum(amount_cents), 0) AS total_spent
         FROM transactions
         WHERE user_id = ?
           AND category_id = ?
           AND type = 'expense'
           AND occurred_on >= ?
           AND occurred_on <= ?
           AND deleted_at IS NULL`,
        [userId, b.categoryId, currentPeriod.periodStart, currentPeriod.periodEnd]
      );

      return {
        ...b,
        periodStart: currentPeriod.periodStart,
        periodEnd: currentPeriod.periodEnd,
        categoryName: cat?.name ?? 'Categoría',
        categoryIcon: cat?.icon ?? 'Tag',
        categoryColor: cat?.color ?? '#64748B',
        spentCents: spentRow?.total_spent ?? 0,
      };
    });
  },

  /**
   * Actualiza el monto y/o periodo de un presupuesto existente.
   */
  update(userId: string, budgetId: string, input: UpdateBudgetInput): Budget {
    let validated: UpdateBudgetInput;
    try {
      validated = updateBudgetSchema.parse(input);
    } catch (error) {
      throw toBudgetValidationError(error);
    }

    const existing = this.getById(userId, budgetId);
    if (!existing) {
      throw new BudgetError('NOT_FOUND', BUDGET_ERROR_MESSAGES.NOT_FOUND);
    }

    let periodType = existing.periodType;
    let periodStart = existing.periodStart;
    let periodEnd = existing.periodEnd;

    if (validated.periodType && validated.periodType !== existing.periodType) {
      periodType = validated.periodType;
      const range = calculatePeriodRange(periodType);
      periodStart = range.periodStart;
      periodEnd = range.periodEnd;

      // Verificar unicidad en el nuevo periodo
      const duplicate = db
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.userId, userId),
            eq(budgets.categoryId, existing.categoryId),
            eq(budgets.periodStart, periodStart),
            eq(budgets.periodType, periodType),
            isNull(budgets.deletedAt)
          )
        )
        .get();

      if (duplicate && duplicate.id !== budgetId) {
        throw new BudgetError('DUPLICATE_BUDGET', BUDGET_ERROR_MESSAGES.DUPLICATE_BUDGET);
      }
    }

    const now = new Date().toISOString();
    const updated: Budget = {
      ...existing,
      amountCents: validated.amountCents,
      periodType,
      periodStart,
      periodEnd,
      clientUpdatedAt: now,
    };

    db.transaction((tx) => {
      tx.update(budgets)
        .set({
          amountCents: validated.amountCents,
          periodType,
          periodStart,
          periodEnd,
          clientUpdatedAt: now,
        })
        .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)))
        .run();

      enqueueOutbox({
        entity: 'budgets',
        entityId: budgetId,
        op: 'upsert',
        payload: budgetToOutboxPayload(updated),
      });
    });

    return updated;
  },

  /**
   * Elimina un presupuesto (Soft-delete) y encola la mutación en outbox.
   */
  delete(userId: string, budgetId: string): void {
    const existing = this.getById(userId, budgetId);
    if (!existing) {
      throw new BudgetError('NOT_FOUND', BUDGET_ERROR_MESSAGES.NOT_FOUND);
    }

    const now = new Date().toISOString();
    const softDeleted: Budget = {
      ...existing,
      deletedAt: now,
      clientUpdatedAt: now,
    };

    db.transaction((tx) => {
      tx.update(budgets)
        .set({
          deletedAt: now,
          clientUpdatedAt: now,
        })
        .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)))
        .run();

      enqueueOutbox({
        entity: 'budgets',
        entityId: budgetId,
        op: 'delete',
        payload: budgetToOutboxPayload(softDeleted),
      });
    });
  },

  /**
   * Cuenta los presupuestos ACTIVOS asociados a una categoría (RNF-009).
   * Expuesta para que los servicios y la UI puedan verificar integridad referencial
   * antes de eliminar categorías sin modificar el repositorio de categorías de terceros.
   */
  countActiveByCategory(categoryId: string): number {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), isNull(budgets.deletedAt)))
      .get();
    return row?.count ?? 0;
  },
};
