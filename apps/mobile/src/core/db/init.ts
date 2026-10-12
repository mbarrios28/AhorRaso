import * as Crypto from 'expo-crypto';
import { sqliteDb } from './client';
import { DEV_USER_ID, DEV_USER_PROFILE } from '../dev/constants';

/**
 * Semilla de categorías iniciales obligatorias por especificación del proyecto.
 */
export const DEFAULT_CATEGORIES = [
  // Gastos
  { name: 'Alimentación', type: 'expense' as const, icon: 'Utensils', color: '#F97316', sortOrder: 1 },
  { name: 'Transporte', type: 'expense' as const, icon: 'Bus', color: '#3B82F6', sortOrder: 2 },
  { name: 'Diversión', type: 'expense' as const, icon: 'Gamepad2', color: '#A855F7', sortOrder: 3 },
  { name: 'Servicios', type: 'expense' as const, icon: 'Lightbulb', color: '#14B8A6', sortOrder: 4 },
  { name: 'Educación', type: 'expense' as const, icon: 'GraduationCap', color: '#6366F1', sortOrder: 5 },
  { name: 'Salud', type: 'expense' as const, icon: 'Heart', color: '#EF4444', sortOrder: 6 },
  // Ingresos
  { name: 'Sueldo', type: 'income' as const, icon: 'Wallet', color: '#10B981', sortOrder: 7 },
  { name: 'Propina', type: 'income' as const, icon: 'Gift', color: '#22C55E', sortOrder: 8 },
] as const;

/**
 * Inicializa de forma idempotente las tablas, índices, checks y la semilla inicial en SQLite local.
 */
export function initDatabase(): void {
  // 1. DDL: Creación de tablas
  sqliteDb.execSync(`
    PRAGMA foreign_keys = ON;

    -- Tabla: profile
    CREATE TABLE IF NOT EXISTS profile (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      currency TEXT DEFAULT 'PEN' NOT NULL,
      locale TEXT DEFAULT 'es-PE' NOT NULL,
      timezone TEXT DEFAULT 'America/Lima' NOT NULL,
      initial_balance_cents INTEGER DEFAULT 0 NOT NULL,
      onboarding_done INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      updated_at TEXT
    );

    -- Tabla: categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER DEFAULT 0 NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    );

    -- Índice único para categorías activas (evita duplicados de nombre por usuario y tipo)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name 
      ON categories (user_id, type, lower(trim(name))) 
      WHERE deleted_at IS NULL;

    -- Tabla: merchants
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      default_category_id TEXT,
      created_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    );

    -- Índice único para establecimientos activos
    CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_unique_name 
      ON merchants (user_id, lower(trim(name))) 
      WHERE deleted_at IS NULL;

    -- Tabla: transactions
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      occurred_on TEXT NOT NULL,
      category_id TEXT NOT NULL,
      merchant_id TEXT,
      payment_method TEXT,
      source TEXT,
      note TEXT,
      entry_method TEXT DEFAULT 'manual' NOT NULL,
      created_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT,
      CHECK (type != 'expense' OR payment_method IS NOT NULL),
      CHECK (type != 'income' OR source IS NOT NULL)
    );

    -- Índices para transacciones
    CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions (user_id, occurred_on DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions (user_id, category_id, occurred_on DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_user_merchant ON transactions (user_id, merchant_id);
    CREATE INDEX IF NOT EXISTS idx_tx_user_updated ON transactions (user_id, updated_at);

    -- Tabla: outbox
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
      payload TEXT NOT NULL,
      retries INTEGER DEFAULT 0 NOT NULL,
      last_error TEXT,
      next_attempt_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_queue ON outbox (next_attempt_at, created_at);
  `);

  // 2. Sembrado de Profile inicial (DEV_USER_ID)
  const now = new Date().toISOString();
  const existingProfile = sqliteDb.getFirstSync<any>(
    'SELECT id FROM profile WHERE id = ?',
    [DEV_USER_ID]
  );

  if (!existingProfile) {
    sqliteDb.runSync(
      `INSERT INTO profile (
        id, display_name, currency, locale, timezone, initial_balance_cents, onboarding_done, created_at, client_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEV_USER_PROFILE.id,
        DEV_USER_PROFILE.displayName,
        DEV_USER_PROFILE.currency,
        DEV_USER_PROFILE.locale,
        DEV_USER_PROFILE.timezone,
        DEV_USER_PROFILE.initialBalanceCents,
        DEV_USER_PROFILE.onboardingDone,
        now,
        now,
      ]
    );
  }

  // 3. Sembrado de Categorías iniciales por defecto
  const countRow = sqliteDb.getFirstSync<{ count: number }>(
    'SELECT count(*) as count FROM categories WHERE user_id = ? AND deleted_at IS NULL',
    [DEV_USER_ID]
  );

  if (!countRow || countRow.count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      const catId = Crypto.randomUUID();
      sqliteDb.runSync(
        `INSERT INTO categories (
          id, user_id, name, type, icon, color, is_default, sort_order, created_at, client_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [catId, DEV_USER_ID, cat.name, cat.type, cat.icon, cat.color, cat.sortOrder, now, now]
      );
    }
  }
}
