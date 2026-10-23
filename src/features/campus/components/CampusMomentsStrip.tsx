import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import SkeletonBox from "@/shared/components/SkeletonBox";
import { type AppMode } from "@/features/discover/modeTheme";
import { NATIVE_TAB_BAR_HEIGHT } from "@/navigation/tabBarMetrics";
import CampusMomentCard from "./CampusMomentCard";
import CampusMapTitle from "./CampusMapTitle";
import { CampusAddBox, CampusInfoBox } from "./CampusInfoBox";
import { filterLiveMoments } from "../campusQueries";
import {
  buildStripBoxes,
  orderInfoKeys,
  type StripBox,
} from "../campusStripBoxes";
import type { CampusMomentDto } from "../campusTypes";

/**
 * KAMPÜS ANLARI — tam ekran haritanın DİBİNDEKİ ŞERİT.
 *
 * ── Burada bir MODAL vardı ─────────────────────────────────────────────────
 * Aynı liste gorhom `BottomSheetModal`ının içinde duruyordu ve kaldırıldı.
 * Gerekçe tek bir cümlede: BAZEN AÇILMIYORDU — kullanıcının tarifi "her 2
 * girişimde 1 çıkıyor". Sebebi gorhom'un modal durum makinesi (portal kaydı +
 * `present()` yarışı + `DISMISSING` zehirlenmesi); `AppBottomSheet` o kilidin
 * etrafında bir watchdog, bir remount anahtarı ve ertelenmiş bir `present()`
 * taşıyor ve yine de kapatamıyordu. Yüzeyin modal olmaya ihtiyacı da yoktu:
 * kapanabilir değildi (`enablePanDownToClose={false}`), perdesi yoktu
 * (`backdrop="none"`), çıkışı haritanın X'iydi. Yani bir sheet'ten alınan
 * HİÇBİR ŞEY kullanılmıyordu — yalnızca riski taşınıyordu.
 *
 * Şerit artık düz bir `Animated.View`: haritanın kardeşi ve HAREKETİ AYNI
 * PAYLAŞILAN DEĞERLE sürüyor (`progress` = `mapProgress`). Eşzamanlılık artık
 * bir ayar meselesi değil, yapısal: iki animasyon yok, tek değer var. Harita
 * ve gönderiler ne eğriyle gidiyorsa kutular da onunla geliyor.
 *
 * ── Neden YATAY liste ──────────────────────────────────────────────────────
 * Ürün kararı: "modal içinde yana kayan kutu kutu kişiler" (modal gitti, kutu
 * kutu kaldı). Kutu başına 3:4 fotoğraf tam boy duruyor ve deste "bugün
 * kampüste kimler var"ı tek hamlede gezdiriyor.
 *
 * Kutu genişliği ekrandan dar: YANDAKİ KUTUNUN KENARI GÖRÜNÜYOR.
 * `pagingEnabled` yerine `snapToInterval` tam bu yüzden — sayfalama kenarı
 * kırpar ve liste "tek kart" gibi okunur, devamı olduğu kaybolur.
 *
 * ── Boş durum YOK, DOLGU KUTULARI var ──────────────────────────────────────
 * Kampüste kimse paylaşmamışsa şerit boşalmıyor: ikonlu, gradyanlı bilgi
 * kutuları geliyor (bkz. CampusInfoBox). Klasik boş durum (büyük glif +
 * başlık) buradan kaldırıldı.
 *
 * ── Okunabilirlik ŞERİDİN KENDİSİNDE DEĞİL ─────────────────────────────────
 * Şeridin zemini YOK — altındaki harita görünmeye devam ediyor. Kutular opak,
 * yani kendi okunabilirliklerini taşıyorlar; aralarından ve altlarından
 * görünen haritayı ekranın alt perdesi yatıştırıyor (bkz. CampusMapScrim).
 * Şeride opak bir zemin verilse yüzeyin tamamı ("kampüsümün haritası")
 * kaybolurdu.
 *
 * ── BAŞLIK BURADA DEĞİL ────────────────────────────────────────────────────
 * "7 an · Kampüs" satırı şeridin tepesindeydi (sheet'ten devraldığı yer) ve
 * istek üzerine ÜST banda taşındı — cam X ile aynı merkeze (bkz.
 * CampusMapTitle). Şerit artık yalnız kutulardan oluşuyor, yani iki satır
 * kadar alçaldı ve haritaya o kadar yer kaldı.
 */

/** Şeridin yan payı — ilk kutu buradan başlıyor. */
const LIST_GUTTER = 20;
/** Kutular arası boşluk. */
const CARD_GAP = 12;

/**
 * KUTULAR KARE (istek) — yükseklik ne ise genişlik o.
 *
 * ⚠️ ÖLÇÜ GENİŞLİKTEN DEĞİL YÜKSEKLİKTEN TÜRÜYOR ve sebebi şu: şerit ne kadar
 * yer kaplayacaksa kutu da o kadar olmalı. Kutu ekran genişliğinden
 * türetildiği dönemde (ekran − 64) oran onu ~440pt yapıyor ve şerit 580pt'ye
 * çıkıyordu — haritadan geriye bir şerit kalıyordu.
 *
 * ⚠️ 3:4'TEN KAREYE GEÇERKEN ORAN DÜŞTÜ (0.30 → 0.26). Sebebi aritmetik:
 * şerit artık sekme şeridinin de üstünde durmak zorunda (+49/80pt, bkz.
 * NATIVE_TAB_BAR_HEIGHT) ve eski sayılarla iPhone SE'de ekranın yarısını
 * aşıyordu. Kare kutu aynı yükseklikte DAHA GENİŞ olduğu için ekranda
 * küçülme hissi yok: 3:4 ve 256 yükseklikte kutu 192 genişti, kare ve 222
 * yükseklikte 222 geniş.
 */
const CARD_HEIGHT_RATIO = 0.26;
const CARD_HEIGHT_MIN = 200;
const CARD_HEIGHT_MAX = 300;

/** Kutuların altındaki pay (güvenli alan BUNA EK). */
const BOTTOM_PAD = 16;

/**
 * BAŞLIK SATIRI — kutuların ÜSTÜNDE (bkz. CampusMapTitle'daki tarihçe).
 *
 * Satır yüksekliği başlığın kendi `lineHeight`i (27) ile aynı; altındaki
 * boşluk kutularla arasını açıyor. İkisi burada toplanıyor çünkü hem şeridin
 * boyu hem alt perdenin boyu aynı sayıyı okumak zorunda.
 */
const TITLE_LINE = 27;
const TITLE_GAP = 10;
const TITLE_ROW = TITLE_LINE + TITLE_GAP;

/**
 * PERDENİN KUYRUĞU — bandın içerik bittikten sonra sönmek için kullandığı pay.
 *
 * 16: `CardStickyHeader`ın `CHROME_BAND_TAIL`ı ile aynı sayı. O şeridin bandı
 * "satırın bittiği yer + 16" kadar ve uygulamadaki perde dilinin ölçüsü bu.
 */
const SCRIM_TAIL = 16;

export function campusCardHeight(windowHeight: number): number {
  return Math.round(
    Math.min(
      Math.max(windowHeight * CARD_HEIGHT_RATIO, CARD_HEIGHT_MIN),
      CARD_HEIGHT_MAX,
    ),
  );
}

/**
 * ŞERİDİN TOPLAM YÜKSEKLİĞİ.
 *
 * Dışarı açık: haritanın katmanı da bunu biliyor olmak zorunda — kampüs
 * noktası şeridin ÜSTÜNDE kalan alanın ortasına getiriliyor (bkz. FeedMapStrip
 * > expandedBottomInset). İki yerde elle yazılsaydı biri değiştiğinde okul
 * şeridin arkasına kayardı.
 */
export function campusStripHeight(
  windowHeight: number,
  bottomInset: number,
): number {
  return (
    TITLE_ROW +
    campusCardHeight(windowHeight) +
    BOTTOM_PAD +
    bottomInset +
    // ⚠️ SEKME ŞERİDİ DE EKLENİYOR: kutular onun üstünde durmak zorunda
    // (kullanıcının gördüğü hata "kartlar bottom tabs'le çakışıyor"du).
    // Pencere insets'i bu yüksekliği İÇERMİYOR — gerekçe sabitin yanında.
    NATIVE_TAB_BAR_HEIGHT
  );
}

/**
 * ALT PERDENİN BOYU — artık KUTULARIN ÜSTÜNE KADAR (istek).
 *
 * ── Tarihçe, çünkü bu sayı iki kez ters yöne gitti ────────────────────────
 * Perde önce şeridin tamamını (+40) kaplıyordu ve ekranın alt yarısı bulanık
 * bir levhaya dönüyordu ("blur çok fazla"). Sonra kutuların ALTINA indirildi:
 * kutular opak, arkalarında perdeye ihtiyaç yok. Şimdi tekrar yukarı çıkıyor
 * ama ESKİ HÂLİ DEĞİL, iki farkla:
 *
 *   1. Başlık perdenin İÇİNDE (aşağı indi), yani perdenin taşıdığı bir iş
 *      var — eskiden kutuların arkasını boşuna bulanıklaştırıyordu.
 *   2. Maske KENARDAN söndüğü için üst uç neredeyse şeffaf: kutuların
 *      hizasında perde "hafifçe" geliyor, levha olduğu yer dip.
 *
 * ⚠️ Perde KUTULARIN ARKASINDA: şerit DOM sırasında perdeden SONRA çiziliyor
 * (FeedScreen). Kutular opak olduğu için üst uçtaki hafif perde fiilen yalnız
 * kutuların ARASINDAKİ boşluklarda ve başlığın arkasında görünüyor.
 */
/**
 * ALT PERDENİN SÖNÜM UZUNLUĞU (pt) — başlığın ÜSTÜNDE kalan kuyruk.
 *
 * ⚠️ Perde bandın yarısında sönerken (varsayılan reçete) başlık fiilen çıplak
 * haritanın üstünde kalıyordu: 430pt'lik bandın yarısı 215pt, yani sönüm
 * kutuların ortasında başlıyor ve başlığın hizasında alfa ~0.05'e düşüyordu
 * (kullanıcının tarifi "blur başlığa kadar gelmiyor"). Sönüm artık başlığın
 * ÜSTÜNDEKİ kuyruğa sığıyor: başlık ve kutular perdenin SOLID kısmında.
 *
 * 32 = kuyruğun iki katı: 16pt'lik bir sönüm büyük bir bantta çizgi gibi
 * okunuyor, 32 yumuşak ama hâlâ başlığın üstünde bitiyor.
 */
export const CAMPUS_STRIP_SCRIM_FADE = SCRIM_TAIL * 2;

export function campusStripScrimHeight(
  windowHeight: number,
  bottomInset: number,
): number {
  // ⚠️ BAŞLIĞIN ORTASINDA BİTİYOR (istek), tepesinin üstünde değil: bant
  // şeridin tamamı + kuyruk olduğu dönemde perde başlığı aşıp haritanın içine
  // taşıyordu. Yarım satır geri çekilince sönüm tam başlığın hizasına denk
  // geliyor — yazının altı dolu perdede, üstü haritada.
  return (
    campusStripHeight(windowHeight, bottomInset) - Math.round(TITLE_LINE / 2)
  );
}

/** Geri sayım tik aralığı — kart başına zamanlayıcı YOK, tek kaynak. */
const TICK_MS = 60_000;

/**
 * DOLGU KUTULARININ HAVUZU — ÜÇ KARE, SABİT SIRA.
 *
 * Her anahtar yüzeyin bir KURALINI adlandırıyor ve kelimesi karenin İÇİNDE
 * yazılı (bkz. campusInfoArt).
 *
 * ⚠️ KARIŞTIRMA KALDIRILDI. Havuz beş anahtardı ve sıra her açılışta
 * karıştırılıyordu (eski istek: "rastgele bilgi versin"); şeritte üç kutu
 * olduğu için kullanıcı her girişinde BAŞKA üç kart görüyordu ve yüzey
 * oturmuyordu ("bu 3 kart sürekli değişiyor neden"). Artık havuz tam olarak
 * şeridin aldığı kadar (MIN_STRIP_BOXES = 3) ve sıra sabit: aynı kullanıcı
 * her açılışta aynı üç kareyi aynı yerde buluyor.
 *
 * ⚠️ Havuza YAZISIZ kare ekleme — gerekçe campusInfoArt'ta. Dördüncü bir
 * kural eklenecekse kutu sayısı da (MIN_STRIP_BOXES) birlikte düşünülmeli,
 * yoksa havuzun kuyruğu hiç görünmez.
 *
 * Tek değişken sıralama `pinnedInfoKey`: paylaşamıyorsan sebebini söyleyen
 * kare başa alınıyor, kalan ikisinin sırası bozulmuyor.
 */
const INFO_KEYS = [
  "campus.info.expiry",
  "campus.info.insideOnly",
  "campus.info.daily",
];

export interface CampusMomentsStripProps {
  /**
   * HARİTANIN İLERLEMESİ — şerit bununla geliyor (0 ekranın altında, 1
   * yerinde). Aynı paylaşılan değer haritayı, gönderileri ve chrome'u da
   * sürüyor; eşzamanlılık buradan geliyor.
   */
  progress: SharedValue<number>;
  /**
   * CAM BUTONLAR MOUNT EDİLEBİLİR Mİ — şerit yerine oturdu mu.
   *
   * ⚠️ Kartların karar çifti SwiftUI camı ve animasyonlu bir atanın altında
   * doğan cam SESSİZCE hiç çizilmiyor (proje notu). Şerit `translateY` ile
   * geldiği için animasyon boyunca ata zinciri kimliksel değil; bu bayrak
   * açılış bittiğinde (translateY = 0) true oluyor.
   */
  actionsReady: boolean;
  mode: AppMode;
  moments: CampusMomentDto[];
  /** Başlıktaki kampüs adı — şerit yalnız taşıyor, `CampusMapTitle` yazıyor. */
  campusLabel: string | null;
  loading: boolean;
  /** Kampüsteyken şeridin başındaki artı kutusu — yoksa kutu hiç çizilmiyor. */
  canShare: boolean;
  /**
   * Konum kampüste mi — dolgu kutularının SIRASINI belirliyor.
   *
   * Kaldırılan boş durumun bir işi vardı: paylaşamıyorsan hangi kuralın seni
   * durdurduğunu göstermek. Rastgele sıra o etiketi bazen hiç
   * göstermeyeceği için ilgili anahtar başa SABİTLENİYOR (bkz. `pinnedInfoKey`).
   */
  isInsideCampus: boolean;
  onShare: () => void;
  onLike: (moment: CampusMomentDto) => void;
  onPass: (moment: CampusMomentDto) => void;
  onRemove: (moment: CampusMomentDto) => void;
  onEndReached?: () => void;
  busyMomentId?: string | null;
}

export default function CampusMomentsStrip({
  progress,
  actionsReady,
  mode,
  moments,
  campusLabel,
  loading,
  canShare,
  isInsideCampus,
  onShare,
  onLike,
  onPass,
  onRemove,
  onEndReached,
  busyMomentId = null,
}: CampusMomentsStripProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const cardHeight = campusCardHeight(windowHeight);
  // KARE: genişlik = yükseklik (istek).
  const cardWidth = cardHeight;
  const snapInterval = cardWidth + CARD_GAP;
  const stripHeight = campusStripHeight(windowHeight, insets.bottom);

  /**
   * Dakikalık tik — TEK zamanlayıcı.
   *
   * N kart için N `setInterval` demek 20 kartlık bir listede 20 ayrı JS
   * zamanlayıcısı demekti. Sayaç yalnız şerit mount'luyken koşuyor; mount'u
   * ekran yönetiyor (harita kapanınca sökülüyor).
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  /** Süresi dolanlar listeden düşüyor — istek atılmadan, yerinde. */
  const liveMoments = useMemo(
    () => filterLiveMoments(moments, nowMs),
    [moments, nowMs],
  );

  /**
   * PAYLAŞAMIYORSA SEBEBİ BAŞA SABİTLENİYOR.
   *
   * Artı kutusu yokken kullanıcı "neden paylaşamıyorum" sorusunu soruyor ve
   * eski boş durumun tek işi buydu. Üç kutunun üçü de ekranda ama ilki
   * kaydırmadan görünen tek kutu, o yüzden ilgili kare başa alınıyor:
   *   • kampüs dışında  → "YALNIZ KAMPUSTE",
   *   • kampüste ama paylaşamıyor (bugünü harcadı) → "GÜNDE BİR".
   * Paylaşabiliyorsa sabitleme yok — sıra havuzun kendi sırası.
   */
  const pinnedInfoKey = canShare
    ? null
    : isInsideCampus
      ? "campus.info.daily"
      : "campus.info.insideOnly";

  /**
   * Bilgi anahtarlarının sırası — havuzun sırası, biri başa alınarak.
   *
   * ⚠️ RASTGELELİK YOK (gerekçe INFO_KEYS'te): aynı kullanıcı her açılışta
   * aynı üç kareyi aynı yerde buluyor.
   */
  const infoKeys = useMemo(
    () => orderInfoKeys(INFO_KEYS, pinnedInfoKey),
    [pinnedInfoKey],
  );

  /** Şeridin dizilimi — hesap `campusStripBoxes`te (saf ve testli). */
  const boxes = useMemo(
    () =>
      buildStripBoxes<CampusMomentDto>({
        moments: liveMoments,
        idOf: (moment) => moment.id,
        canShare,
        loading,
        infoKeys,
      }),
    [canShare, infoKeys, liveMoments, loading],
  );

  const renderItem = useCallback(
    // `index` artık okunmuyor: gradyan yönünü indeksten türeten kabuk kalktı
    // (kutular ya fotoğraf ya düz zemin — bkz. CampusInfoBox).
    ({ item }: ListRenderItemInfo<StripBox<CampusMomentDto>>) => {
      if (item.add) {
        return (
          <CampusAddBox
            width={cardWidth}
            height={cardHeight}
            onPress={onShare}
            label={t("campus.shareBox")}
          />
        );
      }
      if (item.skeleton) {
        return (
          <SkeletonBox
            width={cardWidth}
            height={cardHeight}
            borderRadius={28}
          />
        );
      }
      if (item.infoKey) {
        return (
          <CampusInfoBox
            width={cardWidth}
            height={cardHeight}
            infoKey={item.infoKey}
            // ÇİZİLMİYOR — kelime karenin içinde yazılı, bu yalnız VoiceOver
            // etiketi (bkz. CampusInfoBox).
            text={t(item.infoKey)}
          />
        );
      }
      if (!item.moment) return null;
      return (
        <CampusMomentCard
          moment={item.moment}
          width={cardWidth}
          height={cardHeight}
          mode={mode}
          nowMs={nowMs}
          onLike={onLike}
          onPass={onPass}
          onRemove={onRemove}
          busy={busyMomentId === item.moment.id}
          actionsReady={actionsReady}
        />
      );
    },
    [
      actionsReady,
      busyMomentId,
      cardHeight,
      cardWidth,
      mode,
      nowMs,
      onLike,
      onPass,
      onRemove,
      onShare,
      t,
    ],
  );

  /**
   * ŞERİDİN GELİŞİ — ekranın altından yerine.
   *
   * ⚠️ `translateY`, `bottom` DEĞİL: layout prop'unu her karede değiştirmek
   * şeridin (liste + kartlar) Yoga geçişini her karede tekrarlatıyor. Camın
   * kuralı (animasyonlu ata = cam çizilmiyor) `actionsReady` kapısıyla
   * karşılanıyor, yani transform güvenli.
   *
   * ⚠️ OPAKLIK YOK: kartların içindeki cam ve blur yüzeyler ata zincirindeki
   * opacity<1'den ölüyor. Ekran dışına ötelemek zaten tam gizliyor.
   */
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * stripHeight }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: stripHeight,
          // Sekme şeridi + güvenli alan: ikisi de şeridin ALTINDA kalıyor
          // (gerekçe `campusStripHeight`te, sayı oradaki hesapla aynı).
          paddingBottom: BOTTOM_PAD + insets.bottom + NATIVE_TAB_BAR_HEIGHT,
        },
        slideStyle,
      ]}
    >
      {/* BAŞLIK — kutuların üstünde, alt perdenin içinde.
          ⚠️ Şeridin ÇOCUĞU: aynı `translateY` ile geliyor, yani kutularla
          birlikte açılıyor. Ekranın köküne konsaydı iki ayrı animasyon
          senkronda tutulmak zorunda kalırdı.
          `nowMs` buradan geçiyor — başlık kendi zamanlayıcısını kurmuyor
          (şeridin tiki tek kaynak, bkz. CampusMapTitle). */}
      <View
        pointerEvents="none"
        style={{
          height: TITLE_LINE,
          marginBottom: TITLE_GAP,
          paddingHorizontal: LIST_GUTTER,
          justifyContent: "center",
        }}
      >
        <CampusMapTitle
          moments={moments}
          campusLabel={campusLabel}
          nowMs={nowMs}
        />
      </View>

      <FlatList
        data={boxes}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Sayfalama DEĞİL aralık: yandaki kutunun kenarı görünsün.
        snapToInterval={snapInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: LIST_GUTTER,
          gap: CARD_GAP,
        }}
        // ⚠️ YÜKSEKLİK AÇIK YAZILI: `campusStripHeight` listenin tam olarak
        // kutu boyunda olduğunu varsayıyor ve o sayıyı harita da okuyor
        // (kampüs noktasının yeri). Ölçüye içerikten karar verilse bir
        // `contentContainerStyle` değişikliği şeridi sessizce kaydırırdı.
        style={{ height: cardHeight }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
      />
    </Animated.View>
  );
}
