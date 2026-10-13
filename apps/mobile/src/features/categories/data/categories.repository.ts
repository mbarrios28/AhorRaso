import * as Crypto from 'expo-crypto';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { db, categories, transactions, Category, enqueueOutbox } from '@/core/db';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  createCategorySchema,
  updateCategorySchema,
  toCategoryValidationError,
  normalizeCategoryName,
  assertCategoryUsableForTransaction,
  assertCategoryEditable,
  assertCategoryDeletable,
  CategoryType,
} from '../domain/types';
import { CategoryError, CATEGORY_ERROR_MESSAGES, categoryInUseError } from '../domain/errors';

/**
 * Convierte una violación del índice único parcial de SQLite
 * (`idx_categories_unique_name`) en un error de dominio legible.
 */
function rethrowAsDuplicateIfUnique(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('UNIQUE constraint failed')) {
    throw new CategoryError('DUPLICATE_NAME', CATEGORY_ERROR_MESSAGES.DUPLICATE_NAME);
  }
  throw error;
}

/** Serializa los campos de categoría en snake_case para el outbox (Postgres). */
function categoryToOutboxPayload(category: Category): Record<string, unknown> {
  return {
    id: category.id,
    user_id: category.userId,
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    is_default: category.isDefault === 1,
    sort_order: category.sortOrder,
    created_at: category.createdAt,
    client_updated_at: category.clientUpdatedAt,
    deleted_at: category.deletedAt,
  };
}

export const categoriesRepository = {
  /**
   * Obtiene todas las categorías activas del usuario ordenadas por sortOrder.
   */
  getByUser(userId: string, type?: CategoryType): Category[] {
    const conditions = [
      eq(categories.userId, userId),
      isNull(categories.deletedAt),
    ];

    if (type) {
      conditions.push(eq(categories.type, type));
    }

    return db
      .select()
      .from(categories)
      .where(and(...conditions))
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all();
  },

  /**
   * Obtiene una categoría por id. Devuelve `null` si no existe, está
   * eliminada o pertenece a otro usuario (aislamiento RNF-005).
   */
  getById(userId: string, categoryId: string): Category | null {
    const row = db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
      .get();

    if (!row || row.userId !== userId) return null;
    return row;
  },

  /**
   * Valida que una categoría pueda usarse en un movimiento del tipo indicado
   * y la devuelve. Lanza `CategoryError` con código NOT_FOUND / TYPE_MISMATCH.
   *
   * Es la única puerta de entrada de integridad referencial (RF-004): la FK
   * es lógica por diseño (sync outbox), por lo que la compatibilidad se
   * garantiza en la capa de datos.
   */
  getUsableForTransaction(userId: string, categoryId: string, transactionType: CategoryType): Category {
    const category = this.getById(userId, categoryId);
    return assertCategoryUsableForTransaction(category, transactionType, userId);
  },

  /**
   * Crea una nueva categoría personalizada y encola su sincronización.
   */
  create(userId: string, input: CreateCategoryInput): Category {
    // 1. Validar reglas de dominio con Zod (errores tipados, no crudos)
    let validated;
    try {
      validated = createCategorySchema.parse(input);
    } catch (error) {
      throw toCategoryValidationError(error);
    }

    // 2. Rechazar nombres duplicados (activo, mismo usuario y tipo) con
    //    comparación insensible a mayúsculas/acentos de espacios, coherente
    //    con el índice único parcial de SQLite.
    const normalized = normalizeCategoryName(validated.name);
    const duplicate = this.getByUser(userId, validated.type)
      .some((c) => normalizeCategoryName(c.name) === normalized);
    if (duplicate) {
      throw new CategoryError('DUPLICATE_NAME', CATEGORY_ERROR_MESSAGES.DUPLICATE_NAME);
    }

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    // Las personalizadas se colocan después del catálogo por defecto.
    const maxSort = this.getByUser(userId, validated.type)
      .reduce((max, c) => Math.max(max, c.sortOrder), 0);

    const newCategory: Category = {
      id,
      userId,
      name: validated.name,
      type: validated.type,
      icon: validated.icon,
      color: validated.color,
      isDefault: 0,
      sortOrder: maxSort + 1,
      createdAt: now,
      clientUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    };

    try {
      db.insert(categories).values(newCategory).run();
    } catch (error) {
      rethrowAsDuplicateIfUnique(error);
    }

    enqueueOutbox({
      entity: 'categories',
      entityId: id,
      op: 'upsert',
      payload: categoryToOutboxPayload(newCategory),
    });

    return newCategory;
  },

  /**
   * Actualiza el nombre, icono y color de una categoría personalizada (RF-005).
   * Las categorías por defecto son protegidas y no pueden editarse.
   */
  update(userId: string, categoryId: string, input: UpdateCategoryInput): Category {
    // 1. Categoría debe existir, estar activa y pertenecer al usuario
    const existing = this.getById(userId, categoryId);
    if (!existing) {
      throw new CategoryError('NOT_FOUND', CATEGORY_ERROR_MESSAGES.NOT_FOUND);
    }

    // 2. Protección de categorías del sistema
    assertCategoryEditable(existing, userId);

    // 3. Validar atributos
    let validated;
    try {
      validated = updateCategorySchema.parse({ ...input, type: existing.type });
    } catch (error) {
      throw toCategoryValidationError(error);
    }

    // 4. Unicidad de nombre excluyendo la propia categoría
    const normalized = normalizeCategoryName(validated.name);
    const duplicate = this.getByUser(userId, existing.type)
      .some((c) => c.id !== categoryId && normalizeCategoryName(c.name) === normalized);
    if (duplicate) {
      throw new CategoryError('DUPLICATE_NAME', CATEGORY_ERROR_MESSAGES.DUPLICATE_NAME);
    }

    const now = new Date().toISOString();
    const updated: Category = {
      ...existing,
      name: validated.name,
      icon: validated.icon,
      color: validated.color,
      clientUpdatedAt: now,
      updatedAt: null,
    };

    try {
      db.update(categories)
        .set({
          name: updated.name,
          icon: updated.icon,
          color: updated.color,
          clientUpdatedAt: now,
        })
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .run();
    } catch (error) {
      rethrowAsDuplicateIfUnique(error);
    }

    enqueueOutbox({
      entity: 'categories',
      entityId: categoryId,
      op: 'upsert',
      payload: categoryToOutboxPayload(updated),
    });

    return updated;
  },

  /**
   * Cuenta los movimientos ACTIVOS asociados a una categoría.
   * Se usa para restringir la eliminación (RF-005, Alternativa A).
   */
  countActiveTransactions(categoryId: string): number {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.categoryId, categoryId), isNull(transactions.deletedAt)))
      .get();
    return row?.count ?? 0;
  },

  /**
   * Elimina (soft delete) una categoría personalizada si no tiene movimientos
   * asociados. Las categorías por defecto están protegidas.
   *
   * Política de eliminación: RESTRINGIR (Alternativa A). Si existen
   * movimientos asociados se lanza `IN_USE` con el conteo, sin tocar ni la
   * categoría ni sus movimientos. La operación es transaccional: el soft
   * delete y su entrada de outbox se aplican de forma atómica.
   */
  delete(userId: string, categoryId: string): void {
    const existing = this.getById(userId, categoryId);
    if (!existing) {
      throw new CategoryError('NOT_FOUND', CATEGORY_ERROR_MESSAGES.NOT_FOUND);
    }

    assertCategoryDeletable(existing, userId);

    const usage = this.countActiveTransactions(categoryId);
    if (usage > 0) {
      throw categoryInUseError(usage);
    }

    const now = new Date().toISOString();

    db.transaction((tx) => {
      tx.update(categories)
        .set({ deletedAt: now, clientUpdatedAt: now, updatedAt: null })
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .run();

      enqueueOutbox({
        entity: 'categories',
        entityId: categoryId,
        op: 'delete',
        payload: {
          id: categoryId,
          user_id: userId,
          client_updated_at: now,
          deleted_at: now,
        },
      });
    });
  },
};
