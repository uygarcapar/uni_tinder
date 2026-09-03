/** @type {import('jest').Config} */
module.exports = {
  preset: '@react-native/jest-preset',

  // worklets'in kendi resolver'ı: `.native` uzantılarını eleyip NativeWorklets
  // yerine JS implementasyonunu çözüyor. Olmazsa reanimated'ın jest mock'u
  // (jest.setup.ts) native köprüyü başlatmaya çalışıp "Native part of Worklets
  // doesn't seem to be initialized" ile patlıyor.
  resolver: require.resolve('react-native-worklets/jest/resolver.js'),

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
      // reanimated'ın jest mock'u (src/mock.ts) worklets'i import ediyor ve o
      // paket ESM-only. Listede olmazsa reanimated'a DOĞRUDAN dokunan her
      // test suite'i "Cannot use import statement outside a module" ile düşer.
      'react-native-worklets',
      'react-native-gesture-handler',
      'react-native-safe-area-context',
      'nativewind',
      'react-native-css-interop',
      'lucide-react-native',
      '@expo',
      'expo[a-z-]*',
      '@react-native',
      // ESM-only build; navigationRef'i (ve dolaylı olarak onu import eden
      // her component'i) test edebilmek için babel'den geçmeli.
      '@react-navigation',
      // RN "exports" koşulundan TS kaynağına çözülen paketler — babel'den geçmeli.
      '@reduxjs/toolkit',
      'immer',
      'redux',
      // ESM build'e (react-redux.legacy-esm.js) çözülüyor — gerçek store ile
      // render edilen ekran testleri Provider'ı buradan alıyor.
      'react-redux',
      '@react-native-async-storage/async-storage',
      'react-native-mmkv',
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
    // src/shared/icons.ts ikonları uzantısız deep path'le çekiyor (barrel'ın
    // 1670 eager require'ından kaçmak için). Metro çözüyor, jest-resolve
    // çözemiyor: lucide'ın `exports` map'inde ikon başına subpath yok.
    '^lucide-react-native/dist/esm/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/esm/icons/$1.js',
    '^react-native-css-interop(.*)$': '<rootDir>/src/__mocks__/react-native-css-interop.ts',
    '\\.(jpg|jpeg|png|gif|svg|ttf|woff2?)$': '<rootDir>/src/__mocks__/fileMock.js',
  },

  testMatch: ['<rootDir>/tests/**/?(*.)+(spec|test).[jt]s?(x)'],

  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
