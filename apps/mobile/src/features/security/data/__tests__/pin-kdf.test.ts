import { derivePinVerifier } from '../pin-kdf';

describe('JavaScript PIN KDF fallback', () => {
  it('retains the existing PBKDF2 verifier format', async () => {
    const verifier = await derivePinVerifier(
      '123456',
      '0123456789abcdef'.repeat(4),
      Uint8Array.from({ length: 16 }, (_, index) => index)
    );

    expect(verifier).toBe(
      'fae24b9d5945f38cce4835448bf1ff4561953cb542ee28374b61d55dd6753e9e'
    );
  }, 60_000);
});
