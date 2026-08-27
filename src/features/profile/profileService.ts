import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import {
  extractModerationPhotos,
  type PhotoAppealState,
  type PhotoModeration,
} from './photoModeration';
import { appendPrompts } from './promptPayload';
import type { ProfilePromptAnswer } from '@/shared/types';

interface PhotoOrder {
  photoId: string;
  newOrder: number;
}

interface ProfileUpdate {
  NewPhotos?: Array<{ uri: string; name: string; type: string }>;
  PhotoOrders?: PhotoOrder[];
  /**
   * Prompt cevapları. GÖNDERİLDİĞİ AN TAM LİSTE demek — sunucu mevcut satırları
   * silip geleni yazıyor (replace, kısmi güncelleme yok). Değiştirmek
   * istemiyorsan alanı hiç koyma.
   *
   * Boş dizi göndermenin bir anlamı YOK: multipart'ta boş liste ile
   * "gönderilmedi" ayırt edilemiyor, ikisi de sunucuya null geliyor. Yani
   * "hepsini sil" isteği sessizce no-op olur — çağıran taraf son prompt'un
   * silinmesini engellemek zorunda.
   */
  Prompts?: ProfilePromptAnswer[];
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
      // `photosList[]` moderasyon alanlarını KENDİSİ taşıyor (2026-08-24'te
      // doğrulandı — AutoMapper zaten map ediyordu). Eskiden buradan bir de
      // GetMyPhotos çekilip photoId üzerinden birleştiriliyordu; o katman ve
      // ikinci istek gereksizdi, ikisi de kaldırıldı.
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

  /**
   * Reddedilen fotoğrafa itiraz (`202 Accepted`). Butonu YALNIZCA
   * `moderation.isAppealable === true` iken göster: alan "terminal red mi",
   * "zaten itiraz edilmiş mi", "karar veremedik durumu mu" kurallarının
   * tamamını zaten içeriyor.
   *
   * İkinci itiraz / itiraz edilemez karar → `409` + `UT-6205`.
   * Sonuç `PhotoAppealResolved` bildirimi + `PhotoModerationChanged` ile döner.
   */
  /**
   * Tek fotoğrafın KANONİK hâli — `GET /api/photo/GetPhoto/{id}`.
   *
   * Neden `GetMyProfile` yetmiyor: rehber §12.1, profil yanıtındaki
   * `moderation.appealState` AutoMapper sınırı yüzünden HER ZAMAN `None`
   * geliyor ve `isAppealable` `true` kalıyor. İtiraz durumunun doğru olması
   * gereken yerde (itiraz sonrası, foto detayı) bu uç kullanılmalı.
   *
   * ⚠️ `photo` kotasına tabi (10/dk) — rutin okuma için ÇAĞIRMA, profil yanıtı
   * yeterli (§12.7).
   */
  async getPhoto(photoId: string | number): Promise<any | null> {
    const response = await api.get(
      `${API_ENDPOINTS.GET_PHOTO}/${encodeURIComponent(String(photoId))}`,
    );
    return (response as any)?.result ?? null;
  }

  async appealPhoto(
    photoId: string | number,
    note?: string,
  ): Promise<{ appealState: PhotoAppealState; createdAt: string | null }> {
    const response = await api.post(
      API_ENDPOINTS.PHOTO_APPEAL(photoId),
      note ? { note } : {},
    );
    const result = (response as any)?.result;
    return {
      appealState: result?.appealState ?? 'Pending',
      createdAt: result?.createdAt ?? null,
    };
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
        } else if (key === 'Prompts' && Array.isArray(value)) {
          // PhotoOrders ile aynı indeksli desen. Tekrar eden anahtar (Hobbies
          // gibi) kullanılamaz: soru-cevap eşleşmesi kaybolur.
          appendPrompts(formData, value as ProfilePromptAnswer[]);
        } else if (Array.isArray(value)) {
          value.forEach((item) => formData.append(key, String(item)));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    const response = await api.put(API_ENDPOINTS.UPDATE_PROFILE, formData);
    this.bustProfileCache(); // sonraki getMyProfile taze veri çeksin

    // Şekil artık KOŞULSUZ: `result = { profile, photos }`, foto gönderilsin
    // gönderilmesin. Foto gönderilmediyse `photos: []` gelir, alanın kendisi
    // hep var — eski `unwrapProfileResult` sarmalayıcısı bu yüzden silindi.
    //
    // `?? result` yalnızca deploy penceresi için: sözleşme canlıya çıkana kadar
    // eski sunucu hâlâ düz profileDto dönüyor. Backend deploy edildikten sonra
    // bu arm kaldırılabilir.
    const result = (response as any).result;
    return {
      profile: result?.profile ?? result,
      photos: extractModerationPhotos(result),
    };
  }

  async updatePreferences(preferences: Record<string, any>) {
    const response = await api.patch(API_ENDPOINTS.UPDATE_PREFERENCES, preferences);
    return (response as any).result;
  }
}

export default new ProfileService();
