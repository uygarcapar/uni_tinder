import { memo } from "react";
import { ArrowUp } from "@/shared/icons";
import CardChromeGlassButton, {
  CARD_CHROME_GLASS_SIZE,
} from "./CardChromeGlassButton";

/**
 * KEŞİF şeridinin SOL ucundaki cam "yukarı ok" — içeriği başa sarar.
 *
 * Şerit, kapaktaki ismi devraldığı an kullanıcı bir ekran boyu aşağıda oluyor:
 * kapağa (fotoğrafa, isme, aksiyon kolonuna) dönmenin tek yolu elle geri
 * kaydırmaktı. Ok o yolu tek dokunuşa indiriyor.
 *
 * ÖNİZLEMEDE YOK: orada sol köşe "kapat"ın (bkz. CardCloseGlassButton) — kart
 * bir sheet ve kullanıcının aradığı çıkış başa dönmek değil, kartı kapatmak.
 *
 * Glif `arrow.up`: "başa dön" anlamını taşıyan en sade işaret. Chevron
 * denenebilirdi ama uygulamada chevron bir GEZİNME işareti (satır açar, sayfa
 * değiştirir); buradaki iş bir konum değişikliği.
 *
 * Kabuk, ölçü ve bütün gerekçeler ortak dosyada: CardChromeGlassButton. Sağ
 * uçtaki Fire'la aynı kenar payında, aynı dikey merkezde duruyor (şeridin iki
 * yanı simetrik — bkz. CardStickyHeader > TITLE_SIDE_INSET).
 */

/** Kabuğun dış ölçüsü — şeridin öbür köşe butonlarıyla AYNI. */
export const CARD_SCROLL_TOP_GLASS_SIZE = CARD_CHROME_GLASS_SIZE;

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  /** Kabuğun çapı — gerekçesi ortak dosyada (CardChromeGlassButton). */
  size?: number;
  /** e2e seçicisi — ortak kabuğa (CardChromeGlassButton) geçiyor. */
  testID?: string;
};

function CardScrollTopGlassButton({ onPress, label, size, testID }: Props) {
  return (
    <CardChromeGlassButton
      testID={testID}
      onPress={onPress}
      label={label}
      size={size}
      systemName="arrow.up"
      fallback={ArrowUp}
      // Foto üstü mürekkep (açık modda da beyaz) ve bu buton için SABİT, prop
      // değil: ok YALNIZ Keşif'te çiziliyor ve orada şeridin koyu rampasının
      // üstünde duruyor — üstelik ekranın üstündeki yüzen geri al/filtre ile
      // TAM AYNI yerde, devirde yalnız içerik değişiyor. Mürekkepleri
      // ayrışsaydı aynı noktadaki glif devirde siyaha dönerdi.
      onMedia
    />
  );
}

export default memo(CardScrollTopGlassButton);
