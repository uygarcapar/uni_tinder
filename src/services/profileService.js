import api from './api';
import { API_ENDPOINTS } from '../constants/api';

class ProfileService {
  async getMyProfile() {
    const response = await api.get(API_ENDPOINTS.GET_MY_PROFILE);
    return response.result;
  }

  async updateProfile(updates) {
    const formData = new FormData();
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'NewPhotos' && Array.isArray(value)) {
          value.forEach((file) => formData.append('NewPhotos', file));
        } else if (key === 'PhotoOrders' && Array.isArray(value)) {
          // ASP.NET Core indexed model binding for nested objects
          value.forEach((item, i) => {
            formData.append(`PhotoOrders[${i}].PhotoId`, String(item.photoId));
            formData.append(`PhotoOrders[${i}].NewOrder`, String(item.newOrder));
          });
        } else if (Array.isArray(value)) {
          value.forEach((item) => formData.append(key, String(item)));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    const response = await api.put(API_ENDPOINTS.UPDATE_PROFILE, formData);
    return response.result;
  }

  async updatePreferences(preferences) {
    const response = await api.patch(API_ENDPOINTS.UPDATE_PREFERENCES, preferences);
    return response.result;
  }
}

export default new ProfileService();
