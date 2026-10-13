/** Configuración de Jest para apps/mobile (entorno Node, TypeScript vía ts-jest). */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Módulos nativos de Expo/React Native sin contraparte en Node se
    // sustituyen por mocks respaldados por node:sqlite / node:crypto.
    '^expo-sqlite$': '<rootDir>/test/mocks/expo-sqlite.ts',
    '^expo-crypto$': '<rootDir>/test/mocks/expo-crypto.ts',
  },
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|@expo|expo|expo-modules-core|expo-constants|expo-linking|@react-navigation|react-native-url-polyfill)/)',
  ],
  clearMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/', '/test/mocks/'],
};
