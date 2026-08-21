import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import type { ProfileState } from "@/shared/types";
import { devLog } from '@/shared/utils/devLog';
import {
  extractModerationPhotos,
  isFatalReasonCode,
  moderationReasonText,
  type PhotoModeration,
} from "./photoModeration";

/**
 * Kayıt/profil gönderiminin reddi. Ekranın doğru Alert'i kurabilmesi için ham
 * mesaj yerine yapılandırılmış veri taşır: `main_photo_multiple_faces` gibi
 * fatal kodlarda kullanıcıya "başka fotoğrafı ana yap" önerilebilsin diye.
 */
export interface ProfileSubmitError {
  message: string;
  reasonCode: string | null;
  photos: PhotoModeration[];
}

// Rehber §7: fotoğraf kaynaklı 400'lerde gövde `result.photos` ile hangi
// fotoğrafın neden düştüğünü söylüyor. UI metni HER ZAMAN reasonCode'dan
// üretilir — `reasonText` backend'de Türkçe sabit, yalnızca gösterim/log için.
const buildSubmitError = (data: any, fallback: string): ProfileSubmitError => {
  const photos = extractModerationPhotos(data?.result);
  const fatal = photos.find((p) => isFatalReasonCode(p.reasonCode));
  const reasonCode =
    fatal?.reasonCode ??
    photos.find((p) => p.reasonCode)?.reasonCode ??
    data?.reasonCode ??
    data?.result?.reasonCode ??
    null;

  const message = reasonCode
    ? moderationReasonText(fatal?.status ?? 'Rejected', reasonCode)
    : data?.message || data?.title || fallback;

  return { message, reasonCode, photos };
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

      if (profileData.bio) {
        formData.append("Bio", profileData.bio);
      }
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
      formData.append("MaxDistance", "50");

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
      // KIRICI DEĞİŞİKLİK: result artık { profile, photos }. Zarfı olduğu gibi
      // döndürüyoruz, çözümü çağıran taraf unwrapProfileResult ile yapıyor.
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
      put("Bio", profile.bio);
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

      put("MaxDistance", 50);
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
