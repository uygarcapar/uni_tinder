/**
 * E2E hesap adlarının SAF sözleşmesi — ortamdan bağımsız.
 *
 * NEDEN AYRI DOSYA: `emails.ts` `support/env`i import ediyor ve o modül
 * `.env.e2e` yoksa THROW ediyor. Bu sözleşmeyi CI'da (Linux, simülatörsüz,
 * .env.e2e'siz) test edebilmek için saf kısmın env'e hiç dokunmaması gerekiyor.
 *
 * SÖZLEŞME — backend'in izolasyon tasarımıyla kilitli:
 * üretilen her adres `E2E__AccountEmailPatterns` desenine UYMAK ZORUNDA.
 * Uymazsa hesap `IsE2EAccount=false` doğar, görünürlük yüklemi simetrik
 * olduğu için hiçbir botu göremez ve koşu **hata vermeden boş desteyle
 * geçer** — yeşil ama anlamsız. Bu yüzden desen burada da yazılı ve testle
 * çivili.
 */
import { createHash } from 'node:crypto';

/** Backend'in prod'da set edeceği desen. İkisi AYRIŞAMAZ. */
export const E2E_EMAIL_PATTERN = 'e2e.*@bilgiedu.net';

/** Deseni taşıyan harfi harfine önek — backend guard'ı bunu şart koşuyor. */
export const E2E_LOCAL_PREFIX = 'e2e.';

export function hashFor(runId: string, seed: number, slot: number, salt = ''): string {
  return createHash('sha256').update(`${salt}${runId}:${seed}:${slot}`).digest('hex');
}

/**
 * Taze ama TEKRAR ÜRETİLEBİLİR e-posta.
 *
 * Üç eksen birlikte çakışmayı engelliyor: runId (koşu), seed (spec), slot
 * (koşu içindeki sıra).
 *
 * ⚠️ Aynı seed + aynı runId tekrar koşturulursa AYNI adres üretiliyor ve
 * hesap duruyorsa `ACCOUNT_EXISTS` alınıyor. Bu KASITLI: temizlik koşmadıysa
 * sessizce yeni hesap açıp çöp biriktirmek yerine yüksek sesle patlasın.
 */
export function buildEmail(domain: string, runId: string, seed: number, slot: number): string {
  return `${E2E_LOCAL_PREFIX}${hashFor(runId, seed, slot).slice(0, 10)}@${domain}`;
}

/**
 * Görünür ad. Benzersiz olmak ZORUNDA: tohumlayıcı gerektiğinde UI
 * kullanıcısını destede `displayName` eşleşmesiyle buluyor.
 */
export function buildDisplayName(runId: string, seed: number, slot: number): string {
  return `E2E-${hashFor(runId, seed, slot).slice(0, 6).toUpperCase()}`;
}

/** Davet freni için cihaz kimliği — bot başına benzersiz olmalı. */
export function buildInstallationId(runId: string, seed: number, slot: number): string {
  const h = hashFor(runId, seed, slot, 'install:');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join(
    '-'
  );
}

/** 8+ karakter şartı (formSchemas) + harf/rakam karışımı. */
export function buildPassword(seed: number, slot: number): string {
  return `E2e!${((seed + slot) % 100000).toString().padStart(5, '0')}aA`;
}

/**
 * Backend'in glob eşlemesinin istemci aynası — YALNIZ doğrulama için.
 * Eşleme `OrdinalIgnoreCase`, tek joker `*`.
 */
export function matchesPattern(email: string, pattern: string): boolean {
  const rx = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`,
    'i'
  );
  return rx.test(email);
}
