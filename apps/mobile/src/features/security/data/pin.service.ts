import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { derivePinVerifier } from './pin-kdf';

const PIN_RECORD_KEY = 'ahorraso.local-pin.record.v1';
const PIN_SECRET_KEY = 'ahorraso.local-pin.secret.v1';
const KDF_OUTPUT_BYTES = 32;
const SALT_BYTES = 16;
const SECRET_BYTES = 32;
const INITIAL_LOCK_MS = 5_000;
const MAX_LOCK_MS = 15 * 60_000;

interface PinRecord {
  version: 1;
  salt: string;
  verifier: string;
  failedAttempts: number;
  blockedUntil: number;
}

interface PinStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

type DeriveVerifier = (
  pin: string,
  secret: string,
  salt: Uint8Array
) => Promise<string>;

interface PinServiceOptions {
  storage?: PinStorage;
  randomBytes?: (byteCount: number) => Promise<Uint8Array>;
  deriveVerifier?: DeriveVerifier;
  now?: () => number;
}

export type PinValidationResult =
  | { status: 'valid' }
  | { status: 'invalid'; retryAfterSeconds: number }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'not-configured' }
  | { status: 'error' };

export type PinServiceErrorCode =
  | 'INVALID_FORMAT'
  | 'CONFIRMATION_MISMATCH'
  | 'ALREADY_CONFIGURED'
  | 'STORAGE_ERROR'
  | 'CRYPTO_ERROR';

export class PinServiceError extends Error {
  constructor(readonly code: PinServiceErrorCode) {
    super(code);
    this.name = 'PinServiceError';
  }
}

function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

function isHex(value: string, length: number): boolean {
  return value.length === length && /^[0-9a-f]+$/i.test(value);
}

function parseRecord(value: string): PinRecord {
  try {
    const record = JSON.parse(value) as Partial<PinRecord>;
    if (
      record.version !== 1 ||
      typeof record.salt !== 'string' ||
      !isHex(record.salt, SALT_BYTES * 2) ||
      typeof record.verifier !== 'string' ||
      !isHex(record.verifier, KDF_OUTPUT_BYTES * 2) ||
      !Number.isSafeInteger(record.failedAttempts) ||
      (record.failedAttempts as number) < 0 ||
      !Number.isFinite(record.blockedUntil) ||
      (record.blockedUntil as number) < 0
    ) {
      throw new Error();
    }
    return record as PinRecord;
  } catch {
    throw new PinServiceError('STORAGE_ERROR');
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function retryDelay(failedAttempts: number): number {
  const exponent = Math.min(failedAttempts - 1, 20);
  return Math.min(MAX_LOCK_MS, INITIAL_LOCK_MS * 2 ** exponent);
}

export class PinService {
  private readonly storage: PinStorage;
  private readonly randomBytes: (byteCount: number) => Promise<Uint8Array>;
  private readonly deriveVerifier: DeriveVerifier;
  private readonly now: () => number;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(options: PinServiceOptions = {}) {
    this.storage = options.storage ?? SecureStore;
    this.randomBytes = options.randomBytes ?? Crypto.getRandomBytesAsync;
    this.deriveVerifier = options.deriveVerifier ?? derivePinVerifier;
    this.now = options.now ?? Date.now;
  }

  async hasPin(): Promise<boolean> {
    return this.exclusive(async () => {
      const record = await this.readRecord();
      if (!record) return false;
      await this.readSecret();
      return true;
    });
  }

  async configurePin(pin: string, confirmation: string): Promise<void> {
    this.assertPin(pin);
    if (pin !== confirmation) {
      throw new PinServiceError('CONFIRMATION_MISMATCH');
    }

    await this.exclusive(async () => {
      if (await this.readRecord()) {
        throw new PinServiceError('ALREADY_CONFIGURED');
      }

      const secret = await this.createRandomHex(SECRET_BYTES);
      const salt = await this.createRandomBytes(SALT_BYTES);
      const verifier = await this.createVerifier(pin, secret, salt);
      const record: PinRecord = {
        version: 1,
        salt: bytesToHex(salt),
        verifier,
        failedAttempts: 0,
        blockedUntil: 0,
      };

      await this.setItem(PIN_SECRET_KEY, secret);
      try {
        await this.setItem(PIN_RECORD_KEY, JSON.stringify(record));
      } catch {
        await this.deleteItem(PIN_SECRET_KEY);
        throw new PinServiceError('STORAGE_ERROR');
      }
    });
  }

  async validatePin(pin: string): Promise<PinValidationResult> {
    if (!isValidPin(pin)) return { status: 'invalid', retryAfterSeconds: 0 };
    try {
      return await this.exclusive(() => this.validateStoredPin(pin));
    } catch {
      return { status: 'error' };
    }
  }

  async changePin(
    currentPin: string,
    newPin: string,
    confirmation: string
  ): Promise<PinValidationResult> {
    if (!isValidPin(newPin)) {
      throw new PinServiceError('INVALID_FORMAT');
    }
    if (newPin !== confirmation) {
      throw new PinServiceError('CONFIRMATION_MISMATCH');
    }

    try {
      return await this.exclusive(async () => {
        if (!isValidPin(currentPin)) {
          return { status: 'invalid', retryAfterSeconds: 0 };
        }

        const record = await this.readRecord();
        if (!record) return { status: 'not-configured' };

        const locked = this.lockedResult(record);
        if (locked) return locked;

        const secret = await this.readSecret();
        const currentVerifier = await this.createVerifier(
          currentPin,
          secret,
          hexToBytes(record.salt)
        );
        if (!constantTimeEqual(record.verifier, currentVerifier)) {
          return this.recordFailure(record);
        }

        const salt = await this.createRandomBytes(SALT_BYTES);
        const verifier = await this.createVerifier(newPin, secret, salt);
        await this.saveRecord({
          version: 1,
          salt: bytesToHex(salt),
          verifier,
          failedAttempts: 0,
          blockedUntil: 0,
        });
        return { status: 'valid' };
      });
    } catch {
      return { status: 'error' };
    }
  }

  private async validateStoredPin(pin: string): Promise<PinValidationResult> {
    const record = await this.readRecord();
    if (!record) return { status: 'not-configured' };

    const locked = this.lockedResult(record);
    if (locked) return locked;

    const secret = await this.readSecret();
    const verifier = await this.createVerifier(
      pin,
      secret,
      hexToBytes(record.salt)
    );
    if (!constantTimeEqual(record.verifier, verifier)) {
      return this.recordFailure(record);
    }

    if (record.failedAttempts > 0 || record.blockedUntil > 0) {
      await this.saveRecord({ ...record, failedAttempts: 0, blockedUntil: 0 });
    }
    return { status: 'valid' };
  }

  private lockedResult(record: PinRecord): PinValidationResult | null {
    const remaining = record.blockedUntil - this.now();
    if (remaining <= 0) return null;
    return {
      status: 'locked',
      retryAfterSeconds: Math.ceil(remaining / 1000),
    };
  }

  private async recordFailure(record: PinRecord): Promise<PinValidationResult> {
    const failedAttempts = Math.min(record.failedAttempts + 1, 2_147_483_647);
    const delay = retryDelay(failedAttempts);
    await this.saveRecord({
      ...record,
      failedAttempts,
      blockedUntil: this.now() + delay,
    });
    return {
      status: 'invalid',
      retryAfterSeconds: Math.ceil(delay / 1000),
    };
  }

  private async readRecord(): Promise<PinRecord | null> {
    const value = await this.getItem(PIN_RECORD_KEY);
    return value === null ? null : parseRecord(value);
  }

  private async readSecret(): Promise<string> {
    const secret = await this.getItem(PIN_SECRET_KEY);
    if (!secret || !isHex(secret, SECRET_BYTES * 2)) {
      throw new PinServiceError('STORAGE_ERROR');
    }
    return secret;
  }

  private async createRandomBytes(byteCount: number): Promise<Uint8Array> {
    try {
      const bytes = await this.randomBytes(byteCount);
      if (bytes.length !== byteCount) throw new Error();
      return bytes;
    } catch {
      throw new PinServiceError('CRYPTO_ERROR');
    }
  }

  private async createRandomHex(byteCount: number): Promise<string> {
    return bytesToHex(await this.createRandomBytes(byteCount));
  }

  private async createVerifier(
    pin: string,
    secret: string,
    salt: Uint8Array
  ): Promise<string> {
    const verifier = await this.deriveVerifier(pin, secret, salt);
    if (!isHex(verifier, KDF_OUTPUT_BYTES * 2)) {
      throw new PinServiceError('CRYPTO_ERROR');
    }
    return verifier.toLowerCase();
  }

  private async getItem(key: string): Promise<string | null> {
    try {
      return await this.storage.getItemAsync(key);
    } catch {
      throw new PinServiceError('STORAGE_ERROR');
    }
  }

  private async setItem(key: string, value: string): Promise<void> {
    try {
      await this.storage.setItemAsync(key, value);
    } catch {
      throw new PinServiceError('STORAGE_ERROR');
    }
  }

  private async deleteItem(key: string): Promise<void> {
    try {
      await this.storage.deleteItemAsync(key);
    } catch {
      throw new PinServiceError('STORAGE_ERROR');
    }
  }

  private async saveRecord(record: PinRecord): Promise<void> {
    await this.setItem(PIN_RECORD_KEY, JSON.stringify(record));
  }

  private assertPin(pin: string): void {
    if (!isValidPin(pin)) {
      throw new PinServiceError('INVALID_FORMAT');
    }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.operationQueue.then(operation);
    this.operationQueue = current.then(
      () => undefined,
      () => undefined
    );
    return current;
  }
}

export const pinService = new PinService();
