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

/**
 * Mod açılışındaki foto seçimi — iki yol ALTERNATİF, karma yok (tasarım:
 * karma düzenleme editörün işi):
 *  • `existing` — kaynak modun slotları id listesiyle devralınır (dosya
 *    taşınmaz, moderasyon tekrarlanmaz).
 *  • `new` — kurulumda çekilen/seçilen kareler aynı istekte yüklenir.
 */
export type OpenModePhotos =
  | { kind: "existing"; photoIds: string[]; mainPhotoId: string }
  | { kind: "new"; files: Array<{ uri: string; name: string; type: string }> };

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
        // ⚠️ Dosya ve indeksli desenler ANAHTAR-ÖZEL ve mod başına fotoğrafın
        // `Friends*` kardeş anahtarları da BU dallardan geçmek zorunda:
        // jenerik dizi dalı öğeyi String(item) ile "[object Object]"e ezer ve
        // Friends foto ekleme/sıralama sunucuya hiç ulaşmaz (sessiz kayıp).
        if (
          (key === 'NewPhotos' || key === 'FriendsNewPhotos') &&
          Array.isArray(value)
        ) {
          value.forEach((file) => formData.append(key, file as any));
        } else if (
          (key === 'PhotoOrders' || key === 'FriendsPhotoOrders') &&
          Array.isArray(value)
        ) {
          (value as PhotoOrder[]).forEach((item, i) => {
            formData.append(`${key}[${i}].PhotoId`, String(item.photoId));
            formData.append(`${key}[${i}].NewOrder`, String(item.newOrder));
          });
        } else if (key === 'Prompts' && Array.isArray(value)) {
          // PhotoOrders ile aynı indeksli desen. Tekrar eden anahtar (Hobbies
          // gibi) kullanılamaz: soru-cevap eşleşmesi kaybolur.
          appendPrompts(formData, value as ProfilePromptAnswer[]);
        } else if (key === 'FriendsPrompts' && Array.isArray(value)) {
          // Arkadaş profilinin prompt'ları — AYNI desen, AYRI alan kökü
          // (gerekçe promptPayload > appendPrompts).
          appendPrompts(
            formData,
            value as ProfilePromptAnswer[],
            'FriendsPrompts',
          );
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

  /**
   * Bir modun profilini aç (Dating/Friends) — niyet + prompt'lar + FOTO seçimi.
   *
   * Gövde HER ZAMAN multipart (kanonik content-type, BE sözleşmesi §4):
   * kurulumda yepyeni kare `NewPhotos` ile AYNI istekte gidebiliyor, iki
   * isteğe bölmek görünürlük penceresi açardı. JSON yolu eski istemci şimi
   * olarak sunucuda duruyor; biz artık kullanmıyoruz. Alan adları sözleşme
   * örneğinden: `PhotoIds[i]` (sıra = dizi sırası), `MainPhotoId`,
   * `FriendshipIntents[i]`, `InterestedIn[i]`, `RelationshipIntent`,
   * `Prompts[i].PromptKey/.Answer`, `NewPhotos` (tekrarlı dosya alanı).
   *
   * Niyet alanı MODA GÖRE ayrışıyor ve asla ikisi birden gitmiyor: Flört tek
   * seçimli `RelationshipIntent`, Arkadaş çoklu seçimli `FriendshipIntents`
   * (sunucuda bitmask). Yanlış modun alanını göndermek sunucuda reddedilir.
   *
   * ⚠️ `photos` verilmemişse ne `PhotoIds` ne `NewPhotos` eklenir —
   * havuz-güncelleme yolu (profil zaten açık) fotoğraflara DOKUNMAZ
   * ("gönderilmeyen alana dokunulmaz", uç idempotent).
   *
   * ⚠️ Profil cache'i bust ediliyor: `modes` haritası ve yeni prompt'lar
   * `getMyProfile`ın TTL'li kopyasında bayat kalırdı ve seçici satırı
   * "kapalı" göstermeye devam ederdi.
   */
  async openProfileMode(
    mode: string,
    payload: {
      intents: string[];
      prompts: { promptKey: string; answer: string }[];
      /**
       * Dating'de kiminle ilgilendiği (en az 1 zorunlu, UT-2308).
       *
       * Friends'te anlamı FARKLI: orada eşleşme kuralı aynı cinsiyet ve
       * değeri ikili kategorilerde SUNUCU türetip kilitliyor. Alan yalnız
       * Non-Binary kullanıcının havuz seçimini taşıyor; diğer herkeste boş
       * gelir ve gövdeye hiç girmez (bkz. backend_friends_same_gender).
       */
      interestedIn?: string[];
      photos?: OpenModePhotos;
    },
  ): Promise<{ dating?: boolean; friends?: boolean } | undefined> {
    const form = new FormData();
    if (mode === "Friends") {
      payload.intents.forEach((v, i) =>
        form.append(`FriendshipIntents[${i}]`, v),
      );
      // Boş dizi ile alanın hiç olmaması sunucu için AYNI ŞEY DEĞİL: kilitli
      // (ikili kategori) kullanıcıda boş alan ölü yük, üstelik "kullanıcı
      // hiçbirini seçmedi" gibi okunabilir. Yalnız dolu geldiğinde gidiyor.
      payload.interestedIn?.forEach((v, i) =>
        form.append(`InterestedIn[${i}]`, v),
      );
    } else {
      // Dating açılışında İKİ alan birden gidiyor: `InterestedIn` (en az 1
      // ZORUNLU — sunucu UT-2308 ile reddediyor) ve `RelationshipIntent`
      // (opsiyonel; niyet listesi tek seçimli olduğu için ilk eleman —
      // multipart'ta "null alan" diye bir şey olmadığından yokken eklenmiyor).
      (payload.interestedIn ?? []).forEach((v, i) =>
        form.append(`InterestedIn[${i}]`, v),
      );
      if (payload.intents[0] != null) {
        form.append("RelationshipIntent", payload.intents[0]);
      }
    }
    payload.prompts.forEach((p, i) => {
      form.append(`Prompts[${i}].PromptKey`, p.promptKey);
      form.append(`Prompts[${i}].Answer`, p.answer);
    });
    if (payload.photos?.kind === "existing") {
      payload.photos.photoIds.forEach((id, i) =>
        form.append(`PhotoIds[${i}]`, String(id)),
      );
      form.append("MainPhotoId", String(payload.photos.mainPhotoId));
    } else if (payload.photos?.kind === "new") {
      // Sıra = append sırası; ana foto ataması sunucu tarafında (ilk kare
      // varsayımı canlıda doğrulanacak — tasarım dokümanındaki açık madde).
      payload.photos.files.forEach((f) => form.append("NewPhotos", f as any));
    }
    const response = await api.post(API_ENDPOINTS.OPEN_PROFILE_MODE(mode), form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    this.bustProfileCache();
    // Yanıt açık mod haritasını döndürüyor (`{dating, friends}`) — çağıran
    // mod seçicisini bununla güncelliyor, ayrı bir profil turu atmıyor.
    return (response as any).result;
  }
}

export default new ProfileService();
