import { bytesToHex } from '@noble/hashes/utils.js';
import { derivePinVerifier as derivePinVerifierJs } from './pin-kdf.shared';

interface NativePinKdf {
  deriveVerifier(pin: string, secret: string, saltHex: string): Promise<string>;
}

interface ExpoModulesCore {
  requireOptionalNativeModule<T>(name: string): T | null;
}

// Load Expo's native registry only in Android bundles, without importing its Node-incompatible types into Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requireOptionalNativeModule } = require('expo-modules-core') as ExpoModulesCore;
const nativePinKdf = requireOptionalNativeModule<NativePinKdf>('AhorRasoPinKdf');

export async function derivePinVerifier(
  pin: string,
  secret: string,
  salt: Uint8Array
): Promise<string> {
  if (!nativePinKdf) {
    return derivePinVerifierJs(pin, secret, salt);
  }
  return nativePinKdf.deriveVerifier(pin, secret, bytesToHex(salt));
}
