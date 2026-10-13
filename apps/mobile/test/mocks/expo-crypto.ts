/**
 * Mock de expo-crypto para Jest (entorno Node).
 * Genera UUID v4 usando `node:crypto`, suficiente para las tablas de la app.
 *
 * `import * as Crypto from 'expo-crypto'` requiere exports nombrados, por lo
 * que cada función se exporta individualmente y además en el objeto por
 * defecto.
 */
import { randomUUID } from 'node:crypto';

export function randomUUIDMock(): string {
  return randomUUID();
}

export function getRandomBytesMock(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function getRandomValuesMock<T extends Uint8Array>(array: T): T {
  const random = getRandomBytesMock(array.length);
  array.set(random);
  return array;
}

export async function digestStringAsyncMock(_data: string): Promise<string> {
  return randomUUID();
}

export async function getRandomBytesAsyncMock(length: number): Promise<Uint8Array> {
  return getRandomBytesMock(length);
}

export const getRandomBytes = getRandomBytesMock;
export const getRandomValues = getRandomValuesMock;
export const getRandomBytesAsync = getRandomBytesAsyncMock;
export const digestStringAsync = digestStringAsyncMock;
export const digest = digestStringAsyncMock;
export { randomUUID };

export const Crypto = {
  randomUUID: randomUUIDMock,
  uuidv4: randomUUIDMock,
  getRandomBytes: getRandomBytesMock,
  getRandomValues: getRandomValuesMock,
  getRandomBytesAsync: getRandomBytesAsyncMock,
  digestStringAsync: digestStringAsyncMock,
  digest: digestStringAsyncMock,
};

export default Crypto;
