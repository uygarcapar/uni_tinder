import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService } from '@/features/auth/authService';
import { clearProfile } from '@/features/profile/profileSlice';
import { saveAccessToken, saveRefreshToken } from '@/shared/utils/tokenStorage';
import { setCurrentAccessToken } from '@/shared/services/api';
import { unregisterPushToken } from '@/features/notifications/pushService';
import type { AuthState, User } from '@/shared/types';

export const fetchUserData = createAsyncThunk(
  'auth/fetchUserData',
  async ({ userId, token }: { userId: string; token: string }, { rejectWithValue }) => {
    try {
      console.log('🔍 Fetching user data from /api/user/GetUser/' + userId);
      const response = await authService.getUserById(userId, token);
      console.log('📦 GetUser Response:', JSON.stringify(response, null, 2));
      return response;
    } catch (error: any) {
      console.log('❌ GetUser Error:', error.message);
      return rejectWithValue(error.message || 'Failed to fetch user data');
    }
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authService.login(email, password);
      console.log("🔑 Login response keys:", Object.keys(response || {}));
      console.log("🔑 Login refreshToken received:", response?.refreshToken ? "YES" : "NO");
      if (response?.token) {
        setCurrentAccessToken(response.token);
        await saveAccessToken(response.token);
      }
      if (response?.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }
      return response;
    } catch (error: any) {
      console.log('❌ Login error — status:', error.response?.status);
      console.log('❌ Login error — data:', JSON.stringify(error.response?.data, null, 2));
      const data = error.response?.data;
      const nestedError = data?.error;
      const message =
        (nestedError && typeof nestedError === 'object' && nestedError.message) ||
        (typeof nestedError === 'string' && nestedError) ||
        data?.message ||
        data?.Message ||
        (Array.isArray(data?.errors) && typeof data.errors[0] === 'string' && data.errors[0]) ||
        error.message ||
        'Login failed';
      return rejectWithValue(String(message));
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData: Record<string, any>, { rejectWithValue }) => {
    try {
      const response = await authService.register(userData);
      if (response?.token) {
        setCurrentAccessToken(response.token);
        await saveAccessToken(response.token);
      }
      if (response?.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }
      return response;
    } catch (error: any) {
      console.error('❌ Registration error:', error.response?.data?.message || error.message);
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);

export const logout = createAsyncThunk('auth/logout', async (_, thunkAPI) => {
  // Push token deactivate access token temizlenmeden önce çalışmalı — yoksa DELETE
  // auth'suz gider, 401 → refresh fail zinciri RC logout'u iki kez tetikler.
  // Yavaş sunucu logout UX'ini kilitlemesin diye 2s timeout ile race et.
  await Promise.race([
    unregisterPushToken().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  thunkAPI.dispatch(clearProfile());
  await authService.logout();
});

const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  needsVerification: false,
  pendingVerificationEmail: null,
  kvkkVersion: null,
  loading: false,
  error: null,
  registrationEmail: null,
  emailVerifiedToken: null,
  registrationForm: {
    firstName: '',
    gender: '',
    dateOfBirth: null,
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    email: '',
  },
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setUser: (state, action: PayloadAction<Partial<User>>) => {
      state.user = { ...state.user, ...action.payload } as User;
      state.isAuthenticated = true;
    },
    setUserAndToken: (state, action: PayloadAction<{ user: User; token: string; refreshToken?: string }>) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      if (action.payload.refreshToken) {
        state.refreshToken = action.payload.refreshToken;
      }
      state.isAuthenticated = true;
      console.log('🔑 Redux: User and token set');
      console.log('🔑 Token exists:', !!state.token);
    },
    setNeedsVerification: (state, action: PayloadAction<string>) => {
      state.needsVerification = true;
      state.pendingVerificationEmail = action.payload;
    },
    clearVerification: (state) => {
      state.needsVerification = false;
      state.pendingVerificationEmail = null;
    },
    updateRegistrationField: (state, action: PayloadAction<{ field: keyof AuthState['registrationForm']; value: any }>) => {
      const { field, value } = action.payload;
      (state.registrationForm as any)[field] = value;
    },
    setEmailVerifiedToken: (state, action: PayloadAction<string>) => {
      state.emailVerifiedToken = action.payload;
    },
    setRegistrationEmail: (state, action: PayloadAction<string>) => {
      state.registrationEmail = action.payload;
    },
    clearRegistrationForm: (state) => {
      state.registrationEmail = null;
      state.emailVerifiedToken = null;
      state.registrationForm = {
        firstName: '',
        gender: '',
        dateOfBirth: null,
        password: '',
        confirmPassword: '',
        phoneNumber: '',
        email: '',
      };
    },
    setProfileCompleted: (state) => {
      if (state.user) {
        state.user.isProfileCreated = true;
      }
    },
    setKvkkAccepted: (state, action: PayloadAction<string>) => {
      state.kvkkVersion = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.error = null;
        console.log('✅ Login successful - User data:', JSON.stringify(action.payload.user, null, 2));
        console.log('✅ isMailVerified:', action.payload.user?.isMailVerified);
        console.log('✅ isProfileCreated:', action.payload.user?.isProfileCreated);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.needsVerification = true;
        state.pendingVerificationEmail = action.payload.user?.email;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.error = null;
        console.log('🔑 Register: Token saved to Redux:', !!state.token);
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      .addCase(fetchUserData.fulfilled, (state, action) => {
        const payload = action.payload as any;
        if (payload.isSuccess && payload.result) {
          console.log('✅ fetchUserData successful - Updated user data');
          console.log('✅ Updated isProfileCreated:', payload.result.isProfileCreated);
          state.user = payload.result;
        }
      })
      .addCase(fetchUserData.rejected, (state, action) => {
        console.log('❌ fetchUserData failed:', action.payload);
      });
  },
});

export const {
  clearError,
  setUser,
  setUserAndToken,
  setNeedsVerification,
  clearVerification,
  updateRegistrationField,
  setEmailVerifiedToken,
  setRegistrationEmail,
  clearRegistrationForm,
  setProfileCompleted,
  setKvkkAccepted,
} = authSlice.actions;
export default authSlice.reducer;
