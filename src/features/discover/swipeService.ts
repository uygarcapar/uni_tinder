import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import type { PotentialMatch } from '../types';

interface PotentialMatchesResponse {
  profiles: PotentialMatch[];
  hasNextPage: boolean;
  currentPage: number;
  totalPages: number;
}

class SwipeService {
  async getPotentialMatches(_token: string | null, pageNumber = 1, pageSize = 10): Promise<PotentialMatchesResponse> {
    const response = await api.get(
      `${API_ENDPOINTS.GET_POTENTIAL_MATCHES}?pageNumber=${pageNumber}&pageSize=${pageSize}`
    ) as any;

    console.log(`API Response (Page ${pageNumber}):`, JSON.stringify(response, null, 2));

    return {
      profiles: response.result?.profiles || [],
      hasNextPage: response.result?.hasNextPage,
      currentPage: response.result?.currentPage,
      totalPages: response.result?.totalPages,
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
