// Stable owner of locally stored financial records.
export const DEV_USER_ID = '00000000-0000-4000-a000-000000000001';

export const LEGACY_DEMO_PROFILE_NAME = 'Estudiante UNSA';

export const DEV_USER_PROFILE = {
  id: DEV_USER_ID,
  displayName: null,
  currency: 'PEN',
  locale: 'es-PE',
  timezone: 'America/Lima',
  initialBalanceCents: 0,
  onboardingDone: 1,
} as const;
