/** Configuración de Jest para apps/mobile (entorno Node, TypeScript vía ts-jest). */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Los módulos nativos de Expo/React Native se sustituyen por mocks en Node.
    '^expo-sqlite$': '<rootDir>/test/mocks/expo-sqlite.ts',
    '^expo-crypto$': '<rootDir>/test/mocks/expo-crypto.ts',
    '^expo-secure-store$': '<rootDir>/test/mocks/expo-secure-store.ts',
    '^expo-local-authentication$': '<rootDir>/test/mocks/expo-local-authentication.ts',
  },
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:@noble/hashes|@react-native|react-native|@expo|expo|expo-modules-core|expo-constants|expo-linking|@react-navigation|react-native-url-polyfill)/)',
  ],
  clearMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/', '/test/mocks/'],
};
