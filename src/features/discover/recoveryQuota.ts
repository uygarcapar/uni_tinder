import type { SwipeStats } from "@/shared/types";

/**
 * Kaçırılan eşleşme kurtarma bakiyesinin TEK yorumlama noktası.
 *
 * 2026-08-22 sözleşmesi kotayı günlükten çıkardı: free'de tier kotası 0 (hak
 * yalnız satın alınan krediden gelir), premium'da tier başına 1/2/5 ve abonelik
 * döngüsüyle (7/30/365 gün) yenilenir. `/Stats` üç alanı birlikte veriyor:
 *
 *   remainingMissedMatchRecovery  = kota + kredi TOPLAMI (mevcut alan)
 *   quotaRecoveryRemaining        = yalnız tier kotasından kalan
 *   purchasedRecoveries           = süresiz satın alınmış kredi
 *
 * ⚠️ Payda burada tanımlı olmak zorunda: **"kalan > tavan" artık NORMAL bir
 * durum.** İki sebeple olur — (1) kullanıcı kredi satın aldı (2 kota + 10 kredi
 * = 12, tavan 2), (2) yıllıktan aylığa düştü ve eski tier'ın kotası duruyor.
 * Backend clamp YAPMIYOR; clamp'lemek parayla alınmış krediyi yakardı. Her
 * ekranın kendi paydasını hesaplaması bu yüzden sessizce yanlış sayılar üretir.
 */

export interface RecoveryBalance {
  /** Harcanabilir toplam hak. Bilinmiyorsa null (sayı ekrana YAZILMAZ). */
  remaining: number | null;
  /** Yalnız tier kotasından kalan. Backend göndermezse null. */
  quotaRemaining: number | null;
  /** Süresiz satın alınmış kredi. Backend göndermezse null. */
  purchased: number | null;
  /** Tier tavanı — free 0, premium 1/2/5. */
  limit: number | null;
  /** Payda: `tavan + satın alınan kredi`. Tavan bilinmiyorsa null. */
  total: number | null;
  /**
   * `remaining > total` mı — yani payda bakiyeyi kapsamıyor mu (tier düşüşü
   * sonrası eski kota). Bu durumda "5/2" yazmak yerine oransız gösterim
   * kullanılmalı; sayının kendisi doğru, payda anlamsız.
   */
  exceedsTotal: boolean;
  /** Hak var mı — buton/paywall kararı bunun üzerinden. */
  hasBalance: boolean;
  /** Bakiye backend'den hiç okunamadı (eski sürüm / henüz çekilmedi). */
  unknown: boolean;
}

const asCount = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : null;

type StatsLike = Partial<
  Pick<
    SwipeStats,
    | "remainingMissedMatchRecovery"
    | "quotaRecoveryRemaining"
    | "purchasedRecoveries"
    | "dailyMissedMatchRecoveryLimit"
  >
> | null | undefined;

export function resolveRecoveryBalance(stats: StatsLike): RecoveryBalance {
  const remaining = asCount(stats?.remainingMissedMatchRecovery);
  const quotaRemaining = asCount(stats?.quotaRecoveryRemaining);
  const purchased = asCount(stats?.purchasedRecoveries);
  // Tavan `-1` DÖNMEZ (premium de sonlu kotaya tabi), ama free'de 0 dönüyor ve
  // 0 geçerli bir tavan: "abonelik olmadan yenilenen hak yok" demek.
  const limit = asCount(stats?.dailyMissedMatchRecoveryLimit);
  const total = limit == null ? null : limit + (purchased ?? 0);
  return {
    remaining,
    quotaRemaining,
    purchased,
    limit,
    total,
    exceedsTotal: remaining != null && total != null && remaining > total,
    hasBalance: (remaining ?? 0) > 0,
    unknown: remaining == null,
  };
}

/**
 * Kurtarma harcandıktan sonraki iyimser `/Stats` yaması.
 *
 * Backend harcama sırası SABİT: **önce kota, sonra kredi.** Yalnız toplamı
 * düşürmek üçlüyü tutarsız bırakırdı (toplam 3, kota 1, kredi 2 → toplam 2 ama
 * kota hâlâ 1 + kredi 2 = 3). Kurtarma yanıtı SuperLike'ın aksine bakiye
 * taşımıyor, yani server-truth ancak bir sonraki `/Stats` çekiminde geliyor —
 * o ana kadar doğru olan tek hesap bu.
 *
 * Alan hiç bilinmiyorsa (null) DOKUNULMAZ: 0'a çekmek uydurma olurdu.
 */
export function spendRecoveryPatch(stats: StatsLike): Partial<SwipeStats> {
  const { remaining, quotaRemaining, purchased } = resolveRecoveryBalance(stats);
  if (remaining == null || remaining <= 0) return {};
  const patch: Partial<SwipeStats> = {
    remainingMissedMatchRecovery: remaining - 1,
  };
  if (quotaRemaining != null && quotaRemaining > 0) {
    patch.quotaRecoveryRemaining = quotaRemaining - 1;
  } else if (purchased != null && purchased > 0) {
    patch.purchasedRecoveries = purchased - 1;
  }
  return patch;
}
