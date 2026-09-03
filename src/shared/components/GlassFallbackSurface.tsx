import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { chromeBlurTint } from "@/shared/theme/blur";
import { HAS_LIQUID_GLASS } from "@/shared/theme/glass";

/**
 * iOS 26 ALTINDAKİ cam butonların ZEMİNİ — `glassFallback()` ile ÇİFT.
 *
 * İş bölümü: kenarı (ve istenirse düz dolguyu) SwiftUI zincirindeki
 * `glassFallback()` çiziyor, zemini bu bileşen. Sebebi @expo/ui'nin sınırı:
 * `background()` modifier'ı YALNIZCA hex renk alıyor (SwiftUI'ın
 * `.background(.ultraThinMaterial)` malzemesi JS'e açılmamış), `blur(radius)`
 * ise arkadaki içeriği değil view'ın KENDİSİNİ — yani glif'i de — bulanık
 * çiziyor. Gerçek bir arka-plan bulanıklığı bu yüzden ancak RN tarafındaki
 * `BlurView`den gelebiliyor: Host'un ARKASINA değil, SARMALAYICISI olarak.
 *
 * iOS 26+'da hiç sarmalamıyor (`HAS_LIQUID_GLASS` → children'ı olduğu gibi
 * döndürür): native cam kendi zeminini de kenarını da çiziyor, altına konan
 * her katman onu bozar (bkz. shared/theme/glass.ts ve ToastShell notları).
 *
 * ── Ölçü sözleşmesi ────────────────────────────────────────────────────────
 * `width`/`height` VER, kutusu sabit olan her butonda. Sarmalayıcı normal bir
 * View gibi davranıyor: `alignItems: "stretch"` olan bir kapta (RN varsayılanı)
 * ölçü verilmezse butondan geniş yayılır ve bulanıklık kenardan taşar.
 * Ölçü yalnızca genişliği SwiftUI etiketinden gelen (`Host matchContents`)
 * kapsül butonlarda atlanır — orada Host zaten içeriğine göre daralıyor ve
 * kap `alignItems: "center"` olduğu için sarmalayıcı da onunla daralıyor.
 *
 * `frame({ maxWidth, alignment })` ile kutusu BİLEREK butondan geniş bırakılan
 * (AppModal'ın metin butonu, ProfileScreen'in "Profili Düzenle"si) yerlerde
 * KULLANMA: oralarda görünen kapsülün genişliği yalnız SwiftUI'ın bildiği bir
 * şey, bulanıklık kutunun şeffaf kalan kısmını da boyar. Onlar `glassFallback`
 * içindeki düz dolguyla (`glassFallbackFill()`) kalmalı.
 */

type Props = {
  /** Kırpma şekli — `glassFallback()`e verilen `shape` ile AYNI olmalı. */
  shape?: "capsule" | "circle" | "roundedRectangle";
  /** shape === "roundedRectangle" için köşe yarıçapı. */
  cornerRadius?: number;
  /** Butonun sabit kutusu — bkz. yukarıdaki ölçü sözleşmesi. */
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Chrome bandlarındaki 15'ten yüksek, bilerek: orada blur bir perde, burada
 * butonun KENDİSİ. Düz zeminde (bulanıklaştıracak içerik yokken) butonu
 * zeminden ayıran tek şey malzemenin kendi tonu.
 */
const GLASS_FALLBACK_BLUR_INTENSITY = 60;

export default function GlassFallbackSurface({
  shape = "capsule",
  cornerRadius = 8,
  width,
  height,
  style,
  children,
}: Props) {
  if (HAS_LIQUID_GLASS) return <>{children}</>;

  return (
    <BlurView
      // chrome malzemesi: bu butonlar başlık/sheet chrome'unun parçası ve
      // tint modla dönüyor (bkz. shared/theme/blur.ts).
      tint={chromeBlurTint()}
      intensity={GLASS_FALLBACK_BLUR_INTENSITY}
      style={[
        {
          width,
          height,
          // circle ve capsule'ün ikisi de tam yuvarlak: kare kutuda 999 zaten
          // daire veriyor.
          borderRadius: shape === "roundedRectangle" ? cornerRadius : 999,
          borderCurve: "continuous",
          // Bulanıklığı şekle kırpan ŞEY bu — olmadan BlurView kare kalıyor.
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}
