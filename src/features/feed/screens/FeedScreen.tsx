import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type PagerView from "react-native-pager-view";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useDerivedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import PagerTabBar, {
  AnimatedPagerView,
  usePagerScrollHandler,
  usePagerTabCommit,
} from "@/shared/components/PagerTabBar";
import ScreenHeader, {
  SCREEN_HEADER_TITLE_HEIGHT,
} from "@/shared/components/ScreenHeader";
import EmptyState from "@/shared/components/EmptyState";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { LayoutList, Pencil, Plus, SlidersHorizontal, X } from "@/shared/icons";
import DiscoverHeaderGlassButton from "@/features/discover/components/DiscoverHeaderGlassButton";
import { colors, withAlpha } from "@/shared/theme/colors";
import uiBus from "@/shared/services/uiBus";
import { navigationRef } from "@/shared/services/navigationRef";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import PreviewModal from "@/features/profile/components/PreviewModal";
import { useAppMode } from "@/features/discover/useAppMode";
import {
  modeAccent,
  modeFireGradient,
  type AppMode,
} from "@/features/discover/modeTheme";
import { postNoteTarget } from "@/features/discover/noteTarget";
import { postNoteRequest } from "../feedPostNote";
import {
  useNoteMutation,
  useSwipeStats,
} from "@/features/discover/swipeQueries";
import { hasLikedMe, removeWhoLikedMe } from "@/features/discover/swipeSlice";
import { store } from "@/shared/store";
import NoteComposerModal from "@/features/discover/components/NoteComposerModal";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import FirePurchaseModal from "@/features/discover/components/FirePurchaseModal";
import { formatResetTime } from "@/features/discover/quotaFormat";
import type { NoteTarget } from "@/shared/types";
import { useFeedFlight } from "../feedCardFlight";
import {
  authorIsMatched,
  authorLikedMe,
  feedCardActions,
  resolveCardMode,
} from "../feedCardMode";
import { feedKeys } from "../feedKeys";
import FilterPills from "@/shared/components/FilterPills";
import {
  resolveLocalized,
  useUniversities,
} from "@/shared/queries/commonQueries";
import FeedFilterSheet, {
  type FeedFilterValue,
} from "../components/FeedFilterSheet";
import FeedUniversitySheet from "../components/FeedUniversitySheet";
import FeedMapStrip from "../components/FeedMapStrip";
import FeedMomentsPeek from "../components/FeedMomentsPeek";
import {
  MAP_CHROME_FADE_MS,
  MAP_MOTION_MS,
  MAP_POLYGON_DRAW_MS,
  MAP_STRIP_ENTRY_MS,
  mapMotionEasing,
} from "../components/feedMapMotion";
import { useCampusSurface } from "@/features/campus/useCampusSurface";
import CampusMomentsStrip, {
  campusStripScrimFade,
  campusStripHeight,
  campusStripScrimHeight,
} from "@/features/campus/components/CampusMomentsStrip";
// ⚠️ `CAMPUS_MAP_CHROME_TOP`/`_ROW` ARTIK OKUNMUYOR: üst köşe satırı kalıcı
// oldu ve konumunu `ScreenHeader`ın buton yuvasından alıyor (bkz. "ÜST KÖŞE
// BUTONLARI"). O iki sayı yalnız perdenin boyunu besliyor, orası değişmedi.
import CampusMapScrim, {
  campusMapTopScrimHeight,
} from "@/features/campus/components/CampusMapScrim";
import CampusMapTitle from "@/features/campus/components/CampusMapTitle";
// ⚠️ `CampusMomentComposer` ARTIK İMPORT EDİLMİYOR: onay sheet'i akıştan çıktı
// (gerekçe aşağıda, kampüs sheet'lerinin yerindeki notta).
import CampusAlwaysPrimingSheet from "@/features/campus/components/CampusAlwaysPrimingSheet";
import ReportModal from "@/shared/components/ReportModal";
import {
  activeFilterCount,
  loadFeedParams,
  sanitizeFeedParams,
  saveFeedParams,
} from "../feedPrefs";
import FeedListPage, {
  FeedEmptyWrap,
  // Akış listesinin yatay payı. Yanıt sayfasında kartın KENDİ payıyla
  // karşılaştırılıyor (bkz. renderItem), o yüzden adı açık yazıldı.
  LIST_H_PADDING as FEED_LIST_H_PADDING,
  // Harita zemini listenin üst payını okuyor; pay tek yerden geliyor
  // (bkz. feedListTopPadding'in notu).
  feedListTopPadding,
} from "../components/FeedListPage";
import FeedPostCard from "../components/FeedPostCard";
// Yanıt kartı Beğeniler'in foto kartı olduğu için onun liste payını da bilmek
// zorundayız — kartın genişliği o sayıdan türüyor.
import { LIST_H_PADDING as LIKE_CARD_H_PADDING } from "@/features/discover/components/LikeCard";
import {
  FEED_OPEN_EVENT,
  FEED_PAGE_INDEX,
  FEED_PAGE_RETRY_MS,
  consumeFeedRequest,
  dropFeedRequest,
  type FeedPageKey,
} from "../feedEntry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  FEED_CODES,
  feedCodeI18nKey,
  NOTE_SEND_CODES,
  noteSendCodeI18nKey,
} from "@/shared/constants/responseCodes";
import { showInfoToast } from "@/shared/services/toaster";
import { analytics } from "@/shared/services/analytics";
import { usePremiumTier } from "@/features/profile/premiumTier";
import FeedComposerSheet from "../components/FeedComposerSheet";
import FeedQuotaSheet from "../components/FeedQuotaSheet";
import FeedSupportSheet from "../components/FeedSupportSheet";
import FeedReportSheet from "../components/FeedReportSheet";
import {
  FEED_DIRTY_EVENT,
  FEED_REPLIES_DIRTY_EVENT,
  feedErrorCode,
  feedErrorMessage,
  feedErrorResult,
  useCreatePost,
  useCreateReply,
  useDeletePost,
  writeFeedQuotaExhausted,
  useFeedMe,
  useFeedPosts,
  useMyFeedPosts,
  useOwnFeedAvatar,
  useTogglePostLike,
  patchAuthorPostsInCaches,
} from "../feedQueries";
import {
  anonymousGate,
  composeGate,
  kindFilterGate,
  postPresentation,
  universityPickerGate,
} from "../feedPolicy";
import {
  normalizeTopicSelection,
  resolveTopicKeys,
  topicAllLabel,
  topicHashtag,
} from "../feedTopics";
import { useFeedAuthorProfile, useFeedReplierProfile } from "../feedQueries";
// Haritanın poligonu GÖSTERİLEN kampüsün — kullanıcının kendisininki
// `useCampusSurface`te ve o yalnız konum kararı için (gerekçe aşağıda).
import {
  useCampusBoundary,
  // ⚠️ `useCampusMomentProfile` ARTIK ÇAĞRILMIYOR: an kartı profil açmıyor
  // (gerekçe `momentTarget`in yanında). Kanca duruyor — kampüse özel uç
  // gelince profil yolu onunla geri açılacak.
  isMomentDecided,
  resolveOpenMoment,
} from "@/features/campus/campusQueries";
import type { CampusMomentDto } from "@/features/campus/campusTypes";
// ⚠️ `LikerSwipeModal` KAMPÜS YOLUNDA KULLANILMIYOR: an kartı artık profil
// açmıyor. Akışın yazar kartı hâlâ bu bileşeni çiziyor, o yüzden import duruyor.
import LikerSwipeModal from "@/features/discover/components/LikerSwipeModal";
import CampusMomentExpandOverlay, {
  EXPAND_MS,
} from "@/features/campus/components/CampusMomentExpandOverlay";
import { likeWithFlameSweep } from "@/features/campus/campusMomentLikeSweep";
import {
  releaseFlameSweep,
  runFlameSweep,
} from "@/features/discover/flameSweep";
import type { ExpandRect } from "@/features/campus/campusExpandGeometry";
import type {
  FeedListParams,
  FeedPostDto,
  FeedReceivedReplyDto,
} from "../feedTypes";

/**
 * Lit Akışı — kampüse özel, sadece yazı akışı.
 *
 * Üç sayfalı pager: Akış / Gönderilerim / Yanıtlar. Sayfa gövdeleri ORTAK
 * `FeedListPage` bileşeninde; bu dosya yalnız kabuk, veri bağlama ve sayfa
 * isteği yönetimi yapıyor (LikesScreen'in 4000 satırına düşmemek için).
 */

/** İskelet gecikme penceresi — LikesScreen'deki değerlerin aynısı. */
const SKELETON_DELAY_MS = 220;

// Yanıtlar sayfası KALDIRILDI (iki modlu yapı).
const PAGES: FeedPageKey[] = ["feed", "mine"];

/**
 * Sekme şeridinin sol hattı — Mesajlar/Beğeniler ekranlarındaki
 * `HEADER_LEFT_INSET` ile AYNI sayı. Liste payı (LIST_H_PADDING) da 16, yani
 * kartlar, şerit ve filtre satırı tek hatta oturuyor.
 */
const HEADER_LEFT_INSET = 16;

/**
 * BÜYÜK BAŞLIĞIN sol hattı — şeridin 16'sına 3 ekliyor ve bu fark OPTİK:
 * Mesajlar ekranındaki başlık da `paddingLeft: 19` kullanıyor. 33 puntoluk
 * yazının sol kenar boşluğu, 14-16 puntoluk etiketlerin yanında daha dar
 * göründüğü için aynı 16'dan başlasa başlık sola taşmış gibi okunuyor.
 * ⚠️ Mesajlar'daki sayı değişirse burası da değişmeli — iki ekranın büyük
 * başlığı tek kalıp.
 */
const TITLE_LEFT_INSET = HEADER_LEFT_INSET + 3;

/** Açıklama satırının ölçüsü — Mesajlar ekranındaki 16/22 ile aynı. */
const DESC_FONT_SIZE = 16;
const DESC_LINE_HEIGHT = 22;

/**
 * Başlık bloğunun altındaki marj.
 *
 * Akış sekmesinde üst üste üç blok var: başlık+açıklama · filtre pill'leri ·
 * kartlar. Açıklamayla pill'ler arası 18, pill'lerle ilk kart arası 8 olunca
 * pill satırı aşağıdaki listeye yapışıyor ve başlığın bir parçası gibi değil,
 * kartların başlığı gibi okunuyordu.
 */
const TITLE_BLOCK_GAP = 18;

/**
 * Açıklama satırının HARFLERİNİN ALTINDA kalan ölü boşluk.
 *
 * `lineHeight` (22) `fontSize`tan (16) büyük olduğu için fark satırın altına ve
 * üstüne dağılıyor; altta kalan yarısı metnin görünen alt kenarıyla kutunun alt
 * kenarı arasında duruyor. Yani açıklamayla pill'ler arasındaki GÖRÜNEN boşluk
 * marjın kendisi değil, `TITLE_BLOCK_GAP + bu`.
 *
 * Pill satırının altında böyle bir ölü boşluk YOK (kapsülün kenarlığı kutunun
 * kenarı), bu yüzden iki marj eşit yazıldığında alt boşluk gözle daha dar
 * görünüyordu. Filtre satırı aradaki farkı geri ekliyor.
 */
const DESC_TRAILING_LEADING = (DESC_LINE_HEIGHT - DESC_FONT_SIZE) / 2;

/** Pill satırının altı — açıklamayla pill'ler arasındaki GÖRÜNEN boşluğun eşi. */
const PILL_ROW_GAP = TITLE_BLOCK_GAP + DESC_TRAILING_LEADING;

/**
 * ⚠️ `FAB_SIZE` / `FAB_GLYPH` KALDIRILDI: sağ alttaki yuvarlak "paylaş"
 * butonu üründen çıktı ve composer'ın girişi başlığın sağ üstündeki kalem
 * butonu oldu (istek). Ölçüleri geri koyacak olan için FAB'ın kendi yerinde
 * duran notta (render ağacında) yazılı.
 */

/**
 * Sayfanın büyük başlık BLOĞU — Mesajlar ekranındaki başlığın birebir kalıbı:
 * 33/700 başlık, SAĞINDA Plus pill'i, ALTINDA tek satır açıklama (16/22,
 * `textSecondary`, marginTop 2).
 *
 * Her sayfanın KENDİ liste başlığında duruyor, pager'ın dışında değil: blok
 * böylece sayfayla birlikte native olarak kayıyor ve sekme değişince yandaki
 * sayfanın başlığı onunla beraber giriyor. Sabit sekme şeridi onun üstünde
 * kalıyor (listenin paddingTop'u şeridin bandını zaten boş bırakıyor).
 */
function FeedSectionTitle({
  title,
  description,
  actionLabel,
  onActionPress,
  accent,
  trailing = null,
}: {
  title: string;
  description: string;
  actionLabel: string | null;
  onActionPress: (() => void) | null;
  /**
   * BLOĞUN SAĞ UCU — anların üçlü destesi (istek: "akış title'ı ve desc'in
   * aynı hizasında en sağda").
   *
   * ⚠️ BAŞLIK SATIRININ İÇİNDE DEĞİL, İKİ SATIRIN YANINDA: başlık satırına
   * konsaydı açıklamanın üstünde kalır ve bloğun dikey ortasına denk gelmezdi.
   * Burada sarmalayıcı bir satır var, deste onun dikey ortasında.
   *
   * Yalnız AKIŞ sayfasında veriliyor (Gönderilerim'de kampüs anları yok).
   */
  trailing?: React.ReactNode;
  /**
   * Pill'in dolgusu — SEÇİLİ MODUN vurgusu (`modeAccent`): Flört'te litPlus
   * kırmızısı, Arkadaş'ta friends yeşili. Prop, modül sabiti değil: akış iki
   * modda da aynı ekran ve renk dışarıdan geliyor.
   */
  accent: string;
}) {
  return (
    <View
      style={{
        // Listenin kendi yatay payının ÜSTÜNE eklenen fark — başlık ekran
        // kenarından TITLE_LEFT_INSET kadar içeride başlasın diye.
        marginLeft: TITLE_LEFT_INSET - FEED_LIST_H_PADDING,
        // Blok artık iki satır (başlık + açıklama); altındaki pay doğrudan
        // filtre satırıyla/ilk kartla arasındaki nefes.
        marginBottom: TITLE_BLOCK_GAP,
        // ⚠️ SATIR: metin bloğu solda, deste sağ uçta ve DİKEY ORTADA.
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {/* Metin bloğu — `flex: 1` desteye yer bırakıyor, uzun başlık/açıklama
          onu satır dışına itmek yerine kendisi kırpılıyor. */}
      <View style={{ flex: 1 }}>
      {/* Başlık satırı — metin ve (varsa) hemen SAĞINDA Plus pill'i. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          numberOfLines={1}
          // `flexShrink: 1` — uzun başlık pill'i satır dışına itmesin,
          // kırpılacak olan başlık.
          style={{
            flexShrink: 1,
            color: colors.text,
            fontSize: 33,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        {!!actionLabel && !!onActionPress && (
          // Dolgu SEÇİLİ MODUN vurgusu, mürekkebi sabit `onMediaInverse` —
          // Beğeniler'deki pill'le AYNI dil (2026-10-21'de ikisi birlikte
          // moda bağlandı; önceden sabit `litPlus` kırmızısıydı ve Arkadaş
          // modunda ekranın tek kırmızı yüzeyi olarak kalıyordu). Mesajlar
          // ekranındaki ikizi mod-NÖTR kaldı: sohbet listesi iki modun
          // eşleşmelerini birlikte gösteriyor. Yazı `text` olamaz — açık modda
          // beyaza döner ve dolgunun üstünde kaybolur.
          <AnimatedPressable
            pressScale={0.96}
            onPress={onActionPress}
            accessibilityRole="button"
            hitSlop={8}
            style={{
              flexShrink: 0,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: accent,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                color: colors.onMediaInverse,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {actionLabel}
            </Text>
          </AnimatedPressable>
        )}
      </View>
      {/* Açıklama — başlığın devamı, bağımsız bir paragraf değil: 33 puntonun
          kendi satır boşluğu zaten aşağı pay bırakıyor, üstüne eklenen her px
          ikisini ayrı blok gibi gösteriyor (Mesajlar'daki DESC_MARGIN_TOP).
          TEK SATIR — metinler buna göre kısa yazıldı (bkz. feed.header.desc*). */}
      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          /**
           * ⚠️ `colors.textSecondary` DEĞİL (#8E8E93) — kasıtlı sapma.
           *
           * Satır artık Mapbox'ın SOKAK haritasının üstünde duruyor: altında
           * yol çizgileri, park lekeleri, bina adları var. Orta gri, o dokunun
           * kendi orta tonlarıyla aynı aralığa düşüyor ve 16 puntoda satır
           * okunmuyordu — blur zemini deseni çözüyor ama parlaklığı eşitlemiyor.
           *
           * `text`in alfası iki temada da DOĞRU YÖNE gidiyor: koyuda beyazı
           * seyreltiyor (daha AÇIK), açıkta siyahı (daha KOYU). Yani sabit bir
           * gri yerine her iki temada kontrastı ARTIRAN tek ifade.
           *
           * Tam `text` değil: başlık 33 punto ve tam kontrastta; açıklamanın
           * onunla aynı ağırlığa çıkması hiyerarşiyi düzleştirir.
           */
          color: withAlpha(colors.text, 0.78),
          fontSize: DESC_FONT_SIZE,
          lineHeight: DESC_LINE_HEIGHT,
          paddingRight: 8,
        }}
      >
        {description}
      </Text>
      </View>
      {trailing}
    </View>
  );
}

export default function FeedScreen() {
  // `i18n` de lazım: kampüs pill'inin etiketi /api/common/universities'ten
  // gelen çift dilli `display` alanından çözülüyor.
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  // Harita zemini ekranın TEPESİNE kadar uzanıyor → listenin üst payını
  // (status bar + sekme şeridi) bilmek zorunda. Liste kendi payını aynı
  // fonksiyondan hesaplıyor.
  const insets = useSafeAreaInsets();
  // Yalnız kota sheet'indeki YUMUŞAK Plus satırını ve başlığın yanındaki upsell
  // pill'ini çizmek için — kapı kararı değil (kapılar /api/feed/me'den gelir).
  // `resolved` da okunuyor: pill'in "henüz bilinmiyor" ile "free" arasını
  // ayırması gerekiyor (bkz. showPlusUpsell).
  const { isPremium, resolved: premiumResolved } = usePremiumTier();

  // ── Pager kurulumu ────────────────────────────────────────────────────────
  const pagerRef = useRef<PagerView>(null);
  /**
   * Ekran bekleyen bir "şu sayfayı aç" isteğiyle mount olduysa DOĞRUDAN o
   * sayfada doğuyor. `setPage` ile çevirmek yerine `initialPage`: mount anında
   * pager henüz yerleşmediği için programatik değişim yutulabiliyor.
   */
  const [initialRequest] = useState(() => consumeFeedRequest());
  const [initialTabIndex] = useState(() =>
    initialRequest ? FEED_PAGE_INDEX[initialRequest] : 0,
  );
  const [activeTab, setActiveTab] = useState<FeedPageKey>(
    initialRequest ?? "feed",
  );
  /**
   * Pager'ın BİLDİRDİĞİ sayfa (onPageSelected) — İSTENEN değil. Aşağıdaki ısrar
   * mekanizması tam da "istendi ama oturmadı"yı düzelttiği için istekten
   * türetilemez. Hiç olay gelmediyse null = "bilmiyoruz", "sayfa 0" DEĞİL.
   */
  const pagerPageRef = useRef<number | null>(null);

  const pagerOffset = useSharedValue(0);
  const pagerScrollHandler = usePagerScrollHandler({
    onPageScroll: (e: any) => {
      "worklet";
      pagerOffset.value = e.position + e.offset;
    },
  });

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  /**
   * AKIŞ sayfasının offset'i — `scrollY`den AYRI bir değer, bilerek.
   *
   * `scrollY` HANGİ SAYFA ÖNDEYSE onun tarafından yazılıyor (FeedListPage
   * `isActive` kapısı): ScreenHeader'ın bulanıklığı için doğru olan bu. Ama
   * yapışan chrome (bkz. chromeSlideStyle) AKIŞ listesinin kendi offset'ini
   * bilmek zorunda — Gönderilerim'de 300 kaydırıp akışa geri dönülse chrome
   * yapışma tavanında, yani 120 aşağıda doğar ve ilk kartın üstüne binerdi
   * (akış listesi kendi offset'ini koruyor ama bir dokunuşa kadar scroll olayı
   * ÜRETMİYOR, yani paylaşılan değer bayat kalıyor).
   *
   * Bu değeri yalnız akış sayfası yazdığı için her zaman o listenin GERÇEK
   * offset'ini taşıyor; sayfa arkada beklerken de doğru kalıyor.
   */
  const feedScrollY = useSharedValue(0);

  /**
   * KARTLARIN ÜST BANTTA YAPIŞMASI — tüm hesap `feedCardFlight`te; burada
   * yalnız akış offset'i bağlanıyor. YALNIZ AKIŞ SAYFASINA veriliyor (aşağıda).
   */
  const flight = useFeedFlight(feedScrollY);

  /**
   * ⚠️ ÇEKME KİLİTLERİ KALDIRILDI (`feedDragging` / `feedPullEngaged`): aşağı
   * çekmek artık haritayı açmıyor, YENİLİYOR (istek). O iki değer yalnız
   * "momentum bounce'u gerçek çekmeden ayır" işini yapıyordu ve o ayrımın tek
   * müşterisi haritayı açan eşikti.
   */
  const feedScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      scrollY.value = y;
      feedScrollY.value = y;
    },
  });

  /**
   * Sayfanın sorgusu sekmeye BİR KEZ girildiyse açılıyor. Bayrak sekmeye
   * BASILDIĞINDA çevriliyor, `activeTab` değişiminde değil: state pager
   * oturunca dönüyor (usePagerTabCommit) ve ona bağlı kalınsaydı sayfa önce
   * boş kayıp gelir, yerine oturduktan sonra iskelet belirirdi.
   */
  const [visited, setVisited] = useState<Record<FeedPageKey, boolean>>(() => ({
    feed: true, // ilk sayfa her halükârda açılıyor
    mine: initialRequest === "mine",
  }));
  const markVisited = useCallback((key: FeedPageKey) => {
    setVisited((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  // ── Filtreler ─────────────────────────────────────────────────────────────
  const userId = useAppSelector(
    (s: any) => s.auth?.user?.userId ?? s.auth?.user?.id ?? null,
  );
  // Tercihler MMKV'de, kullanıcıya scope'lu. İlk değer `useState` initializer'ı
  // ile senkron okunuyor: effect'le yazılsaydı liste bir kere varsayılanla
  // çekilir, sonra tercihle İKİNCİ kez çekilirdi.
  const [storedParams, setStoredParams] = useState<FeedListParams>(() =>
    loadFeedParams(userId),
  );

  const meQuery = useFeedMe();
  const me = meQuery.data;

  /**
   * Sorguya giden filtre = diskteki tercih, YETKİYLE SÜZÜLMÜŞ.
   * Kullanıcı Plus'tan düştüyse diskte kalmış "başka kampüs" tercihi her
   * açılışta UT-7310 üretir ve akış boş görünürdü. Disk DEĞİŞMİYOR — abonelik
   * geri gelirse tercih de geri gelsin (bkz. feedPrefs.sanitizeFeedParams).
   */
  const listParams = useMemo(
    () => sanitizeFeedParams(storedParams, me),
    [storedParams, me],
  );

  const applyParams = useCallback(
    (next: FeedListParams) => {
      setStoredParams(next);
      saveFeedParams(userId, next);
      // Query key değiştiği için yeni bir infinite query doğuyor; elle reset
      // GEREKMİYOR (sayfalama modu da key'in içinde).
    },
    [userId],
  );

  const postsQuery = useFeedPosts(listParams);
  const minePostsQuery = useMyFeedPosts({ enabled: visited.mine });

  /**
   * Kendi ana fotoğrafım — sunucu kendi gönderimin avatarını boş bırakıyor
   * (gerekçe: feedQueries > useOwnFeedAvatar). EKRAN DÜZEYİNDE bir kez, karta
   * prop olarak iniyor: satır başına bir hook, listedeki her gönderiyi aynı
   * sorgunun abonesi yapardı.
   */
  const ownPhotoUrl = useOwnFeedAvatar();

  const toggleLike = useTogglePostLike();

  const posts = postsQuery.data?.items ?? [];
  const minePosts = minePostsQuery.data?.items ?? [];

  // ── "şu sayfayı aç" isteğinin ISRARLI uygulanması ─────────────────────────
  //
  // TEK ATIMLIK `setPage`/`initialPage` GÜVENİLİR DEĞİL — istek çoğu zaman bu
  // ekranın DIŞINDAN geliyor (push, SignalR) ve pager'ın en kırılgan anına
  // düşüyor: (a) ekran arka plandayken iOS'ta pager bir SwiftUI TabView ve
  // hosting controller'ı ancak view PENCEREYE girince kuruluyor; (b) lazy mount
  // anında çocuklar Fabric'te TEK TEK ekleniyor ve pager "seçili sayfa çocuk
  // sayısını aşıyor" diye onu kırpıyor — `initialPage={2}` ilk çocuk geldiğinde
  // 0'a düşebiliyor. Tam teşhis: ProfileScreen.tsx:745-768.
  //
  // İki emniyet: (a) ısrar TEK odak epizoduyla sınırlı, sonunda bırakılıyor —
  // yoksa kullanıcı günler sonra Akış sekmesine kendi girdiğinde bayat bir
  // istek onu Yanıtlar'a fırlatırdı; (b) parmakla kaydırma başlarsa ısrar
  // anında düşüyor, kullanıcıyla inatlaşmıyoruz.
  /**
   * `expandMap`in geç kurulan sürümüne köprü — kampüs anı bildiriminden
   * gelen "haritayı aç" isteği bunu çağırıyor (gerekçe aboneliğin içinde).
   */
  const expandMapRef = useRef<(() => void) | null>(null);
  const pageRequestRef = useRef<FeedPageKey | null>(initialRequest);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearRetries = useCallback(() => {
    retryTimersRef.current.forEach(clearTimeout);
    retryTimersRef.current = [];
  }, []);
  const abandonRequest = useCallback(() => {
    pageRequestRef.current = null;
    dropFeedRequest();
    clearRetries();
  }, [clearRetries]);

  const applyPageRequest = useCallback(
    (animated: boolean) => {
      const want = pageRequestRef.current;
      if (!want) return;
      const index = FEED_PAGE_INDEX[want];
      if (pagerPageRef.current === index) {
        abandonRequest();
        return;
      }
      // Hedef sayfanın sorgusu pager oturmadan başlasın.
      markVisited(want);
      const pager = pagerRef.current as any;
      // Ekran öndeyse animasyonlu (kullanıcı sayfanın çevrildiğini görsün);
      // arka plandaysa animasyonsuz — sekme öne geldiğinde sayfa ÇOKTAN
      // hedefte olmalı, geçişin ortasında akış sayfası görünmemeli.
      if (!animated && typeof pager?.setPageWithoutAnimation === "function") {
        pager.setPageWithoutAnimation(index);
      } else {
        pager?.setPage?.(index);
      }
    },
    [abandonRequest, markVisited],
  );

  const commitPage = useCallback((index: number) => {
    const key = PAGES[index];
    if (key) setActiveTab(key);
  }, []);
  const pagerCommitHandlers = usePagerTabCommit(commitPage);

  const handlePageSelected = useCallback(
    (e: any) => {
      const position = e?.nativeEvent?.position;
      if (typeof position === "number") {
        pagerPageRef.current = position;
        const key = PAGES[position];
        if (key) {
          markVisited(key);
          // İstek yerine ulaştı → ısrarı bırak.
          if (pageRequestRef.current === key) abandonRequest();
        }
      }
      pagerCommitHandlers.onPageSelected(e);
    },
    [pagerCommitHandlers, markVisited, abandonRequest],
  );

  const handlePageScrollStateChanged = useCallback(
    (e: any) => {
      if (e?.nativeEvent?.pageScrollState === "dragging") abandonRequest();
      pagerCommitHandlers.onPageScrollStateChanged(e);
    },
    [pagerCommitHandlers, abandonRequest],
  );

  const handleTabChange = useCallback(
    (key: string, index: number) => {
      // Şeride basmak doğrudan setState ETMİYOR: pager'a sayfa değiştirmesini
      // söylüyor, sekme state'i pager'ın kendi olaylarından dönüyor. Kullanıcının
      // kendi seçimi bekleyen isteği de iptal eder.
      abandonRequest();
      markVisited(key as FeedPageKey);
      pagerRef.current?.setPage(index);
    },
    [abandonRequest, markVisited],
  );

  // Ekran ZATEN mount ise (sekme daha önce açılmış) istek buradan geliyor.
  useEffect(
    () =>
      uiBus.on(FEED_OPEN_EVENT, (payload?: { expandMap?: boolean }) => {
        const want = consumeFeedRequest();
        // ⚠️ Harita isteği sayfa isteğinden BAĞIMSIZ okunuyor: kampüs anı
        // bildirimi zaten akış sayfasındayken de gelebilir ve o durumda
        // `consumeFeedRequest()` boş döner ama harita yine açılmalı.
        //
        // ⚠️ `expandMap` REF ÜZERİNDEN: fonksiyon bu abonelikten SONRA
        // tanımlanıyor (harita durumu ekranın alt yarısında kuruluyor) ve
        // doğrudan çağırmak "used before declaration" veriyor. Aboneliği
        // oraya taşımak da olmaz — o zaman her harita durumu değişiminde
        // yeniden kurulurdu.
        if (payload?.expandMap) expandMapRef.current?.();
        if (!want) return;
        pageRequestRef.current = want;
        if (navigation.isFocused?.()) applyPageRequest(true);
      }),
    [applyPageRequest, navigation],
  );

  // Odak: bekleyen istek varsa uygula ve pager oturana kadar birkaç kez tekrarla.
  // Epizot bitince istek düşüyor — bayat istek bir sonraki ziyarete taşınmasın.
  useFocusEffect(
    useCallback(() => {
      if (!pageRequestRef.current) return;
      applyPageRequest(false);
      if (!pageRequestRef.current) return;
      clearRetries();
      retryTimersRef.current = FEED_PAGE_RETRY_MS.map((ms, i) =>
        setTimeout(() => {
          applyPageRequest(false);
          if (i === FEED_PAGE_RETRY_MS.length - 1)
            pageRequestRef.current = null;
        }, ms),
      );
      return clearRetries;
    }, [applyPageRequest, clearRetries]),
  );
  useEffect(() => clearRetries, [clearRetries]);

  // ── Tazelik: uiBus köprüleri ──────────────────────────────────────────────
  // Push/SignalR yolu. KOŞULSUZ: 30sn'lik tazelik eşiği kısa bir arka plan
  // turundan sonra yenilemeyi yutardı.
  useEffect(
    () =>
      uiBus.on(FEED_DIRTY_EVENT, () => {
        minePostsQuery.refetch?.();
        meQuery.refetch?.();
      }),
    [minePostsQuery, meQuery],
  );

  // ── Sekme şeridi ──────────────────────────────────────────────────────────
  // YANITLAR SEKMESİ KALDIRILDI (iki modlu yapı).
  const tabs = useMemo(
    () => [
      { key: "feed", label: t("feed.tabFeed"), count: null },
      { key: "mine", label: t("feed.tabMine"), count: null },
    ],
    [t],
  );

  // ── Aksiyonlar ────────────────────────────────────────────────────────────
  const handleToggleLike = useCallback(
    (post: FeedPostDto) => {
      toggleLike.mutate({ postId: post.id, next: !post.likedByMe });
    },
    [toggleLike],
  );

  const handleOpenChat = useCallback((conversationId: string | null) => {
    if (!conversationId) return;
    (navigationRef as any).navigate("Chat", { conversationId });
  }, []);

  // YANIT KABUL/GEÇ mutasyonları KALDIRILDI (iki modlu yapı): yanıt yazarak
  // eşleşme kanalı kapandı. `handleOpenChat` DURUYOR — eşleşme listesinden
  // sohbete gitmek için hâlâ gerekiyor.

  /**
   * Yanıt kartına dokunmak → YANITLAYANIN PROFİLİ, kaydırarak karar.
   *
   * Kart artık tek bir kutu değil bir kapı: üstündeki tik/X hızlı yol, profil
   * ise "önce bakayım" yolu. İkisi aynı iki uca gidiyor (kabul / geç), karar
   * nerede verilirse verilsin sonuç aynı.
   *
   * SEÇİLEN MODAL Beğeniler'in kartı (`LikerSwipeModal`), yeni bir ekran DEĞİL:
   * sağa/sola kaydırma, X/tik satırı, şikayet/engelle ve üç nokta menüsü orada
   * hazır. Kararı keşif ucuna göndermesin diye `onDecide` ile devralıyoruz
   * (bkz. o prop'un notu) — yoksa yanıtı kabul etmek bir de kullanıcının
   * beğeni kotasından yiyordu.
   *
   * PROFİL AKSİYONSUZ `PreviewModal` DEĞİL (gönderi yazarında o kullanılıyor):
   * orada profil "gönderinin arkasındaki kişiyi görmek" içindir, burada ise
   * değerlendirilecek bir kart — zaten bir karar bekliyor.
   *
   * TÜM YANIT state'te tutuluyor, yalnız `replyId` değil: kabul/geç
   * sarmalayıcıları yanıtın kendisini alıyor (analytics + rozet düşürme).
   */
  // YANITLAYAN PROFİLİ yolu KALDIRILDI: yanıt kanalı üründen çıktı.

  /**
   * Paywall yolu — DiscoverScreen.tsx:1223-1239'daki şeklin aynısı.
   *
   * Önce yetkiler tazeleniyor: kullanıcı az önce Plus almış olabilir ve ona
   * paywall göstermek satın aldığı şeyi tekrar satmaya çalışmak olurdu.
   * `unwrap()` "zaten premium" derse yalnız `/me` tazeleniyor; ağ hatasında
   * bile paywall açılıyor (kapıyı sessizce kapatmaktansa).
   */
  const openPaywall = useCallback(() => {
    // ⚠️ Olay BURADA atılıyor, `openLitPlus()`un içinde değil: o fonksiyon
    // kaynak parametresi almıyor, kaynağı ancak çağıran biliyor.
    analytics.capture("feed_paywall_shown");
    dispatch(refreshEntitlementsForPaywall())
      .unwrap()
      .then((premium: boolean) => {
        if (premium) {
          meQuery.refetch?.();
          return;
        }
        openLitPlus();
      })
      .catch(() => openLitPlus());
  }, [dispatch, meQuery]);

  // ── Composer + paylaşma ───────────────────────────────────────────────────
  const createPost = useCreatePost();
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [supportVisible, setSupportVisible] = useState(false);
  const [quotaSheet, setQuotaSheet] = useState<{
    visible: boolean;
    nextResetAt: string | null;
  }>({ visible: false, nextResetAt: null });

  const gate = composeGate(me);

  // Konu kataloğu + etiket çözücü. `me` değişince (dil/kota tazelemesi)
  // yenileniyor; etiket fonksiyonu `me`yi kapattığı için sunucu etiketleri
  // de tazeyi kullanıyor.
  const topicKeys = useMemo(() => resolveTopicKeys(me), [me]);
  /**
   * Etiketin GÖRÜNEN biçimi: `#` + küçük harf (istek).
   *
   * Tek bir çözücü var ve composer/filtre/pill üçü de onu kullanıyor — konu
   * aynı oturumda üç ayrı yerde görünüyor, biri "Ev arkadaşı" diğeri
   * "#ev arkadaşı" yazsa aynı şeyin iki ayrı adı gibi okunur. Kart kendi
   * çözücüsünü kullanıyor ve kullanmak ZORUNDA: `me`yi görmüyor (bkz.
   * FeedPostCard başlığı).
   */
  const topicLabelFor = useCallback(
    (key: string) => topicHashtag(key, me),
    [me],
  );

  const openComposer = useCallback(() => {
    // ⚠️ HAK BİTTİĞİNDE KOTA SHEET'İ AÇILMIYOR (istek): composer'ın KENDİSİ
    // açılıyor, rozetinde "0 hakkın kaldı" yazıyor ve gönder butonu basılamaz
    // halde duruyor (bkz. FeedComposerSheet > quotaExhausted). Kullanıcı aynı
    // modalı görüyor, araya giren ikinci bir sheet yok.
    //
    // `FeedQuotaSheet` SİLİNMEDİ — yanıt yolu onu hâlâ kullanıyor (bkz.
    // handleOpenReply). Orada composer'ı açıp kilitlemek aynı iş GÖRMEZ: yanıt
    // composer'ı bir gönderinin üstüne açılıyor ve kullanıcı yazdığı yanıtı
    // gönderemeyeceğini ancak butona varınca anlar.
    //
    // Kısıt dalı DEĞİŞMEDİ: orada composer açmak yanlış olurdu, kısıt bir hak
    // değil ceza — yazdırıp sonra reddetmek kullanıcıyı iki kez kaybettirir.
    if (gate.kind === "restricted") return;
    setComposerError(null);
    setComposerVisible(true);
  }, [gate]);

  /**
   * Gönderi gönderimi — hata yönetimi SHEET'TE DEĞİL BURADA
   * (DiscoverScreen.tsx:2079-2126 şablonu): sheet'in kapanıp kapanmayacağına,
   * metnin korunup korunmayacağına çağıran karar veriyor.
   */
  const handleSendPost = useCallback(
    (body: string, isAnonymous: boolean, topics: string[]) => {
      setComposerError(null);
      createPost.mutate(
        { body, isAnonymous, topics },
        {
          onSuccess: (result) => {
            setComposerVisible(false);
            if (result.supportResources) {
              // Gönderi yayına ALINMADI ve hak düşmedi; o an gereken şey
              // moderasyon açıklaması değil, destek ekranı.
              setSupportVisible(true);
              return;
            }
            analytics.capture("feed_post_created", {
              anonymous: isAnonymous,
              status: result.post?.status ?? null,
            });
            showInfoToast({
              message: t(
                result.post?.status === "PendingReview"
                  ? "feed.composer.pending"
                  : "feed.composer.sent",
              ),
            });
            // "Gönderilerim"e geç: kullanıcı gönderisinin nerede olduğunu
            // görsün (PendingReview ise orada "inceleniyor" rozetiyle duruyor).
            handleTabChange("mine", FEED_PAGE_INDEX.mine);
          },
          onError: (e) => {
            const code = feedErrorCode(e);
            const serverMessage = feedErrorMessage(e);
            const result = feedErrorResult(e);

            // Kota bitti → sheet AÇIK KALIR ve kendi içinde kilitlenir.
            //
            // Eskiden burada sheet kapanıp kota sheet'i açılıyordu; o sheet
            // post yolundan tümden kalktı (bkz. openComposer). Yerine konan şey
            // bir metin değil, `/me`'ye yazılan kota: `remaining` 0'a inince
            // rozet "0 hakkın kaldı" yazıyor ve gönder butonu basılamaz hale
            // geliyor — yani kullanıcı zaten composer'ı hakkı bitmiş halde
            // açmış olsaydı göreceği ekranın AYNISI.
            //
            // Bu yazım ayrıca gerçek bir yarışı da kapatıyor: `/me` bayatken
            // (ör. başka cihazdan paylaşıldı) composer "hakkın var" diye açılır
            // ve hak bittiğini ancak sunucu söyler. O an kullanıcıyı boş bir
            // ekrana atmak yerine aynı modal kilitleniyor.
            if (code === FEED_CODES.POST_QUOTA) {
              writeFeedQuotaExhausted(qc, "post", result?.nextResetAt ?? null);
              setComposerError(serverMessage ?? t("feed.quota.exhaustedBody"));
              return;
            }

            // Kısıt → sheet kapanır, /me tazelenir (kısıt bitmiş olabilir).
            if (
              code === FEED_CODES.FEED_RESTRICTED ||
              code === FEED_CODES.ANONYMOUS_RESTRICTED
            ) {
              setComposerVisible(false);
              meQuery.refetch?.();
              showInfoToast({
                message: serverMessage ?? t("feed.restricted.feed"),
              });
              return;
            }

            // Anonim Plus gerektiriyor → sheet kapanır, paywall.
            if (code === FEED_CODES.ANONYMOUS_REQUIRES_PLUS) {
              setComposerVisible(false);
              openPaywall();
              return;
            }

            if (code === FEED_CODES.CONTENT_REJECTED) {
              // `category` yalnız ÖLÇÜM için — kullanıcıya kategoriye özel
              // metin GÖSTERİLMİYOR (kurallar değişiyor, sunucu mesajı kazanır).
              analytics.capture("feed_post_blocked", {
                category: result?.category ?? null,
              });
            }

            // Geri kalan HER ŞEY (UT-7306 içerik reddi, UT-7303 uzunluk,
            // UT-7316 fren, ağ hatası) → sheet AÇIK KALIR, metin korunur.
            // ⚠️ Sunucunun `message`'ı KAZANIR: kullanıcının dilinde, kurallarla
            // birlikte güncelleniyor; istemci kopyası bayatlıyor.
            setComposerError(
              serverMessage ?? t(feedCodeI18nKey(code) ?? "feed.codes.generic"),
            );
          },
        },
      );
    },
    [createPost, t, handleTabChange, meQuery, openPaywall],
  );

  // YANIT VERME YOLU KALDIRILDI (iki modlu yapı): composer, kota kapısı,
  // gönderim mutasyonu ve hata makinesi birlikte düştü. Eşleşme kanalı artık
  // yazarın profil kartı (bkz. handlePressAuthor → PreviewModal).

  // ── Kart menüsü: şikayet / sil ────────────────────────────────────────────
  const deletePost = useDeletePost();
  const [reportTarget, setReportTarget] = useState<{
    targetType: "Post" | "Reply";
    postId?: string | null;
    replyId?: string | null;
    isAnonymous: boolean;
  } | null>(null);

  /**
   * KAMPÜS ANI ŞİKAYETİ — kartın natif uzun basış menüsünden.
   *
   * ⚠️ AKIŞIN ŞİKAYET UCU DEĞİL (`FeedReportSheet` / `POST /api/feed/reports`):
   * o uç gönderi/yanıt hedefliyor ve gövdesinde `reportedUserId` yok. Kampüs
   * anının bir SAHİBİ var (`moment.userId`, swipe hedefiyle aynı id), yani
   * doğru uç genel moderasyon ucu — profil ve sohbet şikayetleriyle aynı form.
   */
  const [reportMoment, setReportMoment] = useState<CampusMomentDto | null>(
    null,
  );

  const handlePostMenu = useCallback(
    (post: FeedPostDto) => {
      if (post.isMine) {
        Alert.alert(
          t("feed.mine.deleteConfirmTitle"),
          // İKİ sonuç da yazılı: hak geri gelmiyor VE bekleyen yanıtlar düşüyor.
          // İkincisini söylememek kullanıcıyı yanıtlarından ediyordu.
          t("feed.mine.deleteConfirmBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("feed.mine.delete"),
              style: "destructive",
              onPress: () => deletePost.mutate({ postId: post.id }),
            },
          ],
        );
        return;
      }
      setReportTarget({
        targetType: "Post",
        postId: post.id,
        isAnonymous: post.isAnonymous,
      });
    },
    [t, deletePost],
  );

  // ⚠️ `handleReplyMenu` SİLİNDİ: kartın üç nokta butonu kaldırıldı, yanıt
  // moderasyonu artık yanıtlayanın profilinden geçiyor (bkz. handleReplyPress →
  // LikerSwipeModal'ın kendi şikayet/engelle satırları ve üç nokta menüsü).
  // ⚠️ FARK: oradaki şikayet KULLANICIYI hedefliyor (moderationService), burada
  // ise YANIT İÇERİĞİ hedeflenebiliyordu (`FeedReportSheet`, targetType
  // "Reply"). Yanıt içeriğini şikayet etme yolu şu an hiçbir ekranda AÇIK
  // DEĞİL — sheet'in kendisi duruyor, yalnız gönderi dalı kullanılıyor.

  // ── Sheet'ler ─────────────────────────────────────────────────────────────
  const [filterVisible, setFilterVisible] = useState(false);
  const [universityVisible, setUniversityVisible] = useState(false);
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);
  // ⚠️ SIRA: mod hook'u author-profile sorgusundan ÖNCE okunuyor (sorgu
  // anahtarı modu taşıyor).
  const { mode: selectedMode } = useAppMode();
  const authorProfile = useFeedAuthorProfile(previewPostId, selectedMode);
  /**
   * Ekrandaki dolgulu yüzeylerin rengi — başlık pill'i ve kota sheet'inin Plus
   * satırı. Akışın kendisi mod-nötr bir kampüs akışı ama ekrandaki aksiyonlar
   * SEÇİLİ MODDA yapılıyor (bkz. cardMode); iki yüzeyin kırmızı kalması
   * Arkadaş modunda ekrandaki tek dating işareti oluyordu.
   *
   * ⚠️ `cardMode` DEĞİL `selectedMode`: cardMode yazarın açık modlarına göre
   * daralabiliyor (yazar yalnız Flört'te açıksa Arkadaş'tayken bile Dating
   * dönüyor) ve o karar KART içindir. Ekranın kromu kullanıcının seçtiği modu
   * göstermeli, bir başkasının profil ayarını değil.
   */
  const accent = modeAccent(selectedMode);

  // ── Yazar kartının AKSİYON MODU ───────────────────────────────────────────
  // Keşif'teki seçili mod (Beğeniler'le de paylaşılan tek kaynak) + sunucunun
  // `availableModes` listesi → kartın hangi modda açılacağı. Karar saf bir
  // fonksiyonda (bkz. feedCardMode): yanlış dal sessizce yanlış modda beğeni
  // atıyor ve geri alınamıyor.
  const cardMode = useMemo(
    () =>
      resolveCardMode(
        (authorProfile.data as any)?.availableModes,
        selectedMode,
      ),
    [authorProfile.data, selectedMode],
  );

  /**
   * Yazarın BEKLEYEN bir beğenisi var mı — tespitin kuralları (bayrak katılığı,
   * `userId` kapısı, eşleşme/kendi beğenim dışlamaları, OR'un gerekçesi)
   * `authorLikedMe`'nin içinde ve orada test altında, burada tekrar edilmiyor.
   *
   * ── PREMIUM KAPISI (istek) ────────────────────────────────────────────────
   * `isPremium &&`: free kullanıcıda kabul/reddet çifti HİÇ çizilmiyor, kart
   * normal hâlinde (Fire/Spark + not) açılıyor. "Bu kişi beni beğenmiş"
   * bilgisi Beğenenler ekranının satış argümanı; backend alanı tier'dan
   * bağımsız döndürüyor (LikerProfile ile parite) ve kapıyı istemciye bıraktı.
   *
   * ⚠️ KAPI İSTEMCİDE OLMAK ZORUNDA, sunucuyu gatelemek YETMEZ: tespitin
   * ikinci kolu yerel `whoLikedMeIds` kümesi ve o liste ucu premium gating'e
   * tabi değil (`api.ts > WHO_LIKED_ME`: "kartlar ve totalProfiles free'de de
   * TAM geliyor"). Sunucu bayrağı kısılsa bile Redux kolu free kullanıcıda
   * kartı beğenilmiş hâle çevirmeye devam ederdi.
   *
   * ⚠️ `premiumResolved` EKLENMİYOR ve bu bilinçli: `isPremium` resolved olana
   * kadar zaten `false`, yani kapıya bir şey katmıyor (bkz. premiumTier > tipin
   * notu). Bedeli açık: soğuk açılışın ilk saniyelerinde premium kullanıcı da
   * normal kart görüyor ve o pencerede zaten bekleyen birine Fire harcayabilir.
   * Alternatifi bayrak çözülünce butonları elinin altında takla attırmaktı —
   * kart hâlini bir kez, açılışta çözüyor (aşağıdaki deps).
   */
  const authorHasLikedMe = useMemo(
    () =>
      isPremium &&
      authorLikedMe(authorProfile.data, (userId) =>
        // Yerel küme SEÇİLİ MODUN likerlarını tutuyor (fetchWhoLikedMe >
        // loadAppMode, bkz. swipeSlice.ts:30-43'teki not). `cardMode`
        // `selectedMode`'dan ayrıştığında (yazar başka modda açık) o kümeye
        // bakmak BAŞKA modun sinyaliyle kabul/reddet çizer — oysa kabul
        // `cardMode`'da gidecek ve X'in beğenisi öbür modda durduğu için
        // eşleşme OLUŞMAZ (sunucu mutual'ı bulamaz), ret ise zaten bekleyen
        // birine boşa gider. Modlar ayrışınca güvenli taraf: normal karta düş.
        // (`store.getState()` — `useAppSelector` DEĞİL, bkz. swipeSlice.ts:137,
        // render churn; değer kart açılırken bir kez çözülüyor.)
        cardMode === selectedMode && hasLikedMe(store.getState(), userId),
      ),
    [authorProfile.data, cardMode, selectedMode, isPremium],
  );

  /**
   * Yazarla ZATEN EŞLEŞTİK mi — kuralları `authorIsMatched`'ın içinde (bayrak
   * katılığı, mod kapsamı, premium kapısının NEDEN olmadığı).
   *
   * ⚠️ `authorHasLikedMe`'nin aksine premium ile sarılmıyor: bu bir gizleme,
   * bir hak değil.
   */
  const authorMatched = useMemo(
    () => authorIsMatched(authorProfile.data),
    [authorProfile.data],
  );

  /**
   * Kartta HANGİ AKSİYONLAR var — moda, "yazar beni beğenmiş mi"ye VE "zaten
   * eşleştik mi"ye göre (istek). Dört hâl (bkz. feedCardActions'ın kendi doc'u):
   *   • NORMAL (henüz beğenilmemiş): yalnız Fire/Spark + not, X ve tik YOK.
   *   • BEĞENİLMİŞ: kabul (tik) + reddet (X), Fire ve not YOK.
   *   • EŞLEŞMİŞ: hiçbiri — zaten açık bir kanal var, yakılacak Fire/not yok.
   *   • MOD YOK (`cardMode` null): hiçbiri — kart salt okunur.
   * Karar saf fonksiyonda (bkz. feedCardActions).
   */
  const cardActions = useMemo(
    () => feedCardActions(cardMode, authorHasLikedMe, authorMatched),
    [cardMode, authorHasLikedMe, authorMatched],
  );

  // Fire bakiyesi kartta rozet olarak gösteriliyor (keşifteki kartla aynı
  // sözleşme). Deste sorgusuyla AYNI cache — ek tur yok.
  const statsQuery = useSwipeStats();

  const [firePurchaseVisible, setFirePurchaseVisible] = useState(false);
  const [notePurchaseVisible, setNotePurchaseVisible] = useState(false);
  const notesRemaining = statsQuery.data?.notesRemaining ?? null;

  /**
   * Fire kotası/bakiyesi bitti mi — KURAL KEŞİF'TEKİYLE BİREBİR AYNI
   * (DiscoverScreen > fireQuotaExhausted): `null` = değer henüz bilinmiyor
   * (satın alma sonrası optimistic pencere) → bloklamıyoruz; negatif TÜKENMİŞ
   * sayılıyor, çünkü Fire'ın "sınırsız" hâli yok.
   *
   * Flört kartında bu kapı artık ÜRÜNÜN BELKEMİĞİ: beğeni kaldırıldığı için
   * tükenmiş Fire sessiz kalırsa kullanıcının elinde yalnız not kalıyor ve
   * nedenini hiçbir yerden okuyamıyor.
   *
   * ⚠️ Bu kapı artık YALNIZ NORMAL kartta anlamlı: beğenilmiş hâlde Fire
   * butonu zaten hiç çizilmiyor (bkz. cardActions.fire), dolayısıyla burada
   * hesaplanan değerin o hâlde okunacağı bir yer yok.
   */
  const fireQuotaExhausted = useMemo(() => {
    const rem = statsQuery.data?.superLikesRemaining;
    if (rem == null) return false;
    return rem <= 0;
  }, [statsQuery.data?.superLikesRemaining]);

  /**
   * Fire tükenmişken butona basıldı → Keşif'teki `showFireLimitUi`'nin aynısı:
   * durumu açıklayan toast + consumable paket sheet'i.
   *
   * Metin TIER'A GÖRE: premium'da kota rolling 7 günde yenileniyor (satacak bir
   * şey yok), free'de lifetime hak bitmiş ve kendiliğinden yenilenmiyor.
   * `resetText` null → backend "asla resetlenmez" dedi, cooldown metni yanlış
   * vaat olurdu.
   *
   * KART KAPANIYOR: sheet onun üstüne binerse iki bottom sheet üst üste gelir
   * (not composer'ındaki aynı kural, bkz. handleAuthorNote).
   */
  const handleFireBlocked = useCallback(() => {
    setPreviewPostId(null);
    const resetText = statsQuery.data?.isPremium
      ? formatResetTime(statsQuery.data?.superLikeResetInSeconds, t)
      : null;
    showInfoToast(
      resetText
        ? {
            title: t("discover.swipe.fireCooldownTitle"),
            message: t("discover.swipe.fireCooldownMessage", {
              time: resetText,
            }),
            icon: "fire",
          }
        : {
            title: t("discover.swipe.fireExhaustedTitle"),
            message: t("discover.swipe.fireExhaustedMessage"),
            icon: "fire",
          },
    );
    setFirePurchaseVisible(true);
  }, [statsQuery.data?.isPremium, statsQuery.data?.superLikeResetInSeconds, t]);

  /**
   * Kart üzerinden not gönderimi.
   *
   * COMPOSER BU EKRANDA RENDER EDİLİYOR, Keşif'e devredilmiyor. uiBus ile
   * devretmek denendi ve kırılgan: Keşif sekmesi LAZY MOUNT ve uiBus REPLAY
   * YAPMIYOR — kullanıcı Keşif'e hiç girmemişse olay boşluğa düşer ve not
   * kutusuna dokunmak hiçbir şey yapmaz (feedEntry.ts'teki aynı tuzak).
   *
   * Mutasyon ortak (`useNoteMutation`), yani kota/bakiye/paywall davranışı
   * Keşif'tekiyle birebir aynı — ayrışan tek şey composer'ın nerede
   * çizildiği.
   */
  const noteMutation = useNoteMutation();
  const [noteRequest, setNoteRequest] = useState<{
    target: NoteTarget;
    profile: any;
    /**
     * GÖNDERİ dalında dolu (akış satırındaki not butonu), yazar kartı dalında
     * null. İki dal aynı composer'ı ve aynı mutasyonu paylaşıyor; ayrışan tek
     * şey hedefin nereden geldiği ve composer'da hangi önizlemenin çizildiği.
     */
    post?: FeedPostDto | null;
    /** Gönderi dalında notun gideceği mod — kart açılmadığı için `cardMode` yok. */
    mode?: AppMode | null;
  } | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const handleAuthorNote = useCallback(
    (target: NoteTarget) => {
      const profile = authorProfile.data as any;
      if (!profile?.userId) return;
      setNoteError(null);
      // Kart KAPANIYOR: composer onun üstüne binerse iki sheet üst üste gelir
      // ve gorhom'un stack sırası beklenmedik hâle düşer (mod seçicideki aynı
      // kural).
      setPreviewPostId(null);
      // BAKİYE KAPISI — Keşif'teki `handleNoteRequest`in aynısı: bakiye 0 ya da
      // alan hiç gelmemişse (`null`) composer DEĞİL paket sheet'i açılıyor.
      // Gönderilemeyecek bir metni yazdırıp sonra reddetmek kullanıcıyı iki kez
      // kaybettirir — Flört kartında not iki zorunlu yoldan biri olduğu için
      // bedeli daha da büyük.
      if (typeof notesRemaining !== "number" || notesRemaining <= 0) {
        analytics.capture("note_paywall_shown", {
          reason: notesRemaining === null ? "unknown_balance" : "empty_balance",
          surface: "feed",
        });
        setNotePurchaseVisible(true);
        return;
      }
      setNoteRequest({ target, profile });
    },
    [authorProfile.data, notesRemaining],
  );

  const handleSendAuthorNote = useCallback(
    async (comment: string) => {
      const req = noteRequest;
      if (!req) return;
      setNoteError(null);
      try {
        await noteMutation.mutateAsync({
          userId: req.profile.userId,
          comment,
          target: req.target,
          // Notun modu da taşınıyor: sunucu swipe satırını o modun altına
          // yazıyor (bkz. useNoteMutation).
          mode: cardMode ?? undefined,
        });
        analytics.capture("note_sent", {
          targetKind: req.target.kind,
          surface: "feed",
          mode: cardMode ?? null,
        });
        setNoteRequest(null);
        // ⚠️ KART YOLUNDAN GİDEN NOT DA KİŞİ SEVİYESİNDE SONUÇ DOĞURUYOR:
        // sunucu bundan sonra o yazarın TÜM gönderilerinde `AlreadySwiped`
        // dönecek. Akıştaki satırlar yamalanmazsa kart kapandıktan sonra
        // listede duran not butonları basılabilir kalır ve UT-6404 yer.
        patchAuthorPostsInCaches(qc, req.profile.userId, (p) => ({
          ...p,
          note: { ...(p.note ?? { state: "Ok" }), state: "AlreadySwiped" },
        }));
        // TEK ONAY BU SATIR: Keşif'te notun ardından alev süpürmesi ve kartın
        // desteden düşmesi de "gitti" diyordu, akışta öyle bir karşılık YOK —
        // kart kapanıyor ve kullanıcı aynı listeye dönüyor.
        showInfoToast({
          title: t("note.sentTitle"),
          message: t("note.sentMessage", {
            name: req.profile.displayName ?? "",
          }),
          icon: "note",
        });
      } catch (e: any) {
        const code = e?.response?.data?.code ?? null;

        // Bakiye bitti (UT-6401) → composer kapanır, paket sheet'i açılır.
        // Kapıdan geçmiş ama aradaki turda bakiye tükenmiş olabiliyor (başka
        // cihaz, bayat `/Stats`): inline hata burada kullanıcıyı çıkmaz sokakta
        // bırakırdı.
        if (code === NOTE_SEND_CODES.NO_BALANCE) {
          setNoteRequest(null);
          setNotePurchaseVisible(true);
          return;
        }

        // Hedef geçersiz: fotoğraf silinmiş ya da sıra kaymış — kart BAYAT.
        // Metni korumanın anlamı yok, aynı hedefe tekrar gönderilse yine düşer.
        if (code === NOTE_SEND_CODES.INVALID_TARGET) {
          setNoteRequest(null);
          qc.invalidateQueries({
            queryKey: feedKeys.authorProfile(previewPostId ?? ""),
          });
          showInfoToast({
            title: t("note.failedTitle"),
            message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
            icon: "note",
          });
          return;
        }

        // Geri kalan her şey: sheet AÇIK kalıyor ve metin korunuyor (composer
        // sözleşmesi).
        setNoteError(
          e?.response?.data?.message ??
            e?.message ??
            t("common.somethingWentWrong"),
        );
      }
    },
    [cardMode, noteMutation, noteRequest, previewPostId, qc, t],
  );

  /**
   * GÖNDERİYE not — akış satırındaki butonun yolu.
   *
   * `handleAuthorNote`in kardeşi; iki fark var:
   *  • Kart AÇILMIYOR, dolayısıyla `authorProfile` sorgusu hiç tetiklenmiyor.
   *    Hedef satırın kendisinde (`post.id`), alıcı da `post.author.userId`.
   *  • Kapı ve mod kararı ekranda DEĞİL `postNoteRequest`te. Burada yalnız
   *    sonucu uyguluyoruz — sıra değişmezi (yazar/mod → bakiye) o modülde
   *    kilitli, çünkü ikinci bir yerde tekrar yazılsaydı ikisi ayrışırdı.
   */
  const handlePostNote = useCallback(
    (post: FeedPostDto) => {
      const decision = postNoteRequest(post, notesRemaining, selectedMode);
      if (decision.action === "none") return;
      setNoteError(null);
      if (decision.action === "paywall") {
        analytics.capture("note_paywall_shown", {
          reason: decision.paywallReason,
          surface: "feed_post",
        });
        setNotePurchaseVisible(true);
        return;
      }
      setNoteRequest({
        target: postNoteTarget(post.id),
        profile: null,
        post,
        mode: decision.mode,
      });
    },
    [notesRemaining, selectedMode],
  );

  const handleSendPostNote = useCallback(
    async (comment: string) => {
      const req = noteRequest;
      const post = req?.post;
      if (!req || !post) return;
      const userId = post.author?.userId;
      if (!userId) return;
      setNoteError(null);
      try {
        await noteMutation.mutateAsync({
          userId,
          comment,
          target: req.target,
          // Kartın modu YOK (kart açılmadı) — mod kararı `postNoteRequest`ten
          // geldiği gibi taşınıyor.
          mode: req.mode ?? undefined,
        });
        analytics.capture("note_sent", {
          targetKind: req.target.kind,
          surface: "feed_post",
          mode: req.mode ?? null,
        });
        setNoteRequest(null);
        // Satırdaki buton ANINDA kaybolsun — ve yalnız bu satırda değil,
        // YAZARIN TÜM GÖNDERİLERİNDE: not kişi başına tek gidiyor (Note
        // tablosunda UNIQUE(ActorId, TargetId)), yani bir not sonrası o
        // yazarın hiçbir gönderisine ikinci not atılamıyor. Tek satırı
        // yamasaydık aynı yazarın bir alttaki gönderisinde buton durur ve
        // basınca sunucudan UT-6404 yerdi.
        //
        // ⚠️ Değer `AlreadySwiped` — sunucunun bir sonraki çekimde göndereceği
        // kelimenin AYNISI. (`AlreadySent` sözleşmeden düştü: "bu gönderiye not
        // attın" hâli kişi-başına-tek kuralı yüzünden hiç oluşmuyor.)
        patchAuthorPostsInCaches(qc, userId, (p) => ({
          ...p,
          note: { ...(p.note ?? { state: "Ok" }), state: "AlreadySwiped" },
        }));
        showInfoToast({
          title: t("note.sentTitle"),
          message: t("note.sentMessage", { name: post.author?.name ?? "" }),
          icon: "note",
        });
      } catch (e: any) {
        const code = e?.response?.data?.code ?? null;

        // Bakiye bitti → composer kapanır, paket sheet'i açılır (kapıdan
        // geçmişken başka cihazda tükenmiş olabilir).
        if (code === NOTE_SEND_CODES.NO_BALANCE) {
          setNoteRequest(null);
          setNotePurchaseVisible(true);
          return;
        }

        // Kişiye zaten karar verilmiş (UT-6404) — KREDİ HARCANMADI ve bir
        // daha da gönderilemez. Bu yüzeyin EN OLASI hatası: satırdaki kapı
        // sayfa çekildiğinde donmuş bir anlık görüntü, kişi o arada Keşif'ten
        // ya da yazar kartından beğenilmiş olabiliyor. Composer'ı açık
        // tutmak kullanıcıyı asla çalışmayacak bir Gönder butonuyla baş başa
        // bırakırdı (Keşif'teki karşılığı: DiscoverScreen > ALREADY_SWIPED).
        if (code === NOTE_SEND_CODES.ALREADY_SWIPED) {
          setNoteRequest(null);
          // Aynı yazarın DİĞER satırları da kapansın: hata zaten "bu kişiye
          // bir daha olmaz" diyor.
          patchAuthorPostsInCaches(qc, userId, (p) => ({
            ...p,
            note: { ...(p.note ?? { state: "Ok" }), state: "AlreadySwiped" },
          }));
          showInfoToast({
            title: t("note.failedTitle"),
            message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
            icon: "note",
          });
          return;
        }

        // Hedef geçersiz: gönderi silinmiş, süresi dolmuş, moderasyondan
        // kalkmış ya da bu gönderiye zaten not gitmiş — SATIR BAYAT. Metni
        // korumanın anlamı yok, aynı hedefe tekrar gönderilse yine düşer.
        if (code === NOTE_SEND_CODES.INVALID_TARGET) {
          setNoteRequest(null);
          qc.invalidateQueries({ queryKey: feedKeys.postsRoot });
          showInfoToast({
            title: t("note.failedTitle"),
            message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
            icon: "note",
          });
          return;
        }

        // Gerisi: sheet AÇIK kalıyor ve metin korunuyor (composer sözleşmesi).
        setNoteError(
          e?.response?.data?.message ??
            e?.message ??
            t("common.somethingWentWrong"),
        );
      }
    },
    [noteMutation, noteRequest, qc, t],
  );

  /**
   * Kart kararından sonra: beğeni/Fire gittiyse aynı yazarın kartı bayatladı
   * (ör. artık eşleştiniz) ve akış satırları da yazarın durumunu taşıyor.
   *
   * ENGELLEME dalı ayrı: yazarın TÜM gönderileri listeden düşmeli.
   */
  const handleAuthorSwipe = useCallback(
    (userId: string, direction: string) => {
      qc.invalidateQueries({
        queryKey: feedKeys.authorProfile(previewPostId ?? ""),
      });
      if (direction === "block") {
        // Engellenen kişinin gönderileri sunucuda eleniyor — listeyi
        // tazelemek yeterli, elle budamaya gerek yok.
        qc.invalidateQueries({ queryKey: feedKeys.postsRoot });
      }
      // Kabul ya da reddetten sonra rozet ANINDA düşsün — Keşif'teki aynı kalıp
      // (`DiscoverScreen.tsx:2537` · `2711`). Kapı `hasLikedMe`: kümede olmayan bir
      // id için sayacı düşürmek, sayfalanmamış toplamı sessizce bozar
      // (bkz. swipeSlice > removeWhoLikedMe'nin notu).
      if (hasLikedMe(store.getState(), userId)) {
        dispatch(removeWhoLikedMe(userId));
        // Beğeniler ekranı mount'sa listesinden düşürsün — o ekran lazy
        // mount edip mount kalıyor, kendiliğinden tazelenmiyor (Keşif'teki
        // aynı çift: DiscoverScreen.tsx:2540 · :2713). Kabul SignalR'daki
        // "match" olayıyla örtük kapsanıyor; ret için tek kapsayan bu satır.
        uiBus.emit("likerHandled", { userId });
      }
    },
    [dispatch, qc, previewPostId],
  );

  const universityGate = universityPickerGate(me);
  const kindGate = kindFilterGate(me);

  const handleUniversityPill = useCallback(() => {
    // ⚠️ KAPI ARTIK BURADA DEĞİL, SHEET'İN İÇİNDE (istek). Eskiden free
    // kullanıcıya seçici hiç açılmıyordu ve pill doğrudan Plus'a gidiyordu;
    // gerekçe "seçtirip sonra UT-7310 ile geri almayalım"dı. O risk kalktı
    // çünkü seçim de kilitli: kilitli satır taslağı DEĞİŞTİRMİYOR, sheet'i
    // kapatıp Plus'a götürüyor (bkz. FeedUniversitySheet > handleLockedPress).
    // Kazanılan şey: kullanıcı satın alacağı şeyin ne olduğunu görüyor.
    setUniversityVisible(true);
  }, []);

  const handleApplyFilters = useCallback(
    (next: FeedFilterValue) => {
      // ⚠️ KANONİKLEŞTİRME BURADA: sheet çipleri DOKUNMA SIRASINDA biriktiriyor
      // ve o sıra bir bilgi değil. Ham dizi filtre imzasına girerse
      // ["Event","Advice"] ile ["Advice","Event"] iki ayrı infinite query
      // doğurur ve aynı liste iki kez çekilir (bkz. feedKeys.posts — anahtar
      // diziyi olduğu gibi katlıyor, kendi başına sıralamıyor).
      const topics = normalizeTopicSelection(next.topics);
      analytics.capture("feed_filter_changed", {
        sort: next.sort,
        interest: next.interest,
        kind: next.kind,
        // Çoklu seçim: olayda İKİ alan birden — `topics` hangi konuların
        // seçildiğini, `topicCount` kaç tanesinin seçildiğini söylüyor. Sayıyı
        // dizinin uzunluğundan türetmek analitik tarafında her sorguda bir
        // dizi açmak demek, oysa "kaç konu seçiliyor" asıl merak edilen.
        topics,
        topicCount: topics.length,
      });
      applyParams({ ...listParams, ...next, topics });
    },
    [applyParams, listParams],
  );

  const handleSelectUniversity = useCallback(
    (domain: string | null) =>
      applyParams({ ...listParams, university: domain }),
    [applyParams, listParams],
  );

  const handlePressAuthor = useCallback((post: FeedPostDto) => {
    setPreviewPostId(post.id);
  }, []);

  // ── Filtre satırı ─────────────────────────────────────────────────────────
  // Üç pill: kampüs · sıralama · filtre(rozetli). `FilterPills` tek seçimli bir
  // şerit olduğu için burada "aktif sekme" kavramı yok — her pill kendi
  // sheet'ini açıyor, o yüzden `activeTab` boş geçiliyor (ve bu yüzden
  // `chevron`: üçü de aşağı açılan bir seçici).
  //
  // Üniversite listesi domain → ad çevirisi için: pill eskiden "Kendi
  // kampüsüm" ya da HAM DOMAIN ("boun.edu.tr") yazıyordu; ikisi de kampüsün
  // adını söylemiyor. Liste `staleTime: Infinity` ile zaten önbellekte (kampüs
  // sheet'i aynı sorguyu kullanıyor), yani bu ek bir tur açmıyor.
  // ⚠️ `distinct` KAPALI ve bilinçli. İki iş yapıyor: (a) pill etiketi için
  // domain→ad haritası — kullanıcının KENDİ domain'i kanonik olmayabilir
  // (ör. `bau.edu.tr`), distinct listede bulunmaz ve etiket ham domain'e
  // düşerdi; (b) harita şeridinin TEK kampüs koordinatı — tek arama için
  // distinct'in anlamı yok. `distinct=true` ÇOKLU PIN içindir (tam ekran
  // harita, henüz yok).
  const { data: universities } = useUniversities();
  const universityNameByDomain = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of universities ?? []) {
      // `display` çift dilli NESNE, `name` sunucunun DB dilinden çözdüğü
      // string — doğru kaynak `resolveLocalized` (bkz. /api/common/* notu).
      map.set(u.domain, resolveLocalized(u.display, i18n.language, u.name));
    }
    return map;
  }, [universities, i18n.language]);

  /**
   * Kullanıcının KENDİ kampüsünün gösterim adı — composer'daki "bu gönderi X
   * akışında görünecek" satırı için.
   *
   * `/api/feed/me` yalnız DOMAIN veriyor (`bilgiedu.net`); satırda ham domain
   * yazmak kullanıcıya üniversitesinin adını değil sunucunun anahtarını
   * gösteriyordu. Ad çözülemezse (liste henüz gelmedi ya da domain listede yok)
   * domain'e düşüyor — satırı tümden gizlemektense.
   */
  const ownUniversityName = useMemo(() => {
    const domain = me?.universityDomain ?? null;
    if (!domain) return null;
    return universityNameByDomain.get(domain) ?? domain;
  }, [me?.universityDomain, universityNameByDomain]);

  // Gösterilen kampüs: Plus seçimi varsa o, yoksa kullanıcının KENDİ kampüsü
  // (/api/feed/me yalnız domain veriyor, adı listeden çözüyoruz).
  //
  // ⚠️ MEMO'NUN DIŞINDA: pill satırı DA harita şeridi DE aynı kampüsü
  // gösteriyor. İkisi ayrı ayrı türetirse biri güncellenip öbürü kalabilir ve
  // şeritteki ad pill'dekinden farklı okunur.
  const campusDomain = listParams.university ?? me?.universityDomain ?? null;
  // Ad çözülemediyse (liste henüz gelmedi ya da domain listede yok) domain'in
  // kendisi, o da yoksa "Kendi kampüsüm". Boş etiket çizmektense ham domain.
  const campusLabel = campusDomain
    ? (universityNameByDomain.get(campusDomain) ?? campusDomain)
    : t("feed.university.own");
  // Sunucudan gelen üniversite kaydı — harita koordinatı varsa oradan
  // (bkz. universityGeo > resolveUniversityCoordinate).
  /**
   * HARİTA ŞERİDİNİN üniversite kaydı — yukarıdaki (distinct OLMAYAN) listeden.
   *
   * ⚠️ `distinct=true` BU İŞ İÇİN YANLIŞ, ayrı bir sorgu açmak da gereksiz.
   * Bir tur öyle yazıldı ve haritayı bazı kullanıcılarda tamamen yok etti:
   * `distinct` çoklu domain'li üniversiteleri tek kanonik kayda indiriyor ve
   * ALIAS domainleri listeden DÜŞÜRÜYOR (`bau.edu.tr`, `bogazici.edu.tr`
   * distinct listede YOK — ne `domain` ne `canonicalDomain` olarak). Domain'i
   * alias olan bir kullanıcı hiçbir kayda eşleşmiyor, koordinat çıkmıyor, şerit
   * de sessizce çizilmiyordu.
   *
   * Non-distinct liste zaten HER kayıt için `lat`/`lon` taşıyor (207/207) ve
   * alias'ları da içeriyor, yani doğru kaynak o. `distinct` yalnız ÇOKLU PIN
   * için (tam ekran harita) gerekli — orada aynı kampüse iki pin düşmesin diye.
   */
  const selectedUniversityOption = useMemo(() => {
    if (!campusDomain) return null;
    return (universities ?? []).find((u) => u.domain === campusDomain) ?? null;
  }, [campusDomain, universities]);

  /**
   * 🔴 HARİTANIN SINIRI — GÖSTERİLEN kampüsün, kullanıcının kendisinin DEĞİL.
   *
   * ── Neden ayrı bir sorgu ────────────────────────────────────────────────────
   * `useCampusSurface` sınırı HER ZAMAN kullanıcının KENDİ kampüsü için çekiyor
   * ve çekmek zorunda: konum kapısı ("kampüste miyim") başka bir kampüsün
   * poligonuyla çalışamaz. Harita şeridi ise SEÇİLİ kampüsü gösteriyor.
   *
   * O sınır haritaya verildiğinde görünür bir hata doğuyordu: KADRAJIN TAMAMI
   * (Mapbox görüntüsünün merkezi ve zoom'u) poligon varken sınırdan türüyor
   * (bkz. FeedMapStrip > framing), yani kampüs filtresinden başka bir okul
   * seçildiğinde harita HİÇ KIPIRDAMIYORDU — koordinat değişiyor ama poligon
   * dalı onu eziyordu. Poligonu gösterilen kampüsle BİRLİKTE çekmek hatayı
   * yapısal olarak imkânsız kılıyor: ikisi de aynı `campusDomain`den türüyor.
   *
   * ⚠️ Sorgu DOMAIN BAŞINA anahtarlı ve disk önbellekli (`campusKeys.boundary`,
   * 6 saat tazelik). Gösterilen kampüs kullanıcının kendisiyse ANAHTAR DA AYNI,
   * yani `useCampusSurface`in sorgusuyla tek istek paylaşılıyor — mükerrer
   * çağrı yok.
   *
   * ⚠️ Yüzeyin kapısı DEĞİL: bu sınır yalnız ÇİZİM için. Paylaşım/konum kararı
   * `campus.boundary`den (kendi kampüsü) okunuyor ve bu dosyada hiç
   * karıştırılmamalı — başka bir kampüsün poligonu kullanıcıyı orada "kampüste"
   * sayardı.
   *
   * Sunucu bu ucu başka bir kampüsün domain'i için reddederse sorgu sessizce
   * boş kalıyor ve şerit koordinat kadrajına + dioramaya düşüyor: poligonu
   * olmayan 25 kampüsteki yolun aynısı.
   */
  const mapBoundaryQuery = useCampusBoundary(campusDomain);

  const filterPills = useMemo(() => {
    return [
      {
        key: "campus",
        // Kilit işareti KALDIRILDI. Etiketin başındaki 🔒 kampüsün adını bir
        // emojiyle açıyor ve satırın tek renkli glif dilinden (chevron) ayrı
        // duruyordu. Kapının kendisi de artık pill'de değil SHEET'İN İÇİNDE:
        // free kullanıcıya da seçici açılıyor, kilit satır bazında çiziliyor
        // (bkz. handleUniversityPill ve FeedUniversitySheet).
        label: campusLabel,
        // Üniversite adları uzun ("Orta Doğu Teknik Üniversitesi"): kapsül
        // sınırlanmazsa tek başına ekranı aşıyor ve yanındaki iki pill
        // sürüklenmeden hiç görünmüyordu. 200'de ~2 kelime sığıyor, gerisi
        // kırpılıyor; tam adı kampüs sheet'i gösteriyor.
        maxLabelWidth: 200,
        // DOLU çizilsin: bu pill bir seçenek değil, sayfanın hangi akışa
        // baktığını söyleyen durum bilgisi. Zemin `inverseSurface` (açık modda
        // siyah, koyuda beyaz), yazı `onInverseSurface` — yani tam tersi.
        filled: true,
      },
      { key: "sort", label: t(`feed.sort.${listParams.sort}`) },
      {
        key: "topic",
        /**
         * Seçili konuların ADI pill'de yazıyor (kampüs pill'inin aynı deseni):
         * "Filtre (1)" demek kullanıcıya HANGİ konuyu seçtiğini söylemiyordu.
         *
         * ÇOKLU SEÇİMDE İLK ETİKET + KALAN SAYISI ("#etkinlik +2"), hepsini
         * virgülle dizmek DEĞİL: pill 160'a sınırlı ve üç etiket oraya
         * sığmayıp "..." ile kesilirdi — kullanıcı ne seçtiğini de, kaç tane
         * seçtiğini de göremezdi. Tam liste bir dokunuş ötede (sheet).
         */
        label:
          listParams.topics.length === 0
            ? topicAllLabel()
            : listParams.topics.length === 1
              ? topicLabelFor(listParams.topics[0])
              : `${topicLabelFor(listParams.topics[0])} +${listParams.topics.length - 1}`,
        // Konu seçiliyken pill DOLU çizilsin: bu bir seçenek değil, sayfanın
        // hangi konulara kısıtlandığını söyleyen bir durum (kampüs pill'i gibi).
        filled: listParams.topics.length > 0,
        maxLabelWidth: 160,
      },
      {
        key: "filter",
        label: t("feed.filter.title"),
        // Varsayılandan sapan filtre sayısı; 0 ise pill sayı çizmiyor.
        // ⚠️ Konu da bu sayıya giriyor (bkz. activeFilterCount) ve AYRICA
        // kendi pill'inde yazıyor — ikisi aynı bilgiyi iki farklı amaçla
        // söylüyor: pill "hangi konu", rozet "kaç filtre varsayılandan sapmış".
        count: activeFilterCount(listParams),
      },
    ];
    // `universityGate` ARTIK BAĞIMLILIK DEĞİL: kilit rozeti kalkınca memo
    // kapının durumunu hiç okumuyor, listede tutmak kapı değiştiğinde üç
    // pill'i boşuna yeniden kurardı.
    //
    // `topicLabelFor` BAĞIMLILIK: `me`yi kapatıyor, yani sunucunun konu
    // etiketleri (ya da dil) tazelenince pill'in yazısı da tazelenmeli —
    // listede olmadığı sürece ilk render'ın etiketinde asılı kalıyordu.
  }, [listParams, t, campusLabel, topicLabelFor]);

  const handlePillPress = useCallback(
    (key: string) => {
      if (key === "campus") handleUniversityPill();
      // Sıralama da filtre sheet'inde — ayrı bir sheet açmak tek satırlık bir
      // seçim için fazla; pill yalnız mevcut değeri gösteren bir kısayol.
      else setFilterVisible(true);
    },
    [handleUniversityPill],
  );

  // ── İskelet gecikme penceresi ─────────────────────────────────────────────
  // Çok hızlı dönen bir istekte iskeleti hiç göstermemek için: ilk 220ms'de
  // `null` çiziliyor (bkz. FeedListPage > loading).
  const [skeletonReady, setSkeletonReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSkeletonReady(true), SKELETON_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  /**
   * UT-7301 terminal boş durumu.
   *
   * Bayrak kapalıyken her uç 403 dönüyor. Bu durumda "İlk gönderiyi sen at"
   * göstermek kullanıcıya yapamayacağı bir şey teklif etmek olurdu; üstelik
   * retry gürültüsü de anlamsız (sunucu fikrini saniyeler içinde değiştirmez).
   * Normalde sekme zaten çizilmiyor — bu ekran yalnız bayrak OTURUM ORTASINDA
   * kapandığında ya da dev kancasıyla görünür.
   */
  const disabledError = useMemo(() => {
    const codes = [postsQuery.error, minePostsQuery.error, meQuery.error].map(
      feedErrorCode,
    );
    return codes.includes(FEED_CODES.DISABLED);
  }, [postsQuery.error, minePostsQuery.error, meQuery.error]);

  // `surface` parametreli, çünkü aynı boş durum iki sayfada da çizilebiliyor
  // ve panel YALNIZ akış sayfasına ait (bkz. FeedEmptyWrap > surface).
  const disabledEmpty = (surface: boolean) => (
    <FeedEmptyWrap surface={surface}>
      <EmptyState
        sf="clock"
        Icon={LayoutList}
        text={t("feed.disabled.title")}
        subtitle={t("feed.disabled.body")}
        // Sarmalayıcı dikeyde ortalıyor; EmptyState'in varsayılan 24'lük
        // üst payı bloğu aşağı kaydırıyordu. Mesajlar da 0 geçiyor.
        topOffset={0}
      />
    </FeedEmptyWrap>
  );

  // Sayfa başlığı — şeridin etiketiyle AYNI sözlük anahtarı. Ayrı bir
  // "headerFeed/headerMine" ailesi açılmadı: üç sayfanın şerit etiketi ile
  // büyük başlığı birebir aynı kelime, iki kaynak olsa biri güncellenmeden
  // kalırdı.
  const sectionTitleFor = useCallback(
    (key: FeedPageKey) =>
      key === "mine" ? t("feed.tabMine") : t("feed.tabFeed"),
    [t],
  );

  // Başlığın altındaki tek satır — Mesajlar'daki `tabDescriptionFor` ile aynı
  // görev: sayfanın ne listelediğini bir cümlede söylemek.
  const sectionDescriptionFor = useCallback(
    (key: FeedPageKey) =>
      key === "mine" ? t("feed.header.descMine") : t("feed.header.descFeed"),
    [t],
  );

  // Başlığın SAĞINDAKİ pill — tek görevi Plus sayfasını açmak. Sekmeye göre
  // DEĞİŞMİYOR: üç sayfada da aynı günlük hak geçerli.
  // ⚠️ `resolved` kapısı ŞART (Mesajlar'daki aynı gerekçe): abonelik slice'ı
  // persist edilmediği için reload'da premium kullanıcı da bir an
  // `isPremium:false` doğuyor ve o pencerede pill çizilip hemen kaybolurdu —
  // premium'a premium satmak en pahalı yanılma yönü.
  const showPlusUpsell = premiumResolved && !isPremium;

  /**
   * Haritanın ÜSTÜNDE yüzen chrome'un ölçülen yüksekliği (başlık + açıklama +
   * pill satırı). Katman listenin DIŞINDA olduğu için perdesinin ve pin
   * bandının nerede bitmesi gerektiğini kendi bilemiyor; chrome'un `onLayout`u
   * söylüyor.
   *
   * ⚠️ Sabit bir sayı yazmak kırılgan olurdu: blok iki satır metin taşıyor ve
   * yükseklik dile, dinamik punto ayarına ve Plus pill'inin varlığına göre
   * değişiyor. Ölçüm bir kez gelip oturuyor.
   */
  const [chromeHeight, setChromeHeight] = useState(0);

  /**
   * TAM EKRAN HARİTA HÂLİ. Pill'lerin altındaki açık harita bandına dokununca
   * açılıyor: gönderiler AŞAĞI, chrome (başlık + pill'ler) ve sekme şeridi
   * YUKARI kayıp ekrandan çıkıyor; geriye harita ve sol üstteki cam X kalıyor.
   *
   * ÜÇ ayrı durum tutuluyor, bilerek:
   *   • `mapProgress` — animasyonu süren paylaşılan değer (UI thread).
   *   • `mapExpanded` — MANTIKSAL durum. Açılışta ve kapanışta ANINDA dönüyor;
   *     pager kilidi, kampüs sorguları ve ÜST KÖŞE BUTONLARININ SEMBOLÜ bunu
   *     okuyor.
   *   • `mapChromeMounted` — kapanışta GECİKEN mount kapısı; perdeler ve anlar
   *     şeridi için (ikisi de kapanış animasyonu boyunca ekranda kalmalı).
   *
   * ⚠️ CAM BUTONLAR ARTIK BU KAPILARDAN GEÇMİYOR. Eskiden akışın
   * filtre/kalem butonları harita açılırken SÖKÜLÜYOR, haritanın X'i ile
   * paylaş butonu ise açılış bittikten sonra SIFIRDAN mount ediliyordu —
   * kullanıcının gördüğü şey köşelerin bir anlık boşalıp yeniden çizilmesiydi
   * (istek: "butonlar değişsin, yok olup baştan çizilmesin"). İki uçta artık
   * TEK VE SÜREKLİ bir satır var; değişen yalnız sembol ve aksiyon (bkz.
   * "ÜST KÖŞE BUTONLARI" bloğu).
   *
   * Camın kuralı sert ve bu tasarımın sebebi o: ata zincirinde kimliksel
   * olmayan bir transform ya da opacity<1 gören cam SESSİZCE hiç render
   * edilmiyor (bkz. proje notu). Yani butonlar ne söndürülebilir ne
   * ötelenebilir — kalıcı satır transformsuz bir kapta duruyor ve devri native
   * tarafta, sembolün kendi çapraz sönümüyle yapıyor.
   *
   * ⚠️ MANTIKSAL DURUM NEDEN GECİKEN KAPIDAN AYRILDI (yaşanan hata):
   * ikisi tek state'ti ve kapanışta yalnız `finished` iken `false` oluyordu.
   * Reanimated bir animasyon ÜZERİNE YAZILDIĞINDA eski animasyonun callback'ini
   * `finished: false` ile çağırıyor — yani kapanış kesilirse (X'e iki kez
   * basmak, kapanırken banda dokunmak) bayrak `true` KİLİTLENİYORDU. Sonuç:
   * harita kapalı ama modal ekranda, pager kaydırması kilitli ve FAB yok.
   * Kullanıcının "bazen basınca map expanded olmuyor ama modal geliyor"
   * tarifi bu hâlin kendisi. Mantıksal durum artık animasyona hiç bakmıyor;
   * yalnız cam butonların unmount'u animasyona bağlı ve o da gecikirse
   * yalnızca bir butonun 280ms fazla durmasına yol açıyor.
   */
  // ⚠️ `width` ARTIK OKUNMUYOR: tek müşterisi bandın sağ yarısıydı (anların
  // satırının genişliği ve poligonun sütunu) ve bant kaldırıldı.
  const { height: windowHeight } = useWindowDimensions();
  /**
   * Listenin üst payı — JS tarafında BİR KEZ sayıya indiriliyor.
   *
   * ⚠️ `feedListTopPadding(insets.top)` AŞAĞIDAKİ `useAnimatedStyle`LERİN
   * İÇİNDE ÇAĞRILAMAZ: o gövdeler UI thread'de worklet olarak koşuyor ve düz
   * bir JS fonksiyonunu senkron çağırmak fatal hata veriyor ("Tried to
   * synchronously call a non-worklet function"). Worklet'ler sayıları closure
   * ile yakalıyor, fonksiyonları yakalamıyor — o yüzden hesap burada.
   */
  const listTopPadding = feedListTopPadding(insets.top);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapChromeMounted, setMapChromeMounted] = useState(false);
  const mapProgress = useSharedValue(0);

  /**
   * Kapanış kuşağı — gecikmiş bir callback'in yeni açılışı bozmasını engelliyor.
   *
   * Kapanış tamamlandığında `setMapChromeMounted(false)` JS thread'ine
   * KUYRUĞA giriyor. Kullanıcı o arada banda tekrar dokunursa (kapanış
   * biterken bant zaten görünür oluyor) açılış çalışıyor, ardından bayat
   * callback düşüp cam butonları söküyordu — harita açık, X yok, yani
   * kapatılamayan bir ekran. Kuşak numarası bayat callback'i sessizce yutuyor.
   */
  const mapGenRef = useRef(0);

  /**
   * POLİGONUN ÇİZİLME ORANI — 0 hiç çizilmemiş, 1 tam çizili.
   *
   * ⚠️ AKIŞTA SIFIR KALIYOR: bant kaldırıldı ve poligon akışta HİÇ çizilmiyor
   * (istek: "çizilmesin ama o moments kısmına geçince çizgi animasyonla
   * yavaşça çizilsin"). Değer yalnız tam ekrana geçişte 1'e gidiyor.
   *
   * ⚠️ ÇİZİM HARİTANIN HAREKETİNDEN SONRA başlıyor (gecikme `expandMap`te):
   * kadraj kayarken başlayan bir çizim "kayan bir çizgi" gibi okunuyordu.
   *
   * ⚠️ KAPANIŞTA GERİ SİLİNMİYOR, ANINDA SIFIRLANIYOR: akış zaten şekli
   * çizmiyor, yani kapanırken ekranda kalan son şeyin bir çizgi parçası
   * olmaması gerekiyor.
   */
  const polygonReveal = useSharedValue(0);

  /**
   * ⚠️ `mapActionsReady` KALDIRILDI — şeridin kartlarındaki cam tik/X satırı
   * kaldırıldığı için (gerekçe CampusMomentCard'ın başında) kapının müşterisi
   * kalmadı. Şeride cam bir yüzey geri eklenecekse kapı da geri gelmeli ve
   * kuralı şuydu: ata zincirinde kimliksel olmayan bir transform gören cam
   * SESSİZCE hiç render edilmiyor, sonradan da düzelmiyor (proje notu); şerit
   * aşağıdan `translateY` ile geldiği için cam ancak ŞERİDİN girişi de
   * bittiğinde (`MAP_MOTION_MS + MAP_STRIP_ENTRY_MS`) mount edilebiliyordu.
   * Bayrak bir ZAMANLAYICIYLA kuruluyordu, `withTiming` callback'iyle değil:
   * üzerine yazılan animasyon eskisinin callback'ini `finished:false` ile
   * çağırıyor ve banda iki kez dokunmak bayrağı kalıcı olarak false bırakırdı.
   */

  /**
   * ⚠️ `mapChromeReady` KALDIRILDI — tek müşterisi üst chrome satırının mount
   * kapısıydı (cam X + paylaş butonu, açılış animasyonu BİTTİKTEN SONRA mount
   * ediliyorlardı ki `Host` kurulumu geçişin karesine düşüp parmağın altında
   * takılma yapmasın). Satır artık hiç sökülmüyor: akışın filtre/kalem
   * butonlarının TA KENDİSİ sembolünü değiştiriyor, yani geçişte kurulacak
   * yeni bir `Host` yok ve beklenecek bir şey de yok.
   */

  /**
   * ŞERİDİN KENDİ GİRİŞİ — 0 ekranın altında, 1 yerinde.
   *
   * ⚠️ `mapProgress`TEN AYRI BİR DEĞER (istek): kutular çekmeye de, haritanın
   * hareketine de bağlı değil. Harita tam ekrana oturduktan SONRA kendi
   * eğrisiyle aşağıdan geliyorlar. Kapanışta ise haritayla birlikte iniyorlar
   * (gerekçe `MAP_STRIP_ENTRY_MS`te).
   */
  const mapStripEntry = useSharedValue(0);

  /**
   * TAM EKRAN CHROME'UNUN OPAKLIĞI — perdeler + başlık + Plus pill'i.
   *
   * ⚠️ `mapProgress` DEĞİL (istek): haritayla aynı 280ms'de belirdiklerinde
   * ekranın iki ucu "bir anda" karanlıklaşıyor gibi okunuyordu. Kendi süresiyle
   * (MAP_CHROME_FADE_MS) ve haritanın hareketi BİTTİKTEN SONRA açılıyorlar.
   *
   * ⚠️ CAM X BU DEĞERİ OKUMUYOR ve okuyamaz: ata zincirinde opacity<1 gören
   * SwiftUI camı sessizce hiç çizilmiyor (proje notu). Buton sönümün BAŞLADIĞI
   * anda mount, kapanış BİTİNCE unmount ediliyor — yani aynı pencerede
   * beliriyor/gidiyor ama kendisi sönmüyor. Camın sönebilmesi için malzemeyi
   * `BlurView` fallback'ine çevirmek gerekir, o ayrı bir karar.
   */
  const mapChromeFade = useSharedValue(0);

  const mapTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearMapActionsTimer = useCallback(() => {
    for (const id of mapTimersRef.current) clearTimeout(id);
    mapTimersRef.current = [];
  }, []);
  useEffect(() => clearMapActionsTimer, [clearMapActionsTimer]);

  const expandMap = useCallback(() => {
    mapGenRef.current += 1;
    setMapExpanded(true);
    setMapChromeMounted(true);
    clearMapActionsTimer();
    // Şerit haritayla BİRLİKTE iniyor: kendi süresiyle inse harita kapandıktan
    // sonra ekranın dibinde asılı kalırdı.
    mapStripEntry.value = withTiming(0, {
      duration: MAP_MOTION_MS,
      easing: mapMotionEasing,
    });
    // Chrome da haritayla birlikte sönüyor: kendi süresiyle sönse akış geri
    // geldikten sonra ekranın üstünde asılı kalan bir başlık görünürdü.
    mapChromeFade.value = withTiming(0, {
      duration: MAP_MOTION_MS,
      easing: mapMotionEasing,
    });
    // Şerit ekranın ALTINDA bekliyor; girişi haritanın hareketi bitince
    // başlıyor (gerekçe `mapStripEntry`de).
    mapStripEntry.value = 0;
    mapChromeFade.value = 0;
    mapTimersRef.current = [
      setTimeout(() => {
        // Perdeler, başlık ve pill YAVAŞÇA beliriyor (gerekçe
        // `mapChromeFade`de); kutular da aynı anda aşağıdan yola çıkıyor.
        mapChromeFade.value = withTiming(1, {
          duration: MAP_CHROME_FADE_MS,
          easing: mapMotionEasing,
        });
        mapStripEntry.value = withTiming(1, {
          duration: MAP_STRIP_ENTRY_MS,
          easing: mapMotionEasing,
        });
        /**
         * SINIR KENDİNİ ÇİZİYOR — kadraj oturduktan SONRA (istek).
         *
         * ⚠️ AYNI ZAMANLAYICININ İÇİNDE, ayrı bir `setTimeout` DEĞİL: kapanış
         * bekleyen zamanlayıcıların hepsini iptal ediyor (`clearMapActionsTimer`)
         * ve ayrı bir kuyruk, açılışın ortasında kapatılan haritada çizimi
         * başlatmaya devam ederdi.
         *
         * ⚠️ `Easing.out` DEĞİL `mapMotionEasing` (inOut): çizginin ucu iki uçta
         * da yumuşak hızlanıp yavaşlıyor, yani "fırlayıp oturan" değil kenarı
         * TAKİP EDEN bir uç okunuyor.
         */
        polygonReveal.value = withTiming(1, {
          duration: MAP_POLYGON_DRAW_MS,
          easing: mapMotionEasing,
        });
      }, MAP_MOTION_MS),
    ];
    // ⚠️ Süre ve eğri `feedMapMotion`dan — AÇILIŞ VE KAPANIŞ AYNI (gerekçe
    // orada: ayrı eğriyle açılış "fırlıyor" gibi okunuyordu). Anlar şeridi bu
    // DEĞERİN KENDİSİNİ okuyor (ayrı bir animasyon değil), eşzamanlılık yapısal.
    mapProgress.value = withTiming(1, {
      duration: MAP_MOTION_MS,
      easing: mapMotionEasing,
    });
  }, [
    clearMapActionsTimer,
    mapChromeFade,
    mapProgress,
    mapStripEntry,
    polygonReveal,
  ]);

  // Abonelik `expandMap`i doğrudan göremiyor (daha yukarıda kuruluyor) → köprü.
  useEffect(() => {
    expandMapRef.current = expandMap;
    return () => {
      expandMapRef.current = null;
    };
  }, [expandMap]);

  /**
   * Perdelerin ve şeridin unmount'u — yalnız kendi kuşağı hâlâ geçerliyse.
   * `runOnJS` için ayrı bir fonksiyon: worklet içinden ref okunmuyor.
   */
  const finishMapCollapse = useCallback((gen: number) => {
    if (gen !== mapGenRef.current) return;
    setMapChromeMounted(false);
  }, []);

  const collapseMap = useCallback(() => {
    const gen = (mapGenRef.current += 1);
    // ⚠️ MANTIKSAL DURUM ANINDA DÜŞÜYOR, animasyonun bitmesini BEKLEMİYOR:
    // anlar şeridi, pager kilidi ve FAB buna bağlı ve kesilen bir animasyon
    // onları açık/kilitli bırakıyordu (gerekçe yukarıda).
    setMapExpanded(false);
    // Bekleyen chrome zamanlayıcısı iptal: kapanış açılışın ortasında gelirse
    // (banda dokunup hemen X) chrome kapanmış haritanın üstünde beliriyordu.
    clearMapActionsTimer();
    // Şerit haritayla BİRLİKTE iniyor: kendi süresiyle inse harita kapandıktan
    // sonra ekranın dibinde asılı kalırdı.
    mapStripEntry.value = withTiming(0, {
      duration: MAP_MOTION_MS,
      easing: mapMotionEasing,
    });
    // Chrome da haritayla birlikte sönüyor: kendi süresiyle sönse akış geri
    // geldikten sonra ekranın üstünde asılı kalan bir başlık görünürdü.
    mapChromeFade.value = withTiming(0, {
      duration: MAP_MOTION_MS,
      easing: mapMotionEasing,
    });
    // Sınır ANINDA sıfırlanıyor (gerekçe `polygonReveal`de): akış şekli
    // çizmiyor, kapanışta geri silinen bir çizgi görünmemeli.
    polygonReveal.value = 0;
    mapProgress.value = withTiming(
      0,
      { duration: MAP_MOTION_MS, easing: mapMotionEasing },
      (finished) => {
        // Cam butonlar yalnız animasyon TAMAMLANINCA kalkıyor: erken unmount
        // edilse buton harita küçülürken ortada kaybolurdu.
        if (finished) runOnJS(finishMapCollapse)(gen);
      },
    );
  }, [
    clearMapActionsTimer,
    finishMapCollapse,
    mapChromeFade,
    mapProgress,
    mapStripEntry,
    polygonReveal,
  ]);

  /**
   * LİSTENİN ÖTELEMESİ — gönderiler tam ekran haritada AŞAĞI kayıyor.
   *
   * ⚠️ ÇEKMENİN TELAFİSİ KALDIRILDI. Burada uzun bir "eksik pay" hesabı vardı
   * (`max(donmuş − canlı, 0)`): eşik geçildiği an `scrollEnabled` kapanıyor,
   * iOS süren sürüklemeyi iptal ediyor ve lastiğin nasıl toplandığı garanti
   * olmadığı için gönderiler ya zıplıyor ya iki kat aşağı düşüyordu. Çekme
   * jesti üründen çıkınca (istek) o yarışın tamamı da gitti — açılış artık
   * yalnız BUTONDAN (anlar destesi) geliyor ve o anda liste 0'da duruyor.
   *
   * ⚠️ TÜRETİLMİŞ DEĞER OLARAK, doğrudan stilin içinde DEĞİL: chrome bu ağacın
   * ÇOCUĞU ve ötelemenin TAMAMINI geri almak zorunda (bkz. chromeSlideStyle).
   */
  const listOffsetPx = useDerivedValue(
    () => mapProgress.value * windowHeight,
  );

  /**
   * ÜST BLOĞUN ÇIKIŞI — başlık + pill satırı ve sekme şeridi AYNI sayıyı
   * okuyor.
   *
   * ⚠️ ÇEKMENİN FAZI KALDIRILDI: değer iki fazlıydı (parmak çekerken
   * `pullLiftPx`e kadar, eşik geçilince tam kalkışa kadar) ve iki fazın tek
   * sayıda toplanması geçişte hız sıçramasını önlemek içindi. Çekme gidince tek
   * faz kaldı.
   *
   * ⚠️ İKİ TÜKETİCİ, TEK SAYI: chrome ve sekme şeridi. Şerit onu KENDİ çıkışına
   * kırpıyor — gerekçe `headerSlideStyle`da.
   */
  const exitPx = useDerivedValue(
    () => mapProgress.value * (listTopPadding + chromeHeight),
  );

  /**
   * Gönderiler AŞAĞI kayıyor. Ekran boyu kadar ötelemek listeyi tamamen
   * görünmez kılıyor; opaklık KULLANILMIYOR çünkü chrome da bu ağacın içinde
   * ve iki kez sönerdi.
   */
  const listSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: listOffsetPx.value }],
  }));

  /**
   * Chrome'un (başlık + pill satırı) tam ekran haritada ÇIKIŞI.
   *
   * ⚠️🔴 YAPIŞMA KALDIRILDI. Blok eskiden ilk 120pt boyunca (bandın boyu)
   * scroll'un tam tersi kadar ötelenerek YERİNDE duruyordu: pill'lerin altında
   * haritanın açıkta kaldığı bir bant vardı ve chrome o bant tükenene kadar
   * ekranda kalıyordu. Bant kaldırıldı (istek: "direkt pill'lerin altında
   * postlar olsun"), yani yapışacak bir şey yok — chrome artık listenin sıradan
   * bir başlığı ve içerikle birlikte kayıyor. `feedScrollY`yi okuyan terim
   * tamamen gitti; onunla birlikte "aşağı çekerken chrome yerinde dursun"
   * davranışı da (çekme jesti üründen çıktı, aşağı çekmek artık yeniliyor).
   *
   * ⚠️ LİSTENİN ÖTELEMESİNİN TAMAMI İPTAL EDİLİYOR (`- listOffsetPx`): chrome
   * listenin ÇOCUĞU, yani iki transform üst üste biniyor. Net konum =
   * liste(+L) + chrome(−L − çıkış) = −çıkış.
   *
   * ⚠️🔴 ÇEKME TERİMİ DENENDİ VE GERİ ALINDI — `Math.min(feedScrollY, 0)`.
   *
   * İstek "pull to refresh için piller ve üstü sabit kalsın"dı ve hesap
   * doğruydu: lastik aşağı esnerken `contentOffset` negatif oluyor, içeriğin
   * tamamı (chrome dahil — o listenin BAŞLIĞI) o kadar aşağı çiziliyor, aynı
   * sayı kadar yukarı ötelemek onu birebir iptal ediyor.
   *
   * ⚠️ BEDELİ TİTREME OLDU ve yapısal: lastik NATİF olarak her karede
   * (ProMotion'da 120Hz) hareket ediyor, telafi ise SCROLL OLAYINDAN türüyor ve
   * akış listesi 16ms'de (≈60Hz) olay veriyor. Yani chrome içeriğin bir kare
   * gerisinden geliyor ve tam olarak şikâyet edilen yerde — başlık + açıklama +
   * pill satırında — titriyor.
   *
   * ⚠️ OLAY HIZINI 1'E ÇEKMEK ÇÖZÜM DEĞİL: o, başlığın alfayla sönen kademeli
   * blur'unu titretiyor (bkz. FeedListPage > scrollEventThrottle, aynı gün
   * yaşandı ve geri alındı). İki titreme arasında seçim yapmak gerekiyordu;
   * standart davranış (her şeyin lastikle birlikte inmesi) ikisini de üretmiyor.
   *
   * ⚠️ LİSTENİN ÖTELEMESİNİN TAMAMI İPTAL EDİLİYOR (`- listOffsetPx`): chrome
   * listenin ÇOCUĞU, yani iki transform üst üste biniyor. Net konum =
   * liste(+L) + chrome(−L − çıkış) = −çıkış.
   */
  const chromeSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -exitPx.value - listOffsetPx.value }],
  }));

  /**
   * Sekme şeridi de YUKARI kayıyor — X ile aynı köşeyi paylaşıyorlar (ikisi de
   * solda), üst üste binerlerdi. Opaklık yok: şerit progressive blur taşıyor
   * ve blur'u opaklıkla söndürmek titreme üretiyor.
   */
  /**
   * ⚠️ `mapChromeFadeStyle` KALDIRILDI — tek müşterisi üst başlıktı ve o artık
   * `mapTitleFadeStyle`i okuyor (gerekçe hemen aşağıda). `mapChromeFade`
   * paylaşılan DEĞERİ duruyor: perdeler onu doğrudan prop olarak alıyor.
   */

  /**
   * HARİTA BAŞLIĞININ ("Anlar") ÇAPRAZ SÖNÜMÜ — sekme şeridinin yerine geçiyor.
   *
   * ⚠️ `mapChromeFade` DEĞİL `mapProgress` (istek: "title da yok olup baştan
   * çizilmesin"). Perdeler haritanın hareketi BİTTİKTEN sonra kendi süresiyle
   * beliriyor (gerekçe `mapChromeFade`de, istek üzerine öyle) ve başlık onlara
   * bağlıyken sıra şöyle oluyordu: sekmeler yukarı kayıp gidiyor → üst şerit
   * bir süre BOŞ kalıyor → başlık sıfırdan beliriyor. Artık aynı hareketin
   * içinde: şerit çıkarken başlık giriyor, yani köşe hiç boşalmıyor.
   *
   * ⚠️ İKİNCİ YARIDA (0.45→1): şeridin kendi çıkışı `exitPx`e kırpılı, yani
   * hareketin ilk yarısında bitiyor. Başlık baştan açılsaydı iki yazı aynı
   * merkezde üst üste binerdi.
   */
  const mapTitleFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      mapProgress.value,
      [0.45, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const headerSlideStyle = useAnimatedStyle(() => {
    // Kalkış = listenin üst payı, yani şeridin kendi zemininin tamamı
    // (`backgroundHeight` birebir o sayı): orada şerit tam olarak ekranın
    // dışında.
    //
    // ⚠️ CHROME'UN SAYISINI OKUYOR (istek: "aynı oranda gitsinler beraber",
    // "aynı hızda yukarı doğru gitsin") — kendi mesafesinin oranı DEĞİL; uzun
    // gerekçe `exitPx`te. Şerit listenin DIŞINDA: chrome'daki iptal terimi
    // burada gerekmiyor.
    //
    // ⚠️ KENDİ ÇIKIŞINA KIRPILIYOR: chrome'un yolu daha uzun (üst pay + chrome
    // yüksekliği) ve kırpılmazsa şerit kendi hedefini AŞAR, sonra animasyon
    // devralınca geri iner — tek karelik bir geri tepme. Kırpma yüzünden şerit
    // chrome'dan ÖNCE duruyor, ama durduğu yer ekranın dışı: görünen tek şey
    // ikisinin aynı hızda birlikte çıkması.
    const exit = Math.min(exitPx.value, listTopPadding);
    return { transform: [{ translateY: -exit }] };
  });

  /**
   * KAMPÜS HARİTASI ZEMİNİ — EKRANIN TAMAMINI kaplıyor (istek: zeminin dibi de
   * harita). SABİT: listenin kardeşi ve ondan ÖNCE çiziliyor, yani gönderiler
   * kaydırılırken harita yerinde kalıyor ve kartlar üstünden akıyor (z-sırası
   * gerekçesi FeedMapStrip'in başında).
   *
   * `heroHeight` haritanın boyu DEĞİL: perdenin bittiği çizgi ve görüntünün
   * dikey kayması (kampüsü açık bandın ortasına getiren hesap). Üst pay +
   * chrome + bant.
   *
   * ⚠️ İKİ SEKMEDE DE, BİREBİR AYNI (istek). Bir dönem yalnız Akış'taydı ve
   * gerekçesi "Gönderilerim kampüs filtresi taşımıyor, harita da bir kampüs
   * göstergesi"ydi; o gerekçe haritayı sayfanın parçası sayıyordu, oysa o
   * ekranın ZEMİNİ. Kadraj Akış'ın chrome yüksekliğinden türümeye devam
   * ediyor (`heroHeight`) — Akış sayfası pager'da mount'lu kaldığı için
   * `chromeHeight` Gönderilerim'deyken de geçerli ve iki sekmede aynı
   * görüntüyü veren şey tam olarak bu.
   */
  /**
   * KAMPÜS ANLARI — tam ekran haritanın üstündeki yüzey.
   *
   * Mantığın tamamı `useCampusSurface`te: sorgular yalnız harita açıkken
   * koşuyor, konum kapısı orada, paylaşım/karar akışları orada. Ekran yalnız
   * bağlıyor — akış ekranı zaten 1800 satır ve iki özellik tek dosyada
   * birbirine karışmamalı.
   */
  const campus = useCampusSurface({
    enabled: mapExpanded,
    /**
     * ⚠️ KAPI SORGUSU ÖNCEDEN ISITILIYOR (yalnız `/campus/me`).
     *
     * Anlar sheet'inin `visible`i `campus.available`e bakıyor ve o cevap
     * sorguyla birlikte gelirken modal haritanın ARDINDAN açılıyordu —
     * kullanıcının gördüğü şey gönderiler/başlık çıktıktan bir süre sonra
     * aşağıdan gelen bir yüzeydi. Ekran mount'luyken bant her an dokunulabilir,
     * yani cevabın dokunuş anında elde olması gerekiyor (bkz. feedMapMotion).
     */
    prewarm: true,
    mode: selectedMode,
    domain: me?.universityDomain ?? null,
    // Kota dolunca GERÇEK paywall: bu hak Plus'la kalkıyor (akış kotasının
    // aksine). "Önce tazele sonra sat" sarmalayıcısı kullanılıyor ki premium'u
    // yeni almış kullanıcıya satın aldığı şey tekrar satılmasın.
    onPaywall: openPaywall,
  });

  /**
   * ── AN KARTINA DOKUNMAK → KART BÜYÜYOR (profil DEĞİL) ────────────────────
   *
   * ⚠️ PROFİL YOLU KAPANDI ve bu yalnız bir ürün kararı değil: ödünç alınan uç
   * (`/api/swipe/LikerProfile`) sert bir beğeni kapısı taşıyor, bizi beğenmemiş
   * biri için **404** dönüyor (backend teyidi). Kampüse özel uç
   * (`GET /api/campus/moments/{id}/profile`) istendi, yazılmadı. Yani kart bir
   * kapıydı ama arkasında oda yoktu.
   *
   * Yerine: kart şeritteki yerinden ekranın ortasına uçup büyüyor, sağındaki
   * cam tik beğeniyi gönderiyor (bkz. CampusMomentExpandOverlay).
   *
   * ⚠️ STATE YALNIZ KİMLİK + ÖLÇÜLEN KARE TUTUYOR, anın KOPYASINI değil:
   * gösterilen an her render canlı listeden çözülüyor (`resolveOpenMoment`),
   * böylece an süresi dolup listeden düştüğünde yüzey kendiliğinden kapanıyor
   * ve bayat veri gösterilmiyor (uzun gerekçe o fonksiyonda).
   *
   * ⚠️ `useCampusMomentProfile` ÇAĞRISI VE HATA TOAST'I KALDIRILDI — profil ucu
   * gelince ikisi de geri gelecek. Kanca duruyor.
   */
  const [momentTarget, setMomentTarget] = useState<{
    id: string;
    frame: ExpandRect | null;
  } | null>(null);

  const openMoment = useMemo(
    () => resolveOpenMoment(campus.moments, momentTarget?.id ?? null),
    [campus.moments, momentTarget?.id],
  );
  /** Kart küçülüyor — yüzey hâlâ ağaçta (bkz. overlay > `collapsing`). */
  const [momentCollapsing, setMomentCollapsing] = useState(false);
  /** Park eden alev dalgasının aboneliği — sökülürken salıveriliyor. */
  const momentSweepUnsub = useRef<(() => void) | null>(null);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * TİK — beğeni gider, ALEV oynar, kart ÖRTÜNÜN ALTINDA küçülür.
   * ══════════════════════════════════════════════════════════════════════════
   * Sıralamanın kendisi saf bir modülde ve testli (`likeWithFlameSweep`);
   * burada yalnız o sıralamanın ekrandaki karşılıkları bağlanıyor.
   *
   * ⚠️ ALEV KATMANI GLOBAL: `<FireFlame />` AppNavigator'da mount, `uiBus`
   * üzerinden konuşuyor — yani Keşif dışından tetiklenebiliyor ve BURAYA YENİ
   * BİR ALEV KATMANI KURULMUYOR.
   *
   * ⚠️ `hold: true` ŞART: dalga tam kapalıyken PARK EDİYOR ve bizi bekliyor.
   * Parksız bir süpürmede örtü kendi takvimiyle açılır, küçülen kart görünür —
   * Keşif'te aynı tuzağa düşülmüştü (giden kart görünüyordu).
   *
   * ⚠️ KÜÇÜLME BİTMEDEN `releaseFlameSweep` ÇAĞRILMAZ: salıverilen dalga örtüyü
   * açıyor. İkisi arasındaki tek bağ bu zamanlayıcı — `EXPAND_MS` overlay'in
   * kendi süresi, iki yerde ayrı yazılırsa örtü erken açılır.
   */
  const handleMomentLike = useCallback(() => {
    if (!openMoment) return;
    const moment = openMoment;
    likeWithFlameSweep({
      exhausted: campus.decisionsExhausted,
      like: () => campus.like(moment),
      /**
       * SUNUCU REDDETTİ (kota/ağ): kart KAPANMIYOR, yalnız dalga salıveriliyor.
       * Kullanıcı aynı kartla kalıyor ve paywall'ı `like` zaten açtı.
       */
      abort: () => {
        momentSweepUnsub.current = null;
        releaseFlameSweep();
      },
      startSweep: (onCovered) => {
        momentSweepUnsub.current?.();
        momentSweepUnsub.current = runFlameSweep(onCovered, { hold: true });
      },
      collapse: () => {
        setMomentCollapsing(true);
        setTimeout(() => {
          setMomentTarget(null);
          setMomentCollapsing(false);
          momentSweepUnsub.current = null;
          releaseFlameSweep();
        }, EXPAND_MS);
      },
    });
  }, [campus, openMoment]);

  /**
   * ⚠️ PARK EDEN DALGAYI SÖKÜLÜRKEN DE SALIVER: ekran kapanırsa (sekme
   * değişimi, logout) örtüyü açacak kimse kalmıyor ve kullanıcı alevle kaplı
   * bir ekranda kalıyordu.
   */
  useEffect(
    () => () => {
      momentSweepUnsub.current?.();
      momentSweepUnsub.current = null;
    },
    [],
  );

  const mapHero = (
    <FeedMapStrip
      // ⚠️ `campusDomain`in KENDİSİ — satır burada yeniden türetilmiyor. İki
      // yerde türetilirse biri güncellenip öbürü kalabilir ve şeritteki kampüs
      // pill'dekinden farklı okunur (aynı gerekçe campusDomain'in başında).
      domain={campusDomain}
      option={selectedUniversityOption}
      // Katman bunu yalnız KADRAJ için okuyor (tam ekranda kampüs noktası
      // ekranın ortasına geliyor); animasyonu süren yer burası.
      expandProgress={mapProgress}
      /**
       * Üstteki okunabilirlik bandı ÇEKMEYE BAĞLI da sönüyor (istek): chrome
       * parmakla yukarı çıkarken onu koruyan blur da birlikte açılıyor.
       */
      // Kontur YALNIZ tam ekrana geçince kenarı boyunca çiziliyor; akışta 0
      // (gerekçe `polygonReveal`de).
      polygonReveal={polygonReveal}
      /**
       * ⚠️ BANT TERİMİ KALKTI: pill'lerin altındaki açık harita bandı
       * kaldırıldı (istek), yani perdenin bittiği çizgi = chrome'un dibi.
       * `bandHeight` de 0 — perde artık banda sarkmıyor, pill satırının
       * hemen altında bitiyor.
       */
      heroHeight={chromeHeight > 0 ? listTopPadding + chromeHeight : 0}
      bandHeight={0}
      /**
       * Tam ekranda kampüs noktası EKRANIN ortasına değil, anlar ŞERİDİNİN
       * ÜSTÜNDE kalan alanın ortasına geliyor. Yükseklik şeridin kendi
       * hesabından okunuyor — iki yerde elle yazılsaydı biri değiştiğinde okul
       * şeridin arkasına kayardı.
       *
       * Yüzey kapalıysa şerit de yok → 0, yani eski davranış (ekran ortası).
       */
      expandedBottomInset={
        campus.available ? campusStripHeight(windowHeight, insets.bottom) : 0
      }
      /**
       * Sınır varsa harita izometrik diorama yerine GERÇEK POLİGONU çiziyor.
       * Poligonu olmayan kampüslerde (sunucuda hâlâ 25 tane) daireden türeyen
       * kaba bir parsel çiziliyor; diorama yalnız ikisi de yokken kalıyor.
       *
       * ⚠️ SINIR `campus.boundary`DEN DEĞİL `mapBoundaryQuery`DEN: ilki her
       * zaman kullanıcının KENDİ kampüsünün ve haritaya verildiğinde kadrajı
       * seçili kampüsten koparıyor (uzun gerekçe `mapBoundaryQuery`de).
       */
      boundary={mapBoundaryQuery.data ?? null}
      /**
       * "SINIR HENÜZ İNMEDİ" — `null`ın iki anlamını ayıran bayrak.
       *
       * Okul değiştirildiğinde sorgu anahtarı domain başına olduğu için yeni
       * kampüsün verisi gelene kadar `data` undefined kalıyor; şerit bunu
       * "poligonu yok" sanıp ara hâlleri çiziyordu (3B figür → ara kadraj →
       * poligon). Bayrak açıkken şerit iskelette bekliyor (gerekçe
       * FeedMapStrip > boundaryPending).
       *
       * ⚠️ `isPending` DEĞİL `isLoading`: ilki DEVRE DIŞI sorguda da `true`
       * (domain yok → `enabled: false`), yani kampüsü çözülmemiş kullanıcıda
       * iskelet süresiz kalırdı. `isLoading` = "fiilen çekiliyor ve veri yok".
       *
       * ⚠️ Arka plan tazelemesi (`isFetching`) KASITLI OLARAK DAHİL DEĞİL:
       * elimizde disk kopyası varken onu çizmek doğru, iskelete dönmek
       * kullanıcıya sebepsiz bir yükleme göstermek olurdu.
       */
      boundaryPending={mapBoundaryQuery.isLoading}
      /**
       * ⚠️ `asideCampus` VERİLMİYOR (varsayılan `false`) → KAMPÜS ORTADA.
       * Prop, bandın SAĞINDA kutular varken poligonu sol sütuna çeken şeydi;
       * bant kaldırılınca (istek) sütun diye bir şey kalmadı. Prop'un kendisi
       * duruyor: tam ekran yüzeyi ileride yana yerleşen bir düzen isterse
       * hesap yerinde.
       */
    />
  );

  /**
   * ANLARIN ÜÇLÜ DESTESİ — başlık satırının sağ ucunda.
   *
   * ⚠️ BANDIN SAĞ YARISINDAKİ SÜZÜLEN KARELERİN YERİNE GELDİ (istek). O satır
   * haritanın KARDEŞİYDİ (listenin arkasında, sabit); bu deste başlık bloğunun
   * İÇİNDE, yani listeyle birlikte kayıyor. Fark artık bir sorun değil: hizasını
   * koruması gereken bir poligon yok (akışta şekil hiç çizilmiyor).
   *
   * ⚠️ `campus.available` KAPISI DURUYOR: kampüsü çözülmemiş ya da yüzeyi
   * kapalı kullanıcıda deste HİÇ çizilmiyor — boş bir gri kare, olmayan bir
   * özelliği vaat ederdi.
   *
   * Dokununca tam ekran harita açılıyor: bandın butonu ve çekme jesti
   * kaldırıldığı için haritanın TEK girişi bu (istek).
   */
  const momentsPeek = campus.available ? (
    <FeedMomentsPeek
      moments={campus.moments}
      onPress={expandMap}
      accessibilityLabel={campusLabel ?? t("campus.title")}
      /**
       * Kenarda dolaşan çizginin rengi — SEÇİLİ MODUN Fire ailesi (istek:
       * "moda göre yeşil veya kırmızı-turuncu"). `modeAccent` DEĞİL
       * `modeFireGradient`: ilki düz bir ton (Flört'te #ff3d3d), istenen
       * kırmızı-TURUNCU ise bu gradyanın son durağı (#ff452a).
       */
      gradient={modeFireGradient(selectedMode)}
    />
  ) : null;

  const filterRow = (
    // Alt pay PILL_ROW_GAP: ham marjı değil, açıklamayla pill'ler arasındaki
    // GÖRÜNEN boşluğu eşliyor (açıklamanın satır yüksekliğinden kalan ölü
    // boşluk da o aralığın parçası — bkz. DESC_TRAILING_LEADING). Pill
    // satırının üstündeki ve altındaki boşluk böylece gözle eşit, satır iki
    // blok arasında kendi başına duruyor.
    <View style={{ marginBottom: PILL_ROW_GAP }}>
      <FilterPills
        tabs={filterPills}
        // Tek seçimli şerit DEĞİL: her pill kendi sheet'ini açıyor, o yüzden
        // "aktif" olan yok. Boş string hiçbir pill'i vurgulamıyor.
        activeTab=""
        onChange={handlePillPress}
        // `bleed` = listenin yan payı: satırın çerçevesi tam ekran genişliğinde
        // açılsın diye onu birebir geri alıyor.
        //
        // `inset` = duruş payı ve `bleed`in TAM KENDİSİ (16): Mesajlar
        // ekranının arama çubuğu da hücresinin `px-4`üne oturuyor, yani
        // kapsülün sol kenarı o çubukla aynı x'te. Daha önce 4 kadar solda
        // duruyordu (dolgusuz kenarlığın optik düzeltmesi) — o fark iki ekranı
        // yan yana koyduğunda hiza bozukluğu olarak okunuyordu.
        bleed={FEED_LIST_H_PADDING}
        inset={FEED_LIST_H_PADDING}
        // Üç pill de kendi sheet'ini açıyor, sekme değil → chevron.down.
        chevron
      />
    </View>
  );

  const renderPage = (key: FeedPageKey) => {
    const isActive = key === activeTab;
    const title = (
      <FeedSectionTitle
        title={sectionTitleFor(key)}
        description={sectionDescriptionFor(key)}
        actionLabel={showPlusUpsell ? t("feed.header.plusAction") : null}
        // `openLitPlus()` DEĞİL `openPaywall`: o önce hak sahipliğini
        // tazeliyor, yani premium'u yeni almış ama slice'ı bayat kalmış
        // kullanıcıya satın aldığı şeyi tekrar satmıyor.
        onActionPress={showPlusUpsell ? openPaywall : null}
        accent={accent}
        // Anların destesi YALNIZ AKIŞTA: Gönderilerim bir yönetim listesi,
        // kampüs anlarıyla ilgisi yok (aynı kapı harita zemininde de var).
        trailing={key === "mine" ? null : momentsPeek}
      />
    );

    // YANITLAR SAYFASI KALDIRILDI: yanıt kanalı üründen çıktı (iki modlu
    // yapı). Pager iki sayfaya indi (bkz. PAGES).

    const isMine = key === "mine";
    const query = isMine ? minePostsQuery : postsQuery;
    const data = isMine ? minePosts : posts;
    const loading = query.isLoading;

    return (
      <FeedListPage<FeedPostDto>
        data={data}
        isActive={isActive}
        // Akış sayfası KENDİ offset'ini de yazıyor (yapışan chrome ona bakıyor
        // — gerekçe feedScrollY'de); Gönderilerim ortak değeri yazmakla kalıyor.
        scrollHandler={isMine ? scrollHandler : feedScrollHandler}
        /**
         * ⚠️ HANDLER'IN YAZDIĞI DEĞERLE AYNI OLMAK ZORUNDA: çekme göstergesi
         * lastiğin negatif offset'ini okuyor ve sayfa kendi offset'ini hangi
         * değere yazıyorsa onu görmeli. Akış `feedScrollY`ye de yazıyor ama
         * paylaşılan `scrollY` ikisinde de taze (bkz. feedScrollHandler).
         */
        scrollY={scrollY}
        // Uçuş yalnız akışta (gerekçe prop'un tanımında).
        flight={isMine ? null : flight}
        loading={loading}
        showSkeleton={loading && skeletonReady}
        // İskelet de kartın `variant`ını almalı: Gönderilerim'in satırında
        // yanıt kapsülü yok (bkz. FeedSkeletonList).
        skeletonVariant={isMine ? "mine" : "feed"}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedPostCard
            post={item}
            variant={isMine ? "mine" : "feed"}
            ownPhotoUrl={ownPhotoUrl}
            onToggleLike={handleToggleLike}
            // Gönderiye not — buton yalnız sunucu `note.state = "Ok"` derken
            // çiziliyor (kapı kartın içinde, bkz. canNotePost). Gönderilerim
            // sayfasında da aynı kapı geçerli: kendi gönderinde sunucu
            // `OwnPost` döndürüyor.
            onNote={handlePostNote}
            onOpenChat={handleOpenChat}
            onPressAuthor={isMine ? undefined : handlePressAuthor}
            onMenu={handlePostMenu}
            // `onPressReplyCount` KALDIRILDI: Yanıtlar sayfası yok artık.
            statusLabel={isMine ? statusLabelFor(item, t) : null}
            statusTone={isMine ? statusToneFor(item) : "neutral"}
            // Beğenilmiş kalp de modun tonunda (gerekçe prop'un yanında).
            likedAccent={accent}
          />
        )}
        // Büyük başlık HER sayfada; filtre satırı YALNIZ akış sayfasında ve
        // ikisi de LİSTENİN İÇİNDE: pager'ın dışına alınsaydı filtre
        // Gönderilerim/Yanıtlar sayfalarında da durur ve onlarla ilgisi olmayan
        // bir filtreyi ima ederdi. Liste başlığı olduğu için ikisi de sayfayla
        // birlikte native olarak kayıyor.
        listHeader={
          isMine ? (
            // Gönderilerim'de harita YOK — orası kampüs filtresi taşımıyor ve
            // harita bir kampüs göstergesi. Ölçüm de gereksiz.
            <>{title}</>
          ) : (
            /**
             * Akışta başlık + açıklama + pill'ler haritanın ÜSTÜNDE yüzüyor.
             * Harita bu ağacın içinde DEĞİL (ekran seviyesinde, pager'ın
             * arkasında — bkz. mapHero); burada yalnız yüksekliği ölçülüyor.
             *
             * ⚠️ `backgroundColor` YOK ve olmamalı: zemin verilse haritanın
             * tam bu bölgesi kapanırdı, oysa amaç chrome'un haritanın üstünde
             * yüzmesi. Okunabilirliği haritanın kendi perdesi taşıyor.
             *
             * ⚠️ `zIndex` — blok artık YAPIŞIYOR (bkz. chromeSlideStyle) ve
             * liste başlığı kartlardan ÖNCE çizilen bir kardeş, yani varsayılan
             * sırada kartlar onun üstüne biniyor. Hesap gereği kart chrome'a
             * dayandığı anda yapışma bitiyor, ama scroll olayı ile transform'un
             * aynı kareye düşmediği durumda (hızlı fling, Android'in asenkron
             * olay kuyruğu) kart bir kare için pill'lerin üstüne taşabilir.
             * zIndex o karede chrome'u üstte tutuyor.
             */
            <>
              <Animated.View
                style={[{ zIndex: 2 }, chromeSlideStyle]}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  // Aynı değeri tekrar yazmak gereksiz render doğuruyor; liste
                  // başlığı her veri turunda yeniden ölçülüyor.
                  setChromeHeight((prev) =>
                    Math.abs(prev - h) < 0.5 ? prev : h,
                  );
                }}
              >
                {title}
                {filterRow}
              </Animated.View>
              {/* ⚠️🔴 PİLL'LERLE İLK GÖNDERİ ARASINDAKİ BANT KALDIRILDI
                  (istek: "piller ile postlar arasında kalan map poligon
                  kısmını kaldırıyoruz, direkt pill'lerin altında postlar
                  olsun"). Orada 120pt'lik, zemini olmayan bir `Pressable`
                  vardı: haritanın açıkta kaldığı tek yer VE tam ekranı açan
                  buton. İkisi de gitti — haritanın girişi artık başlığın
                  sağındaki anlar destesi (bkz. momentsPeek), harita zemini ise
                  yalnız kartların aralarından görünüyor.

                  ⚠️ `heroHeight` de bant terimini kaybetti (bkz. mapHero):
                  perde pill satırının hemen altında bitiyor. */}
            </>
          )
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }}
        /**
         * PULL-TO-REFRESH — İKİ SAYFADA DA (akışta GERİ GELDİ).
         *
         * ⚠️🔴 AKIŞTA BİR DÖNEM YOKTU: aynı jest tam ekran haritayı açıyordu
         * ("aşağı çekerken gönderiler iniyor, açılan boşluktan harita görünüyor")
         * ve çarkın orada belirmesi o okunuşu bozuyordu. O jest kaldırıldı
         * (istek) — haritanın girişi başlığın sağındaki anlar destesi oldu, yani
         * çekme boşa düştü ve bir akışın en beklenen jesti olarak geri verildi.
         *
         * Tazeliğin öteki üç yolu duruyor: sekmeye her dönüşte `visited`
         * sorgusu, push/SignalR köprüsü (FEED_DIRTY_EVENT) ve 30sn'lik tazelik
         * penceresi. Çark onların yerine değil, kullanıcının "şimdi bak"
         * demesinin yolu.
         *
         * ⚠️ `refetch()` DEĞİL ilk sayfaya dönüş: kullanıcının "yukarı çekme"den
         * anladığı şey listenin BAŞINA dönmesi; `refetch` yüklenmiş bütün
         * sayfaları tazeleyip kaydırma konumunu koruyor.
         */
        onRefresh={() => {
          query.refetch?.();
          meQuery.refetch?.();
        }}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        /**
         * ⚠️🔴 ÇARKIN YERİ VARSAYILANDA — "chrome'un dibi" denendi ve GERİ
         * ALINDI (`refreshOffset = listTopPadding + chromeHeight`, ~300px).
         *
         * İstek "altında postların üstünde sadece activity indicator"dı ama
         * native `UIRefreshControl`de o sayı ÇARKIN YERİ DEĞİL, EŞİĞİN DE
         * YERİ: kontrol o kadar aşağıya taşınınca tetiklemek için ~300px
         * çekmek gerekiyordu (şikâyet birebir: "çok fazla aşağı çekmem
         * gerekiyo").
         *
         * Varsayılan (bulanık şeridin dibi) hem normal bir çekme mesafesi
         * veriyor hem de çarkı doğru yere koyuyor: içerik lastikle birlikte
         * iniyor ve çark şeridin altında AÇILAN boşlukta beliriyor.
         *
         * ⚠️ Çarkı pill'lerin altına almanın tek yolu kendi göstergemizi
         * çizmek (mutlak konumlu bir `ActivityIndicator` + eşik reaksiyonu) ve
         * o da pill'lerin sabit kalmasını gerektiriyor — yukarıdaki titreme
         * notu tam olarak oranın duvarı.
         */
        empty={
          disabledError ? (
            disabledEmpty(!isMine)
          ) : (
            // Panel yalnız AKIŞ sayfasında (istek): Gönderilerim'de boş durum
            // çıplak kalıyor, kardeş sekmelerle aynı görünüşte.
            <FeedEmptyWrap surface={!isMine}>
              <EmptyState
                /**
                 * BEĞENİLER'İN BOŞ DURUMUYLA AYNI ÖLÇÜ (istek).
                 *
                 * ⚠️ `sf` GEÇİLMİYOR, iOS'ta da lucide çiziliyor — gerekçe
                 * LikesScreen.tsx:1847'de uzun uzun yazılı: SF sembolü kendi
                 * en-boy oranıyla gelip kutusu 100×100 OLMUYOR ve gövdesi
                 * "regular" ağırlıkta kalın kalıyor, yani ikon hem daha
                 * geniş/kısa hem daha ağır okunuyordu. Lucide 24 viewBox'ta
                 * olduğu için kutu tam 100×100 ve `iconStrokeWidth={1}`
                 * ekranda Beğeniler'in glifleriyle AYNI kalınlığa düşüyor.
                 */
                Icon={LayoutList}
                iconStrokeWidth={1}
                text={t(isMine ? "feed.mine.emptyTitle" : "feed.empty.title")}
                subtitle={t(isMine ? "feed.mine.emptyBody" : "feed.empty.body")}
                topOffset={0}
                /**
                 * ALTINDAKİ BUTON — Beğeniler'in "kaydırmaya başla" pill'inin
                 * akış karşılığı: aksiyon FAB'ın TA KENDİSİ (`openComposer`),
                 * ayrı bir yol açılmadı; kota/kısıt sıralamasının tek sahibi
                 * orası (bkz. openComposer > composeGate).
                 *
                 * ⚠️ KISITLIYKEN ÇİZİLMİYOR: FAB da o dalda gizleniyor
                 * (gate.kind !== "restricted"), çünkü kısıt bir hak değil ceza
                 * — basılmayacak bir CTA koymak kullanıcıya yapamayacağı şeyi
                 * teklif etmek olur. EmptyState butonu `buttonLabel` VE
                 * `onButtonPress` birlikte varken çiziyor, ikisi de null.
                 */
                buttonLabel={
                  gate.kind === "restricted" ? null : t("feed.empty.cta")
                }
                onButtonPress={
                  gate.kind === "restricted" ? null : openComposer
                }
                // Dolgu seçili MODUN rengi, mürekkep sabit siyah — Beğeniler'in
                // CTA'sıyla birebir aynı ikili (LikesScreen.tsx:1861).
                buttonLabelColor={colors.onMediaInverse}
                buttonColor={accent}
              />
            </FeedEmptyWrap>
          )
        }
      />
    );
  };

  /**
   * SOL KÖŞENİN AKIŞ AKSİYONU — pill'lerin açtığı sheet'in TA KENDİSİ.
   * Satır içinde `() => setFilterVisible(true)` yazılsaydı her render'da yeni
   * bir fonksiyon doğar ve `memo`lu cam buton boşuna yeniden çizilirdi.
   */
  const openFilter = useCallback(() => setFilterVisible(true), []);

  /**
   * SAĞ KÖŞENİN AKSİYONU — tek buton, iki hâl (akış: kalem, harita: artı).
   *
   * ⚠️ PROPS OLARAK HESAPLANIYOR, İKİ JSX DALI OLARAK DEĞİL: `{a ? <B/> :
   * <C/>}` aynı tipte iki eleman olsa da okunurluk adına iki ayrı dal yazmak
   * kolayca iki ayrı JSX konumuna kayıyor ve o anda React butonu unmount edip
   * yeniden mount ediyor — cam bir `Host`u geçişin ortasında yeniden kurmak tam
   * olarak kaçınılan şey (bkz. satırın başındaki not).
   *
   * `null` = köşede buton YOK; yalnız haritada ve yalnız paylaşım hakkı
   * yokken (gerekçe JSX'te).
   */
  const rightCorner = mapExpanded
    ? campus.canShare
      ? {
          systemName: "plus" as const,
          fallback: Plus,
          onPress: campus.captureMoment,
          label: t("campus.shareBox"),
          testID: "feed-btn-campus",
        }
      : null
    : {
        systemName: "square.and.pencil" as const,
        fallback: Pencil,
        onPress: openComposer,
        label: t("feed.empty.cta"),
        testID: "feed-btn-compose",
      };

  return (
    <View testID="feed-screen" style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ── HARİTA ZEMİNİ — İKİ SEKMENİN ORTAK VE SABİT TABANI ─────────────
          Katman sırası: harita < pager < sekme şeridi < perdeler < köşe
          butonları. Kaydırırken harita yerinde kalıyor, gönderiler üstünden
          akıyor; yatay geçişte de sayfalar onun ÜSTÜNDEN kayıyor.
          Gerekçenin tamamı FeedMapStrip'in başında.

          ⚠️🔴 BİR DÖNEM PAGER'IN İÇİNDEYDİ ve o not "pager'ın dışına değil,
          sayfanın içine" diyordu — gerekçesi iOS'ta `AnimatedPagerView`in
          native bir sayfa denetleyicisi olması ve KENDİ zeminiyle arkasındaki
          katmanı örtme riskiydi. O yazımda harita yalnız Akış sayfasının
          çocuğuydu: Gönderilerim'e kaydırınca sayfayla birlikte yana gidiyor,
          arkada düz `colors.bg` kalıyordu — yani harita ekranın zemini değil,
          bir sayfanın parçası gibi okunuyordu (istek: "tablar arası geçişte
          arkaplanda kalsın").

          Risk ortadan kalkmadı, KARŞILANDI: pager'a ve iki sayfa kabına açık
          `backgroundColor: "transparent"` veriliyor (hemen aşağıda). Oradaki
          şeffaflık bu katmanı taşıyor — biri düşerse harita hiç görünmez.

          ⚠️ ÇIPLAK KARDEŞ, sarmalayıcısı YOK: `FeedMapStrip`in kökü zaten
          `absoluteFill`. Animasyonlu bir kaba konsaydı ata zincirinde
          opacity<1 / kimliksel olmayan transform gören SwiftUI camı (köşe
          butonları) sessizce hiç çizilmezdi — proje notu. `zIndex` de
          verilmiyor: sıralamayı kardeş sırası kuruyor (zIndex sızıntısı). */}
      {mapHero}
      <AnimatedPagerView
        ref={pagerRef}
        /**
         * ⚠️ ZEMİN ŞEFFAF — haritanın görünmesinin tek şartı: pager iOS'ta
         * native bir sayfa denetleyicisi ve kendi zeminiyle arkasındakini
         * örtüyor (bkz. haritanın yukarıdaki notu).
         */
        style={{ flex: 1, backgroundColor: "transparent" }}
        /**
         * TAM EKRAN HARİTADAYKEN YATAY JEST KAPALI.
         *
         * Pager sayfaları ekrandan çıkmış olsa da jest kapanın kendisinde
         * duruyor: sağa/sola çekince Gönderilerim'e geçiyor, harita açık
         * kalıyor ve geriye sayfası olmayan bir tam ekran harita + X kalıyordu.
         * Çıkış tek yoldan olmalı — X.
         *
         * ⚠️ MANTIKSAL durumu okuyor, cam butonların geciken mount kapısını
         * DEĞİL: jest bir KİLİT ve hiçbir kilit animasyon callback'ine
         * bağlanmamalı (kesilen bir animasyon pager'ı kalıcı kilitliyordu —
         * gerekçe `mapChromeMounted`te). Bedeli, kapanışın 280ms'i boyunca
         * yatay çekmenin açık olması; o aralıkta gelen bir çekme iki animasyonu
         * üst üste bindiriyor ama ekran kilitli KALMIYOR. Takas bilinçli:
         * geçici bir görsel çakışma, kalıcı bir kilitten iyidir.
         */
        scrollEnabled={!mapExpanded}
        initialPage={initialTabIndex}
        onPageScroll={pagerScrollHandler}
        onPageSelected={handlePageSelected}
        onPageScrollStateChanged={handlePageScrollStateChanged}
      >
        {/* ⚠️ SAYFA KABININ ZEMİNİ ŞEFFAF: harita artık pager'ın ARKASINDA
            (bkz. oradaki not) ve sayfanın kendi zemini onu örterdi.
            `collapsable={false}` de şart — stili yalnız `flex: 1` olan `View`
            native ağaçta doğmuyor ve çocukların zIndex'i köke taşınıyor
            (proje notu).

            ⚠️ YORUM `map`İN DIŞINDA: ok fonksiyonunun gövdesine, dönen
            elemanın yanına konan `{/* … *\/}` JSX değil, blok içinde bir
            ifadedir ve dosya hiç ayrışmaz (bkz. feedMapBackdrop.test.ts >
            "akış ekranı ayrışıyor"). */}
        {PAGES.map((key) => (
          <View
            key={key}
            style={{ flex: 1, backgroundColor: "transparent" }}
            collapsable={false}
          >
            {/* Liste tam ekran harita hâlinde AŞAĞI kayıyor. Sarmalayıcı
                yalnız akış sayfasında animasyonlu: tam ekran harita YALNIZ
                Akış'tan açılıyor (anlar destesi orada) ve açıkken pager jesti
                kilitli, yani Gönderilerim'in transformu kimliksel kalmalı. */}
            <Animated.View
              style={[{ flex: 1 }, key === "feed" ? listSlideStyle : null]}
            >
              {renderPage(key)}
            </Animated.View>
          </View>
        ))}
      </AnimatedPagerView>

      {/* Sekme şeridi de tam ekran harita hâlinde YUKARI kayıyor — X ile aynı
          köşeyi paylaşıyorlar. Sarmalayıcı mutlak: `ScreenHeader` kendi içinde
          mutlak konumlu ve akışta yer kaplamıyor, animasyonlu bir kap da öyle
          davranmak zorunda. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          { position: "absolute", top: 0, left: 0, right: 0 },
          headerSlideStyle,
        ]}
      >
        <ScreenHeader
          scrollY={scrollY}
          showLogo={false}
          /**
           * ŞERİDİN ZEMİNİ KISA — yalnız SEKMELERİN altına kadar.
           *
           * Tam boy olduğu dönemde (insets.top + 90) kampüs haritasının kendi
           * progressive blur'uyla üst üste biniyordu ve aşağı kaydırdıkça
           * tepede ikinci bir perde beliriyordu. Tamamen kapatmak da olmuyor:
           * kaydırıldıkça kartlar şeridin altına giriyor, harita blur'u ise
           * onların ARKASINDA kalıp oraya yetişemiyor — sekme adları opak bir
           * kartın üstünde okunmaz hâle geliyordu.
           *
           * Kısa zemin ikisini de çözüyor: sekmeler her zaman okunur, başlık ve
           * pill'lerin bandı tek perdede kalıyor.
           *
           * +14: maskenin sönmesi sekme satırının ALTINDA bitsin, harflerin
           * hizasında değil.
           */
          backgroundHeight={insets.top + SCREEN_HEADER_TITLE_HEIGHT + 14}
          /**
           * ŞERİT ORTADA, İKİ UCUNDA CAM BUTON — PROFİL EKRANININ DÜZENİ
           * (istek: "aynı profil kısmı gibi tabları ortaya al, solda ve sağda
           * buton olsun glass").
           *
           * ⚠️ ESKİ HÂLİ SOLA HİZALIYDI ve gerekçesi "şerit sayfanın büyük
           * başlığıyla aynı sol hattan başlasın"dı (Mesajlar/Beğeniler'deki
           * kurulum). O gerekçe hâlâ doğru ama artık GEÇERSİZ: iki ucu buton
           * tuttuğu için sola hizalı bir şerit sol butonun altına girerdi.
           * Profil'de de aynı sebeple ortada.
           */
          centerSlot={
            <PagerTabBar
              tabs={tabs}
              activeTab={activeTab}
              offset={pagerOffset}
              onPress={handleTabChange}
              centered
            />
          }
          /**
           * ⚠️🔴 KÖŞE BUTONLARI BU ŞERİDİN İÇİNDE DEĞİL — ve bu cam yüzünden
           * ZORUNLU, tercih değil.
           *
           * Butonlar SwiftUI camı; ata zincirinde KİMLİKSEL OLMAYAN bir
           * transform gören cam sessizce hiç render edilmiyor (proje notu) ve
           * sonradan da düzelmiyor. Bu şerit tam ekran haritada yukarı
           * ÖTELENİYOR (bkz. headerSlideStyle), yani butonlar burada
           * dursalardı geçiş boyunca ata transformu kimliksiz olurdu.
           *
           * Eskiden çözüm `!mapChromeMounted` KAPISIYDI: akışta mount, harita
           * açılırken unmount, kapanış bitince yeniden mount. Camı kurtarıyordu
           * ama köşeleri boşaltıyordu — yerine geçen X/paylaş da açılış
           * bittikten sonra sıfırdan doğuyordu. İkisi birlikte "butonlar yok
           * olup baştan çiziliyor" şikâyetinin tamamı.
           *
           * Satır artık öteleme GÖRMEYEN kardeş bir kapta ve hiç sökülmüyor
           * (bkz. "ÜST KÖŞE BUTONLARI" bloğu). Şeridin işi yalnız sekmeler.
           */
        />
      </Animated.View>

      {/* TAM EKRAN HARİTANIN PERDELERİ — üstte çıkış butonu, altta anlar
          şeridi okunsun diye (istek). İkisi de `mapProgress` ile açılıyor,
          yani akışta yokken tam ekranda tam.

          ⚠️ HARİTA KATMANINDAN AYRI: `FeedMapStrip` listenin ARKASINDA
          duruyor, perdeler ise listenin ÖNÜNDE olmak zorunda — tam ekranda
          liste ekranın dışına ötelenmiş olsa da kardeş sırası z-sırasını
          belirliyor ve perde haritanın kendi üst blur'unun yerini alıyor
          (o blur açılırken sönüyor, bkz. FeedMapStrip > blurFadeStyle).

          ⚠️ Cam X ve şerit bu katmanların ÇOCUĞU DEĞİL, kardeşi: perdenin
          opaklığı animasyonlu ve ata zincirinde opacity<1 gören SwiftUI camı
          sessizce hiç çizilmiyor (proje notu). */}
      {mapChromeMounted && campus.available ? (
        <>
          <CampusMapScrim
            // ⚠️ `mapChromeFade`: perdeler ne çekmeye ne haritanın hareketine
            // bağlı. Çekmeye bağlandıkları dönemde ekranın altında kutusuz bir
            // koyu bant beliriyordu; `mapProgress`e bağlıyken de haritayla
            // aynı 280ms'de "bir anda" oluşuyorlardı (istek). Artık harita
            // oturduktan sonra yavaşça beliriyorlar.
            // Çekerken sönen/açılan blur HARİTANIN KENDİ katmanında.
            progress={mapChromeFade}
            edge="top"
            /**
             * BOY KEŞİF ŞERİDİNİN FORMÜLÜ (istek: "SwipeCard'ın scroll'da
             * çıkan header blur'unun aynısı"): güvenli alan + satırın üst payı
             * + satır + 16 kuyruk. Hesap `campusMapTopScrimHeight`te, cam X ve
             * başlık da AYNI satırda duruyor — üçü tek sayıdan türüyor.
             *
             * Bir ara bu bant "butonun yarısına kadar" kısaltılmıştı; başlık
             * yukarı taşınınca (bkz. CampusMapTitle) satırın tamamını örtmek
             * zorunlu oldu, yoksa yazı çıplak haritanın üstünde kalıyor.
             */
            height={campusMapTopScrimHeight(insets.top)}
            /**
             * ÜST BANT CHROME MALZEMESİ (istek: "en tepedeki progressive
             * siyahlık olmasın, açık modda beyaz olsun — akış sayfasının
             * header'ındaki gibi"): bu bandın altında fotoğraf değil harita
             * var, üstünde de uygulamanın chrome'u (başlık + iki cam buton)
             * duruyor. Akışta tam aynı yerde `FeedMapStrip`in üst blur'u var
             * ve biri açılırken diğeri sönüyor; biri siyah biri modla dönen
             * olduğunda geçişte tonu atlıyordu.
             *
             * ⚠️ ALT BANT DA `chrome` OLDU (aşağıda) — bir dönem burada
             * "alt bant `media` kalıyor, orada fotoğraflar var" yazıyordu ve
             * istek üzerine değişti; gerekçe orada.
             */
            tone="chrome"
          />
          <CampusMapScrim
            progress={mapChromeFade}
            edge="bottom"
            /**
             * ŞERİDİN TAMAMI + kısa bir kuyruk: perde kutuların ve başlığın
             * ÜSTÜNE çıkıyor ama orada bitiyor. Tarihçe ve "levha" uyarısı
             * `campusStripScrimHeight`te.
             */
            height={campusStripScrimHeight(windowHeight, insets.bottom)}
            /**
             * SÖNÜM UZUN VE İÇERİKTEN TÜRÜYOR (istek: "progressive olsun,
             * gittikçe azalsın; başlığın üstünde çok gözükmesin").
             *
             * ⚠️ İKİ KISA SÖNÜM DENENDİ VE İKİSİ DE YANLIŞTI: bandın yarısı
             * (varsayılan) başlığı çıplak bırakıyordu, 32pt ise perdeyi
             * başlığın tepesine kadar TAM GÜÇTE getirip orada kesiyordu.
             * Hesap artık başlık satırı + kutuların üst yarısı kadar — yani
             * perde dipten yukarı doğru gerçekten AZALIYOR (gerekçe
             * `campusStripScrimFade`de).
             */
            fadePx={campusStripScrimFade(windowHeight)}
            /**
             * ⚠️🔴 ALT BANT DA CHROME (istek: "light mode'da alttan gelen
             * overlay beyaz olsun siyah yerine").
             *
             * Bir tur burada bilerek `media` (sabit siyah) duruyordu: bandın
             * üstünde şeridin FOTOĞRAFLARI var ve beyaz bir perde onları
             * yıkıyor sanılmıştı. Yıkmıyor, çünkü kutular OPAK — perde yalnız
             * aralarından ve altlarından görünüyor, yani gerçekte haritanın
             * üstünde duran bir chrome bandı.
             *
             * ⚠️ BU DEĞİŞİKLİK MÜREKKEBİ DE DEĞİŞTİRDİ: kartların altındaki
             * ad/zaman satırı artık TEMA mürekkebinde (açık modda koyu), yoksa
             * beyaz perdede beyaz yazı kaybolurdu. Büyüyen kartın kendi
             * satırı medya mürekkebinde kalıyor — orada perde 0.82 siyah
             * (bkz. CampusMomentCaption > `onMedia`).
             */
            tone="chrome"
          />
        </>
      ) : null}

      {/* ── ÜST KÖŞE BUTONLARI — AKIŞ VE TAM EKRAN HARİTA İÇİN TEK SATIR ───
          Sol: filtre ⇄ X (çıkış). Sağ: kalem (composer) ⇄ artı (anı paylaş).

          ⚠️🔴 SATIR SÖKÜLMÜYOR, SEMBOLÜ DEĞİŞİYOR (istek: "butonlar değişsin,
          şu anda yok olup baştan çiziliyor"). Eskiden iki ayrı satır vardı:
          akışın filtre/kalem ikilisi `ScreenHeader`ın içindeydi ve harita
          açılırken SÖKÜLÜYORDU (şerit ötelendiği için cam ata transformu
          kimliksizdi), haritanın X/artı ikilisi ise bu konumda AÇILIŞ BİTTİKTEN
          SONRA sıfırdan mount ediliyordu (`Host` kurulumu geçişin karesine
          düşmesin diye). Sonuç: köşeler ~280ms boş kalıyor, sonra iki yeni cam
          buton doğuyordu.

          Tek satırın kazandırdığı üç şey:
            • Köşe hiç boşalmıyor — glif native tarafta çapraz sönümle
              devrediliyor (bkz. DiscoverHeaderGlassButton > symbolPhase).
            • Geçişin karesinde kurulan `Host` YOK, yani gecikmeli mount
              kapısına (`mapChromeReady`) da gerek kalmadı.
            • Cam kuralı yapısal olarak sağlanıyor: kap mutlak, transformsuz ve
              opaklığı hiç animasyonlanmıyor (ata zincirinde kimliksel olmayan
              transform ya da opacity<1 gören cam SESSİZCE hiç render
              edilmiyor — proje notu).

          ⚠️ KONUM `ScreenHeader`IN BUTON YUVASIYLA BİREBİR: `insets.top`,
          50 (SCREEN_HEADER_TITLE_HEIGHT) yüksekliğinde satır, iki yanda 16.
          Haritanın eski satırı 5pt aşağıdaydı (CAMPUS_MAP_CHROME_TOP) ve o
          sayı artık YALNIZ üst perdenin boyunu besliyor — perde satırı
          fazlasıyla örtüyor. Başlığın (sekmelerin) hizası korunmak zorunda:
          butonlar sekme şeridiyle aynı merkezde duruyor.

          ⚠️ KARDEŞ SIRASI: perdelerden SONRA yazılıyor, yani onların üstünde
          çiziliyor. zIndex verilmiyor (bkz. proje notu: zIndex sızıntısı). */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top,
          left: HEADER_LEFT_INSET,
          right: HEADER_LEFT_INSET,
          height: SCREEN_HEADER_TITLE_HEIGHT,
          justifyContent: "center",
        }}
      >
        {/* HARİTA BAŞLIĞI ("Anlar") — SEKME ŞERİDİNİN YERİNE GEÇİYOR.
            Akışta opaklığı 0 ve MOUNT'LU KALIYOR: `variant="short"` sabit bir
            etiket (veriye bakmıyor), yani bedava duruyor ve geçişin karesinde
            mount edilecek bir şey kalmıyor. Sönümü `mapProgress`ten —
            sekmelerin çıkışıyla çakışsın diye (gerekçe `mapTitleFadeStyle`de).

            ⚠️ MUTLAK VE BUTONLARDAN ÖNCE: Keşif başlığındaki kalıbın aynısı —
            ortalanmış öğe satırın akışına girerse butonların genişliği onu
            merkezden kaydırıyor; önce yazılması da butonların dokunma alanını
            üstte tutuyor. */}
        {campus.available ? (
          <Animated.View
            style={[
              { position: "absolute", left: 0, right: 0, alignItems: "center" },
              mapTitleFadeStyle,
            ]}
            pointerEvents="none"
          >
            <CampusMapTitle
              variant="short"
              moments={campus.moments}
              campusLabel={campusLabel}
            />
          </Animated.View>
        ) : null}

        <View
          pointerEvents="box-none"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* SOL — AKIŞTA FİLTRE, HARİTADA ÇIKIŞ.
              Filtre buraya konmuştu çünkü pill satırı listeyle birlikte yukarı
              kayıyor ve iki kart aşağıda sıralamayı değiştirmek için başa
              dönmek gerekiyordu; `setFilterVisible` pill'lerin açtığı
              `FeedFilterSheet`in TA KENDİSİ (ikinci bir filtre yüzeyi iki ayrı
              "seçili değer" kaynağı demekti).
              Haritada aynı köşe ÇIKIŞ: tek çıkış yolu bu (pager jesti de
              kapalı, bkz. `scrollEnabled`). */}
          <DiscoverHeaderGlassButton
            systemName={mapExpanded ? "xmark" : "slider.horizontal.3"}
            fallback={mapExpanded ? X : SlidersHorizontal}
            onPress={mapExpanded ? collapseMap : openFilter}
            label={mapExpanded ? t("common.close") : t("feed.filter.title")}
            // Sembol devrinin anahtarı — iki hâl, iki değer.
            symbolPhase={mapExpanded ? 1 : 0}
            // ⚠️ MÜREKKEP İKİ HÂLDE DE TEMANIN — açık modda siyah glif.
            // Keşif'te bu butonlar kapak FOTOĞRAFININ üstünde yüzüyor ve orada
            // beyaz glif doğru; BURADA iki hâlde de altlarında fotoğraf YOK:
            // akışta şeridin üst blur'u, haritada CampusMapScrim'in üst bandı
            // var ve İKİSİ DE chrome reçetesi, yani açık temada zemin
            // beyazlıyor (haritanın bandı bu turda eşitlendi, istek). Berrak
            // cam zemini koyulaştırmadığı için beyaz glif açık modda
            // kayboluyordu (proje notu: "berrak cam + açık zemin = kayıp beyaz
            // mürekkep"). Sabit değer yazılmıyor, prop okunur kalsın diye.
            onSurface
          />

          {/* SAĞ — AKIŞTA KALEM (gönderi composer'ı), HARİTADA ARTI (anı
              paylaş).

              ⚠️ TEK ELEMAN, İKİ AKSİYON: props önceden hesaplanıyor
              (`rightCorner`) çünkü iki ayrı JSX dalı yazılsa React onları
              farklı konumlar sayıp butonu unmount/mount ederdi — tam olarak
              kaçınılan şey.

              ⚠️ ÖLÜ BUTON ÇİZİLMİYOR: haritada `canShare` yoksa (kampüs
              dışındasın, bugün paylaştın ya da özellik kapalı) buton HİÇ yok —
              basınca sunucunun reddettiği bir artı kullanıcıyı her seferinde
              kandırırdı (sebebi şeridin ilk dolgu kutusunda yazıyor). Bu TEK
              dalda köşe boşalıyor ve devri de olmuyor; alternatifi sönük ama
              basılabilir bir buton olurdu.

              ⚠️ `openComposer`IN TA KENDİSİ, yeni bir yol değil: kısıt/kota
              sıralamasının tek sahibi o fonksiyon (bkz. composeGate).
              Kampüs tarafında da aynısı: kaynak sheet'i yok, doğrudan ön
              kamera (gerekçeler useCampusSurface > captureMoment'te). */}
          {rightCorner ? (
            <DiscoverHeaderGlassButton
              systemName={rightCorner.systemName}
              fallback={rightCorner.fallback}
              onPress={rightCorner.onPress}
              label={rightCorner.label}
              testID={rightCorner.testID}
              symbolPhase={mapExpanded ? 1 : 0}
              // Sol köşeyle AYNI kural — gerekçe orada.
              onSurface
            />
          ) : null}
        </View>
      </View>

      {/* KAMPÜS ANLARI ŞERİDİ — haritanın dibinde, kutu kutu.
          Pager'ın DIŞINDA: X ile kardeş.

          ⚠️ BURADA BİR MODAL VARDI VE KALDIRILDI: gorhom sheet'i bazen hiç
          açılmıyordu ("her 2 girişimde 1"), üstelik sheet'ten alınan hiçbir
          şey kullanılmıyordu (kapanamıyordu, perdesi yoktu, çıkışı X'ti).
          Uzun gerekçe CampusMomentsStrip'in başında.

          ⚠️ MOUNT GECİKEN KAPIDAN (`mapChromeMounted`), mantıksal durumdan
          DEĞİL: mantıksal durum kapanışın BAŞINDA düşüyor, şerit o anda
          sökülse kapanış animasyonu boyunca ekranda olmayan bir yerden
          kaymış gibi görünürdü. Şerit kapanışı haritayla birlikte tamamlayıp
          sonra unmount oluyor.

          ⚠️ YÜZEY KAPALIYSA ŞERİT HİÇ ÇİZİLMİYOR — "yakında" bile demiyoruz
          (backend rehberi §0.1). Özellik bayrağı kademeli açılıyor ve
          kullanıcıların çoğu o metni görmemeli; kapalı kampüste harita
          bugünkü hâliyle kalıyor. */}
      {mapChromeMounted && campus.available ? (
        <CampusMomentsStrip
          // ⚠️ KENDİ GİRİŞ DEĞERİ (istek): kutular ne çekmeye ne haritanın
          // hareketine bağlı — harita tam ekrana oturduktan SONRA aşağıdan
          // geliyorlar (gerekçe `mapStripEntry`de).
          progress={mapStripEntry}
          moments={campus.moments}
          // Başlık şeridin TEPESİNDE — "7 an · Kampüs Adı" (bkz.
          // CampusMapTitle'daki tarihçe); üstteki chrome yalnız "Anlar".
          campusLabel={campusLabel}
          loading={campus.loading}
          // ⚠️ ŞERİTTE ARTIK BİR "+" KUTUSU ÇİZİLMİYOR: aksiyon haritanın sağ
          // üstündeki cam butona döndü (yukarıda). Bu bayrağın şeritteki tek
          // işi, paylaşamıyorsan SEBEBİNİ söyleyen dolgu kutusunu başa almak
          // (bkz. CampusMomentsStrip > pinnedInfoKey).
          canShare={campus.canShare}
          isInsideCampus={campus.inside}
          // KARTA DOKUNUNCA KART BÜYÜYOR (profil DEĞİL — gerekçe
          // `momentTarget`in yanında). Kendi anım şeritte zaten dokunulamaz,
          // kapı orada kesiliyor.
          onOpenCard={(moment, frame) => setMomentTarget({ id: moment.id, frame })}
          // ⚠️ AÇIK KART ŞERİTTE ÇİZİLMİYOR: büyüyen kart ayrı bir görünüm ve
          // ikisi bir arada görünürse hareket "kopyalandı" diye okunuyor
          // (gerekçe şeritteki `openMomentId`de). Küçülme bitene kadar sürüyor.
          openMomentId={momentTarget?.id ?? null}
          onRemove={campus.remove}
          // Şikayet kartın UZUN BASIŞ menüsünden geliyor (natif), kartta
          // buton yok — formu burada açıyoruz çünkü `ReportModal` bir sheet
          // ve şeridin içinden açılırsa şeridin `translateY`si altında kalır.
          onReport={setReportMoment}
          onEndReached={campus.fetchNextPage}
        />
      ) : null}

      {/* BÜYÜYEN AN KARTI — şeritteki karta dokununca.

          ⚠️ ŞERİDİN KAPISININ DIŞINDA (`mapChromeMounted`), KARDEŞİ: kart
          açıkken harita kapanabiliyor ve yüzey şeridin kapısının içinde olsaydı
          animasyonun ortasında SÖKÜLÜRDÜ.

          ⚠️🔴 AYNI SEBEPLE CAM DA BURADA ÇİZİLEBİLİYOR: şerit `translateY` ile
          geliyor, yani onun ALTINDA doğan bir cam buton hiç render edilmez
          (projenin en sert tuzağı). Overlay kendi kapısını kendi kuruyor —
          kart yerine oturana kadar cam mount edilmiyor.

          ⚠️ BURADA BİR `LikerSwipeModal` VARDI (an sahibinin profil kartı) ve
          `handleMomentDecide` ile kampüs beğenisine/pass'ine bağlıydı. İkisi de
          kaldırıldı: ödünç uç 404 veriyor (backend teyidi), kampüse özel uç
          henüz yok. Uç gelince geri gelecek olan düzen şuydu — `onDecide` ŞART
          (yoksa beğeni `source: "CampusMoment"` olmadan gider, kampüs yerine
          keşif kotası yanar) ve FIRE/NOT KAPALI (kampüs kaynağını taşımıyorlar,
          basılsa Keşif'teki kişiye giderdi). */}
      <CampusMomentExpandOverlay
        moment={openMoment}
        frame={momentTarget?.frame ?? null}
        // ⚠️ ANIN MODU, ekranın seçili modu DEĞİL: liste moda göre geliyor ama
        // kart elde bayatlamışsa ikisi ayrışabilir.
        mode={openMoment?.mode ?? selectedMode}
        busy={campus.busyMomentId === openMoment?.id}
        // ⚠️ BEĞENİLEN AN ŞERİTTE KALIYOR → aynı karta ikinci kez
        // dokunulabiliyor: tik çizilmiyor ve kart sağdaki cam sütunu
        // ayrılmadan açılıyor (uzun gerekçe overlay'in `decided` prop'unda).
        // Kaynak sıralı: sunucunun `canLike`ı, yoksa oturum kümesi.
        decided={isMomentDecided(openMoment, campus.decidedMomentIds)}
        collapsing={momentCollapsing}
        onLike={handleMomentLike}
        onClose={() => setMomentTarget(null)}
      />

      {/* ⚠️ KAMPÜS ANI PAYLAŞIMINDA ARTIK HİÇBİR SHEET YOK.
          İki adım sırayla kaldırıldı:
            • `PhotoSourceSheet` (kamera/galeri seçimi) — kampüs anı anlık bir
              çekim olmak zorunda, galeriden seçilen eski bir fotoğraf "şu anda
              buradayım" cümlesini kuramıyor. Bileşen duruyor, profil/kayıt
              akışları hâlâ kullanıyor.
            • `CampusMomentComposer` (önizleme + paylaş onayı) — istek: "direkt
              çektiğim ekranda foto static kalsın, oradan göndere basınca
              göndereyim, ekstra modal filan açma". Önizleme, paylaş düğmesi ve
              satır içi hata kamera ekranına taşındı (bkz. CameraCaptureOverlay
              > donmuş kare ve cameraBridge > `commit`). Bileşen dosyası
              silinmedi ama MOUNT EDİLMİYOR; geri konacaksa `useCampusSurface`
              artık `composerOpen`/`share`/`shareError` vermiyor. */}

      {/* "Her zaman" konum izni — İLK PAYLAŞIMDAN SONRA bir kez soruluyor
          (gerekçe useCampusSurface > captureMoment). Kapatılabilir: izin
          olmadan da özellik çalışıyor, yalnız bildirim gelmiyor. */}
      <CampusAlwaysPrimingSheet
        visible={campus.primingOpen}
        onClose={campus.closePriming}
        onGranted={campus.onPrimingGranted}
      />

      {/* ⚠️🔴 SAĞ ALTTAKİ FAB KALDIRILDI — composer'ın girişi BAŞLIĞIN SAĞ
          ÜSTÜNDEKİ KALEM butonu oldu (istek). İki giriş aynı ekranda aynı
          sheet'i açıyordu; biri gitmek zorundaydı ve sabit başlıktaki buton
          kaydırma konumundan bağımsız, FAB ise tab bar'ın üstünde bir
          katmandı.

          Geri konacaksa kaydı duruyor: 52pt'lik yuvarlak `Pressable`, sağ 16 /
          alt 92 (tab bar + nefes), zemin `inverseSurface`, glif
          "square.and.pencil" 22pt ve kapısı `gate.kind !== "restricted" &&
          !mapChromeMounted` idi. Boş durumun butonu zaten `openComposer`ı
          doğrudan çağırıyor (bkz. empty), yani FAB'ın gidişi onu etkilemiyor. */}

      <FeedComposerSheet
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onSend={handleSendPost}
        maxLength={me?.postMaxLength}
        anonymousGate={anonymousGate(me)}
        onAnonymousPaywall={openPaywall}
        // Konu kataloğu: sunucu listesi öncelikli, yokken istemci yedeği
        // (bkz. feedTopics). Composer'da konu ZORUNLU olduğu için liste asla
        // boş kalamaz — boş liste ekranı kilitlerdi.
        topicKeys={topicKeys}
        topicLabelFor={topicLabelFor}
        // Yanıt composer'ıyla aynı kaynak: /api/feed/me'nin kota bloğu.
        remaining={me?.quota?.postsRemaining ?? null}
        // ⚠️ KAPI BURADAN GEÇİYOR, `remaining <= 0`DAN TÜRETİLMİYOR. Composer
        // içinde türetilse `remaining: null` (backend henüz söylemedi) de
        // kilitlenirdi ve o "hak yok" değil "bilmiyoruz" demek. Kota kuralının
        // tek sahibi `composeGate` — kısıt/kota sıralaması da orada.
        quotaExhausted={gate.kind === "quotaExhausted"}
        // Domain DEĞİL gösterim adı (bkz. ownUniversityName).
        universityLabel={ownUniversityName}
        sending={createPost.isPending}
        errorText={composerError}
      />

      {/* YANIT COMPOSER'I KALDIRILDI (iki modlu yapı): yanıt yazarak eşleşme
          kanalı kapandı. Yerine yazarın profil kartından beğeni/not/Spark
          geldi — akıştan profile girmenin yolu PreviewModal (aşağıda). */}

      <FeedQuotaSheet
        visible={quotaSheet.visible}
        onClose={() => setQuotaSheet({ visible: false, nextResetAt: null })}
        nextResetAt={quotaSheet.nextResetAt}
        // Premium'da teklif yok: tavanı zaten yüksek, satılacak bir şey kalmadı.
        showPlusOffer={!isPremium}
        accent={accent}
        onPlusPress={() => {
          setQuotaSheet({ visible: false, nextResetAt: null });
          openPaywall();
        }}
      />

      <FeedSupportSheet
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
      />

      <FeedReportSheet
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.targetType ?? "Post"}
        postId={reportTarget?.postId}
        replyId={reportTarget?.replyId}
        isAnonymousTarget={reportTarget?.isAnonymous ?? false}
      />

      {/* KAMPÜS ANI ŞİKAYETİ — profil/sohbet ile AYNI form ve AYNI uç.
          ⚠️ `campusMomentId` gövdeye ekleniyor ki moderatör hangi fotoğrafın
          şikayet edildiğini görsün; sunucu alanı henüz okumuyorsa sessizce
          yok sayıyor (not şikayetindeki `noteId` ile aynı sözleşme) —
          şikayetin kendisi her hâlükârda kaydediliyor. */}
      <ReportModal
        visible={!!reportMoment}
        onClose={() => setReportMoment(null)}
        reportedUserId={reportMoment?.userId}
        campusMomentId={reportMoment?.id}
      />

      <FeedFilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        value={{
          sort: listParams.sort,
          interest: listParams.interest,
          kind: listParams.kind,
          topics: listParams.topics,
        }}
        onApply={handleApplyFilters}
        kindGate={kindGate}
        onKindPaywall={openPaywall}
        topicKeys={topicKeys}
        topicLabelFor={topicLabelFor}
        topicAllLabel={topicAllLabel()}
      />

      <FeedUniversitySheet
        visible={universityVisible}
        onClose={() => setUniversityVisible(false)}
        value={listParams.university}
        onSelect={handleSelectUniversity}
        // İlk satır "Kendi kampüsüm" yerine kampüsün ADINI yazıyor; domain de
        // o üniversiteyi listeden düşürmek için (bkz. sheet'in prop notu).
        ownDomain={me?.universityDomain ?? null}
        ownUniversityName={ownUniversityName}
        // Kapı sheet'in İÇİNDE uygulanıyor: free kullanıcı listeyi görüyor,
        // başka kampüs satırlarında kutu yerine kilit var ve dokunuş sheet'i
        // kapatıp Plus'a götürüyor (bkz. handleUniversityPill).
        gate={universityGate}
        onPaywall={openPaywall}
      />

      {/* ── YAZAR KARTI ────────────────────────────────────────────────────
          Normal gönderinin yazarına dokunulunca profil kartı açılıyor. DÖRT
          AYRI HÂL var, üçü aynı modalda (bkz. feedCardActions):

          (a) NORMAL (`cardMode` dolu, yazar beni beğenmemiş) →
              `LikerSwipeModal`, Fire/Spark + not açık, tik ve X yok. Akışta
              kart karşı taraftan gelen bir sinyale cevap DEĞİL — sen kendi
              isteğinle profile giriyorsun, düz beğeni/reddetme anlamsız.

          (b) BEĞENİLMİŞ (`cardMode` dolu, yazar beni beğenmiş) → AYNI
              `LikerSwipeModal`, ama tik (kabul) ve X (reddet) açık, Fire ve
              not kapalı — karşı taraf seni zaten beğenmiş, üstüne yükseltecek
              bir sinyal yok. Eşleşme kanalı artık bu — yanıt butonunun yerini
              aldı.

          (c) EŞLEŞMİŞ (`isMatched`) → yine AYNI `LikerSwipeModal`, ama HİÇBİR
              aksiyon yok (istek): eşleştiğin kişiyle kanal zaten açık, Fire ve
              not oraya bir şey eklemeden bakiyeden düşerdi; kabul/reddet de
              anlamsız, bekleyen bir karar yok.

          (d) MOD YOK (`cardMode` null: sunucu hiçbir modu uygun görmedi ya da
              alanı hiç göndermedi) → `PreviewModal`, salt okunur. Olmayan bir
              hakkı varsayıp reddedilecek bir buton göstermek, kullanıcıya iki
              kez kaybettirirdi.

          Anonim gönderide bu yol HİÇ açılmıyor (FeedPostCard'daki kapı):
          kart açılsa anonim yazarın kimliği ifşa olurdu. */}
      {cardMode ? (
        <LikerSwipeModal
          visible={!!previewPostId && !!authorProfile.data}
          profile={authorProfile.data}
          onClose={() => setPreviewPostId(null)}
          // Aksiyonun modu — swipe isteğine iliştiriliyor ve kartın
          // Fire/Spark rengini belirliyor.
          mode={cardMode}
          // Fire yalnız NORMAL kartta: beğenilmiş hâlde karşı taraf seni zaten
          // beğenmiş, üstüne yükseltecek bir sinyal yok — Fire de not de kapanıyor.
          allowFire={cardActions.fire}
          // Tik = KABUL, yalnız beğenilmiş kartta çiziliyor. Normal kartta
          // (ister Flört ister Arkadaş) düz beğeni akışta hiç yok — sinyal ya
          // Fire ya not.
          allowLike={cardActions.like}
          // X = REDDET, yalnız beğenilmiş kartta: normal kartta reddedilecek
          // bir sinyal yok (kendi isteğinle girdiğin profile X anlamsız).
          allowPass={cardActions.pass}
          // Tükenmiş Fire'ı sunucuya gönderip reddi beklemiyoruz: reddin geri
          // bildirimi `uiBus` üstünden YALNIZ Keşif'e gidiyor ve o sekme lazy
          // mount — akışta hiçbir şey olmamış gibi görünürdü.
          fireBlocked={fireQuotaExhausted}
          onFireBlocked={handleFireBlocked}
          onNote={cardActions.note ? handleAuthorNote : undefined}
          superLikesRemaining={statsQuery.data?.superLikesRemaining ?? null}
          onSwipe={handleAuthorSwipe}
        />
      ) : (
        <PreviewModal
          visible={!!previewPostId && !!authorProfile.data}
          onClose={() => setPreviewPostId(null)}
          profile={authorProfile.data}
        />
      )}

      {/* Not composer'ı — kart kapandıktan sonra açılıyor (üst üste binme).
          Keşif'tekiyle AYNI bileşen ve AYNI mutasyon; tek fark nerede
          render edildiği (gerekçe handleAuthorNote'ta). */}
      <NoteComposerModal
        visible={!!noteRequest}
        onClose={() => {
          setNoteRequest(null);
          setNoteError(null);
        }}
        // Hedefin türüne göre iki dal: gönderi (akış satırı) ve yazar kartı.
        // Mutasyon, kota ve hata tablosu ortak; ayrışan tek şey hedefin
        // nereden geldiği.
        onSend={noteRequest?.post ? handleSendPostNote : handleSendAuthorNote}
        target={noteRequest?.target ?? null}
        prompts={noteRequest?.profile?.prompts ?? null}
        // Fotoğrafa yazılan notta hedefin KENDİSİ görünüyor (Keşif'teki
        // composer'la aynı sözleşme): kullanıcı hangi fotoğrafa yazdığını
        // kartı kapattıktan sonra da görsün.
        photoUri={
          noteRequest?.target?.kind === "Photo"
            ? (noteRequest.profile?.photos?.[
                noteRequest.target.photoIndex ?? 0
              ] ?? null)
            : null
        }
        // Gönderi önizlemesi — foto thumbnail'inin / prompt chip'inin muadili.
        // Konu etiketi EKRANDA çözülüyor (`topicLabelFor` sunucunun kataloğunu
        // `me`den okuyor); composer enum çevirmiyor.
        postPreview={
          noteRequest?.post
            ? {
                body: noteRequest.post.body,
                topicLabel: noteRequest.post.topic
                  ? topicLabelFor(noteRequest.post.topic)
                  : null,
              }
            : null
        }
        targetName={
          noteRequest?.post
            ? (noteRequest.post.author?.name ?? null)
            : (noteRequest?.profile?.displayName ?? null)
        }
        remaining={notesRemaining}
        maxLength={statsQuery.data?.noteMaxLength ?? null}
        sending={noteMutation.isPending}
        errorText={noteError}
        // Kartın modu — seçili mod DEĞİL. Not hangi modda GİDİYORSA buton o
        // rengi alır; mutasyona geçen değerin aynısı (bkz. handleSendAuthorNote
        // > `mode: cardMode ?? undefined`), böylece renk ile gönderilen mod tek
        // kaynaktan geliyor. `null` → prop varsayılanı (Dating).
        mode={(noteRequest?.post ? noteRequest.mode : cardMode) ?? undefined}
      />

      {/* ── CONSUMABLE PAKETLERİ ────────────────────────────────────────────
          İkisi de Keşif'tekiyle AYNI bileşen ve aynı redeem kuyruğu; BURADA DA
          render ediliyorlar çünkü Flört kartında beğeni yok ve iki yolun
          (Fire · not) ikisi de bakiyeye bağlı. Keşif'e devretmek uiBus demekti,
          o sekme de lazy mount — kullanıcı oraya hiç girmemişse sheet hiç
          açılmazdı (feedEntry.ts'teki tuzak).

          `onPurchased` SONRASI REFETCH: bakiye redeem yanıtından cache'e
          yazılıyor, buradaki tur server-truth'u teyit eder — kart yeniden
          açıldığında `fireBlocked`/`notesRemaining` taze olur. */}
      <FirePurchaseModal
        visible={firePurchaseVisible}
        onClose={() => setFirePurchaseVisible(false)}
        onPurchased={() => {
          setFirePurchaseVisible(false);
          statsQuery.refetch();
        }}
      />

      <NotePurchaseModal
        visible={notePurchaseVisible}
        onClose={() => setNotePurchaseVisible(false)}
        onPurchased={() => {
          setNotePurchaseVisible(false);
          statsQuery.refetch();
        }}
      />
    </View>
  );
}

/** Gönderilerim durum rozeti metni — `postPresentation` → i18n anahtarı. */
function statusLabelFor(
  post: FeedPostDto,
  t: (k: string) => string,
): string | null {
  switch (postPresentation(post)) {
    case "pending":
      return t("feed.mine.status.PendingReview");
    case "support":
      return t("feed.mine.status.SupportHold");
    case "hidden":
      return t("feed.mine.status.HiddenByReports");
    case "removed":
      return t("feed.mine.status.Rejected");
    case "expired":
      // "Süresi doldu" kalan-ömür satırında zaten yazıyor; rozet tekrar etmesin.
      return null;
    default:
      return null;
  }
}

function statusToneFor(post: FeedPostDto): "neutral" | "warning" | "danger" {
  switch (postPresentation(post)) {
    // İNCELEME NÖTR (istek), "warning" DEĞİL: rozet başlık satırına taşınınca
    // turuncu bir "İnceleniyor" tarihin ve üç noktanın yanında bir uyarı —
    // hatta bir hata — gibi okunuyordu. Oysa inceleme bir bekleme durumu,
    // kullanıcının yapması gereken bir şey yok. Nötr ton grinin kendisi
    // (bkz. FeedPostCard > statusColor).
    case "pending":
      return "neutral";
    // Kaldırılan/gizlenen gönderi KIRMIZI kalıyor: orada gerçekten bir sorun
    // var ve kullanıcının bilmesi gerekiyor.
    case "removed":
    case "hidden":
      return "danger";
    default:
      return "neutral";
  }
}
