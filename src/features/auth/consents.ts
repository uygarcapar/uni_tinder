import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { devLog } from '@/shared/utils/devLog';

/**
 * KVKK rıza kayıtları — TEK METİN, ÜÇ AYRI RIZA.
 *
 * Kullanıcı kayıt olurken (ve metnin sürümü değiştiğinde yeniden) tek bir
 * aydınlatma metni okuyor, ama üç ayrı karar veriyor:
 *
 *   PrivacyPolicy         → metnin kendisinin kabulü. ZORUNLU: bu olmadan
 *                           uygulamaya devam edilmiyor.
 *   BiometricVerification → fotoğraf doğrulama, KVKK m.6/2-a açık rıza.
 *   DataTransferAbroad    → aynı akıştaki yurt dışı aktarım, m.9 açık rıza.
 *
 * ⚠️ SON İKİSİ ZORUNLU DEĞİL VE OLAMAZ. Açık rıza özgür iradeyle verilmeli;
 * hizmetin şartına bağlanamaz. Metnin 4. ve 5. bölümü de bunu yazılı olarak
 * vaat ediyor ("vermezseniz hesabınız kapanmaz, eşleşmeleriniz etkilenmez").
 * Kutuları zorunlu yapmak bu iki cümleyi de yalan çıkarırdı.
 *
 * ⚠️ AYRI AYRI SORULUYOR. Tek bir "kabul ediyorum" kutusu KVKK için yeterli
 * değil: her rıza kendi konusuna ilişkin, bilinçli ve bağımsız olmalı. Bu
 * yüzden üç kutu var ve her biri kendi ConsentRecord satırını üretiyor.
 *
 * Rıza her iki yönde de çalışıyor: `accepted: false` bir GERİ ALMA kaydıdır
 * (Ayarlar > Gizlilik). Sunucu geri almada doğrulama rozetini de düşürüyor.
 */
export const SELFIE_CONSENT_TYPES = [
  'BiometricVerification',
  'DataTransferAbroad',
] as const;

export type SelfieConsentType = (typeof SELFIE_CONSENT_TYPES)[number];
export type ConsentType = 'PrivacyPolicy' | SelfieConsentType;

export interface ConsentStatus {
  /** Rıza ŞU AN geçerli mi — en son karar "kabul" mü. Geri alma bunu false yapar. */
  isAccepted: boolean;
  /** Sunucudaki güncel metin sürümü. */
  currentVersion: string;
}

/**
 * Rızayı kaydet (ya da geri al). Her tip AYRI çağrı — tek istekle birkaçını
 * birden vermenin yolu yok, sunucu da tip başına ayrı satır tutuyor.
 *
 * `version` KULLANICININ OKUDUĞU metnin sürümü. Üçü de aynı metinden geldiği
 * için üç çağrıda da aynı değer gider; sabit kodlanmaz.
 */
export async function recordConsent(
  consentType: ConsentType,
  version: string,
  accepted = true,
): Promise<void> {
  await api.post(API_ENDPOINTS.PRIVACY_ACCEPT_CONSENT, {
    consentType,
    version,
    accepted,
  });
}

/**
 * Rızanın şu anki durumu. Ayarlar'daki anahtarın kaynağı.
 *
 * `isAccepted` sunucuda EN SON karardan hesaplanıyor (kabul ya da geri alma) —
 * doğrulama akışının kapıdaki kontrolüyle aynı kaynak. Alan yoksa (eski
 * sunucu) `null` döner: çağıran taraf anahtarı çizmemeyi seçebilir.
 */
export async function fetchConsentStatus(
  consentType: ConsentType,
): Promise<ConsentStatus | null> {
  const response = await api.get(API_ENDPOINTS.PRIVACY_CONSENT_STATUS(consentType));
  const result = (response as any)?.result ?? response;
  if (typeof result?.isAccepted !== 'boolean') {
    devLog('🔐 [consent] status beklenmeyen şekil', result);
    return null;
  }
  return {
    isAccepted: result.isAccepted,
    currentVersion: typeof result.currentVersion === 'string' ? result.currentVersion : '',
  };
}
