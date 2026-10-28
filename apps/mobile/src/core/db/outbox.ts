import * as Crypto from 'expo-crypto';
import { sqliteDb } from './client';

export type OutboxEntity =
  | 'transactions'
  | 'categories'
  | 'merchants'
  | 'profile'
  | 'budgets'
  | 'notification_prefs'
  | 'budget_alerts_history';
export type OutboxOp = 'upsert' | 'delete';

export interface EnqueueOutboxParams {
  entity: OutboxEntity;
  entityId: string;
  op: OutboxOp;
  payload: Record<string, any>;
}

/**
 * Convierte montos en céntimos enteros a string decimal con formato Postgres ("15.50")
 */
export function centsToPostgresAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Encola una mutación en la tabla outbox de manera síncrona/atómica.
 * El payload se guarda serializado en formato JSON con convención Postgres snake_case.
 */
export function enqueueOutbox({
  entity,
  entityId,
  op,
  payload,
}: EnqueueOutboxParams): string {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const serializedPayload = JSON.stringify(payload);

  sqliteDb.runSync(
    `INSERT INTO outbox (
      id, entity, entity_id, op, payload, retries, last_error, next_attempt_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [id, entity, entityId, op, serializedPayload, now, now]
  );

  return id;
}
