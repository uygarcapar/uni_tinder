/**
 * Ücretsiz mesaj kotasının ARA UYARI eşikleri.
 *
 * Kota sohbet başına ve İKİ TARAFIN TOPLAMI (backend ChatRoomQuota: tek satır,
 * iki tarafın da mesajı sayılır; limit 30). Ürün kararı (Eylül 2026): her 10
 * mesajda bir toast — 30'luk kotada 20 ve 10 kalınca — artı SON ÇAĞRI olarak
 * 5 kalınca. 0 kalınca söylenecek şey ayrı (tükenme toast'ı + paywall), o
 * yüzden 0 burada eşik DEĞİL.
 *
 * Eşikler limitten türetiliyor, sabit yazılmıyor: backend limiti değiştirirse
 * (ör. 50) uyarılar 40/30/20/10/5'e kendiliğinden kayar.
 */
export const QUOTA_MILESTONE_STEP = 10;
// Adımdan bağımsız son uyarı: "az kaldı" hissi 10'da değil 5'te oturuyor.
export const QUOTA_LAST_CALL = 5;

/** Büyükten küçüğe: limit 30 → [20, 10, 5]. */
export function quotaMilestones(
  freeMessageLimit: number | null | undefined,
  step = QUOTA_MILESTONE_STEP,
  lastCall = QUOTA_LAST_CALL,
): number[] {
  const limit = Math.floor(freeMessageLimit ?? 0);
  if (!(limit > 0) || !(step > 0)) return [];
  const out: number[] = [];
  for (let m = Math.floor((limit - 1) / step) * step; m > 0; m -= step) {
    out.push(m);
  }
  // Son çağrı limitin altında kalıyorsa ve adım katlarında zaten yoksa eklenir;
  // liste büyükten küçüğe sıralı kalmalı (takeCrossedMilestone buna güveniyor).
  if (lastCall > 0 && lastCall < limit && !out.includes(lastCall)) {
    out.push(lastCall);
    out.sort((a, b) => b - a);
  }
  return out;
}

/**
 * `remaining` bu değere düştüğünde daha önce gösterilmemiş eşiklerden en
 * BÜYÜĞÜNÜ döner (toast metni "N mesaj hakkın kaldı" derken N = kalan, eşik
 * değil). Birden fazla eşik aynı anda geçilmişse (giriş anı, toplu düşüş) tek
 * toast çıkar; hepsi `shown`a işlenir ki ayrı ayrı bir daha çıkmasın.
 */
export function takeCrossedMilestone(
  remaining: number | null | undefined,
  milestones: number[],
  shown: Set<number>,
): number | null {
  if (remaining == null || remaining <= 0) return null;
  let hit: number | null = null;
  for (const m of milestones) {
    if (remaining > m || shown.has(m)) continue;
    shown.add(m);
    if (hit === null) hit = m;
  }
  return hit;
}
