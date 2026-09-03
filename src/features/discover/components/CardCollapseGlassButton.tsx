import { memo } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { Host, Button as SwiftUIButton, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityLabel as a11yLabel,
  buttonBorderShape,
  buttonStyle,
  frame,
  glassEffect,
} from "@expo/ui/swift-ui/modifiers";
import { ArrowUp } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors as theme, withAlpha } from "@/shared/theme/colors";
import { glassFallback } from "@/shared/theme/glass";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";
import { SUPER_LIKE_GLASS_SIZE } from "./SuperLikeGlassButton";

/**
 * Açık kartın SOL ÜST köşesindeki cam "başa dön" butonu — sticky şeritte,
 * ismin solunda.
 *
 * Kartı kapatan kontrol kapak fotoğrafının dibindeki oktu; aşağı kaydırınca o
 * ok akıp gidiyor ve kullanıcının elinde tek çıkış olarak jest kalıyordu. Bu
 * buton onun ŞERİTTEKİ karşılığı: aynı işi yapıyor (önce başa scroll, sonra
 * collapse) ve şeritle birlikte, yani tam okun kaybolduğu eşikte beliriyor.
 *
 * Ölçüsü/ekseni sağdaki süper beğeni butonuyla AYNI (bkz. SUPER_LIKE_GLASS_*):
 * şeridin iki ucunda aynı çapta iki daire, aynı dikey merkezde. Ölçüyü oradan
 * import ediyor — ayrı bir sabit tutulsa biri büyüyünce şerit asimetrik kalır.
 *
 * Kabuk kuralları SuperLikeGlassButton ailesinden (gerekçeleri orada):
 *   • Host'a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor.
 *   • Glif SwiftUI'ın İÇİNE `RNHostView` ile gömülüyor, üstüne bindirilmiyor:
 *     iOS 26'nın basış animasyonunda cam ile glif birlikte ölçekleniyor.
 *   • `...glassFallback()` en sonda, `frame()`'den SONRA (strokeBorder bir
 *     .overlay — önce gelirse butonun değil label'ın ölçüsünü takip eder).
 *
 * KABUK `buttonStyle` İLE DEĞİL, `glassEffect` İLE ÇİZİLİYOR — tek sebebi
 * BERRAK (clear) camı isteyebilmek: `.glass` buton stili yalnız `regular`
 * malzemeyi veriyor, varyant seçtirmiyor. Zincir bu yüzden `plain` buton +
 * `frame` + `.glassEffect(.clear, in: Circle())`:
 *   - `plain`: sistem kendi kabuğunu/dolgusunu çizmesin, altta yalnız glif
 *     kalsın. Böylece dairenin çapını `frame` belirliyor — sağdaki kardeşinde
 *     çapı label + controlSize payı belirliyordu, ikisi de 44'e çıkıyor.
 *   - `interactive`: basışta camın kendi tepkisi (`.glass` stilinin bedava
 *     verdiği şey) korunsun.
 *   - tint YOK: berrak cam boyanmaz, boyanırsa `regular`dan farkı kalmaz.
 * Sağdaki süper beğeni butonu HÂLÂ `glassProminent`: o bir marka aksiyonu,
 * bu ise gezinme kontrolü — yanında ikincil okunmalı.
 *
 * Fotoğraf üstünde yıkanma riskini şeridin kendi perdesi + blur'u karşılıyor
 * (bkz. CardStickyHeader), buton oranın üstünde duruyor.
 */

/**
 * Sağdaki süper beğeni kabuğundan BÜYÜK (44 → 52), bilerek.
 *
 * Aynı çapta çizildiğinde bu buton gözle daha küçük duruyordu: kardeşi
 * tint'li `glassProminent` — dolu, opak bir disk; bu ise berrak cam, yani
 * arkasındaki fotoğrafı gösteren ince bir halka. Aynı sayı iki farklı
 * malzemede aynı ağırlığı vermiyor, fark payla kapatılıyor.
 *
 * MERKEZ KAYMIYOR: şerit butonu yarım fark kadar sola/yukarı alarak
 * yerleştiriyor (bkz. CardStickyHeader), iki daire aynı dikey eksende ve
 * köşelerden aynı optik uzaklıkta kalıyor.
 */
export const CARD_COLLAPSE_GLASS_SIZE = SUPER_LIKE_GLASS_SIZE + 8;

/**
 * SwiftUI butonunun LABEL kutusu. Cam kabuk label'ı sarıyor, yani kabuğun
 * görünen ölçüsünü bu belirliyor — `frame()` tek başına yetmiyor.
 *
 * BU YÜZDEN OKUN ÖLÇÜSÜNDEN AYRI: ikisi tek sabitken oku küçültmek butonu da
 * küçültüyordu. Oku küçültmek istiyorsan ICON_SIZE'ı oynat, burayı DEĞİL.
 *
 * DOĞRUDAN ÇAPA EŞİT, sağdaki kardeşinin ortak label kutusuna (17+pay) DEĞİL:
 * o buton kabuğunu `buttonStyle("glassProminent")` ile çiziyor ve stil, label'ın
 * çevresine controlSize payını kendi ekliyor (17 → 44). Bu buton ise berrak cam
 * için `plain` + `glassEffect` kullanıyor (gerekçe dosyanın başında); orada
 * hiçbir sistem payı eklenmiyor, cam label'ın kutusu neyse o oluyor. Ortak
 * kutuyu paylaştığı sürece bu daire 21pt kalıyordu — şeridin iki ucu farklı
 * çapta. Payı sistem eklemediği için ölçüyü doğrudan buraya yazıyoruz.
 */
const GLYPH_BOX = CARD_COLLAPSE_GLASS_SIZE;

/**
 * Çizilen okun kendisi — kutunun içinde ortalı, ondan küçük. Kalpten ufak
 * olması bilerek: kalp kutlamanın dolu silueti, bu ise nötr bir gezinme oku;
 * aynı ölçüde çizilince kabuğun içini doldurup bir aksiyon kadar bağırıyordu.
 *
 * Kutu artık kabuğun çapı kadar (44), yani ok rahat rahat içinde: kabuğu
 * büyütmeden oku büyütmek = sadece bu sabiti oynat.
 *
 * 22 → 13 → 17 → 22 → 19: kabuk 40'a inerken kutuya sığsın diye düşmüştü,
 * işaret fazla ufak kaldığı için geri büyüdü, sonra kalbin yanında fazla
 * bağırdığı için bir tık geri alındı. Kalple arasındaki fark açıldı (29 vs 19).
 */
const ICON_SIZE = 19;

function Glyph() {
  return (
    // pointerEvents none: dokunmayı SwiftUI butonu karşılasın, RNHostView'ın
    // iliştirdiği touch handler araya girmesin.
    <View
      // Kutu SABİT (kabuğun ölçüsü buna bağlı), ok onun içinde ortalı.
      style={{
        width: GLYPH_BOX,
        height: GLYPH_BOX,
        alignItems: "center",
        justifyContent: "center",
      }}
      pointerEvents="none"
    >
      {/* Renk `text`: şerit uygulama chrome'u (foto değil), açık modda siyah
          koyu modda beyaz — kartın kendi ok'u (`onMedia`, sabit beyaz) foto
          üstünde durduğu için orada farklı. */}
      <SFIcon
        name="arrow.up"
        fallback={ArrowUp}
        size={ICON_SIZE}
        color={theme.text}
        strokeWidth={2.4}
        weight="semibold"
      />
    </View>
  );
}

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
};

function CardCollapseGlassButton({ onPress, label }: Props) {
  if (Platform.OS === "ios") {
    return (
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      // Buradaki bulanıklığın gerçekten bulanıklaştıracak bir şeyi var: buton
      // kart fotoğrafının üstünde duruyor.
      <GlassFallbackSurface
        shape="circle"
        width={CARD_COLLAPSE_GLASS_SIZE}
        height={CARD_COLLAPSE_GLASS_SIZE}
      >
        <Host
          // Sağ üstteki süper beğeni kabuğuyla aynı sebep: bu buton da açık
          // kartta safe-area çizgisinin üstünde duruyor, host'un kendi payını
          // uygulaması camı aşağı itip kart oynayınca yukarı sıçratıyor
          // (gerekçenin uzunu SuperLikeGlassButton'da).
          ignoreSafeArea="container"
          style={{
            width: CARD_COLLAPSE_GLASS_SIZE,
            height: CARD_COLLAPSE_GLASS_SIZE,
          }}
        >
          <SwiftUIButton
            onPress={onPress}
            modifiers={[
              // Sistem kabuğu YOK: daireyi aşağıdaki glassEffect çiziyor.
              buttonStyle("plain"),
              buttonBorderShape("circle"),
              frame({
                width: CARD_COLLAPSE_GLASS_SIZE,
                height: CARD_COLLAPSE_GLASS_SIZE,
              }),
              // Berrak cam.
              //
              // ÇAPI BU MODİFİER BELİRLEMİYOR: cam, label'ın kutusunu sarıyor
              // (bkz. GLYPH_BOX) — `frame` yalnız o kabuğa yetecek kutuyu
              // ayırıyor. Kutu 21'de bırakıldığında daire de 21 çıkıyordu,
              // sağdaki kardeşinin yarısı kadar; büyütmek için oynatılacak yer
              // GLYPH_BOX.
              glassEffect({
                glass: { variant: "clear", interactive: true },
                shape: "circle",
              }),
              a11yLabel(label),
              // iOS 26 altında glassEffect sessizce no-op → kabuğun KENARINI
              // biz çiziyoruz, zemini sarmalayıcı.
              ...glassFallback({ shape: "circle" }),
            ]}
          >
            <RNHostView matchContents>
              <Glyph />
            </RNHostView>
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    );
  }

  // Android: cam yok → iOS 26 altındaki fallback'in aynısı, düz daire.
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: CARD_COLLAPSE_GLASS_SIZE,
        height: CARD_COLLAPSE_GLASS_SIZE,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(theme.text, 0.08),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairlineStrong,
      }}
    >
      <Glyph />
    </TouchableOpacity>
  );
}

export default memo(CardCollapseGlassButton);
