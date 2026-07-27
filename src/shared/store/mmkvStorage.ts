import { createMMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from 'redux-persist';

/**
 * Chat cache için AYRI MMKV instance'ı: kendi dosyasında yaşar ('chat-cache'),
 * logout'ta clearAll() ile izole silinir — auth/profile/settings'in (AsyncStorage)
 * ya da ileride açılacak başka MMKV instance'larının yanına dokunmaz.
 *
 * MMKV senkron çalışır (~ms okuma) — store'daki eski "AsyncStorage rehydrate
 * latency" itirazı bu yüzden chat için geçerli değil.
 */
export const chatCacheStorage = createMMKV({ id: 'chat-cache' });

// redux-persist Storage arayüzü Promise bekler; MMKV senkron olduğu için
// çağrıları resolve edilmiş Promise'lerle sarmak yeterli.
export const reduxMmkvChatStorage: Storage = {
  setItem: (key, value) => {
    chatCacheStorage.set(key, value);
    return Promise.resolve(true);
  },
  getItem: (key) => Promise.resolve(chatCacheStorage.getString(key) ?? null),
  removeItem: (key) => {
    chatCacheStorage.remove(key); // v4: delete() → remove()
    return Promise.resolve();
  },
};

/**
 * Logout/ForceLogout choke-point'inde SENKRON purge. redux-persist'in 1.5sn
 * throttle penceresi yüzünden şart: resetChat() sonrası app hemen kill edilirse
 * throttled write hiç flush olmaz ve önceki kullanıcının mesajları diskte kalırdı.
 * resetChat()'TEN SONRA çağır — geç flush olan pending write zaten boşaltılmış
 * state'i yazar, bayat veri diriltemez.
 */
export const clearChatCache = () => chatCacheStorage.clearAll();

/**
 * auth/profile/settings/root persist'i için MMKV ('redux-app' instance'ı).
 * AsyncStorage'dan geçiş: getItem MMKV'de bulamazsa eski AsyncStorage
 * 'persist:*' anahtarını BİR KEZ okuyup MMKV'ye kopyalar ve legacy'yi siler —
 * rehydrate her anahtarı boot'ta bir kez okuduğu için migration kendiliğinden
 * tamamlanır. MMKV yazımı senkron olduğundan registrationForm/settings artık
 * "kill-mid-write" kaybı yaşamaz (token rotasyonundaki sınıfla aynı bug).
 * Legacy fallback en az 2 sürüm kalmalı; sonra AsyncStorage bağımlılığıyla
 * birlikte sökülebilir.
 */
const appStorage = createMMKV({ id: 'redux-app' });

export const reduxMmkvAppStorage: Storage = {
  setItem: (key, value) => {
    appStorage.set(key, value);
    return Promise.resolve(true);
  },
  getItem: async (key) => {
    const current = appStorage.getString(key);
    if (current != null) return current;
    try {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        appStorage.set(key, legacy);
        AsyncStorage.removeItem(key).catch(() => {});
      }
      return legacy;
    } catch {
      return null;
    }
  },
  removeItem: (key) => {
    appStorage.remove(key);
    return Promise.resolve();
  },
};
