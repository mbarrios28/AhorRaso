import * as Crypto from 'expo-crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import {
  db,
  transactions,
  merchants,
  profile,
  Transaction,
  enqueueOutbox,
  centsToPostgresAmount,
} from '@/core/db';
import { categoriesRepository } from '../../categories/data/categories.repository';
import { CreateExpenseInput, createExpenseSchema } from '../domain/types';

export const transactionsRepository = {
  /**
   * Registra un gasto offline en SQLite local, encola la mutación en outbox
   * y descuenta el saldo disponible en tiempo real (RF-002 / HU-01).
   *
   * RF-004: la categoría se valida contra `categoriesRepository` antes de
   * persistir cualquier cosa (existe, activa, pertenece al usuario y es de
   * tipo gasto). Si la validación falla, no se crea la transacción ni el
   * merchant.
   */
  createExpense(userId: string, input: CreateExpenseInput): Transaction {
    // 1. Validar reglas de dominio
    const validated = createExpenseSchema.parse(input);

    // 1.b Validar integridad de la categoría (RF-004) ANTES de escribir
    categoriesRepository.getUsableForTransaction(userId, validated.categoryId, 'expense');

    const now = new Date().toISOString();
    let merchantId: string | null = null;

    // 2. Gestionar establecimiento si se especificó
    if (validated.merchantName && validated.merchantName.trim().length > 0) {
      const trimmedName = validated.merchantName.trim();
      
      const existingMerchant = db
        .select()
        .from(merchants)
        .where(
          and(
            eq(merchants.userId, userId),
            isNull(merchants.deletedAt)
          )
        )
        .all()
        .find((m) => m.name.toLowerCase() === trimmedName.toLowerCase());

      if (existingMerchant) {
        merchantId = existingMerchant.id;
      } else {
        // Crear nuevo merchant localmente
        merchantId = Crypto.randomUUID();
        db.insert(merchants)
          .values({
            id: merchantId,
            userId,
            name: trimmedName,
            defaultCategoryId: validated.categoryId,
            createdAt: now,
            clientUpdatedAt: now,
            updatedAt: null,
            deletedAt: null,
          })
          .run();

        // Encolar creación del merchant en outbox
        enqueueOutbox({
          entity: 'merchants',
          entityId: merchantId,
          op: 'upsert',
          payload: {
            id: merchantId,
            user_id: userId,
            name: trimmedName,
            default_category_id: validated.categoryId,
            created_at: now,
            client_updated_at: now,
            deleted_at: null,
          },
        });
      }
    }

    // 3. Crear transacción de egreso
    const txId = Crypto.randomUUID();
    const newTx: Transaction = {
      id: txId,
      userId,
      type: 'expense',
      amountCents: validated.amountCents,
      occurredOn: validated.occurredOn,
      categoryId: validated.categoryId,
      merchantId,
      paymentMethod: validated.paymentMethod,
      source: null,
      note: validated.note || null,
      entryMethod: validated.entryMethod,
      createdAt: now,
      clientUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    };

    // Inserción en SQLite
    db.insert(transactions).values(newTx).run();

    // 4. Encolar en Outbox para PostgreSQL
    enqueueOutbox({
      entity: 'transactions',
      entityId: txId,
      op: 'upsert',
      payload: {
        id: txId,
        user_id: userId,
        type: 'expense',
        amount: centsToPostgresAmount(validated.amountCents),
        occurred_on: validated.occurredOn,
        category_id: validated.categoryId,
        merchant_id: merchantId,
        payment_method: validated.paymentMethod,
        source: null,
        note: validated.note || null,
        entry_method: validated.entryMethod,
        created_at: now,
        client_updated_at: now,
        deleted_at: null,
      },
    });

    // 5. Descontar en tiempo real del saldo disponible (HU-01 Escenario 1)
    const userProfile = db.select().from(profile).where(eq(profile.id, userId)).get();
    if (userProfile) {
      const updatedBalance = Math.max(0, userProfile.initialBalanceCents - validated.amountCents);
      db.update(profile)
        .set({
          initialBalanceCents: updatedBalance,
          clientUpdatedAt: now,
        })
        .where(eq(profile.id, userId))
        .run();
    }

    return newTx;
  },

  /**
   * Obtiene los gastos más recientes del usuario.
   */
  getRecentExpenses(userId: string, limit = 20): Transaction[] {
    return db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, 'expense'),
          isNull(transactions.deletedAt)
        )
      )
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
      .limit(limit)
      .all();
  },

  /**
   * Obtiene una transacción activa por id, asegurando que pertenezca al
   * usuario (aislamiento RNF-005). Devuelve `null` si no existe.
   */
  getById(userId: string, transactionId: string): Transaction | null {
    const row = db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
      .get();

    if (!row || row.userId !== userId) return null;
    return row;
  },

  /**
   * Cambia la categoría de un movimiento existente (RF-004).
   *
   * La nueva categoría se valida contra `categoriesRepository`: debe existir,
   * estar activa, pertenecer al usuario y ser compatible con el tipo del
   * movimiento (ingreso/gasto). La operación es transaccional: la
   * actualización local y la entrada de outbox se aplican juntas.
   */
  updateCategory(userId: string, transactionId: string, newCategoryId: string): Transaction {
    const existing = this.getById(userId, transactionId);
    if (!existing) {
      throw new Error('El movimiento solicitado no existe o ya no está disponible.');
    }

    // Validar la nueva categoría contra la capa de datos (RF-004)
    const category = categoriesRepository.getUsableForTransaction(
      userId,
      newCategoryId,
      existing.type
    );

    // Sin cambios → devolvemos la transacción tal cual (idempotente)
    if (existing.categoryId === category.id) {
      return existing;
    }

    const now = new Date().toISOString();
    const updated: Transaction = {
      ...existing,
      categoryId: category.id,
      clientUpdatedAt: now,
      updatedAt: null,
    };

    db.transaction((tx) => {
      tx.update(transactions)
        .set({ categoryId: category.id, clientUpdatedAt: now, updatedAt: null })
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
        .run();

      enqueueOutbox({
        entity: 'transactions',
        entityId: transactionId,
        op: 'upsert',
        payload: {
          id: transactionId,
          user_id: userId,
          type: updated.type,
          amount: centsToPostgresAmount(updated.amountCents),
          occurred_on: updated.occurredOn,
          category_id: category.id,
          merchant_id: updated.merchantId,
          payment_method: updated.paymentMethod,
          source: updated.source,
          note: updated.note,
          entry_method: updated.entryMethod,
          created_at: updated.createdAt,
          client_updated_at: now,
          deleted_at: null,
        },
      });
    });

    return updated;
  },
};
