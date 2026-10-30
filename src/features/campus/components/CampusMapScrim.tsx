import { memo, useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { scrimAt, veil } from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";
import { DISCOVER_GLASS_BUTTON_SIZE } from "@/features/discover/components/discoverHeaderMetrics";

/**
 * TAM EKRAN HARİTANIN ÜST VE ALT PERDESİ — progressive blur.
 *
 * Harita Mapbox'ın SOKAK stili: yol çizgileri, park lekeleri, bina adları.
 * Onun üstünde duran iki şeyin okunması gerekiyor:
 *   • ÜSTTE çıkış butonu (cam X),
 *   • ALTTA kampüs anları şeridi (başlık + kutular).
 * Düz alfalı bir perde dokuyu soluklaştırıp DESENİNİ bırakıyor — ince beyaz
 * yol çizgileri metnin harflerinin arasından geçiyor. Blur deseni ÇÖZÜYOR.
 *
 * ── İKİ BANT, İKİ MALZEME (`tone`) ────────────────────────────────────────
 * Maske ikisinde de `CardStickyHeader`ın duraklarıyla (0.99 → black →
 * transparent); AYRIŞAN ŞEY ZEMİN:
 *
 *   `media`  (ALT bant) — `scrimAt(0.42) → scrimAt(0.10)` + blur 22 "dark",
 *            yani iki temada da SİYAH. Altında anlar şeridinin kutuları, yani
 *            FOTOĞRAFLAR var ve beyaz bir perde onları yıkıyor; şeridin kendi
 *            yazıları da bu yüzden medya mürekkebinde kalıyor.
 *
 *   `chrome` (ÜST bant) — akış sayfasının header blur'uyla BİREBİR (istek:
 *            "en tepedeki progressive siyahlık olmasın, açık modda beyaz
 *            olsun"): `veil(0.92) → veil(0.15)` + `chromeBlurTint()`. Bu bant
 *            fotoğraf değil, UYGULAMA CHROME'U taşıyor — başlık ("Anlar") ve
 *            iki cam köşe butonu. `FeedMapStrip`in üst blur'u akışta aynı
 *            yerde, aynı sayılarla duruyor; biri açılırken diğeri söndüğü için
 *            ikisi farklı renkte olduğunda geçişte ten değişiyordu.
 *
 * ⚠️ PERDEYİ ÇEVİRİNCE ÜSTÜNDEKİ MÜREKKEP DE ÇEVRİLMEK ZORUNDA (`veil`in
 * kendi uyarısı): üst bandın başlığı ve butonları artık TEMA mürekkebinde
 * (bkz. CampusMapTitle ve FeedScreen'deki `onSurface`) — açık modda beyaz
 * perde üstünde beyaz glif kaybolurdu. Alt bant siyah kaldığı için oradaki
 * medya mürekkebi de olduğu gibi duruyor.
 *
 * ── Haritayla birlikte açılıyor ────────────────────────────────────────────
 * Opaklık `progress`ten (yani `mapProgress`): akışta perde YOK, tam ekranda
 * tam. Akışta zaten `FeedMapStrip`in kendi üst blur'u var ve o chrome'u
 * (başlık + pill'ler) koruyor — ikisi üst üste binmesin diye biri açılırken
 * diğeri sönüyor.
 *
 * ⚠️ OPAKLIKLA SÖNDÜRMEK BURADA GÜVENLİ: bu `expo-blur` materyali, SwiftUI
 * `GlassView` DEĞİL (onda ata zincirindeki opacity<1 efekti sessizce hiç
 * çizdirmiyor). Cam X butonu bu katmanın ÇOCUĞU değil, KARDEŞİ — perde onun
 * atası olsaydı buton hiç görünmezdi.
 */

/**
 * Maskenin yumuşaması — `easeGradient` ile. Doğrusal iki duraklı bir maske
 * blur'un bittiği yerde gözle seçilen bir kesim bırakıyor.
 *
 * ⚠️ DURAKLAR `CardStickyHeader` İLE BİREBİR: kenarda tam, SOLID payı bitince
 * şeffafa eriyor. Orada sönüm bandın yarısı; burada ÇAĞIRAN seçebiliyor
 * (`fadePx`) çünkü iki bandın boyu çok farklı — 100pt'lik üst bantta yarım
 * bant iyi bir sönüm, 430pt'lik alt bantta aynı oran blur'u başlığın
 * hizasında sıfıra indiriyordu (kullanıcının gördüğü: "blur başlığa kadar
 * gelmiyor").
 */
function maskFor(solidShare: number) {
  return easeGradient({
    colorStops: {
      0: { color: "rgba(0,0,0,0.99)" },
      [solidShare]: { color: "black" },
      1: { color: "transparent" },
    },
  });
}

/** `media` rampası — kartın başlık şeridi ve kapak dibiyle aynı sayılar. */
const SCRIM_FROM = 0.42;
const SCRIM_TO = 0.1;

/**
 * `chrome` rampası — `FeedMapStrip`in üst blur'uyla (ve `ScreenHeader`ın başlık
 * blur'uyla) AYNI iki sayı. Burada elle başka bir değer yazılırsa akıştan tam
 * ekrana geçişte perdenin tonu atlıyor.
 */
const VEIL_FROM = 0.92;
const VEIL_TO = 0.15;

/** Blur'un gücü — yine aynı reçete. */
const BLUR_INTENSITY = 22;

/**
 * ÜST CHROME'UN SATIRI — cam X ve başlık AYNI merkezde.
 *
 * Keşif'teki kuralın birebir aynısı: `CardStickyHeader`da isim satırı ile
 * köşedeki cam butonlar aynı `top`tan başlıyor ve isim o kutuya dikey
 * ortalanıyor. İki ayrı sayı yazılsaydı üst şeritte iki farklı hizada iki öğe
 * olurdu.
 */
export const CAMPUS_MAP_CHROME_TOP = 6;
export const CAMPUS_MAP_CHROME_ROW = DISCOVER_GLASS_BUTTON_SIZE;

/**
 * Satırın ALTINDA kalan pay — blur'un sönme kuyruğu. `CardStickyHeader`ın
 * `CHROME_BAND_TAIL`ı ile aynı sayı: bant satırla bitseydi cam, yazının hemen
 * altında keskin bir çizgiyle kesilirdi.
 */
const CHROME_BAND_TAIL = 16;

/**
 * ÜST PERDENİN BOYU — Keşif kartının bandının formülü.
 *
 * Orada `bandHeight = rowTop + rowHeight + CHROME_BAND_TAIL` ve bant ekranın
 * 0'ından başlıyor, yani durum çubuğunun arkasını da o örtüyor; satır
 * safe-area'nın altında duruyor. Buradaki karşılığı birebir aynı:
 *
 *     güvenli alan + satırın üst payı + satır + kuyruk
 *
 * ⚠️ BU SAYI ELLE YAZILAMAZ: başlık ve cam X bandın İÇİNDE duruyor. Bant
 * kısaltılırsa satır perdenin dışında kalır (yazı çıplak haritanın üstünde),
 * uzatılırsa şikâyet edilen "yarısı buzlu" levhaya dönüyor.
 */
export function campusMapTopScrimHeight(topInset: number): number {
  return (
    topInset + CAMPUS_MAP_CHROME_TOP + CAMPUS_MAP_CHROME_ROW + CHROME_BAND_TAIL
  );
}

export interface CampusMapScrimProps {
  /** `mapProgress` — 0 akış, 1 tam ekran harita. */
  progress: SharedValue<number>;
  /** Perde ekranın hangi kenarından başlıyor. */
  edge: "top" | "bottom";
  /** Bandın yüksekliği (pt). */
  height: number;
  /**
   * SÖNÜMÜN UZUNLUĞU (pt) — bandın İÇ ucunda maskenin şeffaflaşmaya ayırdığı
   * pay. Verilmezse bandın yarısı (`CardStickyHeader`ın oranı).
   *
   * Alt bant bunu kısa tutuyor: perdenin işi başlığın ve kutuların arkasını
   * yatıştırmak, o yüzden sönüm başlığın ÜSTÜNDE kalan kuyruğa sığmak zorunda.
   */
  fadePx?: number;
  /**
   * ZEMİNİN MALZEMESİ — `media` (sabit siyah) ya da `chrome` (modla dönen).
   * Hangi bandın hangisini aldığı ve neden, dosyanın başında.
   *
   * Varsayılan `media`: perdenin altında fotoğraf varsayımı güvenli olan taraf
   * (yanlış seçilirse beyaz bir perde fotoğrafı yıkıyor, tersi yalnız biraz
   * koyu kalıyor).
   */
  tone?: "media" | "chrome";
}

const CampusMapScrim = memo(function CampusMapScrim({
  progress,
  edge,
  height,
  fadePx,
  tone = "media",
}: CampusMapScrimProps) {
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const isTop = edge === "top";
  // ⚠️ `veil()`/`chromeBlurTint()` MUTABLE paletten okuyor: tema değişiminde
  // kök remount ediliyor (proje notu), yani memo'lu bu bileşen de yeniden
  // doğuyor — değerleri render içinde okumak doğru olan.
  const isChrome = tone === "chrome";

  // ⚠️ Kırpma şart: `fadePx` banttan büyükse `solidShare` negatife düşüyor ve
  // `easeGradient` sıralı olmayan duraklarla sessizce bozuk bir maske üretiyor.
  const mask = useMemo(() => {
    const span = fadePx ?? height / 2;
    const solidShare = Math.min(Math.max(1 - span / Math.max(height, 1), 0), 1);
    return maskFor(solidShare);
  }, [fadePx, height]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          height,
          ...(isTop ? { top: 0 } : { bottom: 0 }),
        },
        fadeStyle,
      ]}
    >
      <MaskedView
        maskElement={
          <LinearGradient
            colors={mask.colors as any}
            locations={mask.locations as any}
            // Maske KENARDAN içeriye sönüyor: üstte yukarıdan aşağı, altta
            // aşağıdan yukarı. `start/end` olmadan iki kenar ters çalışırdı.
            start={{ x: 0.5, y: isTop ? 0 : 1 }}
            end={{ x: 0.5, y: isTop ? 1 : 0 }}
            style={StyleSheet.absoluteFill}
          />
        }
        style={StyleSheet.absoluteFill}
      >
        {/* ZEMİN — `media` dalında sabit siyah, `chrome` dalında moda uyan
            (koyuda siyah, açıkta BEYAZ). Gerekçe dosyanın başında.
            Üstteki maske her iki dalda siyah/şeffaf kalıyor: o bir ALFA
            maskesi, renk değil. */}
        <LinearGradient
          colors={
            isChrome
              ? [veil(VEIL_FROM), veil(VEIL_TO)]
              : [scrimAt(SCRIM_FROM), scrimAt(SCRIM_TO)]
          }
          start={{ x: 0.5, y: isTop ? 0 : 1 }}
          end={{ x: 0.5, y: isTop ? 1 : 0 }}
          style={StyleSheet.absoluteFill}
        />
        <BlurView
          intensity={BLUR_INTENSITY}
          tint={isChrome ? chromeBlurTint() : "dark"}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </Animated.View>
  );
});

export default CampusMapScrim;
