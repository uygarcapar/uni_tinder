/**
 * `NewUserSpec` FABRİKASI — spec'ler kullanıcıyı elle kurmaz.
 *
 * NEDEN ZORUNLU: backend'in izolasyon tasarımı adresin
 * `E2E__AccountEmailPatterns` desenine uymasını şart koşuyor. Uymayan bir
 * adresle açılan hesap `IsE2EAccount=false` doğuyor; görünürlük yüklemi
 * simetrik olduğu için hiçbir botu görmüyor ve koşu **hata vermeden boş
 * desteyle geçiyor** — yeşil ama anlamsız.
 *
 * Bu yüzden e-posta, şifre ve görünür ad tek bir yerden, `freshEmail`
 * ailesinden geliyor. Spec'lerin `email` alanını elle doldurması gereken bir
 * yol BIRAKILMADI: alan `NewUserSpec`te zorunlu ama fabrika dışında
 * üretilmesinin meşru bir sebebi yok.
 *
 * (Sözleşmenin kendisi `tests/e2e/e2eEmailContract.test.ts`te çivili ve CI'da
 * simülatörsüz koşuyor.)
 */
import { SEED } from '../support/env';
import { freshEmail, passwordFor, displayNameFor } from '../seed/emails';
import type { NewUserSpec, RegMode } from './types';

export interface NewUserOverrides {
  readonly mode?: RegMode;
  readonly slot?: number;
  readonly seed?: number;
  /** Verilmezse cetvel sürüklenmiyor — varsayılan 170 zaten geçerli. */
  readonly heightCm?: number;
  readonly hobbyCount?: number;
  readonly promptCount?: number;
  readonly photoCount?: 2 | 3 | 4 | 5 | 6;
  readonly referralCode?: string;
  readonly skipLifestyle?: boolean;
  readonly yearOfStudy?: number;
}

/**
 * Tohum + slot'tan deterministik bir kullanıcı üretir.
 *
 * ⚠️ `slot` UI kullanıcıları için botlardan AYRI aralıkta tutulmalı, yoksa
 * aynı adres iki kez üretilir ve ikincisi `ACCOUNT_EXISTS` yer. Bot'lar
 * 0..N-1 kullanıyor (seed/cli.ts); UI kullanıcıları 100'den başlıyor.
 */
export const UI_USER_SLOT_BASE = 100;

export function newUserSpec(overrides: NewUserOverrides = {}): NewUserSpec {
  const seed = overrides.seed ?? SEED;
  const slot = overrides.slot ?? UI_USER_SLOT_BASE;
  const mode = overrides.mode ?? 'Dating';

  // 20-27 yaş: 18 altı kayıt şemasınca reddediliyor, üst sınır keyfi.
  const age = 20 + ((seed + slot) % 8);
  const year = new Date().getUTCFullYear() - age;

  return {
    seed,
    email: freshEmail(seed, slot),
    password: passwordFor(seed, slot),
    firstName: displayNameFor(seed, slot),
    dob: {
      day: ((seed * 7 + slot) % 27) + 1,
      month: ((seed + slot) % 12) + 1,
      year,
    },
    mode,
    yearOfStudy: overrides.yearOfStudy ?? ((slot % 5) + 1),
    heightCm: overrides.heightCm,
    hobbyCount: overrides.hobbyCount ?? 3,
    promptCount: overrides.promptCount ?? 1,
    photoCount: overrides.photoCount ?? 2,
    referralCode: overrides.referralCode,
    // Step16 tamamen opsiyonel; varsayılan yol "Atla" — akışın en kısa hâli.
    skipLifestyle: overrides.skipLifestyle ?? true,
  };
}
