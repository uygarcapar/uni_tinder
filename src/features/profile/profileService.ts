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

// Cold-boot'ta GetMyProfile 3 ayrı yerden çekiliyordu (AppNavigator header foto +
// ProfileScreen + LikesScreen preload). Hepsi aynı profili istiyor. Kısa TTL +
// in-flight dedup → eşzamanlı/yakın çağrılar tek isteğe iner. updateProfile
// cache'i bust eder, ForceRefresh (pull-to-refresh / edit sonrası) taze çeker.
const PROFILE_TTL_MS = 10_000;

class ProfileService {
  private _profileCache: { at: number; data: any } | null = null;
  private _profileInFlight: Promise<any> | null = null;

  async getMyProfile(force = false) {
    if (!force) {
      const c = this._profileCache;
      if (c && Date.now() - c.at < PROFILE_TTL_MS) return c.data;
      if (this._profileInFlight) return this._profileInFlight;
    }
    const p = (async () => {
      const response = await api.get(API_ENDPOINTS.GET_MY_PROFILE);
      const result = (response as any).result;
      this._profileCache = { at: Date.now(), data: result };
      return result;
    })();
    this._profileInFlight = p;
    try {
      return await p;
    } finally {
      if (this._profileInFlight === p) this._profileInFlight = null;
    }
  }

  bustProfileCache() {
    this._profileCache = null;
    this._profileInFlight = null;
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
    this.bustProfileCache(); // sonraki getMyProfile taze veri çeksin
    return (response as any).result;
  }

  async updatePreferences(preferences: Record<string, any>) {
    const response = await api.patch(API_ENDPOINTS.UPDATE_PREFERENCES, preferences);
    return (response as any).result;
  }
}

export default new ProfileService();
