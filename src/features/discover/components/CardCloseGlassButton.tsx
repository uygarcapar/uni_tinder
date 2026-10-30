import { memo } from "react";
import { X } from "@/shared/icons";
import CardChromeGlassButton, {
  CARD_CHROME_GLASS_SIZE,
} from "./CardChromeGlassButton";

/**
 * Kartın SOL ÜST köşesindeki cam "kapat" (çarpı) butonu — sticky şeritte,
 * ismin solunda.
 *
 * Yalnız ÖNİZLEME şeritleri çiziyor (Beğeniler / Sohbet / Profil): kart tam
 * ekranı kaplıyor, altındaki ekranın kendi başlığı ve geri/kapat kontrolü
 * erişilemez oluyor. O ana kadar kartı kapatmanın tek yolu aşağı çekme jestiydi
 * — jest duruyor, bu buton onun GÖRÜNÜR karşılığı.
 *
 * KEŞİF'TE YOK: orada kart bir sheet değil, kapanışı kapaktaki cam "başa dön"
 * butonuyla oluyor (bkz. CardCollapseGlassButton) ve sol köşe onun.
 *
 * Kabuk, ölçü ve bütün gerekçeler ortak dosyada: CardChromeGlassButton. Sağdaki
 * kardeşiyle (CardMenuGlassButton) aynı kabuğu paylaşıyor — şeridin iki ucu
 * aynı çapta, aynı malzemede, aynı dikey merkezde.
 */

/** Kabuğun dış ölçüsü — sağdaki üç noktayla AYNI. */
export const CARD_CLOSE_GLASS_SIZE = CARD_CHROME_GLASS_SIZE;

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  /** Kabuğun çapı — gerekçesi ortak dosyada (CardChromeGlassButton). */
  size?: number;
  /** Glif foto üstü mürekkeple çizilsin — gerekçesi ortak dosyada. */
  onMedia?: boolean;
  /** e2e seçicisi — ortak kabuğa (CardChromeGlassButton) geçiyor. */
  testID?: string;
};

function CardCloseGlassButton({ onPress, label, size, onMedia, testID }: Props) {
  return (
    <CardChromeGlassButton
      testID={testID}
      onPress={onPress}
      label={label}
      size={size}
      onMedia={onMedia}
      systemName="xmark"
      fallback={X}
    />
  );
}

export default memo(CardCloseGlassButton);
