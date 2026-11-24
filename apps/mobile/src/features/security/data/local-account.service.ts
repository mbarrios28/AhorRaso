import { PinService, pinService } from './pin.service';
import { derivePasswordVerifier } from './pin-kdf';

export function isValidPassword(value: string): boolean {
  // Printable ASCII keeps the JCA and portable PBKDF2 inputs identical.
  return value.length <= 128 && value.trim().length >= 12 && !/[^ -~]/.test(value);
}

// One device-local account controls access to the existing financial profile.
export const localAccountService = new PinService({
  keys: {
    record: 'ahorraso.local-account.password.record.v1',
    secret: 'ahorraso.local-account.password.secret.v1',
  },
  isValidInput: isValidPassword,
  deriveVerifier: derivePasswordVerifier,
});

export async function recoverPin(password: string, pin: string, confirmation: string) {
  const verification = await localAccountService.validatePin(password);
  if (verification.status !== 'valid') return verification;
  await pinService.replaceConfiguredPin(pin, confirmation);
  return verification;
}

// Installations with a previous password must prove possession before adding a PIN.
export async function configureAccessPin(pin: string, confirmation: string, legacyPassword?: string) {
  if (legacyPassword !== undefined) {
    const proof = await localAccountService.validatePin(legacyPassword);
    if (proof.status !== 'valid') return proof;
  }
  await pinService.configurePin(pin, confirmation);
  return { status: 'valid' } as const;
}
