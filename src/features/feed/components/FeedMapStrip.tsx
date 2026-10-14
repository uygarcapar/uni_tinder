import { memo, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { MapPin } from "@/shared/icons";
import { buildMapboxStaticUrl } from "@/shared/constants/mapbox";
import { colors, isLight } from "@/shared/theme/colors";
import type { UniversityOption } from "@/shared/queries/commonQueries";
import { resolveUniversityCoordinate } from "../universityGeo";

/**
 * Akış başlığının altındaki KAMPÜS HARİTASI şeridi.
 *
 * ── Neden STATİK görüntü ────────────────────────────────────────────────────
 * Mapbox'ın Static Images API'siyle çizilen bir `expo-image` — canlı bir
 * MapView DEĞİL. Sebebi: şerit listenin başlığında duruyor ve her scroll'da
 * ekrandan girip çıkıyor; canlı harita o konumda GL bağlamı tutar, listeyi
 * takar. Uygulamadaki tek harita örneği de bu desende (bkz. SwipeCard'ın
 * konum bölümü).
 *
 * Tam ekran İNTERAKTİF harita ayrı bir iş ve NATIVE SDK istiyor
 * (`@rnmapbox/maps` + dev-client yeniden build). O gelene kadar dokunuş
 * kampüs seçiciyi açıyor: aynı işi (kampüs değiştirmek) yapan, zaten var olan
 * yüzey.
 *
 * ── URL render içinde kuruluyor ─────────────────────────────────────────────
 * `buildMapboxStaticUrl` stil seçimi için `isLight()` okuyor; modül seviyesine
 * alınırsa tema değişince bayat kalır (mapbox.ts'teki kural). `useMemo`
 * bağımlılıkları koordinat + TEMA.
 *
 * ── Koordinat yoksa HİÇ ÇİZİLMİYOR ──────────────────────────────────────────
 * Yanlış yere pin koymak, hiç harita göstermemekten kötü: kullanıcı başka bir
 * şehri kendi kampüsü sanır. Sunucu geo alanını göndermeyen ve istemci
 * yedeğinde olmayan üniversitelerde şerit sessizce yok.
 */
export interface FeedMapStripProps {
  /** Seçili kampüsün domain'i; `null` = kullanıcının kendi kampüsü. */
  domain: string | null;
  /** Kampüsün görünen adı — şeridin üstündeki etiket. */
  label: string | null;
  /** Sunucudan gelen üniversite kaydı (geo alanları varsa buradan). */
  option?: UniversityOption | null;
  onPress: () => void;
}

/** Şerit yüksekliği — kartlardan belirgin şekilde kısa, bir "başlık" öğesi. */
const STRIP_HEIGHT = 120;

const FeedMapStrip = memo(function FeedMapStrip({
  domain,
  label,
  option,
  onPress,
}: FeedMapStripProps) {
  const { t } = useTranslation();

  const coordinate = useMemo(
    () => resolveUniversityCoordinate(domain, option),
    [domain, option],
  );

  // ⚠️ `isLight()` BAĞIMLILIKTA: tema değişince URL yenilenmeli (stil
  // değişiyor). Palet mutable olduğu için değer render'da okunuyor.
  const light = isLight();
  const mapUri = useMemo(() => {
    if (!coordinate) return null;
    return buildMapboxStaticUrl({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      // 11: kampüsün şehir içindeki yerini gösteriyor. SwipeCard 6 kullanıyor
      // (orada soru "hangi şehirde"), burada soru "hangi kampüs".
      zoom: 11,
      width: 600,
      height: 240,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinate, light]);

  if (!mapUri) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        height: STRIP_HEIGHT,
        borderRadius: 20,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: colors.hairline,
        backgroundColor: colors.surface2,
        marginBottom: 14,
      }}
    >
      <Image
        source={{ uri: mapUri }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        contentFit="cover"
        // URL stil sürümünü taşıyor (MAPBOX_STYLE_VERSION), yani cache anahtarı
        // stil yayınlandığında kendiliğinden tazeleniyor.
        cachePolicy="memory-disk"
        recyclingKey={mapUri}
        transition={120}
      />

      {/* Merkezdeki pin — SwipeCard'ın konum bölümündeki kalıbın aynısı.
          Arkasında blur YOK (harita sızıyordu), `overflow:hidden` YOK
          (gölgeyi kırpıyordu). */}
      <View
        pointerEvents="none"
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
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: light ? "#FFFFFF" : colors.surface4,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          <SFIcon name="mappin" fallback={MapPin} size={18} color={colors.text} />
        </View>
      </View>

      {/* Kampüs adı — haritanın ÜSTÜNDE, medya mürekkebiyle (harita her temada
          aynı değil ama pin/etiket okunur kalmalı). */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: colors.mediaChipBg,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          maxWidth: "80%",
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.onMedia, fontSize: 12.5, fontWeight: "600" }}
        >
          {label ?? t("feed.university.own")}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default FeedMapStrip;
