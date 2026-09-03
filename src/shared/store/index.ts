import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import profileReducer from '@/features/profile/profileSlice';
import swipeReducer from '@/features/discover/swipeSlice';
import subscriptionReducer from '@/features/profile/subscriptionSlice';
import { premiumSnapshotMiddleware } from '@/features/profile/premiumSnapshot';
import chatReducer from '@/features/chat/chatSlice';
import settingsReducer from './settingsSlice';
import { reduxMmkvChatStorage, reduxMmkvAppStorage } from './mmkvStorage';
import { chatCacheTransform } from './chatPersistTransform';

// Auth slice specific persist config - only persist essential auth data.
// registrationForm persist EDİLİR — kayıt akışında hata olursa veya app reload
// olursa kullanıcı girdiği bilgileri kaybetmesin (firstName, phone, dob vs).
// Success/logout durumunda zaten clearRegistrationForm dispatch ediliyor.
//
// refreshToken persist EDİLMEZ — tek kaynak tokenStorage'daki (MMKV) `ut_refresh_token`.
// Backend her refresh'te token'ı rotate ediyor; api.ts rotasyondan hemen sonra
// `ut_refresh_token`'ı yazıyor ama redux-persist'in flush'ı asenkron. İki kopya
// tutulduğunda app rotasyon ile flush arasında öldürülürse soğuk açılışta bayat
// kopya rehydrate olup taze token'ı eziyor, sonraki refresh kullanılmış token
// gönderiyor ve backend bunu revoke/reuse sayıp oturumu kapatıyordu.
//
// accountBlock persist EDİLMEZ — kalıcı ban ekranının çıkışı yok (bilinçli:
// kullanıcı tekrar deneyip yine 403 yemesin). Persist edilseydi hesap unban
// edildikten sonra bile ekran diskten geri gelir, kullanıcı login'e hiç
// ulaşamazdı. Restart'ta login'e düşülür; hesap hâlâ yaptırımlıysa ilk 403
// ekranı yeniden açar (sunucu otoritesi, istemci hafızası değil).
const authPersistConfig = {
  key: 'auth',
  storage: reduxMmkvAppStorage,
  blacklist: [
    'loading',
    'error',
    'needsVerification',
    'pendingVerificationEmail',
    'refreshToken',
    'accountBlock',
  ],
};

// Profile slice specific persist config - persist profile data during completion flow
const profilePersistConfig = {
  key: 'profile',
  storage: reduxMmkvAppStorage,
  blacklist: ['loading', 'error'],
};

const settingsPersistConfig = {
  key: 'settings',
  storage: reduxMmkvAppStorage,
};

// Chat: MMKV'ye KISMİ persist (local-first cache) — cold-start'ta Messages +
// son mesajlar anında, offline okuma, boot'taki 15× history prefetch'in yerini
// disk alır. MMKV senkron olduğu için eski "AsyncStorage rehydrate latency"
// itirazı geçerli değil. Yalnız conversations + cap'li messagesByConv +
// unreadTotal yazılır; typing/presence/quota/activeConversationId BİLEREK
// persist edilmez (realtime/monetizasyon-hassas — restart'ta taze çekilir).
// Server authoritative kalır: sohbet açılışında reconcile fetch bucket'ı tazeler.
// Kill-switch: false → chat eski (volatile in-memory) davranışa döner.
export const CHAT_PERSIST_ENABLED = true;

const chatPersistConfig = {
  key: 'chat',
  storage: reduxMmkvChatStorage,
  version: 1, // şema değişiminde bump + migrate=drop (cache server'dan yeniden kurulur)
  whitelist: ['conversations', 'messagesByConv', 'unreadTotal'],
  transforms: [chatCacheTransform],
  // Sıcak yazımları (her mesaj/receipt) coalesce et — JS-thread stringify'ı boğmasın.
  throttle: 1500,
};

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  profile: persistReducer(profilePersistConfig, profileReducer),
  swipe: swipeReducer,
  subscription: subscriptionReducer,
  chat: CHAT_PERSIST_ENABLED
    ? persistReducer(chatPersistConfig, chatReducer)
    : chatReducer,
  settings: persistReducer(settingsPersistConfig, settingsReducer),
});

const persistConfig = {
  key: 'root',
  storage: reduxMmkvAppStorage,
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
      // `subscription` slice'ı persist EDİLMİYOR (yukarıdaki whitelist) ama son
      // KANONİK premium cevabının kopyası internetsiz açılış için diske ayrılır.
      // Reducer'a değil middleware'e bağlı: `applyStatus`'a yazan dört yol var
      // (status/hub/sync/reconcile) ve hepsi tek noktadan aynalanmalı.
      // Bkz. features/profile/premiumSnapshot.
    }).concat(premiumSnapshotMiddleware),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
