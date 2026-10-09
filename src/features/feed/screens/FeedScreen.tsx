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
import FeedListPage, { FeedEmptyWrap } from "../components/FeedListPage";
import FeedPostCard from "../components/FeedPostCard";
import FeedReplyCard from "../components/FeedReplyCard";
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
import { useIsPremium } from "@/features/profile/premiumTier";
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
import { useFeedAuthorProfile } from "../feedQueries";
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

export default function FeedScreen() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  // Yalnız kota sheet'indeki YUMUŞAK Plus satırını çizmek için — kapı kararı
  // değil (kapılar /api/feed/me'den gelir).
  const isPremium = useIsPremium();

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
    // FAB'ın kendisi kapıya göre çiziliyor ama kapı burada da kontrol ediliyor:
    // /me iki render arasında değişmiş olabilir ve kullanıcıyı 403'e yürütmek
    // istemiyoruz.
    if (gate.kind === "quotaExhausted") {
      setQuotaSheet({ visible: true, nextResetAt: gate.nextResetAt });
      return;
    }
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

            // Kota bitti → sheet KAPANIR, kota sheet'i açılır. Metni saklamanın
            // anlamı yok: hak yarın geliyor.
            if (code === FEED_CODES.POST_QUOTA) {
              setComposerVisible(false);
              // Sunucu kovanın boş olduğunu söyledi → /me'yi düzelt, yoksa FAB
              // "hakkın var" görünmeye devam eder.
              writeFeedQuotaExhausted(qc, "post", result?.nextResetAt ?? null);
              setQuotaSheet({
                visible: true,
                nextResetAt: result?.nextResetAt ?? null,
              });
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

  const handleReplyMenu = useCallback((reply: FeedReceivedReplyDto) => {
    // Yanıt şikayetinde hedef HER ZAMAN kimlikli (yanıtlayan görünüyor) →
    // engelleme satırı çizilir.
    setReportTarget({
      targetType: "Reply",
      replyId: reply.replyId,
      isAnonymous: false,
    });
  }, []);

  // ── Sheet'ler ─────────────────────────────────────────────────────────────
  const [filterVisible, setFilterVisible] = useState(false);
  const [universityVisible, setUniversityVisible] = useState(false);
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);
  const authorProfile = useFeedAuthorProfile(previewPostId);

  const universityGate = universityPickerGate(me);
  const kindGate = kindFilterGate(me);

  const handleUniversityPill = useCallback(() => {
    // Kapı kapalıysa seçici HİÇ açılmıyor: açıp seçtirip sonra UT-7310 ile
    // geri almak kullanıcıyı boşuna gezdirmek olurdu.
    if (universityGate === "paywall") {
      openPaywall();
      return;
    }
    setUniversityVisible(true);
  }, [universityGate, openPaywall]);

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
  // sheet'ini açıyor, o yüzden `activeTab` boş geçiliyor.
  const filterPills = useMemo(() => {
    const campusLabel = listParams.university
      ? listParams.university
      : t("feed.university.own");
    return [
      {
        key: "campus",
        label: universityGate === "paywall" ? `🔒 ${campusLabel}` : campusLabel,
      },
      { key: "sort", label: t(`feed.sort.${listParams.sort}`) },
      {
        key: "filter",
        label: t("feed.filter.title"),
        // Varsayılandan sapan filtre sayısı; 0 ise pill sayı çizmiyor.
        count: activeFilterCount(listParams),
      },
    ];
  }, [listParams, universityGate, t]);

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
      />
    </FeedEmptyWrap>
  );

  const filterRow = (
    <View style={{ marginBottom: 8 }}>
      <FilterPills
        tabs={filterPills}
        // Tek seçimli şerit DEĞİL: her pill kendi sheet'ini açıyor, o yüzden
        // "aktif" olan yok. Boş string hiçbir pill'i vurgulamıyor.
        activeTab=""
        onChange={handlePillPress}
        // Liste yatay payını (10) aşıp kartlarla aynı hizada başlasın;
        // `bleed` negatif marj, `inset` ise duruş payı.
        bleed={10}
        inset={6}
      />
    </View>
  );

  const renderPage = (key: FeedPageKey) => {
    const isActive = key === activeTab;

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
            <FeedReplyCard
              reply={item}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
              onMenu={handleReplyMenu}
            />
          )}
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
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedPostCard
            post={item}
            variant={isMine ? "mine" : "feed"}
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
        // Filtre satırı YALNIZ akış sayfasında ve LİSTENİN İÇİNDE: pager'ın
        // dışına alınsaydı Gönderilerim/Yanıtlar sayfalarında da durur ve
        // onlarla ilgisi olmayan bir filtreyi ima ederdi. Liste başlığı olduğu
        // için sayfayla birlikte native olarak kayıyor.
        listHeader={isMine ? null : filterRow}
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
              centered
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
          style={{
            position: "absolute",
            right: 16,
            // 92 = tab bar + nefes payı.
            bottom: 92,
            height: 52,
            paddingHorizontal: 20,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: colors.inverseSurface,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            shadowColor: colors.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <SFIcon
            name="square.and.pencil"
            fallback={LayoutList}
            size={17}
            color={colors.onInverseSurface}
            strokeWidth={2}
          />
          <Text
            style={{
              marginLeft: 8,
              fontSize: 15,
              fontWeight: "600",
              color: colors.onInverseSurface,
            }}
          >
            {t("feed.empty.cta")}
          </Text>
        </Pressable>
      ) : null}

      <FeedComposerSheet
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onSend={handleSendPost}
        maxLength={me?.postMaxLength}
        anonymousGate={anonymousGate(me)}
        onAnonymousPaywall={openPaywall}
        universityLabel={me?.universityDomain ?? null}
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
    case "pending":
      return "warning";
    case "removed":
    case "hidden":
      return "danger";
    default:
      return "neutral";
  }
}
