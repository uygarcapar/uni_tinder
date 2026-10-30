import { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Host, Button as SwiftUIButton, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier as a11yId,
  accessibilityLabel as a11yLabel,
  buttonBorderShape,
  buttonStyle,
  disabled as swiftDisabled,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { LucideIcon } from "@/shared/icons";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { colors as theme, withAlpha } from "@/shared/theme/colors";
import { HAS_LIQUID_GLASS } from "@/shared/theme/glass";

/**
 * YUVARLAK cam aksiyon butonu — geç (X) ve beğen (tik). Beğeniler ekranında
 * hem kart kolonunun ana ikilisi hem köşedeki tik bunu kullanıyor.
 *
 * FireGlassButton'ın kardeşi, kopyası değil: o dosya Fire'ın
 * kapaktaki serbest kalple ORTAK MERKEZ geometrisini (FIRE_*) taşıyor ve
 * o geometri buranın derdi değil — buradaki butonların morph ettiği bir ikinci
 * duruşu yok. İki dosyayı tek bileşende birleştirmek o sözleşmeyi buraya
 * sızdırırdı. Varsayılan ölçü yine de 80: Fire butonuyla tek aile
 * okunmalı.
 *
 * Kopyalanan kurallar (gerekçeleri FireGlassButton'da):
 *   • Host'a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor.
 *   • Glif SwiftUI'ın İÇİNE `RNHostView` ile gömülüyor, üstüne bindirilmiyor:
 *     iOS 26'nın basış animasyonunda cam ile glif birlikte ölçekleniyor.
 *
 * ⚠️ SwiftUI YOLUNA KAPI `HAS_LIQUID_GLASS`, `Platform.OS === "ios"` DEĞİL —
 * gerekçenin tamamı RecoverGlassButton'ın başında (26 altında iki buton stili de
 * `.automatic`'e düşüyor, yani kazanç yok; buna karşılık `Host`un içeriği kartın
 * köşesinde RN kutusunun oturduğu yere oturmayıp kırpılıyor). İki dosya aynı
 * köşenin iki hâli, kapıları da AYNI kalmalı.
 */

/** Cam kabuğun dış ölçüsü — Fire butonuyla aynı aile. */
export const CARD_ACTION_SIZE = 80;

/** Kabuğun içindeki glif. Cam kenara nefes payı kalsın diye kabuktan küçük. */
export const CARD_ACTION_GLYPH_SIZE = 38;

/**
 * Glif/kabuk oranı — küçültülmüş butonlarda (bkz. `size`) glif buradan
 * türetiliyor. Kenar payı ölçüyle birlikte küçülmezse cam çember, içi boş bir
 * halka gibi okunuyor.
 */
const GLYPH_RATIO = CARD_ACTION_GLYPH_SIZE / CARD_ACTION_SIZE;

type Variant = "clear" | "prominent";

type Props = {
  /**
   * "clear" → sade cam, tint yalnız glife uygulanır (geç).
   * "prominent" → camın dolgusu tint'e boyanır (beğen).
   *
   * Ayrım bilinçli: iki buton da prominent olsaydı alt şerit iki renkli lekeye
   * dönüyordu ve olumlu aksiyon öne çıkmıyordu. Sade cam neredeyse berrak
   * kaldığı için X kartın üstünde bir vurgu değil, bir çıkış olarak okunuyor.
   */
  variant: Variant;
  name: SFSymbol;
  fallback: LucideIcon;
  /** Cam kabuğun tint'i (prominent'te dolgu, clear'da yalnız ton). */
  tintColor: string;
  /** Glif rengi — prominent'te kabuğun üstünde okunacak kontrast renk. */
  glyphColor: string;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  onPress: () => void;
  /**
   * Kabuğun dış ölçüsü. Varsayılan dock ölçüsü (80); Beğeniler'in kart
   * kolonundaki kopya kolonun genişliğine sığmak zorunda olduğu için küçük
   * geçiyor. Glif oranla birlikte küçülüyor (bkz. GLYPH_RATIO).
   */
  size?: number;
  /**
   * Glifin ölçüsü. Verilmezse kabuktan oranla türer (GLYPH_RATIO); yalnız o
   * oranın yanlış durduğu yerlerde geçilir — ör. kartın köşesindeki buton,
   * fotoğrafın üstünde etrafında daha geniş bir cam payı istiyor.
   */
  glyphSize?: number;
  /**
   * Glifin oturduğu KARE kutu — verilmezse `glyphSize`ın kendisi.
   *
   * NEDEN AYRI BİR KOL: camlı yolda çemberin çapını `frame` DEĞİL bu kutu
   * belirliyor (kabuk label + kontrol payı kadar doğuyor). Yani glifi
   * küçültmek, istemsiz biçimde KABUĞU da küçültüyor. Kutuyu sabit tutup
   * yalnız çizilen işareti küçültmek için bu prop var — kardeş butonlarla aynı
   * çapta kalırken içindeki glif farklı puntoda olabiliyor (köşedeki üç nokta
   * böyle: kabuk tik/X ile aynı, işaret Keşif'in üç noktasıyla aynı).
   */
  glyphBoxSize?: number;
  /** İstek uçarken: glif spinner'a döner ve buton basılamaz olur. */
  busy?: boolean;
  /**
   * e2e seçicisi. SwiftUI tarafında `accessibilityIdentifier`
   * modifier'ına, Android/iOS<26 dalında `testID` prop'una gidiyor —
   * yani aynı seçici iki yolda da çalışıyor.
   */
  testID?: string;
};

function Glyph({
  name,
  fallback,
  color,
  size,
  box,
  busy,
}: Pick<Props, "name" | "fallback"> & {
  color: string;
  /** Çizilen işaretin puntosu. */
  size: number;
  /** Kutunun kenarı — çapı belirleyen kol (bkz. `glyphBoxSize`). */
  box: number;
  busy: boolean;
}) {
  return (
    // pointerEvents none: dokunmayı SwiftUI butonu karşılasın, RNHostView'ın
    // iliştirdiği touch handler araya girmesin.
    <View
      style={{
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
      }}
      pointerEvents="none"
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <SFIcon
          name={name}
          fallback={fallback}
          size={size}
          color={color}
          strokeWidth={4}
          weight="heavy"
        />
      )}
    </View>
  );
}

function CardActionGlassButton({
  testID,
  variant,
  name,
  fallback,
  tintColor,
  glyphColor,
  label,
  onPress,
  size = CARD_ACTION_SIZE,
  glyphSize: glyphSizeProp,
  glyphBoxSize,
  busy = false,
}: Props) {
  const prominent = variant === "prominent";
  const glyphSize = glyphSizeProp ?? Math.round(size * GLYPH_RATIO);
  // Kutu verilmediyse glifin kendisi kadar — eski davranış.
  const glyphBox = glyphBoxSize ?? glyphSize;

  if (HAS_LIQUID_GLASS) {
    return (
      <Host style={{ width: size, height: size }}>
        <SwiftUIButton
          onPress={onPress}
          modifiers={[
            buttonStyle(prominent ? "glassProminent" : "glass"),
            buttonBorderShape("circle"),
            // ⚠️ `controlSize("extraLarge")` BİLEREK YOK (2026-10-10'da
            // eklenip geri alındı). Cam çemberin çapını `frame` değil kontrol
            // payı belirliyor (kabuk LABEL'ın etrafına o payı ekleyerek
            // doğuyor, `frame` onu yalnız içine ortalıyor) — yani extraLarge
            // butonu GÖRÜNÜR ŞEKİLDE BÜYÜTÜYOR. İstenmedi: köşedeki daireler
            // bu çapta kalmalı.
            // Aralarındaki boşluk bu yüzden `frame`in çemberden artan ölü
            // payından geliyor ve çözümü kolonun NEGATİF payı (bkz. LikeCard >
            // CARD_CORNER_PAIR_GAP), kabuğu büyütmek değil.
            tint(tintColor),
            frame({ width: size, height: size }),
            swiftDisabled(busy),
            a11yLabel(label),
              ...(testID ? [a11yId(testID)] : []),
          ]}
        >
          <RNHostView matchContents>
            <Glyph
              name={name}
              fallback={fallback}
              color={glyphColor}
              size={glyphSize}
              box={glyphBox}
              busy={busy}
            />
          </RNHostView>
        </SwiftUIButton>
      </Host>
    );
  }

  // Cam YOKSA (iOS 26 altı + Android): düz daire, tamamen RN. Prominent'te dolgu
  // tint'in kendisi, clear'da onun düşük alfalı tonu — eski `glassFallback`
  // zincirinin verdiği görünümün birebir aynısı.
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      hitSlop={12}
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
        backgroundColor: prominent ? tintColor : withAlpha(tintColor, 0.08),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withAlpha(prominent ? glyphColor : theme.textDisabled, 0.35),
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Glyph
        name={name}
        fallback={fallback}
        color={glyphColor}
        size={glyphSize}
        box={glyphBox}
        busy={busy}
      />
    </TouchableOpacity>
  );
}

export default memo(CardActionGlassButton);
