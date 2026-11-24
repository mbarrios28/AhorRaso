export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

export const hasHardwareAsync = jest.fn(async () => false);
export const isEnrolledAsync = jest.fn(async () => false);
export const supportedAuthenticationTypesAsync = jest.fn(async () => []);
export const authenticateAsync = jest.fn(async () => ({
  success: false as const,
  error: 'not_available' as const,
}));
