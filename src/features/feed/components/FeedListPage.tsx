import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
  type ListRenderItem,
} from "react-native";
import Animated, {
  Extrapolation,
  LinearTransition,
  createAnimatedComponent,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_HEADER_TITLE_HEIGHT } from "@/shared/components/ScreenHeader";
import { colors } from "@/shared/theme/colors";
import type { FeedFlight } from "../feedCardFlight";
import FeedFlightCell, { FeedFlightContext } from "./FeedFlightCell";
// Yan pay `feedRowShell`den geliyor: satır kabuğu da onu okuyor (çizgiyi ekran
// kenarına taşıyan negatif marj için) ve tek kaynak orada olmak zorunda — ters
// yön döngü yapardı (bu dosya iskeleti import ediyor, iskelet de kabuğu).
import { LIST_H_PADDING, ROW_RADIUS } from "../feedRowShell";
import FeedSkeletonList, { type FeedSkeletonVariant } from "./FeedSkeletonList";

/**
 * Liste içeriğinin ÜST PAYI — sabit sekme şeridinin bandını boş bırakıyor.
 *
 * ⚠️ FONKSİYON OLARAK DIŞA AÇIK, çünkü ikinci bir tüketicisi var: akıştaki
 * harita zemini (FeedMapStrip) ekranın TEPESİNE kadar uzanmak için bu payı
 * NEGATİF marjla geri alıyor. İki yerde elle yazılsaydı biri değiştiğinde
 * harita ya şeridin altında kalır ya da ekranın dışına taşardı.
 */
export const FEED_LIST_TOP_GAP = 14;
export function feedListTopPadding(insetTop: number): number {
  return insetTop + SCREEN_HEADER_TITLE_HEIGHT + FEED_LIST_TOP_GAP;
}

/**
 * Akış pager'ının üç sayfasının ORTAK gövdesi.
 *
 * Tek bileşen, üç kez kullanılıyor — `FeedScreen`in LikesScreen gibi 4000
 * satıra çıkmasını engellemek için (plan §8.6). Sayfaya özel olan her şey
 * (veri, satır çizimi, boş durum) prop.
 *
 * ⚠️ `onScroll` YALNIZ aktif sayfada bağlı. `ScreenHeader`ın küçük başlığı tek
 * bir `scrollY`ye bakıyor; üç sayfa birden yazsaydı arka plandakilerin (0'da
 * duran) offset'i öndekini ezer ve başlık rastgele belirip kaybolurdu
 * (LikesScreen.tsx:3850 civarındaki aynı not).
 */

/** Satır kaybolunca altındakiler boşluğa YAVAŞÇA kayar, yerlerine zıplamaz. */
const ROW_LAYOUT_TRANSITION = LinearTransition.duration(220);

/**
 * UÇUŞ YOLUNUN LİSTESİ — `Animated.FlatList` DEĞİL, çıplak animasyonlu FlatList.
 *
 * Gerekçe tek satır: Reanimated'ın hazır listesi kendi
 * `CellRendererComponent`ini dayatıyor ve kartın içerik uzayındaki y'sini
 * ölçmenin başka yolu yok (uzun gerekçe FeedFlightCell'in başında). Kaybedilen
 * tek şey `itemLayoutAnimation`, onu da hücre kendi `layout` prop'uyla
 * karşılıyor.
 */
// Jenerik bir liste `createAnimatedComponent`tan tipli geçmiyor (kütüphane
// kendi FlatList sarmalayıcısında da aynı kaçışı kullanıyor); prop'lar aşağıda
// tek bir nesnede tiplenerek kuruluyor.
const FlightFlatList = createAnimatedComponent(
  FlatList,
) as unknown as React.ComponentType<Record<string, unknown>>;

export interface FeedListPageProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  /** Bu sayfa önde mi — scrollY ve RefreshControl bağlanması buna bakıyor. */
  isActive: boolean;
  scrollHandler?: any;
  /**
   * Listenin offset'i — YALNIZ kendi çekme göstergemiz için (bkz.
   * FeedRefreshSpinner). Verilmezse gösterge yalnız `refreshing`e bakıyor,
   * yani çekerken sessiz kalıyor ama tetiklenince yine görünüyor.
   */
  scrollY?: SharedValue<number>;
  /** İskelet çizilsin mi (ilk yükleme, gecikme penceresinden sonra). */
  showSkeleton?: boolean;
  /**
   * İskeletin taklit edeceği satır — gönderi kartının `variant`ıyla aynı
   * sözlük. Gönderilerim'de alt satırın sağ ucu yanıt kapsülü DEĞİL yanıt
   * sayısı, yani satır daha kısa (bkz. FeedSkeletonList).
   */
  skeletonVariant?: FeedSkeletonVariant;
  /**
   * Yükleniyor ama iskelet penceresi henüz açılmadı → `null` çiz.
   * "Hiçbir şey yok" deyip hemen geri almamak için (LikesScreen'in üç yollu
   * boş-durum makinesinin orta hali).
   */
  loading?: boolean;
  /** Dolu/boş makinesinin son hali. */
  empty?: React.ReactElement | null;
  listHeader?: React.ReactElement | null;
  onEndReached?: () => void;
  /**
   * Verilmezse pull-to-refresh hiç takılmaz — AKIŞ SAYFASI böyle: orada aşağı
   * çekmek tam ekran haritayı açıyor ve çark o jestin okunuşunu bozuyordu
   * (gerekçe FeedScreen > onRefresh).
   */
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * Kartların uçuşu — VERİLMEZSE sayfa düz liste olarak çiziliyor.
   *
   * ⚠️ VARSAYILAN YOK, bilerek: uçuş yalnız AKIŞ sayfasının davranışı (istek
   * "akış kısmında"). Gönderilerim bir yönetim listesi; orada kartın
   * kendiliğinden kaçması gönderiyi silmiş gibi okunuyor. Sessizce miras
   * alınmasın diye bu sayfa listenin TÜRÜNÜ de değiştiriyor (bkz.
   * FlightFlatList).
   */
  flight?: FeedFlight | null;
}

export default function FeedListPage<T>({
  data,
  renderItem,
  keyExtractor,
  isActive,
  scrollHandler,
  scrollY,
  showSkeleton = false,
  skeletonVariant = "feed",
  loading = false,
  empty = null,
  listHeader = null,
  onEndReached,
  onRefresh,
  refreshing = false,
  flight = null,
}: FeedListPageProps<T>) {
  const insets = useSafeAreaInsets();

  // İki stil memoize — render'da kurulsaydı her çizimde yeni bir stil kimliği
  // doğar ve üç listenin içerik kabı boşuna yeniden commit edilirdi.
  // Üst pay HEADER SATIRININ kendisi: sekme şeridi orada, sabit duruyor.
  const listContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingHorizontal: LIST_H_PADDING,
      paddingTop: feedListTopPadding(insets.top),
      // 120 = alttaki tab bar payı.
      paddingBottom: 120,
    }),
    [insets.top],
  );
  // Boş sayfada dip payı yok: içerik ekranı zaten doldurmuyor, 120'lik pay boş
  // durumu yukarı itiyordu.
  const emptyListContentStyle = useMemo(
    () => ({ ...listContentStyle, paddingBottom: 0 }),
    [listContentStyle],
  );

  const emptyComponent = showSkeleton ? (
    <FeedSkeletonList variant={skeletonVariant} />
  ) : loading ? null : (
    empty
  );

  // Prop'lar TEK nesnede: iki liste yolu (düz / uçuşlu) aynı yapılandırmayı
  // paylaşmak zorunda — ikisi elle yazılsaydı biri değiştiğinde iki sayfa
  // sessizce ayrışırdı.
  const listProps = {
    data,
    renderItem,
    keyExtractor,
    onScroll: isActive ? scrollHandler : undefined,
    /**
     * ⚠️🔴 16 — VE 1'E ÇEKİLMEMELİ. Bir tur uçuş yolunda 1 denendi (gerekçe:
     * kartın konumu scroll olayından türüyor, 16 ≈ 60Hz ProMotion'da 120Hz
     * kaydırmanın yarı frekansı) ve GERİ ALINDI: şikâyet "sayfa ilk açıldığında
     * kaydırırken header sürekli titriyor"du.
     *
     * ── Sebep ────────────────────────────────────────────────────────────────
     * `ScreenHeader`ın bandı bir KADEMELİ BLUR (MaskedView + LinearGradient +
     * BlurView) ve OPAKLIKLA söndürülüyor: `scrollY` [0, 60] aralığında
     * interpolate ediliyor (bkz. ScreenHeader > headerBackgroundStyle). Alfası
     * değişen bir blur her güncellemede offscreen pass + yeniden derleme
     * demek; bu projenin kendi kuralı da bunu yazıyor ("blur'u opaklıkla
     * söndürmek titreme üretiyor", bkz. FeedScreen > sekme şeridinin notu).
     * Olay hızını ikiye katlamak o pencerede titremeyi görünür hâle getiriyor —
     * ve pencere tam olarak "tepedeyken kaydırmaya başlamak".
     *
     * ⚠️ Projedeki HER liste 16'da (LikesScreen, MessagesScreen,
     * ChatMessageList, kayıt adımları). Akışı tek başına ayırmak, header'ı
     * yalnız bu sekmede titreten şey oldu.
     *
     * Yapışmanın 60Hz'de kalmasının bedeli: 110px'lik yapışma penceresinde
     * dönüşüm her İKİ karede bir güncelleniyor. Takas bilinçli — kartın
     * yapışmasındaki ince kademelenme, her kaydırma başında titreyen bir
     * başlıktan iyidir. Asıl çözüm bu sayı değil, başlığın blur'unu alfayla
     * söndürmeyi bırakmak (ama o `ScreenHeader` ve BÜTÜN ekranları etkiler).
     */
    scrollEventThrottle: 16,
    ListHeaderComponent: listHeader,
    ListEmptyComponent: emptyComponent,
    contentContainerStyle:
      data.length === 0 && !showSkeleton
        ? emptyListContentStyle
        : listContentStyle,
    onEndReached,
    // 0.5 ≈ bir ekran boyu kala: cursor turu kullanıcı dibe varmadan dönsün.
    onEndReachedThreshold: 0.5,
    showsVerticalScrollIndicator: false,
    refreshControl:
        // ⚠️ YALNIZ aktif sayfada ve yalnız onRefresh verilmişse. PagerView
        // içinde dikey çekme yatay sayfa jestiyle yarışabiliyor; arka plandaki
        // sayfalara da takmak yarışı üçe katlardı.
        onRefresh && isActive ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            /**
             * ⚠️🔴 NATİVE ÇARK GÖRÜNMEZ — kontrol yalnız JESTİ ve EŞİĞİ
             * taşıyor, görünen gösterge bizim (bkz. FeedRefreshSpinner).
             *
             * Konumlandırma prop'u (`progressViewOffset` / eski `refreshOffset`)
             * ARTIK HİÇ VERİLMİYOR ve geri gelmemeli: RN'in kendi kaynağında
             * (RCTRefreshControl.m > _applyProgressViewOffset) o sayı
             * kontrolün FRAME'ini aşağı itiyor, `UIRefreshControl` de eşiği
             * kendi frame'ine göre ölçüyor. Yani sayı çarkın yeri DEĞİL,
             * EŞİĞİN DE YERİ: 109pt aşağı itilen kontrol 109pt fazla çekme
             * istiyor. Şikâyet üç turdur aynıydı ("çok fazla aşağı çekiyorum")
             * ve iki tur yanlış yerde arandı — sayı küçültüldü, tuzak kaldı.
             *
             * Offset'siz hâlde native çark scroll view'ın tepesinde, yani
             * DURUM ÇUBUĞUNUN ALTINDA doğuyor; görünür bırakılsa oradan yanıp
             * sönerdi. Şeffaf: eşik native mesafesinde kalıyor, görünen şeyi
             * biz çiziyoruz.
             */
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        ) : undefined,
  };

  const list = flight ? (
    <FeedFlightContext.Provider value={flight}>
      <FlightFlatList {...listProps} CellRendererComponent={FeedFlightCell} />
    </FeedFlightContext.Provider>
  ) : (
    <Animated.FlatList {...listProps} itemLayoutAnimation={ROW_LAYOUT_TRANSITION} />
  );

  // Çekme göstergesi olmayan sayfa (onRefresh yok / arkadaki sayfa) listeyi
  // ÇIPLAK döndürüyor: gereksiz bir kap native ağaca bir katman daha ekler.
  if (!onRefresh || !isActive) return list;

  return (
    // ⚠️ `collapsable={false}`: stili yalnız `flex: 1` olan bir `View` native
    // ağaçta doğmuyor ve çocuklarının zIndex'i köke taşınıyor (proje notu) —
    // gösterge listenin üstünde kalmak zorunda.
    <View style={{ flex: 1 }} collapsable={false}>
      {list}
      <FeedRefreshSpinner
        refreshing={refreshing}
        scrollY={scrollY}
        // Başlık şeridinin DİBİ: gösterge sekmelerin altında beliriyor, durum
        // çubuğunun altında değil (native çarkın offset'siz hâlinin sorunu).
        top={insets.top + SCREEN_HEADER_TITLE_HEIGHT}
      />
    </View>
  );
}

/**
 * ÇEKME GÖSTERGESİ — native çarkın yerine geçen, KENDİ çizdiğimiz çark.
 *
 * Varlık sebebi `RefreshControl`ün yanındaki uzun notta: konumlandırma prop'u
 * eşiği de ittiği için "görünür çark" ile "kısa çekme" aynı knob'da
 * çatışıyordu. Burada ikisi ayrı: eşik native'de, konum burada.
 *
 * ⚠️ ÇEKERKEN DE TEPKİ VERİYOR, yalnız `refreshing`e bakmıyor: tetiklenmeden
 * önce hiçbir şey göstermeyen bir yüzey, parmağın altında "bir şey oluyor mu?"
 * sorusunu bırakıyor — native çarkın lastikle birlikte gelmesinin tek işi
 * buydu. Opaklık `scrollY`nin NEGATİF değerinden (lastik esnemesi) türüyor.
 *
 * ⚠️ `pointerEvents="none"`: gösterge listenin ÜSTÜNDE duruyor, dokunuşu
 * yutarsa altındaki ilk kart basılamaz hâle gelir.
 *
 * ⚠️ Opaklık animasyonu burada GÜVENLİ (projenin "cam/blur'u alfayla söndürme"
 * kuralının kapsamı değil): bu bir `ActivityIndicator`, offscreen pass
 * gerektiren bir malzeme değil.
 */
function FeedRefreshSpinner({
  refreshing,
  scrollY,
  top,
}: {
  refreshing: boolean;
  scrollY?: SharedValue<number>;
  top: number;
}) {
  const style = useAnimatedStyle(() => {
    if (refreshing) return { opacity: 1 };
    if (!scrollY) return { opacity: 0 };
    // Lastik aşağı esnerken `contentOffset.y` NEGATİF oluyor; çekme mesafesi
    // onun işareti değişmiş hâli. 8 ölü bölge (momentum sekmesi göstergeyi
    // çağırmasın), 56 native tetikleme eşiğine yakın.
    const pull = Math.max(0, -scrollY.value);
    return {
      opacity: interpolate(pull, [8, 56], [0, 1], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top, left: 0, right: 0, alignItems: "center" },
        style,
      ]}
    >
      <ActivityIndicator color={colors.textSecondary} />
    </Animated.View>
  );
}

/** Sayfa dışına da lazım olan pay (FAB konumu vb.). */
export { LIST_H_PADDING };

/**
 * Yüzen native tab bar'ın geometrisi — Mesajlar ve Keşif'teki İKİ sayıyla aynı
 * (bkz. MessagesScreen:96 ve discover/components/discoverHeaderMetrics:73).
 * Orada da yerel kopya duruyor; bu dosya o ekranlardan hiçbirini import
 * etmiyor ve etmemeli (akış → keşif bağımlılığı). Değişirse üçü birlikte.
 */
const FLOATING_TAB_BAR_HEIGHT = 64;
const FLOATING_TAB_BAR_BOTTOM_GAP = -10;

/**
 * Panelin tab bar bandının DA altına uzadığı pay (istek: "çekince de modalı
 * alttan gözükmesin").
 *
 * Boş sayfada liste tam ekran boyunda ama `alwaysBounceVertical` açık (RN'in
 * dikey listelerdeki varsayılanı) — yani içerik kaydırılamayacak olsa bile
 * aşağı/yukarı esniyor. Yukarı doğru esnetildiğinde panel de birlikte
 * kalkıyor ve dibinde `bg` rengi bir şerit beliriyordu: modalın ALT KENARI
 * görünüyordu. Bounce'u kapatmak çözüm DEĞİL — aynı jest pull-to-refresh'i
 * besliyor, kapatınca boş akış yenilenemez hâle gelirdi. O yüzden kenar
 * çekmenin ulaşabileceğinden daha aşağıya taşınıyor.
 *
 * 420 keyfi görünüyor ama bedeli yok: taşan kısmı scroll view sınırında
 * kırpıyor, içerik boyu büyümüyor (negatif marj kabın yüksekliğini
 * oynatmıyor), ortalanan alan da aynı payın iç dolgu olarak geri verilmesiyle
 * korunuyor. iOS'un lastik direnci bir ekran boyunu zorlukla buluyor, bu pay
 * gerçekçi her çekmeyi örtüyor.
 */
const EMPTY_PANEL_BOUNCE_OVERSHOOT = 420;

/**
 * Boş durumun ortak sarmalayıcısı.
 *
 * ⚠️ `surface` YALNIZ AKIŞ SAYFASINDA AÇIK (istek: "gönderilerim kısmında
 * olmasın bu modal, sadece burası için"). Gönderilerim'de boş durum çıplak
 * kalıyor — kardeş sekmelerin (Mesajlar, Bildirimler) boş durumuyla aynı
 * görünüş. Varsayılan KAPALI: yeni bir boş durum ekleyen biri panelin
 * sahipliğini düşünmek zorunda kalsın, sessizce miras almasın.
 *
 * Panel açıkken: SAYFA ZEMİNİ (`colors.bg`) rengiyle alttan ve yanlardan
 * taşan düz bir yüzey. Bir ara gönderi yüzeyi kılığında (`colors.surface` +
 * `ROW_RADIUS` + üst hairline) bir modal denendi ve geri alındı (istek:
 * "arkaplan rengi bizim normal arkaplan rengi olsun sayfaların ve üstte
 * border belli oluyor, border kaldır"): kart görünümü boş durumu sayfadan
 * ayrı bir levha gibi gösteriyordu, üst çizgi de ekranın ortasında asılı
 * duran bir ayraç olarak okunuyordu. Kalan tek iş TAŞMA (bkz. aşağı) —
 * yüzeyin kendisi artık sayfadan ayırt edilemiyor.
 *
 * İÇERİĞİN YERİ DEĞİŞMEDİ: ölçüler MESAJLAR ekranından — orada da `flex-1
 * items-center justify-center` ve `pb-[40%]` var (bkz. MessagesScreen >
 * ListEmptyComponent). Burası 35'ti, yani akışın boş durumu kardeş
 * sekmelerden birkaç puan aşağıda duruyordu. Zemin eklenirken bu üçlüye
 * DOKUNULMADI; eklenen tek şey yüzeyin kendisi.
 *
 * ZEMİN: `colors.bg` — kardeş sekmelerin (Mesajlar, Bildirimler, Keşif) sayfa
 * zemininin TA KENDİSİ. Boş sayfa ile dolu sayfa aynı pager'da yan yana
 * kaydırılıyor; boş tarafa ayrı bir gri vermek ikisini iki ayrı ürün gibi
 * gösteriyordu.
 *
 * ⚠️ SABİT YÜKSEKLİK YOK, PANEL KALAN ALANI DOLDURUYOR — bir ara 280'lik bir
 * kart denendi ve reddedildi (istek): ekranın altında bir şerit `bg` kalıyordu
 * ve kutu, listenin ortasında asılı duran bir levha gibi okunuyordu. `flex: 1`
 * panelin dibini içerik kabının dibine (`emptyListContentStyle`in paddingBottom'u
 * SIFIR, bkz. yukarı) indiriyor; NEGATİF ALT MARJ ise oradan CİHAZIN kenarına
 * kadar taşırıyor (istek: "en alttan telefonun kenarına kadar doldursun").
 * Pay, yüzen native tab bar'ın bandı — Mesajlar ve Keşif'in listelerine ALT
 * DOLGU olarak verdiği sayının aynısı, burada ters işaretle: orada içeriği
 * bar'ın üstünde tutuyor, burada yüzeyi bar'ın arkasından geçirip ekranın
 * dibine dayandırıyor; üstüne `EMPTY_PANEL_BOUNCE_OVERSHOOT` biniyor (çekme
 * payı, gerekçesi orada). Taşan kısmı scroll view kendi sınırında kırpıyor,
 * yani liste bir şekilde zaten kenara değiyorsa bu pay görünür bir şey
 * değiştirmez (içerik boyu da büyümüyor: negatif marj kabın yüksekliğini
 * oynatmıyor).
 *
 * ⚠️ YANLARDA `ROW_BLEED` DEĞİL TAM TAŞMA: baloncuk ekranın 10'unda duruyor,
 * bu panel 0'ında. Fark bilinçli — baloncuk ekranda yüzen bir kutu, bu panel
 * sayfanın dibine oturan bir yüzey; 10'luk pay onu yine "asılı levha"ya
 * çeviriyordu. Yani liste payı `-LIST_H_PADDING` ile TAMAMEN geri alınıyor.
 *
 * ⚠️ ÜST YARIÇAP KALIYOR, ÇERÇEVE GİTTİ: üst hairline (0.5 /
 * `colors.hairline`) KALDIRILDI — zemin sayfa rengine dönünce ekranda görünen
 * tek işaret o oldu ve "sayfanın ortasına çizilmiş bir çizgi" gibi okunuyordu.
 * `ROW_RADIUS` + `borderCurve: continuous` ise DURUYOR (istek: "border
 * radiusu kaldırma"): panelin alt ve yan kenarları ekranın dışında kalıyor,
 * yuvarlaklık yalnız üstte çalışıyor ve satır kabuğuyla (`feedRowShell`) aynı
 * değer olmak zorunda — silmeye kalkma.
 *
 * ⚠️ `EmptyState`in kendi `topOffset`u da SIFIRLANMALI (varsayılanı 24).
 * Mesajlar `topOffset={0}` geçiyor; sarmalayıcı zaten dikeyde ortalıyor,
 * üstüne eklenen pay bloğu aşağı kaydırıyor. Çağıranların hepsi geçiyor —
 * yeni bir boş durum eklerken atlama.
 */
export function FeedEmptyWrap({
  children,
  surface = false,
}: {
  children: React.ReactNode;
  surface?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: "40%",
      }}
    >
      {children}
    </View>
  );
  if (!surface) return content;

  const overshoot =
    insets.bottom +
    FLOATING_TAB_BAR_HEIGHT +
    FLOATING_TAB_BAR_BOTTOM_GAP +
    EMPTY_PANEL_BOUNCE_OVERSHOOT;
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: -LIST_H_PADDING,
        marginBottom: -overshoot,
        // Negatif marjla kazanılan payı İÇ DOLGU olarak geri veriyor: yüzey
        // bar'ın arkasından geçip ekranın dibine iniyor ama ORTALANAN ALAN
        // eskisi kadar kalıyor. Verilmezse içerik, panel ne kadar uzadıysa
        // onun yarısı kadar aşağı kayıyor — metnin yeri bu değişiklikte
        // oynamamalı.
        paddingBottom: overshoot,
        backgroundColor: colors.bg,
        borderTopLeftRadius: ROW_RADIUS,
        borderTopRightRadius: ROW_RADIUS,
        borderCurve: "continuous",
      }}
    >
      {content}
    </View>
  );
}
