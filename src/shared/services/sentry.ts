import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting — DSN env ile gate'li: EXPO_PUBLIC_SENTRY_DSN set edilene
 * kadar (Sentry hesabı: EU region seçilmeli, KVKK) tüm çağrılar no-op.
 * Kurulum tamamlanınca eas.json'a SENTRY_AUTH_TOKEN secret'ı + app.json
 * plugin'ine {organization, project} eklenmeli ki source map/dSYM yüklensin.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(DSN);

// AppNavigator onReady'de registerNavigationContainer(navigationRef) ile
// bağlanır → ekran breadcrumb'ları + screen-load span'leri.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

// Dev'de telemetri normalde KAPALI (gürültü + kota). Perf sorununu canlı
// incelemek için .env'e EXPO_PUBLIC_SENTRY_DEV=1 yaz, metro'yu --clear ile
// başlat; dev'de de gönderim açılır ve örnekleme %100'e çıkar. İşin bitince
// satırı sil — dev ölçümleri production'ı temsil etmez (JS dev mode yavaştır).
const DEV_TELEMETRY = process.env.EXPO_PUBLIC_SENTRY_DEV === '1';

export const initSentry = (): void => {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    enabled: DEV_TELEMETRY || !__DEV__,
    // Dev verisi production metriklerine karışmasın — Sentry UI'da
    // environment:development filtresiyle ayrışır.
    environment: __DEV__ ? 'development' : 'production',
    // KAPALI: açıkken metro terminaline satır satır "Sentry Logger [log]:
    // [Tracing] Finishing http.client span ..." düşüyor ve gerçek network/
    // uygulama log'larını boğuyor. SDK'nın çalıştığını doğrulaman gerekirse
    // geçici olarak DEV_TELEMETRY'ye çevir, sonra geri al.
    debug: false,
    // Frozen-frame/ANR telemetrisi = commit-storm regresyonunun erken uyarısı.
    tracesSampleRate: DEV_TELEMETRY ? 1.0 : 0.15,
    profilesSampleRate: DEV_TELEMETRY ? 1.0 : 0.15,
    integrations: [navigationIntegration],
  });
};

/** Login'de userId bağla, logout'ta null ile temizle — hatalar destek
 *  talepleriyle eşleştirilebilsin. KVKK: yalnız userId, e-posta/isim GÖNDERME.
 *  DSN yoksa no-op. */
export const setSentryUser = (userId: string | null): void => {
  if (!sentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
};

/** Trace'lere bağlam düşür (ör. navigator remount) — event değildir, kota
 *  yemez; bir sonraki hata/transaction'ın yanında görünür. DSN yoksa no-op. */
export const addSentryBreadcrumb = (category: string, message: string): void => {
  if (!sentryEnabled) return;
  Sentry.addBreadcrumb({ category, message, level: 'info' });
};

/** Yakalanan ama akışı durdurmaması gereken hatalar için (axios interceptor,
 *  SignalR onclose, rehydrate). DSN yoksa no-op. */
export const reportError = (error: unknown, context?: Record<string, unknown>): void => {
  if (!sentryEnabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
};

export { Sentry };
