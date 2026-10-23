import { Platform, View } from "react-native";
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

import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";
import { colors, onMediaAt } from "@/shared/theme/colors";
import {
  glassFallback,
  glassIconClearGlyph,
  GLASS_ICON_CLEAR_SIZE,
} from "@/shared/theme/glass";

/**
 * FOTO ÜSTÜ chrome'un yuvarlak cam ikon butonu.
 *
 * İki tam ekran medya yüzeyi paylaşıyor: kırpma ekranı (kapat / kırp / sıfırla)
 * ve kamera ekranı (kapat / flaş / kamera çevir). Tek kopya olmak ZORUNDA —
 * ikisi aynı oturumda arka arkaya açılıyor, iki ayrı buton ailesi geçişte
 * boyut/mürekkep farkı olarak görünüyordu.
 *
 * UYGULAMANIN ORTAK BERRAK CAM İKON BUTONU — kendi zinciri değil
 * `glassIconClearGlyph` + `GLASS_ICON_CLEAR_SIZE` (Keşif filtrelerinin başlık
 * butonları, profildeki çan/ayarlar, RegisterBackButton ile tek aile). Eskiden
 * `buttonStyle("glass")` + `labelStyle("iconOnly")` ile kendi kabuğunu
 * kuruyordu; o yolda çap glifin intrinsic kutusundan türüyor, yani ✕ ile ↺
 * hafifçe farklı ve kapsüle kaçan kabuklar veriyordu (gerekçesi uzun uzun
 * GLASS_ICON_BUTTON'ın başında). Ortak zincirde daireyi `frame` + `contentShape`
 * taşıyor: bütün butonlar birebir 48pt daire.
 *
 * Zemin fotoğraf/kamera olduğu için mürekkep `onMedia` — tema ne olursa olsun
 * beyaz. Basılamaz hâl Host'un OPAKLIĞIYLA DEĞİL mürekkebin alfasıyla veriliyor:
 * ata zincirindeki opacity < 1 liquid glass'ı sessizce düşürüyor.
 */
const MEDIA_CHROME_ICON_SIZE = GLASS_ICON_CLEAR_SIZE;

export default function MediaChromeIconButton({
  systemImage,
  fallbackIcon,
  label,
  onPress,
  disabled,
  active,
}: {
  systemImage: SFSymbol;
  fallbackIcon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Açık/kapalı bir kipi temsil eden buton (Kırp, flaş) — açıkken glif turuncu. */
  active?: boolean;
}) {
  const ink = disabled
    ? onMediaAt(0.45)
    : active
      ? colors.accentOrange
      : colors.onMedia;

  if (Platform.OS === "ios") {
    return (
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      <GlassFallbackSurface
        shape="circle"
        width={MEDIA_CHROME_ICON_SIZE}
        height={MEDIA_CHROME_ICON_SIZE}
      >
        <Host
          style={{
            width: MEDIA_CHROME_ICON_SIZE,
            height: MEDIA_CHROME_ICON_SIZE,
          }}
        >
          <SwiftUIButton
            // `label` prop'u YOK: verildiği anda native taraf children'ı yok
            // sayıyor (bkz. RegisterBackButton), yani özel ölçülü glif hiç
            // çizilmezdi. Erişilebilir ad bu yüzden modifier'dan.
            onPress={disabled ? () => {} : onPress}
            modifiers={[
              // Kabuk YOK: daireyi de dokunma alanını da cam zinciri taşıyor.
              buttonStyle("plain"),
              tint(ink),
              frame({
                width: MEDIA_CHROME_ICON_SIZE,
                height: MEDIA_CHROME_ICON_SIZE,
              }),
              a11yLabel(label),
              // 26 altında zemin bulanıklıktan geliyor; burada kalan tek iş
              // medya üstünde çalışan açık bir kenar.
              ...glassFallback({ shape: "circle", borderColor: onMediaAt(0.35) }),
            ]}
          >
            <SwiftUIImage
              systemName={systemImage}
              color={ink}
              modifiers={glassIconClearGlyph(MEDIA_CHROME_ICON_SIZE)}
            />
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={{
        width: MEDIA_CHROME_ICON_SIZE,
        height: MEDIA_CHROME_ICON_SIZE,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.mediaChipBg,
      }}
    >
      <View pointerEvents="none">
        <SFIcon
          name={systemImage}
          fallback={fallbackIcon}
          size={20}
          strokeWidth={2.5}
          color={ink}
          weight="semibold"
        />
      </View>
    </AnimatedPressable>
  );
}
