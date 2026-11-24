import * as SecureStore from 'expo-secure-store';

const key = 'ahorraso.local-biometric.binding.v1';
const options = {
  requireAuthentication: true,
  keychainService: 'ahorraso.biometric',
  authenticationPrompt: 'Confirma tu identidad para AhorRaso',
} as const;

export const biometricBinding = {
  async enable() {
    await SecureStore.setItemAsync(key, 'authorized', options);
  },
  async verify() {
    return (await SecureStore.getItemAsync(key, options)) === 'authorized';
  },
};
