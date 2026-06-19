import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import profileReducer from '@/features/profile/profileSlice';
import swipeReducer from '@/features/discover/swipeSlice';
import subscriptionReducer from '@/features/profile/subscriptionSlice';
import chatReducer from '@/features/chat/chatSlice';

// Auth slice specific persist config - only persist essential auth data.
// registrationForm persist EDİLİR — kayıt akışında hata olursa veya app reload
// olursa kullanıcı girdiği bilgileri kaybetmesin (firstName, phone, dob vs).
// Success/logout durumunda zaten clearRegistrationForm dispatch ediliyor.
const authPersistConfig = {
  key: 'auth',
  storage: AsyncStorage,
  blacklist: ['loading', 'error', 'needsVerification', 'pendingVerificationEmail'],
};

// Profile slice specific persist config - persist profile data during completion flow
const profilePersistConfig = {
  key: 'profile',
  storage: AsyncStorage,
  blacklist: ['loading', 'error'],
};

// Chat: persist EDILMEZ — mesaj geçmişi büyük + AsyncStorage rehydrate latency yaratır.
// App açılışta SignalR + REST ile fresh state çekilir.
const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  profile: persistReducer(profilePersistConfig, profileReducer),
  swipe: swipeReducer,
  subscription: subscriptionReducer,
  chat: chatReducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['profile'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        ignoredPaths: ['auth.registrationForm.dateOfBirth'],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
