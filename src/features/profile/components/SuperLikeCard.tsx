import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, Dimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SuperLikePurchaseModal from "@/features/discover/components/SuperLikePurchaseModal";
import { useSwipeStats } from "@/features/discover/swipeQueries";
import { useAppSelector } from "@/shared/hooks/redux";
import { selectIsPremium } from "@/features/profile/subscriptionSlice";
import { colors, ink } from "@/shared/theme/colors";

/**
 * ProfileScreen'in üst şeridindeki tek aksiyon kartı: SuperLike paketi satın
 * alma girişi. Hero'nun (avatar + isim + düzenle) hemen altında, premium upsell
 * kartının üstünde durur.
 *
 * Sayfanın en altındaki iki kocaman kalpli QuotaSection'ın yerini aldı: bakiye
 * artık kartın alt satırında, satın alma aksiyonuyla AYNI yerde duruyor —
 * "kaç hakkım kaldı" ile "nasıl alırım" iki farklı ekran ucuna dağılmıyor.
 *
 * TASARIM SÖZLEŞMESİ — "veri varmış gibi görünüp çalışmayan sayı YOK":
 * Bakiyeyi bilmediğimiz her durumda sayı hiç yazılmaz, yerine ürünün değer
 * önerisi gösterilir. Bilinmeyen durumlar: stats henüz gelmedi/hata verdi,
 * backend alanı null döndü, ya da premium satın alındı ama /Stats hâlâ free
 * tier cevabı veriyor (`serverIsPremium === false`).
 *
 * Kart premium'da da görünür: SuperLike'ın "sınırsız" hâli yok, premium'da bile
 * 7 günlük rolling kota var ve paket satın alma herkese açık.
 */

// Bakiye bilinmiyorken stats refetch aralıkları (QuotaSection'dan taşındı).
// İlk deneme 2sn: webhook genelde saniyeler içinde iniyor. Dizi bitince durur —
// sonsuz polling backend'in 60/dk paylaşımlı limitini yer; ekrana geri
// dönüldüğünde (isFocused) sayaç sıfırlanıp yeni bir tur açılır.
const RESOLVE_DELAYS_MS = [2000, 5000, 10000, 20000, 40000];

const { width } = Dimensions.get("window");

// Kart ekranın tam yarısını kaplar, sol gutter'a yaslı: tek kartlık bir
// "slider" gibi durur, sağdaki boşluk da bilerek boş.
const CARD_WIDTH = width * 0.5;
const CARD_RADIUS = 28;
const HEART_BADGE = 52;
const HEART_SIZE = 32;

type BalanceState = { kind: "unknown" } | { kind: "value"; remaining: number };

export default function SuperLikeCard() {
  const { t } = useTranslation();
  const statsQuery = useSwipeStats();
  const data = statsQuery.data as any;
  const isPremium = useAppSelector(selectIsPremium);
  const isFocused = useIsFocused();

  const [sheetVisible, setSheetVisible] = useState(false);

  // Redux premium diyor ama /Stats hâlâ free tier cevabı veriyor: satın alma
  // alındı, webhook inmedi. Bu pencerede SuperLike bakiyesi premium'a ait DEĞİL.
  const premiumPending = !!data && isPremium && data.serverIsPremium === false;

  // ── Bakiyeyi backend'den oturtma (bounded retry) ──────────────────────────
  // Stats staleTime:Infinity + refetchOnMount:false → kendiliğinden hiç
  // tazelenmiyor. Premium satın alma sonrası cache'te SuperLike bakiyesi null
  // bırakılıyor; sync başarısız olursa bunu tazeleyecek başka bir yol yok.
  const needsResolve = data
    ? premiumPending || data.superLikesRemaining == null
    : statsQuery.isError;
  const [resolveAttempt, setResolveAttempt] = useState(0);
  // refetch ref'te: deps'e konsa her render timer'ı sıfırlayabilir ve retry hiç
  // ateşlemezdi.
  const refetchStatsRef = useRef(statsQuery.refetch);
  refetchStatsRef.current = statsQuery.refetch;

  // Ekrana her dönüşte yeni bir tur hakkı: kullanıcı Discover'da dolaşıp
  // dönene kadar webhook inmiş olabilir.
  useEffect(() => {
    if (isFocused) setResolveAttempt(0);
  }, [isFocused]);

  // Merdivenin boyu SEBEBE bağlı: premium aktivasyonu gerçekten dakikalar
  // sürebilir (webhook), oysa alanı hiç göndermeyen bir backend sürümünde
  // ısrar etmenin faydası yok — tek deneme yapıp susuyoruz.
  const maxResolveAttempts = premiumPending ? RESOLVE_DELAYS_MS.length : 1;
  useEffect(() => {
    if (!needsResolve) {
      setResolveAttempt(0);
      return;
    }
    if (!isFocused) return;
    if (resolveAttempt >= maxResolveAttempts) return;
    const id = setTimeout(() => {
      refetchStatsRef.current?.();
      setResolveAttempt((a) => a + 1);
    }, RESOLVE_DELAYS_MS[resolveAttempt]);
    return () => clearTimeout(id);
  }, [needsResolve, isFocused, resolveAttempt, maxResolveAttempts]);

  const balance: BalanceState = useMemo(() => {
    if (!data || premiumPending) return { kind: "unknown" };
    const remaining = data.superLikesRemaining;
    if (typeof remaining !== "number") return { kind: "unknown" };
    // SuperLike'ın "sınırsız" hâli YOK — premium'da bile 7 günlük rolling kota.
    // Negatifi "∞" saymak bedava hak dağıtmak olurdu (backend refund'da
    // claw-back yapmıyor), 0'a clamp'liyoruz.
    return { kind: "value", remaining: Math.max(0, remaining) };
  }, [data, premiumPending]);

  const subtitle =
    balance.kind === "unknown"
      ? t("profile.superLikeCard.subtitleUnknown")
      : balance.remaining > 0
        ? t("profile.superLikeCard.subtitleCount", { count: balance.remaining })
        : t("profile.superLikeCard.subtitleEmpty");

  return (
    // paddingBottom 16: bölüm ritmi 24 ama premium kartı hemen altında ve o
    // kadar boşluk kartı hero'dan koparıyordu — bilerek bir tık dar.
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <AnimatedPressable
        pressScale={0.97}
        onPress={() => setSheetVisible(true)}
        testID="superlike-card"
        style={{
          width: CARD_WIDTH,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          // Tamamlama accordion'larıyla aynı kabuk: 0.5px beyaz-%10 çizgi +
          // surface zemin. Kart eskiden 2px'lik gradyan halkayla çerçeveliydi,
          // sayfadaki tek "çerçeveli" öğe oydu ve şeritten fırlıyordu.
          borderWidth: 0.5,
          borderColor: colors.hairline,
          backgroundColor: colors.surface,
          overflow: "hidden",
        }}
      >
        {/* Rozet düz beyaz: gradyan kalkınca kart tek renk aksanla okunuyor.
            Zemin açık olduğu için kalp KOYU (colors.bg) dolduruluyor. */}
        <View
          style={{
            width: HEART_BADGE,
            height: HEART_BADGE,
            borderRadius: HEART_BADGE / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.inverseSurface,
            overflow: "hidden",
          }}
        >
          <SuperLikeGlyph size={HEART_SIZE} color={colors.bg} />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
          >
            {t("profile.superLikeCard.title")}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: ink(0.55),
              fontSize: 12,
              fontWeight: "500",
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        </View>
      </AnimatedPressable>

      <SuperLikePurchaseModal
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onPurchased={() => {
          // DiscoverScreen'deki akışın aynısı. Redeem yanıtı bakiyeyi taşımazsa
          // patchStatsBalance no-op kalıyor ve stats staleTime:Infinity olduğu
          // için sayı oturum boyunca eski kalırdı — kredi backend'de yazılmışken
          // ekranda görünmüyordu. Yukarıdaki resolver merdiveni bu boşluğu
          // kapatmıyor: o yalnız bakiye `null` iken çalışıyor, BAYAT bir sayı
          // için değil.
          statsQuery.refetch();
        }}
      />
    </View>
  );
}
