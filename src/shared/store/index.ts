import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import { combineReducers } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import profileReducer from '@/features/profile/profileSlice';
import swipeReducer from '@/features/discover/swipeSlice';
import subscriptionReducer from '@/features/profile/subscriptionSlice';
import { premiumSnapshotMiddleware } from '@/features/profile/premiumSnapshot';
import chatReducer from '@/features/chat/chatSlice';
import {
  chatMirrorMiddleware,
  startChatMirror,
} from '@/features/chat/chatMirrorMiddleware';
import settingsReducer from './settingsSlice';
import { reduxMmkvChatStorage, reduxMmkvAppStorage } from './mmkvStorage';
import { chatCacheTransform } from './chatPersistTransform';
import { CHAT_PERSIST_ENABLED, CHAT_SQLITE_ENABLED } from './chatFlags';

// Geriye dönük uyum: bayraklar eskiden bu modülden export ediliyordu.
export { CHAT_PERSIST_ENABLED, CHAT_SQLITE_ENABLED };

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

// Chat artık SQLite'tan okunuyor (local-first). Aşağıdaki redux-persist yolu
// yalnızca ROLLBACK HEDEFİ olarak bir release boyunca duruyor:
// CHAT_SQLITE_ENABLED=false + CHAT_PERSIST_ENABLED=true eski davranışa tam
// dönüş demek ve `persist:chat` blob'u diskte hâlâ yerinde (bkz.
// features/chat/db/importLegacyCache.ts — import blob'u SİLMİYOR).
// Bayraklar ./chatFlags'te: chat tarafı da onları okuyor ve store zaten
// chatSlice'ı import ettiği için burada dursalar döngü olurdu.
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
      // chatMirrorMiddleware: chat action'larını SQLite'a AYNALAR (dual-write).
      // Reducer'a değil middleware'e bağlı, çünkü realtime yolu
      // (AppNavigator'daki SignalR handler'ları) yalnız dispatch üzerinden
      // görülebiliyor — o dosyaya dokunmadan tüm yazımları yakalamanın tek yolu.
      // Faz 2'de gölge: Redux hâlâ tek gerçek, ayna hatası yutuluyor.
    }).concat(premiumSnapshotMiddleware, chatMirrorMiddleware),
});

// DB'yi aç + eski MMKV blob'unu taşı. Store kurulduktan SONRA çağrılmalı
// (middleware o ana kadar zaten no-op) ve React mount'undan önce: outbox
// drain'i ve sohbet açılışındaki senkron hydrate okuması DB'yi hazır bekliyor.
startChatMirror(store);

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
