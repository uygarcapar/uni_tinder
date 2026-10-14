import { appPrefs } from "@/shared/utils/appPrefs";
import { DEFAULT_APP_MODE, isAppMode, type AppMode } from "./modeTheme";

/**
 * Seçili uygulama modunun (Dating/Friends) oturumlar arası kalıcılığı
 * (MMKV, `app-prefs`).
 *
 * Şema/sürümleme deseni `feedPrefs.ts`ten. Anahtar userId ile scope'lu ve
 * logout'ta bilerek silinmiyor — aynı kullanıcı dönünce kaldığı modda açılsın.
 * Beğeniler ekranı da AYNI değeri okur (Keşif'le tek zihinsel model); yazan
 * tek yer Keşif'in mod seçicisi.
 *
 * ⚠️ ŞİFRELİ redux persist'e DEĞİL: o depo anahtarı Keychain'de ve anahtar
 * kaybında tamamı okunamaz oluyor (bkz. token-store wipe vakası). Mod tercihi
 * sır değil; kaybolmasının bedeli de yalnız "Dating'de açılmak".
 *
 * ── "Mod açık mı" BURADA DEĞİL ──────────────────────────────────────────────
 * Disk yalnız SON SEÇİMİ hatırlar. Kullanıcının o modun profilini açıp
 * açmadığı sunucunun bilgisidir (`modes: {dating, friends}`) ve her istekte
 * yeniden doğrulanır; diske yazılsaydı başka cihazda açılan profil burada
 * bayat "kapalı" görünürdü. Seçili mod sunucuda kapalıysa ekran CTA'ya düşer,
 * disk değeri DOKUNULMAZ — profil açılınca seçim yerinde bulunur.
 */

const KEY_PREFIX = "appMode:";
const SCHEMA_VERSION = 1;

interface StoredMode {
  v: number;
  mode: AppMode;
}

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

/**
 * Diskten oku. Yazılmamış / bozuk / eski şema / bilinmeyen değer →
 * `DEFAULT_APP_MODE` (Dating) — sunucunun "mode yok = Dating" kuralının
 * istemci aynası.
 */
export function loadAppMode(userId?: string | null): AppMode {
  if (!userId) return DEFAULT_APP_MODE;
  const raw = appPrefs.getString(keyFor(userId));
  if (!raw) return DEFAULT_APP_MODE;
  try {
    const parsed = JSON.parse(raw) as StoredMode;
    if (!parsed || parsed.v !== SCHEMA_VERSION) return DEFAULT_APP_MODE;
    // Bilinmeyen değer (eski sürüm / kurcalanmış disk) sorgu parametresine
    // girmemeli: sunucu 400 döndürür.
    return isAppMode(parsed.mode) ? parsed.mode : DEFAULT_APP_MODE;
  } catch {
    return DEFAULT_APP_MODE;
  }
}

export function saveAppMode(
  userId: string | null | undefined,
  mode: AppMode,
): void {
  if (!userId) return;
  const payload: StoredMode = { v: SCHEMA_VERSION, mode };
  try {
    appPrefs.set(keyFor(userId), JSON.stringify(payload));
  } catch {
    // Yazılamadıysa tercih bu oturumla sınırlı kalır — kozmetik.
  }
}
