import { requireOptionalNativeModule } from 'expo';
import { bytesToHex } from '@noble/hashes/utils.js';
import { CredentialKdfUnavailableError } from './kdf-error';

interface NativePinKdf {
  interactionAgeMs(): number;
  deriveVerifier(pin: string, secret: string, saltHex: string): Promise<string>;
  derivePasswordVerifier(password: string, secret: string, saltHex: string): Promise<string>;
}

const nativePinKdf = requireOptionalNativeModule<NativePinKdf>('AhorRasoPinKdf');

export async function derivePinVerifier(
  pin: string,
  secret: string,
  salt: Uint8Array
): Promise<string> {
  if (!nativePinKdf) {
    throw new CredentialKdfUnavailableError();
  }
  return nativePinKdf.deriveVerifier(pin, secret, bytesToHex(salt));
}

export async function derivePasswordVerifier(
  password: string,
  secret: string,
  salt: Uint8Array
): Promise<string> {
  if (!nativePinKdf) throw new CredentialKdfUnavailableError();
  return nativePinKdf.derivePasswordVerifier(password, secret, bytesToHex(salt));
}

export function assertCredentialKdfAvailable(): void {
  if (typeof nativePinKdf?.deriveVerifier !== 'function' ||
      typeof nativePinKdf.derivePasswordVerifier !== 'function' ||
      typeof nativePinKdf.interactionAgeMs !== 'function') {
    throw new CredentialKdfUnavailableError();
  }
}

export function getNativeInteractionAge(): number | undefined {
  return nativePinKdf?.interactionAgeMs?.();
}
