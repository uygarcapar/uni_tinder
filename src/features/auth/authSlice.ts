import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService } from '@/features/auth/authService';
import { clearProfile } from '@/features/profile/profileSlice';
import { saveAccessToken, saveRefreshToken } from '@/shared/utils/tokenStorage';
import { markSelfLogin, clearSelfLoginMark } from '@/shared/utils/sessionGuard';
import realtimeService from '@/features/chat/realtimeService';
import { setCurrentAccessToken } from '@/shared/services/api';
import { unregisterPushToken } from '@/features/notifications/pushService';
import type { AuthState, User } from '@/shared/types';
import type { AccountBlockPayload } from '@/shared/utils/accountBlock';
import { devLog } from '@/shared/utils/devLog';

export const fetchUserData = createAsyncThunk(
  'auth/fetchUserData',
  async ({ userId, token }: { userId: string; token: string }, { rejectWithValue }) => {
    try {
      devLog('🔍 Fetching user data from /api/user/GetUser/' + userId);
      const response = await authService.getUserById(userId, token);
      devLog('📦 GetUser Response:', JSON.stringify(response, null, 2));
      return response;
    } catch (error: any) {
      devLog('❌ GetUser Error:', error.message);
      return rejectWithValue(error.message || 'Failed to fetch user data');
    }
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      // Backend login'de kullanıcının eski refresh token'larını
      // `new_login_elsewhere` ile revoke edip TÜM hub bağlantılarına ForceLogout
      // atıyor — bu cihazın önceki oturumdan kalan bağlantısı dahil. Önce kendi
      // soketimizi kapatıp login'i damgalıyoruz ki kendi sinyalimizle
      // "başka cihazdan giriş" toast'ı yiyip yeni oturumdan atılmayalım.
      markSelfLogin();
      await realtimeService.disconnect().catch(() => {});
      const response = await authService.login(email, password);
      devLog("🔑 Login response keys:", Object.keys(response || {}));
      devLog("🔑 Login refreshToken received:", response?.refreshToken ? "YES" : "NO");
      if (response?.token) {
        setCurrentAccessToken(response.token);
        await saveAccessToken(response.token);
      }
      if (response?.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }
      return response;
    } catch (error: any) {
      devLog('❌ Login error — status:', error.response?.status);
      devLog('❌ Login error — data:', JSON.stringify(error.response?.data, null, 2));
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
  // Login damgası oturuma özel — logout'ta sıfırla, yoksa login'den hemen sonra
  // yapılan bir logout+login zincirinde eski damga pencereyi uzatır.
  clearSelfLoginMark();
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
  accountBlock: null,
  registrationForm: {
    firstName: '',
    gender: '',
    dateOfBirth: null,
    password: '',
    confirmPassword: '',
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
      devLog('🔑 Redux: User and token set');
      devLog('🔑 Token exists:', !!state.token);
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
    /**
     * Hesap yaptırımı (403 UT-1007/1008/1009) → oturumu düşür ve gerekçeyi sakla.
     *
     * `logout` thunk'ı yerine ayrı bir reducer: o thunk `revoke-token` ve push
     * token deactivate çağırıyor, ikisi de yaptırımlı hesapta 403 döner. Token
     * temizliği zaten api.ts tarafında yapıldı; burada yalnız Redux durumu.
     */
    accountBlocked: (state, action: PayloadAction<AccountBlockPayload>) => {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.loading = false;
      // Gerekçe ban ekranında gösteriliyor; login ekranındaki kırmızı hata
      // satırında ikinci kez tekrarlanmasın.
      state.error = null;
      state.accountBlock = action.payload;
    },
    /** Askı ekranından "giriş ekranına dön" — yaptırım durumunu kapat. */
    clearAccountBlock: (state) => {
      state.accountBlock = null;
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
        devLog('✅ Login successful - User data:', JSON.stringify(action.payload.user, null, 2));
        devLog('✅ isMailVerified:', action.payload.user?.isMailVerified);
        devLog('✅ isProfileCreated:', action.payload.user?.isProfileCreated);
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
        devLog('🔑 Register: Token saved to Redux:', !!state.token);
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
          devLog('✅ fetchUserData successful - Updated user data');
          devLog('✅ Updated isProfileCreated:', payload.result.isProfileCreated);
          state.user = payload.result;
        }
      })
      .addCase(fetchUserData.rejected, (state, action) => {
        devLog('❌ fetchUserData failed:', action.payload);
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
  accountBlocked,
  clearAccountBlock,
} = authSlice.actions;
export default authSlice.reducer;
