import { useMemo } from "react";
import { RefreshControl, View, type ListRenderItem } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_HEADER_TITLE_HEIGHT } from "@/shared/components/ScreenHeader";
import { colors } from "@/shared/theme/colors";
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

export interface FeedListPageProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  /** Bu sayfa önde mi — scrollY ve RefreshControl bağlanması buna bakıyor. */
  isActive: boolean;
  scrollHandler?: any;
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
}

export default function FeedListPage<T>({
  data,
  renderItem,
  keyExtractor,
  isActive,
  scrollHandler,
  showSkeleton = false,
  skeletonVariant = "feed",
  loading = false,
  empty = null,
  listHeader = null,
  onEndReached,
  onRefresh,
  refreshing = false,
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

  return (
    <Animated.FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onScroll={isActive ? scrollHandler : undefined}
      scrollEventThrottle={16}
      itemLayoutAnimation={ROW_LAYOUT_TRANSITION}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyComponent}
      contentContainerStyle={
        data.length === 0 && !showSkeleton
          ? emptyListContentStyle
          : listContentStyle
      }
      onEndReached={onEndReached}
      // 0.5 ≈ bir ekran boyu kala: cursor turu kullanıcı dibe varmadan dönsün.
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      refreshControl={
        // ⚠️ YALNIZ aktif sayfada ve yalnız onRefresh verilmişse. PagerView
        // içinde dikey çekme yatay sayfa jestiyle yarışabiliyor; arka plandaki
        // sayfalara da takmak yarışı üçe katlardı.
        onRefresh && isActive ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
            colors={[colors.text]}
            progressBackgroundColor={colors.bg}
            // ⚠️ contentContainerStyle'ın paddingTop'u spinner'ı KAPSAMIYOR:
            // spinner scroll 0'da doğuyor, yani bulanık header'ın ALTINDA
            // kalıyordu. Bu onu şeridin altına indiriyor.
            //
            // ⚠️ `refreshOffset` PROP'U KALDIRILDI: tek müşterisi akış sayfası
            // ve orada çark artık HİÇ YOK — aşağı çekmek haritayı açıyor
            // (gerekçe FeedScreen > onRefresh). Çarkı olan tek sayfa
            // Gönderilerim ve orada varsayılan yer doğru.
            progressViewOffset={insets.top + SCREEN_HEADER_TITLE_HEIGHT}
          />
        ) : undefined
      }
    />
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
 * Panel açıkken: gönderi yüzeyi kılığında bir modal (istek: "arka planı boş
 * olmasın, post arka plan rengi/border/borderCurve'ü olan bir modal olsun;
 * alttan ve yanlardan doldursun").
 *
 * İÇERİĞİN YERİ DEĞİŞMEDİ: ölçüler MESAJLAR ekranından — orada da `flex-1
 * items-center justify-center` ve `pb-[40%]` var (bkz. MessagesScreen >
 * ListEmptyComponent). Burası 35'ti, yani akışın boş durumu kardeş
 * sekmelerden birkaç puan aşağıda duruyordu. Zemin eklenirken bu üçlüye
 * DOKUNULMADI; eklenen tek şey yüzeyin kendisi.
 *
 * ZEMİN: `colors.surface` + `ROW_RADIUS` + `borderCurve: continuous` üçü de
 * `feedRowShell`in TA KENDİSİ (tek kaynak). Boş sayfa ile dolu sayfa aynı
 * pager'da yan yana kaydırılıyor; ayrı bir gri ya da ayrı bir yarıçap ikisini
 * iki ayrı ürün gibi gösterirdi.
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
 * ⚠️ YALNIZ ÜST KÖŞELER YUVARLAK, YALNIZ ÜST ÇERÇEVE VAR: panelin alt ve yan
 * kenarları ekranın dışında kalıyor, oraya çizilen yarıçap/çizgi görünmüyordu
 * ama köşe eğrisi iki yanda görünür bir "kırpılmış köşe" bırakıyordu. Çerçeve
 * değeri ProfileScreen'in bölümlerinden (0.5 / `colors.hairline` — bkz.
 * profile/components/SelfieVerificationRow:154), `colors.border` DEĞİL: bu bir
 * kutu kenarı, sayfa zemini üstündeki ayraç değil.
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
        backgroundColor: colors.surface,
        borderTopLeftRadius: ROW_RADIUS,
        borderTopRightRadius: ROW_RADIUS,
        borderCurve: "continuous",
        borderTopWidth: 0.5,
        borderColor: colors.hairline,
      }}
    >
      {content}
    </View>
  );
}
