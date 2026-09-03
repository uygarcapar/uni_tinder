import { Check, Heart, RotateCcw, MessageCircle } from '@/shared/icons';
import SFIcon from '../SFIcon';
import SuperLikeGlyph from '../SuperLikeGlyph';
import NoteGlyph from '../NoteGlyph';
import PremiumFlame from '../PremiumFlame';
import { colors, gradients, ink, isLight } from '../../theme/colors';

/**
 * Toast'ların solundaki ÜRÜN simgesi — hangi ürün hakkında konuşulduğu metni
 * okumadan anlaşılsın diye ("kredin yüklendi" tek başına hangi kredi olduğunu
 * söylemiyordu).
 *
 * SuperLike ve not, uygulama ikonundan sökülen KENDİ glyph'lerini kullanıyor
 * (SuperLikeGlyph / NoteGlyph) — SwipeCard'daki super-like kalbi ve NoteBox ile
 * birebir aynı şekil. SF karşılıkları (`star.fill`, `bubble.left.fill`) bilerek
 * kullanılmıyor: ürünün işareti uygulama genelinde tek olmalı.
 */
export type ToastIconKind =
  | 'like'
  | 'superLike'
  | 'note'
  | 'recovery'
  | 'message'
  | 'check'
  | 'premium';

/**
 * Tik'in dairesi — İKİ TEMADA DA siyah. `ink(1)` DEĞİL: o tema-duyarlı mürekkep,
 * koyu modda BEYAZ dönerdi ve daire beyaz tik ile birlikte kaybolurdu.
 */
const CHECK_CIRCLE = '#000000';

/**
 * Mesaj hakkı dairesinin KOYU MOD dolgusu — nötr gri, yüzey merdiveninin bir
 * tık üstü. Merdivenin tepesi (`surface4`, #2A2A2A) cam kartın üstünde hâlâ
 * zemine yapışıyordu; palete yeni bir yüzey tonu eklemek yerine daire burada
 * sabitleniyor. Üstündeki beyaz glif ile kontrast rahat.
 */
const MESSAGE_CIRCLE_DARK = '#3A3A3A';

/**
 * Süper beğeninin rengi — kalbin gradyanının İLK durağı (#fc1919), yani
 * SuperLikeGlassButton'ın cam tint'i ve kutlama alevinin ısı rampasıyla aynı
 * kırmızı. Eskiden `colors.info` mavisiydi ama uygulamada süper beğeniyi
 * temsil eden hiçbir yüzey mavi değil: koyu modda dolgu ürünün rengine
 * döndüğü için toast, temsil ettiği ürünün ailesinden kopuk duruyordu.
 *
 * RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi): `gradients` mod
 * değişince yerinde güncelleniyor.
 */
function superLikeRed() {
  return gradients.swipeHeart[0];
}

/**
 * Ürünün rengi — glif ve daire bunun üstüne kuruluyor. Palet mutasyona uğradığı için render anında okunur.
 *
 * `message` (mesaj hakkı) litPlus'a düşüyor: sohbet listesindeki "Sınırlı"
 * rozeti ve "Sınırsız mesajlaş" pill'i de aynı renkte — kotayı kaldıran şey
 * abonelik, üçü tek dili konuşuyor.
 */
export function toastIconAccent(kind: ToastIconKind): string {
  if (kind === 'superLike') return superLikeRed();
  if (kind === 'like') return colors.likePink;
  // Tik bir ÜRÜN değil, durum bildirimi — ürün rengi taşımıyor.
  if (kind === 'check') return CHECK_CIRCLE;
  return colors.litPlus;
}

/**
 * Simge dairesinin dolgusu.
 *
 * AÇIK MODDA SİYAH — hepsi. Ürün rengiyle dolu daire (kırmızı SuperLike, kırmızı
 * not/kurtarma) beyaz cam kartın üstünde bağırıyordu ve her toast farklı renkte
 * bir leke gibi duruyordu; siyah daire hepsini tek ailede tutuyor, ürünü glifin
 * kendi şekli ayırıyor.
 *
 * Koyu modda daire ürünün rengini taşımaya devam ediyor: siyah, koyu camın
 * üstünde kaybolur ve simge zeminsiz kalırdı. Tek istisna mesaj hakkı: orada
 * daire nötr gri — siyah gibi koyu camda kaybolmuyor, litPlus kırmızısı gibi de
 * bağırmıyor. Bkz. MESSAGE_CIRCLE_DARK.
 */
export function toastIconBackground(kind: ToastIconKind): string {
  // Tik, koyu modda da siyah kalıyor: bir ürün rengi taşısaydı ("kredin
  // yüklendi" toast'larındaki gibi) kota uyarısı da kazanılmış bir şey gibi
  // okunurdu. Koyu camın üstünde kontrast düşük ama kasıtlı.
  if (kind === 'check') return CHECK_CIRCLE;
  // Premium açık modda da SİYAHA DÜŞMÜYOR — tek istisna. Daire, Keşfet'teki
  // upsell CTA'sının dolgusuyla (colors.litPlus) birebir aynı: kullanıcı
  // saniyeler önce o kırmızı butona bastı, toast onun karşılığı olarak
  // okunmalı. Siyah daire onu diğer bildirimlerden ayırt edilemez kılardı.
  if (kind === 'premium') return colors.litPlus;
  if (isLight()) return ink(1);
  // Mesaj hakkı bir KAZANÇ değil, kotanın azaldığı/bittiği uyarısı — litPlus
  // kırmızısı onu "kredin yüklendi" toast'larıyla aynı aileye sokuyordu.
  if (kind === 'message') return MESSAGE_CIRCLE_DARK;
  return toastIconAccent(kind);
}

export function ToastIconGlyph({
  kind,
  size,
  color,
}: {
  kind: ToastIconKind;
  size: number;
  color: string;
}) {
  if (kind === 'superLike') return <SuperLikeGlyph size={size} color={color} />;
  // Premium — isim yanındaki rozetle aynı alev glyph'i. `color` verildiği için
  // gradyan yerine DÜZ dolgu: daire zaten litPlus kırmızısı, rozetin kendi
  // kırmızı-turuncu gradyanı orada zemine gömülürdü (bkz. PremiumFlame).
  if (kind === 'premium') return <PremiumFlame size={size} color={color} />;
  // Balonun içindeki kalp DELİK (fillRule evenodd) — altındaki daire oradan
  // görünür, ikinci bir renk taşımıyoruz. Bkz. NoteGlyph.
  if (kind === 'note') return <NoteGlyph size={size} color={color} />;
  // Mesaj hakkı — ürünün kendi glif'i YOK, konuşulan şey sohbetin kendisi.
  // Dolu balon: içi boş çizgi glif, dolgulu dairenin içinde zayıf kalıyor.
  if (kind === 'message') {
    return (
      <SFIcon
        name="message.fill"
        fallback={MessageCircle}
        size={size}
        color={color}
        strokeWidth={2}
        fill={color}
      />
    );
  }
  // Onay işareti — uygulamanın her yerindeki `checkmark` + bold (seçili satır,
  // paywall madde listesi, kayıt adımları) ile aynı glif.
  if (kind === 'check') {
    return (
      <SFIcon
        name="checkmark"
        fallback={Check}
        size={size}
        color={color}
        strokeWidth={2.5}
        weight="bold"
      />
    );
  }
  if (kind === 'like') {
    return (
      <SFIcon
        name="heart.fill"
        fallback={Heart}
        size={size}
        color={color}
        strokeWidth={2}
        fill={color}
      />
    );
  }
  return (
    <SFIcon
      name="arrow.counterclockwise"
      fallback={RotateCcw}
      size={size}
      color={color}
      strokeWidth={2}
      weight="semibold"
    />
  );
}
