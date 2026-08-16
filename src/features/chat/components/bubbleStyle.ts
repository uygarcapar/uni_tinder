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

// Reaction kapsülünün ince siyah çerçevesi.
export const REACTION_CHIP_BORDER = {
  borderWidth: 0.5,
  borderColor: "#000000",
} as const;
