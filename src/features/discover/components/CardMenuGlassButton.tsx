import { memo } from "react";
import { MoreVertical } from "@/shared/icons";
import CardChromeGlassButton, {
  CARD_CHROME_GLASS_SIZE,
} from "./CardChromeGlassButton";

/**
 * Kartın SAĞ ÜST köşesindeki cam "üç nokta" — sticky şeritte, ismin sağında.
 *
 * Kabuk, ölçü ve bütün gerekçeler ortak dosyada: CardChromeGlassButton. Burada
 * kalan tek şey glif seçimi — soldaki kardeşi (CardCloseGlassButton) de aynı
 * kabuğu paylaşıyor, yani şeridin iki ucu ayrışamıyor.
 */

/** Kabuğun dış ölçüsü — ortak cam ikon butonuyla AYNI. */
export const CARD_MENU_GLASS_SIZE = CARD_CHROME_GLASS_SIZE;

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  /** Kabuğun çapı — gerekçesi ortak dosyada (CardChromeGlassButton). */
  size?: number;
  /** Glif foto üstü mürekkeple çizilsin — gerekçesi ortak dosyada. */
  onMedia?: boolean;
};

function CardMenuGlassButton({ onPress, label, size, onMedia }: Props) {
  return (
    <CardChromeGlassButton
      onPress={onPress}
      label={label}
      size={size}
      onMedia={onMedia}
      systemName="ellipsis"
      fallback={MoreVertical}
    />
  );
}

export default memo(CardMenuGlassButton);
