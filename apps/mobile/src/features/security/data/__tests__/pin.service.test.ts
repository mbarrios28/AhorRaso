import { createHash } from 'node:crypto';
import {
  PinService,
  PinServiceError,
  type PinServiceErrorCode,
} from '../pin.service';

class MemorySecureStore {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;
  failWriteKey: string | null = null;

  async getItemAsync(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('native storage failure');
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.failWrites || key === this.failWriteKey) {
      throw new Error('native storage failure');
    }
    this.values.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function testDeriveVerifier(pin: string, secret: string, salt: Uint8Array): Promise<string> {
  const verifier = createHash('sha256')
    .update(`${pin}:${secret}:${Buffer.from(salt).toString('hex')}`)
    .digest('hex');
  return Promise.resolve(verifier);
}

function makeRandomBytes() {
  let sequence = 0;
  return async (length: number) => {
    sequence += 1;
    return Uint8Array.from({ length }, (_, index) => (index + sequence * 17) % 256);
  };
}

function makeService(
  storage: MemorySecureStore,
  now: () => number = () => 1_000_000
): PinService {
  return new PinService({
    storage,
    randomBytes: makeRandomBytes(),
    deriveVerifier: testDeriveVerifier,
    now,
  });
}

async function configure(service: PinService, pin = '123456'): Promise<void> {
  await service.configurePin(pin, pin);
}

describe('PinService', () => {
  it('configures a six-digit PIN and stores only a derived verifier in secure storage', async () => {
    const storage = new MemorySecureStore();
    const service = makeService(storage);

    await configure(service);

    expect(await service.hasPin()).toBe(true);
    expect(storage.values.size).toBe(2);
    const serialized = [...storage.values.values()].join('|');
    expect(serialized).not.toContain('123456');
    expect([...storage.values.keys()]).toEqual(
      expect.arrayContaining([
        'ahorraso.local-pin.record.v1',
        'ahorraso.local-pin.secret.v1',
      ])
    );
  });

  it.each(['12345', '1234567', '12a456', '１２３４５６'])(
    'rejects malformed PIN %s',
    async (pin) => {
      const service = makeService(new MemorySecureStore());
      await expect(service.configurePin(pin, pin)).rejects.toMatchObject({
        code: 'INVALID_FORMAT',
      });
    }
  );

  it('rejects a confirmation mismatch without storing a PIN', async () => {
    const storage = new MemorySecureStore();
    const service = makeService(storage);

    await expect(service.configurePin('123456', '654321')).rejects.toMatchObject({
      code: 'CONFIRMATION_MISMATCH',
    });
    expect(storage.values.size).toBe(0);
  });

  it('does not replace a configured PIN without authorization', async () => {
    const storage = new MemorySecureStore();
    const service = makeService(storage);
    await configure(service);
    const before = [...storage.values.entries()];

    await expect(configure(service, '654321')).rejects.toMatchObject({
      code: 'ALREADY_CONFIGURED',
    });
    expect([...storage.values.entries()]).toEqual(before);
  });

  it('validates the PIN and rejects an incorrect one', async () => {
    const service = makeService(new MemorySecureStore());
    await configure(service);

    expect(await service.validatePin('123456')).toEqual({ status: 'valid' });
    expect(await service.validatePin('111111')).toEqual({
      status: 'invalid',
      retryAfterSeconds: 5,
    });
  });

  it('rejects malformed validation input and reports an unconfigured state', async () => {
    const service = makeService(new MemorySecureStore());

    expect(await service.validatePin('123')).toEqual({
      status: 'invalid',
      retryAfterSeconds: 0,
    });
    expect(await service.validatePin('123456')).toEqual({ status: 'not-configured' });
  });

  it('changes the PIN only after validating the current PIN', async () => {
    const service = makeService(new MemorySecureStore());
    await configure(service);

    expect(await service.changePin('123456', '654321', '654321')).toEqual({
      status: 'valid',
    });
    expect(await service.validatePin('654321')).toEqual({ status: 'valid' });
    expect(await service.validatePin('123456')).toMatchObject({ status: 'invalid' });
  });

  it('does not change the PIN when the current PIN is incorrect', async () => {
    const service = makeService(new MemorySecureStore());
    await configure(service);

    expect(await service.changePin('000000', '654321', '654321')).toMatchObject({
      status: 'invalid',
    });
    expect(await service.validatePin('123456')).toMatchObject({ status: 'locked' });
  });

  it('persists failed-attempt delays across service instances', async () => {
    const storage = new MemorySecureStore();
    let now = 1_000_000;
    const firstService = makeService(storage, () => now);
    await configure(firstService);

    expect(await firstService.validatePin('000000')).toMatchObject({
      status: 'invalid',
      retryAfterSeconds: 5,
    });

    const restartedService = makeService(storage, () => now);
    expect(await restartedService.validatePin('123456')).toEqual({
      status: 'locked',
      retryAfterSeconds: 5,
    });

    now += 5_000;
    expect(await restartedService.validatePin('123456')).toEqual({ status: 'valid' });
  });

  it('applies progressively longer delays for consecutive failures', async () => {
    const storage = new MemorySecureStore();
    let now = 1_000_000;
    const service = makeService(storage, () => now);
    await configure(service);

    expect(await service.validatePin('000000')).toMatchObject({
      status: 'invalid',
      retryAfterSeconds: 5,
    });
    now += 5_000;
    expect(await service.validatePin('000000')).toMatchObject({
      status: 'invalid',
      retryAfterSeconds: 10,
    });
    expect(await service.validatePin('123456')).toMatchObject({
      status: 'locked',
      retryAfterSeconds: 10,
    });
  });

  it('returns an explicit error for SecureStore failures instead of accepting a PIN', async () => {
    const storage = new MemorySecureStore();
    const service = makeService(storage);
    await configure(service);
    storage.failReads = true;

    expect(await service.validatePin('123456')).toEqual({ status: 'error' });
    await expect(service.hasPin()).rejects.toBeInstanceOf(PinServiceError);
  });

  it('surfaces SecureStore write errors during setup', async () => {
    const storage = new MemorySecureStore();
    storage.failWrites = true;
    const service = makeService(storage);

    await expect(configure(service)).rejects.toMatchObject({
      code: 'STORAGE_ERROR' satisfies PinServiceErrorCode,
    });
  });

  it('removes a partial secret if saving the verifier fails', async () => {
    const storage = new MemorySecureStore();
    storage.failWriteKey = 'ahorraso.local-pin.record.v1';
    const service = makeService(storage);

    await expect(configure(service)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(storage.values.size).toBe(0);
  });
});
