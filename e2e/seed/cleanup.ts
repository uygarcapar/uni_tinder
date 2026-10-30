/**
 * TEMİZLİK.
 *
 * Silme ucu `DELETE /api/privacy/account` — ANINDA, geri alınamaz, gövdede
 * şifre ZORUNLU, 204 döner.
 *
 * ⚠️ `/api/user/DeleteUser` KULLANILMIYOR: deprecated ve orphan kayıt bırakıyor.
 * ⚠️ `/api/privacy/deactivate` KULLANILMIYOR: yalnız donduruyor, e-posta
 *    serbest KALMIYOR → bir sonraki koşu `ACCOUNT_EXISTS` yer.
 */
import { API_ENDPOINTS } from '@/shared/constants/api';
import { ApiError, del } from './client';
import { loginAs } from './createBot';
import * as ledger from './ledger';

export interface CleanupResult {
  deleted: number;
  alreadyGone: number;
  failed: Array<{ email: string; reason: string }>;
}

/** Tek hesap. Zaten yoksa hata DEĞİL — temizlik idempotent olmak zorunda. */
export async function deleteAccount(email: string, password: string): Promise<'deleted' | 'gone'> {
  let token: string;
  try {
    ({ token } = await loginAs(email, password));
  } catch (err) {
    // 401/404: hesap yok ya da şifre değişmiş. İkisinde de silecek bir şey yok.
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
      ledger.markDeleted(email);
      return 'gone';
    }
    throw err;
  }
  await del(API_ENDPOINTS.PRIVACY_DELETE_PERMANENT, { password }, token);
  ledger.markDeleted(email);
  return 'deleted';
}

/**
 * Defterdeki bekleyen her hesabı siler.
 *
 * SIRAYLA siliniyor, paralel değil: `api.ts`in 429 yolu gerçek ve bir koşuda
 * 100+ hesap birikebiliyor. Hız burada değerli değil, eksiksizlik değerli.
 */
export async function purge(runId?: string): Promise<CleanupResult> {
  const entries = ledger.pending(runId);
  const result: CleanupResult = { deleted: 0, alreadyGone: 0, failed: [] };

  for (const entry of entries) {
    try {
      const outcome = await deleteAccount(entry.email, entry.password);
      if (outcome === 'deleted') result.deleted += 1;
      else result.alreadyGone += 1;
    } catch (err) {
      result.failed.push({
        email: entry.email,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
