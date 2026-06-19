import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import type { ProfileState } from "@/shared/types";

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
  city: null,
  district: null,
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
  usagePurpose: null,
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
    city?: number;
    district?: number;
    ageRangeMin?: number;
    ageRangeMax?: number;
    hobbies: string[];
    smokingStatus?: string;
    zodiacSign?: string;
    usagePurpose?: string;
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
      formData.append("Latitude", Number(latitude).toFixed(8));
      formData.append("Longitude", Number(longitude).toFixed(8));

      if (profileData.bio) {
        formData.append("Bio", profileData.bio);
      }
      if (profileData.city) {
        formData.append("City", String(profileData.city));
      }
      if (profileData.district) {
        formData.append("District", String(profileData.district));
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
      if (profileData.usagePurpose != null) {
        formData.append("UsagePurpose", profileData.usagePurpose);
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
      console.log("📤 Response status:", response.status);
      console.log("📤 Parsed JSON:", JSON.stringify(data, null, 2));

      if (response.status < 200 || response.status >= 300) {
        return rejectWithValue(data?.message || data?.title || "Profil tamamlanırken bir hata oluştu");
      }

      if (data && data.isSuccess === false) {
        return rejectWithValue(data?.message || "Profil tamamlanırken bir hata oluştu");
      }

      console.log('✅ Profile completed successfully!');
      return data || { success: true };
    } catch (error: any) {
      console.error("❌ Complete Profile Error:", error.message);
      return rejectWithValue(error.message || "Profil tamamlanırken bir hata oluştu");
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
      put("PhoneNumber", reg.phoneNumber);

      put("Height", profile.height);
      put("Department", profile.department);
      put("YearOfStudy", profile.yearOfStudy);
      put("Latitude", Number(latitude).toFixed(8));
      put("Longitude", Number(longitude).toFixed(8));

      profile.interestedIn.forEach((val: any) => put("InterestedIn", val));
      profile.hobbies.forEach((val: any) => put("Hobbies", val));

      put("Bio", profile.bio);
      put("City", profile.city);
      put("District", profile.district);
      put("AgeRangeMin", profile.ageRangeMin);
      put("AgeRangeMax", profile.ageRangeMax);
      put("SmokingStatus", profile.smokingStatus);
      put("ZodiacSign", profile.zodiacSign);
      put("UsagePurpose", profile.usagePurpose);

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

      console.log("📤 [registerAndComplete] Sending to backend:");
      for (const [key, value] of (formData as any)._parts ?? []) {
        if (value && typeof value === "object" && value.uri) {
          console.log(`  ${key}: <photo ${value.name}>`);
        } else {
          console.log(`  ${key}:`, value);
        }
      }

      const response = await postFormData(
        `${API_BASE_URL}${API_ENDPOINTS.REGISTER_AND_COMPLETE}`,
        formData
      );

      const data = response.data;
      const rawText = typeof data === "string" ? data : JSON.stringify(data);
      console.log("📥 [registerAndComplete] HTTP", response.status);
      console.log("📥 [registerAndComplete] Response body:", rawText);

      if (response.status < 200 || response.status >= 300 || (data && data.isSuccess === false)) {
        const errMsg =
          data?.message ||
          data?.title ||
          data?.errors ||
          rawText ||
          `HTTP ${response.status}`;
        console.error("❌ Backend error detail:", errMsg);
        if (data?.errors) {
          console.error("❌ Field errors:", JSON.stringify(data.errors, null, 2));
        }
        return rejectWithValue(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      }

      return data;
    } catch (error: any) {
      console.error("❌ registerAndComplete exception:", error);
      return rejectWithValue(error.message || "Kayıt tamamlanamadı");
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
        console.log('✅ Profile completed successfully - clearing profile state');
        return initialState;
      })
      .addCase(completeProfile.rejected, (state, action) => {
        console.log('❌ Profile completion rejected - keeping profile data for retry');
        state.loading = false;
        state.error = action.payload as string;
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
        state.error = action.payload as string;
      });
  },
});

export const { updateProfileField, updateMultipleFields, clearProfile } =
  profileSlice.actions;
export default profileSlice.reducer;
