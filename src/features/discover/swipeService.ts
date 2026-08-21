import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
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
  emptyReason: "None",
  emptyReasonCode: null,
  emptyReasonMessage: null,
  emptyReasonAction: null,
};

class SwipeService {
  async getPotentialMatches(_token: string | null, pageNumber = 1, pageSize = 10): Promise<PotentialMatchesResponse> {
    const response = await api.get(
      `${API_ENDPOINTS.GET_POTENTIAL_MATCHES}?pageNumber=${pageNumber}&pageSize=${pageSize}`
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

  async likeUser(targetUserId: string, _token?: string | null) {
    return api.post(API_ENDPOINTS.SWIPE_LIKE, { targetUserId, swipeType: 'like' });
  }

  async passUser(targetUserId: string, _token?: string | null) {
    return api.post(API_ENDPOINTS.SWIPE_PASS, { targetUserId, swipeType: 'pass' });
  }

  async superLikeUser(targetUserId: string, _token?: string | null) {
    return api.post(API_ENDPOINTS.SWIPE_SUPER_LIKE, { targetUserId, swipeType: 'superlike' });
  }

  async getLikerProfileDetail(likerUserId: string) {
    return api.get(`${API_ENDPOINTS.LIKER_PROFILE}/${likerUserId}`);
  }

  // SuperLike'lar ve normal beğeniler AYRI paginate ediliyor; ikisi de tek
  // sayfa çekiliyor. Zarf ham dönüyor — çağıranlar (LikesScreen listesi,
  // fetchWhoLikedMe thunk'ı) farklı alanlarını kullanıyor.
  async getWhoLikedMe(likePage = 1, likePageSize = 10, superLikePageSize = 10) {
    return api.get(
      `${API_ENDPOINTS.WHO_LIKED_ME}?likePageNumber=${likePage}&likePageSize=${likePageSize}&superLikePageNumber=1&superLikePageSize=${superLikePageSize}`,
    );
  }
}

export default new SwipeService();
