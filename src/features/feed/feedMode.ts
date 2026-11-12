import uiBus from "@/shared/services/uiBus";
import { APP_MODE_EVENT, readAppModeFor } from "@/features/discover/useAppMode";
import {
  isEnabledAppMode,
  type AppMode,
} from "@/features/discover/modeTheme";

/**
 * Akış hangi MODDA var — Arkadaş'a özel (2026-11-05 ürün kararı).
 *
 * ── Neden feedFlag'e KONMADI ────────────────────────────────────────────────
 * Latch (`feedFlag`, UT-7301) "backend'de bu özellik açık mı" sorusunu
 * cevaplıyor ve cevabı DİSKE yazıyor; kapanma yönü de cold start'a kadar
 * yapışıyor (o dosyanın geçiş kuralı). Mod ise kullanıcının oturum içinde ileri
 * geri çevirdiği bir anahtar. İkisi aynı değere yazsaydı Flört'te geçirilen bir
 * oturum özelliği kalıcı olarak "kapalı" damgalar, Arkadaş'a dönüldüğünde de
 * akış gelmezdi. İki kapı AYRI; sekme ikisini birden geçtiğinde çiziliyor.
 *
 * ── Neden bir oturum AYNASI var ─────────────────────────────────────────────
 * Ekranlar modu `useAppMode()` ile okuyor ve TabNavigator da öyle yapıyor —
 * oraya ayna gerekmiyor. Ama `openFeed` bir bildirim dokunuşundan çağrılıyor:
 * hook yok, kullanıcı kimliği elde yok, mod tercihi ise MMKV'de kullanıcı
 * bazlı anahtarda duruyor. Bu yüzden değer açılışta BİR KEZ tohumlanıyor
 * (AppNavigator, `initFeedFlag`in yanında) ve sonra mod olayıyla güncel
 * kalıyor — `feedFlag`in oturum değeriyle birebir aynı kalıp.
 */

/** Akışın yaşadığı mod. Tek yerde, çünkü üç kapı birden buna bakıyor. */
export const FEED_MODE: AppMode = "Friends";

/**
 * Saf kapı — çağıran modu zaten biliyorsa (TabNavigator `useAppMode` ile
 * okuyor) aynaya hiç dokunmadan sorabilsin.
 *
 * ⚠️ BEYAZ LİSTE: `!== "Dating"` DEĞİL `=== "Friends"`. Bayat diskten ya da
 * kurcalanmış bir payload'dan gelen bilinmeyen değer "göster" tarafına
 * düşmemeli; üstelik ileride üçüncü bir mod eklenirse kara liste onu sessizce
 * akışa sokardı.
 */
export function feedAllowedInMode(mode: unknown): boolean {
  return mode === FEED_MODE;
}

/**
 * Oturumun modu. Tohumlanmadan önce `null` — yani kapalı. "Bilmiyorsak gizli
 * taraf doğru", latch'in `unknown → kapalı` kuralının aynısı: olmayan bir
 * sekmeye yönlendirmek ölü dokunuş üretir. (Eskiden bu boşluğu varsayılan
 * Flört dolduruyordu; varsayılan artık Arkadaş, o yüzden açık bir `null`.)
 */
let sessionMode: AppMode | null = null;

/** Açılışta (auth çözüldükten sonra) bir kez — bkz. AppNavigator. */
export function initFeedMode(userId?: string | null): void {
  sessionMode = readAppModeFor(userId);
}

/** Çıkışta — sonraki kullanıcının oturumuna önceki modun sızmaması için. */
export function resetFeedModeSession(): void {
  sessionMode = null;
}

// Mod oturum içinde değişiyor (Keşif başlığı, Profil avatarı, bildirim/toast
// mod devri). Abonelik modül seviyesinde ve hiç çözülmüyor: ayna bir
// singleton, uygulama ayakta olduğu sürece güncel kalması gerekiyor.
uiBus.on(APP_MODE_EVENT, (payload: any) => {
  // Kurcalanmış/bilinmeyen değer aynayı bozmasın (useAppMode'daki aynı kapı).
  if (isEnabledAppMode(payload?.mode)) sessionMode = payload.mode;
});

/** Hook'suz yollar için (feedEntry > openFeed). */
export function feedAllowedForSession(): boolean {
  return feedAllowedInMode(sessionMode);
}
