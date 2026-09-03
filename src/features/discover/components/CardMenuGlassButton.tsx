import { memo } from "react";
import { Platform, StyleSheet, TouchableOpacity } from "react-native";
import {
  Host,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as a11yLabel,
  buttonStyle,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { MoreVertical } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors as theme, withAlpha } from "@/shared/theme/colors";
import {
  glassFallback,
  glassIconClearGlyph,
  GLASS_ICON_CLEAR_SIZE,
} from "@/shared/theme/glass";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";

/**
 * Kartın SAĞ ÜST köşesindeki cam "üç nokta" — sticky şeritte, ismin sağında.
 *
 * SOHBET BAŞLIĞINDAKİ MENÜ BUTONUNUN AYNISI, kopyası değil: zinciri de ölçüsü
 * de uygulamanın ortak berrak cam ikon butonundan geliyor
 * (`glassIconClearGlyph` + `GLASS_ICON_CLEAR_SIZE`) — profildeki çan/ayarlar,
 * Bildirimler'deki geri ve sohbetteki geri/menü ile tek aile. Sohbetten açılan
 * profil önizlemesinde kullanıcı aynı butonu aynı yerde bulmalı: ekranın
 * başlığı kartın şeridine dönüşüyor, buton onunla birlikte oraya taşınıyor.
 *
 * Soldaki kardeşiyle (CardCollapseGlassButton) aynı kurallar — gerekçeleri
 * orada uzun uzun yazılı:
 *   • Host'a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor.
 *   • `ignoreSafeArea="container"`: buton açık kartta safe-area çizgisinin
 *     üstünde duruyor, host'un kendi payı camı aşağı itiyor.
 *   • `...glassFallback()` en sonda: strokeBorder bir .overlay, `frame`'den
 *     önce gelirse butonun değil label'ın ölçüsünü takip eder.
 *
 * Glif SwiftUI'ın KENDİ `Image`'ı (RNHostView değil): ortak zincir camı zaten
 * glifin üstüne takıyor ve dokunma alanını `contentShape` ile o kutuya
 * genişletiyor — sohbet başlığındaki buton da birebir böyle kurulu.
 */

/** Kabuğun dış ölçüsü — ortak cam ikon butonuyla AYNI. */
export const CARD_MENU_GLASS_SIZE = GLASS_ICON_CLEAR_SIZE;

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
};

function CardMenuGlassButton({ onPress, label }: Props) {
  if (Platform.OS === "ios") {
    return (
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      // Buradaki bulanıklığın gerçekten bulanıklaştıracak bir şeyi var: buton
      // kart fotoğrafının üstünde duruyor.
      <GlassFallbackSurface
        shape="circle"
        width={CARD_MENU_GLASS_SIZE}
        height={CARD_MENU_GLASS_SIZE}
      >
        <Host
          ignoreSafeArea="container"
          style={{ width: CARD_MENU_GLASS_SIZE, height: CARD_MENU_GLASS_SIZE }}
        >
          <SwiftUIButton
            onPress={onPress}
            modifiers={[
              // Kabuk YOK, berrak cam glifin üstünde — daireyi de dokunma
              // alanını da o zincir taşıyor; bkz. glassIconClearGlyph.
              buttonStyle("plain"),
              tint(theme.text),
              frame({
                width: CARD_MENU_GLASS_SIZE,
                height: CARD_MENU_GLASS_SIZE,
              }),
              // label prop'u yok (glif children olarak veriliyor) → erişilebilir
              // ad modifier'dan gelmeli, yoksa VoiceOver butonu isimsiz okuyor.
              a11yLabel(label),
              ...glassFallback({ shape: "circle" }),
            ]}
          >
            <SwiftUIImage
              systemName="ellipsis"
              color={theme.text}
              modifiers={glassIconClearGlyph()}
            />
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    );
  }

  // Android: cam yok → iOS 26 altındaki fallback'in aynısı, düz daire
  // (CardCollapseGlassButton'ın Android dalıyla birebir aynı kabuk).
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: CARD_MENU_GLASS_SIZE,
        height: CARD_MENU_GLASS_SIZE,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(theme.text, 0.08),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairlineStrong,
      }}
    >
      <SFIcon
        name="ellipsis"
        fallback={MoreVertical}
        size={22}
        color={theme.text}
        weight="semibold"
      />
    </TouchableOpacity>
  );
}

export default memo(CardMenuGlassButton);
