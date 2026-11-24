import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const KDF_ITERATIONS = 600_000;
const KDF_OUTPUT_BYTES = 32;

export async function derivePinVerifier(
  pin: string,
  secret: string,
  salt: Uint8Array
): Promise<string> {
  const derived = await pbkdf2Async(sha256, `${pin}${secret}`, salt, {
    c: KDF_ITERATIONS,
    dkLen: KDF_OUTPUT_BYTES,
  });
  return bytesToHex(derived);
}
