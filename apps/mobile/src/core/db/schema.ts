/**
 * AhorRaso - Esquema Relacional de Base de Datos Local (SQLite + Drizzle ORM)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLAS TRANSVERSALES DE PRESISTENCIA (CRÍTICAS PARA EL MOTOR DE SYNC):
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

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  passwordHash: text('password_hash'), // nullable hashed password
  pinHash: text('pin_hash'), // nullable hashed PIN
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
// 5. TABLA: budgets (RF-006: Presupuestos por Categoría)
// ==========================================
export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(), // UUID cliente
    userId: text('user_id').notNull(),
    categoryId: text('category_id').notNull(), // FK lógica a categories
    amountCents: integer('amount_cents').notNull(), // Monto límite > 0 en céntimos
    periodType: text('period_type').$type<'weekly' | 'biweekly' | 'monthly'>().notNull(),
    periodStart: text('period_start').notNull(), // Formato "YYYY-MM-DD"
    periodEnd: text('period_end').notNull(), // Formato "YYYY-MM-DD"
    createdAt: text('created_at').notNull(),
    clientUpdatedAt: text('client_updated_at').notNull(),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_budgets_user_period').on(table.userId, table.periodStart),
    index('idx_budgets_user_cat').on(table.userId, table.categoryId),
    uniqueIndex('idx_budgets_unique_period').on(
      table.userId,
      table.categoryId,
      table.periodStart,
      table.periodType
    ),
  ]
);

// ==========================================
// 6. TABLA: outbox (Cola local para sincronización)
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

// ==========================================
// 7. TABLA: voice_learning (Autoaprendizaje adaptativo)
// ==========================================
export const voiceLearning = sqliteTable(
  'voice_learning',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    phrase: text('phrase').notNull(), // Frase o alias normalizado en minúsculas
    categoryId: text('category_id').notNull(), // Categoría asociada
    merchantName: text('merchant_name'), // Comercio asociado (opcional)
    hitCount: integer('hit_count').default(1).notNull(), // Veces usado/confirmado
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_voice_learning_user_phrase').on(table.userId, table.phrase),
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

export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = typeof budgets.$inferInsert;

export type OutboxItem = typeof outbox.$inferSelect;
export type InsertOutboxItem = typeof outbox.$inferInsert;

export type VoiceLearning = typeof voiceLearning.$inferSelect;
export type InsertVoiceLearning = typeof voiceLearning.$inferInsert;

// ==========================================
// 8. TABLA: notification_prefs (RF-010: Preferencias de Alertas)
// ==========================================
export const notificationPrefs = sqliteTable(
  'notification_prefs',
  {
    id: text('id').primaryKey(), // UUID cliente
    userId: text('user_id').notNull(),
    enabled: integer('enabled').default(1).notNull(), // 0 = false, 1 = true
    thresholds: text('thresholds').default('[50,80,100]').notNull(), // JSON serializado: [50, 80, 100]
    channelInApp: integer('channel_in_app').default(1).notNull(),
    channelPush: integer('channel_push').default(0).notNull(),
    createdAt: text('created_at').notNull(),
    clientUpdatedAt: text('client_updated_at').notNull(),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('idx_notification_prefs_user').on(table.userId),
  ]
);

// ==========================================
// 9. TABLA: budget_alerts_history (RF-011 / RNF-010: Historial Anti-Spam)
// ==========================================
export const budgetAlertsHistory = sqliteTable(
  'budget_alerts_history',
  {
    id: text('id').primaryKey(), // UUID cliente
    userId: text('user_id').notNull(),
    budgetId: text('budget_id').notNull(),
    categoryId: text('category_id').notNull(),
    thresholdPercent: integer('threshold_percent').notNull(), // 50, 80, 100
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    spentCents: integer('spent_cents').notNull(),
    budgetAmountCents: integer('budget_amount_cents').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_budget_alerts_user_date').on(table.userId, table.createdAt),
    index('idx_budget_alerts_budget').on(table.budgetId),
    uniqueIndex('idx_budget_alerts_history_unique').on(
      table.userId,
      table.budgetId,
      table.periodStart,
      table.thresholdPercent
    ),
  ]
);

export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type InsertNotificationPrefs = typeof notificationPrefs.$inferInsert;

export type BudgetAlertHistory = typeof budgetAlertsHistory.$inferSelect;
export type InsertBudgetAlertHistory = typeof budgetAlertsHistory.$inferInsert;
