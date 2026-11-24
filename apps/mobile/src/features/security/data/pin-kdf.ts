export { derivePinVerifier, derivePinVerifier as derivePasswordVerifier } from './pin-kdf.shared';

export function assertCredentialKdfAvailable(): void {
  // This adapter uses the portable implementation.
}

export function getNativeInteractionAge(): undefined {
  return undefined;
}
