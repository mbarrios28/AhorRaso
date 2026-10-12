import * as Crypto from 'expo-crypto';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db, categories, Category, enqueueOutbox } from '@/core/db';
import { CreateCategoryInput, createCategorySchema } from '../domain/types';

export const categoriesRepository = {
  /**
   * Obtiene todas las categorías activas del usuario ordenadas por sortOrder.
   */
  getByUser(userId: string, type?: 'income' | 'expense'): Category[] {
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
   * Crea una nueva categoría localmente y encola su sincronización en el outbox.
   */
  create(userId: string, input: CreateCategoryInput): Category {
    // 1. Validar reglas de dominio con Zod
    const validated = createCategorySchema.parse(input);

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newCategory: Category = {
      id,
      userId,
      name: validated.name,
      type: validated.type,
      icon: validated.icon,
      color: validated.color,
      isDefault: 0,
      sortOrder: 50,
      createdAt: now,
      clientUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    };

    // 2. Insertar en SQLite local
    db.insert(categories).values(newCategory).run();

    // 3. Encolar en Outbox para sincronización con PostgreSQL
    enqueueOutbox({
      entity: 'categories',
      entityId: id,
      op: 'upsert',
      payload: {
        id,
        user_id: userId,
        name: validated.name,
        type: validated.type,
        icon: validated.icon,
        color: validated.color,
        is_default: false,
        sort_order: 50,
        created_at: now,
        client_updated_at: now,
        deleted_at: null,
      },
    });

    return newCategory;
  },
};
