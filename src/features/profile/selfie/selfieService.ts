import api, { SKIP_429_RETRY } from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { devLog } from '@/shared/utils/devLog';
import {
  normalizeSelfieAttempt,
  normalizeSelfieResult,
  type SelfieAttempt,
  type SelfieResult,
} from './selfieVerification';

/**
 * Selfie doğrulama uçları.
 *
 * ⚠️ Üç şey `profileService`'ten farklı ve hiçbiri tercih değil:
 *
 *  1. `SKIP_429_RETRY` — api.ts 429'u 3 kez otomatik yeniden deniyor. Burada
 *     429 geçici throttle değil, `UT-6504` KOTASI (5/saat). Retry hem kullanıcıyı
 *     boşuna bekletir hem iki kareyi tekrar yükler.
 *  2. Multipart `api.post` ile gidiyor, profileSlice'taki ham axios yolu ile
 *     DEĞİL: burada hem `Accept-Language` (challenge metni ve hata mesajı dile
 *     göre geliyor) hem otomatik token yenileme gerekli. Interceptor FormData'da
 *     `Content-Type`'ı silip boundary'yi RN'e bırakıyor — updateProfile bunun
 *     çalıştığını kanıtlıyor.
 *  3. 60 sn timeout — varsayılan 30 sn iki kare için dar.
 *
 * RIZA UÇLARI BURADA DEĞİL (bkz. features/auth/consents.ts): fotoğraf
 * doğrulamanın iki açık rızası artık kayıt sırasında, aydınlatma metniyle
 * birlikte alınıyor ve Ayarlar > Gizlilik'ten yönetiliyor. Bu dosya yalnız
 * doğrulama akışının kendi uçlarını taşıyor.
 */

/** Karenin FormData'ya eklenecek hâli. `captureSelfieFrame` üretir. */
export interface SelfieFrame {
  uri: string;
  name: string;
  type: string;
}

const FORM_DATA_CONFIG = { ...SKIP_429_RETRY, timeout: 60_000 };

/**
 * Yeni deneme başlat. Hangi hareketlerin isteneceğine SUNUCU karar verir.
 *
 * Her çağrı saatlik 5 haktan birini yakar → kamera adımına GİRİLDİĞİNDE
 * çağrılmalı, ekran açılışında değil.
 *
 * Şekil bozuksa `null` döner (uydurma challenge ile akış başlatılmaz); hata
 * kodları (`UT-65xx`) axios reject'i olarak yukarı çıkar.
 */
export async function startSelfieVerification(): Promise<SelfieAttempt | null> {
  const response = await api.post(
    API_ENDPOINTS.SELFIE_VERIFICATION_START,
    undefined,
    SKIP_429_RETRY,
  );
  const attempt = normalizeSelfieAttempt((response as any)?.result);
  if (!attempt) {
    devLog('🪪 [selfie] /start beklenmeyen şekil', (response as any)?.result);
  }
  return attempt;
}

/**
 * Kareleri gönder ve sonucu al.
 *
 * 🔴 BAŞARISIZ DOĞRULAMA HATA DEĞİL: `200 + isSuccess:true + verified:false`
 * döner ve bu fonksiyon normal şekilde `SelfieResult` döndürür. Çağıran taraf
 * `catch`e düşmeyi beklememeli, "tekrar dene" akışın normal parçası.
 *
 * ⚠️ `frames` challenge SIRASIYLA: `frames[0]` ilk hareketin, `frames[1]`
 * ikincinin karesi. Karıştırılırsa doğrulama başarısız olur.
 *
 * ⚠️ `attemptId` TEK KULLANIMLIK — başarısızlıkta aynı id ile tekrar
 * göndermeyin, yeni `/start` alın.
 */
export async function submitSelfieFrames(
  attemptId: string,
  frames: SelfieFrame[],
): Promise<SelfieResult> {
  const formData = new FormData();
  formData.append('attemptId', attemptId);
  frames.forEach((frame) => {
    formData.append('frames', frame as any);
  });

  const response = await api.post(
    API_ENDPOINTS.SELFIE_VERIFICATION_SUBMIT,
    formData,
    FORM_DATA_CONFIG,
  );
  return normalizeSelfieResult(
    (response as any)?.result,
    (response as any)?.message,
  );
}
