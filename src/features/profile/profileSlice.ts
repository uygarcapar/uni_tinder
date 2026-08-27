import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import i18n from "@/shared/i18n";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import type { ProfilePromptAnswer, ProfileState } from "@/shared/types";
import { devLog } from '@/shared/utils/devLog';
import { FREE_MAX_DISTANCE_KM, MAX_PROFILE_PHOTOS } from "@/shared/constants/limits";
import { photoModerationCodeKey } from "@/shared/constants/responseCodes";
import {
  extractModerationPhotos,
  isBlockingPhoto,
  moderationReasonText,
  resolveRequiredPhotoCount,
  type PhotoModeration,
} from "./photoModeration";
import {
  extractPromptErrors,
  promptErrorText,
  promptSummaryCode,
  type PromptFieldError,
} from "./promptErrors";
import { appendPrompts } from "./promptPayload";

/**
 * Kayıt/profil gönderiminin reddi. Ekranın doğru Alert'i kurabilmesi için ham
 * mesaj yerine yapılandırılmış veri taşır: `main_photo_multiple_faces` gibi
 * fatal kodlarda kullanıcıya "başka fotoğrafı ana yap" önerilebilsin diye.
 */
export interface ProfileSubmitError {
  message: string;
  /**
   * Ham `UT-xxxx` kodu (varsa). `message` bilinen foto kodlarında zaten bu
   * koddan üretiliyor; ekran kodu yalnızca AKSİYON seçmek için okur (ör.
   * `UT-6306` geçici → "tekrar dene", diğerleri kalıcı → düz uyarı).
   */
  code: string | null;
  reasonCode: string | null;
  photos: PhotoModeration[];
  /**
   * Reddedilen prompt slotları (`UT-22xx`). Kayıt adımı bunları ilgili cevabın
   * altına inline yazıyor — tek "profil kaydedilemedi" mesajına düşmesin.
   */
  prompts: PromptFieldError[];
}

// Fotoğraf kaynaklı 400'ler İKİ AYRI ŞEKİLDE geliyor (rehber §12.3) ve ikisi de
// `code: null` — ayrım `result.photos` alanının VARLIĞINDA:
//
//   result.photos VAR  → yetersiz uygun fotoğraf. Hangi fotonun neden elendiği
//                        dizide; hepsi Review/Pending ise kullanıcı BEKLEMELİ,
//                        en az biri Rejected ise DEĞİŞTİRMELİ (§5.2).
//   result.photos YOK  → ANA FOTOĞRAF ihlali. İstek tümden düştü, S3 temizlendi,
//                        yalnız düz `message` var. `UT-6301/6302` BEKLEME —
//                        backend o kodları bu yolda döndürmüyor.
//
// UI metni HER ZAMAN reasonCode'dan üretilir; akışı hangi kodun DURDURDUĞUNU
// sunucu söylüyor (`moderation.severity === 'Blocking'`) — istemcide kod listesi
// tutulmuyor.
const buildSubmitError = (data: any, fallback: string): ProfileSubmitError => {
  const photos = extractModerationPhotos(data?.result);
  // KODLU 400'ler (UT-63xx: foto tavanı, minimum foto, sağlayıcı erişilemez)
  // `result.photos` taşımıyor, yani aşağıdaki `mainPhotoViolation` dalına düşüp
  // "ana fotoğraf ihlali" muamelesi görüyorlardı. Kod varsa metin BİZİM
  // tablomuzdan gelmeli — ProfileScreen'deki `photoErrorText` ile aynı kaynak.
  const code = data?.code ?? data?.errorCode ?? null;
  const codeKey = photoModerationCodeKey(code);
  // Ana foto ihlali: dizi hiç yok. Fotoğraf başına sebep de yok, backend'in
  // yerelleştirilmiş `message`'ı tek bilgi kaynağı.
  const mainPhotoViolation =
    !Array.isArray(data?.result?.photos) && !!data?.message;
  const fatal = photos.find(isBlockingPhoto);
  const reasonCode =
    fatal?.reasonCode ??
    photos.find((p) => p.reasonCode)?.reasonCode ??
    data?.reasonCode ??
    data?.result?.reasonCode ??
    null;

  // Prompt reddi (UT-22xx) fotoğraf moderasyonuyla aynı zarftan okunuyor.
  // Fotoğraf hatası varsa o öncelikli: akışı BLOKLAYAN o, prompt'u düzeltmek
  // kullanıcıyı ileri taşımaz.
  const prompts = extractPromptErrors(data);

  // Özet mesaj üst seviye koddan: backend orada EN AĞIR hatayı veriyor, slot
  // dizisinin ilk elemanı ise yalnızca en küçük index (bkz. promptSummaryCode).
  const promptCode = promptSummaryCode(data, prompts);

  const message = codeKey
    ? // `min` burada sunucunun `requiredPhotoCount`'u DEĞİL: bu zarfta profil
      // görünürlüğü bloğu yok (profil henüz yok ya da yanıt hata zarfı).
      // Alan gelmediğinde geçerli olan sunucu kuralına düşülüyor.
      i18n.t(codeKey, {
        max: MAX_PROFILE_PHOTOS,
        min: resolveRequiredPhotoCount(null),
      })
    : mainPhotoViolation
      ? // Kodsuz 400: sunucunun metni ("1. fotoğrafında net bir yüz göremedik…")
        // hangi fotoğraf ve neden bilgisini taşıyan tek kaynak.
        data.message
      : reasonCode
        ? moderationReasonText(
            fatal?.status ?? 'Rejected',
            reasonCode,
            fatal?.reasonText,
          )
        : promptCode
          ? promptErrorText(promptCode)
          : data?.message || data?.title || fallback;

  return { message, code, reasonCode, photos, prompts };
};

// Expo SDK 56'nın winter fetch'i RN'in klasik {uri,name,type} FormData pattern'ini
// desteklemiyor → "Unsupported FormDataPart implementation" fırlatıyor.
// axios XHR adapter kullanıyor, klasik pattern çalışıyor.
const postFormData = (url: string, formData: FormData, extraHeaders: Record<string, string> = {}) =>
  axios.post(url, formData, {
    headers: { Accept: "application/json", ...extraHeaders },
    transformRequest: (d) => d,
    validateStatus: () => true,
    timeout: 60000,
  });

const initialState: ProfileState = {
  yearOfStudy: "",
  department: null,
  latitude: null,
  longitude: null,
  ageRangeMin: 18,
  ageRangeMax: 65,
  height: "",
  prompts: [],
  // Geçiş fazı alanı — kayıt akışı artık doldurmuyor (bkz. ProfileState.bio).
  bio: "",
  interestedIn: [],
  hobbies: [],
  smokingStatus: null,
  zodiacSign: null,
  relationshipIntent: null,
  alcoholUsage: null,
  religiousView: null,
  photos: [],
  mainPhotoIndex: 0,
  loading: false,
  error: null,
};

interface CompleteProfileArgs {
  profileData: {
    department: number;
    yearOfStudy: string;
    height: string;
    interestedIn: number[];
    prompts?: ProfilePromptAnswer[];
    /** @deprecated Geçiş fazı — okunmuyor, bkz. ProfileState.bio. */
    bio?: string;
    ageRangeMin?: number;
    ageRangeMax?: number;
    hobbies: string[];
    smokingStatus?: string;
    zodiacSign?: string;
    relationshipIntent?: string;
  };
  photos: string[];
  mainPhotoIndex: number;
  latitude: number;
  longitude: number;
}

export const completeProfile = createAsyncThunk(
  "profile/completeProfile",
  async ({ profileData, photos, mainPhotoIndex, latitude, longitude }: CompleteProfileArgs, { getState, rejectWithValue }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      const user = state.auth.user;

      const formData = new FormData();

      if (user?.displayName) {
        formData.append("DisplayName", user.displayName);
      }

      formData.append("Department", String(profileData.department));
      formData.append("YearOfStudy", profileData.yearOfStudy);
      formData.append("Height", profileData.height);
      profileData.interestedIn.forEach((val) => {
        formData.append("InterestedIn", String(val));
      });
      // Şehir/ilçe artık client'tan GİTMİYOR: backend bunları Latitude/Longitude'dan
      // türetiyor ve şema City/District alanlarını kabul etmiyor (gönderilse
      // sessizce düşürülür).
      formData.append("Latitude", Number(latitude).toFixed(8));
      formData.append("Longitude", Number(longitude).toFixed(8));

      // Bio ARTIK GÖNDERİLMİYOR — yerini prompt'lar aldı. Alan state'te geçiş
      // fazı boyunca duruyor ama kayıt akışı hiç doldurmuyor, bu yüzden burada
      // da okunmuyor (bkz. ProfileState.bio @deprecated).
      appendPrompts(formData, profileData.prompts);
      if (profileData.ageRangeMin) {
        formData.append("AgeRangeMin", String(profileData.ageRangeMin));
      }
      if (profileData.ageRangeMax) {
        formData.append("AgeRangeMax", String(profileData.ageRangeMax));
      }

      profileData.hobbies.forEach((hobby) => {
        formData.append("Hobbies", hobby);
      });

      if (profileData.smokingStatus != null) {
        formData.append("SmokingStatus", profileData.smokingStatus);
      }
      if (profileData.zodiacSign != null) {
        formData.append("ZodiacSign", profileData.zodiacSign);
      }
      if (profileData.relationshipIntent != null) {
        formData.append("RelationshipIntent", profileData.relationshipIntent);
      }

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const filename = photo.split("/").pop() ?? `photo_${i}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append("Photos", { uri: photo, name: filename, type } as any);
      }

      formData.append("MainPhotoIndex", String(mainPhotoIndex));
      formData.append("ShowMyUniversity", "true");
      formData.append("ShowMeOnApp", "true");
      formData.append("ShowDistance", "true");
      formData.append("ShowAge", "true");
      // Kayıtta mesafe sorulmuyor; yeni hesap free TAVANIYLA başlıyor.
      // Mesafe 2026-08-21'den beri KATI filtre (yarıçap dışı profil hiç
      // gelmiyor), dolayısıyla dar bir varsayılan yeni kullanıcıyı doğrudan
      // boş desteye düşürürdü. Backend aralığa clamp'liyor (Range(5,150) +
      // tier), yani tavan değişse de bu değer 400 üretmez.
      formData.append("MaxDistance", String(FREE_MAX_DISTANCE_KM));

      const response = await postFormData(
        `${API_BASE_URL}${API_ENDPOINTS.COMPLETE_PROFILE}`,
        formData,
        { Authorization: `Bearer ${token}` }
      );

      const data = response.data;
      devLog("📤 Response status:", response.status);
      devLog("📤 Parsed JSON:", JSON.stringify(data, null, 2));

      if (
        response.status < 200 ||
        response.status >= 300 ||
        (data && data.isSuccess === false)
      ) {
        return rejectWithValue(
          buildSubmitError(data, "Profil tamamlanırken bir hata oluştu"),
        );
      }

      devLog('✅ Profile completed successfully!');
      // result = { profile, photos } (koşulsuz). Zarfı olduğu gibi
      // döndürüyoruz; çağıran taraf ihtiyacı olan alanı kendisi okuyor.
      return data || { success: true };
    } catch (error: any) {
      console.error("❌ Complete Profile Error:", error.message);
      return rejectWithValue(
        buildSubmitError(null, error.message || "Profil tamamlanırken bir hata oluştu"),
      );
    }
  }
);

interface RegisterAndCompleteArgs {
  photos: string[];
  mainPhotoIndex: number;
  latitude: number;
  longitude: number;
}

export const registerAndComplete = createAsyncThunk(
  "profile/registerAndComplete",
  async ({ photos, mainPhotoIndex, latitude, longitude }: RegisterAndCompleteArgs, { getState, rejectWithValue }) => {
    try {
      const state = getState() as any;
      const reg = state.auth.registrationForm;
      const profile = state.profile;

      const formData = new FormData();

      const put = (key: string, value: any) => {
        if (value === null || value === undefined || value === "") return;
        formData.append(key, String(value));
      };

      put("EmailVerifiedToken", state.auth.emailVerifiedToken);
      put("Email", state.auth.registrationEmail);
      put("FirstName", reg.firstName);
      put("DisplayName", reg.firstName);
      put("Gender", reg.gender);
      put("DateOfBirth", reg.dateOfBirth);
      put("Password", reg.password);

      put("Height", profile.height);
      put("Department", profile.department);
      put("YearOfStudy", profile.yearOfStudy);
      put("Latitude", Number(latitude).toFixed(8));
      put("Longitude", Number(longitude).toFixed(8));

      profile.interestedIn.forEach((val: any) => put("InterestedIn", val));
      profile.hobbies.forEach((val: any) => put("Hobbies", val));

      // City/District YOK — backend Latitude/Longitude'dan türetiyor (bkz.
      // completeProfile'daki aynı not).
      //
      // Bio YOK: prompt'lar devraldı. `put()` zaten boş string'i atlıyordu, yani
      // satır bugüne kadar da hiçbir şey göndermiyordu — kaldırılması davranışı
      // değiştirmiyor, sözleşmeyi netleştiriyor.
      appendPrompts(formData, profile.prompts);
      put("AgeRangeMin", profile.ageRangeMin);
      put("AgeRangeMax", profile.ageRangeMax);
      put("SmokingStatus", profile.smokingStatus);
      put("ZodiacSign", profile.zodiacSign);
      put("RelationshipIntent", profile.relationshipIntent);
      // Alan adları profil PUT'undakiyle aynı (bkz. EditProfileForm:
      // updates.AlcoholUsage / updates.ReligiousView). Kullanıcı Step16'yı
      // atlarsa değerler null kalır ve put() bunları hiç eklemez.
      put("AlcoholUsage", profile.alcoholUsage);
      put("ReligiousView", profile.religiousView);

      // completeProfile'daki aynı gerekçe: kayıtta mesafe sorulmuyor, yeni
      // hesap free tavanıyla başlıyor. Katı filtrede dar varsayılan = boş deste.
      put("MaxDistance", FREE_MAX_DISTANCE_KM);
      put("ShowMyUniversity", true);
      put("ShowMeOnApp", true);
      put("ShowDistance", true);
      put("ShowAge", true);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const filename = photo.split("/").pop() ?? `photo_${i}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : "image/jpeg";
        formData.append("Photos", { uri: photo, name: filename, type } as any);
      }
      put("MainPhotoIndex", mainPhotoIndex);

      devLog("📤 [registerAndComplete] Sending to backend:");
      for (const [key, value] of (formData as any)._parts ?? []) {
        if (value && typeof value === "object" && value.uri) {
          devLog(`  ${key}: <photo ${value.name}>`);
        } else {
          devLog(`  ${key}:`, value);
        }
      }

      const response = await postFormData(
        `${API_BASE_URL}${API_ENDPOINTS.REGISTER_AND_COMPLETE}`,
        formData
      );

      const data = response.data;
      const rawText = typeof data === "string" ? data : JSON.stringify(data);
      devLog("📥 [registerAndComplete] HTTP", response.status);
      devLog("📥 [registerAndComplete] Response body:", rawText);

      if (response.status < 200 || response.status >= 300 || (data && data.isSuccess === false)) {
        const rawErr = data?.message || data?.title || data?.errors || rawText;
        console.error("❌ Backend error detail:", rawErr);
        if (data?.errors) {
          console.error("❌ Field errors:", JSON.stringify(data.errors, null, 2));
        }
        const fallback =
          typeof rawErr === "string" && rawErr
            ? rawErr
            : `HTTP ${response.status}`;
        return rejectWithValue(buildSubmitError(data, fallback));
      }

      return data;
    } catch (error: any) {
      console.error("❌ registerAndComplete exception:", error);
      return rejectWithValue(
        buildSubmitError(null, error.message || "Kayıt tamamlanamadı"),
      );
    }
  }
);

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {
    updateProfileField: (state, action: PayloadAction<{ field: keyof ProfileState; value: any }>) => {
      const { field, value } = action.payload;
      (state as any)[field] = value;
    },
    updateMultipleFields: (state, action: PayloadAction<Partial<ProfileState>>) => {
      return { ...state, ...action.payload };
    },
    clearProfile: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(completeProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(completeProfile.fulfilled, () => {
        devLog('✅ Profile completed successfully - clearing profile state');
        return initialState;
      })
      .addCase(completeProfile.rejected, (state, action) => {
        devLog('❌ Profile completion rejected - keeping profile data for retry');
        state.loading = false;
        // payload artık ProfileSubmitError; state yalnızca gösterilebilir
        // mesajı tutar, reasonCode'u ekran .unwrap() catch'inden alıyor.
        state.error = (action.payload as ProfileSubmitError)?.message ?? null;
      })
      .addCase(registerAndComplete.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerAndComplete.fulfilled, () => {
        return initialState;
      })
      .addCase(registerAndComplete.rejected, (state, action) => {
        state.loading = false;
        // payload artık ProfileSubmitError; state yalnızca gösterilebilir
        // mesajı tutar, reasonCode'u ekran .unwrap() catch'inden alıyor.
        state.error = (action.payload as ProfileSubmitError)?.message ?? null;
      });
  },
});

export const { updateProfileField, updateMultipleFields, clearProfile } =
  profileSlice.actions;
export default profileSlice.reducer;
