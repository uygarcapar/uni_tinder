import { memo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Host, Button as SwiftUIButton, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityLabel as a11yLabel,
  buttonBorderShape,
  buttonStyle,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { RotateCcw } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors as theme, withAlpha } from "@/shared/theme/colors";
import { HAS_LIQUID_GLASS } from "@/shared/theme/glass";

/**
 * Kaçırılan eşleşme kartının SAĞ ÜST köşesindeki cam kurtarma butonu.
 *
 * Kurtarma zaten kartı sola çekince açılan kolonda var; bu buton onun
 * KISAYOLU — listedeki tek anlamlı aksiyon o ve jesti keşfetmemiş kullanıcı
 * kartın üstünde hiçbir çıkış görmüyordu. İkisi aynı `onRecover`ı çağırıyor.
 *
 * Kabuk SuperLikeGlassButton ailesinden (iOS 26 liquid glass), ölçüsü küçük:
 * burası bir kart köşesi, kartın kapladığı alanla yarışmamalı. Kopyalanan
 * kurallar (gerekçeleri SuperLikeGlassButton'da):
 *   • Host'a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor.
 *   • Glif SwiftUI'ın İÇİNE `RNHostView` ile gömülüyor, üstüne bindirilmiyor:
 *     iOS 26'nın basış animasyonunda cam ile glif birlikte ölçekleniyor.
 *
 * Stil `.glass` DEĞİL `.glassProminent`: buton bir FOTOĞRAFIN üstünde duruyor
 * ve sade cam neredeyse berrak kalıyor — parlak bir kapakta glif yıkanırdı.
 * Tint `litPlus`: kolondaki kurtar glifiyle AYNI renk, iki giriş de tek
 * aksiyon olarak okunsun.
 *
 * ⚠️ SwiftUI YOLUNA KAPI `HAS_LIQUID_GLASS`, `Platform.OS === "ios"` DEĞİL.
 * iOS 26 altında bu buton SwiftUI'dan HİÇBİR ŞEY kazanmıyordu: `glassProminent`
 * sessizce `.automatic`'e düşüyor ve dolgu + kontur zaten elle çiziliyordu
 * (eski `glassFallback(...)` zinciri). Karşılığında getirdiği ŞEY bir hataydı —
 * `Host`un SwiftUI içeriği kartın köşesinde RN kutusunun oturduğu yere
 * oturmuyor, daire yukarı kayıp kartın `overflow: hidden` üst kenarında
 * kırpılıyordu (canlıda görüldü: kabuk düzgün konumlanmış RN kutusunun ~yarıçap
 * kadar üstünde çiziliyor). Aynı görünümü RN tarafı birebir veriyor ve orada
 * konum kartın kendi layout'undan geliyor.
 * Bu yüzden ALTTAKİ RN dalı artık yalnız Android değil, camsız HER yol.
 */

/**
 * Cam kabuğun dış ölçüsü. Kartın köşesindeki TÜM cam butonlar bunu paylaşıyor
 * (bkz. LikesScreen > CARD_CORNER_GLASS_SIZE): kurtar ve beğen aynı köşenin
 * sekmeye göre değişen iki hâli.
 *
 * Ölçü kolondaki geç/beğen ikilisiyle (ACTION_BUTTON_SIZE) AYNI: ekranda tek
 * bir cam buton ailesi olsun, köşedeki kısayol kolondakinin küçültülmüş bir
 * kopyası gibi durmasın. Kartın 40'lık köşe yarıçapına da sığıyor — merkez
 * yeterince içeride kaldığı için kabuk köşe yayının dışına taşmıyor.
 *
 * ⚠️ CAMSIZ YOLDA DAHA KÜÇÜK (iOS 26 altı + Android). 72 sayısı LIQUID GLASS'ın
 * ölçüsü: cam yarı saydam, altındaki fotoğrafı geçiriyor ve kenarı yalnız bir
 * kırılma olarak okunuyor — o çapta bile kartın üstünde hafif duruyor.
 * Fallback ise aynı çapta DÜZ ve OPAK bir disk (dolu zemin + kontur); aynı 72
 * orada fotoğrafın köşesini yiyen kocaman bir leke gibi okunuyor. Bu yüzden
 * ölçü camın VARLIĞINA bağlı, platforma değil: Android'in fallback'i de birebir
 * aynı düz disk.
 *
 * 48, 44'lük dokunma hedefinin üstünde; RN dalının `hitSlop`u da (8) üstüne
 * biniyor, yani küçülme basılabilirlikten çalmıyor.
 */
export const RECOVER_GLASS_SIZE = HAS_LIQUID_GLASS ? 72 : 48;

/**
 * Kabuğun içindeki glif — kabuğa göre BELİRGİN küçük (72'ye 28, ~0.39).
 * Dock'un kendi oranı (0.475) bu çapta glifi camın kenarına kadar getiriyordu
 * ve kabuk bir halkaya dönüşüyordu; köşedeki buton fotoğrafın üstünde durduğu
 * için etrafındaki cam payı okunurluğun bir parçası.
 *
 * Köşedeki tik butonu da bu ölçüyü kullanıyor (bkz. LikesScreen >
 * CARD_CORNER_GLYPH_SIZE): aynı köşede dönüşümlü çizilen iki buton, glifleri
 * ayrışırsa sekme değiştirince işaret büyüyüp küçülüyormuş gibi okunur.
 *
 * Camsız yolda kabukla birlikte küçülüyor ama ORANI BİRAZ BÜYÜYOR (0.39 → 0.44):
 * oranı birebir korumak glifi 19'a düşürüyordu ve düz zeminde — camın kendi
 * kırılması olmadan — o ölçüde işaret siliniyor. Kenar payı hâlâ kabuğun bir
 * halkaya dönmesine yetecek kadar geniş.
 */
export const RECOVER_GLASS_GLYPH_SIZE = HAS_LIQUID_GLASS ? 28 : 21;

/**
 * ⚠️ BEKLEME DURUMU YOK (2026-09-02'de kaldırıldı). Burada bir zamanlar `busy`
 * prop'u vardı: istek uçarken glif `ActivityIndicator`a dönüyor, buton da
 * basılamaz oluyordu. Kaldırılma sebebi ekranın kendisi — kurtarma artık
 * beğeniyle AYNI biçimde fire-and-forget gidiyor ve kart aynı karede kutlamayla
 * düşüyor (bkz. LikesScreen > handleRecover). Bekleyecek bir şey kalmayınca
 * spinner'ın anlattığı şey de yalan oluyordu.
 */
function Glyph() {
  return (
    // pointerEvents none: dokunmayı SwiftUI butonu karşılasın, RNHostView'ın
    // iliştirdiği touch handler araya girmesin.
    <View
      style={{
        width: RECOVER_GLASS_GLYPH_SIZE,
        height: RECOVER_GLASS_GLYPH_SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
      pointerEvents="none"
    >
      <SFIcon
        name="arrow.counterclockwise"
        fallback={RotateCcw}
        size={RECOVER_GLASS_GLYPH_SIZE}
        color={theme.onMedia}
        strokeWidth={2.6}
        weight="bold"
      />
    </View>
  );
}

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
};

function RecoverGlassButton({ onPress, label }: Props) {
  if (HAS_LIQUID_GLASS) {
    return (
      <Host style={{ width: RECOVER_GLASS_SIZE, height: RECOVER_GLASS_SIZE }}>
        <SwiftUIButton
          onPress={onPress}
          modifiers={[
            buttonStyle("glassProminent"),
            buttonBorderShape("circle"),
            tint(theme.litPlus),
            frame({ width: RECOVER_GLASS_SIZE, height: RECOVER_GLASS_SIZE }),
            a11yLabel(label),
          ]}
        >
          <RNHostView matchContents>
            <Glyph />
          </RNHostView>
        </SwiftUIButton>
      </Host>
    );
  }

  // Cam YOKSA (iOS 26 altı + Android): düz daire, tamamen RN. Gerekçesi
  // dosyanın başındaki "SwiftUI yoluna kapı" notunda — burada SwiftUI'ın
  // vereceği bir şey yok, konumlanma hatası ise var.
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: RECOVER_GLASS_SIZE,
        height: RECOVER_GLASS_SIZE,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.litPlus,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withAlpha(theme.onMedia, 0.35),
      }}
    >
      <Glyph />
    </TouchableOpacity>
  );
}

export default memo(RecoverGlassButton);
