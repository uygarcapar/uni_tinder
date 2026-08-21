import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import {
  extractModerationPhotos,
  unwrapProfileResult,
  type PhotoModeration,
} from './photoModeration';

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
  // GetMyProfile'ın photosList'i moderasyon alanlarını taşıyor mu bilinmiyor
  // (rehber bunları yalnızca GetMyPhotos için belgeliyor). Taşıyorsa ek istek
  // hiç atılmaz; taşımıyorsa GetMyPhotos'tan çekip photoId ile birleştiriyoruz.
  // Uç 404/403 dönerse bayrak kalıcı olarak kapanır ve bir daha denenmez.
  private _moderationMergeEnabled = true;

  async getMyProfile(force = false) {
    if (!force) {
      const c = this._profileCache;
      if (c && Date.now() - c.at < PROFILE_TTL_MS) return c.data;
      if (this._profileInFlight) return this._profileInFlight;
    }
    const p = (async () => {
      const response = await api.get(API_ENDPOINTS.GET_MY_PROFILE);
      const result = await this.withPhotoModeration((response as any).result);
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

  /**
   * Fotoğraf moderasyon durumları. Kullanıcı KENDİ fotoğraflarını her durumda
   * görür (sebebiyle birlikte); başkalarına yalnızca Approved olanlar gider.
   */
  async getMyPhotos(): Promise<any[]> {
    const response = await api.get(API_ENDPOINTS.GET_MY_PHOTOS);
    const result = (response as any)?.result;
    return Array.isArray(result) ? result : (result?.photos ?? []);
  }

  /**
   * photosList moderasyon alanlarını zaten taşıyorsa profili olduğu gibi döner.
   * Taşımıyorsa GetMyPhotos'tan çekip photoId üzerinden birleştirir — order
   * silme/sıralama sonrası kayabildiği için eşleştirme ASLA order ile yapılmaz.
   *
   * Birleştirme başarısız olursa profil sessizce moderasyonsuz döner: rozet
   * çıkmaz ama profil ekranı çalışmaya devam eder.
   */
  private async withPhotoModeration(result: any) {
    const photosList = result?.photosList;
    if (!Array.isArray(photosList) || photosList.length === 0) return result;

    const alreadyHasModeration = photosList.some(
      (p: any) => p?.moderationStatus != null,
    );
    if (alreadyHasModeration || !this._moderationMergeEnabled) return result;

    try {
      const moderated = await this.getMyPhotos();
      if (!Array.isArray(moderated) || moderated.length === 0) return result;

      const byId = new Map<string, any>();
      moderated.forEach((m: any) => {
        if (m?.photoId != null) byId.set(String(m.photoId), m);
      });

      return {
        ...result,
        photosList: photosList.map((p: any) => {
          const m = p?.photoId != null ? byId.get(String(p.photoId)) : undefined;
          if (!m) return p;
          return {
            ...p,
            moderationStatus: m.moderationStatus,
            rejectionReasonCode: m.rejectionReasonCode,
            rejectionReasonText: m.rejectionReasonText,
            isVisibleToOthers: m.isVisibleToOthers,
          };
        }),
      };
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404 || status === 403 || status === 405) {
        this._moderationMergeEnabled = false;
      }
      return result;
    }
  }

  async updateProfile(
    updates: ProfileUpdate,
  ): Promise<{ profile: any; photos: PhotoModeration[] }> {
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

    // KOŞULLU ŞEKİL: NewPhotos gönderildiyse result = { profile, photos },
    // gönderilmediyse result = düz profileDto. unwrapProfileResult ikisini de
    // karşılıyor; photos yoksa boş dizi döner.
    const result = (response as any).result;
    return {
      profile: unwrapProfileResult(result),
      photos: extractModerationPhotos(result),
    };
  }

  async updatePreferences(preferences: Record<string, any>) {
    const response = await api.patch(API_ENDPOINTS.UPDATE_PREFERENCES, preferences);
    return (response as any).result;
  }
}

export default new ProfileService();
