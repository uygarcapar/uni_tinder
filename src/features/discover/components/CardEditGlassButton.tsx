import { memo } from "react";
import { Pencil } from "@/shared/icons";
import CardChromeGlassButton, {
  CARD_CHROME_GLASS_SIZE,
} from "./CardChromeGlassButton";

/**
 * Kartın SAĞ ÜST köşesindeki cam "düzenle" (kalem) butonu — sticky şeritte,
 * ismin sağında.
 *
 * YALNIZ KENDİ PROFİLİNİN ÖNİZLEMESİNDE (ProfileScreen > PreviewModal). Orada
 * kart "insanlar beni nasıl görüyor" sorusunun cevabı: kullanıcı bir eksik
 * görüp düzeltmek isteyince kartı kapatıp profil ekranına dönmesi, oradan
 * "Profili Düzenle"yi bulması gerekiyordu. Buton o yolu tek dokunuşa indiriyor —
 * kartı kapatıp düzenleme modalını açıyor, yani düzenleme→önizleme yolunun
 * (EditProfileForm > onPreview) TERSİ.
 *
 * BAŞKA BAĞLAMDA YOK ve olmamalı: karşı tarafın kartında o köşe "üç nokta"nın
 * (CardMenuGlassButton) — düzenlenecek bir şey yok.
 *
 * Kabuk, ölçü ve bütün gerekçeler ortak dosyada: CardChromeGlassButton. Soldaki
 * "kapat"la (CardCloseGlassButton) aynı kabuğu paylaşıyor — şeridin iki ucu aynı
 * çapta, aynı malzemede, aynı dikey merkezde.
 */

/** Kabuğun dış ölçüsü — soldaki "kapat"la AYNI. */
export const CARD_EDIT_GLASS_SIZE = CARD_CHROME_GLASS_SIZE;

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

function CardEditGlassButton({ onPress, label, size, onMedia, testID }: Props) {
  return (
    <CardChromeGlassButton
      testID={testID}
      onPress={onPress}
      label={label}
      size={size}
      onMedia={onMedia}
      systemName="pencil"
      fallback={Pencil}
    />
  );
}

export default memo(CardEditGlassButton);
