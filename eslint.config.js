const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        __DEV__: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        global: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // require() is idiomatic in RN for static assets and jest mocks
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // dev-only tooling logs to the console by design
    files: ['src/shared/debug/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // ── e2e (Appium + WebdriverIO) ──────────────────────────────────────────
    // Burada iki YASAK var ve ikisi de performans/doğruluk kararı, stil değil.
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: {
        // @wdio/globals — runtime'da enjekte ediliyor, tipleri e2e/tsconfig.json'da.
        browser: 'readonly',
        driver: 'readonly',
        $: 'readonly',
        $$: 'readonly',
        expect: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        beforeEach: 'readonly',
        after: 'readonly',
        afterEach: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Betikler ve raporlar bilerek console'a yazıyor.
      'no-console': 'off',
      'no-restricted-syntax': [
        'error',
        {
          // XPath YASAK: XCUITest'te tüm sayfa kaynağı XML'e serialize edilip
          // XPath motoruna veriliyor. Bu ekranlar derin (SwipeCard.tsx 287 KB)
          // ve tek sorgu 3-8 sn sürüyor; snapshotMaxDepth kırpınca da SESSİZCE
          // boş dönüyor. `~` ise WDA'da doğrudan identifier eşleşmesi (50-200 ms).
          selector:
            "CallExpression[callee.name=/^\\$\\$?$/] > Literal[value=/^(\\/\\/|xpath=|\\.\\/\\/)/]",
          message:
            'XPath yasak (XCUITest\'te 3-8 sn + sessiz boş dönüş). `~id`, ' +
            '`-ios predicate string:` ya da `-ios class chain:` kullan.',
        },
        {
          selector:
            "MemberExpression[object.name='browser'][property.name='$'] ~ Literal[value=/^\\/\\//]",
          message: 'XPath yasak — bkz. e2e/support/selectors.ts seçici hiyerarşisi.',
        },
        {
          // `browser.pause` YASAK: sabit bekleme flake üretiyor ve gizliyor.
          // Yerine support/driver.ts'in açık koşullu beklemeleri ya da
          // `waitForDisplayed` kullanılıyor. Tek meşru istisna sheet detent'i
          // ve o da Page Object içinde gerekçeli duruyor.
          selector: "MemberExpression[object.name='browser'][property.name='pause']",
          message:
            'browser.pause yasak — koşullu bekleme kullan (waitForDisplayed / browser.waitUntil). ' +
            'Kasıtlı insan gecikmeleri yalnız e2e/human/ içinde.',
        },
      ],
    },
  },
  {
    // human/ katmanındaki gecikmeler KASITLI: insan tepki süresi modeli.
    files: ['e2e/human/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      'tailwind.config.js',
      'eslint.config.js',
      'jest.setup.pre.js',
      // legacy JS reference snapshots kept for comparison only
      'src/screens/**',
      'src/queries/**',
      'src/navigation/AppNavigator.js',
    ],
  }
);
