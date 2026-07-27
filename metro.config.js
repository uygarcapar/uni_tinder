// getSentryExpoConfig, expo/metro-config'in getDefaultConfig'ini sarar:
// Sentry source-map/debug-id desteği ekler; DSN/auth yokken davranışı birebir
// default'tur (Sentry hesabı bağlanana kadar zararsız).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
