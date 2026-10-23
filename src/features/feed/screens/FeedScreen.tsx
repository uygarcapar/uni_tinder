import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type PagerView from "react-native-pager-view";
import Animated, {
  runOnJS,
  useAnimatedReaction,
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
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { LayoutList, X } from "@/shared/icons";
import DiscoverHeaderGlassButton from "@/features/discover/components/DiscoverHeaderGlassButton";
import { colors, withAlpha } from "@/shared/theme/colors";
import uiBus from "@/shared/services/uiBus";
import { navigationRef } from "@/shared/services/navigationRef";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import PreviewModal from "@/features/profile/components/PreviewModal";
import { useAppMode } from "@/features/discover/useAppMode";
import { modeAccent } from "@/features/discover/modeTheme";
import {
  useNoteMutation,
  useSwipeStats,
} from "@/features/discover/swipeQueries";
import NoteComposerModal from "@/features/discover/components/NoteComposerModal";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import FirePurchaseModal from "@/features/discover/components/FirePurchaseModal";
import { formatResetTime } from "@/features/discover/quotaFormat";
import type { NoteTarget } from "@/shared/types";
import { feedCardActions, resolveCardMode } from "../feedCardMode";
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
import FeedMapStrip, { FEED_MAP_BAND_HEIGHT } from "../components/FeedMapStrip";
import {
  MAP_CHROME_FADE_MS,
  MAP_MOTION_MS,
  MAP_PULL_EXPAND_PX,
  MAP_PULL_SHARE,
  MAP_STRIP_ENTRY_MS,
  mapMotionEasing,
} from "../components/feedMapMotion";
import { useCampusSurface } from "@/features/campus/useCampusSurface";
import CampusMomentsStrip, {
  CAMPUS_STRIP_SCRIM_FADE,
  campusStripHeight,
  campusStripScrimHeight,
} from "@/features/campus/components/CampusMomentsStrip";
import CampusMapScrim, {
  CAMPUS_MAP_CHROME_ROW,
  CAMPUS_MAP_CHROME_TOP,
  campusMapTopScrimHeight,
} from "@/features/campus/components/CampusMapScrim";
import CampusMapTitle from "@/features/campus/components/CampusMapTitle";
import CampusMomentComposer from "@/features/campus/components/CampusMomentComposer";
import CampusAlwaysPrimingSheet from "@/features/campus/components/CampusAlwaysPrimingSheet";
import PhotoSourceSheet from "@/shared/components/PhotoSourceSheet";
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
import { useCampusBoundary } from "@/features/campus/campusQueries";
import LikerSwipeModal from "@/features/discover/components/LikerSwipeModal";
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
 * Sağ alttaki "paylaş" butonu — DAİRE, yani genişlik = yükseklik.
 *
 * Glifin ölçüsü ayrı sabit ve İKİ YERDE kullanılıyor: SFIcon'un `size`ı ve onu
 * saran kutunun kenarı. İkisi ayrışırsa glif dairenin ortasından kayar (native
 * sembolün doğal ölçüsü `size`la birebir aynı değil).
 */
const FAB_SIZE = 52;
const FAB_GLYPH = 22;

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
}: {
  title: string;
  description: string;
  actionLabel: string | null;
  onActionPress: (() => void) | null;
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
      }}
    >
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
   * PARMAK LİSTEDE Mİ — `onBeginDrag`/`onEndDrag` arası.
   *
   * Reanimated'ın scroll handler'ı çok olaylı biçimde kurulduğunda (aşağıdaki
   * nesne) bu olayların hepsine birden bağlanıyor; `onScroll` prop'u tek
   * başına yeterli.
   */
  const feedDragging = useSharedValue(false);

  /**
   * ÇEKME GERÇEKTEN BAŞLADI MI — "momentum bounce"u çekmeden ayıran kilit.
   *
   * ── Yaşanan hata ─────────────────────────────────────────────────────────
   * Kullanıcı listeyi hızlıca YUKARI savuruyor; momentum tepeye varıyor ve
   * lastik eşiği AŞACAK kadar taşıyor. Offset'e bakan bir kapı bunu "çekme"
   * sanıyordu: gönderiler momentumla zıplıyor, chrome/sekmeler/kutular %45
   * yola çıkıp geri dönüyor, üstüne harita kendiliğinden açılıyordu. Tarif
   * birebir buydu — "görüntü kirliliği".
   *
   * ── Kural ────────────────────────────────────────────────────────────────
   * Çekme yalnız PARMAK LİSTEDEYKEN başlayabiliyor. Bir kez başladıktan sonra
   * kilit, offset sıfıra DÖNENE kadar açık kalıyor — yani parmak kalktıktan
   * sonra lastik geri yaylanırken chrome da onunla birlikte yumuşakça geri
   * geliyor (kilit parmakla düşseydi orada sert bir sıçrama olurdu).
   *
   * Momentum yolunda ise parmak zaten yok: kilit hiç açılmıyor, hiçbir katman
   * kıpırdamıyor ve harita açılmıyor.
   */
  const feedPullEngaged = useSharedValue(false);

  const feedScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      scrollY.value = y;
      feedScrollY.value = y;
      // ⚠️ SIRA ÖNEMLİ: önce sıfırlama (tepeye dönüş kilidi her hâlükârda
      // kapatıyor), sonra parmakla açma. Tersi sırada tek bir karede açılıp
      // kapanabiliyordu.
      if (y >= 0) {
        feedPullEngaged.value = false;
      } else if (feedDragging.value && y < -2) {
        feedPullEngaged.value = true;
      }
    },
    onBeginDrag: () => {
      feedDragging.value = true;
    },
    onEndDrag: () => {
      feedDragging.value = false;
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
   * Kartta HANGİ AKSİYONLAR var — moda göre (istek):
   *   • FLÖRT: düz beğeni YOK. Zorunlu iki yol Fire ve not.
   *   • ARKADAŞ: hepsi serbest (beğeni · Spark · not).
   * Karar saf fonksiyonda, kartın modundan türüyor (bkz. feedCardActions).
   */
  const cardActions = useMemo(() => feedCardActions(cardMode), [cardMode]);

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
   * Kart kararından sonra: beğeni/Fire gittiyse aynı yazarın kartı bayatladı
   * (ör. artık eşleştiniz) ve akış satırları da yazarın durumunu taşıyor.
   *
   * ENGELLEME dalı ayrı: yazarın TÜM gönderileri listeden düşmeli.
   */
  const handleAuthorSwipe = useCallback(
    (_userId: string, direction: string) => {
      qc.invalidateQueries({
        queryKey: feedKeys.authorProfile(previewPostId ?? ""),
      });
      if (direction === "block") {
        // Engellenen kişinin gönderileri sunucuda eleniyor — listeyi
        // tazelemek yeterli, elle budamaya gerek yok.
        qc.invalidateQueries({ queryKey: feedKeys.postsRoot });
      }
    },
    [qc, previewPostId],
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
   *     anlar sheet'i, pager kilidi ve FAB bunu okuyor.
   *   • `mapChromeMounted` — kapanışta GECİKEN mount kapısı, yalnız cam
   *     butonlar (X ve "+") için.
   *
   * X bir SwiftUI cam butonu ve camın kuralı sert: ata zincirinde kimliksel
   * olmayan bir transform ya da opacity<1 gören cam SESSİZCE hiç render
   * edilmiyor (bkz. proje notu). O yüzden X'e animasyon takılmıyor, kapanırken
   * de animasyon BİTTİKTEN SONRA unmount ediliyor — ölçek/opaklıkla
   * belirtilse efekt büyük olasılıkla hiç çizilmezdi.
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
   * ÇEKMENİN DONDURULMUŞ ORANI — açılış anında ne kadar çekilmişti.
   *
   * Chrome çekerken yukarı gidiyor (bkz. chromeSlideStyle) ve o pay canlı
   * `feedScrollY`den türüyor. Eşik geçildiği an iki şey birden oluyor: harita
   * açılmaya başlıyor VE `scrollEnabled` kapandığı için liste 0'a snap'liyor.
   * Canlı değer o karede sıfırlanıyor, yani chrome'un ödünç aldığı pay bir
   * anda geri veriliyordu — gözle görülür bir ZIPLAMA (başlık aşağı düşüp
   * sonra yukarı kalkıyor).
   *
   * Çare: açılış anındaki oran dondurulup animasyon boyunca o kullanılıyor;
   * ilerleme büyüdükçe `(1 - ilerleme)` ile kendiliğinden sönüyor.
   */
  const mapPullFrozen = useSharedValue(0);

  /**
   * ŞERİDİN CAM BUTONLARININ MOUNT KAPISI — açılış animasyonu bitti mi.
   *
   * Kutuların karar çifti SwiftUI camı ve camın kuralı sert: ata zincirinde
   * kimliksel olmayan bir transform gören cam SESSİZCE hiç render edilmiyor ve
   * sonradan düzelmiyor (proje notu). Şerit aşağıdan `translateY` ile geldiği
   * için animasyon boyunca o zincir kimliksel değil — butonlar ancak şerit
   * yerine oturduktan sonra mount edilebilir.
   *
   * ⚠️ NEDEN ZAMANLAYICI, `withTiming` CALLBACK'İ DEĞİL: Reanimated bir
   * animasyonun ÜZERİNE yazıldığında eskisinin callback'ini `finished: false`
   * ile çağırıyor (bu dosyada bir kez kanlı bir hata üretti, bkz. kuşak notu).
   * Açılış kesilip yeniden başlatılırsa (banda iki kez dokunmak) callback'e
   * dayanan bayrak hiç true olmaz ve kullanıcı KARAR VEREMEYEN bir şeritte
   * kalırdı. Süre sabit (`MAP_MOTION_MS`), zamanlayıcı birebir aynı anı veriyor
   * ve kesilme onu etkilemiyor.
   */
  const [mapActionsReady, setMapActionsReady] = useState(false);

  /**
   * ÜST CHROME'UN (cam X + başlık) MOUNT KAPISI — açılış animasyonu bitti mi.
   *
   * Kutuların kapısından AYRI, çünkü iki an farklı: üst chrome harita yerine
   * oturduğunda (`MAP_MOTION_MS`), kutuların cam butonları ise ŞERİDİN kendi
   * girişi de bittiğinde (`+ MAP_STRIP_ENTRY_MS`) mount edilebiliyor.
   */
  const [mapChromeReady, setMapChromeReady] = useState(false);

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
    // Çekmenin o andaki payı DONDURULUYOR (gerekçe `mapPullFrozen`de).
    // Butondan açılışta `feedScrollY` 0 civarı, yani pay da 0 — fark yok.
    mapPullFrozen.value = Math.min(
      Math.max(-feedScrollY.value / MAP_PULL_EXPAND_PX, 0),
      1,
    );
    setMapExpanded(true);
    setMapChromeMounted(true);
    clearMapActionsTimer();
    setMapActionsReady(false);
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
    setMapChromeReady(false);
    // Şerit ekranın ALTINDA bekliyor; girişi haritanın hareketi bitince
    // başlıyor (gerekçe `mapStripEntry`de).
    mapStripEntry.value = 0;
    mapChromeFade.value = 0;
    mapTimersRef.current = [
      setTimeout(() => {
        setMapChromeReady(true);
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
      }, MAP_MOTION_MS),
      // ⚠️ Kutuların cam butonları ŞERİT DE OTURDUKTAN sonra: animasyonlu bir
      // atanın altında doğan cam sessizce hiç çizilmiyor (proje notu).
      setTimeout(
        () => setMapActionsReady(true),
        MAP_MOTION_MS + MAP_STRIP_ENTRY_MS,
      ),
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
    feedScrollY,
    mapChromeFade,
    mapProgress,
    mapPullFrozen,
    mapStripEntry,
  ]);

  // Abonelik `expandMap`i doğrudan göremiyor (daha yukarıda kuruluyor) → köprü.
  useEffect(() => {
    expandMapRef.current = expandMap;
    return () => {
      expandMapRef.current = null;
    };
  }, [expandMap]);

  /**
   * YUKARIDAN AŞAĞI ÇEKİNCE TAM EKRAN HARİTA — pull-to-refresh'in yerine.
   *
   * ⚠️ KAPILAR REF'TEN OKUNUYOR, state'ten DEĞİL: tetik UI thread'deki bir
   * reaksiyondan geliyor ve `runOnJS` ile çağrılan fonksiyon bir kez kurulup
   * uzun süre yaşıyor. State okunsaydı bayat bir closure "harita kapalı"
   * sanıp açık haritanın üstüne ikinci bir açılış animasyonu bindirirdi.
   */
  const mapExpandedRef = useRef(false);
  mapExpandedRef.current = mapExpanded;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const expandFromPull = useCallback(() => {
    if (mapExpandedRef.current) return;
    // ⚠️ YALNIZ AKIŞ SAYFASINDA: Gönderilerim'de harita yok ve orada çekmek
    // hâlâ yenileme (bkz. onRefresh).
    if (activeTabRef.current !== "feed") return;
    expandMap();
  }, [expandMap]);

  /**
   * Eşiğin GEÇİLDİĞİ AN tetikleniyor — parmağın bırakılması beklenmiyor
   * (gerekçe `MAP_PULL_EXPAND_PX`te).
   *
   * ⚠️ `prev === null` İLK TUR: reaksiyon mount'ta bir kez karşılaştırmasız
   * koşuyor ve o turda tetiklenirse ekran açılır açılmaz harita açılırdı.
   *
   * ⚠️ Yalnız KENARDA: eşik geçildikten sonra offset bir süre daha negatif
   * kalıyor (lastik geri yaylanıyor), yani her karede tetiklenmemesi için
   * karşılaştırma şart.
   *
   * ⚠️ `feedPullEngaged` ŞART: momentumla tepeye varan bir savurma lastiği
   * eşiği aşacak kadar taşıyor ve bu kapı olmadan harita kendiliğinden
   * açılıyordu (gerekçe o değerin yanında).
   */
  useAnimatedReaction(
    () => feedPullEngaged.value && feedScrollY.value <= -MAP_PULL_EXPAND_PX,
    (crossed, prev) => {
      if (prev === null || !crossed || crossed === prev) return;
      runOnJS(expandFromPull)();
    },
  );

  /**
   * Cam butonların unmount'u — yalnız kendi kuşağı hâlâ geçerliyse.
   * `runOnJS` için ayrı bir fonksiyon: worklet içinden ref okunmuyor.
   */
  const finishMapCollapse = useCallback((gen: number) => {
    if (gen !== mapGenRef.current) return;
    setMapChromeMounted(false);
    setMapChromeReady(false);
  }, []);

  const collapseMap = useCallback(() => {
    const gen = (mapGenRef.current += 1);
    // ⚠️ MANTIKSAL DURUM ANINDA DÜŞÜYOR, animasyonun bitmesini BEKLEMİYOR:
    // anlar şeridi, pager kilidi ve FAB buna bağlı ve kesilen bir animasyon
    // onları açık/kilitli bırakıyordu (gerekçe yukarıda).
    setMapExpanded(false);
    // Kutuların cam butonları ANINDA sökülüyor: şerit aşağı ötelenmeye
    // başladığı an ata zinciri kimliksel olmaktan çıkıyor ve orada duran cam
    // zaten çizilmez (gerekçe `mapActionsReady`de).
    clearMapActionsTimer();
    setMapActionsReady(false);
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
    // ⚠️ KAPANIŞIN BAŞINDA SIFIR: terim `(1 - ilerleme)` ile çarpıldığı için o
    // an katkısı zaten 0 ve sıfırlamak görünmüyor. Yapılmazsa kapanış
    // bittiğinde (ilerleme 0) donmuş pay yeniden devreye girip chrome'u
    // ekranın dışında bırakıyordu.
    mapPullFrozen.value = 0;
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
    mapPullFrozen,
    mapStripEntry,
  ]);

  /**
   * ÇEKMENİN ORANI — 0 (çekilmedi) → 1 (eşiğe varıldı).
   *
   * ⚠️ Açılış başladıktan sonra CANLI offset okunmuyor, donmuş oran
   * kullanılıyor: `scrollEnabled` kapandığı an liste 0'a dönüyor ve canlı
   * değerle sürülen her katman bir anda geri düşerdi (uzun gerekçe
   * `mapPullFrozen`de).
   */
  const mapPull = useDerivedValue(() => {
    if (mapProgress.value > 0) return mapPullFrozen.value;
    // ⚠️ MOMENTUM BOUNCE ÇEKME DEĞİL: kilit kapalıysa hiçbir katman kıpırdamaz
    // (gerekçe `feedPullEngaged`de).
    if (!feedPullEngaged.value) return 0;
    return Math.min(Math.max(-feedScrollY.value / MAP_PULL_EXPAND_PX, 0), 1);
  });

  /**
   * HARMANLANMIŞ SÜRÜCÜ — "açılışın ne kadarı tamamlandı", parmak dahil.
   *
   * Çekerken katman kendi yolunun `MAP_PULL_SHARE` kadarını alıyor; animasyon
   * başlayınca ilerleme devralıyor ve çekmenin payı `(1 - ilerleme)` ile
   * sönüyor.
   *
   * ⚠️ TÜKETİCİSİ AZALDI, formül aynı kaldı: sekme şeridi (Akış /
   * Gönderilerim). Kutuların şeridi ve ekranın perdeleri bir dönem bunu
   * okuyordu; kutular artık çekmeye DEĞİL kendi girişine bağlı (istek, bkz.
   * `mapStripEntry`) ve perdeler onunla aynı aileye döndü.
   *
   * Chrome (başlık + pill satırı) BUNU OKUMUYOR, kendi formülü var: o listenin
   * ÇOCUĞU, yani lastiğin aşağı itmesini de iptal etmek zorunda
   * (bkz. chromeSlideStyle). Haritanın blur'u ise ham `mapPull`ı okuyor.
   */
  const mapDrive = useDerivedValue(
    () =>
      mapProgress.value +
      (1 - mapProgress.value) * mapPull.value * MAP_PULL_SHARE,
  );

  /**
   * Gönderiler AŞAĞI kayıyor. Ekran boyu kadar ötelemek listeyi tamamen
   * görünmez kılıyor; opaklık KULLANILMIYOR çünkü chrome da bu ağacın içinde
   * ve iki kez sönerdi.
   */
  const listSlideStyle = useAnimatedStyle(() => {
    /**
     * ⚠️ ÇEKMENİN YALNIZ *KAYBEDİLEN* PAYI GERİ VERİLİYOR.
     *
     * Eşik geçildiği an `scrollEnabled` kapanıyor ve iOS süren sürüklemeyi
     * iptal ediyor. Ama NASIL iptal ettiği garanti değil: içeriği aynı karede
     * 0'a snap'leyebiliyor da, lastiği kendi süresinde geri yaylandırabiliyor
     * da. İlk sürümde açılış anındaki pay KOŞULSUZ ekleniyordu ve bu ikinci
     * durumda ZIPLAMA üretiyordu — lastik hâlâ gönderileri 92pt aşağıda
     * tutarken telafi de 92pt ekliyor, yani gönderiler bir anda iki kat aşağı
     * düşüyordu.
     *
     * Doğru hesap "layout şu an ne kadarını veriyor" sorusunu sormak:
     *
     *     eksik = max(dondurulmuş_pay − canlı_offset, 0)
     *
     * Snap olursa `canlı` aynı karede 0 olur ve eksik tam payı kapatır;
     * yaylanma olursa eksik onunla birlikte BÜYÜR. İki yolda da ekrandaki
     * konum kesintisiz.
     *
     * ⚠️ `(1 - ilerleme)` İLE ÇARPILMIYOR: yaylanma animasyonun ortasında
     * biterse (ör. ilerleme 0.8) çarpan telafinin büyük kısmını yutar ve tam o
     * anda bir sıçrama doğar. Çarpansız fazlalık yalnız gönderileri ekranın
     * dışında bir miktar daha aşağıda bırakıyor — görünmeyen bir bedel.
     */
    const frozenPx = mapPullFrozen.value * MAP_PULL_EXPAND_PX;
    const livePx = Math.max(-feedScrollY.value, 0);
    const missing = Math.max(frozenPx - livePx, 0);
    return {
      transform: [{ translateY: mapProgress.value * windowHeight + missing }],
    };
  });

  /**
   * Chrome'un ötelemesi — İKİ İŞ ÜST ÜSTE:
   *
   *  1. YAPIŞMA (scroll). Başlık ve pill satırı, ilk gönderi pill'lerin altına
   *     VARANA KADAR ekranda duruyor; o noktadan sonra listeyle birlikte yukarı
   *     çıkıyor. Chrome listenin BAŞLIĞI, yani normalde içerikle birlikte
   *     kayıyor — yerinde durması için scroll'un TAM TERSİ kadar geri
   *     ötelenmesi gerekiyor (`+feedScrollY`).
   *
   *     Yapışma mesafesi = FEED_MAP_BAND_HEIGHT, yani pill'lerin altındaki açık
   *     harita bandı. O bant tükendiğinde ilk kart pill satırının `PILL_ROW_GAP`
   *     kadar altına gelmiş oluyor (bloklar arası tasarlanan nefes) ve öteleme
   *     sabitlendiği için chrome oradan sonra kartlarla aynı hızda çıkıyor —
   *     kart chrome'u asla yakalamıyor, yani üst üste binme yok.
   *
   *     ⚠️ ALT SINIR YOK, bilerek: YUKARIDAN AŞAĞI ÇEKERKEN (negatif offset)
   *     chrome yine YERİNDE DURUYOR. Öteleme o aralıkta negatif oluyor ve
   *     listenin aşağı esnemesini birebir iptal ediyor; aşağı inen tek şey
   *     gönderiler, başlık ile pill satırı kıpırdamıyor (istek). Alt sınır 0
   *     olsaydı chrome de aşağı esner, yani "sayfanın tamamı aşağı kayıyor"
   *     görüntüsü çıkardı.
   *
   *     Yenileme çarkı da bu yüzden kendi yerini biliyor: pill'lerin altı
   *     çekme boyunca sabit kaldığı için `refreshOffset` sabit bir sayı
   *     (bkz. FeedListPage > refreshOffset).
   *
   *  2. TAM EKRAN HARİTA. Chrome ekranın tepesinden tamamen çıkıyor. ⚠️ Öteleme
   *     listenin ötelemesini de İPTAL etmek zorunda: chrome listenin çocuğu,
   *     yani iki transform üst üste biniyor. Net konum = liste(+H) + chrome(−H −
   *     kalkış) = −kalkış. Kalkış = üst pay + chrome yüksekliği.
   *
   * ⚠️ İKİSİ ÇARPIŞIYOR, o yüzden yapışma `(1 − ilerleme)` ile sönüyor:
   * kullanıcı KAYDIRMIŞKEN haritayı açarsa chrome yapışma payı (en fazla 120)
   * kadar aşağıda kalır ve ekranın tepesinde asılı kalan bir başlık görünürdü.
   */
  const chromeSlideStyle = useAnimatedStyle(() => {
    const lift = listTopPadding + chromeHeight;
    const stick = Math.min(feedScrollY.value, FEED_MAP_BAND_HEIGHT);
    /**
     * 3. ÇEKMEYE BAĞLI ÖN ÇIKIŞ (istek). Parmak aşağı çekerken chrome yukarı
     * doğru yola çıkıyor: oran `mapPull`dan, mesafe kendi çıkışının
     * `MAP_PULL_SHARE` kadarı. Donmuş/canlı ayrımı o değerin içinde.
     */
    const pullLift = mapPull.value * lift * MAP_PULL_SHARE;
    return {
      transform: [
        {
          translateY:
            (stick - pullLift) * (1 - mapProgress.value) -
            mapProgress.value * (windowHeight + lift),
        },
      ],
    };
  });

  /**
   * Sekme şeridi de YUKARI kayıyor — X ile aynı köşeyi paylaşıyorlar (ikisi de
   * solda), üst üste binerlerdi. Opaklık yok: şerit progressive blur taşıyor
   * ve blur'u opaklıkla söndürmek titreme üretiyor.
   */
  /**
   * Üst chrome'un (başlık + Plus pill'i) sönmesi — gerekçe `mapChromeFade`de.
   */
  const mapChromeFadeStyle = useAnimatedStyle(() => ({
    opacity: mapChromeFade.value,
  }));

  const headerSlideStyle = useAnimatedStyle(() => ({
    // Kalkış = listenin üst payı, yani şeridin bandının tamamı.
    //
    // ⚠️ `mapDrive`, `mapProgress` DEĞİL: akış/Gönderilerim sekmeleri de
    // ÇEKMEYE BAĞLI yukarı gidiyor (istek). Şerit listenin DIŞINDA, yani
    // lastikten etkilenmiyor — chrome'daki iptal terimi burada gerekmiyor.
    transform: [{ translateY: -mapDrive.value * listTopPadding }],
  }));

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
   * Yalnız AKIŞ sekmesinde: Gönderilerim kampüs filtresi taşımıyor, harita da
   * bir kampüs göstergesi.
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
      pullProgress={mapPull}
      heroHeight={
        // ⚠️ Bant AYRICA ekleniyor: ölçülen blok artık yalnız başlık + pill
        // satırı (bant yapışan bloğun dışına çıktı, gerekçe listHeader'da).
        chromeHeight > 0
          ? listTopPadding + chromeHeight + FEED_MAP_BAND_HEIGHT
          : 0
      }
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
       * Poligonu olmayan kampüslerde (sunucuda hâlâ 25 tane) diorama duruyor —
       * orada çizilecek bir sınır yok.
       *
       * ⚠️ SINIR `campus.boundary`DEN DEĞİL `mapBoundaryQuery`DEN: ilki her
       * zaman kullanıcının KENDİ kampüsünün ve haritaya verildiğinde kadrajı
       * seçili kampüsten koparıyor (uzun gerekçe `mapBoundaryQuery`de).
       */
      boundary={mapBoundaryQuery.data ?? null}
    />
  );

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
              {/* PİLL'LERLE İLK GÖNDERİ ARASINDAKİ BOŞLUK — haritanın açıkta
                  kaldığı bant (istek) ve TAM EKRAN HARİTAYI AÇAN BUTON.

                  ⚠️ BUTON BURADA, haritanın kendi katmanında DEĞİL. Katman
                  listenin arkasında; oraya konan dokunma hedefi hiç
                  tetiklenmiyor çünkü liste (ScrollView) ekranın tamamını
                  kaplıyor ve iOS hit-test'i olayı kardeşe düşürmüyor (uzun
                  gerekçe FeedMapStrip'in başında). Dokunuşu zaten alan ağaç
                  liste, o yüzden buton listenin içindeki bu boşluk.

                  Görsel geri bildirim YOK (`pressed` kullanılmıyor): zemini
                  olmayan bir alanı söndürmek haritayı titretirdi, geri bildirim
                  zaten açılma animasyonunun kendisi.

                  ⚠️ YAPIŞAN BLOĞUN DIŞINDA, onun çocuğu DEĞİL. Chrome
                  yapışırken (bkz. chromeSlideStyle) çocuklarının hepsi scroll
                  kadar AŞAĞI ötelenir; bant içeride kalsaydı ilk kartın üstüne
                  biner ve zIndex yüzünden kartın üst satırındaki dokunuşları
                  (yazara git) yutardı. Dışarıda yerinde kalıyor; kartlar ondan
                  SONRA çizildiği için kaydırınca üstünü örtüyorlar, yani buton
                  yalnız bant GÖRÜNÜRKEN basılabiliyor — istenen de bu.

                  ⚠️ Chrome'un ÖLÇÜLEN yüksekliğine dahil DEĞİL artık →
                  `heroHeight` bandı AYRICA ekliyor (bkz. mapHero). */}
              <Pressable
                onPress={expandMap}
                accessibilityRole="button"
                accessibilityLabel={campusLabel ?? t("feed.university.own")}
                accessibilityHint={t("feed.map.expandHint")}
                style={{ height: FEED_MAP_BAND_HEIGHT }}
              />
            </>
          )
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }}
        /**
         * AKIŞTA PULL-TO-REFRESH YOK (istek) — çekmek HARİTAYI AÇIYOR.
         *
         * Aynı jest iki işi birden yapamaz: aşağı çekerken gönderiler iniyor,
         * başlık ve pill satırı yerinde duruyor (bkz. chromeSlideStyle) ve
         * açılan boşluktan harita görünüyor — yani jestin kendisi zaten
         * "haritayı aç" diyor. Çarkın orada belirmesi o okunuşu bozuyordu.
         * Eşiği geçince tam ekran harita açılıyor (bkz. pullExpandReaction).
         *
         * ⚠️ AKIŞ ARTIK ELLE YENİLENMİYOR ve bu bilinçli bir takas. Tazelik üç
         * yoldan geliyor: sekmeye her dönüşte `visited` sorgusu, push/SignalR
         * köprüsü (FEED_DIRTY_EVENT) ve 30sn'lik tazelik penceresi. Gönderilerim
         * sayfasında çark DURUYOR — orada harita yok, jest de boşa gidiyordu.
         */
        onRefresh={
          isMine
            ? () => {
                // `refetch()` DEĞİL... (aşağıdaki not) — burada tek sayfaya
                // dönmek doğrusu, kullanıcının "yukarı çekme"den anladığı da bu.
                query.refetch?.();
                meQuery.refetch?.();
              }
            : undefined
        }
        refreshing={
          isMine ? query.isRefetching && !query.isFetchingNextPage : false
        }
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AnimatedPagerView
        ref={pagerRef}
        style={{ flex: 1 }}
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
        {PAGES.map((key) => (
          <View key={key} style={{ flex: 1 }} collapsable={false}>
            {/* HARİTA ZEMİNİ — listeden ÖNCE, yani ARKASINDA. Sıra bilinçli:
                harita (sabit) < liste içeriği (kayan, kartlar opak) < sekme
                şeridi. Kaydırırken harita yerinde kalıyor, gönderiler
                üstünden akıyor. Gerekçenin tamamı FeedMapStrip'in başında.

                ⚠️ PAGER'IN DIŞINA DEĞİL, SAYFANIN İÇİNE konuyor. Pager
                ekranın kökünde kardeş olarak da çizilebilirdi ama iOS'ta
                `AnimatedPagerView` native bir sayfa denetleyicisi ve KENDİ
                zeminini taşıyor — arkasına konulan katmanı örtme riski var.
                Sayfanın içinde o risk yok: kap şeffaf bir `View`. */}
            {key === "feed" ? mapHero : null}
            {/* Liste tam ekran harita hâlinde AŞAĞI kayıyor. Sarmalayıcı
                yalnız akış sayfasında animasyonlu: Gönderilerim'de harita yok,
                orada transform kimliksel kalmalı. */}
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
          centerSlot={
            // ⚠️ `width: "100%"` sarmalayıcı ZORUNLU: slot'un alignItems'ı
            // içeriğe göre daraltıyor, şerit o zaman ortada sıkışıyor.
            <View style={{ width: "100%" }}>
              <PagerTabBar
                tabs={tabs}
                activeTab={activeTab}
                offset={pagerOffset}
                onPress={handleTabChange}
                // ORTALANMIYOR — Mesajlar ve Beğeniler ekranlarındaki kurulumun
                // aynısı: şerit tam genişlikte duruyor ve sayfanın büyük
                // başlığıyla AYNI sol hattan (HEADER_LEFT_INSET) başlıyor.
                // Ortalanmış şerit başlıkla iki ayrı sol kenar veriyordu.
                inset={HEADER_LEFT_INSET}
              />
            </View>
          }
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
          />
          <CampusMapScrim
            progress={mapChromeFade}
            edge="bottom"
            /**
             * ŞERİDİN TAMAMI + kuyruk: perde kutuların ÜSTÜNE kadar çıkıyor,
             * çünkü başlık artık orada duruyor (istek). Tarihçe ve "levha"
             * uyarısı `campusStripScrimHeight`te.
             */
            height={campusStripScrimHeight(windowHeight, insets.bottom)}
            /**
             * ⚠️ SÖNÜM KISA (istek: "blur başlığa kadar gelsin"). Varsayılan
             * reçete bandın YARISINDA sönüyor; 430pt'lik bir bantta bu, sönümün
             * kutuların ortasında başlaması ve başlığın hizasında alfanın
             * ~0.05'e düşmesi demek — perde fiilen başlığa varmıyordu. Sönüm
             * artık başlığın ÜSTÜNDEKİ kuyruğa sığıyor (gerekçe sabitin
             * yanında), yani başlık ve kutular perdenin dolu kısmında.
             */
            fadePx={CAMPUS_STRIP_SCRIM_FADE}
          />
        </>
      ) : null}

      {/* TAM EKRAN HARİTADAN ÇIKIŞ — sol üstte yuvarlak cam X.
          ⚠️ ANİMASYON YOK ve bu bilinçli: buton SwiftUI cam butonu, ata
          zincirinde kimliksel olmayan transform ya da opacity<1 gören cam
          sessizce HİÇ render edilmiyor (proje notu: "tekrar denemek çare
          değil"). Giriş anında mount, çıkışta animasyon bittikten sonra
          unmount — ölçek/opaklıkla belirtilse efekt büyük olasılıkla hiç
          çizilmezdi.
          Konum sekme şeridinin SOL hattıyla aynı: şerit yukarı kayıp yerini
          buna bırakıyor. */}
      {/**
       * ⚠️ MOUNT EŞİKTE DEĞİL, AÇILIŞ BİTTİKTEN SONRA.
       *
       * Bu satırdaki X bir SwiftUI cam butonu, yani mount'u bir native
       * `Host`/`RNHostView` kurulumu demek — pahalı ve ilk kullanımda daha da
       * pahalı (proje notu). Eşik geçildiği karede zaten dört setState, bir
       * `withTiming` ve `scrollEnabled` değişimi var; cam butonun kurulumu da
       * aynı kareye düşünce parmak altında gözle görülür bir TAKILMA oluyordu
       * (şikâyet birebir buydu).
       *
       * Kapı `mapChromeReady` ile açılıyor (haritanın hareketi kadar sonra,
       * bkz. oradaki zamanlayıcı notu) — butonun giriş animasyonu zaten yok,
       * yani 280ms sonra belirmesi hareketi bozmuyor.
       *
       * ⚠️ `|| !mapExpanded` KAPANIŞ İÇİN: `mapChromeReady` kapanış BİTİNCE
       * düşüyor ama mantıksal durum kapanışın BAŞINDA düşüyor; ikinci koşul
       * olmasa satır kapanış boyunca ekranda kalır mı kalmaz mı sorusu
       * `mapChromeReady`ye kalırdı. Bu hâliyle satır kapanış BİTENE kadar
       * (yani `mapChromeMounted` sönene kadar) ekranda kalıyor ve başlık o
       * sırada yavaşça sönüyor.
       */}
      {mapChromeMounted && (mapChromeReady || !mapExpanded) ? (
        <View
          // ⚠️ SATIR: X, başlık ve pill AYNI merkezde (Keşif şeridindeki
          // kural). Kabuk `box-none`: kendisi dokunuş yakalamıyor, içindeki
          // kontroller yakalıyor — tam genişlikte bir kap haritanın üstünde
          // duran her dokunuşu yutardı.
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + CAMPUS_MAP_CHROME_TOP,
            left: HEADER_LEFT_INSET,
            right: HEADER_LEFT_INSET,
            height: CAMPUS_MAP_CHROME_ROW,
            justifyContent: "center",
          }}
        >
          {/* ETİKET EKRANIN ORTASINDA (istek), X'in yanında DEĞİL.
              ⚠️ MUTLAK VE KONTROLLERDEN ÖNCE: Keşif başlığındaki kalıbın
              aynısı — ortalanmış öğe satırın akışına girerse X ve pill'in
              genişliği onu merkezden kaydırıyor; önce yazılması da sonraki
              kardeşlerin (butonların) dokunma alanını üstte tutuyor. */}
          {campus.available ? (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  alignItems: "center",
                },
                mapChromeFadeStyle,
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
            {/* ⚠️ CAM X SÖNEN KABIN DIŞINDA ve öyle kalmak zorunda: ata
                zincirinde opacity<1 gören SwiftUI camı sessizce hiç
                çizilmiyor (proje notu). Buton sönümün BAŞLADIĞI anda mount,
                kapanış BİTİNCE unmount ediliyor — yani başlıkla aynı pencerede
                beliriyor/gidiyor ama kendisi sönmüyor. */}
            <DiscoverHeaderGlassButton
              systemName="xmark"
              fallback={X}
              onPress={collapseMap}
              label={t("common.close")}
            />

            {/* SAĞDAKİ PLUS PILL'İ — BAŞLIKLA AYNI SÖNÜMDE (istek: "headerdaki
                buton da header'la beraber yok olup gelsin"). Pill düz RN, yani
                camın kuralı onu bağlamıyor; kendi sönen kabında duruyor.
                ⚠️ Yalnız Plus DEĞİLSE. Reçete LikesScreen'in başlık
                pill'inden: yarıçap 999, dolgu modun aksanı, mürekkep
                `onMediaInverse`, 13/700 — iki ekranda iki ayrı pill dili
                olmasının sebebi yok.
                ⚠️ `premiumResolved` kapısı `showPlusUpsell`in içinde:
                abonelik slice'ı persist edilmediği için reload'da premium
                kullanıcı bir an `isPremium:false` doğuyor ve pill çizilip
                hemen kaybolurdu. */}
            {showPlusUpsell ? (
              <Animated.View style={mapChromeFadeStyle}>
                <AnimatedPressable
                  pressScale={0.96}
                  onPress={openPaywall}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    borderCurve: "continuous",
                    backgroundColor: modeAccent(selectedMode),
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
                    {t("feed.header.plusAction")}
                  </Text>
                </AnimatedPressable>
              </Animated.View>
            ) : null}
          </View>
        </View>
      ) : null}

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
          actionsReady={mapActionsReady}
          mode={selectedMode}
          moments={campus.moments}
          // Başlık şeridin TEPESİNDE — "7 an · Kampüs Adı" (bkz.
          // CampusMapTitle'daki tarihçe); üstteki chrome yalnız "Anlar".
          campusLabel={campusLabel}
          loading={campus.loading}
          // "+" kutusu ÖLÜ ÇİZİLMİYOR: kampüs dışındaysa ya da bugün
          // paylaşmışsa kutu hiç yok (eski sağ üst cam butonundaki aynı kural).
          canShare={campus.canShare}
          // Artı kutusu yokken SEBEBİ ilk dolgu kutusunda yazıyor — kaldırılan
          // boş durumun tek işi buydu (bkz. CampusMomentsStrip > pinnedInfoKey).
          isInsideCampus={campus.inside}
          onShare={campus.openSourceSheet}
          onLike={campus.like}
          onPass={campus.pass}
          onRemove={campus.remove}
          onEndReached={campus.fetchNextPage}
          busyMomentId={campus.busyMomentId}
        />
      ) : null}

      {/* ⚠️ Kaynak seçimi: aksiyon sheet KAPANDIKTAN SONRA tetikleniyor
          (PhotoSourceSheet'in kendi kuralı — gorhom kapanırken PHPicker sunmak
          iOS'ta "already presenting" no-op'una düşüyor). */}
      <PhotoSourceSheet
        visible={campus.sourceSheetOpen}
        onClose={campus.closeSourceSheet}
        onCamera={campus.pickFromCamera}
        onGallery={campus.pickFromGallery}
      />

      <CampusMomentComposer
        visible={campus.composerOpen}
        onClose={campus.closeComposer}
        photoUri={campus.photoUri}
        mode={selectedMode}
        sharing={campus.sharing}
        errorText={campus.shareError}
        onShare={campus.share}
      />

      {/* "Her zaman" konum izni — İLK PAYLAŞIMDAN SONRA bir kez soruluyor
          (gerekçe useCampusSurface > share). Kapatılabilir: izin olmadan da
          özellik çalışıyor, yalnız bildirim gelmiyor. */}
      <CampusAlwaysPrimingSheet
        visible={campus.primingOpen}
        onClose={campus.closePriming}
        onGranted={campus.onPrimingGranted}
      />

      {/* "Paylaş" FAB — pager'ın DIŞINDA (sayfalarla kaymasın) ve yalnız Akış
          ile Gönderilerim sayfalarında. Yanıtlar sayfasında paylaşmak bağlamsız
          olurdu.
          ⚠️ Gizleme OPACITY ile değil koşullu render ile: cam/blur yüzeylerde
          ata zincirindeki opacity<1 efekti tamamen öldürüyor (bkz. proje notu).
          `composeGate` "unknown" iken buton NORMAL çiziliyor — kilit çizmek
          /me gelene kadar olmayan bir kısıt uydururdu. */}
      {/* ⚠️ `!mapChromeMounted`: tam ekran haritada FAB çizilmemeli — kampüs
          anları sheet'i oraya açılıyor ve ikisi üst üste biniyor. Gizleme
          KOŞULLU RENDER ile (opacity ile değil, aynı cam kuralı).
          Mantıksal durum DEĞİL geciken kapı okunuyor: mantıksal durum kapanışın
          BAŞINDA düşüyor, FAB o anda belirse kapanış animasyonu boyunca
          sheet'in üstünde dururdu. */}
      {gate.kind !== "restricted" && !mapChromeMounted ? (
        <Pressable
          onPress={openComposer}
          // ETİKET KALDIRILDI (istek) → kapsül artık YUVARLAK bir buton.
          // `paddingHorizontal` yerine `width: height` ve `borderRadius: 999`:
          // yatay pay bırakılsa daire değil hap biçiminde kalırdı.
          accessibilityRole="button"
          // Yazı gidince buton ne yaptığını kendi söylemiyor — erişilebilirlik
          // etiketi ZORUNLU, yoksa ekran okuyucuda isimsiz bir düğme kalıyor.
          accessibilityLabel={t("feed.empty.cta")}
          style={{
            position: "absolute",
            right: 16,
            // 92 = tab bar + nefes payı.
            bottom: 92,
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: colors.inverseSurface,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          {/* ⚠️ GLİFİN DIŞ KUTUSU AÇIK: Pressable'ın `alignItems/justifyContent`
              center'ı tek başına yetmiyor. SFIcon native bir sembol çiziyor ve
              o görünümün doğal ölçüsü `size`la birebir aynı değil; dairenin
              ortası ikonun gerçek kutusuna göre hesaplanınca glif birkaç pt
              kayıyor (bakiye rozetindeki aynı tuzak, bkz. FeedQuotaBadge).
              Sabit kare kutu + içinde ortalama glifi bilinen bir eksene
              oturtuyor.
              17 → 22: glif etiketin yanında küçük bir işaretti, şimdi butonun
              TEK içeriği — 52'lik dairede 17 kaybolup gidiyordu. */}
          <View
            style={{
              width: FAB_GLYPH,
              height: FAB_GLYPH,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SFIcon
              name="square.and.pencil"
              fallback={LayoutList}
              size={FAB_GLYPH}
              color={colors.onInverseSurface}
              strokeWidth={2}
            />
          </View>
        </Pressable>
      ) : null}

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
          Normal gönderinin yazarına dokunulunca profil kartı açılıyor. İKİ
          AYRI MODAL, çünkü iki ayrı ürün durumu var:

          (a) AKSİYON ALINABİLİYOR (`cardMode` dolu) → `LikerSwipeModal`:
              aksiyonlar o modda. HANGİLERİ olduğu moda bağlı (istek, bkz.
              feedCardActions): ARKADAŞ'ta hepsi serbest (beğeni · Spark · not),
              FLÖRT'te düz beğeni YOK — sinyal ya Fire ya not. Eşleşme kanalı
              artık bu — yanıt butonunun yerini aldı.

          (b) ALINAMIYOR (`cardMode` null: sunucu hiçbir modu uygun görmedi ya
              da alanı hiç göndermedi) → `PreviewModal`, salt okunur. Olmayan
              bir hakkı varsayıp reddedilecek bir buton göstermek, kullanıcıya
              iki kez kaybettirirdi.

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
          // Akış kartında Fire ANLAMLI: karşı tarafın seni beğenip
          // beğenmediğini bilmiyorsun ("seni beğenenler"de anlamsızdı).
          allowFire={cardActions.fire}
          // FLÖRT'TE DÜZ BEĞENİ YOK (istek): tik ne kapakta ne panelin dibinde
          // çiziliyor, X (geç) ve moderasyon duruyor. Arkadaş'ta açık.
          allowLike={cardActions.like}
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
        onSend={handleSendAuthorNote}
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
        targetName={noteRequest?.profile?.displayName ?? null}
        remaining={notesRemaining}
        maxLength={statsQuery.data?.noteMaxLength ?? null}
        sending={noteMutation.isPending}
        errorText={noteError}
        // Kartın modu — seçili mod DEĞİL. Not hangi modda GİDİYORSA buton o
        // rengi alır; mutasyona geçen değerin aynısı (bkz. handleSendAuthorNote
        // > `mode: cardMode ?? undefined`), böylece renk ile gönderilen mod tek
        // kaynaktan geliyor. `null` → prop varsayılanı (Dating).
        mode={cardMode ?? undefined}
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
