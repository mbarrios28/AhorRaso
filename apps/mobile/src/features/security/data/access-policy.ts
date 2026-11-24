import type { Credentials } from './session';

export type AccessAttempt =
  | { kind: 'pin'; pin: string }
  | { kind: 'biometric'; automatic?: boolean }
  | { kind: 'setup'; pin: string; confirmation: string; password: string; enableBiometrics: boolean }
  | { kind: 'recover'; pin: string; confirmation: string; password: string };

export function canAttemptAccess(credentials: Credentials, kind: AccessAttempt['kind']): boolean {
  if (kind === 'setup') return !credentials.pin;
  if (kind === 'recover') return credentials.pin && credentials.password;
  return credentials.pin;
}

export function accessPresentation(hasPin: boolean, biometricPreferred: boolean, usePin: boolean) {
  if (!hasPin) return 'setup';
  return biometricPreferred && !usePin ? 'biometric' : 'pin';
}
