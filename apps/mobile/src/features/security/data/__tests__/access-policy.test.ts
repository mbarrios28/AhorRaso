import { accessPresentation, canAttemptAccess } from '../access-policy';

it('requires PIN setup even with usable biometrics or a legacy password', () => {
  const credentials = { pin: false, password: true };
  expect(accessPresentation(false, true, false)).toBe('setup');
  expect(canAttemptAccess(credentials, 'setup')).toBe(true);
  expect(canAttemptAccess(credentials, 'biometric')).toBe(false);
  expect(canAttemptAccess(credentials, 'pin')).toBe(false);
});

it('prefers enabled biometrics and keeps PIN accessible without requiring an old password', () => {
  expect(accessPresentation(true, true, false)).toBe('biometric');
  expect(accessPresentation(true, true, true)).toBe('pin');
  expect(accessPresentation(true, false, false)).toBe('pin');
  expect(canAttemptAccess({ pin: true, password: false }, 'pin')).toBe(true);
});

it('limits legacy password recovery to existing configured accounts', () => {
  expect(canAttemptAccess({ pin: true, password: true }, 'recover')).toBe(true);
  expect(canAttemptAccess({ pin: true, password: false }, 'recover')).toBe(false);
  expect(canAttemptAccess({ pin: true, password: true }, 'setup')).toBe(false);
});
