import PostHog from 'posthog-react-native';

/**
 * Product analytics — key env ile gate'li: EXPO_PUBLIC_POSTHOG_KEY set edilene
 * kadar tüm çağrılar no-op. Host default EU Cloud (Frankfurt) — Türk kullanıcı
 * davranış verisi için KVKK'ya uygun konumlandırma.
 *
 * Ekran görüntüleme AppNavigator'daki onStateChange'den gelir; RegisterStep1-15
 * ekran adları sayesinde kayıt sihirbazının drop-off funnel'ı otomatik çıkar.
 * Session replay ayrı native paket ister (posthog-react-native-session-replay);
 * key alındıktan sonraki adım olarak bırakıldı.
 */
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

const client: PostHog | null = KEY ? new PostHog(KEY, { host: HOST }) : null;

export const analytics = {
  screen: (name: string, properties?: Record<string, any>) => {
    client?.screen(name, properties);
  },
  capture: (event: string, properties?: Record<string, any>) => {
    client?.capture(event, properties);
  },
  identify: (userId: string, properties?: Record<string, any>) => {
    client?.identify(userId, properties);
  },
  /** Logout'ta çağır — sonraki kullanıcı önceki kimliğe yazılmasın. */
  reset: () => {
    client?.reset();
  },
};
