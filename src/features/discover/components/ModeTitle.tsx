import { memo } from "react";
import { TouchableOpacity, View } from "react-native";
import Animated, { cubicBezier } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { ChevronDown } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import type { AppMode } from "../modeTheme";
import { DISCOVER_HEADER_INK_FADE_MS } from "./discoverHeaderMetrics";

/** Güçlü ease-out — girişte/çıkışta hareketin başını hızlı bitirir. */
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** Chevron'un kutusu. SymbolView kendi frame'ini `size`tan kuruyor (kare). */
const CHEVRON_SIZE = 15;

/**
 * Keşif başlığının ORTASINDAKİ mod adı + chevron. Dokunulunca mod seçici
 * sheet'i açılıyor.
 *
 * ── Neden tam burası ────────────────────────────────────────────────────────
 * Keşif'in yüzen header'ı `space-between` ve iki ucunda 48pt'lik cam buton var
 * (sol: geri al, sağ: filtre); ORTASI BOŞ. O boşluk eskiden WaveFillLogo'nun
 * yeriydi, logo kaldırılınca açıkta kaldı — mod adı doğal olarak oraya oturuyor.
 *
 * ⚠️ ABSOLUTE ORTALANIYOR, üçüncü bir flex çocuk DEĞİL. Flex çocuk olsaydı
 * başlığın genişliği iki cam butonu kendi 16pt insets'lerinden kaydırırdı ve
 * kartın sticky şeridi (CardStickyHeader) onlara hizalı olduğu için kart
 * içeriğiyle header arasındaki hiza bozulurdu.
 *
 * ⚠️ `pointerEvents` dengesi: dış kap `box-none` (kartın jestleri ortadan
 * geçebilsin — header `box-none`), DOKUNULABİLİR ALAN yalnız yazının kendisi
 * kadar. Tam genişlik bir dokunma hedefi kartın dikey Fire çekişini yutardı.
 */
const ModeTitle = memo(function ModeTitle({
  mode,
  onPress,
  onSurface = false,
  testID,
}: {
  mode: AppMode;
  onPress: () => void;
  /** e2e seçicisi — mod seçici sheet'inin tetiği. */
  testID?: string;
  /**
   * Başlığın ARDINDA fotoğraf değil düz uygulama zemini (`colors.surface`) var
   * — pratikte deste tükenmiş, altta EmptyDiscoverCard duruyor.
   *
   * Mürekkebi `onMedia`dan tema mürekkebine çeviriyor: açık modda beyaz başlık
   * açık zeminde kayboluyordu. Koyu modda `text` zaten #FFFFFF, yani orada
   * görünür bir fark yok — bayrak MODA DEĞİL ZEMİNE bakıyor, `isLight()` dalı
   * bilerek yok (tek karar noktası: "arkamda fotoğraf var mı").
   */
  onSurface?: boolean;
}) {
  const { t } = useTranslation();

  // Fotoğraf üstündeyken beyaz + gölge, düz zeminde tema mürekkebi + gölgesiz:
  // gölge fotoğrafın okunurluk rampası, düz zeminde koyu yazının altında
  // leke gibi duruyor.
  const ink = onSurface ? colors.text : colors.onMedia;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TouchableOpacity
        // BASIŞ SÖNMESİ YOK (istek). Varsayılan opaklık düşüşü burada iki
        // sorun doğuruyordu: başlık kapak fotoğrafının üstünde duruyor ve
        // sönerken bir an okunmaz hâle geliyor, üstelik dokunuşun açtığı şey
        // tam ekran bir sheet — geri bildirimi zaten sheet'in kendisi
        // veriyor, araya giren sönme iki hareketi üst üste bindiriyor.
        testID={testID}
        activeOpacity={1}
        onPress={onPress}
        // Dokunma hedefi metinden bir tık geniş (parmak için), ama satırın
        // tamamı kadar değil.
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Animated.Text
          style={{
            // FOTOĞRAF ÜSTÜNDE BEYAZ (`onMedia`), moda dönen `text` DEĞİL
            // (istek: "light mode'da en üstteki title'ı beyazla yaz"). Başlık
            // kapak fotoğrafının üstünde duruyor — kartın "kapalı" hâli (zemini
            // chrome olan, koyu mürekkebin doğru olduğu düzen) 2026-10
            // temizliğinde kalktı. Açık temada koyu yazı açık fotoğrafta da
            // koyu fotoğrafta da gölgeye bel bağlıyordu; beyaz + aşağıdaki
            // gölge iki temada aynı okunurluğu veriyor (kartın diğer kapak
            // glifleriyle de aynı aile).
            //
            // TEK İSTİSNA `onSurface`: arkada fotoğraf kalmadığında (boş deste)
            // beyazın tutunacağı bir şey de kalmıyor → tema mürekkebi.
            color: ink,
            // 17 → 21. Başlık tam ekran bir kartın üstünde, iki yanındaki
            // 48pt'lik cam butonların arasında duruyor; 17 o ölçekte navigasyon
            // başlığından çok bir alt etiket gibi okunuyordu. 21 iki butonla
            // optik olarak aynı ağırlıkta — daha büyüğü (24+) satırı cam
            // butonların yüksekliğinden taşırıyor.
            fontSize: 21,
            fontWeight: "700",
            // Fotoğrafın ÜSTÜNDE duruyor (kart tam ekran): beyaz yazı da gölge
            // olmadan açık fotoğrafta kayboluyor. Düz zeminde şeffafa iniyor —
            // `undefined` DEĞİL, yoksa interpolasyonun hedefi kalmıyor ve
            // gölge renkle birlikte sönmek yerine anında kaybolurdu.
            textShadowColor: onSurface
              ? "rgba(0,0,0,0)"
              : "rgba(0,0,0,0.35)",
            textShadowRadius: 6,
            textShadowOffset: { width: 0, height: 1 },
            // Zemin devrinin kendisi ANİ (kartın yerini boş kart alıyor);
            // yumuşayan yalnız mürekkep. RN view olduğu için CSS transition
            // yetiyor — paylaşılan değer/jest yok (bkz. süre sabitinin notu).
            transitionProperty: ["color", "textShadowColor"],
            transitionDuration: DISCOVER_HEADER_INK_FADE_MS,
            transitionTimingFunction: EASE_OUT,
          }}
        >
          {t(`discover.mode.title.${mode}`)}
        </Animated.Text>
        {/* CHEVRON İKİ KATMAN, tek SFIcon değil: iOS'ta glif native bir
            SymbolView ve rengi `tintColor` PROP'U — RN stili olmadığı için
            animasyonlanamıyor. Beyaz olanı altta sabit duruyor, tema mürekkebi
            olanı üstüne OPAKLIKLA giriyor; ikisinin frame'i birebir aynı
            (SymbolView çerçevesini `size`tan kuruyor, kare), o yüzden geçiş
            kayma değil renk devri gibi okunuyor.

            Opaklık burada güvenli: cam YOK (başlık düz yazı), yani
            "ata zincirinde opacity<1 → efekt render edilmiyor" tuzağı geçersiz. */}
        <View style={{ width: CHEVRON_SIZE, height: CHEVRON_SIZE }}>
          <SFIcon
            name="chevron.down"
            fallback={ChevronDown}
            // Punto 17→21'e çıkınca 13 küçük kaldı: chevron başlığın parçası,
            // ondan bağımsız bir glif değil — oran korunuyor.
            size={CHEVRON_SIZE}
            // Başlığın mürekkebiyle AYNI aile: chevron yazının parçası.
            color={colors.onMedia}
            strokeWidth={3}
            weight="bold"
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              opacity: onSurface ? 1 : 0,
              transitionProperty: "opacity",
              transitionDuration: DISCOVER_HEADER_INK_FADE_MS,
              transitionTimingFunction: EASE_OUT,
            }}
          >
            <SFIcon
              name="chevron.down"
              fallback={ChevronDown}
              size={CHEVRON_SIZE}
              color={colors.text}
              strokeWidth={3}
              weight="bold"
            />
          </Animated.View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

export default ModeTitle;
