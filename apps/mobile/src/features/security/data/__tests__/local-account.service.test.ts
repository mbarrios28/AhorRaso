import { configureAccessPin, localAccountService, recoverPin } from '../local-account.service';
import { pinService } from '../pin.service';

afterEach(() => jest.restoreAllMocks());

it('creates the initial PIN on a fresh installation without creating a password', async () => {
  const password = jest.spyOn(localAccountService, 'validatePin');
  const configure = jest.spyOn(pinService, 'configurePin').mockResolvedValue(undefined);
  await expect(configureAccessPin('321987', '321987')).resolves.toEqual({ status: 'valid' });
  expect(configure).toHaveBeenCalledTimes(1);
  expect(password).not.toHaveBeenCalled();
});

it('preserves password-only access until the legacy password is verified', async () => {
  const password = jest.spyOn(localAccountService, 'validatePin')
    .mockResolvedValueOnce({ status: 'invalid', retryAfterSeconds: 5 })
    .mockResolvedValueOnce({ status: 'valid' });
  const configure = jest.spyOn(pinService, 'configurePin').mockResolvedValue(undefined);
  await expect(configureAccessPin('321987', '321987', 'legacy fixture')).resolves.toEqual({
    status: 'invalid', retryAfterSeconds: 5,
  });
  expect(configure).not.toHaveBeenCalled();
  await expect(configureAccessPin('321987', '321987', 'legacy fixture')).resolves.toEqual({ status: 'valid' });
  expect(password).toHaveBeenCalledTimes(2);
  expect(configure).toHaveBeenCalledTimes(1);
});

it('cannot replace an existing PIN through recovery when password verification fails', async () => {
  jest.spyOn(localAccountService, 'validatePin').mockResolvedValue({ status: 'error' });
  const replace = jest.spyOn(pinService, 'replaceConfiguredPin');
  await expect(recoverPin('legacy fixture', '321987', '321987')).resolves.toEqual({ status: 'error' });
  expect(replace).not.toHaveBeenCalled();
});
