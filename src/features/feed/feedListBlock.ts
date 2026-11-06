import { FEED_CODES, MODE_CODES } from "@/shared/constants/responseCodes";

/**
 * Akış listesinin BLOKE boş durumu — saf karar.
 *
 * Ekrandan ayrı dosyada çünkü karar iki TERMİNAL kodu ayırt ediyor ve ikisini
 * karıştırmanın bedeli ters yönlerde:
 *
 *   • `disabled` (UT-7301) — ÖZELLİK kapalı. Kullanıcının yapabileceği şey
 *     yok; CTA koymak yapamayacağı bir şeyi teklif etmek olur.
 *   • `modeNotOpened` (UT-2304) — kullanıcı ARKADAŞ PROFİLİNİ açmamış
 *     (akış Arkadaş'a özel, BE 2026-11-06'dan beri GET /api/feed/posts da 403
 *     dönüyor). Yapabileceği şey VAR: "Profili aç" CTA'sı. Bunu "kapalı"
 *     ekranında eritmek, açabileceği bir modu kapalı diye göstermek olurdu
 *     (MODE_CODES'taki 2302/2304 uyarısının aynısı).
 *
 * İkisi birden görünürse `disabled` kazanıyor: özellik bayrağı kapalıyken
 * profil açtırmak kullanıcıyı yine kapalı bir kapıya getirirdi.
 *
 * ⚠️ Bu durum normalde ERİŞİLMEZ: sekme yalnız Arkadaş modunda çiziliyor
 * (feedMode > feedAllowedInMode) ve Arkadaş moduna geçiş profil açılmadan
 * mümkün değil. Kapı savunmacı — sunucu/istemci durumu ayrıştığında (ör.
 * başka cihazdan değişen profil) jenerik hata yerine doğru kapı görünsün.
 */
export type FeedListBlock = "disabled" | "modeNotOpened" | null;

export function feedListBlock(
  codes: ReadonlyArray<string | null>,
): FeedListBlock {
  if (codes.includes(FEED_CODES.DISABLED)) return "disabled";
  if (codes.includes(MODE_CODES.MODE_NOT_OPENED)) return "modeNotOpened";
  return null;
}
