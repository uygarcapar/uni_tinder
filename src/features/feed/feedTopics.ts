import i18n from "@/shared/i18n";
import { resolveLocalized } from "@/shared/queries/commonQueries";
import type { FeedMeDto, FeedTopic, FeedTopicOption } from "./feedTypes";

/**
 * Konu (hashtag) kataloğunun ÇÖZÜMÜ — sunucu listesi öncelikli, istemci yedeği.
 *
 * ── Neden iki kaynak ────────────────────────────────────────────────────────
 * Konu listesi `/api/feed/me` ile geliyor ve ETİKETLERİ ORADAN okumak kural:
 * ürün yeni bir konu açtığında uygulama sürümü çıkmadan görünmesi gerekiyor
 * (prompt kataloğunun ve üniversite listesinin aynı deseni).
 *
 * Ama composer'da konu ZORUNLU: `/me` henüz gelmediyse ya da alanı taşımayan
 * bir sunucuya bağlanıldıysa liste boş kalır ve kullanıcı gönderi atamaz —
 * ekranı kilitleyen bir boşluk. Bu yüzden istemcide bir yedek liste var.
 *
 * ⚠️ YEDEK LİSTE SUNUCUYU EZMİYOR: sunucu bir liste gönderdiği an o kazanıyor,
 * yedeğin içindeki fazlalık/eksik anahtarlar hiç okunmuyor. İki liste
 * ayrıştığında doğru olan sunucudur.
 */

/**
 * İstemci yedeği — sunucu listesi gelmediğinde kullanılan sıra.
 *
 * `General` EN SONDA ve bu bilinçli: composer'da ilk çip olsaydı kullanıcıların
 * çoğu düşünmeden onu seçer ve konu alanı hiçbir şey ayırt etmezdi. Zorunlu
 * alanın anlamı, seçimin bir karar olmasından geliyor.
 */
export const FALLBACK_FEED_TOPICS: readonly FeedTopic[] = [
  "Roommate",
  "Event",
  "StudyGroup",
  "LostAndFound",
  "Advice",
  "Social",
  "General",
];

/** Sunucu listesi geçerliyse onu, değilse yedeği döndürür. */
export function resolveTopicKeys(me: FeedMeDto | undefined | null): string[] {
  const fromServer = me?.topics;
  if (Array.isArray(fromServer) && fromServer.length > 0) {
    // `key`i olmayan kayıt sorgu parametresine gönderilemez — listede de
    // gösterilmiyor (prompt kataloğunun `enumName` süzgeciyle aynı kural).
    const keys = fromServer
      .map((t) => (typeof t?.key === "string" ? t.key.trim() : ""))
      .filter(Boolean);
    if (keys.length > 0) return keys;
  }
  return [...FALLBACK_FEED_TOPICS];
}

/**
 * Konunun GÖRÜNEN adı.
 *
 * Sıra: sunucunun çift dilli `display`i → i18n'deki yerel karşılık → ham
 * anahtar. Sunucu önce geliyor çünkü yeni bir konu istemci sürümü çıkmadan
 * görünebilmeli; i18n yedeği de sunucunun alanı boş bıraktığı durumda devrede.
 *
 * ⚠️ `display` ÇİFT DİLLİ BİR OBJE olabiliyor ({tr,en}) — ham render edilirse
 * React "Objects are not valid as a React child" ile patlar. `resolveLocalized`
 * zorunlu.
 */
export function topicLabel(
  key: string,
  me: FeedMeDto | undefined | null,
): string {
  const option = me?.topics?.find((t) => t?.key === key);
  const serverLabel = option
    ? resolveLocalized(option.display as any, i18n.language, "")
    : "";
  if (serverLabel) return serverLabel;
  // i18n yedeği: anahtar tanınmıyorsa ham anahtara düşüyor (uydurma bir
  // etiket basmaktansa anahtarı göstermek dürüst).
  return i18n.t(`feed.topics.${key}`, { defaultValue: key });
}

/** Filtre satırındaki "Tüm konular" etiketi. */
export function topicAllLabel(): string {
  return i18n.t("feed.topics.all", { defaultValue: "Tüm konular" });
}
