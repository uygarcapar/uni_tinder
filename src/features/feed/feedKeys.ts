import type { FeedListParams } from "./feedTypes";

/**
 * Akış query key fabrikası.
 *
 * AYRI modülde (swipeKeys.ts / referralKeys.ts deseni): `AppNavigator`'ın bayrak
 * probe'u ve `routeFromNotification` invalidate'leri bu anahtarları hook
 * zincirini (ve dolayısıyla feedQueries'in tüm mutation ağacını) import etmeden
 * okumak zorunda.
 */
export const feedKeys = {
  all: ["feed"] as const,
  me: ["feed", "me"] as const,
  /**
   * TÜM akış listesi sorgularının ortak kökü.
   * Beğeni optimistic'i filtre kombinasyonunu bilmeden tek seferde yazabilsin
   * diye var: `setQueriesData({ queryKey: feedKeys.postsRoot }, …)` aynı
   * gönderiyi hangi filtrede duruyorsa orada yamalar.
   */
  postsRoot: ["feed", "posts"] as const,
  /**
   * Filtre imzası key'in İÇİNDE — sayfalama modu (cursor vs page) `sort`'tan
   * türüdüğü için filtre değişimi yepyeni bir infinite query doğurur ve elle
   * reset gerekmez (bkz. feedQueries > useFeedPosts).
   */
  posts: (p: FeedListParams) =>
    [
      "feed",
      "posts",
      p.university ?? "own",
      p.sort,
      p.interest,
      p.kind,
      // Konular TEK BİR STRING'E katlanıyor: dizi olarak bırakılsa React
      // Query onu derin karşılaştırdığı için sorun olmazdı, ama anahtarın
      // KANONİK olması gerekiyor — ["Event","Advice"] ile ["Advice","Event"]
      // aynı listeyi iki kez çekerdi. Sıralama `normalizeTopicSelection`da,
      // burada DEĞİL: imzayı kuran taraf (filtre sheet'i / disk) zaten kanonik
      // veriyor, burada yeniden sıralamak o sözleşmeyi gizlerdi.
      p.topics.join(","),
    ] as const,
  mine: ["feed", "mine"] as const,
  /**
   * KENDİ ana fotoğrafım — sunucunun kendi gönderimde boş bıraktığı avatarı
   * doldurmak için (bkz. feedQueries > useOwnFeedAvatar).
   *
   * `feed` kökünün altında ama akışın verisi DEĞİL; buraya konmasının tek
   * sebebi akışın invalidate'leriyle birlikte düşmesi.
   */
  ownAvatar: ["feed", "ownAvatar"] as const,
  /** ⚠️ LikesScreen'in "Akış yanıtları" sekmesi de BU anahtarı kullanır — tek cache. */
  repliesReceived: ["feed", "replies", "received"] as const,
  repliesCount: ["feed", "replies", "count"] as const,
  authorProfile: (postId: string) => ["feed", "authorProfile", postId] as const,
  replierProfile: (replyId: string) =>
    ["feed", "replierProfile", replyId] as const,
};

export default feedKeys;
