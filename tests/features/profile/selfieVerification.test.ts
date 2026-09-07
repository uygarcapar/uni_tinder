/**
 * Selfie doğrulamanın sözleşme katmanı.
 *
 * Buradaki sözler, sahada yanlış tarafa düşmenin pahalı olduğu üç yer:
 *   1. `isSelfieVerified` alanı GELMEDİĞİNDE `false` değil `null` — "backend'in
 *      bu sürümü yok" ile "doğrulanmamış" farklı şeyler.
 *   2. Bilinmeyen `reasonCode` sunucunun kendi metnine düşer, jeneriğe değil.
 *   3. `attempt_expired` dışında hiçbir kod otomatik yeniden başlatmaz —
 *      her yeniden deneme saatlik 5 haktan birini yakıyor.
 */

import {
  isAttemptExpired,
  isSelfieRetryAuto,
  normalizeSelfieAttempt,
  normalizeSelfieResult,
  resolveSelfieVerified,
  selfieChallengeHintKey,
  selfieChallengeKind,
  selfieReasonText,
  selfieReasonTitle,
  selfieResultAnalytics,
  SELFIE_CHALLENGE_CODES,
  SELFIE_REASON_CODES,
} from '@/features/profile/selfie/selfieVerification';

describe('resolveSelfieVerified', () => {
  it('alan hiç gelmediyse null döner — false SANMAZ', () => {
    expect(resolveSelfieVerified({})).toBeNull();
    expect(resolveSelfieVerified(null)).toBeNull();
    expect(resolveSelfieVerified({ isSelfieVerified: 'true' })).toBeNull();
  });

  it('boolean geldiğinde olduğu gibi okur', () => {
    expect(resolveSelfieVerified({ isSelfieVerified: true })).toBe(true);
    expect(resolveSelfieVerified({ isSelfieVerified: false })).toBe(false);
  });
});

describe('normalizeSelfieAttempt', () => {
  it('id + talimatlı challenge varsa okur', () => {
    const attempt = normalizeSelfieAttempt({
      attemptId: 'abc',
      challenges: [
        { code: 'TurnRight', instruction: 'Başını hafifçe sağa çevir' },
        { code: 'Smile', instruction: 'Gülümse' },
      ],
      expiresAt: '2026-08-28T12:05:00Z',
    });
    expect(attempt?.attemptId).toBe('abc');
    expect(attempt?.challenges).toHaveLength(2);
  });

  it('talimatsız challenge ayıklanır — kullanıcı ne yapacağını bilemez', () => {
    const attempt = normalizeSelfieAttempt({
      attemptId: 'abc',
      challenges: [
        { code: 'TurnRight', instruction: 'Sağa çevir' },
        { code: 'Smile' },
      ],
    });
    expect(attempt?.challenges).toHaveLength(1);
  });

  it('id ya da challenge yoksa null — uydurulmuş akış başlatılmaz', () => {
    expect(normalizeSelfieAttempt({ challenges: [] })).toBeNull();
    expect(normalizeSelfieAttempt({ attemptId: 'abc', challenges: [] })).toBeNull();
    expect(normalizeSelfieAttempt(null)).toBeNull();
  });
});

describe('normalizeSelfieResult', () => {
  it('verified:false bir HATA DEĞİL, normal sonuç olarak okunur', () => {
    const result = normalizeSelfieResult(
      {
        verified: false,
        reasonCode: 'challenge_not_met',
        canRetry: true,
        failedAtStep: 1,
      },
      'İstenen hareketi algılayamadık.',
    );
    expect(result.verified).toBe(false);
    expect(result.canRetry).toBe(true);
    expect(result.failedAtStep).toBe(1);
    expect(result.message).toBe('İstenen hareketi algılayamadık.');
  });

  it('canRetry gelmezse başarıda false, başarısızlıkta true varsayılır', () => {
    expect(normalizeSelfieResult({ verified: true }).canRetry).toBe(false);
    expect(normalizeSelfieResult({ verified: false }).canRetry).toBe(true);
  });
});

describe('selfieReasonText', () => {
  it('bilinen kodda i18n anahtarına gider (anahtarın kendisini DÖNDÜRMEZ)', () => {
    const text = selfieReasonText('no_face');
    expect(text).not.toBe('profile.selfie.reason.no_face');
    expect(text.length).toBeGreaterThan(0);
  });

  it('analysis_failed metni kullanıcıyı suçlamaz — BİZİM hatamız', () => {
    const text = selfieReasonText('analysis_failed');
    expect(text).toMatch(/bizden kaynaklı/i);
  });

  it('bilinmeyen kodda sunucunun yerelleştirilmiş metnine düşer', () => {
    expect(selfieReasonText('brand_new_code_from_backend', 'Sunucu metni')).toBe(
      'Sunucu metni',
    );
  });

  it('ne kod ne metin varsa jenerik metne düşer', () => {
    const text = selfieReasonText(null, null);
    expect(text).not.toBe('profile.selfie.reason.fallback');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('isSelfieRetryAuto', () => {
  it('YALNIZ attempt_expired otomatik yeniden başlatılır', () => {
    expect(isSelfieRetryAuto('attempt_expired')).toBe(true);
    // Diğerlerinde karar kullanıcının: her /start saatlik kotadan bir hak yakıyor.
    expect(isSelfieRetryAuto('challenge_not_met')).toBe(false);
    expect(isSelfieRetryAuto('face_mismatch')).toBe(false);
    expect(isSelfieRetryAuto('analysis_failed')).toBe(false);
    expect(isSelfieRetryAuto(null)).toBe(false);
  });
});

describe('isAttemptExpired', () => {
  it('expiresAt geçmişse true', () => {
    expect(
      isAttemptExpired({
        attemptId: 'a',
        challenges: [],
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe(true);
  });

  it('alan yoksa/çözülemiyorsa false — sunucu nihai söz sahibi', () => {
    expect(
      isAttemptExpired({ attemptId: 'a', challenges: [], expiresAt: null }),
    ).toBe(false);
    expect(
      isAttemptExpired({ attemptId: 'a', challenges: [], expiresAt: 'çöp' }),
    ).toBe(false);
    expect(isAttemptExpired(null)).toBe(false);
  });
});

// ── Backend sözleşmesiyle hizalanma ─────────────────────────────────────────
// Bu iki liste backend'den KOPYA: `SelfieFailureReasons` (11 kod) ve
// `SelfieChallengePool.Active` (5 hareket). Sürüklenmeleri sessiz bir bozulma
// üretiyor, o yüzden sayıları da içerikleri de burada sabitleniyor.

describe('sebep kodu listesi', () => {
  it('backend’in 11 kodunun HEPSİNİ tanır', () => {
    // 8'de kalmıştı: eksik üç kod `KNOWN_REASON_CODES.has()`i false'a düşürüyor,
    // gövde sunucu metnine düşerken BAŞLIK jeneriğe kayıyor ve gövdeyi yalanlıyor.
    expect(SELFIE_REASON_CODES).toHaveLength(11);
    expect(SELFIE_REASON_CODES).toEqual(
      expect.arrayContaining([
        'challenge_too_weak',
        'challenge_wrong_move',
        'challenge_too_much',
      ]),
    );
  });

  it('yeni üç kodun metni VE başlığı jeneriğe düşmez', () => {
    for (const code of [
      'challenge_too_weak',
      'challenge_wrong_move',
      'challenge_too_much',
    ]) {
      // Sunucu metni verilse bile kendi metnimizi kullanıyoruz (kod > metin).
      const body = selfieReasonText(code, 'sunucudan gelen metin');
      expect(body).not.toBe('sunucudan gelen metin');
      expect(body).not.toBe(`profile.selfie.reason.${code}`);

      const title = selfieReasonTitle(code);
      expect(title).not.toBe(selfieReasonTitle('bilinmeyen_kod'));
    }
  });
});

describe('hareket havuzu', () => {
  it('yalnız kalibre edilmiş 5 hareketi listeler', () => {
    expect(SELFIE_CHALLENGE_CODES).toEqual([
      'TurnRight',
      'TurnLeft',
      'LookUp',
      'Smile',
      'MouthOpen',
    ]);
  });

  it('emekli hareketler listede YOK — havuza girmiyorlar', () => {
    for (const retired of ['LookDown', 'TiltHead', 'Neutral', 'EyesClosed']) {
      expect(SELFIE_CHALLENGE_CODES).not.toContain(retired);
    }
  });
});

describe('selfieChallengeKind / selfieChallengeHintKey', () => {
  it('poz hareketlerinde "abartma" ipucu verilir', () => {
    for (const code of ['TurnRight', 'TurnLeft', 'LookUp']) {
      expect(selfieChallengeKind(code)).toBe('pose');
      expect(selfieChallengeHintKey(code)).toBe('profile.selfie.camera.hintPose');
    }
  });

  it('🔴 mimik hareketlerinde ASLA "abartma" denmez', () => {
    // Backend'in EvaluateBoolSignal'inde `challenge_too_much` dalı YOK: fazla
    // gülümsemek diye bir başarısızlık yok. Orada abartmayı önermek kullanıcıyı
    // `challenge_too_weak`e iterdi.
    for (const code of ['Smile', 'MouthOpen']) {
      expect(selfieChallengeKind(code)).toBe('expression');
      expect(selfieChallengeHintKey(code)).toBe(
        'profile.selfie.camera.hintExpression',
      );
    }
  });

  it('bilinmeyen kodda null — genel ipucu zaten çiziliyor, tekrarlanmaz', () => {
    expect(selfieChallengeKind('SomethingNew')).toBe('unknown');
    expect(selfieChallengeHintKey('SomethingNew')).toBeNull();
    expect(selfieChallengeHintKey(undefined)).toBeNull();
  });
});

describe('selfieResultAnalytics', () => {
  const attempt = {
    attemptId: 'a',
    expiresAt: null,
    challenges: [
      { code: 'TurnRight', instruction: 'sağa çevir' },
      { code: 'Smile', instruction: 'gülümse' },
    ],
  };

  it('takılınan ADIMIN hareket kodunu çözer (1 tabanlı)', () => {
    const payload = selfieResultAnalytics(
      normalizeSelfieResult({
        verified: false,
        reasonCode: 'challenge_too_weak',
        failedAtStep: 2,
      }),
      attempt,
    );
    // failedAtStep 2 → challenges[1] = Smile. 0 tabanlı okunursa TurnRight çıkar
    // ve eşik ayarının girdisi yanlış harekete yazılır.
    expect(payload.challengeCode).toBe('Smile');
    expect(payload.reasonCode).toBe('challenge_too_weak');
    expect(payload.failedAtStep).toBe(2);
  });

  it('adım yoksa hareket kodu UYDURULMAZ', () => {
    // face_mismatch / analysis_failed / attempt_expired belirli bir harekete ait
    // değil; backend failedAtStep'i null gönderiyor.
    const payload = selfieResultAnalytics(
      normalizeSelfieResult({
        verified: false,
        reasonCode: 'face_mismatch',
        failedAtStep: null,
      }),
      attempt,
    );
    expect(payload.challengeCode).toBeNull();
    expect(payload.failedAtStep).toBeNull();
  });

  it('🔴 kare / similarity / ham poz değeri TAŞIMAZ', () => {
    const payload = selfieResultAnalytics(
      normalizeSelfieResult(
        { verified: true, verifiedAt: '2026-09-06T10:00:00Z' },
        'Fotoğrafın doğrulandı!',
      ),
      attempt,
    );
    // Yalnızca bu dört alan; metin bile gitmiyor (dile göre değişir, aynı olayı
    // iki ayrı satır gibi gösterir).
    expect(Object.keys(payload).sort()).toEqual([
      'challengeCode',
      'failedAtStep',
      'reasonCode',
      'verified',
    ]);
    expect(payload.verified).toBe(true);
  });
});
