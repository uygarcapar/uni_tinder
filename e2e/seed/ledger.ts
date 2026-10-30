/**
 * HESAP DEFTERİ — temizliğin hafızası.
 *
 * Her hesap yaratıldığı ANDA diske yazılıyor, koşu sonunda toplu değil.
 * Gerekçe: koşu ortasında process öldürülürse (Ctrl-C, CI timeout, WDA
 * çökmesi) o ana kadar açılmış hesapların kaydı yine duruyor ve
 * `npm run e2e:seed -- --purge` onları silebiliyor. Aksi halde backend'de
 * sessizce çöp birikir ve bir sonraki koşu `ACCOUNT_EXISTS` yer.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { RUN_ID, artifact, ensureArtifactDirs } from '../support/env';

export interface LedgerEntry {
  runId: string;
  email: string;
  password: string;
  userId?: string;
  role: string;
  createdAt: string;
  deletedAt?: string;
}

const FILE = (): string => artifact('ledger.json');

function readAll(): LedgerEntry[] {
  const path = FILE();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as LedgerEntry[]) : [];
  } catch {
    // Bozuk defter sessizce yutulmuyor ama koşuyu da durdurmuyor:
    // kaybedilen şey eski kayıtlar, kazanılan şey yeni koşunun yürümesi.
    return [];
  }
}

function writeAll(entries: LedgerEntry[]): void {
  ensureArtifactDirs();
  writeFileSync(FILE(), JSON.stringify(entries, null, 2));
}

export function record(entry: Omit<LedgerEntry, 'runId' | 'createdAt'>): void {
  const all = readAll();
  all.push({ ...entry, runId: RUN_ID, createdAt: new Date().toISOString() });
  writeAll(all);
}

/**
 * E-posta DEĞİŞTİREN akışlar bunu çağırmak ZORUNDA.
 *
 * `/api/user/ConfirmEmailChange` başarıda yeni token seti DÖNDÜRMÜYOR ve tüm
 * refresh token'ları iptal ediyor — oturum kapanıyor. Defter güncellenmezse
 * temizlik ESKİ adresle giriş yapmaya çalışır, başarısız olur ve hesap
 * backend'de kalır.
 */
export function rename(oldEmail: string, newEmail: string): void {
  const all = readAll();
  for (const entry of all) {
    if (entry.email === oldEmail && !entry.deletedAt) entry.email = newEmail;
  }
  writeAll(all);
}

export function markDeleted(email: string): void {
  const all = readAll();
  for (const entry of all) {
    if (entry.email === email) entry.deletedAt = new Date().toISOString();
  }
  writeAll(all);
}

/** Silinmemiş kayıtlar. `runId` verilirse yalnız o koşununkiler. */
export function pending(runId?: string): LedgerEntry[] {
  return readAll().filter((e) => !e.deletedAt && (!runId || e.runId === runId));
}

export function clear(): void {
  writeAll([]);
}
