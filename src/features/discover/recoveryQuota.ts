import type { SwipeStats } from "@/shared/types";

/**
 * Kaçırılan eşleşme kurtarmasının TEK yorumlama noktası.
 *
 * 2026-08-31 sözleşmesi kurtarmanın kredi ekonomisini TAMAMEN kaldırdı:
 * kurtarma artık satın alınabilir bir ürün değil, PREMIUM AYRICALIĞI.
 *
 *   free    → hakkı yok, satın da alamaz (paketler kaldırıldı)
 *   premium → SINIRSIZ
 *
 * `/Stats` alanları silinmedi (alan yokluğunda çöken eski istemciler var) ama
 * hepsi sabit sinyale döndü. Okunmaya değer TEK alan
 * `remainingMissedMatchRecovery`:
 *
 *   -1 → sınırsız (premium)
 *    0 → hak yok (free)
 *
 * ⚠️ `dailyMissedMatchRecoveryLimit` sınırsızlık sinyali DEĞİL: premium'da da
 * `0` dönüyor ve backend'de bunu kilitleyen bir test var. Bu alan üzerinden
 * `=== -1` kontrolü yazmak sessizce hep `false` verir. `purchasedRecoveries`,
 * `quotaRecoveryRemaining` ve reset alanları ölü — okumayın.
 */

/** `/Stats` → sınırsızlık sentineli. Diğer kotalarla aynı konvansiyon. */
const UNLIMITED = -1;

export interface RecoveryAccess {
  /** Kurtarma sınırsız mı — yani kullanıcı premium mu. */
  unlimited: boolean;
  /**
   * Sunucudan hiçbir sinyal okunamadı (eski sürüm / `/Stats` henüz çekilmedi).
   * `unlimited: false` ile AYNI ŞEY DEĞİL: bilinmiyorken ekrana ne "Sınırsız"
   * ne de bir satış teklifi yazılmalı — ikisi de olmayan bir durumu iddia eder.
   */
  unknown: boolean;
}

type StatsLike = Partial<
  Pick<SwipeStats, "remainingMissedMatchRecovery">
> | null | undefined;

export function resolveRecoveryAccess(stats: StatsLike): RecoveryAccess {
  const remaining = stats?.remainingMissedMatchRecovery;
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
    return { unlimited: false, unknown: true };
  }
  return { unlimited: remaining === UNLIMITED, unknown: false };
}
