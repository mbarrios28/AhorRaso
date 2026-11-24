export const LOCK_AFTER_MS = 60_000;
export const AUTH_DEADLINE_MS = 15_000;

export type Credentials = { password: boolean; pin: boolean };
export type SessionState =
  | { status: 'initializing' | 'error' }
  | { status: 'locked' | 'authenticating' | 'unlocked'; credentials: Credentials };

export function canRenderFinancialRoutes(state: SessionState, foreground: boolean): boolean {
  return foreground && state.status === 'unlocked';
}

export class LocalSession {
  private state: SessionState = { status: 'initializing' };
  private readonly listeners = new Set<() => void>();
  private active = false;
  private backgroundAt: { monotonic: number; wall: number } | null = null;
  private lastActivity = 0;
  private generation = 0;
  private biometricPromptUsed = false;

  getSnapshot = (): SessionState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: SessionState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  initialize(credentials: Credentials | null): void {
    this.generation += 1;
    this.publish(credentials ? { status: 'locked', credentials } : { status: 'error' });
  }

  setAppState(next: string, now: number, wallTime: number, interactionAge?: number): void {
    if (next !== 'active') this.checkInactivity(now, interactionAge);
    this.active = next === 'active';
    if (next === 'background') {
      this.backgroundAt ??= { monotonic: now, wall: wallTime };
      if (this.state.status === 'authenticating') this.lock();
    }
    if (this.active && this.backgroundAt !== null) {
      const elapsedWall = wallTime - this.backgroundAt.wall;
      const elapsedMonotonic = now - this.backgroundAt.monotonic;
      this.backgroundAt = null;
      if (elapsedWall < 0 || Math.max(elapsedWall, elapsedMonotonic) >= LOCK_AFTER_MS) this.lock();
      // Foreground inactivity and time minimized are independent.
      this.lastActivity = now;
    } else if (this.active) {
      this.checkInactivity(now, interactionAge);
    }
  }

  activity(now: number): void {
    this.checkInactivity(now);
    if (this.active && this.state.status === 'unlocked') this.lastActivity = now;
  }

  checkInactivity(now: number, interactionAge?: number): void {
    if (this.active && this.state.status === 'unlocked' && interactionAge !== undefined && interactionAge >= 0) {
      const interactionAt = now - interactionAge;
      if (interactionAt - this.lastActivity < LOCK_AFTER_MS) {
        this.lastActivity = Math.max(this.lastActivity, interactionAt);
      }
    }
    if (this.active && this.state.status === 'unlocked' && now - this.lastActivity >= LOCK_AFTER_MS) {
      this.lock();
    }
  }

  begin(biometric?: 'automatic' | 'manual'): number | null {
    if (!this.active || this.state.status !== 'locked') return null;
    if (biometric === 'automatic' && this.biometricPromptUsed) return null;
    if (biometric) this.biometricPromptUsed = true;
    const generation = ++this.generation;
    this.publish({ status: 'authenticating', credentials: this.state.credentials });
    return generation;
  }

  finish(generation: number, authorized: boolean, now: number, credentials?: Credentials): boolean {
    if (this.state.status !== 'authenticating' || generation !== this.generation) return false;
    const nextCredentials = credentials ?? this.state.credentials;
    const unlocked = authorized && this.active && nextCredentials.pin;
    if (unlocked) {
      this.lastActivity = now;
      this.biometricPromptUsed = false;
    }
    this.publish({
      status: unlocked ? 'unlocked' : 'locked',
      credentials: nextCredentials,
    });
    return unlocked;
  }

  isCurrentAttempt(generation: number): boolean {
    return this.active && this.state.status === 'authenticating' && this.generation === generation;
  }

  lock = (): void => {
    this.generation += 1;
    if ('credentials' in this.state && this.state.status !== 'locked') {
      this.publish({ status: 'locked', credentials: this.state.credentials });
    }
  };
}
