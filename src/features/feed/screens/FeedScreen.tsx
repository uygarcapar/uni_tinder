import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type PagerView from "react-native-pager-view";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import PagerTabBar, {
  AnimatedPagerView,
  usePagerScrollHandler,
  usePagerTabCommit,
} from "@/shared/components/PagerTabBar";
import ScreenHeader from "@/shared/components/ScreenHeader";
import EmptyState from "@/shared/components/EmptyState";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { LayoutList } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import uiBus from "@/shared/services/uiBus";
import { navigationRef } from "@/shared/services/navigationRef";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { decrementPendingFeedReply } from "@/features/discover/swipeSlice";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import PreviewModal from "@/features/profile/components/PreviewModal";
import FilterPills from "@/shared/components/FilterPills";
import {
  resolveLocalized,
  useUniversities,
} from "@/shared/queries/commonQueries";
import FeedFilterSheet, {
  type FeedFilterValue,
} from "../components/FeedFilterSheet";
import FeedUniversitySheet from "../components/FeedUniversitySheet";
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
} from "../components/FeedListPage";
import FeedPostCard from "../components/FeedPostCard";
import FeedReplyCard from "../components/FeedReplyCard";
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
import { useQueryClient } from "@tanstack/react-query";
import { FEED_CODES, feedCodeI18nKey } from "@/shared/constants/responseCodes";
import { showInfoToast } from "@/shared/services/toaster";
import { analytics } from "@/shared/services/analytics";
import { usePremiumTier } from "@/features/profile/premiumTier";
import FeedComposerSheet from "../components/FeedComposerSheet";
import FeedQuotaSheet from "../components/FeedQuotaSheet";
import FeedSupportSheet from "../components/FeedSupportSheet";
import FeedReplyComposerSheet from "../components/FeedReplyComposerSheet";
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
  useAcceptReply,
  useDismissReply,
  useFeedMe,
  useFeedPosts,
  useMyFeedPosts,
  useOwnFeedAvatar,
  useReceivedReplies,
  useTogglePostLike,
} from "../feedQueries";
import {
  anonymousGate,
  composeGate,
  kindFilterGate,
  postPresentation,
  replyGate,
  universityPickerGate,
} from "../feedPolicy";
import { useFeedAuthorProfile, useFeedReplierProfile } from "../feedQueries";
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

const PAGES: FeedPageKey[] = ["feed", "mine", "replies"];

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
}: {
  title: string;
  description: string;
  actionLabel: string | null;
  onActionPress: (() => void) | null;
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
          // Dolgu/mürekkep Mesajlar ve Beğeniler'deki pill'le AYNI (litPlus +
          // onMediaInverse): uygulamada "bu premium'a bakıyor" dili tek. Yazı
          // `text` olamaz — açık modda beyaza döner ve dolgunun üstünde
          // kaybolur.
          <AnimatedPressable
            pressScale={0.96}
            onPress={onActionPress}
            accessibilityRole="button"
            hitSlop={8}
            style={{
              flexShrink: 0,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.litPlus,
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
          color: colors.textSecondary,
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
   * Sayfanın sorgusu sekmeye BİR KEZ girildiyse açılıyor. Bayrak sekmeye
   * BASILDIĞINDA çevriliyor, `activeTab` değişiminde değil: state pager
   * oturunca dönüyor (usePagerTabCommit) ve ona bağlı kalınsaydı sayfa önce
   * boş kayıp gelir, yerine oturduktan sonra iskelet belirirdi.
   */
  const [visited, setVisited] = useState<Record<FeedPageKey, boolean>>(() => ({
    feed: true, // ilk sayfa her halükârda açılıyor
    mine: initialRequest === "mine",
    replies: initialRequest === "replies",
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
  const repliesQuery = useReceivedReplies({ enabled: visited.replies });

  /**
   * Kendi ana fotoğrafım — sunucu kendi gönderimin avatarını boş bırakıyor
   * (gerekçe: feedQueries > useOwnFeedAvatar). EKRAN DÜZEYİNDE bir kez, karta
   * prop olarak iniyor: satır başına bir hook, listedeki her gönderiyi aynı
   * sorgunun abonesi yapardı.
   */
  const ownPhotoUrl = useOwnFeedAvatar();

  const toggleLike = useTogglePostLike();
  const acceptReply = useAcceptReply();
  const dismissReply = useDismissReply();

  const posts = postsQuery.data?.items ?? [];
  const minePosts = minePostsQuery.data?.items ?? [];
  const replies = repliesQuery.data?.items ?? [];

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
      uiBus.on(FEED_OPEN_EVENT, () => {
        const want = consumeFeedRequest();
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
          if (i === FEED_PAGE_RETRY_MS.length - 1) pageRequestRef.current = null;
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
  useEffect(
    () =>
      uiBus.on(FEED_REPLIES_DIRTY_EVENT, () => {
        repliesQuery.refetch?.();
      }),
    [repliesQuery],
  );

  // ── Sekme şeridi ──────────────────────────────────────────────────────────
  const replyTotal = repliesQuery.data?.total;
  const tabs = useMemo(
    () => [
      { key: "feed", label: t("feed.tabFeed"), count: null },
      { key: "mine", label: t("feed.tabMine"), count: null },
      {
        key: "replies",
        label: t("feed.tabReplies"),
        // Sekmeye hiç girilmediyse sayı BİLİNMİYOR → `null`; pill onu çizmiyor,
        // "0" yazmıyor (LikesScreen'in missedTotal kuralı).
        count: visited.replies ? (replyTotal ?? null) : null,
      },
    ],
    [t, visited.replies, replyTotal],
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

  const handleAccept = useCallback(
    (reply: FeedReceivedReplyDto) => {
      acceptReply.mutate(
        { replyId: reply.replyId },
        {
          onSuccess: (res) => {
            analytics.capture("feed_reply_accepted", {
              is_new_match: res.isNewMatch,
            });
            // Rozet ANINDA düşsün (removeWhoLikedMe mantığı).
            dispatch(decrementPendingFeedReply());
            // Yeni eşleşmede global MatchModal SignalR'dan zaten açılıyor —
            // buradan ikinci bir modal açmak çift gösterim olurdu. Yalnız
            // "zaten eşleşmiştik" dalında doğrudan sohbete gidiliyor.
            if (!res.isNewMatch && res.conversationId) {
              handleOpenChat(res.conversationId);
            }
          },
        },
      );
    },
    [acceptReply, dispatch, handleOpenChat],
  );

  const handleDismiss = useCallback(
    (reply: FeedReceivedReplyDto) => {
      analytics.capture("feed_reply_dismissed");
      dispatch(decrementPendingFeedReply());
      dismissReply.mutate({ replyId: reply.replyId });
    },
    [dismissReply, dispatch],
  );

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
  const [replierTarget, setReplierTarget] =
    useState<FeedReceivedReplyDto | null>(null);
  const replierProfile = useFeedReplierProfile(replierTarget?.replyId ?? null);
  const handleReplyPress = useCallback(
    (reply: FeedReceivedReplyDto) => setReplierTarget(reply),
    [],
  );
  const handleReplyDecide = useCallback(
    (direction: "left" | "right") => {
      const reply = replierTarget;
      if (!reply) return;
      if (direction === "right") handleAccept(reply);
      else handleDismiss(reply);
    },
    [replierTarget, handleAccept, handleDismiss],
  );

  const goToReplies = useCallback(() => {
    handleTabChange("replies", FEED_PAGE_INDEX.replies);
  }, [handleTabChange]);

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
    (body: string, isAnonymous: boolean) => {
      setComposerError(null);
      createPost.mutate(
        { body, isAnonymous },
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
              serverMessage ??
                t(feedCodeI18nKey(code) ?? "feed.codes.generic"),
            );
          },
        },
      );
    },
    [createPost, t, handleTabChange, meQuery, openPaywall],
  );

  // ── Yanıt verme ───────────────────────────────────────────────────────────
  const createReply = useCreateReply();
  const [replyTarget, setReplyTarget] = useState<FeedPostDto | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const handleOpenReply = useCallback(
    (post: FeedPostDto) => {
      // Yanıt hakkı bittiyse composer AÇILMIYOR: yazdırıp sonra UT-7322 ile
      // geri almak, kullanıcıya iki kez kaybettirmek olurdu.
      const gate = replyGate(me);
      if (gate.kind === "quotaExhausted") {
        setQuotaSheet({ visible: true, nextResetAt: gate.nextResetAt });
        return;
      }
      if (gate.kind === "restricted") return;
      setReplyError(null);
      setReplyTarget(post);
    },
    [me],
  );

  const handleSendReply = useCallback(
    (comment: string) => {
      const post = replyTarget;
      if (!post) return;
      setReplyError(null);
      createReply.mutate(
        { postId: post.id, comment },
        {
          onSuccess: (result) => {
            setReplyTarget(null);
            if (result.supportResources) {
              setSupportVisible(true);
              return;
            }
            analytics.capture("feed_reply_sent", { status: result.status });
            showInfoToast({
              message: t(
                result.status === "PendingReview"
                  ? "feed.reply.pending"
                  : "feed.reply.sent",
              ),
            });
          },
          onError: (e) => {
            const code = feedErrorCode(e);
            const serverMessage = feedErrorMessage(e);
            const result = feedErrorResult(e);

            if (code === FEED_CODES.REPLY_QUOTA) {
              setReplyTarget(null);
              writeFeedQuotaExhausted(qc, "reply", result?.nextResetAt ?? null);
              setQuotaSheet({
                visible: true,
                nextResetAt: result?.nextResetAt ?? null,
              });
              return;
            }

            // Kart bayat: zaten yanıtlanmış / zaten eşleşilmiş / tercih
            // uyuşmuyor / gönderi gitmiş. Mutation cache'i ZATEN düzeltiyor
            // (useCreateReply.onError), burada yalnız sheet kapanıp durum
            // anlatılıyor — kullanıcı aynı karta tekrar yüklenmesin.
            if (
              code === FEED_CODES.ALREADY_REPLIED ||
              code === FEED_CODES.ALREADY_MATCHED ||
              code === FEED_CODES.PREFERENCE_MISMATCH ||
              code === FEED_CODES.POST_GONE
            ) {
              setReplyTarget(null);
              showInfoToast({
                message:
                  serverMessage ?? t(feedCodeI18nKey(code) ?? "feed.codes.generic"),
              });
              // "Zaten eşleştiniz" → sohbete götür (sözleşme §9).
              if (code === FEED_CODES.ALREADY_MATCHED) {
                handleOpenChat(result?.conversationId ?? null);
              }
              return;
            }

            if (code === FEED_CODES.REPLY_UNIVERSITY_REQUIRES_PLUS) {
              setReplyTarget(null);
              openPaywall();
              return;
            }

            // Geri kalan (UT-7306 içerik reddi, UT-7321 uzunluk, UT-7316 fren,
            // ağ) → sheet AÇIK kalır, metin korunur.
            setReplyError(
              serverMessage ?? t(feedCodeI18nKey(code) ?? "feed.codes.generic"),
            );
          },
        },
      );
    },
    [replyTarget, createReply, qc, t, handleOpenChat, openPaywall],
  );

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
  const authorProfile = useFeedAuthorProfile(previewPostId);

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
      analytics.capture("feed_filter_changed", {
        sort: next.sort,
        interest: next.interest,
        kind: next.kind,
      });
      applyParams({ ...listParams, ...next });
    },
    [applyParams, listParams],
  );

  const handleSelectUniversity = useCallback(
    (domain: string | null) => applyParams({ ...listParams, university: domain }),
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

  const filterPills = useMemo(() => {
    // Gösterilen kampüs: Plus seçimi varsa o, yoksa kullanıcının KENDİ
    // kampüsü (/api/feed/me yalnız domain veriyor, adı listeden çözüyoruz).
    const domain = listParams.university ?? me?.universityDomain ?? null;
    // Ad çözülemediyse (liste henüz gelmedi ya da domain listede yok)
    // domain'in kendisi, o da yoksa eski "Kendi kampüsüm" metni. Boş pill
    // çizmektense ham domain göstermek yeğ.
    const campusLabel = domain
      ? (universityNameByDomain.get(domain) ?? domain)
      : t("feed.university.own");
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
        key: "filter",
        label: t("feed.filter.title"),
        // Varsayılandan sapan filtre sayısı; 0 ise pill sayı çizmiyor.
        count: activeFilterCount(listParams),
      },
    ];
    // `universityGate` ARTIK BAĞIMLILIK DEĞİL: kilit rozeti kalkınca memo
    // kapının durumunu hiç okumuyor, listede tutmak kapı değiştiğinde üç
    // pill'i boşuna yeniden kurardı.
  }, [listParams, t, me?.universityDomain, universityNameByDomain]);

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
    const codes = [
      postsQuery.error,
      minePostsQuery.error,
      repliesQuery.error,
      meQuery.error,
    ].map(feedErrorCode);
    return codes.includes(FEED_CODES.DISABLED);
  }, [postsQuery.error, minePostsQuery.error, repliesQuery.error, meQuery.error]);

  const disabledEmpty = (
    <FeedEmptyWrap>
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
      key === "mine"
        ? t("feed.tabMine")
        : key === "replies"
          ? t("feed.tabReplies")
          : t("feed.tabFeed"),
    [t],
  );

  // Başlığın altındaki tek satır — Mesajlar'daki `tabDescriptionFor` ile aynı
  // görev: sayfanın ne listelediğini bir cümlede söylemek.
  const sectionDescriptionFor = useCallback(
    (key: FeedPageKey) =>
      key === "mine"
        ? t("feed.header.descMine")
        : key === "replies"
          ? t("feed.header.descReplies")
          : t("feed.header.descFeed"),
    [t],
  );

  // Başlığın SAĞINDAKİ pill — tek görevi Plus sayfasını açmak. Sekmeye göre
  // DEĞİŞMİYOR: üç sayfada da aynı günlük hak geçerli.
  // ⚠️ `resolved` kapısı ŞART (Mesajlar'daki aynı gerekçe): abonelik slice'ı
  // persist edilmediği için reload'da premium kullanıcı da bir an
  // `isPremium:false` doğuyor ve o pencerede pill çizilip hemen kaybolurdu —
  // premium'a premium satmak en pahalı yanılma yönü.
  const showPlusUpsell = premiumResolved && !isPremium;

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
      />
    );

    if (key === "replies") {
      const loading = repliesQuery.isLoading;
      return (
        <FeedListPage<FeedReceivedReplyDto>
          data={replies}
          isActive={isActive}
          scrollHandler={scrollHandler}
          loading={loading}
          showSkeleton={loading && skeletonReady}
          keyExtractor={(item) => item.replyId}
          renderItem={({ item }) => (
            // ⚠️ PAY FARKINI GERİ ALAN KAP. Yanıt kartı artık Beğeniler'in
            // foto kartı (bkz. FeedReplyCard) ve genişliği SABİT: ekran
            // genişliği − 2 × kendi payı (10). Akış listesi ise 16 pay
            // veriyor; kart o kabın içinde 16'dan başlayıp sağda 4'e
            // dayanıyordu, yani ekranda eğri duruyordu. Negatif marj farkı
            // (10 − 16) kapatıyor: kart iki yanında da 10 ile oturuyor,
            // sayfanın başlığı 16'lık hattında kalıyor.
            <View
              style={{
                marginHorizontal: LIKE_CARD_H_PADDING - FEED_LIST_H_PADDING,
              }}
            >
              <FeedReplyCard
                reply={item}
                onPress={handleReplyPress}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            </View>
          )}
          listHeader={title}
          onEndReached={() => {
            if (repliesQuery.hasNextPage && !repliesQuery.isFetchingNextPage) {
              repliesQuery.fetchNextPage();
            }
          }}
          empty={
            disabledError ? (
              disabledEmpty
            ) : (
              <FeedEmptyWrap>
                <EmptyState
                  sf="tray"
                  Icon={LayoutList}
                  text={t("feed.received.emptyTitle")}
                  subtitle={t("feed.received.emptyBody")}
                  topOffset={0}
                  // Boş durumun altındaki CTA — Mesajlar/Beğeniler
                  // ekranlarındaki pill'in aynısı (litPlus zemin,
                  // `onMediaInverse` mürekkep; `text` açık modda beyaza döner
                  // ve dolgunun üstünde kaybolur).
                  //
                  // BU SAYFADA ÖZELLİKLE GEREKLİ: "Paylaş" FAB'ı Yanıtlar
                  // sekmesinde çizilmiyor, yani boş durumun gövdesi ("Bir
                  // gönderi paylaş, kampüs sana yazsın") kullanıcıyı dokunacak
                  // hiçbir şeyin olmadığı bir işe yolluyordu.
                  //
                  // `restricted` iken GİZLİ: kapı kapalıyken `openComposer`
                  // sessizce hiçbir şey yapmıyor, yani buton ölü kalırdı
                  // (FAB'ın aynı kapısı). `quotaExhausted` ise gizlenmiyor —
                  // o dalda composer açılıyor ve hakkın bittiğini kendi
                  // rozetinde söylüyor (bkz. openComposer).
                  {...(gate.kind === "restricted"
                    ? null
                    : {
                        buttonLabel: t("feed.empty.cta"),
                        buttonLabelColor: colors.onMediaInverse,
                        onButtonPress: openComposer,
                      })}
                />
              </FeedEmptyWrap>
            )
          }
        />
      );
    }

    const isMine = key === "mine";
    const query = isMine ? minePostsQuery : postsQuery;
    const data = isMine ? minePosts : posts;
    const loading = query.isLoading;

    return (
      <FeedListPage<FeedPostDto>
        data={data}
        isActive={isActive}
        scrollHandler={scrollHandler}
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
            onReply={handleOpenReply}
            onReplyPaywall={openPaywall}
            onMenu={handlePostMenu}
            onPressReplyCount={isMine ? goToReplies : undefined}
            statusLabel={
              isMine ? statusLabelFor(item, t) : null
            }
            statusTone={isMine ? statusToneFor(item) : "neutral"}
          />
        )}
        // Büyük başlık HER sayfada; filtre satırı YALNIZ akış sayfasında ve
        // ikisi de LİSTENİN İÇİNDE: pager'ın dışına alınsaydı filtre
        // Gönderilerim/Yanıtlar sayfalarında da durur ve onlarla ilgisi olmayan
        // bir filtreyi ima ederdi. Liste başlığı olduğu için ikisi de sayfayla
        // birlikte native olarak kayıyor.
        listHeader={
          <>
            {title}
            {isMine ? null : filterRow}
          </>
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }}
        // Pull-to-refresh: `refetch()` DEĞİL. O, yüklü TÜM sayfaları çeker ve
        // popular/top'ta listeyi kullanıcının altında yeniden sıralar.
        // Doğrusu tek sayfaya dönmek — kullanıcının "yukarı çekme"den anladığı da bu.
        onRefresh={() => {
          query.refetch?.();
          if (isMine) meQuery.refetch?.();
        }}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        empty={
          disabledError ? (
            disabledEmpty
          ) : (
            <FeedEmptyWrap>
              <EmptyState
                sf="square.and.pencil"
                Icon={LayoutList}
                text={t(isMine ? "feed.mine.emptyTitle" : "feed.empty.title")}
                subtitle={t(isMine ? "feed.mine.emptyBody" : "feed.empty.body")}
                topOffset={0}
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
        initialPage={initialTabIndex}
        onPageScroll={pagerScrollHandler}
        onPageSelected={handlePageSelected}
        onPageScrollStateChanged={handlePageScrollStateChanged}
      >
        {PAGES.map((key) => (
          <View key={key} style={{ flex: 1 }} collapsable={false}>
            {renderPage(key)}
          </View>
        ))}
      </AnimatedPagerView>

      <ScreenHeader
        scrollY={scrollY}
        showLogo={false}
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

      {/* "Paylaş" FAB — pager'ın DIŞINDA (sayfalarla kaymasın) ve yalnız Akış
          ile Gönderilerim sayfalarında. Yanıtlar sayfasında paylaşmak bağlamsız
          olurdu.
          ⚠️ Gizleme OPACITY ile değil koşullu render ile: cam/blur yüzeylerde
          ata zincirindeki opacity<1 efekti tamamen öldürüyor (bkz. proje notu).
          `composeGate` "unknown" iken buton NORMAL çiziliyor — kilit çizmek
          /me gelene kadar olmayan bir kısıt uydururdu. */}
      {activeTab !== "replies" && gate.kind !== "restricted" ? (
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

      <FeedReplyComposerSheet
        visible={!!replyTarget}
        onClose={() => setReplyTarget(null)}
        onSend={handleSendReply}
        postExcerpt={replyTarget?.body ?? null}
        postIsAnonymous={replyTarget?.isAnonymous ?? false}
        maxLength={me?.replyMaxLength}
        remaining={me?.quota?.repliesRemaining ?? null}
        sending={createReply.isPending}
        errorText={replyError}
      />

      <FeedQuotaSheet
        visible={quotaSheet.visible}
        onClose={() => setQuotaSheet({ visible: false, nextResetAt: null })}
        nextResetAt={quotaSheet.nextResetAt}
        // Premium'da teklif yok: tavanı zaten yüksek, satılacak bir şey kalmadı.
        showPlusOffer={!isPremium}
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
        }}
        onApply={handleApplyFilters}
        kindGate={kindGate}
        onKindPaywall={openPaywall}
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

      {/* Normal gönderinin yazarına dokunulunca AKSİYONSUZ profil önizlemesi.
          `onReport`/`onBlock`/`onMenu`/`onEdit` BİLEREK verilmiyor → kartta
          moderasyon satırı ve not kutusu çıkmıyor; buradan beğeni/süper beğeni
          de yapılamıyor (akışta profil "değerlendirilecek kart" değil,
          gönderinin arkasındaki kişiyi görmenin yolu).
          Anonim gönderide bu yol zaten hiç açılmıyor (FeedPostCard). */}
      <PreviewModal
        visible={!!previewPostId && !!authorProfile.data}
        onClose={() => setPreviewPostId(null)}
        profile={authorProfile.data}
      />

      {/* Yanıt kartına dokununca açılan profil — gerekçe `handleReplyPress`in
          başında. `visible` profil GELDİKTEN sonra açılıyor (yazar
          önizlemesiyle aynı desen): boş bir kartla açıp doldurmak sheet'i bir
          kare boyunca iskelet gibi gösteriyordu. */}
      <LikerSwipeModal
        visible={!!replierTarget && !!replierProfile.data}
        profile={replierProfile.data}
        onClose={() => setReplierTarget(null)}
        onDecide={handleReplyDecide}
        // Engellemeden sonra yanıt listesi tazelenmeli: kart hâlâ listede
        // duruyor ama arkasındaki kişi artık engelli.
        onSwipe={(_userId: string, direction: string) => {
          if (direction === "block") repliesQuery.refetch?.();
        }}
      />
    </View>
  );
}

/** Gönderilerim durum rozeti metni — `postPresentation` → i18n anahtarı. */
function statusLabelFor(post: FeedPostDto, t: (k: string) => string): string | null {
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
