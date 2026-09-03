import { colors, ink, isLight, veil, withAlpha } from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

/**
 * Mesaj yazma çubuğunun görsel sabitleri — TEK KAYNAK.
 *
 * Çubuğun üstündeki yanıt önizlemesi (ReplyPreview mode="composing") birebir aynı
 * kaptan beslenir: aynı blur, aynı zemin, aynı padding, aynı yatay inset ve tam
 * yuvarlak köşe. Buradaki bir değeri değiştirmek İKİSİNİ birden değiştirir —
 * ayrışırlarsa iki kapsül farklı görünür.
 *
 * Kapsülün ZEMİNİ iki yoldan biriyle çiziliyor (bkz. MessageComposer >
 * ComposerSurface): cihazda liquid glass varsa native cam (`GlassView`), yoksa
 * buradaki blur + `composerBarBg()` dolgusu. Aşağıdaki blur/dolgu/kenarlık
 * değerleri YALNIZ ikinci yolu ilgilendirir; cam yolunun tek ayar kolu
 * `composerGlassTint()`.
 */
export const COMPOSER_BLUR_INTENSITY = 80;
/**
 * FONKSIYON, sabit DEĞİL: temaya bağlılar ve modül seviyesinde değerlenirlerse
 * tema değişince bayat kalırlar (bkz. theme/colors.ts mutasyon sözleşmesi).
 * Render içinde çağır.
 */
export const composerBlurTint = chromeBlurTint;
/**
 * Kapsül zemini: cam'ın üstüne çekilen perde. Kenarı `composerBarBorder()`
 * ile birlikte tanımlıyor.
 *
 * İki modda İKİ FARKLI malzeme, bilerek:
 *
 *  • Koyu modda `veil()` — perde moda uyar, yani blur'u karartır. `ink()`
 *    (modun TERSİ, koyuda beyaz) kapsülü açıyordu.
 *  • Açık modda `ink()` — yani hafif SİYAH. Beyaz üstüne beyaz perde çekmek
 *    (eski `veil`) kapsülü sayfa zemininden ayırmıyordu; sistem malzemesi de
 *    açık modda zaten beyaza yakın. Kapsül artık gri bir kart gibi ayrışıyor.
 *    Alfa düşük tutuldu: yazı açık modda SİYAH, zemin koyulaştıkça okunurluk
 *    düşer.
 */
export const composerBarBg = () => (isLight() ? ink(0.09) : veil(0.18));

/**
 * Native camın tint'i — DOLGU DEĞİL, camın kendi rengine verilen hafif eğim.
 *
 * Cam yolunda kapsüle dolgu ya da kenarlık EKLENMEZ (ikisi de kırılmayı öldürüp
 * kapsülü düz bir dikdörtgene çeviriyor — aynı sözleşme: ToastShell,
 * MessageActionSheet > PanelSurface). Kapsül sohbetin, yani fotoğraflı/renkli
 * balonların üstünde duruyor; sıfır tint'te placeholder yıkanıyor, yüksek alfada
 * cam opak bir çubuğa dönüp efekti siliyor. Kontrast sorununu BURADAN çöz.
 *
 * FONKSIYON, sabit DEĞİL: palet tema değişiminde mutasyona uğruyor.
 */
export const composerGlassTint = () =>
  isLight() ? withAlpha(colors.surface, 0.2) : withAlpha(colors.bg, 0.2);

/**
 * Kapsülün ince gri çerçevesi — yazma çubuğu, yanıt önizlemesi ve kayıt
 * aksiyon sırası, üçü de aynı kenarı taşısın.
 *
 * KAPSÜLÜN KENDİSİNE DEĞİL, ÜSTÜNE serilen bir katmana veriliyor. Sebebi
 * köşelerde görünüyordu: kapsül bir BlurView ve köşe yuvarlatması ancak
 * `overflow: hidden` ile çalışıyor, o da (masksToBounds) çerçevenin kendisini
 * kırpıyor — kenarda çizginin dışta kalan yarısı siliniyor, yaylarda ise
 * kenar yumuşatmasıyla birlikte düzensiz/kopuk görünüyordu. Kırpılmayan ayrı
 * bir katmanda çizgi tam kalınlığında ve köşede sürekli çıkıyor.
 *
 * `StyleSheet.hairlineWidth` DEĞİL sabit 0.5: hairline 3x cihazlarda 0.33pt'ye
 * düşüyor ve çizgi zeminden ayırt edilemiyor. Renk `hairline` (modun tersi,
 * %10) — kalınlaşması gerekirse `hairlineStrong` tek adım yukarısı.
 *
 * FONKSIYON, sabit DEĞİL: renk temayla mutasyona uğruyor (bkz. dosya başı).
 */
export const COMPOSER_BAR_BORDER_W = 0.5;
export const composerBarBorderOverlay = (radius: number) =>
  ({
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius,
    borderWidth: COMPOSER_BAR_BORDER_W,
    borderColor: colors.hairline,
  }) as const;
// Kapsülün İÇ boşluğu (input'ta paddingLeft/Right 8 + paddingVertical 8).
export const COMPOSER_BAR_PAD_H = 8;
export const COMPOSER_BAR_PAD_V = 8;
// Kapsülün iki ucundaki aksiyon kutularının genişliği (input'ta + ve gönder
// butonları) ve aralarındaki boşluk. Yanıt önizlemesindeki yanıt/X ikonları AYNI
// genişlikte kutulara oturur → dört ikon da aynı iki dikey eksende hizalanır ve
// yanıt metni input metniyle aynı x'ten başlar.
export const COMPOSER_ACTION_W = 33;
export const COMPOSER_BAR_GAP = 8;
// Kapsüllerin ekran kenarından yatay içeriliği (composer sarmalayıcısındaki px-3).
export const COMPOSER_INSET_H = 12;
/**
 * Dikey nefes: composer sarmalayıcısının py-2'si. Klavye açıkken input ile klavye
 * ARASINDAKİ boşluk tam olarak budur (KeyboardStickyView offset'i safe-area'yı
 * götürüyor, geriye bu padding kalıyor) — yanıt önizlemesi ile input arasındaki
 * boşluk da aynı olsun diye ReplyPreview'in marginBottom'ı bu değerdir.
 */
export const COMPOSER_GAP = 8;
