/**
 * Balon geometrisi — TEK KAYNAK. Üç yer bu sabitlerden beslenir ve ayrışırlarsa
 * görünür bug üretirler:
 *   • MessageBubble   — gerçek balon
 *   • MessageActionSheet — uzun-bas menüsündeki klon (ayrışırsa balon zıplar)
 *   • ReplyPreview    — balonun üstündeki alıntı kartı (balonla aynı kesim)
 *
 * NEDEN AYRI DOSYA: MessageBubble zaten ReplyPreview'i import ediyor; sabitler
 * MessageBubble'da kalsaydı ReplyPreview'in onları alması döngüsel import
 * (+ TDZ'de undefined sabit) demek olurdu.
 */

import { Dimensions } from "react-native";
import { colors } from "@/shared/theme/colors";

/**
 * Balonun tavan genişliği. Satırlar liste genişliğinde (ekran + REVEAL_MAX) ama
 * oran EKRANA göre hesaplanır, yoksa reveal şeridi de sayılıp balon fazla geniş
 * olurdu. VoiceBubble dalga formu çubuk sayısını buradan türetiyor — sabit
 * kopyalanırsa dar cihazlarda çubuklar balondan taşar.
 */
export const BUBBLE_MAX_WIDTH = Math.round(Dimensions.get("window").width * 0.6);

// Balon köşe yarıçapı.
export const BUBBLE_RADIUS = 24;
// GÖNDEREN tarafın köşesi daralır: balonda ÜST köşe (kendi mesajımda sağ üst,
// karşı tarafınkinde sol üst), alıntı kartında bunun ayna görüntüsü olan ALT
// köşe. Konuşma yönünü belli eden köşe işareti.
export const BUBBLE_TIGHT_RADIUS = 5;

export function bubbleCorners(isOwn: boolean) {
  return isOwn
    ? { borderRadius: BUBBLE_RADIUS, borderTopRightRadius: BUBBLE_TIGHT_RADIUS }
    : { borderRadius: BUBBLE_RADIUS, borderTopLeftRadius: BUBBLE_TIGHT_RADIUS };
}

// Balonun iç boşluğu.
export const BUBBLE_PAD_H = 14;
export const BUBBLE_PAD_V = 12;

/**
 * Reaction kapsülünün balondan "kesilmiş" görünmesini sağlayan ince çerçeve:
 * rengi balonun ARKASINDAKİ zemin, yani sayfa zemini.
 *
 * FONKSIYON, sabit DEĞİL — modül seviyesinde değerlenirse tema değişince bayat
 * kalır (bkz. shared/theme/colors.ts mutasyon sözleşmesi).
 */
export const reactionChipBorder = () => ({
  borderWidth: 0.5,
  borderColor: colors.bg,
});
