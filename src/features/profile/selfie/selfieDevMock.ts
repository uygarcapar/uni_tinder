import i18n from '@/shared/i18n';
import { devLog } from '@/shared/utils/devLog';
import {
  SELFIE_REASON_CODES,
  type SelfieAttempt,
  type SelfieResult,
} from './selfieVerification';

/**
 * 🔴 GELİŞTİRME KANCASI — ürün davranışının parçası DEĞİL.
 *
 * NEDEN VAR: backend bayrağı (`SelfieVerification:Enabled`) kapalıyken `/start`
 * `404 + UT-6505` dönüyor. İstemci doğru davranıp sessizce kapanıyor, ama bu
 * kamera ve sonuç ekranlarını — yani akışın yazılmış olan yarısını — tamamen
 * erişilemez kılıyor. Metinleri, ipuçlarını ve yerleşimi bayrak açılmadan
 * görebilmek için `/start` ve `/submit` dev'de taklit ediliyor.
 *
 * NE ZAMAN DEVREYE GİRİYOR: yalnız `__DEV__` VE yalnız backend `UT-6505`
 * döndüğünde. Çalışan bir backend'in yanıtını ASLA maskelemiyor — başka her
 * durum (200, UT-6501, UT-6504, ağ hatası) olduğu gibi yukarı çıkıyor. Bayrak
 * açıldığı gün bu dosya kendiliğinden devre dışı kalır.
 *
 * NASIL SİLİNİR: bu dosyayı sil, `selfieService`'teki iki `__DEV__` bloğunu
 * kaldır. Başka bağı yok.
 *
 * ⚠️ Kareler yine de HİÇBİR YERE gitmiyor — mock submit dosyaları okumuyor
 * bile. Rehber §15'teki "kare saklanmaz" kuralı burada da geçerli.
 */

/** Gerçek attemptId'ler Guid; bu önek çakışmaz ve submit tarafında ayırt eder. */
const MOCK_ID_PREFIX = 'dev-mock:';

// Her tur POZ + MİMİK içeriyor: tek denemede `hintPose` ve `hintExpression`
// varyantlarının ikisi de ekrana geliyor (bkz. selfieChallengeHintKey).
const MOCK_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['TurnRight', 'Smile'],
  ['LookUp', 'MouthOpen'],
  ['TurnLeft', 'Smile'],
];

// Rehber §4'teki aktif havuzun metinleri. Normalde bunlar SUNUCUDAN gelir
// (`challenge.instruction`, Accept-Language'e göre) — burada taklit ediliyor
// olmaları istemcinin kendi metin tablosunu kurduğu anlamına gelmez.
const INSTRUCTIONS: Record<string, Record<string, string>> = {
  tr: {
    TurnRight: 'Başını hafifçe sağa çevir',
    TurnLeft: 'Başını hafifçe sola çevir',
    LookUp: 'Yukarı bak',
    Smile: 'Gülümse',
    MouthOpen: 'Ağzını aç',
  },
  en: {
    TurnRight: 'Turn your head slightly to the right',
    TurnLeft: 'Turn your head slightly to the left',
    LookUp: 'Look up',
    Smile: 'Smile',
    MouthOpen: 'Open your mouth',
  },
};

/**
 * 🎛️ MOCK SONUCU — buradan ayarla, tek satır.
 *
 *   'success'          → her submit BAŞARILI. Mutlu yol, rozet, kutlama ekranı.
 *   'tour'             → her submit sıradaki sebep kodunu döndürür, 11 kodun
 *                        hepsi bitince başarı. Tüm sebep metinlerini ve
 *                        başlıklarını görmek için — ama başarıya ulaşmak 12 tam
 *                        çekim demek, sabır ister.
 *   <bir sebep kodu>   → hep o kod. Tek bir metni gözden geçirirken en hızlısı,
 *                        örn. 'challenge_too_weak' ya da 'face_mismatch'.
 *
 * Varsayılan 'success': akışın uçtan uca çalıştığını görmek ilk ihtiyaç.
 * Sebep metinlerini gözden geçirirken 'tour'a ya da tek bir koda çevir.
 */
const MOCK_OUTCOME: 'success' | 'tour' | (typeof SELFIE_REASON_CODES)[number] =
  'success';

// 'tour' modunun sırası: 11 sebep, sonra başarı.
const REASON_TOUR: ReadonlyArray<string | null> = [...SELFIE_REASON_CODES, null];

let pairCursor = 0;
let reasonCursor = 0;

const instructionFor = (code: string): string => {
  const lang = i18n.language?.startsWith('en') ? 'en' : 'tr';
  return INSTRUCTIONS[lang][code] ?? code;
};

/** Mock bir attempt. `attemptId` öneki submit tarafında tanınır. */
export function mockSelfieAttempt(): SelfieAttempt {
  const pair = MOCK_PAIRS[pairCursor % MOCK_PAIRS.length];
  pairCursor += 1;

  devLog('🪪 [selfie][mock] /start taklit edildi', pair.join(' + '));

  return {
    attemptId: `${MOCK_ID_PREFIX}${pairCursor}`,
    challenges: pair.map((code) => ({ code, instruction: instructionFor(code) })),
    // Gerçekteki gibi ~5 dk; `isAttemptExpired` bu değeri okuyor.
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

export function isMockSelfieAttempt(attemptId: string): boolean {
  return attemptId.startsWith(MOCK_ID_PREFIX);
}

/**
 * Mock sonuç. Sırayla her sebep kodunu, sonunda başarıyı döndürür.
 *
 * `message` bilerek `null`: metnin KODDAN üretildiğini doğruluyoruz. Sunucu
 * metnine düşüş yalnız bilinmeyen kodda olmalı, mock bunu maskelememeli.
 */
export function mockSelfieResult(): SelfieResult {
  let reasonCode: string | null;
  if (MOCK_OUTCOME === 'success') {
    reasonCode = null;
  } else if (MOCK_OUTCOME === 'tour') {
    reasonCode = REASON_TOUR[reasonCursor % REASON_TOUR.length];
  } else {
    reasonCode = MOCK_OUTCOME;
  }
  reasonCursor += 1;

  devLog(
    `🪪 [selfie][mock] /submit taklit edildi (${MOCK_OUTCOME})`,
    reasonCode ?? 'BAŞARILI',
  );

  if (reasonCode === null) {
    return {
      verified: true,
      verifiedAt: new Date().toISOString(),
      reasonCode: null,
      canRetry: false,
      failedAtStep: null,
      message: null,
    };
  }

  return {
    verified: false,
    verifiedAt: null,
    reasonCode,
    canRetry: true,
    // 1 tabanlı; sonuç ekranındaki "n. adımda takıldık" satırını da gösteriyor.
    failedAtStep: (reasonCursor % 2) + 1,
    message: null,
  };
}
