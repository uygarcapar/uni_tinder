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

/** Tip başına "şu an geçerli mi". */
export type SelfieConsentState = Record<SelfieConsentType, boolean>;

/**
 * Fotoğraf doğrulama rızalarının ŞU ANKİ durumu — tip başına ayrı.
 *
 * İKİ KAYNAK, AYNI SORU:
 *
 *   1. `consent-status.isAccepted` — sunucunun EN SON karardan hesapladığı
 *      cevap. Doğru kaynak budur, tip başına tek istek.
 *   2. Alan yoksa `consent-history` — o sunucu sürümünde `consent-status`
 *      yalnızca KABUL kayıtlarına bakıyor, yani geri almayı göremiyor ve
 *      "geri aldım ama hâlâ açık görünüyor" üretiyor. Geçmişte ise her karar
 *      (kabul + ret) duruyor; tip başına en son kaydı okumak, sunucunun
 *      doğrulamayı başlatırken yaptığı kontrolün birebir aynısı.
 *
 * `null` YALNIZCA ikisi de okunamadığında döner ve "rıza yok" demektir —
 * çağıran taraf anahtarları yine de ÇİZMELİ: rızanın verilebildiği tek yer
 * orası, gizlemek kullanıcıyı çıkmaza sokar.
 *
 * ⚠️ SÜRÜM BURADAN OKUNMAZ. Rıza kaydına yazılacak sürüm, kullanıcının GÖRDÜĞÜ
 * metnin sürümüdür (uygulamadaki CURRENT_KVKK_VERSION) — sunucunun bildirdiği
 * `currentVersion` değil. İkisi normalde aynı; ayrıştıklarında (sunucu henüz
 * yeni metinle deploy edilmemişken) kullanıcının okumadığı bir sürüme rıza
 * vermiş görünürdü.
 */
export async function fetchSelfieConsentStates(): Promise<SelfieConsentState | null> {
  const statuses = await Promise.all(
    SELFIE_CONSENT_TYPES.map((type) => fetchConsentStatus(type).catch(() => null)),
  );

  if (statuses.every((st) => st?.isAccepted != null)) {
    return Object.fromEntries(
      SELFIE_CONSENT_TYPES.map((type, i) => [type, statuses[i]!.isAccepted === true]),
    ) as SelfieConsentState;
  }

  return await fetchStatesFromHistory().catch(() => null);
}

/**
 * Tek bir tipin durumu.
 *
 * `isAccepted` alanı yoksa (eski sunucu) `null` taşır ve çağıran taraf geçmişe
 * düşer. Fonksiyonun kendisi yalnız istek düştüğünde `null` döner.
 */
async function fetchConsentStatus(
  consentType: ConsentType,
): Promise<{ isAccepted: boolean | null } | null> {
  const response = await api.get(API_ENDPOINTS.PRIVACY_CONSENT_STATUS(consentType));
  const result = (response as any)?.result ?? response;

  if (typeof result?.isAccepted !== 'boolean') {
    devLog('🔐 [consent] status isAccepted taşımıyor, geçmişe düşülüyor', result);
    return { isAccepted: null };
  }
  return { isAccepted: result.isAccepted };
}

/**
 * Geçmişten türetilmiş durum: her tip için EN SON karar kabul mü.
 *
 * Sunucunun `EnsureConsentAsync`i de tam olarak bunu yapıyor — iki yer aynı
 * cevabı vermek zorunda, yoksa anahtar "açık" derken doğrulama `UT-6501`
 * döndürür.
 */
async function fetchStatesFromHistory(): Promise<SelfieConsentState | null> {
  const response = await api.get(API_ENDPOINTS.PRIVACY_CONSENT_HISTORY);
  const records = (response as any)?.result ?? response;
  if (!Array.isArray(records)) {
    devLog('🔐 [consent] geçmiş beklenmeyen şekil', records);
    return null;
  }

  const latestAccepted = (type: SelfieConsentType) => {
    const latest = records
      .filter((r: any) => r?.consentType === type)
      .sort(
        (a: any, b: any) =>
          new Date(b?.decisionAt ?? 0).getTime() - new Date(a?.decisionAt ?? 0).getTime(),
      )[0];
    return latest?.accepted === true;
  };

  return Object.fromEntries(
    SELFIE_CONSENT_TYPES.map((type) => [type, latestAccepted(type)]),
  ) as SelfieConsentState;
}
