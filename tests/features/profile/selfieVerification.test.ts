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
  selfieReasonText,
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
