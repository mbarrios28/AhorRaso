/**
 * AhorRaso - Esquema Relacional de Base de Datos Local (SQLite + Drizzle ORM)
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLAS TRANSVERSALES DE PERSISTENCIA (CRÍTICAS PARA EL MOTOR DE SYNC):
 * 1. Identidad: UUIDv4 generado en el cliente (`id TEXT PRIMARY KEY`).
 * 2. Timestamps: ISO-8601 UTC en formato texto (ej: "2026-10-11T15:04:05.123Z").
 * 3. Fechas: Formato texto "YYYY-MM-DD".
 * 4. Montos Monetarios: SIEMPRE en INTEGER céntimos (`amount_cents`).
 *    NUNCA usar números en punto flotante/REAL para evitar pérdidas de precisión.
 * 5. Booleanos: Mapeados a INTEGER (0 = false, 1 = true).
 * 6. JSON / Objetos: Mapeados a TEXT serializado con JSON.stringify.
 * 7. Soft Delete: Toda fila eliminada actualiza `deleted_at` para propagarse a la nube.
 * 8. Cola Outbox: Toda mutación local encola una fila en `outbox` con el payload
 *    formateado en snake_case y montos como string decimal ("15.50") para Postgres.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ==========================================
// 1. TABLA: profile (Usuario local logueado)
// ==========================================
export const profile = sqliteTable('profile', {
  id: text('id').primaryKey(), // ID del usuario (UUID)
  displayName: text('display_name'),
  currency: text('currency').default('PEN').notNull(),
  locale: text('locale').default('es-PE').notNull(),
  timezone: text('timezone').default('America/Lima').notNull(),
  initialBalanceCents: integer('initial_balance_cents').default(0).notNull(),
  onboardingDone: integer('onboarding_done').default(0).notNull(),
  createdAt: text('created_at').notNull(),
  clientUpdatedAt: text('client_updated_at').notNull(),
  updatedAt: text('updated_at'),
});

// ==========================================
// 2. TABLA: categories (Privadas por usuario)
// ==========================================
export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(), // UUID cliente
    userId: text('user_id').notNull(),
    name: text('name').notNull(), // 1..40 caracteres
    type: text('type').$type<'income' | 'expense'>().notNull(),
    icon: text('icon').notNull(), // Nombre string de Lucide, ej: "Utensils"
    color: text('color').notNull(), // Formato Hex: #RRGGBB
    isDefault: integer('is_default').default(0).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: text('created_at').notNull(),
    clientUpdatedAt: text('client_updated_at').notNull(),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_categories_user_type').on(table.userId, table.type),
  ]
);

// ==========================================
// 3. TABLA: merchants (Establecimientos / Comercios)
// ==========================================
export const merchants = sqliteTable(
  'merchants',
  {
    id: text('id').primaryKey(), // UUID cliente
    userId: text('user_id').notNull(),
    name: text('name').notNull(), // 1..80 caracteres
    defaultCategoryId: text('default_category_id'), // FK lógica a categories
    createdAt: text('created_at').notNull(),
    clientUpdatedAt: text('client_updated_at').notNull(),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_merchants_user').on(table.userId),
  ]
);

// ==========================================
// 4. TABLA: transactions (Gastos e Ingresos)
// ==========================================
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(), // UUID cliente
    userId: text('user_id').notNull(),
    type: text('type').$type<'income' | 'expense'>().notNull(),
    amountCents: integer('amount_cents').notNull(), // Monto > 0 en céntimos
    occurredOn: text('occurred_on').notNull(), // Formato "YYYY-MM-DD"
    categoryId: text('category_id').notNull(), // FK lógica a categories
    merchantId: text('merchant_id'), // FK lógica a merchants (nullable)
    paymentMethod: text('payment_method').$type<'cash' | 'digital'>(), // Obligatorio si expense
    source: text('source'), // Texto descriptivo de procedencia si income
    note: text('note'),
    entryMethod: text('entry_method').$type<'manual' | 'voice'>().default('manual').notNull(),
    createdAt: text('created_at').notNull(),
    clientUpdatedAt: text('client_updated_at').notNull(),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_tx_user_date').on(table.userId, table.occurredOn),
    index('idx_tx_user_cat').on(table.userId, table.categoryId, table.occurredOn),
    index('idx_tx_user_merchant').on(table.userId, table.merchantId),
    index('idx_tx_user_updated').on(table.userId, table.updatedAt),
  ]
);

// ==========================================
// 5. TABLA: outbox (Cola local para sincronización)
// ==========================================
export const outbox = sqliteTable(
  'outbox',
  {
    id: text('id').primaryKey(), // UUID cliente
    entity: text('entity').notNull(), // 'transactions' | 'categories' | 'merchants'
    entityId: text('entity_id').notNull(), // UUID de la fila destino
    op: text('op').$type<'upsert' | 'delete'>().notNull(),
    payload: text('payload').notNull(), // JSON serializado en snake_case formato Postgres
    retries: integer('retries').default(0).notNull(),
    lastError: text('last_error'),
    nextAttemptAt: text('next_attempt_at').notNull(), // ISO timestamp
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_outbox_queue').on(table.nextAttemptAt, table.createdAt),
  ]
);

// Inferencia de tipos de TypeScript
export type Profile = typeof profile.$inferSelect;
export type InsertProfile = typeof profile.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export type OutboxItem = typeof outbox.$inferSelect;
export type InsertOutboxItem = typeof outbox.$inferInsert;
