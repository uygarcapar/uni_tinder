import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, scrimAt } from "@/shared/theme/colors";

/**
 * lit plus satış yüzeylerinin zemin fotoğrafları ve o fotoğrafın üstüne
 * kurulan katman düzeni. İki yüzey var, ikisi de `gradients.litPlusCard`
 * ailesinden:
 *
 *   upsell — ProfileScreen'deki ekran boyu karşılaştırma kartı (~361×505pt,
 *            yani 3:4 dikey). Yüzeyin TAMAMI beyaz mürekkep altında:
 *            64pt wordmark, açıklama, ✗/✓ tablosu, alttaki kapsül.
 *   plan   — plus sayfasındaki tek plan kartı (~353×208pt, ~16:9 yatay).
 *            Metin sol yarıda toplanıyor, sağ taraf nispeten boş.
 *
 * ⚠️ HARİTA KISMİ OLABİLİR — modeCardArt'taki kuralın aynısı: var olmayan bir
 * yolu `require` etmek Metro'yu bundle anında düşürür. Bir satırı ANCAK dosya
 * yerindeyken aç; görseli olmayan yüzey düz gradyan olarak çiziliyor.
 *
 * Dosyalar `assets/plus/` altında, 1200px tavanıyla: en geniş cihazda kart
 * ~361pt, yani @3x'te 1083px — 1200 yeterli ve ikisi birlikte ~500KB.
 *   upsell.jpg — 1200×1600 (3:4)
 *   plan.jpg   — 1200×675  (16:9; kaynak 2048×1152'nin oranı korundu,
 *                kartın 1.70'lik kutusuna `cover` oturuyor)
 */
export type PlusSurface = "upsell" | "plan";

export const PLUS_CARD_ART: Partial<Record<PlusSurface, ImageSourcePropType>> =
  {
    upsell: require("../../../assets/plus/upsell.jpg"),
    plan: require("../../../assets/plus/plan.jpg"),
  };

/**
 * Bu oturumda zemini BİR KEZ boyanmış yüzeyler.
 *
 * Fotoğraf expo-image'ın bellek önbelleğine girdikten sonra kart ilk commit'te
 * tam hâliyle doğuyor; çağıranın (bkz. `onArtReady`) ikinci girişte iskeleti
 * yeniden göstermesine gerek yok. Modül seviyesinde: önbellek de uygulama
 * ömrü boyunca duruyor.
 */
const warmedArt = new Set<PlusSurface>();

export function isPlusArtWarm(surface: PlusSurface) {
  return warmedArt.has(surface) || !PLUS_CARD_ART[surface];
}

/**
 * Fotoğrafın üstündeki karartma.
 *
 * Fotoğrafın RENGİNE DOKUNULMUYOR — kare olduğu gibi duruyor; bu yalnız düz
 * siyah bir perde. Marka gradyanını fotoğrafın üstüne ikinci kez sermek
 * (kartı kırmızıda tutmak için) BİLEREK yapılmıyor: kareyi turuncuya boyuyor,
 * yani fiilen bir filtre oluyordu.
 *
 * Bedeli açık: kart artık kırmızılığını yalnız fotoğrafsız hâlinde taşıyor.
 * Karşılığında beyaz mürekkep hem karartmaya hem bulanıklığa yaslanıyor.
 */
const ART_DIM = 0.58;

/**
 * Fotoğrafın bulanıklığı (px).
 *
 * Mürekkebin altındaki detayı kırıyor — karartmayla birlikte çalışıyor:
 * tek başına koyulaştırmak kareyi çamurlaştırıyor, tek başına bulanıklaştırmak
 * beyaz yazıyı açık tonlarda hâlâ yiyordu. "Fotoğrafı tanıyacak kadar keskin,
 * yazıyı okutacak kadar yumuşak" eşiği bu ikisinin toplamı.
 *
 * ⚠️ `blurRadius` GERÇEK boyutta uygulanıyor, kaynak çözünürlükte değil: iki
 * kart farklı boyda ama aynı sayıyı görüyor, yani bulanıklık ikisinde de
 * gözle aynı. Kaynak dosyalardan birini büyütürsen bu sayı değişmez.
 */
const ART_BLUR = 20;

/**
 * `onArtReady` için emniyet valfi (ms).
 *
 * Kapı KAPALI kalırsa kart hiç görünmez — onu bekleyen tek sinyal `onDisplay`
 * olmasın. Valf açılırsa en kötü hâl eski davranış: bir anlık turuncu. Süre
 * paketli bir asset'in çözülmesi için fazlasıyla bol.
 */
const ART_READY_TIMEOUT = 1000;

/**
 * Kartların zemini: gradyan → (bulanık) fotoğraf → siyah karartma.
 *
 * Üç katman da `absoluteFill`, yani kabı GERMİYORLAR — kartın boyunu yine
 * içerik (ve `minHeight`) belirliyor. Çağıran kabın `overflow: "hidden"` ve
 * köşe yarıçapı olmalı; bu bileşen kendi kabuğunu kurmuyor, çünkü iki kartta
 * da kabuk aynı zamanda basma hedefi (AnimatedPressable) ve gölgeyi taşıyan
 * katman.
 *
 * Çocuklardan ÖNCE çağrılıyor: RN'de sonraki kardeş üste boyanır, metin bu
 * yüzden katmanların üstünde kalıyor — zIndex'e gerek yok.
 */
export function PlusCardArt({
  surface,
  /**
   * `contentFit="cover"` kırpma yaparken sabit kalacak kenar. Kart büyüdüğünde
   * (plan kartında deneme satırı geldiğinde, upsell'de metin sardığında)
   * kırpılan yer burayla belirleniyor.
   */
  contentPosition,
  /**
   * Zemin BOYANDIĞINDA (ya da boyanacak fotoğraf olmadığı anlaşıldığında)
   * çağrılıyor. Kartı iskeletin altında tutan çağıranlar bunu bekliyor:
   * gradyan tam opak kırmızı-turuncu, yani fotoğraf gelene kadar kart
   * görünürse marka karesi bir an "yanıp" sönüyor (bkz. PurchasePlanCarousel).
   *
   * `onDisplay` — `onLoad` DEĞİL: ikincisi kaynak çözüldüğünde, henüz view
   * boyanmadan da atılabiliyor. Hata dalı da haber veriyor, yoksa bozuk bir
   * asset iskeleti sonsuza kadar ekranda bırakırdı.
   */
  onArtReady,
}: {
  surface: PlusSurface;
  contentPosition?: React.ComponentProps<typeof Image>["contentPosition"];
  onArtReady?: () => void;
}) {
  const art = PLUS_CARD_ART[surface];

  // Kapı BİR KEZ açılıyor: boyanma, hata ve valf aynı sinyale bakıyor.
  const notified = useRef(false);
  const notifyReady = useCallback(() => {
    if (notified.current) return;
    notified.current = true;
    onArtReady?.();
  }, [onArtReady]);

  useEffect(() => {
    // Kapıyı bekleyen kimse yok (ProfileScreen'in upsell kartı) → valfe de
    // gerek yok.
    if (!onArtReady) return;
    // Fotoğrafsız yüzeyde beklenecek bir şey yok: kart gradyanın TA KENDİSİ.
    if (!art) {
      notifyReady();
      return;
    }
    const valve = setTimeout(notifyReady, ART_READY_TIMEOUT);
    return () => clearTimeout(valve);
  }, [art, onArtReady, notifyReady]);

  return (
    <>
      {/* 1. Kartın kendi dolgusu. Fotoğraf yokken kart BU — bu yüzden
          koşulsuz ve tam opak çiziliyor. */}
      <LinearGradient
        colors={gradients.litPlusCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {art ? (
        <>
          {/* 2. Fotoğraf — gradyanı tamamen örtüyor. Renk müdahalesi YOK,
              yalnız `blurRadius` (bkz. ART_BLUR). */}
          <Image
            source={art}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={contentPosition}
            blurRadius={ART_BLUR}
            // GEÇİŞ YOK (eskiden 200ms). Crossfade'in altında yanan şey
            // gradyan, yani yumuşattığı "sıçrama" fiilen 200ms'lik bir turuncu
            // parlamaydı. Kartın doğumunu artık `onArtReady` bekletiyor:
            // fotoğraf boyandığı karede geliyor, araya karışacak bir kare yok.
            transition={0}
            onDisplay={() => {
              // "Sıcak" YALNIZ burada işaretleniyor: valf/hata dalından
              // geçen bir kart önbellekte olmadığı hâlde bir dahaki girişte
              // iskeleti atlardı.
              warmedArt.add(surface);
              notifyReady();
            }}
            onError={notifyReady}
            accessible={false}
          />

          {/* 3. Karartma — düz siyah, gradyan DEĞİL (bkz. ART_DIM).
              `scrimAt` modla dönmüyor: fotoğraf açık modda da fotoğraf ve
              üstündeki mürekkep her iki modda beyaz. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: scrimAt(ART_DIM) },
            ]}
          />
        </>
      ) : null}
    </>
  );
}
