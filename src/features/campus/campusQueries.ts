import { useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { AppMode } from "@/features/discover/modeTheme";
import { campusKeys } from "./campusKeys";
import { isMomentLive } from "./campusCountdown";
import campusService from "./campusService";
// ⚠️ Kampüs katmanının swipe servisine tek bağı: an sahibinin profil kartı
// (gerekçe `useCampusMomentProfile`te — kampüs sözleşmesinde böyle bir uç yok).
// Karar yolu da zaten swipe ucuna gidiyor (bkz. useCampusSurface > like).
import swipeService from "@/features/discover/swipeService";
import {
  isBoundaryStale,
  readCachedBoundary,
  writeCachedBoundary,
} from "./campusBoundary";
import type {
  CampusBoundaryDto,
  CampusMeDto,
  CampusMomentDto,
  CampusMomentsPage,
  CreateCampusMomentBody,
} from "./campusTypes";

/**
 * KAMPÜS ANLARI veri katmanı.
 *
 * Kalıplar akıştan (`feedQueries.ts`) birebir devralındı; farkları yorumlarda.
 */

const CAMPUS_STALE_MS = 30_000;
const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Yüzeyin durumu
// ─────────────────────────────────────────────────────────────────────────────

export function useCampusMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: campusKeys.me,
    queryFn: () => campusService.getMe(),
    enabled: options?.enabled !== false,
    staleTime: CAMPUS_STALE_MS,
  });
}

/**
 * Kampüs sınırı — DİSK ÖNCE, ağ sonra.
 *
 * Poligon haftalarca değişmiyor ve geofence/konum kapısı onu uygulama
 * açılışında hemen istiyor. Disk kopyası `initialData` olarak veriliyor; ağ
 * cevabı gelince `version` farklıysa disk tazeleniyor.
 *
 * ⚠️ Anahtar İSTENEN domain. Sunucu KANONİK domain döndürüyor
 * (`bogazici.edu.tr` → `boun.edu.tr`); anahtar yanıttan alınsaydı alias
 * domain'li kullanıcı yazdığını bir daha bulamazdı.
 *
 * `staleTime` uzun: bu veri için gereksiz her istek pil ve ağ.
 */
export function useCampusBoundary(
  domain: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: campusKeys.boundary(domain ?? "self"),
    queryFn: async () => {
      const fresh = await campusService.getBoundary(domain);
      if (fresh && domain) writeCachedBoundary(domain, fresh);
      return fresh;
    },
    enabled: options?.enabled !== false && !!domain,
    initialData: () => (domain ? readCachedBoundary(domain) : null) ?? undefined,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

/** Diskteki kopya sunucunun söylediği sürümden eski mi (çağıran refetch eder). */
export function isCachedBoundaryStale(
  domain: string | null | undefined,
  me: CampusMeDto | undefined,
): boolean {
  if (!domain || !me) return false;
  return isBoundaryStale(readCachedBoundary(domain), me.boundaryVersion);
}

// ─────────────────────────────────────────────────────────────────────────────
// Liste
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AÇIK OLAN BÜYÜK KARTIN ANI — kimlikten CANLI listeye çözülüyor.
 *
 * ⚠️ EKRAN ANIN KOPYASINI SAKLAMIYOR, YALNIZ KİMLİĞİNİ. Kopya saklansaydı
 * şu iki hâl sessizce yanlış olurdu:
 *   • an süresi dolar ya da `UT-7424` ile listeden düşer → ekranda artık var
 *     olmayan bir kartın üstünde "beğen" butonu durur,
 *   • liste tazelenir ve anın alanları değişir (moderasyon durumu, foto) →
 *     büyük kart bayat veriyi gösterir.
 * Kimlikten çözmek ikisini birden kapatıyor: an listeden düşünce bu fonksiyon
 * `null` dönüyor ve yüzey kendiliğinden kapanıyor — ayrı bir effect'e,
 * dolayısıyla ayrı bir "kapanmayı unutma" hatasına yer kalmıyor.
 */
export function resolveOpenMoment(
  moments: CampusMomentDto[],
  openId: string | null,
): CampusMomentDto | null {
  if (!openId) return null;
  return moments.find((moment) => moment.id === openId) ?? null;
}

/**
 * Süresi dolmuş anları ele — liste AÇIKKEN de ölebiliyorlar.
 *
 * Kural `campusCountdown.isMomentLive`te tek kaynakta: rozetin "süre bitti"
 * dediği an listeden de düşmeli, ikisi ayrı hesaplarsa kart "birazdan" yazıp
 * ekranda kalırdı.
 */
export function filterLiveMoments(
  items: CampusMomentDto[],
  nowMs: number,
): CampusMomentDto[] {
  return items.filter((m) => isMomentLive(m?.expiresAt, nowMs));
}

/** Aynı id iki sayfada gelirse (kendi anım + cursor yarışı) tekilleştir. */
export function dedupeMoments(items: CampusMomentDto[]): CampusMomentDto[] {
  const seen = new Set<string>();
  const out: CampusMomentDto[] = [];
  for (const item of items) {
    const id = item?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * An listesi — cursor sayfalama.
 *
 * ⚠️ MOD ANAHTARIN İÇİNDE: mod değişimi yepyeni bir sorgu doğuruyor, elle
 * reset yok ve bir kare yabancı kart görünmüyor.
 *
 * ⚠️ KENDİ ANIM yalnız İLK sayfada ve cursor penceresinin dışında geliyor
 * (sözleşme §3). Sonraki sayfalarda `isMine` beklenmiyor; tekilleştirme yine
 * de duruyor çünkü sabitlenmiş satırın cursor'a sızması sunucu tarafında bir
 * kez yaşanırsa liste iki kez aynı kartı gösterirdi.
 *
 * `select` içinde SÜRESİ DOLANLAR da eleniyor: kullanıcı sheet'i açık
 * tutarken 24 saati dolan bir an listede kalmamalı.
 */
export function useCampusMoments(
  mode: AppMode | null,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: campusKeys.moments(mode ?? "default"),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      campusService.getMoments({
        mode,
        cursor: pageParam,
        pageSize: PAGE_SIZE,
      }),
    // Cursor OTORİTESİ sunucunun `nextCursor`ı; BOŞ SAYFA TERMİNAL.
    // (feedQueries'teki sonsuz döngü kazasının aynı koruması.)
    getNextPageParam: (lastPage: CampusMomentsPage): string | null | undefined => {
      if (!lastPage?.hasMore) return undefined;
      if ((lastPage.items?.length ?? 0) === 0) return undefined;
      return lastPage.nextCursor ?? undefined;
    },
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      items: dedupeMoments(data.pages.flatMap((p) => p.items ?? [])),
    }),
    enabled: options?.enabled !== false,
    staleTime: CAMPUS_STALE_MS,
    // Infinite query'de refetch TÜM sayfaları baştan çeker; tazeleme bilinçli
    // (pull-to-refresh / sheet açılışı).
    refetchOnMount: false,
  });
}

/**
 * ANIN SAHİBİNİN PROFİL KARTI — karta dokununca açılan şey.
 *
 * Kartların tik/X satırı kaldırıldı ve karar profil kartına taşındı (gerekçe
 * CampusMomentCard'ın başında), yani bu sorgu o yüzeyin kapısı.
 *
 * ⚠️🔴 UÇ ÖDÜNÇ: `GET /api/swipe/LikerProfile/{userId}` çağrılıyor çünkü
 * kampüs sözleşmesinde an sahibinin profilini veren bir uç YOK
 * (`backend_campus_moments_2026-10.md`de profil bahsi hiç geçmiyor). Akış aynı
 * ihtiyaç için KENDİ ucunu aldı (`/api/feed/posts/{id}/author-profile`,
 * gövdesi "LikerProfile ile BİREBİR aynı ProfileCardDto") — yani doğru çözüm
 * burada da kampüse özel bir uç:
 *     GET /api/campus/moments/{id}/profile   (aynı ProfileCardDto)
 * Uç geldiğinde bu fonksiyonun İÇİ değişir, çağıranı değişmez.
 *
 * ⚠️ RİSK AÇIK YAZILI: `LikerProfile` adı ve akışın ayrı uç alma ihtiyacı
 * ucun "beni beğenenler" kümesine kapalı olabileceğini söylüyor. Reddederse
 * (404/403) kart AÇILMIYOR ve çağıran kullanıcıya bir toast gösteriyor —
 * sessiz bir dokunuş bırakmamak için (bkz. FeedScreen > handleMomentPress).
 *
 * Mod anahtarın İÇİNDE: kart moda göre farklı prompt seti ve niyet alanı
 * taşıyor (feedQueries > useFeedAuthorProfile'daki aynı kural).
 */
export function useCampusMomentProfile(
  userId: string | null,
  mode: AppMode | null,
) {
  return useQuery({
    queryKey: campusKeys.momentProfile(userId ?? "", mode ?? "default"),
    /**
     * ZARF BURADA AÇILIYOR: swipe uçları `{ isSuccess, result }` döndürüyor ve
     * `isSuccess:false` bir HTTP hatası DEĞİL — açılmazsa çağıran "veri geldi
     * ama boş" diye okuyup kartı boş açardı. Başarısızlık `isError`a
     * çevriliyor, yani tek bir dal kullanıcıya toast gösteriyor.
     */
    queryFn: async () => {
      const res: any = await swipeService.getLikerProfileDetail(
        userId as string,
        mode,
      );
      if (!res?.isSuccess || !res?.result) {
        throw new Error("campus:momentProfileUnavailable");
      }
      return res.result;
    },
    enabled: !!userId,
    // Kart açıkken bayatlamasın diye kısa değil: sheet kapanıp açılınca aynı
    // veriyi tekrar çekmek gereksiz tur.
    staleTime: 5 * 60 * 1000,
    // ⚠️ RETRY YOK: uç bu kümeye kapalıysa cevap 404 ve üç kez denemek
    // kullanıcıyı boş bir yüzeyde saniyelerce bekletir.
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bir anı TÜM sayfalardan düşür.
 *
 * `invalidateQueries` DEĞİL: infinite query'de invalidate bütün sayfaları
 * yeniden çeker ve kullanıcının altında listeyi yeniden sıralar
 * (`feedQueries.patchPostInCaches` ile aynı gerekçe).
 */
export function removeMomentFromCaches(qc: QueryClient, momentId: string): void {
  qc.setQueriesData(
    { queryKey: campusKeys.momentsRoot },
    (old: any) => {
      if (!old?.pages) return old;
      let hit = false;
      const pages = old.pages.map((page: CampusMomentsPage) => {
        const items = page.items ?? [];
        const next = items.filter((m) => m.id !== momentId);
        if (next.length === items.length) return page;
        hit = true;
        return { ...page, items: next };
      });
      // İsabet yoksa referansı KORU — gereksiz render doğmasın.
      return hit ? { ...old, pages } : old;
    },
  );
}

/** Yeni paylaşılan anı listenin BAŞINA koy (sunucu da orada sabitliyor). */
function prependMoment(qc: QueryClient, moment: CampusMomentDto): void {
  qc.setQueriesData({ queryKey: campusKeys.momentsRoot }, (old: any) => {
    if (!old?.pages?.length) return old;
    const [first, ...rest] = old.pages as CampusMomentsPage[];
    return {
      ...old,
      pages: [{ ...first, items: [moment, ...(first.items ?? [])] }, ...rest],
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutasyonlar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An paylaş — üç adım: presigned URL → S3 PUT → kayıt.
 *
 * ⚠️ KONUM OKUMASI ÇAĞIRANIN İŞİ ve TAZE olmalı (`force: true`). Burada
 * okunsaydı kullanıcı fotoğrafı seçip kırparken geçen dakikalar okumayı
 * bayatlatır, sunucu UT-7413 ile reddeder ve sebebi görünmezdi.
 */
export function useCreateCampusMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      fileUri: string;
      contentType: string;
      sizeBytes: number;
      body: Omit<CreateCampusMomentBody, "objectKey">;
    }) => {
      const { uploadUrl, objectKey } = await campusService.createUploadUrl({
        contentType: args.contentType,
        sizeBytes: args.sizeBytes,
      });
      await campusService.uploadToS3(uploadUrl, args.fileUri, args.contentType);
      return campusService.createMoment({ ...args.body, objectKey });
    },
    onSuccess: (moment) => {
      prependMoment(qc, moment);
      // `postedToday` ve kota sunucu doğrusundan gelsin.
      qc.invalidateQueries({ queryKey: campusKeys.me });
    },
  });
}

/**
 * Anı kaldır.
 *
 * ⚠️ GÜNÜN HAKKI GERİ GELMİYOR → `/me` yine de tazeleniyor ama `postedToday`
 * `true` kalacak. Kullanıcıya gösterilen metin bunu söylemek zorunda.
 */
export function useDeleteCampusMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (momentId: string) => campusService.deleteMoment(momentId),
    onMutate: (momentId) => {
      removeMomentFromCaches(qc, momentId);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: campusKeys.me });
      qc.invalidateQueries({ queryKey: campusKeys.momentsRoot });
    },
  });
}

/**
 * GEÇ — kampüs-yerel karar, `/api/swipe/Pass`'e GİTMİYOR.
 *
 * Kart iyimser düşüyor ve GERİ KONMUYOR: hedef artık karar verilebilir bir şey
 * değilse kullanıcıyı aynı kartla tekrar karşılaştırmak kötü
 * (`swipeQueries.ts:340` kuralı). Rate limit (UT-7430) de dahil her hata
 * sessiz — geçme kullanıcının bir şey KAZANDIĞI bir aksiyon değil.
 */
export function usePassCampusMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ momentId, mode }: { momentId: string; mode: AppMode | null }) =>
      campusService.passMoment(momentId, mode),
    onMutate: ({ momentId }) => {
      removeMomentFromCaches(qc, momentId);
    },
  });
}

/**
 * Kota okuma yardımcıları — `null` ile `0` KARIŞTIRILMAMALI.
 *
 * `null` = "bilmiyoruz" (/me henüz gelmedi) → rozet HİÇ çizilmiyor.
 * `0` = "hakkın bitti" → paywall. İkisini aynı saymak, veri gelmeden
 * kullanıcıya olmayan bir kısıt göstermek olurdu (`premiumTier.resolved`
 * kuralının aynısı).
 */
export function useCampusQuota(me: CampusMeDto | undefined) {
  const remaining = me?.quota?.decisionsRemaining;
  const limit = me?.quota?.decisionLimit;
  return {
    remaining: typeof remaining === "number" ? remaining : null,
    limit: typeof limit === "number" ? limit : null,
    nextResetAt: me?.quota?.nextResetAt ?? null,
  };
}

/** Sheet açılışında listeyi tazelemek için — tek yerden. */
export function useRefreshCampus() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: campusKeys.me });
    qc.invalidateQueries({ queryKey: campusKeys.momentsRoot });
  }, [qc]);
}

export type { CampusBoundaryDto };
