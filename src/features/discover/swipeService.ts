import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { noteTargetPayload } from '@/features/discover/noteTarget';
import type {
  PotentialMatchesResult,
  ResponseCode,
} from '@/shared/types';

// Servis cevabı = backend PaginatedProfilesDto + zarf'tan taşınan (code, action).
// Zarftaki `code`/`action` semantik olarak result.emptyReasonCode/Action ile aynı
// (master task referansı) ama backend her ikisini de doldurabiliyor; ham hali korur.
export interface PotentialMatchesResponse extends PotentialMatchesResult {
  code: ResponseCode | null;
  action: string | null;
  message: string | null;
}

// `result` alanı eksik gelirse (eski backend ya da hata) güvenli default'lar üret.
// Code handler bu boş şekli "veri yok ama empty reason yok" olarak ele alır.
const emptyResult: PotentialMatchesResult = {
  profiles: [],
  // `null` = backend göndermedi. Eskiden `1` idi ve response'a spread edildiği
  // için alan eksik gelen HER sayfa `currentPage: 1` görünüyordu. Sayfalama
  // buna bakmıyor (cursor lastPageParam'dan geliyor) ama yanıltıcı bir
  // defaulttu — dürüst olanı "bilmiyorum".
  currentPage: null,
  pageSize: 0,
  totalProfiles: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
  remainingSwipes: 0,
  showPaywall: false,
  paywallType: null,
  paywallMessage: null,
  isPremium: false,
  // Alanı göndermeyen backend'de "mesafe filtresi uygulandı" varsayılıyor —
  // yani şeffaflık satırı çizilmez. Ters yön (varsayılan true) kullanıcıya
  // "sınır kapalı" diye yalan söylerdi.
  distanceFilterIgnored: false,
  appliedRadiusKm: null,
  emptyReason: "None",
  emptyReasonCode: null,
  emptyReasonMessage: null,
  emptyReasonAction: null,
};

/**
 * `mode` WIRE'DA OPSİYONEL ve bu bilinçli: sunucu alanı görmediğinde "Dating"
 * sayıyor (eski istemci sözleşmesi). Boş/null modu HİÇ GÖNDERMİYORUZ —
 * `mode=` biçiminde boş bir parametre sunucuda enum çözümlemesini patlatır.
 */
const modeParam = (mode?: string | null): string =>
  mode ? `&mode=${encodeURIComponent(mode)}` : "";

/** Gövdeli isteklerin karşılığı: alan ya dolu gidiyor ya hiç gitmiyor. */
const modeBody = (mode?: string | null): Record<string, string> =>
  mode ? { mode } : {};

class SwipeService {
  /**
   * Deste isteği. `?expandRadius=true` KALDIRILDI (2026-08-22): tek seferlik
   * genişletme yerini filtrelerdeki kalıcı `ignoreDistanceFilter` anahtarına
   * bıraktı. Backend param'ı artık yok sayıyor — göndermek sessizce hiçbir şey
   * yapmaz, o yüzden yeniden eklenmemeli.
   */
  async getPotentialMatches(
    _token: string | null,
    pageNumber = 1,
    pageSize = 10,
    mode?: string | null,
  ): Promise<PotentialMatchesResponse> {
    const response = await api.get(
      `${API_ENDPOINTS.GET_POTENTIAL_MATCHES}?pageNumber=${pageNumber}&pageSize=${pageSize}${modeParam(mode)}`
    ) as any;

    const result: PotentialMatchesResult = {
      ...emptyResult,
      ...(response?.result ?? {}),
      profiles: response?.result?.profiles ?? [],
    };

    return {
      ...result,
      code: response?.code ?? null,
      action: response?.action ?? null,
      message: response?.message ?? null,
    };
  }

  async likeUser(targetUserId: string, _token?: string | null, mode?: string | null) {
    return api.post(API_ENDPOINTS.SWIPE_LIKE, { targetUserId, swipeType: 'like', ...modeBody(mode) });
  }

  async passUser(targetUserId: string, _token?: string | null, mode?: string | null) {
    return api.post(API_ENDPOINTS.SWIPE_PASS, { targetUserId, swipeType: 'pass', ...modeBody(mode) });
  }

  async fireUser(targetUserId: string, _token?: string | null, mode?: string | null) {
    return api.post(API_ENDPOINTS.SWIPE_FIRE, { targetUserId, swipeType: 'superlike', ...modeBody(mode) });
  }

  /**
   * Not = yorumla birlikte gönderilen, HEDEFLİ beğeni. Swipe kaydı olarak
   * like sayılır (karşılıklıysa eşleşme), kotası ayrı consumable.
   *
   * `comment` trim'li gönderiliyor: baştaki/sondaki boşluk hem karakter
   * sayacını hem de sunucudaki "boş mu" kontrolünü yanıltıyordu.
   * Uzunluk kırpması BURADA YAPILMIYOR — sınır sunucudan geliyor
   * (`Stats.noteMaxLength`) ve composer zaten oradaki değerle sınırlıyor;
   * ikinci bir kırpma noktası iki farklı sınır demek olurdu.
   */
  async sendNote(
    targetUserId: string,
    comment: string,
    target: ReturnType<typeof noteTargetPayload>,
    mode?: string | null,
  ) {
    return api.post(API_ENDPOINTS.SWIPE_NOTE, {
      targetUserId,
      swipeType: 'note',
      comment: comment.trim(),
      target,
      ...modeBody(mode),
    });
  }

  async getLikerProfileDetail(likerUserId: string, mode?: string | null) {
    // Kart MODA GÖRE geliyor: `prompts` o modun cevaplarını, niyet alanı da
    // o modun niyetini taşıyor (bkz. backend ProfileCardDto notu).
    return api.get(
      `${API_ENDPOINTS.LIKER_PROFILE}/${likerUserId}${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`,
    );
  }

  // Fire'lar ve normal beğeniler AYRI paginate ediliyor; ikisi de tek
  // sayfa çekiliyor. Zarf ham dönüyor — çağıranlar (LikesScreen listesi,
  // fetchWhoLikedMe thunk'ı) farklı alanlarını kullanıyor.
  async getWhoLikedMe(
    likePage = 1,
    likePageSize = 10,
    superLikePageSize = 10,
    mode?: string | null,
  ) {
    return api.get(
      `${API_ENDPOINTS.WHO_LIKED_ME}?likePageNumber=${likePage}&likePageSize=${likePageSize}&superLikePageNumber=1&superLikePageSize=${superLikePageSize}${modeParam(mode)}`,
    );
  }
}

export default new SwipeService();
