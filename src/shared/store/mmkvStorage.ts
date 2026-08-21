import { createMMKV, type MMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
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
 * ŞİFRELEME: Bu dosya kayıt sihirbazının `registrationForm`'unu tutuyor ve
 * içinde kullanıcının ŞİFRESİ var (kayıt bitene kadar; POST'ta lazım). Düz
 * metin MMKV, iOS sandbox'ına güveniyordu — yedekten çıkarma/jailbreak
 * senaryolarında okunabilir. Anahtar Keychain/Keystore'da (expo-secure-store),
 * veri AES-256 ile diskte şifreli. Deseni tokenStorage.ts'ten birebir alıyor;
 * oradaki gerekçeler (senkron kalması şart, veri SecureStore'a KONMAZ) aynen
 * geçerli.
 *
 * Migration: anahtar ilk üretildiğinde mevcut plaintext 'redux-app' dosyası
 * encrypt() ile YERİNDE şifrelenir — oturum, ayarlar ve yarım kayıt taslağı
 * korunur, kopya çıkmaz.
 *
 * Bilinen (mikrosaniyelik) pencere: anahtar SecureStore'a yazıldıktan sonra
 * encrypt() çalışmadan app öldürülürse, sonraki açılış plaintext dosyayı
 * anahtarla açmaya çalışır ve MMKV içeriği atar → kullanıcı login'e düşer
 * (token'lar ayrı instance'ta, onlar da aynı deseni kullanıyor). İki senkron
 * native çağrı arası olduğu için pratikte gözlenmedi; MMKV dosyanın şifreli
 * olup olmadığını dışarı vermediği için kapatmanın ucuz bir yolu yok.
 */
const APP_ENC_KEY_NAME = 'ut_app_enc_key_v1';
const SECURE_OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } as const;

const createAppStore = (): MMKV => {
  try {
    const existingKey = SecureStore.getItem(APP_ENC_KEY_NAME, SECURE_OPTS);
    if (existingKey) {
      return createMMKV({
        id: 'redux-app',
        encryptionKey: existingKey,
        encryptionType: 'AES-256',
      });
    }
    // 24 rastgele bayt → base64 = 32 ASCII karakter (AES-256'nın istediği
    // 32 baytlık anahtar, 192-bit entropi).
    const bytes = Crypto.getRandomBytes(24);
    const newKey = btoa(String.fromCharCode(...bytes));
    SecureStore.setItem(APP_ENC_KEY_NAME, newKey, SECURE_OPTS);
    const store = createMMKV({ id: 'redux-app' }); // mevcut plaintext dosyayı aç
    store.encrypt(newKey, 'AES-256'); // yerinde şifrele
    return store;
  } catch (error) {
    // Keychain erişilemedi (nadir arıza / ilk kilit açılmadan arka plan
    // başlatması). tokenStorage plaintext'e düşüyor; BURADA düşemeyiz: dosya
    // şifreliyse anahtarsız açmak MMKV'ye içeriği attırır, yani oturum +
    // ayarlar + yarım kayıt gider. Onun yerine bu açılışa özel ayrı bir
    // dosyaya düşüyoruz — gerçek dosyaya DOKUNULMUYOR, sonraki normal
    // açılışta her şey yerinde. Baştaki clearAll, degrade oturumun verisinin
    // diskte birikmesini önler.
    console.error('App store encryption unavailable, using scratch store:', error);
    const scratch = createMMKV({ id: 'redux-app-degraded' });
    scratch.clearAll();
    return scratch;
  }
};

/**
 * auth/profile/settings/root persist'i için MMKV ('redux-app' instance'ı).
 * AsyncStorage'dan geçiş: getItem MMKV'de bulamazsa eski AsyncStorage
 * 'persist:*' anahtarını BİR KEZ okuyup MMKV'ye kopyalar ve legacy'yi siler —
 * rehydrate her anahtarı boot'ta bir kez okuduğu için migration kendiliğinden
 * tamamlanır. MMKV yazımı senkron olduğundan registrationForm/settings artık
 * "kill-mid-write" kaybı yaşamaz (token rotasyonundaki sınıfla aynı bug).
 * Legacy fallback en az 2 sürüm kalmalı; sonra AsyncStorage bağımlılığıyla
 * birlikte sökülebilir.
 *
 * DİKKAT: legacy kopyalama plaintext AsyncStorage'dan okuyor; şifreli MMKV'ye
 * yazıp legacy'yi sildiği için eski düz metin kopya ilk okumada kayboluyor.
 */
const appStorage = createAppStore();

/**
 * redux-persist dışındaki küçük, senkron app-level KV ihtiyaçları için aynı
 * instance (konum heartbeat debounce'u gibi). Anahtarlarını 'persist:' önekiyle
 * ÇAKIŞTIRMA — rehydrate her 'persist:*' anahtarını okumaya çalışır.
 */
export const appKv = appStorage;

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
