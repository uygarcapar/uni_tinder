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
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-console': 'warn',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
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
    ],
  }
);
