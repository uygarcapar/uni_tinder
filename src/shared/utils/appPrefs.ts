import { createMMKV } from 'react-native-mmkv';

/**
 * Küçük UI tercihleri/bayraklar için AYRI MMKV instance'ı (tutorial-görüldü
 * bayrakları vb.). Anahtarlar userId ile scope'lanır ve logout'ta BİLEREK
 * silinmez — aynı kullanıcı tekrar girdiğinde tutorial yeniden oynamaz.
 * chat-cache/redux-app instance'larından izole; onların purge akışları
 * buraya dokunmaz.
 *
 * Eski AsyncStorage bayrakları migrate edilmez (bilinçli): en kötü durumda
 * tutorial bir kez daha görünür.
 */
export const appPrefs = createMMKV({ id: 'app-prefs' });
