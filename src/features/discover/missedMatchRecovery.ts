import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { resolveCardAge } from "./cardPrivacy";
import type { PaywallType } from "@/shared/types";

/**
 * Kaçırılan eşleşme kurtarma.
 *
 * "Kaçırılan eşleşme" = beni beğenmiş (Like/SuperLike) AMA benim pass'ladığım
 * kullanıcı — süresi dolmuş pending match DEĞİL. Pencere 30 gün ve hem gelen
 * beğeniye hem benim pass'ıma uygulanıyor; backend recovery anında pass tarihini
 * yeniden doğruluyor.
 *
 * Kurtarma, `SwipeAction`ı Pass → Like'a ÇEVİRİYOR. Karşı taraf zaten beğenmiş
 * olduğu için sonuç her zaman gerçek bir eşleşme; "kurtardım ama eşleşme olmadı"
 * durumu yok (tek istisna: karşı taraf arada unmatch/block yapmışsa backend
 * eşleşmeyi Blocked statüsünde reddeder).
 */

export interface MissedMatchCard {
  id: string;
  userId: string;
  name: string;
  age: number | null;
  universityName: string;
  mainPhoto: string;
  /** Karşı tarafın beni beğendiği an. */
  likedAt: string | null;
  isSuperLike: boolean;
  isPremium: boolean;
}

export interface MissedMatchesPage {
  profiles: MissedMatchCard[];
  totalProfiles: number;
  currentPage: number;
  hasNextPage: boolean;
}

const EMPTY_PAGE: MissedMatchesPage = {
  profiles: [],
  totalProfiles: 0,
  currentPage: 1,
  hasNextPage: false,
};

/**
 * `GET /api/swipe/MissedMatches` → `PaginatedProfilesDto`, yani `WhoLikedMe` ile
 * BİREBİR aynı zarf ve aynı `ProfileCardDto`. Kart şekli de LikesScreen'in
 * beğeni kartlarıyla aynı tutuluyor ki grid tek bir renderer'la çizilsin.
 *
 * SuperLike atanlar backend'de zaten listenin başında geliyor (sonra zaman
 * DESC) — burada yeniden sıralamıyoruz.
 */
export async function fetchMissedMatches(
  page = 1,
  pageSize = 20,
): Promise<MissedMatchesPage> {
  const res = (await api.get(
    `${API_ENDPOINTS.SWIPE_MISSED_MATCHES}?pageNumber=${page}&pageSize=${pageSize}`,
  )) as any;
  if (!res?.isSuccess || !res?.result) return EMPTY_PAGE;
  const r = res.result;
  return {
    profiles: (r.profiles ?? []).map((p: any) => ({
      // `profileId` benzersiz; beğeni kartlarıyla aynı grid'de durabilmesi için
      // ayrı önek ("mm_") taşıyor.
      id: `mm_${p.profileId ?? p.userId}`,
      userId: p.userId,
      name: p.displayName ?? "",
      // Gizli yaş `0` olarak geliyor, `?? null` onu yakalamıyor — bkz.
      // cardPrivacy.resolveCardAge.
      age: resolveCardAge(p),
      universityName: p.universityName || "",
      mainPhoto: p.photos?.[0] || "",
      likedAt: p.likedMeAt ?? null,
      isSuperLike: p.isSuperLike ?? false,
      isPremium: p.isPremium ?? false,
    })),
    totalProfiles: r.totalProfiles ?? 0,
    currentPage: r.currentPage ?? page,
    hasNextPage: r.hasNextPage ?? false,
  };
}

export type RecoverOutcome =
  /** 200 — Pass → Like dönüştü, eşleşme oluşuyor. */
  | { kind: "recovered"; message: string | null; isMatch: boolean }
  /**
   * 403 — kurtarma hakkı bitti, `showPaywall: true`.
   *
   * 2026-08-22'den beri PREMIUM'da da bu dala düşüyor: kurtarma satın
   * alınabilir bir ürün olduğu için premium'un "satacak bir şey yok" istisnası
   * kalktı (eskiden 400 + `showPaywall:false` dönüyordu). Yani bu dal artık
   * "abonelik sat" değil "paket sat" anlamına geliyor; ayrım `stats.isPremium`
   * ile yapılır (bkz. LikesScreen).
   */
  | { kind: "paywall"; message: string | null; paywallType: PaywallType | null }
  /**
   * 400 — hak HARCANMADAN reddedildi: bu kişiyi pas geçmemişsin (zaten
   * kurtarılmış), pas 30 günden eski, kullanıcı yok, ya da çift artık uygun
   * değil (engelleme). Premium'un tükenmiş kotası bu listeden ÇIKTI — o durum
   * artık 403. Hepsinde yapılacak şey aynı: mesajı göster + listeyi tazele.
   */
  | { kind: "rejected"; message: string | null }
  /** 401 / 5xx / ağ — geçici, kullanıcı tekrar deneyebilir. */
  | { kind: "error"; message: string | null };

const messageOf = (node: any): string | null =>
  (typeof node?.result?.message === "string" && node.result.message) ||
  (typeof node?.message === "string" && node.message) ||
  null;

const paywallOf = (node: any): PaywallType | null =>
  node?.result?.paywallType ?? node?.paywallType ?? null;

/**
 * `POST /api/swipe/RecoverMissedMatch`.
 *
 * GÖVDEDEKİ `swipeType` DUMMY — backend okumuyor. Bilerek gönderiliyor:
 *
 *   ESKİ sürüm  → uç `SwipeRequestDto` bind ediyordu, alan `[Required]` + regex.
 *                 `[ApiController]` validation'ı gövde metoduna GİRMEDEN
 *                 çalıştığı için alansız istek `ValidationProblemDetails`
 *                 biçiminde 400 dönerdi — `ResponseDto` zarfımızla değil, yani
 *                 ortak hata yolumuz o yanıtı tanımazdı.
 *   YENİ sürüm  → ayrı `RecoverMissedMatchRequestDto` çıktı (2026-08-18), alan
 *                 opsiyonel ve okunmuyor.
 *
 * İki sürümde de geçerli tek gövde bu, o yüzden deploy'un hangi tarafta
 * olduğuna bakmadan çalışıyor. Alanı düşürmek İSTEĞE BAĞLI ve ancak yeni
 * sürümün canlıda olduğu doğrulandıktan sonra güvenli.
 *
 * HTTP status'e göre ayrım (controller: `IsSuccess ? 200 : ShowPaywall ? 403 : 400`).
 * `code` (`UT-…`) alanı bu akışta HİÇ DOLMUYOR — ayrım `paywallType` üzerinden.
 */
export async function recoverMissedMatch(
  targetUserId: string,
): Promise<RecoverOutcome> {
  try {
    const res = (await api.post(API_ENDPOINTS.SWIPE_RECOVER_MISSED_MATCH, {
      targetUserId,
      swipeType: "like",
    })) as any;
    // Controller başarısız sonucu 200 ile döndürmüyor; yine de gövdeye göre
    // ayırıyoruz ki sözleşme değişirse sessizce "kurtarıldı" demeyelim.
    if (res?.isSuccess === false) {
      return paywallOf(res)
        ? { kind: "paywall", message: messageOf(res), paywallType: paywallOf(res) }
        : { kind: "rejected", message: messageOf(res) };
    }
    return {
      kind: "recovered",
      message: messageOf(res),
      // `isMatch` iyimser bir bayrak: backend karşı tarafın like'ı doğrulandığı
      // için peşinen true yazıyor, `Match` satırını asenkron handler oluşturuyor.
      isMatch: res?.result?.isMatch === true,
    };
  } catch (e: any) {
    const status = e?.response?.status;
    const body = e?.response?.data;
    if (status === 403) {
      return {
        kind: "paywall",
        message: messageOf(body),
        paywallType: paywallOf(body),
      };
    }
    // 404: kullanıcı/profil kayboldu — 400 ile aynı sonuç, liste bayat.
    if (status === 400 || status === 404) {
      return { kind: "rejected", message: messageOf(body) };
    }
    return { kind: "error", message: messageOf(body) };
  }
}
