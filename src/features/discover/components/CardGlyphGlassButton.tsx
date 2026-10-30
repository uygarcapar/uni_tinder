import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { Host, Button as SwiftUIButton, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier as a11yId,
  accessibilityLabel as a11yLabel,
  buttonStyle,
  contentShape,
  controlSize,
  frame,
  glassEffect,
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { colors as theme, withAlpha } from "@/shared/theme/colors";
import { glassClearShadow, glassFallback } from "@/shared/theme/glass";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";

/**
 * BERRAK cam yuvarlak buton — glifi RN tarafından gelen.
 *
 * `CardChromeGlassButton`ın kardeşi ve tek farkı bu: oradaki glif bir SF Symbol
 * (SwiftUI'ın kendi `Image`'ı), buradaki ise RN'de çizilen bir bileşen
 * (`NoteGlyph` gibi SVG/Skia işaretler). SF Symbol karşılığı olmayan ürün
 * glifleri için.
 *
 * ZİNCİR `FireGlassButton`IN BERRAK YOLUYLA BİREBİR AYNI ve aynı kalmak
 * ZORUNDA: ikisi kapağın sağ alt kolonunda YAN YANA duruyor (Fire · not · üç
 * nokta) ve en ufak ayrışma üç dairenin farklı malzemede görünmesi demek.
 * Birini değiştiren diğerine de bakmalı.
 *
 * ── BASMA GERİ BİLDİRİMİ CAMIN KENDİSİNDEN ──────────────────────────────────
 * `glassEffect(..., interactive: true)`: iOS 26 basışta camı kendi morph'uyla
 * büküyor. Bu yüzden `buttonStyle` `.plain` (hiçbir yüzey çizmiyor) ve
 * `activeOpacity` yok.
 *
 * ELLE BİR BASMA ANİMASYONU EKLEME. Not kutusu bir dönem ölçekle küçülüyordu
 * (`scale: 1 − 0.06p`) ve o `transform` CAMIN ATASINDAYDI: uygulamada kimliksel
 * olmayan bir ata transform'u cam efektini sessizce yok ediyor. Aynı tuzağın
 * opaklık hâli de var (bkz. glassClearShadow'un çevresindeki notlar).
 */

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  /** Kabuğun çapı. */
  size: number;
  /** RN tarafında çizilen glif. Kabuğa ortalanıyor. */
  children: ReactNode;
  /**
   * e2e seçicisi. SwiftUI tarafında `accessibilityIdentifier`
   * modifier'ına, Android/iOS<26 dalında `testID` prop'una gidiyor —
   * yani aynı seçici iki yolda da çalışıyor.
   */
  testID?: string;
};

function CardGlyphGlassButton({ onPress, label, size, children, testID }: Props) {
  // Glif kabı: ölçü SwiftUI'a `matchContents` ile veriliyor, o yüzden kutu
  // kabuğun tamamı kadar ve glif içinde ortalı. `pointerEvents none` —
  // dokunmayı SwiftUI butonu karşılasın, RNHostView'ın handler'ı araya
  // girmesin.
  const glyph = (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
      pointerEvents="none"
    >
      {children}
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      <GlassFallbackSurface shape="circle" width={size} height={size}>
        <Host ignoreSafeArea="container" style={{ width: size, height: size }}>
          <SwiftUIButton
            onPress={onPress}
            modifiers={[
              // Kabuk buton stilinden DEĞİL, glifin üstündeki berrak camdan.
              buttonStyle("plain"),
              tint(theme.text),
              // Ortamdaki `imageScale`i de bu belirliyor — ortak zincirle aynı
              // kalsın diye duruyor.
              controlSize("extraLarge"),
              frame({ width: size, height: size }),
              contentShape(shapes.circle()),
              glassEffect({
                glass: { variant: "clear", interactive: true },
                shape: "circle",
              }),
              // Açık modda beyaz zeminden ayrılsın diye ufak gölge. Camdan
              // SONRA — sırası şart.
              ...glassClearShadow(),
              // label prop'u YOK (glif children) → erişilebilir ad modifier'dan
              // gelmeli, yoksa VoiceOver butonu isimsiz okuyor.
              a11yLabel(label),
              ...(testID ? [a11yId(testID)] : []),
              // 26 altında berrak camın yerine yalnız ince bir kenar: orada
              // görünmesi gereken şey camın kırılması, dolu bir daire değil.
              ...glassFallback({ shape: "circle" }),
            ]}
          >
            <RNHostView matchContents>{glyph}</RNHostView>
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    );
  }

  // Android: cam yok → 26 altındaki fallback'in aynısı, düz daire.
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={8}
      accessibilityRole="button"
      testID={testID}
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
      {children}
    </TouchableOpacity>
  );
}

export default memo(CardGlyphGlassButton);
