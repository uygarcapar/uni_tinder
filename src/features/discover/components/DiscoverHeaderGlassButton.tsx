import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  Host,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier as a11yId,
  accessibilityLabel as a11yLabel,
  Animation,
  animation,
  buttonStyle,
  contentTransition,
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
import { DISCOVER_HEADER_INK_FADE_MS } from "./discoverHeaderMetrics";

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
  /**
   * Butonun ARDINDA fotoğraf değil düz uygulama zemini (`colors.surface`) var —
   * pratikte deste tükenmiş, altta EmptyDiscoverCard duruyor.
   *
   * Mürekkebi `onMedia`dan tema mürekkebine çeviriyor. Gerekçe: berrak cam
   * (`clear` variant) zeminini neredeyse hiç koyulaştırmıyor, yani açık modda
   * beyaz glif beyaz zeminde kayboluyor — `darkColors`ın "camın üstü her iki
   * modda koyudur" varsayımı tam olarak BURADA tutmuyor.
   *
   * ⚠️ YALNIZ LIQUID GLASS YOLUNU ETKİLER: 26 altında ve Android'de
   * `glassOnMediaInk()` zaten `colors.text` döndürüyor, yani glif oralarda
   * hiçbir zaman beyaz değildi (bu yüzden o dalda animasyona da gerek yok).
   */
  onSurface?: boolean;
  /**
   * GLİF DEVREDİLİYOR — buton yerinde kalıp sembolünü değiştiriyor.
   *
   * Verilmezse `systemName` değişimi ANINDA oluyor (Keşif'in butonları
   * sembollerini hiç değiştirmiyor, oralarda gereksiz). Verildiğinde glif
   * çapraz sönümle devrediyor; DEĞER HER SEMBOL DEĞİŞİMİNDE DEĞİŞMEK ZORUNDA,
   * çünkü SwiftUI'ın `.animation(_:value:)`i tetiklemek için eşitlenebilir bir
   * sayı istiyor — sembol ADI oraya geçemiyor (modifier yalnız number/boolean
   * alıyor).
   *
   * ⚠️ NEDEN BU KADAR DOLAMBAÇLI: butonun kabuğu SwiftUI camı ve camın atası
   * bir transform/opacity animasyonu göremiyor (proje notu) — yani "eskisini
   * söndür, yenisini aç" diye iki buton üst üste BİNDİRİLEMEZ. Devir, tek bir
   * mount'un içinde native tarafta olmak zorunda.
   *
   * Akış ekranı bunu kullanıyor: filtre↔X ve kalem↔artı, tam ekran haritaya
   * geçerken (bkz. FeedScreen > üst köşe butonları).
   */
  symbolPhase?: number;
  /**
   * e2e seçicisi. SwiftUI tarafında `accessibilityIdentifier`
   * modifier'ına, Android/iOS<26 dalında `testID` prop'una gidiyor —
   * yani aynı seçici iki yolda da çalışıyor.
   */
  testID?: string;
};

function DiscoverHeaderGlassButton({
  testID,
  systemName,
  fallback,
  onPress,
  label,
  badge,
  dimmed = false,
  size = DISCOVER_HEADER_GLASS_SIZE,
  onSurface = false,
  symbolPhase,
}: Props) {
  // Mürekkep FOTO ÜSTÜ: iki buton da kapak fotoğrafının üstünde yüzüyor, yani
  // açık modda da beyaz (gerekçe ve 26-altı dalı `glassOnMediaInk`in yanında).
  // Tek istisna `onSurface` — arkada fotoğraf kalmadığında tema mürekkebi.
  const ink = onSurface ? theme.text : glassOnMediaInk();
  const glyphColor = dimmed ? withAlpha(ink, 0.35) : ink;

  /**
   * SwiftUI `.animation(_:value:)`in eşitlenebilir anahtarı — İKİ devri de tek
   * modifier sürüyor: mürekkebin rengi (`onSurface`) ve glifin kendisi
   * (`symbolPhase`).
   *
   * İkisi için ayrı `animation` modifier'ı YAZILMIYOR: zincir baştan sona
   * reduce ediliyor ve iki `.animation` üst üste binince dıştaki, içtekinin
   * kapsamını da yeniden sarıyor — aynı değişimi iki kez animasyonlamak camın
   * basış morph'uyla çakışma riskini artırıyor. Tek anahtar ikisini de
   * ayırt ediyor (`symbolPhase` her değişiminde toplamı kaydırıyor).
   */
  const animKey = (onSurface ? 1 : 0) + (symbolPhase ?? 0) * 2;

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
              ...(testID ? [a11yId(testID)] : []),
              ...glassFallback({ shape: "circle" }),
            ]}
          >
            <SwiftUIImage
              systemName={systemName}
              color={glyphColor}
              modifiers={[
                // ⚠️ `animation`DAN ÖNCE, yani ondan DAHA İÇTE: içeriğin
                // (sembolün) kendi geçişini tanımlıyor, animasyon onu sarıp
                // süreyi veriyor. Dışta kalsaydı değişen içerik animasyonun
                // kapsamına girmeden anında takas edilirdi.
                //
                // Yalnız devri İSTENEN butonlarda: `symbolPhase` verilmemişse
                // sembol hiç değişmiyor (Keşif) ve modifier gereksiz.
                ...(symbolPhase === undefined
                  ? []
                  : [contentTransition("opacity")]),
                // MÜREKKEBİN (VE SEMBOLÜN) DEVRİ YUMUŞAK. Glif native bir
                // SwiftUI Image; rengi de sembolü de RN stili değil bir PROP —
                // Reanimated'in dokunabileceği bir yüzey yok, o yüzden geçişi
                // SwiftUI'ın kendi `.animation(_:value:)`i sürüyor (süre saniye
                // cinsinden).
                //
                // ZİNCİRİN BAŞINDA, yani SwiftUI tarafında EN İÇTE: sadece ham
                // Image'ı (rengini ve içeriğini) sarıyor. Sona konsa
                // `glassEffect` + `strokeBorder` de bu animasyonun kapsamına
                // girerdi — camın kendi basış morph'unu ikinci bir animasyonla
                // çakıştırmak istemiyoruz (sıra kuralı: dizi baştan sona
                // reduce ediliyor).
                animation(
                  Animation.easeOut({
                    duration: DISCOVER_HEADER_INK_FADE_MS / 1000,
                  }),
                  animKey,
                ),
                ...glassIconClearGlyph(size),
              ]}
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
