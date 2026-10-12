/**
 * AhorRaso - Constantes de Desarrollo Local
 * 
 * UUID fijo de prueba para el usuario activo mientras se implementa
 * el flujo completo de autenticación (RF-018 / Supabase Auth).
 */

export const DEV_USER_ID = '00000000-0000-4000-a000-000000000001';

export const DEV_USER_PROFILE = {
  id: DEV_USER_ID,
  displayName: 'Estudiante UNSA',
  currency: 'PEN',
  locale: 'es-PE',
  timezone: 'America/Lima',
  initialBalanceCents: 10000, // S/ 100.00 de saldo inicial de prueba
  onboardingDone: 1,
} as const;
