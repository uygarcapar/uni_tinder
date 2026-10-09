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
    ] as const,
  mine: ["feed", "mine"] as const,
  /** ⚠️ LikesScreen'in "Akış yanıtları" sekmesi de BU anahtarı kullanır — tek cache. */
  repliesReceived: ["feed", "replies", "received"] as const,
  repliesCount: ["feed", "replies", "count"] as const,
  authorProfile: (postId: string) => ["feed", "authorProfile", postId] as const,
  replierProfile: (replyId: string) =>
    ["feed", "replierProfile", replyId] as const,
};

export default feedKeys;
