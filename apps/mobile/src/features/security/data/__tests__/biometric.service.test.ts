import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  BiometricService,
  type BiometricAvailability,
} from '../biometric.service';
import type { PinValidationResult } from '../pin.service';

class MemorySecureStore {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  async getItemAsync(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('storage error');
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('storage error');
    this.values.set(key, value);
  }
}

function makeAuthentication() {
  return {
    hasHardwareAsync: jest.fn(async () => true),
    isEnrolledAsync: jest.fn(async () => true),
    supportedAuthenticationTypesAsync: jest.fn(async () => [
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]),
    authenticateAsync: jest.fn<
      ReturnType<typeof LocalAuthentication.authenticateAsync>,
      []
    >(async () => ({ success: true })),
  };
}

function makePinAccess() {
  return {
    hasPin: jest.fn(async () => true),
    validatePin: jest.fn<Promise<PinValidationResult>, [string]>(async () => ({
      status: 'valid',
    })),
  };
}

function makeService() {
  const storage = new MemorySecureStore();
  const authentication = makeAuthentication();
  const pinAccess = makePinAccess();
  const service = new BiometricService({ storage, authentication, pinAccess });
  return { service, storage, authentication, pinAccess };
}

describe('BiometricService', () => {
  it('reports available hardware, enrollment, and supported modalities', async () => {
    const { service, authentication } = makeService();

    const result = await service.getAvailability();

    expect(result).toEqual<BiometricAvailability>({
      hardwareAvailable: true,
      enrolled: true,
      authenticationTypes: [LocalAuthentication.AuthenticationType.FINGERPRINT],
      error: false,
    });
    expect(authentication.supportedAuthenticationTypesAsync).toHaveBeenCalled();
  });

  it('reports devices without biometric hardware', async () => {
    const { service, authentication } = makeService();
    authentication.hasHardwareAsync.mockResolvedValue(false);
    authentication.supportedAuthenticationTypesAsync.mockResolvedValue([]);

    expect(await service.getAvailability()).toMatchObject({
      hardwareAvailable: false,
      enrolled: true,
      authenticationTypes: [],
      error: false,
    });
  });

  it('reports hardware with no registered biometrics', async () => {
    const { service, authentication } = makeService();
    authentication.isEnrolledAsync.mockResolvedValue(false);

    expect(await service.getAvailability()).toMatchObject({
      hardwareAvailable: true,
      enrolled: false,
      error: false,
    });
  });

  it('converts availability API exceptions into an unavailable error state', async () => {
    const { service, authentication } = makeService();
    authentication.hasHardwareAsync.mockRejectedValue(new Error('native error'));

    expect(await service.getAvailability()).toEqual({
      hardwareAvailable: false,
      enrolled: false,
      authenticationTypes: [],
      error: true,
    });
  });

  it('authenticates successfully with strong biometrics and a clear prompt', async () => {
    const { service, authentication } = makeService();

    expect(await service.authenticate()).toEqual({ status: 'success' });
    expect(authentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: expect.any(String),
        cancelLabel: 'Usar PIN',
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      })
    );
  });

  it('distinguishes authentication failure, cancellation, and API error', async () => {
    const { service, authentication } = makeService();

    authentication.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'authentication_failed',
    });
    expect(await service.authenticate()).toEqual({ status: 'failed' });

    authentication.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'user_cancel',
    });
    expect(await service.authenticate()).toEqual({ status: 'cancelled' });

    authentication.authenticateAsync.mockRejectedValue(new Error('native error'));
    expect(await service.authenticate()).toEqual({ status: 'error' });
  });

  it('prevents a second biometric prompt while another is in progress', async () => {
    const { service, authentication } = makeService();
    let finishAuthentication!: (
      result: LocalAuthentication.LocalAuthenticationResult
    ) => void;
    authentication.authenticateAsync.mockReturnValue(
      new Promise((resolve) => {
        finishAuthentication = resolve;
      })
    );

    const first = service.authenticate();
    await Promise.resolve();
    expect(await service.authenticate()).toEqual({ status: 'busy' });
    finishAuthentication({ success: true });
    expect(await first).toEqual({ status: 'success' });
    expect(authentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('enables only after a configured PIN, enrolled biometric, and successful confirmation', async () => {
    const { service, authentication, pinAccess } = makeService();

    expect(await service.enable()).toEqual({ status: 'enabled' });
    expect(pinAccess.hasPin).toHaveBeenCalledTimes(1);
    expect(authentication.authenticateAsync).toHaveBeenCalledTimes(1);
    expect(await service.isEnabled()).toBe(true);
  });

  it('does not enable without a PIN or registered biometric', async () => {
    const withoutPin = makeService();
    withoutPin.pinAccess.hasPin.mockResolvedValue(false);
    expect(await withoutPin.service.enable()).toEqual({ status: 'pin-not-configured' });
    expect(withoutPin.authentication.authenticateAsync).not.toHaveBeenCalled();

    const withoutEnrollment = makeService();
    withoutEnrollment.authentication.isEnrolledAsync.mockResolvedValue(false);
    expect(await withoutEnrollment.service.enable()).toEqual({ status: 'not-enrolled' });
    expect(withoutEnrollment.authentication.authenticateAsync).not.toHaveBeenCalled();

    const withoutHardware = makeService();
    withoutHardware.authentication.hasHardwareAsync.mockResolvedValue(false);
    withoutHardware.authentication.supportedAuthenticationTypesAsync.mockResolvedValue([]);
    expect(await withoutHardware.service.enable()).toEqual({ status: 'not-available' });
    expect(withoutHardware.authentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it('does not enable when authentication fails, is cancelled, or storage fails', async () => {
    const failed = makeService();
    failed.authentication.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'authentication_failed',
    });
    expect(await failed.service.enable()).toEqual({ status: 'failed' });
    expect(await failed.service.isEnabled()).toBe(false);

    const cancelled = makeService();
    cancelled.authentication.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'user_cancel',
    });
    expect(await cancelled.service.enable()).toEqual({ status: 'cancelled' });
    expect(await cancelled.service.isEnabled()).toBe(false);

    const apiError = makeService();
    apiError.authentication.authenticateAsync.mockRejectedValue(new Error('native error'));
    expect(await apiError.service.enable()).toEqual({ status: 'error' });
    expect(await apiError.service.isEnabled()).toBe(false);

    const storageError = makeService();
    storageError.storage.failWrites = true;
    expect(await storageError.service.enable()).toEqual({ status: 'error' });
  });

  it('persists the enabled preference between service instances', async () => {
    const { service, storage, authentication, pinAccess } = makeService();
    expect(await service.enable()).toEqual({ status: 'enabled' });

    const restartedService = new BiometricService({
      storage,
      authentication,
      pinAccess,
    });
    expect(await restartedService.isEnabled()).toBe(true);
  });

  it('disables biometrics only after validating the existing PIN', async () => {
    const { service, storage, pinAccess } = makeService();
    storage.values.set('ahorraso.local-biometric.enabled.v1', 'enabled');

    expect(await service.disable('123456')).toEqual({ status: 'disabled' });
    expect(pinAccess.validatePin).toHaveBeenCalledWith('123456');
    expect(await service.isEnabled()).toBe(false);
  });

  it('keeps biometrics enabled when PIN validation fails, is locked, or errors', async () => {
    const { service, storage, pinAccess } = makeService();
    storage.values.set('ahorraso.local-biometric.enabled.v1', 'enabled');

    pinAccess.validatePin.mockResolvedValue({ status: 'invalid', retryAfterSeconds: 5 });
    expect(await service.disable('000000')).toEqual({
      status: 'invalid',
      retryAfterSeconds: 5,
    });
    expect(await service.isEnabled()).toBe(true);

    pinAccess.validatePin.mockResolvedValue({ status: 'error' });
    expect(await service.disable('123456')).toEqual({ status: 'error' });
    expect(await service.isEnabled()).toBe(true);

    pinAccess.validatePin.mockResolvedValue({ status: 'locked', retryAfterSeconds: 10 });
    expect(await service.disable('123456')).toEqual({
      status: 'locked',
      retryAfterSeconds: 10,
    });
    expect(await service.isEnabled()).toBe(true);
  });

  it('uses PinService validation as the fallback and rejects incorrect PINs', async () => {
    const { service, pinAccess } = makeService();
    expect(await service.validatePinFallback('123456')).toEqual({ status: 'valid' });

    pinAccess.validatePin.mockResolvedValue({ status: 'invalid', retryAfterSeconds: 5 });
    expect(await service.validatePinFallback('000000')).toEqual({
      status: 'invalid',
      retryAfterSeconds: 5,
    });
    expect(pinAccess.validatePin).toHaveBeenCalledWith('000000');
  });

  it('does not disable the preference when the secure write fails', async () => {
    const { service, storage } = makeService();
    storage.values.set('ahorraso.local-biometric.enabled.v1', 'enabled');
    storage.failWrites = true;

    expect(await service.disable('123456')).toEqual({ status: 'error' });
    expect(await service.isEnabled()).toBe(true);
  });

  it('does not report enabled when SecureStore reads or contains invalid state', async () => {
    const { service, storage } = makeService();
    storage.failReads = true;
    await expect(service.isEnabled()).rejects.toThrow();

    storage.failReads = false;
    storage.values.set('ahorraso.local-biometric.enabled.v1', 'unknown');
    await expect(service.isEnabled()).rejects.toThrow();
  });

  it('does not report success when PIN validation throws', async () => {
    const pinError = makeService();
    pinError.pinAccess.hasPin.mockRejectedValue(new Error('secure store error'));
    expect(await pinError.service.enable()).toEqual({ status: 'error' });

    pinError.pinAccess.validatePin.mockRejectedValue(new Error('secure store error'));
    expect(await pinError.service.validatePinFallback('123456')).toEqual({
      status: 'error',
    });
  });
});

describe('enrollment-bound biometric unlock', () => {
  it('rejects missing and invalidated bindings, including cancellation', async () => {
    const storage = new MemorySecureStore();
    const authentication = makeAuthentication();
    const binding = {
      enable: jest.fn(async () => {}),
      verify: jest.fn(async () => true),
    };
    const service = new BiometricService({ storage, authentication, pinAccess: makePinAccess(), binding });
    await expect(service.unlock()).resolves.toBe(false);
    expect(binding.verify).not.toHaveBeenCalled();
    await expect(service.enable()).resolves.toEqual({ status: 'enabled' });
    await expect(service.unlock()).resolves.toBe(true);
    binding.verify.mockResolvedValueOnce(false);
    await expect(service.unlock()).resolves.toBe(false);
    binding.verify.mockRejectedValueOnce(new Error('cancelled or locked out'));
    await expect(service.unlock()).resolves.toBe(false);
    authentication.isEnrolledAsync.mockResolvedValueOnce(false);
    await expect(service.unlock()).resolves.toBe(false);
    expect(binding.verify).toHaveBeenCalledTimes(3);
  });
});

it('offers activation only with enrolled biometrics usable by the protected store', async () => {
  const { service, authentication } = makeService();
  jest.mocked(SecureStore.canUseBiometricAuthentication).mockReturnValueOnce(false);
  await expect(service.isUsable()).resolves.toBe(false);
  authentication.isEnrolledAsync.mockResolvedValueOnce(false);
  await expect(service.isUsable()).resolves.toBe(false);
  await expect(service.isUsable()).resolves.toBe(true);
});
