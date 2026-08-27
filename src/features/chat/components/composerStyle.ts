import { veil } from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

/**
 * Mesaj yazma çubuğunun görsel sabitleri — TEK KAYNAK.
 *
 * Çubuğun üstündeki yanıt önizlemesi (ReplyPreview mode="composing") birebir aynı
 * kaptan beslenir: aynı blur, aynı zemin, aynı padding, aynı yatay inset ve tam
 * yuvarlak köşe. Buradaki bir değeri değiştirmek İKİSİNİ birden değiştirir —
 * ayrışırlarsa iki kapsül farklı görünür.
 */
export const COMPOSER_BLUR_INTENSITY = 80;
/**
 * FONKSIYON, sabit DEĞİL: temaya bağlılar ve modül seviyesinde değerlenirlerse
 * tema değişince bayat kalırlar (bkz. theme/colors.ts mutasyon sözleşmesi).
 * Render içinde çağır.
 */
export const composerBlurTint = chromeBlurTint;
/**
 * Kapsül zemini: cam'ın üstüne çekilen perde. `ink()` DEĞİL `veil()` —
 * mürekkep modun TERSİ (koyuda beyaz) olduğu için kapsülü açıyordu; perde moda
 * UYAR, yani koyu temada blur'u karartır (açık temada beyazlatır, o modun
 * karşılığı bu). Kapsülün kenarı bu koyulaşmayla belli olur; ayrı bir border
 * DENENDİ ve kaldırıldı.
 */
export const composerBarBg = () => veil(0.18);
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
