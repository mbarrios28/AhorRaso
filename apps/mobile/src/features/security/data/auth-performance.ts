type Phase = 'queue' | 'secure-read' | 'kdf' | 'compare' | 'secure-write' |
  'session-update' | 'credential-to-finance-layout';

export function recordAuthPhase(phase: Phase, start: number): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_AUTH_TIMING === '1') {
    console.info('[auth-timing]', phase, Math.round((performance.now() - start) * 10) / 10);
  }
}

export async function measureAuthPhase<T>(phase: Phase, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    recordAuthPhase(phase, start);
  }
}
