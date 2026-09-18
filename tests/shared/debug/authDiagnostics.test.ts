/**
 * Oturum defteri — cold start'ı atlatan tek kanıt.
 *
 * Buradaki testler defterin ÜÇ sözleşmesini sabitliyor:
 *   1. "Yarım kalmış refresh" işareti: POST uçarken diske iner, başarıda
 *      silinir, yaş sınırını aşınca kurtarma tetiklemez.
 *   2. Rapor başlığındaki "son kayıp" GERÇEK gerekçeyi gösterir — `logout()`
 *      thunk'ı onAuthLost'un hemen ardından çalıştığı için 'kullanıcı' etiketi
 *      taze bir kaydın üstüne YAZMAZ.
 *   3. Tekrarlayan adımlar throttle'lanır; 80 satırlık tampon çevrimdışı
 *      gürültüsüyle dolup session-lost kaydını dışarı itmez.
 */

import {
  authDiag,
  buildAuthReport,
  clearAuthDiagnostics,
  clearRefreshInflight,
  hasInterruptedRefresh,
  markRefreshOk,
  markRefreshStart,
  markSessionLost,
  readAuthEvents,
} from '@/shared/debug/authDiagnostics';

beforeEach(() => {
  clearAuthDiagnostics();
  clearRefreshInflight();
});

describe('yarım kalmış refresh işareti', () => {
  test('POST öncesi konur, başarılı rotasyonda silinir', () => {
    markRefreshStart();
    expect(hasInterruptedRefresh()).toBe(true);

    markRefreshOk(1);
    expect(hasInterruptedRefresh()).toBe(false);
  });

  test('yaş sınırını aşan işaret kurtarma tetiklemez', () => {
    markRefreshStart();
    // Sınır 0 → "şu an konmuş" işaret bile eski sayılır; grace penceresi çoktan
    // kapanmışken koşulsuz refresh yalnız fazladan bir 401 üretirdi.
    expect(hasInterruptedRefresh(0)).toBe(false);
  });

  test('kayıp kaydı, öncesindeki yarım refresh’i raporlar', () => {
    markRefreshStart();
    markSessionLost('rest-401', { status: 401, reason: 'token_reuse' });

    const son = readAuthEvents().at(-1)!;
    expect(son.step).toBe('session-lost');
    // Bu alan 1 numaralı hipotezin (cevabı kaybolan refresh) imzası.
    expect(son.detail).toContain('yarımRefresh=');
    expect(son.detail).not.toContain('yarımRefresh=yok');
  });
});

describe('rapor başlığı', () => {
  test('gerçek gerekçe, ardından gelen kullanıcı çıkışıyla EZİLMEZ', () => {
    markSessionLost('rest-401', { status: 401, reason: 'token_reuse' });
    // logout() thunk'ı onAuthLost'un hemen ardından çalışır.
    markSessionLost('kullanıcı');

    const report = buildAuthReport();
    expect(report).toContain('rest-401');
    expect(report).toContain('token_reuse');
    expect(report).not.toMatch(/son kayıp.*kullanıcı/);
    // Olay satırı yine de defterde durmalı — başlıktan düşmesi, kaydın
    // silinmesi anlamına gelmiyor.
    expect(readAuthEvents().at(-1)!.detail).toContain('trigger=kullanıcı');
  });

  test('kendi başına gelen kullanıcı çıkışı başlığa yazılır', () => {
    markSessionLost('kullanıcı');
    expect(buildAuthReport()).toMatch(/son kayıp.*kullanıcı/);
  });
});

describe('throttle', () => {
  test('pencere içindeki tekrar deftere yazılmaz', () => {
    authDiag('refresh-transient', { deneme: 1 }, { throttleMs: 60_000 });
    authDiag('refresh-transient', { deneme: 2 }, { throttleMs: 60_000 });

    const transient = readAuthEvents().filter((e) => e.step === 'refresh-transient');
    expect(transient).toHaveLength(1);
  });

  test('throttle’sız adımlar her seferinde yazılır', () => {
    authDiag('boot-recovery');
    authDiag('boot-recovery');

    expect(readAuthEvents().filter((e) => e.step === 'boot-recovery')).toHaveLength(2);
  });
});
