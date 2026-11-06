import { queryClient } from "@/shared/queries/queryClient";
import { FEED_CODES, MODE_CODES } from "@/shared/constants/responseCodes";
import { feedKeys } from "./feedKeys";
import feedService from "./feedService";
import {
  markFeedFlagProbed,
  recordFeedFlag,
  shouldProbeFeedFlag,
} from "./feedFlag";

/**
 * Akış bayrağı AÇILMA yönü probe'u — boot ve foreground'un ORTAK girişi.
 *
 * `feedFlag.ts`'ten ayrı dosyada çünkü feedService'i çağırıyor ve feedService
 * feedFlag'i import ediyor (guard → markFeedDisabled) — aynı dosyada olsalar
 * döngü doğardı.
 *
 * ── Pencere yakma kuralı ────────────────────────────────────────────────────
 * `markFeedFlagProbed` yalnız BİLGİ taşıyan bir cevapta çağrılır: başarı ya da
 * tanınan bir UT kodu. Ağ hatası / 5xx / 401 bayrak hakkında hiçbir şey
 * söylemez; pencereyi yakmak bir dahaki foreground'un deneme hakkını gömerdi.
 * (Eski bug: işaret fetch'ten ÖNCE atılıyordu — uçakta açılan uygulama 6 saat
 * boyunca bir daha sormuyordu.)
 *
 * ── 403 ≠ kapalı ────────────────────────────────────────────────────────────
 * UT-7315 (profil tamamlanmamış), UT-7308 (kullanıcı kısıtlı) ve UT-7310
 * (başka kampüs Plus ister) kapıda TAKILAN bir kullanıcıya verilen cevaplar —
 * yani akış özelliği AÇIK ki kapı çalışıyor → latch'e "on" yazılır, sekme
 * açılır (kapının kendisi ekran içinde kendi boş durumunu gösterir).
 * Yalnız UT-7301 "özellik kapalı" demek; onu guard (feedService) zaten
 * latch'e yazıyor, burada sadece pencere yakılır.
 */

/** Akış AÇIK ama bu kullanıcı kapıda — bayrak için "on" kanıtı sayılan kodlar. */
const GATED_BUT_ENABLED: ReadonlySet<string> = new Set([
  FEED_CODES.PROFILE_INCOMPLETE, // UT-7315
  FEED_CODES.FEED_RESTRICTED, // UT-7308
  FEED_CODES.UNIVERSITY_REQUIRES_PLUS, // UT-7310
  // Akış Arkadaş'a özel (BE 2026-11-06): Arkadaş profili açılmamış kullanıcı
  // 403 UT-2304 yiyor. Mod kapısı çalışıyorsa özellik AÇIK demektir — UT-7301
  // ("özellik kapalı") ile karıştırma. Backend bazı uçları bu kod buraya
  // girene KADAR bilerek kapısız bıraktı (tasarım §A.9) — sıra bağlayıcı.
  MODE_CODES.MODE_NOT_OPENED, // UT-2304
]);

/** feedService > guard'ın hata şekli: zarf `response.data`da. Axios'un kendi
 *  `code`u (ERR_NETWORK vb.) UT-* uzayıyla çakışmaz, yedek olarak okunabilir. */
const codeOf = (e: any): string | null =>
  e?.response?.data?.code ?? e?.code ?? null;

/** Boot + foreground yarışında tek uçuş — fetchQuery'nin kendi tekilleştirmesi
 *  mock'lanabilir/ayarlanabilir olduğu için buradaki kapı ondan bağımsız. */
let inFlight: Promise<void> | null = null;

/**
 * Gerekliyse probe at. Hiç reject etmez; sekme görünürken ya da pencere
 * doluyken no-op (bkz. shouldProbeFeedFlag).
 */
export function probeFeedFlagIfDue(): Promise<void> {
  if (inFlight) return inFlight;
  if (!shouldProbeFeedFlag()) return Promise.resolve();
  inFlight = queryClient
    .fetchQuery({ queryKey: feedKeys.me, queryFn: () => feedService.getMe() })
    .then(
      () => {
        // `recordFeedFlag` diske yazar VE oturumu hemen açar — kullanıcı
        // restart beklemeden sekmeyi görür (canlı eklemenin güvenliği için
        // bkz. TabNavigator'daki Feed yorumu).
        recordFeedFlag(null, true);
        markFeedFlagProbed();
      },
      (e) => {
        const code = codeOf(e);
        if (code === FEED_CODES.DISABLED) {
          // "off" latch'ini guard yazdı; burada yalnız pencere yakılır.
          markFeedFlagProbed();
        } else if (code && GATED_BUT_ENABLED.has(code)) {
          recordFeedFlag(null, true);
          markFeedFlagProbed();
        }
        // Diğer her şey (ağ, 401, 5xx, tanınmayan kod): bilgi yok → pencere
        // yakılmaz, bir sonraki boot/foreground yeniden dener.
      },
    )
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
