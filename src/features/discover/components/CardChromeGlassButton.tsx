import { memo } from "react";
import { Platform, StyleSheet, TouchableOpacity } from "react-native";
import {
  Host,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier as a11yId,
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
 * Açık kartın ÜST KÖŞELERİNDEKİ cam ikon butonu — sticky şeritte, ismin iki
 * yanında. İki somut kullanıcısı var ve ikisi de yalnız GLİFTE ayrılıyor:
 *
 *   CardCloseGlassButton — SOL üst, "xmark": kartı kapatır.
 *   CardMenuGlassButton  — SAĞ üst, "ellipsis": profil menüsünü açar.
 *
 * SOHBET BAŞLIĞINDAKİ BUTONLARIN AYNISI, kopyası değil: zinciri de ölçüsü de
 * uygulamanın ortak berrak cam ikon butonundan geliyor (`glassIconClearGlyph` +
 * `GLASS_ICON_CLEAR_SIZE`) — profildeki çan/ayarlar, Bildirimler'deki geri ve
 * sohbetteki geri/menü ile tek aile. Sheet'ten açılan profil önizlemesinde
 * kullanıcı aynı butonu aynı yerde bulmalı: ekranın başlığı kartın şeridine
 * dönüşüyor, butonlar onunla birlikte oraya taşınıyor.
 *
 * TEK DOSYADA, İKİ SARMALAYICIYLA: iki buton arasındaki tek fark bir SF Symbol
 * adı; kabuk ayrı ayrı yazılsaydı biri düzeltilip diğeri unutulduğunda şeridin
 * iki ucu farklı görünürdü (aynı tuzağın uzunu GLASS_ICON_CLEAR_SIZE'da).
 *
 * Kabuk kuralları:
 *   • Host'a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor.
 *   • `ignoreSafeArea="container"`: butonlar açık kartta safe-area çizgisinin
 *     üstünde duruyor, host'un kendi payı camı aşağı itiyor.
 *   • `...glassFallback()` en sonda: strokeBorder bir .overlay, `frame`'den
 *     önce gelirse butonun değil label'ın ölçüsünü takip eder.
 *
 * Glif SwiftUI'ın KENDİ `Image`'ı (RNHostView değil): ortak zincir camı zaten
 * glifin üstüne takıyor ve dokunma alanını `contentShape` ile o kutuya
 * genişletiyor — sohbet başlığındaki butonlar da birebir böyle kurulu.
 */

/** Kabuğun dış ölçüsü — ortak cam ikon butonuyla AYNI. */
export const CARD_CHROME_GLASS_SIZE = GLASS_ICON_CLEAR_SIZE;

/**
 * Android / iOS 26 altı dalındaki lucide glifinin puntosu. iOS 26'da
 * KULLANILMIYOR: orada punto ortak zincirden geliyor (bkz.
 * GLASS_ICON_BUTTON.icon) — bu sayı yalnız SFIcon'un fallback yolunu besliyor.
 */
export const CARD_CHROME_FALLBACK_ICON_SIZE = 22;
const FALLBACK_ICON_SIZE = CARD_CHROME_FALLBACK_ICON_SIZE;

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glif var. */
  label: string;
  /** iOS'ta çizilen SF Symbol. */
  systemName: SFSymbol;
  /** SF Symbol yoksa (Android) çizilecek lucide bileşeni. */
  fallback: LucideIcon;
  /**
   * Kabuğun çapı — varsayılan uygulamanın ortak cam ikon ölçüsü.
   *
   * Keşif'in kart chrome'u kendi (daha iri) sayısını geçiyor: orada butonlar bir
   * FOTOĞRAFIN üstünde duruyor ve üst chrome devrinde birbirinin yerini alıyor,
   * yani hepsi tek çapta olmak zorunda (bkz. DISCOVER_GLASS_BUTTON_SIZE).
   * Önizleme sheet'leri varsayılanda kalıyor — oradaki şerit uygulamanın başlık
   * butonlarıyla aynı aileden.
   *
   * ÜÇ YERE BİRDEN gidiyor: fallback zemini, Host'un kutusu ve cam zincirinin
   * `frame`i (glassIconClearGlyph). Biri atlanırsa daire ile dokunma alanı ya da
   * 26-altı zemin ayrışıyor.
   */
  size?: number;
  /**
   * Buton bir FOTOĞRAFIN üstünde duruyor → glif tema mürekkebi yerine `onMedia`
   * (bkz. glassOnMediaInk). Keşif'in kapak kolonu veriyor: oradaki üç nokta
   * fotoğraftan hiç taşmıyor.
   *
   * ÖNİZLEME ŞERİTLERİ DE VERİYOR (Beğeniler / Sohbet / Profil, bkz.
   * CardStickyHeader): butonlar şeridin içinde duruyor ve o bandın malzemesi iki
   * temada da kapağın KOYU rampası — şeridin isim satırı da aynı gerekçeyle
   * `theme.onMedia`. Bir dönem vermiyorlardı ve gerekçe "kapat/üç nokta
   * kaydırmayla panelin kendi zeminine geçiyor, beyaz glif açık modda
   * kaybolur"du; pratikte isim satırı zaten beyaz kaldığı için açık modda aynı
   * bandın üstünde yazı beyaz, iki köşedeki glif siyah çiziliyordu.
   */
  onMedia?: boolean;
  /**
   * ⚠️ GLİF PUNTOSU PROP'U YOK (2026-10-27'de kaldırıldı). Bir dönem
   * `glyphSize` vardı ve yalnız Keşif kapağının karar ikilisi (tik · X) daha
   * iri bir sayı geçiyordu; istek üzerine o ikili de kaydırınca şeridin sağ
   * ucunda beliren tikle aynı puntoya döndü (bkz. SwipeCard > "GLİF PUNTOSU
   * İÇİN AYRI SABİT YOK"), yani bu kabuğun TÜM kullanıcıları ortak sayıda.
   *
   * Punto artık tek kaynaktan: camlı yolda `GLASS_ICON_BUTTON.icon` (ortak
   * zincirden, glassIconClearGlyph), camsız yolda FALLBACK_ICON_SIZE. Geri
   * gerekirse iki yola BİRDEN verilmeli — biri atlanırsa aynı işaret iOS 26
   * ile Android'de ayrışır.
   */
  /**
   * Verilirse kabuk berrak cam değil BU RENGE boyalı cam olur ve glif beyaza
   * (`onMedia`) sabitlenir — Beğeniler'in kart köşesindeki kırmızı tikin
   * (CardActionGlassButton, variant "prominent") bu kabuktaki karşılığı.
   *
   * Çap ve dokunma alanı berrak kardeşleriyle aynı kalıyor; nasıl olduğu
   * glassIconClearGlyph > `surfaceTint` notunda.
   */
  surfaceTint?: string;
  /**
   * e2e seçicisi. SwiftUI tarafında `accessibilityIdentifier`
   * modifier'ına, Android/iOS<26 dalında `testID` prop'una gidiyor —
   * yani aynı seçici iki yolda da çalışıyor.
   */
  testID?: string;
};

function CardChromeGlassButton({
  testID,
  onPress,
  label,
  systemName,
  fallback,
  size = CARD_CHROME_GLASS_SIZE,
  onMedia = false,
  surfaceTint,
}: Props) {
  // Boyalı kabukta mürekkep SABİT beyaz: tint iki temada da aynı ton (kartın
  // kırmızı/yeşil aksiyon rengi), tema metni üstünde okunmazdı.
  const ink = surfaceTint
    ? theme.onMedia
    : onMedia
      ? glassOnMediaInk()
      : theme.text;

  if (Platform.OS === "ios") {
    return (
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      // Buradaki bulanıklığın gerçekten bulanıklaştıracak bir şeyi var: buton
      // kart fotoğrafının üstünde duruyor.
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
              // Kabuk YOK, berrak cam glifin üstünde — daireyi de dokunma
              // alanını da o zincir taşıyor; bkz. glassIconClearGlyph.
              buttonStyle("plain"),
              tint(ink),
              frame({ width: size, height: size }),
              // label prop'u yok (glif children olarak veriliyor) → erişilebilir
              // ad modifier'dan gelmeli, yoksa VoiceOver butonu isimsiz okuyor.
              a11yLabel(label),
              ...(testID ? [a11yId(testID)] : []),
              // 26 ALTINDA cam no-op → boyalı kabuğu biz çiziyoruz: aynı renk,
              // camsız düz daire (FireGlassButton'ın prominent fallback'iyle
              // aynı kural). Berrak yolda dolgu YOK, yalnız ince kenar.
              ...glassFallback(
                surfaceTint
                  ? {
                      shape: "circle",
                      backgroundColor: surfaceTint,
                      borderColor: withAlpha(theme.onMedia, 0.35),
                    }
                  : { shape: "circle" },
              ),
            ]}
          >
            <SwiftUIImage
              systemName={systemName}
              color={ink}
              // Punto geçilmiyor: ortak cam ikon butonunun sayısı (bkz.
              // Props > "GLİF PUNTOSU PROP'U YOK").
              modifiers={glassIconClearGlyph(size, { surfaceTint })}
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
      testID={testID}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: surfaceTint ?? withAlpha(theme.text, 0.08),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: surfaceTint
          ? withAlpha(theme.onMedia, 0.35)
          : theme.hairlineStrong,
      }}
    >
      <SFIcon
        name={systemName}
        fallback={fallback}
        size={FALLBACK_ICON_SIZE}
        color={ink}
        weight="semibold"
      />
    </TouchableOpacity>
  );
}

export default memo(CardChromeGlassButton);
