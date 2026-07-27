import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * Token deposu — MMKV (senkron).
 *
 * NEDEN MMKV: Backend her refresh'te token'ı ROTATE ediyor. AsyncStorage yazımı
 * async olduğu için rotasyondan hemen sonra app kill edilirse taze refresh token
 * diske ulaşmıyor, sonraki soğuk açılış kullanılmış token'ı gönderiyor ve backend
 * reuse sayıp oturumu düşürüyordu. MMKV.set SENKRON → pencere tamamen kapalı.
 *
 * MIGRATION: Mevcut kullanıcıların token'ı AsyncStorage'da (ut_*). İlk erişimde
 * bir kez MMKV'ye kopyalanır, AsyncStorage'dan silinir (tek kaynak MMKV kalır),
 * 'ut_migrated' bayrağıyla sonraki açılışlarda AsyncStorage'a hiç bakılmaz.
 * Fonksiyon imzaları async KALDI — çağıran kod (api.ts, authSlice) değişmedi.
 *
 * Not: chat-cache'ten AYRI instance ('auth-tokens') — logout'taki clearChatCache
 * token dosyasına dokunmaz; token temizliği clearAllTokens ile ayrı yönetilir.
 */
/**
 * ŞİFRELEME: Token'lar diskte AES-256-şifreli MMKV'de durur; şifreleme anahtarı
 * Keychain/Keystore'da (expo-secure-store). Token'ların KENDİSİ SecureStore'a
 * konmaz: (1) MMKV.set senkron kalmalı (yukarıdaki rotasyon-yarışı kısıtı),
 * (2) JWT'ler iOS Keychain'in ~2KB pratik limitini aşabilir.
 *
 * Anahtar: 24 rastgele bayt → base64 (32 ASCII karakter = MMKV'nin AES-256
 * için istediği 32 baytlık string anahtar; 192-bit entropi).
 *
 * Migration: anahtar ilk kez üretildiğinde mevcut plaintext 'auth-tokens'
 * dosyası encrypt() ile YERİNDE şifrelenir — veri kaybı yok, kopya yok.
 * SecureStore erişilemezse (nadir Keychain arızası) plaintext'e düşülür ki
 * kullanıcılar oturumdan atılmasın; sonraki açılışta tekrar denenir.
 */
const ENC_KEY_NAME = 'ut_tokens_enc_key_v1';
// AFTER_FIRST_UNLOCK: FCM background handler kilitli-ekranda token'a erişebilsin.
const SECURE_OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } as const;

const createTokenStore = (): MMKV => {
  try {
    const existingKey = SecureStore.getItem(ENC_KEY_NAME, SECURE_OPTS);
    if (existingKey) {
      return createMMKV({ id: 'auth-tokens', encryptionKey: existingKey, encryptionType: 'AES-256' });
    }
    const bytes = Crypto.getRandomBytes(24);
    const newKey = btoa(String.fromCharCode(...bytes));
    SecureStore.setItem(ENC_KEY_NAME, newKey, SECURE_OPTS);
    const store = createMMKV({ id: 'auth-tokens' }); // mevcut plaintext dosyayı aç
    store.encrypt(newKey, 'AES-256'); // yerinde şifrele
    return store;
  } catch (error) {
    console.error('Token store encryption unavailable, falling back to plaintext:', error);
    return createMMKV({ id: 'auth-tokens' });
  }
};

const tokens = createTokenStore();

const REFRESH_TOKEN_KEY = 'ut_refresh_token';
const ACCESS_TOKEN_KEY = 'ut_access_token';
const MIGRATED_FLAG = 'ut_migrated';

let migrationPromise: Promise<void> | null = null;

const ensureMigrated = (): Promise<void> => {
  if (tokens.getBoolean(MIGRATED_FLAG)) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        for (const key of [REFRESH_TOKEN_KEY, ACCESS_TOKEN_KEY]) {
          if (!tokens.contains(key)) {
            const legacy = await AsyncStorage.getItem(key);
            if (legacy != null) tokens.set(key, legacy);
          }
          // Bayat kopya diriltmesin — legacy anahtarı her durumda temizle.
          AsyncStorage.removeItem(key).catch(() => {});
        }
        tokens.set(MIGRATED_FLAG, true);
      } catch (error) {
        // Migration başarısızsa bayrak YAZILMAZ — sonraki erişimde tekrar denenir.
        migrationPromise = null;
        console.error('Token migration error:', error);
      }
    })();
  }
  return migrationPromise;
};

export const saveRefreshToken = async (token: string): Promise<void> => {
  try {
    await ensureMigrated();
    tokens.set(REFRESH_TOKEN_KEY, token); // SENKRON — rotasyon anında diskte
  } catch (error) {
    console.error('Error saving refresh token:', error);
  }
};

export const getRefreshToken = async (): Promise<string | null> => {
  try {
    await ensureMigrated();
    return tokens.getString(REFRESH_TOKEN_KEY) ?? null;
  } catch (error) {
    console.error('Error getting refresh token:', error);
    return null;
  }
};

export const removeRefreshToken = async (): Promise<void> => {
  try {
    await ensureMigrated();
    tokens.remove(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error removing refresh token:', error);
  }
};

export const saveAccessToken = async (token: string): Promise<void> => {
  try {
    await ensureMigrated();
    tokens.set(ACCESS_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving access token:', error);
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  try {
    await ensureMigrated();
    return tokens.getString(ACCESS_TOKEN_KEY) ?? null;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
};

export const removeAccessToken = async (): Promise<void> => {
  try {
    await ensureMigrated();
    tokens.remove(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Error removing access token:', error);
  }
};

export const clearAllTokens = async (): Promise<void> => {
  try {
    await ensureMigrated();
    tokens.remove(REFRESH_TOKEN_KEY);
    tokens.remove(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
};
