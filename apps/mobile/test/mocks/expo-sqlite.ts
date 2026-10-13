/**
 * Mock de expo-sqlite para Jest (entorno Node).
 *
 * Implementa el subconjunto de la API de `expo-sqlite` que Drizzle usa a través de
 * `drizzleORM/expo-sqlite` (SQLite3SessionSync: prepareSync / executeSync /
 * executeAsync / executeForRawResultSync), respaldado por `node:sqlite` (Node >= 22).
 *
 * Diferencias con el runtime de Expo que este mock normaliza:
 *  - `node:sqlite` no acepta `undefined` ni `boolean` como parámetros ->
 *    se convierten a `null` / 0 / 1.
 *  - `stmt.get()` devuelve `undefined` sin filas -> se devuelve `null`.
 */
type SqliteValue = null | number | bigint | string | Uint8Array;
type SqliteParams = Array<unknown>;

interface NodeSqliteStatement {
  run(...params: SqliteValue[]): { changes: number | bigint; lastInsertRowId: number | bigint };
  get(...params: SqliteValue[]): unknown;
  all(...params: SqliteValue[]): unknown[];
  sourceSQL?: string;
}

interface NodeSqliteDatabase {
  prepare(sql: string): NodeSqliteStatement;
  exec(sql: string): void;
  close(): void;
}

function toSqliteValue(value: unknown): SqliteValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqliteValue;
}

function toSqliteParams(params: SqliteParams): SqliteValue[] {
  return params.map(toSqliteValue);
}

export class SQLiteError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'SQLiteError';
    this.code = code;
  }
}

/** Envuelve los errores de `node:sqlite` para que tengan `.code` como en expo-sqlite. */
function wrapError(error: unknown): never {
  if (error instanceof Error) {
    const code =
      (error as { code?: unknown }).code === undefined
        ? 'SQLITE_ERROR'
        : String((error as { code?: unknown }).code);
    const wrapped = new SQLiteError(error.message, code);
    wrapped.stack = error.stack;
    throw wrapped;
  }
  throw error;
}

export interface ExecutionContext {
  lastInsertRowId: number;
  changes: number;
}

class MockStatement {
  private readonly stmt: NodeSqliteStatement;
  private rows: Array<Record<string, unknown>> = [];
  private rowIndex = 0;

  constructor(stmt: NodeSqliteStatement) {
    this.stmt = stmt;
  }

  run(...params: SqliteParams): ExecutionContext {
    try {
      const result = this.stmt.run(...toSqliteParams(params));
      return {
        lastInsertRowId: Number(result.lastInsertRowId),
        changes: Number(result.changes),
      };
    } catch (error) {
      wrapError(error);
    }
  }

  get(...params: SqliteParams): Record<string, unknown> | null {
    try {
      const row = this.stmt.get(...toSqliteParams(params));
      return (row ?? null) as Record<string, unknown> | null;
    } catch (error) {
      wrapError(error);
    }
  }

  all(...params: SqliteParams): Array<Record<string, unknown>> {
    try {
      return this.stmt.all(...toSqliteParams(params)) as Array<Record<string, unknown>>;
    } catch (error) {
      wrapError(error);
    }
  }

  iterate(...params: SqliteParams): IterableIterator<Record<string, unknown>> {
    return this.all(...params)[Symbol.iterator]();
  }

  // --- API usada por drizzleORM/expo-sqlite ---------------------------------

  executeSync(params: SqliteParams = []): ExecutionContext {
    const isSelect = /^\s*(select|with|pragma|explain|values)\b/i.test(this.sql);
    if (isSelect) {
      this.rows = this.all(...params);
      this.rowIndex = 0;
      return { lastInsertRowId: 0, changes: this.rows.length };
    }
    return this.run(...params);
  }

  async execute(params: SqliteParams = []): Promise<ExecutionContext> {
    return this.executeSync(params);
  }

  /**
   * Drizzle llama `stmt.executeForRawResultSync(params).getAllSync()` y espera
   * la fila en formato posicional (una columna por índice), porque después
   * aplica `mapResultRow(fields, row)` con `row[columnIndex]`.
   */
  executeForRawResultSync(params: SqliteParams = []): MockStatement {
    this.rows = this.all(...params);
    this.rowIndex = 0;
    return this;
  }

  async executeForRawResult(params: SqliteParams = []): Promise<MockStatement> {
    return this.executeForRawResultSync(params);
  }

  /**
   * `node:sqlite` devuelve las claves de la fila en el mismo orden en que las
   * columnas aparecen en el SELECT, que es exactamente el orden posicional que
   * Drizzle espera en `mapResultRow` (`row[columnIndex]`). Esto vale tanto
   * para selects de columnas de tabla como para selects de expresiones
   * (`count(*)`, etc.), cuyas claves no corresponden a columnas físicas.
   */
  private positionalRows(): unknown[][] {
    return this.rows.map((row) => Object.values(row));
  }

  getAllSync(): unknown[][] {
    return this.positionalRows();
  }

  getFirstSync(): unknown[] | null {
    const rows = this.positionalRows();
    if (this.rowIndex < rows.length) {
      return rows[this.rowIndex++];
    }
    return null;
  }

  values(...params: SqliteParams): unknown[][] {
    return this.executeForRawResultSync(params).positionalRows();
  }

  valuesSync(...params: SqliteParams): unknown[][] {
    return this.values(...params);
  }

  get isReadOnly(): boolean {
    return /^\s*(select|with|pragma|explain|values)\b/i.test(this.sql);
  }

  get sql(): string {
    return this.stmt.sourceSQL ?? '';
  }

  setAllowBareNamedParameters(_enabled: boolean): this {
    return this;
  }

  setReadBigInts(_enabled: boolean): this {
    return this;
  }

  expandedSQL(): string {
    return this.sql;
  }

  toString(): string {
    return this.sql;
  }
}

export interface SQLiteOpenOptions {
  /** No usado por el mock (expo-sqlite abre en memoria de forma predeterminada). */
  enableForeignKeyConstraints?: boolean;
}

export class SQLiteInstance {
  readonly db: NodeSqliteDatabase;
  private readonly statements = new Map<string, MockStatement>();

  constructor(pathOrOptions: string | SQLiteOpenOptions = ':memory:') {
    // Cada instancia del mock usa SIEMPRE una BD en memoria independiente.
    // Aísla los tests entre sí y evita que los workers paralelos de Jest se
    // bloqueen entre sí compartiendo un archivo `ahorraso.db` en disco.
    void pathOrOptions;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (
        path: string,
        options?: { enableForeignKeyConstraints?: boolean },
      ) => NodeSqliteDatabase;
    };
    this.db = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
  }

  prepareSync(sql: string): MockStatement {
    let cached = this.statements.get(sql);
    if (!cached) {
      try {
        cached = new MockStatement(this.db.prepare(sql));
      } catch (error) {
        wrapError(error);
      }
      this.statements.set(sql, cached!);
    }
    return cached;
  }

  prepareAsync(sql: string): Promise<MockStatement> {
    return Promise.resolve(this.prepareSync(sql));
  }

  closeSync(): void {
    this.db.close();
  }

  closeAsync(): Promise<void> {
    this.closeSync();
    return Promise.resolve();
  }

  // --- API de transacciones usada por drizzleORM/expo-sqlite ----------------

  async beginTransaction(): Promise<void> {
    this.db.exec('BEGIN');
  }

  async commitTransaction(): Promise<void> {
    this.db.exec('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    this.db.exec('ROLLBACK');
  }

  async rollbackTransactionAsync(): Promise<void> {
    this.db.exec('ROLLBACK');
  }

  openTransactionSync(): void {
    this.db.exec('BEGIN');
  }

  closeTransactionSync(): void {
    this.db.exec('COMMIT');
  }

  async openTransaction(): Promise<void> {
    this.db.exec('BEGIN');
  }

  async closeTransaction(): Promise<void> {
    this.db.exec('COMMIT');
  }

  get isTransactionActive(): boolean {
    return false;
  }

  getAllSync<T = unknown>(sql: string, params: SqliteParams = []): T[] {
    return this.prepareSync(sql).all(...toSqliteParams(params)) as T[];
  }

  getFirstSync<T = unknown>(sql: string, params: SqliteParams = []): T | null {
    const row = this.prepareSync(sql).get(...toSqliteParams(params));
    return (row ?? null) as T | null;
  }

  runSync(sql: string, params: SqliteParams = []): ExecutionContext {
    return this.prepareSync(sql).run(...toSqliteParams(params));
  }

  execSync(sql: string): void {
    try {
      this.db.exec(sql);
    } catch (error) {
      wrapError(error);
    }
  }
}

// --- API de nivel de módulo de expo-sqlite -----------------------------------

const instances = new Map<string, SQLiteInstance>();

export function openDatabaseSync(
  nameOrOptions: string | SQLiteOpenOptions = ':memory:',
): SQLiteInstance {
  const key = typeof nameOrOptions === 'string' ? nameOrOptions : JSON.stringify(nameOrOptions);
  let instance = instances.get(key);
  if (!instance) {
    instance = new SQLiteInstance(nameOrOptions);
    instances.set(key, instance);
  }
  return instance;
}

export function openDatabase(
  nameOrOptions: string | SQLiteOpenOptions = ':memory:',
): Promise<SQLiteInstance> {
  return Promise.resolve(openDatabaseSync(nameOrOptions));
}

/** Cierra y olvida todas las bases abiertas por el mock (útil entre tests). */
export function closeAllDatabasesSync(): void {
  for (const instance of instances.values()) {
    try {
      instance.closeSync();
    } catch {
      // Ya cerrada.
    }
  }
  instances.clear();
}

export function deleteDatabaseSync(): void {
  closeAllDatabasesSync();
}

export default {
  openDatabase,
  openDatabaseSync,
  deleteDatabaseSync,
  SQLiteError,
};
