/**
 * Utilidades compartidas por las pruebas de integración (entorno Node).
 *
 * La base de datos es SQLite en memoria gracias al mock de `expo-sqlite`
 * (ver `test/mocks/expo-sqlite.ts`), por lo que cada archivo de prueba
 * arranca con un estado aislado y los tests pueden resetearlo a voluntad.
 */
import { sqliteDb, outbox, OutboxItem } from '@/core/db';
import { initDatabase } from '@/core/db/init';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';

/** Segundo usuario local para pruebas de aislamiento (RNF-005). */
export const OTHER_USER_ID = '00000000-0000-4000-a000-000000000002';

/** Marca si el esquema (DDL) ya fue creado en esta sesión de pruebas. */
let schemaReady = false;

/**
 * Vacía todas las tablas y (opcionalmente) re-ejecuta la inicialización
 * completa (DDL + semilla de perfil y categorías por defecto).
 */
export function resetDatabase({ seed = true }: { seed?: boolean } = {}): void {
  // Garantiza que las tablas existan antes de limpiarlas (initDatabase es
  // idempotente: CREATE TABLE IF NOT EXISTS + semilla).
  if (!schemaReady) {
    initDatabase();
    schemaReady = true;
  }

  // Si un test previo dejó una transacción de Drizzle sin cerrar (p. ej. al
  // lanzar una excepción de dominio a mitad de `db.transaction`), la BD queda
  // bloqueada. Se revierte cualquier transacción pendiente antes de limpiar.
  try {
    sqliteDb.execSync('ROLLBACK');
  } catch {
    // No había transacción activa: se ignora.
  }

  // Limpieza dentro de una transacción única: si algo falla se revierte y la
  // BD no queda a medias ni bloqueada.
  sqliteDb.execSync('BEGIN');
  try {
    sqliteDb.execSync(`
      DELETE FROM outbox;
      DELETE FROM budget_alerts_history;
      DELETE FROM notification_prefs;
      DELETE FROM budgets;
      DELETE FROM transactions;
      DELETE FROM merchants;
      DELETE FROM categories;
      DELETE FROM profile;
    `);
    sqliteDb.execSync('COMMIT');
  } catch (error) {
    try {
      sqliteDb.execSync('ROLLBACK');
    } catch {
      // El rollback del fallo anterior: se ignora.
    }
    throw error;
  }

  if (seed) {
    initDatabase();
  }
}

/** Devuelve las entradas del outbox para una entidad (y operación opcional). */
export function getOutboxEntries(entity: string, op?: 'upsert' | 'delete'): OutboxItem[] {
  const conditions = [eq(outbox.entity, entity)];
  if (op) {
    conditions.push(eq(outbox.op, op));
  }
  return db.select().from(outbox).where(and(...conditions)).all();
}

/** Cuenta todas las filas de una tabla vía SQL crudo (independiente del ORM). */
export function countRows(
  table:
    | 'categories'
    | 'transactions'
    | 'merchants'
    | 'outbox'
    | 'budgets'
    | 'notification_prefs'
    | 'budget_alerts_history'
): number {
  const row = sqliteDb.getFirstSync<{ total: number }>(`SELECT count(*) AS total FROM ${table}`);
  return row?.total ?? 0;
}
