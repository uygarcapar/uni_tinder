// React Native globals that must exist before any module is imported
global.__DEV__ = true;

process.env.EXPO_PUBLIC_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://example.test';
