import * as Crypto from 'expo-crypto';
import { eq, and, isNull, desc, asc, gte, lte, lt, gt, or, sql, SQL } from 'drizzle-orm';
import {
  db,
  transactions,
  merchants,
  profile,
  Transaction,
  Merchant,
  enqueueOutbox,
  centsToPostgresAmount,
} from '@/core/db';
import { categoriesRepository } from '../../categories/data/categories.repository';
import {
  CreateExpenseInput,
  createExpenseSchema,
  CreateIncomeInput,
  createIncomeSchema,
} from '../domain/types';
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  EMPTY_HISTORY_PAGE,
  HistoryFilters,
  HistoryItem,
  HistoryOrder,
  HistoryPage,
  HistoryQueryOptions,
  HistoryTotals,
  NormalizedHistoryFilters,
  decodeHistoryCursor,
  encodeHistoryCursor,
  historyFiltersSchema,
  normalizeHistoryLimit,
  normalizeHistorySearchTerm,
  toHistoryFilterError,
} from '../domain/history';

/**
 * Construye la condición keyset equivalente a "viene después del cursor" para
 * el orden cronológico solicitado. La tupla (occurred_on, created_at, id)
 * replica exactamente el criterio de orden, por lo que la paginación es estable
 * aunque se inserten movimientos nuevos entre páginas (a diferencia de OFFSET).
 */
function buildHistoryKeysetCondition(
  order: HistoryOrder,
  cursor: { occurredOn: string; createdAt: string; id: string }
): SQL {
  const isAsc = order === 'date_asc';
  const sameDate = eq(transactions.occurredOn, cursor.occurredOn);
  const sameCreated = eq(transactions.createdAt, cursor.createdAt);

  if (isAsc) {
    return or(
      gt(transactions.occurredOn, cursor.occurredOn),
      and(sameDate, gt(transactions.createdAt, cursor.createdAt)),
      and(sameDate, sameCreated, gt(transactions.id, cursor.id))
    ) as SQL;
  }

  return or(
    lt(transactions.occurredOn, cursor.occurredOn),
    and(sameDate, lt(transactions.createdAt, cursor.createdAt)),
    and(sameDate, sameCreated, lt(transactions.id, cursor.id))
  ) as SQL;
}

/**
 * Condición SQL para filtrar por nombre de establecimiento. Se resuelve con una
 * subconsulta (no un JOIN) para no duplicar filas ni complicar las sumas
 * agregadas del historial.
 */
function buildMerchantNameCondition(userId: string, term: string): SQL {
  const pattern = `%${term}%`;
  return sql`${transactions.merchantId} IN (
    SELECT ${merchants.id} FROM ${merchants}
    WHERE ${merchants.userId} = ${userId}
      AND ${merchants.deletedAt} IS NULL
      AND lower(${merchants.name}) LIKE ${pattern}
  )`;
}

/**
 * Búsqueda libre del historial: coincide con la nota, la fuente del ingreso o
 * el nombre del establecimiento (búsqueda "por comercio" de RF-009).
 */
function buildHistoryTextCondition(userId: string, term: string): SQL {
  const pattern = `%${term}%`;
  return sql`(
    lower(coalesce(${transactions.note}, '')) LIKE ${pattern}
    OR lower(coalesce(${transactions.source}, '')) LIKE ${pattern}
    OR ${buildMerchantNameCondition(userId, term)}
  )`;
}

/** Enriquece las filas de movimientos con su categoría y establecimiento. */
function enrichHistoryItems(userId: string, rows: Transaction[]): HistoryItem[] {
  if (rows.length === 0) return [];

  // Catálogos pequeños y por usuario: se resuelven en memoria para evitar N+1.
  const categoryMap = new Map(
    categoriesRepository.getByUser(userId).map((category) => [category.id, category])
  );
  const merchantRows = db
    .select()
    .from(merchants)
    .where(eq(merchants.userId, userId))
    .all();
  const merchantMap = new Map(merchantRows.map((merchant) => [merchant.id, merchant]));

  return rows.map((row) => ({
    ...row,
    category: categoryMap.get(row.categoryId) ?? null,
    merchant: row.merchantId ? merchantMap.get(row.merchantId) ?? null : null,
  }));
}

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
   * Registra un ingreso offline en SQLite local, encola la mutación en outbox
   * e incrementa el saldo disponible en tiempo real (RF-001).
   *
   * RF-004: la categoría se valida contra `categoriesRepository` antes de
   * persistir (existe, activa, pertenece al usuario y es de tipo ingreso).
   * Si la validación falla, no se crea la transacción.
   */
  createIncome(userId: string, input: CreateIncomeInput): Transaction {
    // 1. Validar reglas de dominio con Zod
    const validated = createIncomeSchema.parse(input);

    // 2. Validar integridad de la categoría (RF-004) ANTES de escribir
    categoriesRepository.getUsableForTransaction(userId, validated.categoryId, 'income');

    const now = new Date().toISOString();
    const txId = Crypto.randomUUID();

    // 3. Crear transacción de ingreso
    const newTx: Transaction = {
      id: txId,
      userId,
      type: 'income',
      amountCents: validated.amountCents,
      occurredOn: validated.occurredOn,
      categoryId: validated.categoryId,
      merchantId: null,
      paymentMethod: null,
      source: validated.source,
      note: validated.note || null,
      entryMethod: validated.entryMethod,
      createdAt: now,
      clientUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    };

    // Operación transaccional: inserción local, encolado de outbox y actualización de saldo
    db.transaction((tx) => {
      // Inserción en SQLite
      tx.insert(transactions).values(newTx).run();

      // Encolar en Outbox para PostgreSQL
      enqueueOutbox({
        entity: 'transactions',
        entityId: txId,
        op: 'upsert',
        payload: {
          id: txId,
          user_id: userId,
          type: 'income',
          amount: centsToPostgresAmount(validated.amountCents),
          occurred_on: validated.occurredOn,
          category_id: validated.categoryId,
          merchant_id: null,
          payment_method: null,
          source: validated.source,
          note: validated.note || null,
          entry_method: validated.entryMethod,
          created_at: now,
          client_updated_at: now,
          deleted_at: null,
        },
      });

      // Incrementar en tiempo real el saldo disponible en el perfil (RF-001)
      const userProfile = tx.select().from(profile).where(eq(profile.id, userId)).get();
      if (userProfile) {
        const updatedBalance = userProfile.initialBalanceCents + validated.amountCents;
        tx.update(profile)
          .set({
            initialBalanceCents: updatedBalance,
            clientUpdatedAt: now,
          })
          .where(eq(profile.id, userId))
          .run();
      }
    });

    return newTx;
  },

  /**
   * Obtiene los ingresos más recientes del usuario.
   */
  getRecentIncomes(userId: string, limit = 20): Transaction[] {
    return db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, 'income'),
          isNull(transactions.deletedAt)
        )
      )
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
      .limit(limit)
      .all();
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
   * Consulta el historial de movimientos con filtros dinámicos combinables y
   * paginación keyset (RF-009 / HU-05).
   *
   * - Listado estrictamente cronológico: `occurred_on`, `created_at` e `id`
   *   (desempate estable) en el orden solicitado.
   * - Filtros aditivos (AND): rango de fechas, categoría, tipo, rango de monto,
   *   establecimiento exacto o por nombre y texto libre (nota/fuente/comercio).
   * - Solo movimientos activos (`deleted_at IS NULL`) del usuario autenticado
   *   (aislamiento RNF-005).
   * - `total` y `totals` describen el conjunto filtrado completo, no la página.
   *
   * Lanza `HistoryQueryError` ('INVALID_FILTER' | 'INVALID_CURSOR') ante
   * parámetros inválidos, y la UI traduce el código a un mensaje legible.
   */
  searchHistory(
    userId: string,
    filters: HistoryFilters = {},
    options: HistoryQueryOptions = {}
  ): HistoryPage {
    // 1. Validar el contrato de filtros (fechas y rangos de monto)
    let parsed: NormalizedHistoryFilters;
    try {
      parsed = historyFiltersSchema.parse(filters);
    } catch (error) {
      throw toHistoryFilterError(error);
    }

    // 2. Resolver paginación (cursor opaco + tope de página)
    const limit = normalizeHistoryLimit(options.limit ?? DEFAULT_HISTORY_PAGE_SIZE);
    const cursor = options.cursor ? decodeHistoryCursor(options.cursor) : null;

    // 3. Componer las condiciones dinámicas
    const conditions: SQL[] = [
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
    ];

    if (parsed.type) conditions.push(eq(transactions.type, parsed.type));
    if (parsed.from) conditions.push(gte(transactions.occurredOn, parsed.from));
    if (parsed.to) conditions.push(lte(transactions.occurredOn, parsed.to));
    if (parsed.categoryId) conditions.push(eq(transactions.categoryId, parsed.categoryId));
    if (parsed.merchantId) conditions.push(eq(transactions.merchantId, parsed.merchantId));
    if (parsed.minAmountCents !== undefined) {
      conditions.push(gte(transactions.amountCents, parsed.minAmountCents));
    }
    if (parsed.maxAmountCents !== undefined) {
      conditions.push(lte(transactions.amountCents, parsed.maxAmountCents));
    }

    const merchantTerm = normalizeHistorySearchTerm(parsed.merchantQuery);
    if (merchantTerm) conditions.push(buildMerchantNameCondition(userId, merchantTerm));

    const searchTerm = normalizeHistorySearchTerm(parsed.search);
    if (searchTerm) conditions.push(buildHistoryTextCondition(userId, searchTerm));

    // 4. Agregados del conjunto filtrado completo (total y saldos)
    const aggregate = db
      .select({
        total: sql<number>`count(*)`,
        incomeCents: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountCents} else 0 end), 0)`,
        expenseCents: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountCents} else 0 end), 0)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .get();

    const totals: HistoryTotals = {
      incomeCents: aggregate?.incomeCents ?? 0,
      expenseCents: aggregate?.expenseCents ?? 0,
      netCents: (aggregate?.incomeCents ?? 0) - (aggregate?.expenseCents ?? 0),
    };
    const total = aggregate?.total ?? 0;

    if (total === 0) {
      return { ...EMPTY_HISTORY_PAGE, items: [], totals };
    }

    // 5. Página: se pide un registro extra para saber si hay más sin COUNT extra
    const pageConditions = [...conditions];
    if (cursor) pageConditions.push(buildHistoryKeysetCondition(parsed.order, cursor));

    const orderBy =
      parsed.order === 'date_asc'
        ? [asc(transactions.occurredOn), asc(transactions.createdAt), asc(transactions.id)]
        : [desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id)];

    const rows = db
      .select()
      .from(transactions)
      .where(and(...pageConditions))
      .orderBy(...orderBy)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      items: enrichHistoryItems(userId, pageRows),
      nextCursor: hasMore && lastRow ? encodeHistoryCursor(lastRow) : null,
      hasMore,
      total,
      totals,
    };
  },

  /**
   * Establecimientos activos del usuario, ordenados alfabéticamente. Alimenta
   * los chips del filtro "Establecimiento" del historial (Escenario 1 de HU-05).
   */
  getMerchantOptions(userId: string): Merchant[] {
    return db
      .select()
      .from(merchants)
      .where(and(eq(merchants.userId, userId), isNull(merchants.deletedAt)))
      .orderBy(asc(merchants.name))
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
