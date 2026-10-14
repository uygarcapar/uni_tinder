import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { FEED_CODES } from "@/shared/constants/responseCodes";
import { markFeedDisabled } from "./feedFlag";
import type {
  FeedAcceptReplyResult,
  FeedCreatePostResult,
  FeedCreateReplyResult,
  FeedLikeResult,
  FeedListParams,
  FeedMeDto,
  FeedPostPageDto,
  FeedReceivedRepliesPageDto,
  FeedReportArgs,
} from "./feedTypes";

/**
 * Lit Akışı HTTP katmanı.
 *
 * `api.ts`'in başarı interceptor'ı `response.data` döndürüyor (api.ts:544), yani
 * buradaki `res` doğrudan backend'in `ResponseDto` zarfı — AxiosResponse DEĞİL.
 *
 * ── Ortak UT-7301 kapısı ───────────────────────────────────────────────────
 * HER metot `guard()` içinden geçiyor: cevap UT-7301 ise bayrak latch'ine OFF
 * yazılıp hata rethrow ediliyor. Böylece "bayrak kapandı" bilgisi için ayrı bir
 * probe'a ihtiyaç kalmıyor (bkz. feedFlag.ts başlığı).
 *
 * ⚠️ Ayrım `code` üzerinden, HTTP STATUS ÜZERİNDEN DEĞİL. 403 üç ayrı şey
 * olabiliyor: UT-7301 (özellik kapalı), UT-7308 (kullanıcı kısıtlı),
 * UT-7315 (profil tamamlanmamış). Status'a bakan bir kapı, profili yarım bir
 * kullanıcı yüzünden sekmeyi herkese kapatırdı.
 */

const DEFAULT_PAGE_SIZE = 20;

/** Zarftan hata kodunu çek — hem soft-fail (200 + isSuccess:false) hem throw. */
const codeOf = (node: any): string | null =>
  node?.code ?? node?.response?.data?.code ?? null;

/**
 * UT-7301 görülürse latch'e yaz. Hem başarı hem hata yolundan geçiliyor çünkü
 * backend bazı reddi 200 + `isSuccess:false` ile de dönebiliyor (swipeQueries'in
 * paywall normalizasyonundaki aynı gerekçe).
 */
function noteDisabledIfNeeded(node: any): void {
  if (codeOf(node) === FEED_CODES.DISABLED) markFeedDisabled();
}

async function guard<T>(run: () => Promise<any>, unwrap: (res: any) => T): Promise<T> {
  try {
    const res = await run();
    noteDisabledIfNeeded(res);
    if (!res?.isSuccess) {
      // Soft-fail: zarf 200 döndü ama iş başarısız. Hatayı `code`/`message`/
      // `result`ı KORUYARAK fırlat — çağıranlar (paywall, kota, inline hata)
      // üçüne de bakıyor.
      const err: any = new Error(res?.message || "Feed request failed");
      err.response = { data: res, status: res?.statusCode ?? 200 };
      throw err;
    }
    return unwrap(res);
  } catch (e) {
    noteDisabledIfNeeded(e);
    throw e;
  }
}

/** `result` beklenen bir uçta eksik gelirse bu bir sözleşme ihlali — patlat. */
function requireResult<T>(res: any, what: string): T {
  const result = res?.result;
  if (result == null) throw new Error(`Feed: ${what} result eksik`);
  return result as T;
}

class FeedService {
  getMe(): Promise<FeedMeDto> {
    return guard(
      () => api.get(API_ENDPOINTS.FEED_ME),
      (res) => requireResult<FeedMeDto>(res, "me"),
    );
  }

  /**
   * Akış listesi.
   *
   * ⚠️ `cursor` YALNIZ sort=new'de, `page` YALNIZ popular/top'ta gönderilir —
   * diğerini de yollamak sunucuyu şaşırtmasa bile sözleşme dışı. `university`
   * null ise parametre HİÇ gönderilmez: boş string göndermek UT-7313 (geçersiz
   * üniversite) üretir, kendi kampüsü varsayılanına düşmez.
   */
  getPosts(
    args: FeedListParams & {
      cursor?: string | null;
      page?: number | null;
      pageSize?: number;
    },
  ): Promise<FeedPostPageDto> {
    const params = new URLSearchParams();
    if (args.university) params.set("university", args.university);
    params.set("sort", args.sort);
    params.set("interest", args.interest);
    params.set("kind", args.kind);
    // "all" = filtre yok → parametre HİÇ gönderilmiyor. Boş/"all" göndermek
    // sunucuda enum çözümlemesini patlatır (`university`nin aynı kuralı).
    if (args.topic && args.topic !== "all") params.set("topic", args.topic);
    if (args.cursor) params.set("cursor", args.cursor);
    if (typeof args.page === "number" && args.page > 0) {
      params.set("page", String(args.page));
    }
    params.set("pageSize", String(args.pageSize ?? DEFAULT_PAGE_SIZE));

    return guard(
      () => api.get(`${API_ENDPOINTS.FEED_POSTS}?${params.toString()}`),
      (res) => normalizePage(res?.result),
    );
  }

  getMyPosts(page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<FeedPostPageDto> {
    return guard(
      () =>
        api.get(
          `${API_ENDPOINTS.FEED_MY_POSTS}?page=${page}&pageSize=${pageSize}`,
        ),
      (res) => normalizePage(res?.result),
    );
  }

  /**
   * `topic` ZORUNLU (yeni sözleşme): composer seçilmeden gönder butonunu
   * aktifleştirmiyor. Wire'da opsiyonel kalmaya devam ediyor çünkü sunucu eski
   * istemcilerin konusuz gönderilerini "General" sayıyor — ama bu sürüm her
   * zaman açıkça gönderiyor.
   */
  createPost(
    body: string,
    isAnonymous: boolean,
    topic: string,
  ): Promise<FeedCreatePostResult> {
    return guard(
      () => api.post(API_ENDPOINTS.FEED_POSTS, { body, isAnonymous, topic }),
      (res) => {
        const result = requireResult<any>(res, "createPost");
        return {
          post: result.post,
          quota: result.quota ?? null,
          // Alan gelmezse `false`: destek ekranını YANLIŞ POZİTİF açmak,
          // kullanıcıya hiç vermediği bir sinyali ima etmek olurdu.
          supportResources: result.supportResources === true,
        } as FeedCreatePostResult;
      },
    );
  }

  deletePost(postId: string): Promise<void> {
    return guard(
      () => api.delete(API_ENDPOINTS.FEED_POST(postId)),
      () => undefined,
    );
  }

  likePost(postId: string): Promise<FeedLikeResult> {
    return guard(
      () => api.put(API_ENDPOINTS.FEED_POST_LIKE(postId), {}),
      (res) => requireResult<FeedLikeResult>(res, "like"),
    );
  }

  unlikePost(postId: string): Promise<FeedLikeResult> {
    return guard(
      () => api.delete(API_ENDPOINTS.FEED_POST_LIKE(postId)),
      (res) => requireResult<FeedLikeResult>(res, "unlike"),
    );
  }

  /** GET /api/swipe/LikerProfile/{id} ile AYNI ProfileCardDto. */
  getPostAuthorProfile(postId: string): Promise<any> {
    return guard(
      () => api.get(API_ENDPOINTS.FEED_POST_AUTHOR_PROFILE(postId)),
      (res) => requireResult<any>(res, "authorProfile"),
    );
  }

  getReplierProfile(replyId: string): Promise<any> {
    return guard(
      () => api.get(API_ENDPOINTS.FEED_REPLY_PROFILE(replyId)),
      (res) => requireResult<any>(res, "replierProfile"),
    );
  }

  createReply(postId: string, comment: string): Promise<FeedCreateReplyResult> {
    return guard(
      () => api.post(API_ENDPOINTS.FEED_POST_REPLIES(postId), { comment }),
      (res) => {
        const result = requireResult<any>(res, "createReply");
        return {
          replyId: result.replyId,
          status: result.status,
          quota: result.quota ?? null,
          supportResources: result.supportResources === true,
        } as FeedCreateReplyResult;
      },
    );
  }

  getReceivedReplies(
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<FeedReceivedRepliesPageDto> {
    return guard(
      () =>
        api.get(
          `${API_ENDPOINTS.FEED_REPLIES_RECEIVED}?page=${page}&pageSize=${pageSize}`,
        ),
      (res) => {
        const result = res?.result ?? {};
        return {
          items: Array.isArray(result.items) ? result.items : [],
          page: typeof result.page === "number" ? result.page : page,
          hasMore: result.hasMore === true,
          total: typeof result.total === "number" ? result.total : 0,
        };
      },
    );
  }

  getReceivedReplyCount(): Promise<number> {
    return guard(
      () => api.get(API_ENDPOINTS.FEED_REPLIES_RECEIVED_COUNT),
      (res) => {
        const count = res?.result?.count;
        return typeof count === "number" && count > 0 ? count : 0;
      },
    );
  }

  acceptReply(replyId: string): Promise<FeedAcceptReplyResult> {
    return guard(
      () => api.post(API_ENDPOINTS.FEED_REPLY_ACCEPT(replyId), {}),
      (res) => {
        const result = requireResult<any>(res, "acceptReply");
        return {
          matchId: result.matchId,
          conversationId: result.conversationId,
          // Alan gelmezse `false`: "yeni eşleşme" modalını yanlış açmaktansa
          // hiç açmamak daha az zarar — sohbet yine conversationId'den açılıyor.
          isNewMatch: result.isNewMatch === true,
        } as FeedAcceptReplyResult;
      },
    );
  }

  dismissReply(replyId: string): Promise<void> {
    return guard(
      () => api.post(API_ENDPOINTS.FEED_REPLY_DISMISS(replyId), {}),
      () => undefined,
    );
  }

  /**
   * Şikayet. ⚠️ MODERATION_REPORT DEĞİL: gövdede `reportedUserId` yok, hedef
   * targetType + postId/replyId ile veriliyor (anonim gönderide şikayet
   * edilecek bir kimlik de yok; yazarı sunucu biliyor, alsoBlock çalışıyor).
   */
  report(args: FeedReportArgs): Promise<void> {
    return guard(
      () =>
        api.post(API_ENDPOINTS.FEED_REPORTS, {
          targetType: args.targetType,
          postId: args.postId ?? null,
          replyId: args.replyId ?? null,
          reason: args.reason,
          description: args.description ?? null,
          alsoBlock: args.alsoBlock,
        }),
      () => undefined,
    );
  }
}

/**
 * Sayfa zarfını normalize et. `items` hep dizi, `hasMore` hep boolean:
 * `getNextPageParam`'ın "boş sayfa terminal" kuralı undefined bir diziye
 * `.length` okuyamaz ve `hasMore` undefined ise sayfalama sessizce durur.
 */
function normalizePage(result: any): FeedPostPageDto {
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    nextCursor: result?.nextCursor ?? null,
    page: typeof result?.page === "number" ? result.page : null,
    hasMore: result?.hasMore === true,
  };
}

export default new FeedService();
