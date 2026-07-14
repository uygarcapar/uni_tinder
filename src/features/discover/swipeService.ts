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
  currentPage: 1,
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
  wasRadiusExpanded: false,
  appliedRadiusKm: null,
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
}

export default new SwipeService();
