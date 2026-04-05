import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';

class SwipeService {
  async getPotentialMatches(token, pageNumber = 1, pageSize = 10) {
    try {
      const response = await axios.get(
        `${API_BASE_URL}${API_ENDPOINTS.GET_POTENTIAL_MATCHES}?pageNumber=${pageNumber}&pageSize=${pageSize}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log(`API Response (Page ${pageNumber}):`, JSON.stringify(response.data, null, 2));

      return {
        profiles: response.data.result.profiles || [],
        hasNextPage: response.data.result.hasNextPage,
        currentPage: response.data.result.currentPage,
        totalPages: response.data.result.totalPages,
      };
    } catch (error) {
      throw error.response?.data || error.message;
    }
  }

  async likeUser(targetUserId, token) {
    // TODO: Replace with real API call when backend is ready
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('Liked user:', targetUserId);
    return {
      statusCode: 200,
      isSuccess: true,
      message: 'Beğenildi'
    };

    /* Uncomment when backend is ready:
    try {
      const response = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.SWIPE_LIKE}`,
        {
          targetUserId,
          swipeType: 'like',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
    */
  }

  async passUser(targetUserId, token) {
    // TODO: Replace with real API call when backend is ready
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('Passed user:', targetUserId);
    return {
      statusCode: 200,
      isSuccess: true,
      message: 'Geçildi'
    };

    /* Uncomment when backend is ready:
    try {
      const response = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.SWIPE_PASS}`,
        {
          targetUserId,
          swipeType: 'pass',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
    */
  }
}

export default new SwipeService();
