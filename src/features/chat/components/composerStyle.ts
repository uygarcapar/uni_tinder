import { Platform } from "react-native";

/**
 * Mesaj yazma çubuğunun görsel sabitleri — TEK KAYNAK.
 *
 * Çubuğun üstündeki yanıt önizlemesi (ReplyPreview mode="composing") birebir aynı
 * kaptan beslenir: aynı blur, aynı zemin, aynı padding, aynı yatay inset ve tam
 * yuvarlak köşe. Buradaki bir değeri değiştirmek İKİSİNİ birden değiştirir —
 * ayrışırlarsa iki kapsül farklı görünür.
 */
export const COMPOSER_BLUR_INTENSITY = 80;
export const COMPOSER_BLUR_TINT = (
  Platform.OS === "ios" ? "systemChromeMaterialDark" : "systemMaterialDark"
) as "systemChromeMaterialDark" | "systemMaterialDark";
export const COMPOSER_BAR_BG = "rgba(255,255,255,0.04)";
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
