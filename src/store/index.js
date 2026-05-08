import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import profileReducer from './slices/profileSlice';
import swipeReducer from './slices/swipeSlice';
import subscriptionReducer from './slices/subscriptionSlice';
import chatReducer from './slices/chatSlice';

// Auth slice specific persist config - only persist essential auth data
const authPersistConfig = {
  key: 'auth',
  storage: AsyncStorage,
  blacklist: ['registrationForm', 'loading', 'error', 'needsVerification', 'pendingVerificationEmail'], // Don't persist temporary data
};

// Profile slice specific persist config - persist profile data during completion flow
const profilePersistConfig = {
  key: 'profile',
  storage: AsyncStorage,
  blacklist: ['loading', 'error'], // Don't persist loading and error states
};

// Combine reducers with persisted auth and profile
// Chat: persist EDILMEZ — mesaj geçmişi büyük + AsyncStorage rehydrate latency yaratır.
// App açılışta SignalR + REST ile fresh state çekilir.
const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  profile: persistReducer(profilePersistConfig, profileReducer),
  swipe: swipeReducer,
  subscription: subscriptionReducer,
  chat: chatReducer,
});

// Root persist config
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['profile'], // Persist profile during profile completion flow
};

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        ignoredPaths: ['auth.registrationForm.dateOfBirth'], // Ignore Date object in registration form
      },
    }),
});

// Create persistor
export const persistor = persistStore(store);
