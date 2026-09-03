import profileService from "@/features/profile/profileService";
import { queryClient } from "@/shared/queries/queryClient";
import { bustStaticCache } from "@/shared/services/staticCache";
import { swipeKeys } from "@/features/discover/swipeKeys";

/**
 * Sunucudaki dil tercihini (`profile.language`) istemcinin çözülmüş diline
 * eşitler.
 *
 * NEDEN GEREKLİ: backend'in dil önceliği `Accept-Language` DEĞİL —
 *
 *   1) DB'deki `profile.language`   ← giriş yapmışsa BUNU kullanır
 *   2) Accept-Language
 *   3) "tr"
 *
 * Yani oturum açık kullanıcıda header'ı "en" göndermek hiçbir şeyi değiştirmez.
 * Kartlardaki tek dilli `*Display` alanları (üniversite adı, bölüm, burç…) hep
 * DB'deki tercihe göre üretiliyor: tercih arayüzden ayrışırsa kart Türkçe
 * arayüzde İngilizce üniversite adı gösterir.
 *
 * Ayrışma bir hata değil, normal bir durum: dil tercihi CİHAZDA tutuluyor
 * ("system" seçeneği backend'de temsil edilemiyor) ve sunucuya yalnız Ayarlar'da
 * elle değiştirilince yazılıyor. Yeni cihazda kurulum, ağ hatasıyla düşen
 * Ayarlar isteği ya da iOS'ta sistem dilinin değişmesi → sunucu eski dilde kalır.
 * Bu yüzden yön TEK: doğru olan istemcinin gösterdiği dildir, sunucuya o yazılır
 * (sunucudan okuyup uygulamanın dilini değiştirmek "system" tercihini ezerdi).
 *
 * Token yenilenmiyor: claim'deki dil bir sonraki normal yenilemede zaten
 * güncelleniyor, açılışta oturuma dokunmaya değmez.
 */

const normalize = (raw: unknown): string =>
  typeof raw === "string" ? raw.trim().toLowerCase().split("-")[0] : "";

/**
 * Sunucuda olduğuna İNANDIĞIMIZ dil. `getMyProfile` TTL'li, dolayısıyla yazma
 * ile okuma arasında bayat cevap dönebiliyor; ayrıca alan beklenmedik bir adla
 * gelirse (`language` hep boş okunursa) bu latch her açılışta boş yere istek
 * atılmasını engelliyor. Ayarlar'daki elle değişiklik de buraya yazıyor
 * (`noteServerLanguage`), yoksa inancımız gerçeğin gerisinde kalırdı.
 */
let serverBelief: string | null = null;
let inFlight = false;

/** Ayarlar ekranı dili sunucuya kendisi yazıyor — sonucu buraya bildirir.
 *  `null` = yazma başarısız, inancı düşür ki açılışta yeniden denensin. */
export function noteServerLanguage(lang: string | null): void {
  serverBelief = lang;
}

/**
 * @param profile `GetMyProfile` yanıtı (`language` alanı okunur).
 * @param local   İstemcinin ÇÖZÜLMÜŞ dili ("tr"/"en") — çağıran taraftan
 *   geçiliyor, store bu modülden okunmuyor: Ayarlar ekranı da bu dosyayı
 *   import ediyor ve modül seviyesinde store'a bağlanmak koca bir yükleme
 *   zincirini (persist + tüm slice'lar) o ekrana bağlardı.
 */
export async function reconcileServerLanguage(
  profile: any,
  local: unknown,
): Promise<void> {
  if (local !== "tr" && local !== "en") return;
  const server = normalize(profile?.language);
  // `server` boş = kullanıcı hiç seçmemiş; o durumda da yazıyoruz ki sunucunun
  // ürettiği metinler (push, e-posta) varsayılan "tr"ye düşmesin.
  if (server === local || serverBelief === local) return;
  if (inFlight) return;
  inFlight = true;
  try {
    await profileService.updateProfile({ Language: local });
    serverBelief = local;
    // Sunucu bu ana kadar YANLIŞ dilde `*Display` üretmiş olabilir; dil
    // değişiminin kendisinde yaptığımızın aynısı (bkz. App.tsx LanguageSyncer).
    bustStaticCache();
    queryClient.invalidateQueries({ queryKey: ["common"] });
    queryClient.invalidateQueries({ queryKey: swipeKeys.matches });
  } catch {
    // Sessiz: açılışta ağ hatası kullanıcıya gösterilecek bir şey değil,
    // sonraki açılışta yeniden denenir.
  } finally {
    inFlight = false;
  }
}

/** Oturum kapanınca sıfırla — sonraki kullanıcının tercihi ayrı. */
export function resetServerLanguageSync(): void {
  serverBelief = null;
}
