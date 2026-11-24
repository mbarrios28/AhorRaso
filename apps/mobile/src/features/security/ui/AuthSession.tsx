import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { biometricService } from '../data/biometric.service';
import { configureAccessPin, localAccountService, recoverPin } from '../data/local-account.service';
import { assertCredentialKdfAvailable, getNativeInteractionAge } from '../data/pin-kdf';
import { pinService } from '../data/pin.service';
import { AUTH_DEADLINE_MS, LocalSession } from '../data/session';
import type { Credentials } from '../data/session';
import { recordAuthPhase } from '../data/auth-performance';
import { canAttemptAccess, type AccessAttempt } from '../data/access-policy';

type SecurityContextValue = {
  lock: () => void;
  activity: () => void;
};

const SecurityContext = createContext<SecurityContextValue | null>(null);

export function useSecurity(): SecurityContextValue {
  const context = useContext(SecurityContext);
  if (!context) throw new Error('Authentication session is missing');
  return context;
}

async function loadCredentials(): Promise<Credentials> {
  assertCredentialKdfAvailable();
  const [pin, password] = await Promise.allSettled([pinService.hasPin(), localAccountService.hasPin()]);
  if (pin.status === 'rejected') throw pin.reason;
  if (password.status === 'rejected' && !pin.value) throw password.reason;
  return { pin: pin.value, password: password.status === 'fulfilled' && password.value };
}

export function useAuthSession() {
  const [session] = useState(() => new LocalSession());
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const pendingRef = useRef(false);
  const layoutStart = useRef<number | null>(null);

  const startInitialization = useEffectEvent(() => { void initialize(); });

  useEffect(() => {
    const update = (status: string) => {
      session.setAppState(status, performance.now(), Date.now(), getNativeInteractionAge());
      setForeground(status === 'active');
    };
    const subscription = AppState.addEventListener('change', update);
    update(AppState.currentState ?? 'unknown');
    startInitialization();
    return () => {
      session.lock();
      subscription.remove();
    };
  }, [session]);

  useEffect(() => {
    if (!foreground || state.status !== 'unlocked') return;
    const interval = setInterval(() => session.checkInactivity(performance.now(), getNativeInteractionAge()), 250);
    return () => clearInterval(interval);
  }, [foreground, session, state.status]);

  async function initialize() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loading = loadCredentials();
    try {
      const credentials = await Promise.race([
        loading,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Credential initialization timed out')), AUTH_DEADLINE_MS);
        }),
      ]);
      session.initialize(credentials);
    } catch {
      session.initialize(null);
    } finally {
      clearTimeout(timer);
      // A timed-out native operation may still be running. Release only when it settles.
      void loading.then(release, release);
    }
  }

  function release() {
    pendingRef.current = false;
    setPending(false);
  }

  async function authenticate(attempt: AccessAttempt) {
    if (pendingRef.current || !('credentials' in state)) return;
    const { credentials } = state;
    if (!canAttemptAccess(credentials, attempt.kind)) return;
    const generation = session.begin(attempt.kind === 'biometric'
      ? (attempt.automatic ? 'automatic' : 'manual')
      : undefined);
    if (generation === null) return;

    const started = performance.now();
    pendingRef.current = true;
    setPending(true);
    setMessage('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = (async () => {
      if (attempt.kind === 'biometric') {
        return { status: (await biometricService.unlock()) ? 'valid' : 'biometric-failed' } as const;
      }
      if (attempt.kind === 'pin') return pinService.validatePin(attempt.pin);
      if (attempt.kind === 'recover') {
        return recoverPin(attempt.password, attempt.pin, attempt.confirmation);
      }
      const setup = await configureAccessPin(attempt.pin, attempt.confirmation,
        credentials.password ? attempt.password : undefined);
      if (setup.status !== 'valid') return setup;
      if (attempt.enableBiometrics && session.isCurrentAttempt(generation)) {
        const enabled = await biometricService.enable();
        if (enabled.status !== 'enabled') return { status: 'configured-without-biometrics' } as const;
      }
      return { status: 'valid' } as const;
    })();

    try {
      const result = await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Authentication timed out')), attempt.kind === 'biometric' || (attempt.kind === 'setup' && attempt.enableBiometrics) ? 60_000 : AUTH_DEADLINE_MS);
        }),
      ]);
      const now = performance.now();
      const successful = result.status === 'valid';
      const updatedCredentials = attempt.kind === 'setup' && (successful || result.status === 'configured-without-biometrics')
        ? { ...credentials, pin: true }
        : undefined;
      const unlocked = session.finish(generation, successful, now, updatedCredentials);
      recordAuthPhase('session-update', now);
      if (unlocked) layoutStart.current = started;
      if (result.status === 'invalid' || result.status === 'locked') {
        setMessage(result.retryAfterSeconds ? `Acceso rechazado. Intenta después de ${result.retryAfterSeconds} s.` : 'Credencial incorrecta.');
      } else if (result.status === 'biometric-failed') {
        setMessage('No pudimos confirmar la biometría. Usa tu PIN o vuelve a intentarlo.');
      } else if (result.status === 'configured-without-biometrics') {
        setMessage('Tu PIN quedó guardado. Úsalo para acceder.');
      } else if (!successful) {
        setMessage('No pudimos verificar tu acceso. Inténtalo nuevamente.');
      }
    } catch {
      session.finish(generation, false, performance.now());
      setMessage('No pudimos completar la verificación. Inténtalo nuevamente.');
    } finally {
      clearTimeout(timer);
      void operation.then(async () => {
        if (attempt.kind === 'setup' && session.getSnapshot().status === 'locked') {
          await loadCredentials().then((records) => session.initialize(records), () => session.initialize(null));
        }
        release();
      }, release);
    }
  }

  function financeLayout() {
    if (layoutStart.current !== null) {
      recordAuthPhase('credential-to-finance-layout', layoutStart.current);
      layoutStart.current = null;
    }
  }

  return {
    state, foreground, pending, message, authenticate, initialize, financeLayout,
    security: {
      lock: session.lock,
      activity: () => session.activity(performance.now()),
    },
  };
}

export function SecurityProvider({ value, children }: { value: SecurityContextValue; children: ReactNode }) {
  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}
