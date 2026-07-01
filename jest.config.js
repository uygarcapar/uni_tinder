/** @type {import('jest').Config} */
module.exports = {
  preset: '@react-native/jest-preset',

  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        // babel.config.js jsxImportSource: "nativewind" kullanıyor, test ortamında
        // nativewind jsx-runtime yok. Kendi preset'imizi tanımlıyoruz.
        configFile: false,
        presets: [
          ['babel-preset-expo', { jsxImportSource: 'react' }],
        ],
        caller: { name: 'jest', bundler: 'metro', platform: 'ios' },
      },
    ],
  },

  transformIgnorePatterns: [
    'node_modules/(?!(' + [
      '@gorhom/bottom-sheet',
      'react-native',
      'react-native-reanimated',
      'react-native-gesture-handler',
      'react-native-safe-area-context',
      'nativewind',
      'react-native-css-interop',
      'lucide-react-native',
      '@expo',
      'expo',
      'expo-blur',
      '@react-native',
    ].join('|') + ')/)',
  ],

  // Preset'in setupFiles'ına (__fbBatchedBridgeConfig setup) ek olarak __DEV__ tanımla
  setupFiles: [
    '<rootDir>/jest.setup.pre.js',
    require.resolve('@react-native/jest-preset/jest/setup.js'),
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-css-interop(.*)$': '<rootDir>/src/__mocks__/react-native-css-interop.ts',
    '\\.(jpg|jpeg|png|gif|svg|ttf|woff2?)$': '<rootDir>/src/__mocks__/fileMock.js',
  },

  testMatch: ['<rootDir>/tests/**/?(*.)+(spec|test).[jt]s?(x)'],

  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
