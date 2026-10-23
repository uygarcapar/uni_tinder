import { useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import uiBus from "@/shared/services/uiBus";
import { FEED_CODES } from "@/shared/constants/responseCodes";
import profileService from "@/features/profile/profileService";
// Ana fotoğraf sırası (isMainPhoto → ilk foto → profileImageUrl) ve sürüm
// parametresi TEK kaynaktan: ProfileScreen header'ı ve sekme avatarı da bunu
// kullanıyor, akış kendi sırasını üretirse aynı kullanıcı iki ekranda iki ayrı
// fotoğrafla çizilebilir.
import { resolveMainPhotoUri } from "@/shared/utils/photoUri";
import { feedKeys } from "./feedKeys";
import feedService from "./feedService";
import { dedupeById } from "./feedPolicy";
import { feedEnabledForSession } from "./feedFlag";
import type {
  FeedListParams,
  FeedMeDto,
  FeedPostDto,
  FeedPostPageDto,
  FeedQuotaDto,
  FeedReportArgs,
} from "./feedTypes";

// Anahtarlar ayrı modülde (feedKeys.ts); buradan re-export ediliyor ki
// `from "@/features/feed/feedQueries"` import'ları da çalışsın (swipeQueries deseni).
export { feedKeys };

export const FEED_PAGE_SIZE = 20;
const FEED_STALE_MS = 30 * 1000;

/** uiBus olayları — tüketiciler FeedScreen ve LikesScreen. */
export const FEED_PAYWALL_EVENT = "feedPaywall";
export const FEED_DIRTY_EVENT = "feedDirty";
export const FEED_REPLIES_DIRTY_EVENT = "feedRepliesDirty";

/**
 * Paywall sinyalini tek noktadan yorumla (swipeQueries > emitPaywall kardeşi).
 *
 * HTTP status'e DEĞİL `paywallType` varlığına bakıyor: akışta 402 (anonim,
 * kampüs, tip filtresi) ve 429 (kota) ayrı kabuklar ama ikisi de `result`
 * içinde `paywallType` taşıyor.
 *
 * ⚠️ FEED_POST_LIMIT / FEED_REPLY_LIMIT paywall AÇMAZ: hak satın alınamıyor
 * (consumable yok), Plus yalnız günlük tavanı yükseltiyor. `softOffer:true`
 * ile işaretlenip kota sheet'ine yönlendiriliyorlar — çağıran bu bayrağa bakıp
 * paywall mı kota sheet'i mi açacağına karar veriyor.
 */
const SOFT_OFFER_TYPES = new Set<string>([
  "FEED_POST_LIMIT",
  "FEED_REPLY_LIMIT",
]);

export function emitFeedPaywall(node: any): boolean {
  const result = node?.result ?? node;
  const paywallType = result?.paywallType;
  if (!paywallType) return false;
  uiBus.emit(FEED_PAYWALL_EVENT, {
    paywallType,
    softOffer: SOFT_OFFER_TYPES.has(String(paywallType)),
    nextResetAt: result?.nextResetAt ?? null,
    message: node?.message ?? result?.message ?? null,
  });
  return true;
}

/** Axios hatasından zarfı çıkar — soft-fail ve throw yolları aynı şekle gelsin. */
export const feedErrorEnvelope = (e: any): any => e?.response?.data ?? null;
export const feedErrorCode = (e: any): string | null =>
  feedErrorEnvelope(e)?.code ?? null;
export const feedErrorResult = (e: any): any =>
  feedErrorEnvelope(e)?.result ?? null;
export const feedErrorMessage = (e: any): string | null =>
  feedErrorEnvelope(e)?.message ?? null;

/**
 * Sorgular bayrak kapalıyken HİÇ çalışmamalı: her biri garantili 403 üretir ve
 * `retry:1` varsayılanı bunu ikiye katlar. `enabled` kapısı tek noktada.
 */
const feedEnabled = (opt?: boolean) =>
  feedEnabledForSession() && opt !== false;

// ─────────────────────────────────────────────────────────────────────────────
// Sorgular
// ─────────────────────────────────────────────────────────────────────────────

export function useFeedMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: feedKeys.me,
    queryFn: () => feedService.getMe(),
    enabled: feedEnabled(options?.enabled),
    staleTime: FEED_STALE_MS,
  });
}

/**
 * Sayfalama parametresi — mod `sort`tan türüyor.
 * cursor: sort=new · page: sort=popular|top
 */
export type FeedPageParam =
  | { mode: "cursor"; cursor: string | null }
  | { mode: "page"; page: number };

/**
 * Akış listesi — TEK infinite query, İKİ sayfalama modu.
 *
 * Mod query key'in İÇİNDE (feedKeys.posts filtre imzasını alıyor), yani sort
 * değişimi yepyeni bir infinite query doğurur ve elle reset gerekmez.
 */
export function useFeedPosts(
  params: FeedListParams,
  options?: { enabled?: boolean },
) {
  const usesCursor = params.sort === "new";

  return useInfiniteQuery({
    queryKey: feedKeys.posts(params),
    initialPageParam: (usesCursor
      ? { mode: "cursor", cursor: null }
      : { mode: "page", page: 1 }) as FeedPageParam,
    queryFn: ({ pageParam }: { pageParam: FeedPageParam }) =>
      feedService.getPosts({
        ...params,
        cursor: pageParam.mode === "cursor" ? pageParam.cursor : null,
        page: pageParam.mode === "page" ? pageParam.page : null,
        pageSize: FEED_PAGE_SIZE,
      }),
    // Cursor OTORİTESİ `lastPageParam` — yani gerçekten istediğimiz sayfa.
    // `lastPage.page`e GÜVENİLMEZ: backend alanı göndermezse her sayfa null
    // döner, next param 1'de çakılır, aynı sayfa tekrar append edilir ve dedupe
    // hepsini elerken sonsuz fetch döngüsü doğar (swipeQueries'teki aynı kaza).
    //
    // BOŞ SAYFA TERMİNAL: `hasMore:true` gelse bile öğe eklenmiyorsa devam
    // etmenin anlamı yok, sadece döngü besler.
    getNextPageParam: (
      lastPage: FeedPostPageDto,
      _all,
      lastPageParam: FeedPageParam,
    ): FeedPageParam | undefined => {
      if (!lastPage?.hasMore) return undefined;
      if ((lastPage.items?.length ?? 0) === 0) return undefined;
      if (usesCursor) {
        if (!lastPage.nextCursor) return undefined;
        return { mode: "cursor", cursor: lastPage.nextCursor };
      }
      const prev = lastPageParam?.mode === "page" ? lastPageParam.page : 0;
      return { mode: "page", page: prev + 1 };
    },
    // Tekilleştirme BURADA, ekranda değil: popular/top sayfalar arasında aynı
    // gönderiyi tekrar döndürebiliyor (skor kayıyor, sözleşme §6.1).
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      items: dedupeById(data.pages.flatMap((p) => p.items ?? [])),
    }),
    enabled: feedEnabled(options?.enabled),
    staleTime: FEED_STALE_MS,
    // Kendiliğinden refetch YOK: infinite query'de refetch TÜM sayfaları baştan
    // çeker ve popular/top'ta listeyi kullanıcının altında yeniden sıralar.
    // Tazeleme bilinçli: pull-to-refresh (resetQueries) / odak tazeliği /
    // uiBus "feedDirty".
    refetchOnMount: false,
  });
}

/** Gönderilerim — offset sayfalama, son 30 gün, her durum. */
export function useMyFeedPosts(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: feedKeys.mine,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      feedService.getMyPosts(pageParam, FEED_PAGE_SIZE),
    getNextPageParam: (
      lastPage: FeedPostPageDto,
      _all,
      lastPageParam: number,
    ) => {
      if (!lastPage?.hasMore) return undefined;
      if ((lastPage.items?.length ?? 0) === 0) return undefined;
      return (lastPageParam ?? 0) + 1;
    },
    // Gönderilerim'de de tekilleştirme var: silme/yeniden yükleme sırasında
    // sayfa sınırı kayabiliyor.
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      items: dedupeById(data.pages.flatMap((p) => p.items ?? [])),
    }),
    enabled: feedEnabled(options?.enabled),
    staleTime: FEED_STALE_MS,
    refetchOnMount: false,
  });
}

/** Gelen yanıtlar. ⚠️ LikesScreen'in sekmesi de AYNI anahtarı kullanır. */
export function useReceivedReplies(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: feedKeys.repliesReceived,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      feedService.getReceivedReplies(pageParam, FEED_PAGE_SIZE),
    getNextPageParam: (lastPage, _all, lastPageParam: number) => {
      if (!lastPage?.hasMore) return undefined;
      if ((lastPage.items?.length ?? 0) === 0) return undefined;
      return (lastPageParam ?? 0) + 1;
    },
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      items: data.pages.flatMap((p) => p.items ?? []),
      total: data.pages[0]?.total ?? 0,
    }),
    enabled: feedEnabled(options?.enabled),
    staleTime: FEED_STALE_MS,
    refetchOnMount: false,
  });
}

export function useReceivedReplyCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: feedKeys.repliesCount,
    queryFn: () => feedService.getReceivedReplyCount(),
    enabled: feedEnabled(options?.enabled),
    staleTime: FEED_STALE_MS,
  });
}

export function useFeedAuthorProfile(
  postId: string | null,
  mode?: string | null,
) {
  return useQuery({
    // Mod anahtarın İÇİNDE: kart moda göre farklı içerik taşıyor (prompt seti
    // ve niyet alanı), tek anahtarda iki mod aynı cache'i paylaşır ve mod
    // değişiminde bir kare yabancı içerik görünür.
    queryKey: [...feedKeys.authorProfile(postId ?? ""), mode ?? "default"],
    queryFn: () => feedService.getPostAuthorProfile(postId as string, mode),
    enabled: feedEnabled() && !!postId,
    // Profil kartı açıkken bayatlamasın diye kısa değil: sheet kapanıp
    // açılınca aynı veriyi tekrar çekmek gereksiz tur.
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeedReplierProfile(replyId: string | null) {
  return useQuery({
    queryKey: feedKeys.replierProfile(replyId ?? ""),
    queryFn: () => feedService.getReplierProfile(replyId as string),
    enabled: feedEnabled() && !!replyId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * KENDİ ana fotoğrafım — kendi gönderimin avatarı için YEDEK.
 *
 * NEDEN VAR: sunucu kendi gönderimin `author` bloğunu ad ve yaşla dolduruyor
 * ama `mainPhotoUrl`u null bırakıyor (en belirgin hâli: gönderiyi attıktan
 * hemen sonra listeye eklenen satır). Kart boş fotoğrafı anonim yer tutucusuyla
 * çiziyor, yani kullanıcı kendi gönderisini "ad + yaş var ama fotoğraf yok"
 * diye, anonim atmış gibi görüyordu.
 *
 * ⚠️ YALNIZ KENDİ gönderim için meşru: başka birinin fotoğrafını tahmin
 * edemeyiz, ama kendi fotoğrafımı BİLİYORUZ. Yedek `isMine && !isAnonymous`
 * kapısından geçiyor (bkz. FeedPostCard > ownPhotoUrl) — anonim gönderide
 * uygulanırsa kullanıcının kimliğini KENDİ ekranında ifşa eder, listeyi
 * ekran görüntüsüyle paylaşan biri için de gerçek bir sızıntı olur.
 *
 * ⚠️ Sunucu bir gün alanı doldurursa bu yol KENDİLİĞİNDEN ölü kalır: kart
 * önce `author.mainPhotoUrl`a bakıyor, yedek yalnız o boşken devreye giriyor.
 *
 * Tek sorgu, satır başına değil: ekran düzeyinde bir kez çağrılıp karta prop
 * olarak iniyor. `getMyProfile` ayrıca kendi içinde TTL + in-flight dedupe'lu,
 * yani uygulama açılışındaki turlarla aynı isteğe binme ihtimali yüksek.
 */
export function useOwnFeedAvatar(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: feedKeys.ownAvatar,
    queryFn: async () => {
      const profile = await profileService.getMyProfile();
      // `?? null`: `undefined` react-query'de "veri yok" demek ve sorgu hata
      // durumuna düşüyor. Fotoğrafı olmayan kullanıcı geçerli bir cevap.
      return resolveMainPhotoUri(profile) ?? null;
    },
    enabled: feedEnabled(options?.enabled),
    // Ana fotoğraf oturum içinde nadiren değişiyor; değiştiğinde ProfileScreen
    // `profileDirty` yayınlıyor ve `getMyProfile` cache'i bust ediliyor, yani
    // sonraki tur zaten tazeyi getirir.
    staleTime: 10 * 60 * 1000,
  });
  return query.data ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

type PostPatch = (post: FeedPostDto) => FeedPostDto;

/**
 * Bir gönderiyi TÜM liste cache'lerinde yamalar (akış filtreleri + Gönderilerim).
 *
 * İsabet yoksa GİRDİ REFERANSI korunuyor — `setQueriesData` her sorguya
 * dokunduğu için yeni nesne döndürmek, gönderinin bulunmadığı sorguları da
 * yeniden render ettirirdi.
 */
export function patchPostInCaches(
  qc: QueryClient,
  postId: string,
  patch: PostPatch,
): void {
  const apply = (data: any) => {
    if (!data?.pages) return data;
    let hit = false;
    const pages = data.pages.map((page: FeedPostPageDto) => {
      const items = page?.items;
      if (!Array.isArray(items)) return page;
      const idx = items.findIndex((i) => i?.id === postId);
      if (idx < 0) return page;
      hit = true;
      const nextItems = items.slice();
      nextItems[idx] = patch(nextItems[idx]);
      return { ...page, items: nextItems };
    });
    return hit ? { ...data, pages } : data;
  };
  qc.setQueriesData({ queryKey: feedKeys.postsRoot }, apply);
  qc.setQueriesData({ queryKey: feedKeys.mine }, apply);
}

/** Gönderiyi tüm liste cache'lerinden düşür (UT-7312, silme, şikayet sonrası). */
export function removePostFromCaches(qc: QueryClient, postId: string): void {
  const apply = (data: any) => {
    if (!data?.pages) return data;
    let hit = false;
    const pages = data.pages.map((page: FeedPostPageDto) => {
      const items = page?.items;
      if (!Array.isArray(items)) return page;
      if (!items.some((i) => i?.id === postId)) return page;
      hit = true;
      return { ...page, items: items.filter((i) => i?.id !== postId) };
    });
    return hit ? { ...data, pages } : data;
  };
  qc.setQueriesData({ queryKey: feedKeys.postsRoot }, apply);
  qc.setQueriesData({ queryKey: feedKeys.mine }, apply);
}

/**
 * Mutation yanıtındaki taze kotayı `/me` cache'ine yaz.
 *
 * ⚠️ MERGE, replace DEĞİL: mutation yanıtı `/me`'nin diğer alanlarını
 * (canPostAnonymously, postMaxLength, restrictedUntil…) taşımıyor. Düz replace
 * FAB'ı ve composer kapılarını sıfırlardı.
 *
 * ⚠️ `prev` yoksa `prev` döner — kotadan yarım bir `FeedMeDto` sentezlemek
 * `composeGate`'e `restrictedUntil: undefined` okutup KISITLI kullanıcıya açık
 * FAB çizdirirdi.
 */
export function writeFeedQuota(
  qc: QueryClient,
  quota: FeedQuotaDto | null | undefined,
): void {
  if (!quota) return;
  qc.setQueryData(feedKeys.me, (prev: FeedMeDto | undefined) =>
    prev ? { ...prev, quota } : prev,
  );
}

export function useWriteFeedQuota() {
  const qc = useQueryClient();
  return useCallback(
    (quota?: FeedQuotaDto | null) => writeFeedQuota(qc, quota),
    [qc],
  );
}

/**
 * Kota tükendi hatasından (UT-7304/7322) `/me`'yi düzelt.
 *
 * Hata gövdesinden yazılan TEK yer ve doğru: sunucu kovanın boş olduğunu
 * söyledi, kullanıcıyı "2 hakkın var" diye kandırmayalım. `quota` taşımadığı
 * için yalnız ilgili sayaç 0'lanıyor, diğeri dokunulmuyor.
 */
export function writeFeedQuotaExhausted(
  qc: QueryClient,
  which: "post" | "reply",
  nextResetAt: string | null,
): void {
  qc.setQueryData(feedKeys.me, (prev: FeedMeDto | undefined) => {
    if (!prev) return prev;
    return {
      ...prev,
      quota: {
        ...prev.quota,
        ...(which === "post"
          ? { postsRemaining: 0 }
          : { repliesRemaining: 0 }),
        nextResetAt: nextResetAt ?? prev.quota?.nextResetAt ?? null,
      },
    };
  });
}

/**
 * UT-7314 — cursor çürüdü, listeyi sıfırdan kur.
 *
 * `resetQueries` sorguyu tek sayfaya döndürüp yeniden çekiyor; `invalidate`
 * olmaz çünkü o bozuk cursor'la TÜM sayfaları tekrar isterdi.
 */
export function useResetFeedList() {
  const qc = useQueryClient();
  return useCallback(
    (params: FeedListParams) => {
      qc.resetQueries({ queryKey: feedKeys.posts(params), exact: true });
    },
    [qc],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation'lar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Hiçbir feed mutation'ında KOTA için `onMutate` azaltması YOK.
 *
 * `useNoteMutation`'ın gerekçesinin aynısı: kullanıcı yanıtı bekleyen bir
 * sheet'in içinde duruyor, papernleyecek görünür bir gecikme yok. Üstelik hak
 * düşürMEYEN hata yolları var (UT-7306 reddi, SupportHold, UT-7316 freni) ve
 * optimistic azaltma onların hepsinde geri alınmak zorunda kalırdı. Kota yalnız
 * sunucu cevabıyla yazılıyor (writeFeedQuota).
 */
export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      isAnonymous,
      topics,
    }: {
      body: string;
      isAnonymous: boolean;
      /**
       * Zorunlu konular — composer en az biri seçilmeden gönderime izin
       * vermiyor. ÇOKLU; wire'a nasıl indiği feedService.createPost'ta.
       */
      topics: string[];
    }) => feedService.createPost(body, isAnonymous, topics),
    onSuccess: (result) => {
      writeFeedQuota(qc, result.quota);
      // Gönderilerim'i invalidate ETMİYORUZ, yeni gönderiyi ÖNE EKLİYORUZ:
      // invalidate tüm sayfaları çeker ve kullanıcı daha gönderisini görmeden
      // listeyi baştan yükler.
      qc.setQueryData(feedKeys.mine, (data: any) => {
        if (!data?.pages?.length) return data;
        const [first, ...rest] = data.pages as FeedPostPageDto[];
        return {
          ...data,
          pages: [{ ...first, items: [result.post, ...(first.items ?? [])] }, ...rest],
        };
      });
      // Akışa eklemiyoruz: yalnız `Published` akışta görünür ve sıralama
      // sunucunun (popular/top'ta başa koymak yanlış olurdu). Published ise
      // sonraki tazelemede gelir.
    },
    onError: (e) => {
      emitFeedPaywall(feedErrorEnvelope(e));
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId }: { postId: string }) =>
      feedService.deletePost(postId),
    onMutate: ({ postId }) => {
      const snapshot = {
        posts: qc.getQueriesData({ queryKey: feedKeys.postsRoot }),
        mine: qc.getQueriesData({ queryKey: feedKeys.mine }),
      };
      removePostFromCaches(qc, postId);
      return snapshot;
    },
    onError: (_e, _v, ctx) => {
      ctx?.posts.forEach(([k, d]) => qc.setQueryData(k, d));
      ctx?.mine.forEach(([k, d]) => qc.setQueryData(k, d));
    },
    onSuccess: () => {
      // Silinen gönderiye gelmiş bekleyen yanıtlar da düşüyor (sözleşme §6.4)
      // → yanıt listesi ve sayacı artık bayat.
      qc.invalidateQueries({ queryKey: feedKeys.repliesReceived });
      qc.invalidateQueries({ queryKey: feedKeys.repliesCount });
      // Silme hak İADE ETMİYOR → /me'ye dokunulmuyor.
    },
  });
}

/**
 * Beğeni — iyimser, tüm liste cache'lerinde.
 *
 * ⚠️ `cancelQueries` YOK: infinite query'de iptal uçuşta olan sayfayı düşürür
 * ve liste kısalır. Yazım idempotent (PUT), yarış zararsız.
 *
 * ⚠️ `invalidateQueries` YOK: infinite query'yi invalidate etmek TÜM sayfaları
 * yeniden çeker.
 */
export function useTogglePostLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, next }: { postId: string; next: boolean }) =>
      next ? feedService.likePost(postId) : feedService.unlikePost(postId),
    onMutate: ({ postId, next }) => {
      const snapshot = {
        posts: qc.getQueriesData({ queryKey: feedKeys.postsRoot }),
        mine: qc.getQueriesData({ queryKey: feedKeys.mine }),
      };
      patchPostInCaches(qc, postId, (p) => ({
        ...p,
        likedByMe: next,
        likeCount: Math.max(0, p.likeCount + (next ? 1 : -1)),
      }));
      return snapshot;
    },
    onError: (e, { postId }, ctx) => {
      ctx?.posts.forEach(([k, d]) => qc.setQueryData(k, d));
      ctx?.mine.forEach(([k, d]) => qc.setQueryData(k, d));
      // Gönderi gitmiş (410) → geri almakla kalmayıp satırı düşür.
      if (feedErrorCode(e) === FEED_CODES.POST_GONE) {
        removePostFromCaches(qc, postId);
      }
      // UT-7330 (kendi gönderini beğenemezsin) sessiz: buton `isMine`da hiç
      // çizilmiyor, buraya düşmek bayat bir karttan gelir.
    },
    // Sunucu gerçeği nihai: PUT idempotent olduğu için iki hızlı basışta bizim
    // tahminimiz sapabilir.
    onSuccess: (res, { postId }) => {
      patchPostInCaches(qc, postId, (p) => ({
        ...p,
        likeCount: res.likeCount,
        likedByMe: res.likedByMe,
      }));
    },
  });
}

export function useCreateReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, comment }: { postId: string; comment: string }) =>
      feedService.createReply(postId, comment),
    onSuccess: (result, { postId }) => {
      writeFeedQuota(qc, result.quota);
      // Kartın butonu "Yanıtladın"a dönsün — sunucu bir daha yanıt kabul
      // etmeyecek (UT-7323) ve kullanıcı aynı kartı ikinci kez denemesin.
      patchPostInCaches(qc, postId, (p) => ({
        ...p,
        reply: { ...p.reply, state: "AlreadyReplied" },
      }));
    },
    onError: (e, { postId }) => {
      emitFeedPaywall(feedErrorEnvelope(e));
      const code = feedErrorCode(e);
      // Sunucu "zaten yanıtladın" diyorsa kart bayat → butonu düzelt.
      if (code === FEED_CODES.ALREADY_REPLIED) {
        patchPostInCaches(qc, postId, (p) => ({
          ...p,
          reply: { ...p.reply, state: "AlreadyReplied" },
        }));
      }
      // "Zaten eşleştiniz" → kart "Sohbete git"e dönsün, conversationId hatadan.
      if (code === FEED_CODES.ALREADY_MATCHED) {
        const conversationId = feedErrorResult(e)?.conversationId ?? null;
        patchPostInCaches(qc, postId, (p) => ({
          ...p,
          reply: { state: "AlreadyMatched", conversationId },
        }));
      }
      if (code === FEED_CODES.PREFERENCE_MISMATCH) {
        patchPostInCaches(qc, postId, (p) => ({
          ...p,
          reply: { ...p.reply, state: "PreferenceMismatch" },
        }));
      }
      if (code === FEED_CODES.POST_GONE) {
        removePostFromCaches(qc, postId);
      }
    },
  });
}

/** Yanıt satırını listeden düşür (kabul/red/şikayet sonrası). */
function removeReplyFromCache(qc: QueryClient, replyId: string): void {
  qc.setQueryData(feedKeys.repliesReceived, (data: any) => {
    if (!data?.pages) return data;
    let hit = false;
    const pages = data.pages.map((page: any) => {
      const items = page?.items;
      if (!Array.isArray(items)) return page;
      if (!items.some((i: any) => i?.replyId === replyId)) return page;
      hit = true;
      return {
        ...page,
        items: items.filter((i: any) => i?.replyId !== replyId),
        // `total` de düşsün: sekme sayacı bunu okuyor.
        total: typeof page.total === "number" ? Math.max(0, page.total - 1) : page.total,
      };
    });
    return hit ? { ...data, pages } : data;
  });
}

export function useAcceptReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId }: { replyId: string }) =>
      feedService.acceptReply(replyId),
    onSuccess: (_res, { replyId }) => {
      removeReplyFromCache(qc, replyId);
      qc.invalidateQueries({ queryKey: feedKeys.repliesCount });
    },
    onError: (e, { replyId }) => {
      // Yanıt işlenmiş/geçersiz (UT-7328) → satırı düşür, listeyi tazele.
      if (feedErrorCode(e) === FEED_CODES.REPLY_STALE) {
        removeReplyFromCache(qc, replyId);
        qc.invalidateQueries({ queryKey: feedKeys.repliesReceived });
        qc.invalidateQueries({ queryKey: feedKeys.repliesCount });
      }
    },
  });
}

export function useDismissReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId }: { replyId: string }) =>
      feedService.dismissReply(replyId),
    // Red'de iyimser düşürme VAR (kabulde yok): kart animasyonla düşüyor ve
    // kullanıcı sonucu beklemiyor. Kabulde ise eşleşme modalı/sohbet sunucu
    // cevabına bağlı, o yüzden orada satır cevap gelince düşüyor.
    onMutate: ({ replyId }) => {
      const snapshot = qc.getQueryData(feedKeys.repliesReceived);
      removeReplyFromCache(qc, replyId);
      return { snapshot };
    },
    onError: (e, _v, ctx) => {
      if (feedErrorCode(e) === FEED_CODES.REPLY_STALE) {
        // Zaten geçersizmiş — geri getirmek yanlış olurdu.
        qc.invalidateQueries({ queryKey: feedKeys.repliesCount });
        return;
      }
      if (ctx?.snapshot) qc.setQueryData(feedKeys.repliesReceived, ctx.snapshot);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedKeys.repliesCount });
    },
  });
}

export function useFeedReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: FeedReportArgs) => feedService.report(args),
    onSuccess: (_res, args) => {
      // Şikayet edilen içerik listeden kalkar (sözleşme §8).
      if (args.targetType === "Post" && args.postId) {
        removePostFromCaches(qc, args.postId);
      }
      if (args.targetType === "Reply" && args.replyId) {
        removeReplyFromCache(qc, args.replyId);
        qc.invalidateQueries({ queryKey: feedKeys.repliesCount });
      }
    },
  });
}
