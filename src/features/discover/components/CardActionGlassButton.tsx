import { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Host, Button as SwiftUIButton, RNHostView } from "@expo/ui/swift-ui";
import {
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
 * SuperLikeGlassButton'ın kardeşi, kopyası değil: o dosya süper beğeninin
 * kapaktaki serbest kalple ORTAK MERKEZ geometrisini (SUPER_LIKE_*) taşıyor ve
 * o geometri buranın derdi değil — buradaki butonların morph ettiği bir ikinci
 * duruşu yok. İki dosyayı tek bileşende birleştirmek o sözleşmeyi buraya
 * sızdırırdı. Varsayılan ölçü yine de 80: süper beğeni butonuyla tek aile
 * okunmalı.
 *
 * Kopyalanan kurallar (gerekçeleri SuperLikeGlassButton'da):
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

/** Cam kabuğun dış ölçüsü — süper beğeni butonuyla aynı aile. */
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
  /** İstek uçarken: glif spinner'a döner ve buton basılamaz olur. */
  busy?: boolean;
};

function Glyph({
  name,
  fallback,
  color,
  size,
  busy,
}: Pick<Props, "name" | "fallback"> & {
  color: string;
  size: number;
  busy: boolean;
}) {
  return (
    // pointerEvents none: dokunmayı SwiftUI butonu karşılasın, RNHostView'ın
    // iliştirdiği touch handler araya girmesin.
    <View
      style={{
        width: size,
        height: size,
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
  variant,
  name,
  fallback,
  tintColor,
  glyphColor,
  label,
  onPress,
  size = CARD_ACTION_SIZE,
  glyphSize: glyphSizeProp,
  busy = false,
}: Props) {
  const prominent = variant === "prominent";
  const glyphSize = glyphSizeProp ?? Math.round(size * GLYPH_RATIO);

  if (HAS_LIQUID_GLASS) {
    return (
      <Host style={{ width: size, height: size }}>
        <SwiftUIButton
          onPress={onPress}
          modifiers={[
            buttonStyle(prominent ? "glassProminent" : "glass"),
            buttonBorderShape("circle"),
            tint(tintColor),
            frame({ width: size, height: size }),
            swiftDisabled(busy),
            a11yLabel(label),
          ]}
        >
          <RNHostView matchContents>
            <Glyph
              name={name}
              fallback={fallback}
              color={glyphColor}
              size={glyphSize}
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
        busy={busy}
      />
    </TouchableOpacity>
  );
}

export default memo(CardActionGlassButton);
