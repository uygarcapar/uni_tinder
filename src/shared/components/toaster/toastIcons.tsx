import { Heart, RotateCcw } from 'lucide-react-native';
import SFIcon from '../SFIcon';
import SuperLikeGlyph from '../SuperLikeGlyph';
import NoteGlyph from '../NoteGlyph';
import { colors, ink, isLight } from '../../theme/colors';

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
export type ToastIconKind = 'like' | 'superLike' | 'note' | 'recovery';

/** Ürünün rengi — glif ve daire bunun üstüne kuruluyor. Palet mutasyona uğradığı için render anında okunur. */
export function toastIconAccent(kind: ToastIconKind): string {
  if (kind === 'superLike') return colors.info;
  if (kind === 'like') return colors.likePink;
  return colors.litPlus;
}

/**
 * Simge dairesinin dolgusu.
 *
 * AÇIK MODDA SİYAH — dördü de. Ürün rengiyle dolu daire (mavi SuperLike, kırmızı
 * not/kurtarma) beyaz cam kartın üstünde bağırıyordu ve her toast farklı renkte
 * bir leke gibi duruyordu; siyah daire dördünü tek ailede tutuyor, ürünü glifin
 * kendi şekli ayırıyor.
 *
 * Koyu modda daire ürünün rengini taşımaya devam ediyor: siyah, koyu camın
 * üstünde kaybolur ve simge zeminsiz kalırdı.
 */
export function toastIconBackground(kind: ToastIconKind): string {
  return isLight() ? ink(1) : toastIconAccent(kind);
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
  // Balonun içindeki kalp DELİK (fillRule evenodd) — altındaki daire oradan
  // görünür, ikinci bir renk taşımıyoruz. Bkz. NoteGlyph.
  if (kind === 'note') return <NoteGlyph size={size} color={color} />;
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
