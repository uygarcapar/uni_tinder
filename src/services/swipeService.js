import api from './api';
import { API_ENDPOINTS } from '../constants/api';

class SwipeService {
  async getPotentialMatches(_token, pageNumber = 1, pageSize = 10) {
    const response = await api.get(
      `${API_ENDPOINTS.GET_POTENTIAL_MATCHES}?pageNumber=${pageNumber}&pageSize=${pageSize}`
    );

    console.log(`API Response (Page ${pageNumber}):`, JSON.stringify(response, null, 2));

    return {
      profiles: response.result?.profiles || [],
      hasNextPage: response.result?.hasNextPage,
      currentPage: response.result?.currentPage,
      totalPages: response.result?.totalPages,
    };
  }

  async likeUser(targetUserId) {
    const response = await api.post(API_ENDPOINTS.SWIPE_LIKE, { targetUserId, swipeType: 'like' });
    return response;
  }

  async passUser(targetUserId) {
    const response = await api.post(API_ENDPOINTS.SWIPE_PASS, { targetUserId, swipeType: 'pass' });
    return response;
  }
}

export default new SwipeService();
