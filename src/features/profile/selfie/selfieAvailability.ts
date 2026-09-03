import { appPrefs } from '@/shared/utils/appPrefs';
import uiBus from '@/shared/services/uiBus';
import { devLog } from '@/shared/utils/devLog';
import { SELFIE_AVAILABILITY_EVENT } from './selfieEvents';

/**
 * Selfie doğrulamanın bu istemcide GÖSTERİLİP gösterilmeyeceği.
 *
 * Backend'de özellik bir bayrağın arkasında (`SelfieVerification:Enabled`).
 * Kapalıyken uçlar `404 + UT-6505` dönüyor. Kullanıcıya çalışmayan bir giriş
 * noktası göstermemek gerekiyor ama bayrağı SORACAK bir uç da yok — tek sinyal
 * `/start`'ın 404'ü.
 *
 * Bu yüzden iki kapı var (ikisi de geçilmeden satır çizilmez):
 *
 *   1. `isSelfieVerified` alanı profil yanıtında VAR mı (resolveSelfieVerified
 *      !== null). Alan yoksa backend'in bu sürümü yok demektir.
 *   2. Yakın zamanda `UT-6505` alınmış mı — aşağıdaki pencere.
 *
 * Pencere KALICI DEĞİL, 24 saatlik: bayrak açıldığında istemci kendiliğinden
 * geri dönmeli, kullanıcının uygulamayı silip kurması gerekmemeli.
 */

const UNAVAILABLE_UNTIL_KEY = 'selfie.unavailableUntil';
const WAS_VERIFIED_PREFIX = 'selfie.wasVerified.';

const UNAVAILABLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** `UT-6505` alındı: girişi 24 saat gizle ve dinleyenlere haber ver. */
export function markSelfieFeatureUnavailable(): void {
  appPrefs.set(UNAVAILABLE_UNTIL_KEY, Date.now() + UNAVAILABLE_WINDOW_MS);
  devLog('🪪 [selfie] UT-6505 — özellik kapalı, giriş 24 sa gizlendi');
  uiBus.emit(SELFIE_AVAILABILITY_EVENT);
}

/**
 * Gizleme penceresi geçti mi. Pencere içindeyken `false` döner.
 *
 * Bayrağın açıldığını doğrudan öğrenemediğimiz için süre dolduğunda ilk deneme
 * yine kullanıcının dokunuşuyla yapılır; hâlâ kapalıysa pencere tazelenir.
 */
export function isSelfieFeatureAvailable(): boolean {
  const until = appPrefs.getNumber(UNAVAILABLE_UNTIL_KEY);
  if (typeof until !== 'number') return true;
  if (Date.now() >= until) {
    appPrefs.remove(UNAVAILABLE_UNTIL_KEY);
    return true;
  }
  return false;
}

/** Yalnız testler ve "özellik geri geldi" senaryosu için. */
export function clearSelfieUnavailable(): void {
  appPrefs.remove(UNAVAILABLE_UNTIL_KEY);
  uiBus.emit(SELFIE_AVAILABILITY_EVENT);
}

// ── "Bir kez doğrulanmıştı" bayrağı ──────────────────────────────────────────
// Ana fotoğraf değişince backend doğrulamayı DÜŞÜRÜYOR (güvenlik gereği:
// "doğrulan → fotoğrafı başkasınınkiyle değiştir" ile rozet başkasının
// fotoğrafını doğrulanmış gösterirdi). Kullanıcı bunu sebebiyle birlikte
// öğrenmeli — sessiz düşürme yok.
//
// `isSelfieVerified === false` tek başına "hiç doğrulanmadı" ile "doğrulaması
// sıfırlandı"yı ayırt etmiyor; ayrım bu bayrakta.
//
// userId ile anahtarlanıyor: appPrefs logout'ta BİLEREK silinmiyor, aynı
// cihazda başka hesap açan kişi "doğrulaman sıfırlandı" satırını görmemeli.

const wasVerifiedKey = (userId: string | number) =>
  `${WAS_VERIFIED_PREFIX}${userId}`;

export function markSelfieWasVerified(userId: string | number | null | undefined): void {
  if (!userId) return;
  appPrefs.set(wasVerifiedKey(userId), true);
}

export function wasSelfieVerifiedBefore(
  userId: string | number | null | undefined,
): boolean {
  if (!userId) return false;
  return appPrefs.getBoolean(wasVerifiedKey(userId)) === true;
}
