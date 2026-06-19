import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';

interface PhotoOrder {
  photoId: string;
  newOrder: number;
}

interface ProfileUpdate {
  NewPhotos?: Array<{ uri: string; name: string; type: string }>;
  PhotoOrders?: PhotoOrder[];
  [key: string]: any;
}

class ProfileService {
  async getMyProfile() {
    const response = await api.get(API_ENDPOINTS.GET_MY_PROFILE);
    return (response as any).result;
  }

  async updateProfile(updates: ProfileUpdate) {
    const formData = new FormData();
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'NewPhotos' && Array.isArray(value)) {
          value.forEach((file) => formData.append('NewPhotos', file as any));
        } else if (key === 'PhotoOrders' && Array.isArray(value)) {
          (value as PhotoOrder[]).forEach((item, i) => {
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
    return (response as any).result;
  }

  async updatePreferences(preferences: Record<string, any>) {
    const response = await api.patch(API_ENDPOINTS.UPDATE_PREFERENCES, preferences);
    return (response as any).result;
  }
}

export default new ProfileService();
