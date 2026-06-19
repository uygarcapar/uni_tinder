import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS } from "../../constants/api";

// Expo SDK 56'nın winter fetch'i RN'in klasik {uri,name,type} FormData pattern'ini
// desteklemiyor → "Unsupported FormDataPart implementation" fırlatıyor.
// axios XHR adapter kullanıyor, klasik pattern çalışıyor.
const postFormData = (url, formData, extraHeaders = {}) =>
  axios.post(url, formData, {
    headers: { Accept: "application/json", ...extraHeaders },
    transformRequest: (d) => d,
    validateStatus: () => true,
    timeout: 60000,
  });

const initialState = {
  yearOfStudy: "",
  department: null, // Now stores Integer ID
  city: null, // Now stores Integer ID
  district: null, // Now stores Integer ID
  latitude: null,
  longitude: null,
  ageRangeMin: 18,
  ageRangeMax: 65,
  height: "",
  bio: "",
  interestedIn: [],
  hobbies: [], // enum string array (örn ["Music", "Travel"])
  smokingStatus: null, // enum string (örn "Sometimes")
  zodiacSign: null, // enum string (örn "Leo")
  usagePurpose: null, // enum string (örn "Dating")
  photos: [],
  mainPhotoIndex: 0,
  loading: false,
  error: null,
};

// Async thunk for completing profile
export const completeProfile = createAsyncThunk(
  "profile/completeProfile",
  async ({ profileData, photos, mainPhotoIndex, latitude, longitude }, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.token;
      const user = state.auth.user;

      // Create FormData
      const formData = new FormData();

      // Add DisplayName from user object (comes from backend)
      if (user?.displayName) {
        formData.append("DisplayName", user.displayName);
      }

      // Add required fields
      formData.append("Department", profileData.department);
      formData.append("YearOfStudy", profileData.yearOfStudy);
      formData.append("Height", profileData.height);
      profileData.interestedIn.forEach((val) => {
        formData.append("InterestedIn", String(val));
      });
      // Locale-safe — toFixed ECMA gereği her zaman "." ondalık ayracı kullanır.
      formData.append("Latitude", Number(latitude).toFixed(8));
      formData.append("Longitude", Number(longitude).toFixed(8));

      // Add optional fields
      if (profileData.bio) {
        formData.append("Bio", profileData.bio);
      }
      if (profileData.city) {
        formData.append("City", profileData.city);
      }
      if (profileData.district) {
        formData.append("District", profileData.district);
      }
      if (profileData.ageRangeMin) {
        formData.append("AgeRangeMin", profileData.ageRangeMin);
      }
      if (profileData.ageRangeMax) {
        formData.append("AgeRangeMax", profileData.ageRangeMax);
      }

      // Add hobbies
      profileData.hobbies.forEach((hobby) => {
        formData.append("Hobbies", hobby);
      });

      // Add lifestyle fields (Step 7)
      if (profileData.smokingStatus !== null && profileData.smokingStatus !== undefined) {
        formData.append("SmokingStatus", profileData.smokingStatus);
      }
      if (profileData.zodiacSign !== null && profileData.zodiacSign !== undefined) {
        formData.append("ZodiacSign", profileData.zodiacSign);
      }
      if (profileData.usagePurpose !== null && profileData.usagePurpose !== undefined) {
        formData.append("UsagePurpose", profileData.usagePurpose);
      }

      // Add photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const filename = photo.split("/").pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append("Photos", {
          uri: photo,
          name: filename,
          type: type,
        });
      }

      formData.append("MainPhotoIndex", mainPhotoIndex);

      // Add boolean fields as true (will be changed later)
      formData.append("ShowMyUniversity", true);
      formData.append("ShowMeOnApp", true);
      formData.append("ShowDistance", true);
      formData.append("ShowAge", true);

      // Add default MaxDistance
      formData.append("MaxDistance", 50);

      const response = await postFormData(
        `${API_BASE_URL}${API_ENDPOINTS.COMPLETE_PROFILE}`,
        formData,
        { Authorization: `Bearer ${token}` }
      );

      const data = response.data;
      console.log("📤 Response status:", response.status);
      console.log("📤 Parsed JSON:", JSON.stringify(data, null, 2));

      if (response.status < 200 || response.status >= 300) {
        console.error("❌ Profile Error (HTTP):", data?.message || data?.title || `Status ${response.status}`);
        console.error("❌ Full error data:", JSON.stringify(data, null, 2));
        return rejectWithValue(data?.message || data?.title || "Profil tamamlanırken bir hata oluştu");
      }

      if (data && data.isSuccess === false) {
        console.error("❌ Profile Error (Backend):", data?.message || `Status ${data.statusCode}`);
        console.error("❌ Full error data:", JSON.stringify(data, null, 2));
        return rejectWithValue(data?.message || "Profil tamamlanırken bir hata oluştu");
      }

      console.log('✅ Profile completed successfully!');
      return data || { success: true };
    } catch (error) {
      console.error("❌ Complete Profile Error:", error.message);
      return rejectWithValue(error.message || "Profil tamamlanırken bir hata oluştu");
    }
  }
);

export const registerAndComplete = createAsyncThunk(
  "profile/registerAndComplete",
  async ({ photos, mainPhotoIndex, latitude, longitude }, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const reg = state.auth.registrationForm;
      const profile = state.profile;

      const formData = new FormData();

      // RN FormData iOS native tarafı sadece string ve {uri,name,type} kabul ediyor;
      // boolean/number doğrudan append'lenirse "Unsupported FormDataPart implementation"
      // hatası fırlatıyor. Tüm scalar'ları String'e çevir, null/undefined'ı skip et.
      const put = (key, value) => {
        if (value === null || value === undefined || value === "") return;
        formData.append(key, String(value));
      };

      // Email-verified token + account fields
      put("EmailVerifiedToken", state.auth.emailVerifiedToken);
      put("Email", state.auth.registrationEmail);
      put("FirstName", reg.firstName);
      put("DisplayName", reg.firstName);
      put("Gender", reg.gender);
      put("DateOfBirth", reg.dateOfBirth);
      put("Password", reg.password);
      put("PhoneNumber", reg.phoneNumber);

      // Profile fields
      put("Height", profile.height);
      put("Department", profile.department);
      put("YearOfStudy", profile.yearOfStudy);
      // Locale-safe — bkz. completeProfile thunk'taki comment.
      put("Latitude", Number(latitude).toFixed(8));
      put("Longitude", Number(longitude).toFixed(8));

      // Arrays
      profile.interestedIn.forEach((val) => put("InterestedIn", val));
      profile.hobbies.forEach((val) => put("Hobbies", val));

      // Optional profile fields
      put("Bio", profile.bio);
      put("City", profile.city);
      put("District", profile.district);
      put("AgeRangeMin", profile.ageRangeMin);
      put("AgeRangeMax", profile.ageRangeMax);
      put("SmokingStatus", profile.smokingStatus);
      put("ZodiacSign", profile.zodiacSign);
      put("UsagePurpose", profile.usagePurpose);

      // Defaults
      put("MaxDistance", 50);
      put("ShowMyUniversity", true);
      put("ShowMeOnApp", true);
      put("ShowDistance", true);
      put("ShowAge", true);

      // Photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const filename = photo.split("/").pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : "image/jpeg";
        formData.append("Photos", { uri: photo, name: filename, type });
      }
      put("MainPhotoIndex", mainPhotoIndex);

      // RN FormData'da .entries() yok; iç _parts dizisinden logla.
      console.log("📤 [registerAndComplete] Sending to backend:");
      for (const [key, value] of formData._parts ?? []) {
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
    } catch (error) {
      console.error("❌ registerAndComplete exception:", error);
      return rejectWithValue(error.message || "Kayıt tamamlanamadı");
    }
  }
);

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {
    updateProfileField: (state, action) => {
      const { field, value } = action.payload;
      console.log('🔄 profileSlice.updateProfileField - field:', field, 'value:', value);
      state[field] = value;
      console.log('🔄 profileSlice.updateProfileField - new state:', JSON.stringify(state, null, 2));
    },
    updateMultipleFields: (state, action) => {
      console.log('🔄 profileSlice.updateMultipleFields - payload:', JSON.stringify(action.payload, null, 2));
      console.log('🔄 profileSlice.updateMultipleFields - state before:', JSON.stringify(state, null, 2));
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
        // Profile completed successfully - clear all profile data from Redux
        console.log('✅ Profile completed successfully - clearing profile state');
        // Return fresh initial state (don't modify state before returning)
        return initialState;
      })
      .addCase(completeProfile.rejected, (state, action) => {
        console.log('❌ Profile completion rejected - keeping profile data for retry');
        state.loading = false;
        state.error = action.payload;
        // DON'T clear profile state on error - keep data for retry
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
        state.error = action.payload;
      });
  },
});

export const { updateProfileField, updateMultipleFields, clearProfile } =
  profileSlice.actions;
export default profileSlice.reducer;
