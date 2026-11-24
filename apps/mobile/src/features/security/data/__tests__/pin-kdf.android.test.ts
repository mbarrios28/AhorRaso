const mockRegistry = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (...args: unknown[]) => mockRegistry(...args),
}));

async function load() {
  jest.resetModules();
  return import('../pin-kdf.android');
}

it('fails securely without a native module', async () => {
  mockRegistry.mockReturnValue(null);
  const { derivePinVerifier, assertCredentialKdfAvailable } = await load();
  expect(() => assertCredentialKdfAvailable()).toThrow('Native credential verification is unavailable');
  await expect(derivePinVerifier('123456', '0'.repeat(64), new Uint8Array(16)))
    .rejects.toThrow('Native credential verification is unavailable');
});

it('passes the legacy PIN bytes to the registered Android module', async () => {
  const native = jest.fn().mockResolvedValue('ok');
  mockRegistry.mockReturnValue({ deriveVerifier: native });
  const { derivePinVerifier } = await load();
  await expect(derivePinVerifier('123456', '0'.repeat(64), new Uint8Array(16))).resolves.toBe('ok');
  expect(mockRegistry).toHaveBeenCalledWith('AhorRasoPinKdf');
  expect(native).toHaveBeenCalledWith('123456', '0'.repeat(64), '0'.repeat(32));
});

it('rejects an old native module that lacks the capabilities required by this build', async () => {
  mockRegistry.mockReturnValue({ deriveVerifier: jest.fn() });
  const { assertCredentialKdfAvailable } = await load();
  expect(() => assertCredentialKdfAvailable()).toThrow('Native credential verification is unavailable');
});
