import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
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
import type { LucideIcon } from "@/shared/icons";
import { colors as theme, withAlpha } from "@/shared/theme/colors";
import {
  glassFallback,
  glassIconClearGlyph,
  glassOnMediaInk,
  GLASS_ICON_CLEAR_SIZE,
} from "@/shared/theme/glass";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";

/**
 * Keşif ekranının üstünde YÜZEN cam ikon butonu — solda geri al, sağda filtre.
 *
 * Kendi zemini olan bir header şeridi YOK: kart tüm ekranı kaplıyor ve bu iki
 * buton doğrudan kapak fotoğrafının üstünde duruyor. Okunurluğu kapağın kendi
 * üst rampası taşıyor (SwipeCard > "KAPAĞIN TEPESİNDEKİ RAMPA").
 *
 * KART ÜSTÜNDEKİ CAM BUTON AİLESİNİN ÜYESİ, kopyası değil: zincir de ölçü de
 * `glassIconClearGlyph` + `GLASS_ICON_CLEAR_SIZE`'tan geliyor — kartın sağ
 * üstündeki üç nokta (CardMenuGlassButton), profildeki çan/ayarlar ve
 * sohbetteki geri/menü ile aynı aile. Gerekçeleri oralarda uzun uzun yazılı,
 * burada tekrar edilmiyor; kopyalanan üç kural:
 *   • Host'a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor.
 *   • `ignoreSafeArea="container"`: buton safe-area çizgisinin hemen altında
 *     duruyor, host'un kendi payı camı aşağı itiyor.
 *   • `...glassFallback()` EN SONDA: strokeBorder bir `.overlay`, `frame`'den
 *     önce gelirse butonun değil label'ın ölçüsünü takip eder.
 *
 * Glif SwiftUI'ın KENDİ `Image`'ı (RNHostView değil): ortak zincir camı glifin
 * üstüne takıyor ve dokunma alanını `contentShape` ile kutuya genişletiyor.
 *
 * ROZET (`badge`) CAMIN DIŞINDA, kardeş katman olarak çiziliyor. SwiftUI
 * ağacının içine sokulamaz (oraya yalnız SwiftUI çocukları girer) ve camın
 * ATASI da olamaz — ata zincirinde kimliksel olmayan bir transform ya da
 * opacity<1 gören cam sessizce hiç render edilmiyor.
 */

/** Kabuğun dış ölçüsü — kart üstündeki cam ikon butonlarıyla AYNI. */
export const DISCOVER_HEADER_GLASS_SIZE = GLASS_ICON_CLEAR_SIZE;

type Props = {
  /** SF Symbol adı (iOS). */
  systemName: SFSymbol;
  /** Camsız yolda (Android + iOS 26 altı) çizilecek lucide ikonu. */
  fallback: LucideIcon;
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  /**
   * Sağ alt köşeye oturan küçük sayaç/kilit rozeti. Butonun DIŞINDA duruyor
   * (yukarıdaki not); verilmezse hiç çizilmiyor.
   */
  badge?: ReactNode;
  /**
   * Butonun sönük hâli. Yalnız "yapacak bir şey yok" durumunda veriliyor —
   * kilitli buton sönük GÖSTERİLMİYOR, o her zaman tıklanabilir (paywall açar).
   *
   * SÖNÜKLÜK OPAKLIKLA DEĞİL GLİFİN RENGİYLE. Camın atasına opacity<1 vermek
   * efekti sessizce hiç render ettirmiyor (uygulamada birkaç kez yaşandı);
   * kabuk tam camında kalıyor, inen yalnız mürekkep.
   */
  dimmed?: boolean;
  /**
   * Kabuğun çapı — Keşif'in bütün cam butonları tek çapta olmak zorunda (bkz.
   * DISCOVER_GLASS_BUTTON_SIZE): bu ikisi devirde şeridin uçlarındaki okun ve
   * Fire'ın yerini alıyor, ayrışırlarsa daireler devir sırasında büyüyüp
   * küçülüyor. Varsayılan uygulamanın ortak cam ikon ölçüsü.
   */
  size?: number;
};

function DiscoverHeaderGlassButton({
  systemName,
  fallback,
  onPress,
  label,
  badge,
  dimmed = false,
  size = DISCOVER_HEADER_GLASS_SIZE,
}: Props) {
  // Mürekkep FOTO ÜSTÜ: iki buton da kapak fotoğrafının üstünde yüzüyor, yani
  // açık modda da beyaz (gerekçe ve 26-altı dalı `glassOnMediaInk`in yanında).
  const ink = glassOnMediaInk();
  const glyphColor = dimmed ? withAlpha(ink, 0.35) : ink;

  const glass =
    Platform.OS === "ios" ? (
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      // Buradaki bulanıklığın gerçekten bulanıklaştıracak bir şeyi var: buton
      // kapak fotoğrafının üstünde duruyor.
      <GlassFallbackSurface
        shape="circle"
        width={size}
        height={size}
      >
        <Host
          ignoreSafeArea="container"
          style={{ width: size, height: size }}
        >
          <SwiftUIButton
            onPress={onPress}
            modifiers={[
              buttonStyle("plain"),
              tint(ink),
              frame({ width: size, height: size }),
              // label prop'u yok (glif children olarak veriliyor) → erişilebilir
              // ad modifier'dan gelmeli, yoksa VoiceOver butonu isimsiz okuyor.
              a11yLabel(label),
              ...glassFallback({ shape: "circle" }),
            ]}
          >
            <SwiftUIImage
              systemName={systemName}
              color={glyphColor}
              modifiers={glassIconClearGlyph(size)}
            />
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    ) : (
      // Android: cam yok → iOS 26 altındaki fallback'in aynısı, düz daire.
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: size,
          height: size,
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
          name={systemName}
          fallback={fallback}
          size={22}
          color={glyphColor}
          weight="semibold"
        />
      </TouchableOpacity>
    );

  return (
    // `box-none`: kutunun kendisi dokunma almıyor, camdaki buton ve rozet
    // alıyor. Rozet `none` — sayaç dekoratif, basılacak yer butonun kendisi.
    //
    // BU KUTUYA OPACITY VERME (bkz. `dimmed` notu): camın atası olduğu için
    // 1'in altındaki her değer efekti tamamen yok ediyor.
    <View
      pointerEvents="box-none"
      style={{ width: size, height: size }}
    >
      {glass}
      {badge != null && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", bottom: -2, right: -4 }}
        >
          {badge}
        </View>
      )}
    </View>
  );
}

export default memo(DiscoverHeaderGlassButton);
