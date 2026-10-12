import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

/**
 * Nombre canónico del archivo SQLite local.
 */
export const DB_NAME = 'ahorraso.db';

/**
 * Instancia síncrona de SQLite a través de JSI nativo.
 */
export const sqliteDb = SQLite.openDatabaseSync(DB_NAME);

/**
 * Cliente Drizzle configurado con el esquema relacional de AhorRaso.
 */
export const db = drizzle(sqliteDb, { schema });
