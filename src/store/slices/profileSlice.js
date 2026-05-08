import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL, API_ENDPOINTS } from "../../constants/api";

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
  hobbies: [],
  smokingStatus: null, // Now stores Integer ID
  zodiacSign: null, // Now stores Integer ID
  usagePurpose: null, // Now stores Integer ID
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
      formData.append("Latitude", latitude);
      formData.append("Longitude", longitude);

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

      // Make API request
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.COMPLETE_PROFILE}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      // Log response details
      console.log("📤 Response status:", response.status);
      console.log("📤 Response content-type:", response.headers.get("content-type"));

      // Check if response has content
      let data = null;
      let rawText = null;

      // Try to read response body regardless of content type
      try {
        rawText = await response.text();
        console.log("📤 Raw response:", rawText);

        if (rawText && rawText.trim().length > 0) {
          try {
            data = JSON.parse(rawText);
            console.log("📤 Parsed JSON:", JSON.stringify(data, null, 2));
          } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError.message);
            console.error('❌ Raw text was:', rawText);
          }
        }
      } catch (readError) {
        console.error('❌ Error reading response:', readError.message);
      }

      // Check HTTP status
      if (!response.ok) {
        console.error("❌ Profile Error (HTTP):", data?.message || data?.title || `Status ${response.status}`);
        console.error("❌ Full error data:", JSON.stringify(data, null, 2));
        return rejectWithValue(data?.message || data?.title || "Profil tamamlanırken bir hata oluştu");
      }

      // Check backend's isSuccess flag (even if HTTP 200)
      if (data && !data.isSuccess) {
        console.error("❌ Profile Error (Backend):", data?.message || `Status ${data.statusCode}`);
        console.error("❌ Full error data:", JSON.stringify(data, null, 2));
        return rejectWithValue(data?.message || "Profil tamamlanırken bir hata oluştu");
      }

      console.log('✅ Profile completed successfully!');
      console.log('✅ Response data:', JSON.stringify(data, null, 2));
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

      // Email-verified token + account fields
      formData.append("EmailVerifiedToken", state.auth.emailVerifiedToken);
      formData.append("Email", state.auth.registrationEmail);
      formData.append("FirstName", reg.firstName);
      formData.append("LastName", reg.lastName);
      formData.append("DisplayName", `${reg.firstName} ${reg.lastName}`);
      formData.append("Gender", reg.gender);
      formData.append("DateOfBirth", reg.dateOfBirth);
      formData.append("Password", reg.password);
      if (reg.phoneNumber) formData.append("PhoneNumber", reg.phoneNumber);

      // Profile fields
      formData.append("Height", profile.height);
      formData.append("Department", profile.department);
      formData.append("YearOfStudy", profile.yearOfStudy);
      formData.append("Latitude", latitude);
      formData.append("Longitude", longitude);

      // Arrays
      profile.interestedIn.forEach((val) => formData.append("InterestedIn", String(val)));
      profile.hobbies.forEach((val) => formData.append("Hobbies", String(val)));

      // Optional profile fields
      if (profile.bio) formData.append("Bio", profile.bio);
      if (profile.city) formData.append("City", profile.city);
      if (profile.district) formData.append("District", profile.district);
      if (profile.ageRangeMin) formData.append("AgeRangeMin", profile.ageRangeMin);
      if (profile.ageRangeMax) formData.append("AgeRangeMax", profile.ageRangeMax);
      if (profile.smokingStatus != null) formData.append("SmokingStatus", profile.smokingStatus);
      if (profile.zodiacSign != null) formData.append("ZodiacSign", profile.zodiacSign);
      if (profile.usagePurpose != null) formData.append("UsagePurpose", profile.usagePurpose);

      // Defaults
      formData.append("MaxDistance", 50);
      formData.append("ShowMyUniversity", true);
      formData.append("ShowMeOnApp", true);
      formData.append("ShowDistance", true);
      formData.append("ShowAge", true);

      // Photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const filename = photo.split("/").pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : "image/jpeg";
        formData.append("Photos", { uri: photo, name: filename, type });
      }
      formData.append("MainPhotoIndex", mainPhotoIndex);

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.REGISTER_AND_COMPLETE}`, {
        method: "POST",
        body: formData,
      });

      let data = null;
      try {
        const rawText = await response.text();
        if (rawText?.trim()) data = JSON.parse(rawText);
      } catch {}

      if (!response.ok || (data && !data.isSuccess)) {
        return rejectWithValue(data?.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
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
      });
  },
});

export const { updateProfileField, updateMultipleFields, clearProfile } =
  profileSlice.actions;
export default profileSlice.reducer;
