import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authService } from '../../services/authService';
import { clearProfile } from './profileSlice';
import { saveAccessToken, saveRefreshToken } from '../../utils/tokenStorage';
import { setCurrentAccessToken } from '../../services/api';

// Async thunk to fetch user data
export const fetchUserData = createAsyncThunk(
  'auth/fetchUserData',
  async ({ userId, token }, { rejectWithValue }) => {
    try {
      console.log('🔍 Fetching user data from /api/user/GetUser/' + userId);
      const response = await authService.getUserById(userId, token);
      console.log('📦 GetUser Response:', JSON.stringify(response, null, 2));
      return response;
    } catch (error) {
      console.log('❌ GetUser Error:', error.message);
      return rejectWithValue(error.message || 'Failed to fetch user data');
    }
  }
);

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authService.login(email, password);
      console.log("🔑 Login response keys:", Object.keys(response || {}));
      console.log("🔑 Login refreshToken received:", response?.refreshToken ? "YES" : "NO");
      // Persist tokens so the refresh interceptor can use them
      if (response?.token) {
        setCurrentAccessToken(response.token);
        await saveAccessToken(response.token);
      }
      if (response?.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }
      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authService.register(userData);
      // Persist tokens so the refresh interceptor can use them
      if (response?.token) {
        setCurrentAccessToken(response.token);
        await saveAccessToken(response.token);
      }
      if (response?.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }
      return response;
    } catch (error) {
      console.error('❌ Registration error:', error.response?.data?.message || error.message);
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);

export const logout = createAsyncThunk('auth/logout', async (_, thunkAPI) => {
  // Clear profile data when logging out
  thunkAPI.dispatch(clearProfile());
  await authService.logout();
});

const initialState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  needsVerification: false,
  pendingVerificationEmail: null,
  kvkkVersion: null,
  loading: false,
  error: null,
  // Persisted across restarts for registration resume flow
  registrationEmail: null,
  emailVerifiedToken: null,
  registrationForm: {
    firstName: '',
    lastName: '',
    gender: '',
    dateOfBirth: new Date(2000, 0, 1).toISOString(),
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
    setUser: (state, action) => {
      // Merge user data instead of replacing
      state.user = { ...state.user, ...action.payload };
      state.isAuthenticated = true;
    },
    setUserAndToken: (state, action) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      if (action.payload.refreshToken) {
        state.refreshToken = action.payload.refreshToken;
      }
      state.isAuthenticated = true;
      console.log('🔑 Redux: User and token set');
      console.log('🔑 Token exists:', !!state.token);
    },
    setNeedsVerification: (state, action) => {
      state.needsVerification = true;
      state.pendingVerificationEmail = action.payload;
    },
    clearVerification: (state) => {
      state.needsVerification = false;
      state.pendingVerificationEmail = null;
    },
    updateRegistrationField: (state, action) => {
      const { field, value } = action.payload;
      state.registrationForm[field] = value;
    },
    setEmailVerifiedToken: (state, action) => {
      state.emailVerifiedToken = action.payload;
    },
    setRegistrationEmail: (state, action) => {
      state.registrationEmail = action.payload;
    },
    clearRegistrationForm: (state) => {
      state.registrationEmail = null;
      state.emailVerifiedToken = null;
      state.registrationForm = {
        firstName: '',
        lastName: '',
        gender: '',
        dateOfBirth: new Date(2000, 0, 1).toISOString(),
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
    setKvkkAccepted: (state, action) => {
      state.kvkkVersion = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken; // Save refresh token to Redux
        state.error = null;
        console.log('✅ Login successful - User data:', JSON.stringify(action.payload.user, null, 2));
        console.log('✅ isMailVerified:', action.payload.user?.isMailVerified);
        console.log('✅ isProfileCreated:', action.payload.user?.isProfileCreated);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Register
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false; // Don't authenticate until email is verified
        state.needsVerification = true;
        state.pendingVerificationEmail = action.payload.user?.email;
        state.user = action.payload.user; // Save user data
        state.token = action.payload.token; // Save token for later use
        state.refreshToken = action.payload.refreshToken; // Save refresh token to Redux
        state.error = null;
        console.log('🔑 Register: Token saved to Redux:', !!state.token);
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      // Fetch User Data
      .addCase(fetchUserData.fulfilled, (state, action) => {
        if (action.payload.isSuccess && action.payload.result) {
          console.log('✅ fetchUserData successful - Updated user data');
          console.log('✅ Updated isProfileCreated:', action.payload.result.isProfileCreated);
          state.user = action.payload.result;
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
