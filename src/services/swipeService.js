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

  async superLikeUser(targetUserId) {
    const response = await api.post(API_ENDPOINTS.SWIPE_SUPER_LIKE, { targetUserId, swipeType: 'superlike' });
    return response;
  }

  // WhoLikedMe ekranında bir karta tıklayınca tek liker'ın tam profilini çeker
  // (discovery kartındaki tüm zenginliklerle aynı: distance, compatibilityScore,
  // hobbies, smokingStatus, zodiacSign, vs.). 404 → liker silinmiş/banlanmış ya
  // da arada like'ını geri çekmiş → UI tarafı listeyi yenilemeli.
  async getLikerProfileDetail(likerUserId) {
    const response = await api.get(
      `${API_ENDPOINTS.LIKER_PROFILE}/${likerUserId}`,
    );
    return response;
  }
}

export default new SwipeService();
