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
import { CreateExpenseInput, createExpenseSchema } from '../domain/types';

export const transactionsRepository = {
  /**
   * Registra un gasto offline en SQLite local, encola la mutación en outbox
   * y descuenta el saldo disponible en tiempo real (RF-002 / HU-01).
   */
  createExpense(userId: string, input: CreateExpenseInput): Transaction {
    // 1. Validar reglas de dominio
    const validated = createExpenseSchema.parse(input);

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
};
