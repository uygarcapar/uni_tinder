import { parseBackendDate } from "@/shared/utils/backendDate";
import type { ReferralRewardType } from "@/shared/types";

/**
 * Davet kartı ile sheet'inin ORTAK sunum mantığı — saf fonksiyonlar.
 *
 * İki yüzey aynı ödülü ve aynı süreyi yazıyor; hesabı iki yerde tekrarlamak,
 * aynı ekranda birbirini tutmayan iki sayı üretmenin en kısa yolu olurdu.
 */

/**
 * Hakkın bitişine kalan GÜN. Yukarı yuvarlanıyor: 6 saat kalmışken "0 gün
 * kaldı" demek, hakkın bugün hâlâ yürürlükte olduğunu gizlerdi.
 *
 * `null` = damga yok ya da ayrıştırılamadı; çağıran satırı hiç çizmiyor.
 * Geçmiş bir damga da `null`: süresi dolmuş bir hakkı "0 gün" diye göstermek
 * yerine söylememek doğru — backend zaten hakkı temizliyor.
 */
export function grantDaysRemaining(
  expiresAt: string | null | undefined,
): number | null {
  const date = parseBackendDate(expiresAt);
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

/** Ödül türünün i18n anahtarı. Bilinmeyen tür → `null` (satır çizilmez). */
export function rewardLabelKey(type: ReferralRewardType | string): string | null {
  switch (type) {
    case "VisibilityFilter":
      return "referral.reward.visibilityFilter";
    case "SuperLike":
      return "referral.reward.superLike";
    case "Note":
      return "referral.reward.note";
    default:
      // Backend merdivene yeni bir tür eklerse (kademe 4+) istemci onu
      // ÇİZMİYOR — "undefined" ya da ham enum adı basmaktan iyisi susmak.
      return null;
  }
}

/**
 * "Görünürlük filtresi · 30 gün" / "3 süper beğeni" / "2 not".
 *
 * `amount` VisibilityFilter'da GÜN, diğerlerinde KREDİ — ayrım metnin
 * kendisinde, çağıran birim taşımak zorunda değil.
 */
export function rewardLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  type: ReferralRewardType | string,
  amount: number,
): string | null {
  const key = rewardLabelKey(type);
  if (!key) return null;
  // `count` DEĞİL `amount`: i18next'te `count` çoğul çözümlemesini tetikler ve
  // sözlükte `_other` varyantı olmayan anahtarı bulamaz.
  return t(key, { amount });
}
