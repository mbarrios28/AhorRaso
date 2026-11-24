import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { PinValidationResult } from './pin.service';
import { pinService } from './pin.service';
import { biometricBinding } from './biometric-binding';

const BIOMETRIC_PREFERENCE_KEY = 'ahorraso.local-biometric.enabled.v1';

type LocalAuthenticationApi = Pick<
  typeof LocalAuthentication,
  | 'hasHardwareAsync'
  | 'isEnrolledAsync'
  | 'supportedAuthenticationTypesAsync'
  | 'authenticateAsync'
>;

interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

interface PinAccess {
  hasPin(): Promise<boolean>;
  validatePin(pin: string): Promise<PinValidationResult>;
}

interface BiometricServiceOptions {
  authentication?: LocalAuthenticationApi;
  storage?: SecureStorage;
  pinAccess?: PinAccess;
  binding?: typeof biometricBinding;
}

export interface BiometricAvailability {
  hardwareAvailable: boolean;
  enrolled: boolean;
  authenticationTypes: LocalAuthentication.AuthenticationType[];
  error: boolean;
}

export type BiometricAuthenticationResult =
  | { status: 'success' }
  | { status: 'failed' }
  | { status: 'cancelled' }
  | { status: 'lockout' }
  | { status: 'error' }
  | { status: 'busy' };

export type BiometricEnableResult =
  | { status: 'enabled' }
  | { status: 'pin-not-configured' }
  | { status: 'not-available' }
  | { status: 'not-enrolled' }
  | { status: 'failed' }
  | { status: 'cancelled' }
  | { status: 'lockout' }
  | { status: 'busy' }
  | { status: 'error' };

export type BiometricDisableResult =
  | { status: 'disabled' }
  | { status: 'invalid'; retryAfterSeconds: number }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'not-configured' }
  | { status: 'error' };

function isCancellationError(error: LocalAuthentication.LocalAuthenticationError): boolean {
  return (
    error === 'user_cancel' ||
    error === 'app_cancel' ||
    error === 'system_cancel' ||
    error === 'user_fallback'
  );
}

export class BiometricService {
  private readonly authentication: LocalAuthenticationApi;
  private readonly storage: SecureStorage;
  private readonly pinAccess: PinAccess;
  private readonly binding?: typeof biometricBinding;
  private authenticationInFlight = false;

  constructor(options: BiometricServiceOptions = {}) {
    this.authentication = options.authentication ?? LocalAuthentication;
    this.storage = options.storage ?? SecureStore;
    this.pinAccess = options.pinAccess ?? pinService;
    this.binding = options.binding;
  }

  async getAvailability(): Promise<BiometricAvailability> {
    try {
      const [hardwareAvailable, enrolled, authenticationTypes] = await Promise.all([
        this.authentication.hasHardwareAsync(),
        this.authentication.isEnrolledAsync(),
        this.authentication.supportedAuthenticationTypesAsync(),
      ]);
      return {
        hardwareAvailable,
        enrolled,
        authenticationTypes,
        error: false,
      };
    } catch {
      return {
        hardwareAvailable: false,
        enrolled: false,
        authenticationTypes: [],
        error: true,
      };
    }
  }

  async isUsable(): Promise<boolean> {
    const availability = await this.getAvailability();
    try {
      return availability.hardwareAvailable && availability.enrolled &&
        availability.authenticationTypes.length > 0 &&
        SecureStore.canUseBiometricAuthentication();
    } catch {
      return false;
    }
  }

  async isEnabled(): Promise<boolean> {
    const preference = await this.storage.getItemAsync(BIOMETRIC_PREFERENCE_KEY);
    if (preference === null || preference === 'disabled') return false;
    if (preference === 'enabled') return true;
    throw new Error('Biometric preference is invalid');
  }

  async authenticate(): Promise<BiometricAuthenticationResult> {
    if (this.authenticationInFlight) return { status: 'busy' };

    this.authenticationInFlight = true;
    try {
      const result = await this.authentication.authenticateAsync({
        promptMessage: 'Confirma tu identidad para AhorRaso',
        cancelLabel: 'Usar PIN',
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      });
      if (result.success) return { status: 'success' };
      if (result.error === 'lockout') return { status: 'lockout' };
      return isCancellationError(result.error)
        ? { status: 'cancelled' }
        : result.error === 'authentication_failed'
          ? { status: 'failed' }
          : { status: 'error' };
    } catch {
      return { status: 'error' };
    } finally {
      this.authenticationInFlight = false;
    }
  }

  async unlock(): Promise<boolean> {
    if (!this.binding || this.authenticationInFlight) return false;
    this.authenticationInFlight = true;
    try {
      if (!(await this.isEnabled())) return false;
      const availability = await this.getAvailability();
      return availability.hardwareAvailable && availability.enrolled &&
        availability.authenticationTypes.length > 0 && await this.binding.verify();
    } catch {
      // An invalidated key, cancellation or lockout leaves the session locked.
      return false;
    } finally {
      this.authenticationInFlight = false;
    }
  }

  async enable(): Promise<BiometricEnableResult> {
    try {
      if (!(await this.pinAccess.hasPin())) return { status: 'pin-not-configured' };
    } catch {
      return { status: 'error' };
    }

    const availability = await this.getAvailability();
    if (availability.error) return { status: 'error' };
    if (!availability.hardwareAvailable || availability.authenticationTypes.length === 0) {
      return { status: 'not-available' };
    }
    if (!availability.enrolled) return { status: 'not-enrolled' };

    const authentication = await this.authenticate();
    if (authentication.status !== 'success') return authentication;

    try {
      await this.binding?.enable();
      await this.storage.setItemAsync(BIOMETRIC_PREFERENCE_KEY, 'enabled');
      return { status: 'enabled' };
    } catch {
      return { status: 'error' };
    }
  }

  async disable(pin: string): Promise<BiometricDisableResult> {
    let validation: PinValidationResult;
    try {
      validation = await this.pinAccess.validatePin(pin);
    } catch {
      return { status: 'error' };
    }

    if (validation.status !== 'valid') {
      if (validation.status === 'invalid' || validation.status === 'locked') {
        return {
          status: validation.status,
          retryAfterSeconds: validation.retryAfterSeconds,
        };
      }
      return validation.status === 'not-configured'
        ? { status: 'not-configured' }
        : { status: 'error' };
    }

    try {
      await this.storage.setItemAsync(BIOMETRIC_PREFERENCE_KEY, 'disabled');
      return { status: 'disabled' };
    } catch {
      return { status: 'error' };
    }
  }

  async validatePinFallback(pin: string): Promise<PinValidationResult> {
    try {
      return await this.pinAccess.validatePin(pin);
    } catch {
      return { status: 'error' };
    }
  }
}

export const biometricService = new BiometricService({ binding: biometricBinding });
