import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  AppState,
  Modal,
  Linking,
  StyleSheet,
} from "react-native";
import { appPrefs } from "../../../shared/utils/appPrefs";
import { setSwipeTutorialBlocking } from "@/features/discover/swipeTutorialGate";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  runOnJS,
  useAnimatedStyle,
  useAnimatedReaction,
  interpolate,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Destenin TAMAMININ yandan girdiği yolların mesafesi (filtre · mesafe sınırı).
// Tek kartın girişiyle aynı sayı, türetilmiş: iki giriş aynı hızda okunsun
// (bkz. SwipeWrapper > CARD_ENTRY_DISTANCE).
const ENTRY_DISTANCE = CARD_ENTRY_DISTANCE;
const ENTRY_DURATION = 180;
const ENTRY_EASING = Easing.out(Easing.cubic);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RotateCcw,
  SlidersHorizontal,
  Search,
  ArrowLeft,
  ArrowRight,
  Lock,
} from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import SwipeWrapper, {
  CARD_ENTRY_DISTANCE,
} from "@/features/discover/components/SwipeWrapper";
import FirePullHint from "@/features/discover/components/FirePullHint";
import SwipeOverlay from "@/features/discover/components/SwipeOverlay";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import FirePurchaseModal from "@/features/discover/components/FirePurchaseModal";
import { Image as ExpoImage } from "expo-image";
import FilterModal from "@/features/discover/components/FilterModal";
import ProfileOptionsSheet from "@/features/discover/components/ProfileOptionsSheet";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import { CURRENT_KVKK_VERSION } from "@/features/auth/screens/KVKKConsentScreen";
// `WaveFillLogo` ARTIK ÇİZİLMİYOR (istek): Keşif'in üstündeki dekoratif logo
// kaldırıldı, yerinde yalnız iki cam buton kaldı. Bileşen duruyor — başka bir
// yüzeye konmak istenirse hazır.
import { colors, ink, scrimAt } from "../../../shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";
import {
  usePotentialMatches,
  useSwipeFilters,
  useSwipeStats,
  useSwipeMutation,
  useNoteMutation,
  useSaveFilters,
  useUndoSwipe,
  useUpdateStatsCache,
  useSetIgnoreDistanceFilter,
} from "@/features/discover/swipeQueries";
import { FREE_MAX_DISTANCE_KM } from "@/shared/constants/limits";
import {
  formatResetDuration,
  formatResetTime,
  resolveResetSeconds,
} from "@/features/discover/quotaFormat";
import {
  loadDeckProgress,
  saveDeckProgress,
  SWIPE_GUARD_MS,
} from "@/features/discover/deckProgress";
import { decideTopUp } from "@/features/discover/deckTopUp";
import { resolveCode, type CodeEntry } from "@/shared/constants/responseCodes";
import { resolveEmptyDeckCopy } from "@/features/discover/emptyDeckCopy";
import { SUPPORT_EMAIL } from "@/shared/constants/support";
import { showInfoToast, showMissedMatchToast } from "@/shared/services/toaster";
import {
  runFlameSweep,
  runMatchCurtain,
} from "@/features/discover/flameSweep";
import {
  DISCOVER_GLASS_BUTTON_SIZE,
  DISCOVER_HEADER_HEIGHT,
  discoverTabBarInset,
} from "@/features/discover/components/discoverHeaderMetrics";
import DiscoverHeaderGlassButton from "@/features/discover/components/DiscoverHeaderGlassButton";
import {
  CARD_FACE_CORNER_RADIUS,
  CARD_FACE_TOP_CORNER_RADIUS,
  CHROME_EDGE_INSET,
} from "@/features/discover/components/CardStickyHeader";
// İskeletin yazı bloğu kartın KENDİ sayılarıyla yerleşiyor (bkz. SkeletonCard):
// taban, satır boyu ve satır araları SwipeCard'dan geliyor, burada kopyalanmıyor.
import {
  CARD_NAME_LINE,
  COVER_NAME_BOTTOM,
  COVER_UNI_PILLS_GAP,
  COVER_UNI_ROW_PAD,
} from "@/features/discover/components/SwipeCard";
import NoteComposerModal from "@/features/discover/components/NoteComposerModal";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import {
  NOTE_SEND_CODES,
  noteSendCodeI18nKey,
} from "@/shared/constants/responseCodes";
import uiBus, {
  cardChromeAnim,
  cardExpandAnim,
  resetCardExpandState,
} from "@/shared/services/uiBus";
import { useEvent } from "@/shared/hooks/useEvent";
import { mark } from "@/shared/debug/startupTiming";
import { hideSplash } from "@/shared/splash";
import { markAppShellReady } from "@/shared/bootPhase";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { store } from "@/shared/store";
import { hasLikedMe, removeWhoLikedMe } from "@/features/discover/swipeSlice";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { usePremiumTier } from "@/features/profile/premiumTier";
import { analytics } from "@/shared/services/analytics";
import { navigationRef } from "@/shared/services/navigationRef";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

// Tab bar geometrisi ortak dosyada (discoverTabBarInset): SwipeCard da aynı
// payı okumak zorunda — kapak ekranın dibine kadar indiği için alt bandındaki
// yazılar o pay kadar yukarıda durmalı.

// Günlük beğeni kotası azalırken uyarı verilen KALAN hak eşikleri.
// Tavanın yüzdesi DEĞİL mutlak sayı: tavan sunucu config'inden geliyor
// (`SwipeLimits`, free'de 30) ve değişebiliyor — "son 10 / son 5 hak" iki
// tavanda da aynı şeyi anlatır, %33 anlatmaz. Toast'ta eşik değil KALAN hak
// yazıldığı için, tek adımda iki eşik birden geçilse de tek toast çıkar ve
// doğru sayıyı söyler.
const SWIPE_WARN_THRESHOLDS = [10, 5] as const;

/**
 * Kapağın ölçüm haberi (bkz. coverSettled) en çok bu kadar bekleniyor.
 *
 * Ölçüm normalde iki-üç karede geliyor; bu sayı o yolun tıkandığı hâl için.
 * Kısa tutuluyor: haber gecikirse kullanıcı sıçramayı görür ama kart MUTLAKA
 * açılır — uzun bir tavan, hatada ekranı iskelette bırakmak demek.
 */
const COVER_SETTLE_TIMEOUT_MS = 600;

/**
 * Yandan giren deste (rewind · filtre kaydetme) en çok bu kadar DIŞARIDA
 * bekliyor — yeni üst kartın ölçüm haberi (bkz. `enterStackFrom`) gelmezse
 * kayma yine de başlıyor.
 *
 * `COVER_SETTLE_TIMEOUT_MS`DEN KISA, bilerek: orada perdenin ardında bir kart
 * var ve beklemek yalnız perdeyi uzatıyor; burada ekranda kart YOK, bekleme
 * boş ekran demek. Ölçüm normalde 3-4 karede (~60ms) geliyor, bu sayı yalnız o
 * yolun tıkandığı hâl için.
 */
const STACK_ENTRY_SETTLE_TIMEOUT_MS = 240;

/*
 * ── `REWIND_SLOT_WARMUP_MS` KALDIRILDI ────────────────────────────────────
 *
 * 1200 ms'di: geri alınabilir kart, kullanıcı o kadar kaydırmadan durursa
 * canlı kartın ardında ısınmaya başlıyordu. Fikir yanlıştı — geri al genelde
 * swipe'tan hemen SONRA basılıyor, yani ısınma hiç yetişmiyordu ve rewind
 * "bazen hızlı, bazen değil" oluyordu.
 *
 * Yerine yapısal çözüm: kart zaten mount, çünkü ekrandan çıkarken unmount
 * edilmiyor (bkz. renderStack > slotProfile).
 */

/**
 * Geç/beğen/Fire butonlarının art arda basışa kapalı kaldığı süre.
 *
 * ÜÇÜ AYNI SAYI (2026-10-13): üç yönün de kartı yerinde tutup değişimi alevin
 * altında yaptığı modelde (bkz. SwipeWrapper > commitExit) buton basıştan
 * ~800 ms sonra iş görüyor. Fire zaten 1300'de bekliyordu; geç/beğen 120'de
 * kalınca butonlar kart hâlâ dururken canlanıyor ve ikinci tap yutulmuş gibi
 * görünüyordu.
 *
 * Tarihçe: 300 ms'den 120'ye indirilmişti, çünkü deste kartın UÇUŞU ekranı
 * terk eder etmez (~65 ms) ilerliyordu ve kalan kilit boş beklemeydi. Uçuş
 * kalktı, gerekçe tersine döndü.
 *
 * Çift tetiklemeye karşı asıl güvence SwipeWrapper'daki `exitPending` kilidi;
 * bu yalnız butonun görünür durumu.
 */
const BUTTON_SWIPE_LOCK_MS = 1300;

// NOT — kart açılırken tab bar'ı `display:"none"` ile gizlemek DENENDİ ve
// vazgeçildi: bu gizleme animasyona açılmıyor. react-native-screens
// `setTabBarHidden:animated:NO` çağırıyor; yamayla önce `animated:YES`, sonra
// çağrıyı Fabric'in mount fazının dışına atıp (dispatch_async) kendi
// `UIView animateWithDuration:` + `layoutIfNeeded` bloğumuza alarak denendi.
// İkisinde de bar tek karede kayboldu — iOS 26'nın yüzen tab bar'ı bu yoldan
// animasyonlanmıyor. Bar'ın çekilmesini artık iOS 26'nın KENDİ küçülme
// davranışı yapıyor (bkz. TabNavigator > tabBarMinimizeBehavior).

// Placeholder block — kendi içinde shimmer animasyonu olan dark rect.
// borderCurve:continuous + overflow:hidden ile yumuşak köşeli kapsayıcı.
const SkeletonBlock = ({ width, height, borderRadius = 8, style }: any) => {
  const shimmer = useSharedValue(-width);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(width * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer, width]);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.surface4,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: width * 2,
            height: "100%",
          },
          shimmerStyle,
        ]}
      >
        <LinearGradient
          colors={["transparent", ink(0.12), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
};

/**
 * Yüzen üst chrome butonlarının sağ altına oturan küçük rozet — kalan geri
 * alma hakkı / kilit, ve aktif filtre sayısı.
 *
 * ZEMİN İKİ YOLDAN GELİYOR, kasıtlı:
 *
 * - SAYI yolu OPAK (`colors.bg`): 15px rakamın 16px'lik diskte okunması zeminin
 *   kapatıcılığına bağlı; saydam bırakılınca açık bir fotoğrafın üstünde sayı
 *   kayboluyordu.
 * - KİLİT yolu BULANIK (istek: "arka planı renk değil blur olsun"): glif tek
 *   parça ve kapatıcı bir diske ihtiyacı yok, bulanıklık onu üstünde durduğu
 *   butonun cam ailesine bağlıyor. Malzeme `chromeBlurTint()` — rozet bir foto
 *   perdesi değil, chrome'un parçası (bkz. shared/theme/blur.ts).
 *
 * Her iki yol da cam butonun DIŞINDA kalmak zorunda: SwiftUI ağacına RN çocuğu
 * girmiyor ve camın ATASI olacak her katman (opacity/transform) efekti
 * öldürüyor.
 *
 * Eskiden aynı rozet düz ikonun köşesindeydi; ölçüler oradan devralındı ki
 * sayı aynı boyda okunsun.
 */

/**
 * Kilit rozetinin bulanıklığı — `GlassFallbackSurface`in buton zeminiyle (60)
 * aynı kademe: ikisi de bir perde değil, kendi kutusu olan küçük bir yüzey.
 */
const HEADER_BADGE_BLUR_INTENSITY = 60;

function HeaderCountBadge({ icon = false, text }: { icon?: boolean; text: string }) {
  const box = {
    borderRadius: 999,
    borderCurve: "continuous" as const,
    minWidth: 16,
    height: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: icon ? 0 : 3,
  };

  // Kilit glifi geri alma butonunun okuyla AYNI ailede: dolgulu `lock.fill`
  // yerine çizgisel `lock` + aynı `semibold` ağırlık (bkz. yukarıdaki butonun
  // `arrow.counterclockwise` glifi). Mürekkep tema metni, foto-üstü beyaz
  // DEĞİL: rozetin arkasında berrak cam değil bir blur diski var ve o disk
  // açık modda açık — beyaz glif içinde kaybolurdu (`glassOnMediaInk` notu).
  if (icon)
    return (
      // `overflow: hidden` olmadan BlurView kare kalıyor (yarıçap bulanıklığı
      // kırpmıyor) — GlassFallbackSurface'teki aynı kural.
      <BlurView
        tint={chromeBlurTint()}
        intensity={HEADER_BADGE_BLUR_INTENSITY}
        style={[box, { overflow: "hidden" }]}
      >
        <SFIcon
          name="lock"
          fallback={Lock}
          size={12}
          color={colors.text}
          strokeWidth={2.5}
          weight="semibold"
        />
      </BlurView>
    );

  return (
    <View style={[box, { backgroundColor: colors.bg }]}>
      <Text
        style={{
          color: colors.text,
          fontSize: 15,
          fontWeight: "700",
          lineHeight: 16,
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * Kapağın üniversite satırının yazı kutusu — `text-[16px]`in satır boyu.
 * Placeholder'ın boyu buna kendi dikey dolgusunu (COVER_UNI_ROW_PAD ×2) ekliyor,
 * çünkü kartta da satırın KUTUSU yazıdan o kadar uzun (bkz. SwipeCard >
 * COVER_UNI_ROW_PAD).
 */
const SKELETON_UNI_LINE = 20;

/**
 * Ortak nokta pilinin boyu — kartta `paddingVertical: 10` + 14px yazı kutusu
 * (bkz. SwipeCard'daki pil satırı). Tek kaynak yapılamıyor: ölçü kapsülün kendi
 * dolgusundan çıkıyor, dışa açık bir sayı değil.
 */
const SKELETON_PILL_HEIGHT = 37;

/**
 * Kapağın iskeleti — deste gelene ya da ilk fotoğraf yüklenene kadar ekranda
 * duran hâl. Kartın KAPALI yüzünü taklit ediyor:
 *
 * - TAM EKRAN, kartla aynı köşe yarıçapları (CARD_FACE_*): kart artık ekranın
 *   tepesinden dibine kadar uzanıyor, iskelet eski paylı kabında kalsaydı ilk
 *   fotoğraf gelince çerçeve bir anda büyüyor gibi görünüyordu.
 * - Yazı bloğu kartın tabanından (COVER_NAME_BOTTOM + tab bar payı) ve aynı
 *   kenar payından (CHROME_EDGE_INSET) yerleşiyor.
 * - Sıra kartla birebir: isim → üniversite → ortak nokta pilleri.
 *
 * İKİ ESKİ PARÇA KALDIRILDI: tepedeki sayfalama pili (kapakta artık fotoğraf
 * göstergesi YOK, kapalı kart yalnız ilk fotoğrafı çiziyor) ve ismin üstündeki
 * premium pili (premium işareti artık ayrı bir kapsül değil, ismin sağındaki
 * wordmark — bkz. SwipeCard > PremiumBadge).
 *
 * Aktiflik satırı (“bugün aktif”) ve sağdaki aksiyon kolonu bilerek
 * çizilmiyor: ilki koşullu ve blok alttan sabit olduğu için yokluğu aşağısını
 * kaydırmıyor, ikincisi basılacak butonlardan oluşuyor — iskelet buton
 * göstermiyor.
 */
const SkeletonCard = ({ coverBottomInset }: { coverBottomInset: number }) => {
  const shimmer = useSharedValue(-SCREEN_WIDTH);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(SCREEN_WIDTH * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));
  return (
    <View
      style={{
        flex: 1,
        // Kartın YÜZÜYLE aynı yarıçap: iskeletten karta geçerken köşe
        // değişmesin (bkz. CARD_FACE_CORNER_RADIUS). Üst ikisi kartta bir tık
        // daha kare (CARD_FACE_TOP_CORNER_RADIUS) — iskelet de onu izliyor.
        borderRadius: CARD_FACE_CORNER_RADIUS,
        borderTopLeftRadius: CARD_FACE_TOP_CORNER_RADIUS,
        borderTopRightRadius: CARD_FACE_TOP_CORNER_RADIUS,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
    >
      {/* Kapağın alt yazı bloğu — SwipeCard'daki “Name and Age on Photo”
          bloğunun aynı yerleşimi: taban COVER_NAME_BOTTOM + tab bar payı,
          kenarlar CHROME_EDGE_INSET. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: COVER_NAME_BOTTOM + coverBottomInset,
          left: CHROME_EDGE_INSET,
          right: CHROME_EDGE_INSET,
        }}
      >
        {/* İsim + yaş satırı */}
        <View style={{ marginBottom: 2 }}>
          <SkeletonBlock width={168} height={CARD_NAME_LINE} borderRadius={999} />
        </View>
        {/* Üniversite satırı — kartta `marginTop: 4` ile geliyor ve kendi dikey
            dolgusunu taşıyor; altındaki pil satırına COVER_UNI_PILLS_GAP
            bırakıyor. */}
        <View style={{ marginTop: 4, marginBottom: COVER_UNI_PILLS_GAP }}>
          <SkeletonBlock
            width={196}
            height={SKELETON_UNI_LINE + COVER_UNI_ROW_PAD * 2}
            borderRadius={999}
          />
        </View>
        {/* Ortak nokta pilleri — kartta PillFlow `gap: 6` ile diziyor; iskelet
            ilk satırı iki kapsülle temsil ediyor (deste gelmeden kaç tane
            olacağı bilinmiyor). */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          <SkeletonBlock
            width={132}
            height={SKELETON_PILL_HEIGHT}
            borderRadius={999}
          />
          <SkeletonBlock
            width={96}
            height={SKELETON_PILL_HEIGHT}
            borderRadius={999}
          />
        </View>
      </View>

      {/* Shimmer pass — tüm placeholder'lar üzerinden geçer */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: SCREEN_WIDTH * 2,
            height: "100%",
          },
          shimmerStyle,
        ]}
      >
        <LinearGradient
          colors={["transparent", colors.shimmer, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
};

// Boş durum kartı — SkeletonCard'la aynı dış yapı (frame + placeholder block'lar) ama
// shimmer YOK. Ortada Search ikonu + etrafında radar pulse animasyonu (3 ring stagger).
// Ekran görünür VE app foreground'da mı. Radar `withRepeat(-1)` ile sonsuz
// döner; Discover tab'ı preload/lazy sonrası mount kalıyor, dolayısıyla gate
// olmadan başka sekmedeyken ve app arka plandayken de her frame commit atıyor.
// Boş deste + polling refetch'in render'larıyla üst üste binince commit storm
// besliyor (bkz. ShadowTree::commit assert).
const useRadarActive = () => {
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    () => AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  return isFocused && appActive;
};

const RadarRing = ({ delay = 0, active = true }) => {
  // Initial = 1 → opacity 0, görünmez. Delay sonrası 0'a snap edip animasyona başla.
  // Aksi halde delay süresince ring scale 0.3 + opacity 1 ile statik nokta gibi durur.
  const progress = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = 1; // görünmez konuma park et
      return;
    }
    const t = setTimeout(() => {
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimation(progress);
    };
  }, [progress, delay, active]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.3 + progress.value * 1.7 }],
    opacity: 1 - progress.value,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          borderWidth: 4,
          borderColor: ink(0.55),
        },
        style,
      ]}
    />
  );
};

// Magnifier + radar tek bir kapsayıcı içinde 8 (lemniscate) çizer — ring'ler magnifier'le
// senkron hareket eder, radar her zaman icon'un tam ortasında olur.
// Parametrik: x = sin(2θ)/2, y = cos(θ). Period 4s, sürekli loop.
const FigureEightRadar = () => {
  const active = useRadarActive();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t, active]);
  const style = useAnimatedStyle(() => {
    const AMP = 18;
    const theta = t.value * 2 * Math.PI;
    const x = (Math.sin(2 * theta) * AMP) / 2;
    const y = Math.cos(theta) * AMP;
    return {
      transform: [{ translateX: x }, { translateY: y }] as any,
    };
  });
  return (
    <Animated.View
      style={[{ alignItems: "center", justifyContent: "center" }, style]}
    >
      <RadarRing delay={0} active={active} />
      <RadarRing delay={800} active={active} />
      <RadarRing delay={1600} active={active} />
      <SFIcon name="magnifyingglass" fallback={Search} size={36} color={colors.text} strokeWidth={2} weight="semibold" />
    </Animated.View>
  );
};

/**
 * Boş deste kartı — KART GİBİ TAM EKRAN (2026-10-13). Eskiden kendi kabının
 * içinde, 40'lık yarıçapla ve 24/70'lik kendi paylarıyla duran küçük bir kutuydu;
 * kart tam ekrana geçince (bkz. "KART: TAM EKRAN") yanında eski UI olarak kalmıştı.
 *
 * Artık iskeletle birebir aynı dış yapı: ekranı dolduruyor, köşeleri kartın yüzü
 * (CARD_FACE_CORNER_RADIUS / üst ikisi CARD_FACE_TOP_CORNER_RADIUS), yazı bloğu
 * kartın kapağıyla aynı çizgide — taban COVER_NAME_BOTTOM + tab bar payı,
 * kenarlar CHROME_EDGE_INSET.
 *
 * ESKİ SAYFALAMA PİLİ KALKTI: kapakta artık fotoğraf göstergesi yok (bkz.
 * SkeletonCard'daki aynı not), boş kartta zaten hiç fotoğraf yoktu.
 *
 * Paylar artık KABIN değil kartın içinde: dışarıda sarmalayıcı kalmadığı için
 * (kap tam ekran) metin ve butonun durum çubuğunun / yüzen tab bar'ın ardına
 * girmemesini kart kendi `topInset`/`coverBottomInset` payıyla sağlıyor.
 *
 * `title`/`actionLabel` verilirse backend'in yapısal boşluk sebebi (emptyReason)
 * gösterilir; verilmezse eski davranış (yalnız radar + yer tutucu bloklar).
 */
const EmptyDiscoverCard = ({
  title = null,
  actionLabel = null,
  onAction = null,
  secondaryLabel = null,
  onSecondary = null,
  busy = false,
  topInset,
  coverBottomInset,
}: {
  title?: string | null;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  // İkincil çıkış yolu — pratikte hep "Mesafe sınırını kaldır". Sebebin kendi
  // aksiyonunun YERİNE geçmiyor, altına düz metin bağlantı olarak ekleniyor:
  // deste hangi sebeple boşalırsa boşalsın mesafe sınırı hâlâ açık duruyorsa
  // kullanıcıya sunulacak somut bir çare var (bkz. emptyCopy).
  secondaryLabel?: string | null;
  onSecondary?: (() => void) | null;
  // Aksiyon uçuşta ("Daha uzağı göster" isteği). Buton pasifleşiyor: yavaş
  // bağlantıda hiçbir şey olmamış gibi görünüp tekrar tekrar basılıyordu.
  busy?: boolean;
  // Üstte yüzen chrome'un (geri al / filtre) bittiği çizgi — radar onun ALTINDA
  // ortalanıyor, yoksa tam ekranda ikonun merkezi cam butonların arkasına denk
  // geliyor.
  topInset: number;
  // Kartın kapağındaki yazı bloğunun okuduğu tab bar payı (bkz. SwipeCard >
  // coverBottomInset) — yazı yüzen bar'ın ardına düşmesin.
  coverBottomInset: number;
}) => {
  const hasReason = !!title;
  return (
    <View
      style={{
        flex: 1,
        // Kartın YÜZÜYLE aynı yarıçap (bkz. SkeletonCard'daki aynı not).
        borderRadius: CARD_FACE_CORNER_RADIUS,
        borderTopLeftRadius: CARD_FACE_TOP_CORNER_RADIUS,
        borderTopRightRadius: CARD_FACE_TOP_CORNER_RADIUS,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface,
        // Akış yerleşimi (absolute DEĞİL): radar kalan boşlukta ortalanıyor,
        // yazı bloğu dibe oturuyor — blok ne kadar uzarsa radar o kadar yukarı
        // kayıyor, üst üste binmiyorlar.
        paddingTop: topInset,
        paddingBottom: COVER_NAME_BOTTOM + coverBottomInset,
      }}
    >
      {/* Ortada Search ikonu + radar pulse — yazı bloğunun ÜSTÜNDEKİ alanda */}
      <View
        pointerEvents="none"
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <FigureEightRadar />
      </View>

      {/* Bottom bölge: sebep biliniyorsa metin + aksiyon, bilinmiyorsa
          SwipeCard kapağını taklit eden placeholder block'lar. */}
      {hasReason ? (
        <View style={{ paddingHorizontal: CHROME_EDGE_INSET }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: "700",
              marginBottom: actionLabel || secondaryLabel ? 16 : 0,
            }}
          >
            {title}
          </Text>
          {actionLabel && onAction && (
            <TouchableOpacity
              onPress={onAction}
              disabled={busy}
              activeOpacity={0.8}
              style={{
                alignSelf: "flex-start",
                borderRadius: 999,
                borderCurve: "continuous",
                paddingHorizontal: 20,
                paddingVertical: 12,
                backgroundColor: colors.litPlus,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
              >
                {actionLabel}
              </Text>
            </TouchableOpacity>
          )}
          {secondaryLabel && onSecondary && (
            <TouchableOpacity
              testID="empty-remove-distance-limit"
              onPress={onSecondary}
              disabled={busy}
              activeOpacity={0.8}
              // Dolgusuz: birincil aksiyonla yarışmasın. Dokunma alanı yine de
              // parmak boyutunda kalsın diye dikey padding var, hizayı bozmasın
              // diye negatif marginLeft ile sola çekiliyor.
              style={{
                alignSelf: "flex-start",
                marginTop: actionLabel ? 10 : 0,
                marginLeft: -8,
                paddingHorizontal: 8,
                paddingVertical: 8,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "600",
                  textDecorationLine: "underline",
                }}
              >
                {secondaryLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* Yer tutucular iskeletin yazı bloğuyla AYNI ölçülerde (isim → üniversite
           → ortak nokta pilleri), shimmer YOK: burada yüklenen bir şey yok. */
        <View
          pointerEvents="none"
          style={{ paddingHorizontal: CHROME_EDGE_INSET }}
        >
          <View
            style={{
              marginBottom: 2,
              width: 168,
              height: CARD_NAME_LINE,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.surface4,
            }}
          />
          <View
            style={{
              marginTop: 4,
              marginBottom: COVER_UNI_PILLS_GAP,
              width: 196,
              height: SKELETON_UNI_LINE + COVER_UNI_ROW_PAD * 2,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.surface4,
            }}
          />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View
              style={{
                width: 132,
                height: SKELETON_PILL_HEIGHT,
                borderRadius: 999,
                borderCurve: "continuous",
                backgroundColor: colors.surface4,
              }}
            />
            <View
              style={{
                width: 96,
                height: SKELETON_PILL_HEIGHT,
                borderRadius: 999,
                borderCurve: "continuous",
                backgroundColor: colors.surface4,
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
};

const DEFAULT_FILTERS = {
  ageRangeMin: 18,
  ageRangeMax: 30,
  // Yanıt henüz inmemişken kullanılan yer tutucu — free TAVANI, dar bir değer
  // değil. Mesafe 2026-08-21'den beri katı filtre: burada dar bir varsayılan,
  // gerçek filtresi geniş olan kullanıcıya bir an boş deste gösterirdi.
  // Gerçek sınırlar `/Filters` yanıtından geliyor (bkz. resolveDistanceBounds).
  maxDistance: FREE_MAX_DISTANCE_KM,
  // Yanıt inmeden ÖNCE "sınır uygulanıyor" varsayılıyor. Ters yön (true) boş
  // destede "Mesafe Sınırını Kaldır" butonunu gizlerdi — yani kullanıcıyı
  // gerçekte açık olan tek çözümden mahrum bırakırdı.
  ignoreDistanceFilter: false,
  genders: [],
  interestedIn: [],
  preferredCity: null,
  // "Ben kimi göreyim" üniversite tercihi — çoklu (max 3). Tekil
  // `preferredUniversityDomain` deprecated.
  preferredUniversityDomains: [],
  isPremium: false,
};

export default function DiscoverScreen() {
  useRenderCount("DiscoverScreen");
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const matchesQuery = usePotentialMatches();
  const filtersQuery = useSwipeFilters();
  const statsQuery = useSwipeStats();
  const swipeMutation = useSwipeMutation();
  const noteMutation = useNoteMutation();
  const saveFiltersMutation = useSaveFilters();
  const undoMutation = useUndoSwipe();
  const ignoreDistanceMutation = useSetIgnoreDistanceFilter();
  const updateStatsCache = useUpdateStatsCache();

  // Deste ilerlemesi hesap bazlı saklanıyor (bkz. deckProgress.ts). Selector
  // burada, ref'lerden ÖNCE okunuyor: aşağıdaki lazy initializer'lar userId'ye
  // ihtiyaç duyuyor. Tutorial bayrağı da aynı değeri kullanır.
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const [restoredDeck] = useState(() => loadDeckProgress(currentUserId));

  // Swipe edilen userId → swipe ANI. Backend geçmiş swipe'ları zaten filtreliyor;
  // bu küme yalnızca commit yarışını kapatıyor: stack boşalıp polling refetch
  // tetiklendiğinde swipe POST'ları henüz işlenmemiş olabiliyor (ZREM
  // fire-and-forget) ve az önce kaydırılan kart yanıtta hâlâ duruyor.
  // Prune aşağıdaki potentialMatches memo'sunda — veri hangi yoldan gelirse
  // gelsin (ilk fetch / fetchNextPage / polling refetch) aynı süzgeçten geçsin.
  //
  // ZAMAN DAMGASI ŞART: eleme yalnız SWIPE_GUARD_MS içindeki kayıtlara
  // uygulanıyor. Süresiz elerken tek bir uyuşmazlık desteyi gün boyu
  // öldürüyordu — backend profili bilerek yeniden sunsa bile (test verisi,
  // havuz tazeleme, swipe POST'unun düşmesi) istemci sessizce eliyor, aday
  // kalmayınca radar ekranı kilitleniyordu. Pencere dışında backend'e güven.
  const swipedAtRef = useRef<Map<string, number>>(
    new Map(restoredDeck.swipes),
  );
  const isGuarded = useCallback((userId: string) => {
    const at = swipedAtRef.current.get(userId);
    return at != null && Date.now() - at < SWIPE_GUARD_MS;
  }, []);

  /**
   * ÜST KART "GÖNDERİLDİ AMA HÂLÂ EKRANDA" — index bir örtmeyi bekliyor.
   *
   * Tek kullanıcısı eşleşme dalı (bkz. handleSwipe > `matching`): beğeninin
   * İSTEĞİ gidiyor ve kart `swipedAtRef`e yazılıyor, ama `currentIndex`
   * MatchModal'ın perdesi ekranı kaplayana kadar kaymıyor.
   *
   * O pencerede desteyi süzen memo tehlikeli: kart artık "guarded" olduğu
   * için KUYRUKTAN elenir ve deste kendiliğinden kayar — hem değişim açıkta
   * olur hem de bekleyen index artışı ikinci bir kartı atlar. Bayrak o yüzden
   * süzgeci bir eleman geriye itiyor (aşağıda, `historyLimit`).
   *
   * Diğer yollarda (geç/beğen/Fire süpürmesi) böyle bir pencere YOK:
   * `handleSwipe`ın tamamı alevin örtme anına kadar hiç çağrılmıyor, yani
   * guard da index de aynı karede yazılıyor.
   */
  const deckHoldRef = useRef(false);

  // currentIndex burada tanımlı çünkü potentialMatches memo'su ona bağımlı
  // (aşağıdaki index-güvenli prune). Kardeş swipe state'leri render bölümünün
  // yanında kaldı.
  const [currentIndex, setCurrentIndex] = useState(0);
  // `coveredSwap` KALDIRILDI: "son ilerleme ekranı kaplayan bir kutlamanın
  // ALTINDA mı oldu" bayrağıydı ve tek müşterisi yeni üst kartın 0.92→1 giriş
  // yayıydı (SwipeWrapper.snapEntry). Yay kaldırıldı — gerekçesi orada,
  // ölçeğin silindiği yerde.

  const potentialMatches = useMemo(() => {
    const all = matchesQuery.data?.pages.flatMap((p) => p.profiles) ?? [];
    // Dedupe by userId — backend bazen sayfa kenarlarında aynı user'ı tekrar
    // dönebiliyor; duplicate key error'unu engeller.
    //
    // Aynı geçişte swipe edilmişleri de eliyoruz. DİKKAT — sadece HENÜZ
    // GÖSTERİLMEMİŞ kısımdan (out.length >= currentIndex) atıyoruz:
    // currentIndex bu diziye bir index, baştan eleman çıkarmak tüm desteyi
    // kaydırır ve handleRewind'in okuduğu potentialMatches[currentIndex - 1]
    // yanlış profili gösterirdi. Geçmiş olduğu gibi duruyor, sadece kuyruk
    // süzülüyor → index kaymaz.
    //
    // handleSwipe önce ref'e ekleyip sonra currentIndex'i artırdığı için
    // yeni swipe edilen kart hep geçmişte kalır, anlık atlama olmaz.
    const seen = new Set();
    const deduped: any[] = [];
    for (const p of all) {
      if (!p?.userId || seen.has(p.userId)) continue;
      seen.add(p.userId);
      deduped.push(p);
    }
    // "Geçmiş" ancak dizi currentIndex'e KADAR uzanıyorsa vardır. Refetch
    // 1. sayfayı eklemiyor DEĞİŞTİRİYOR: gelen dizi eski index'ten kısaysa
    // ortada korunacak geçmiş yok, o dizinin tamamı kuyruktur. Eski koşul
    // (out.length >= currentIndex) bu durumda HİÇBİR ŞEYİ elemiyordu ve
    // backend'in ZREM'i fire-and-forget olduğu için tam da o anda gelen
    // yanıtta az önce swipe edilen profiller duruyor olabiliyor → deste
    // boşalınca yapılan takviyede pass'lanan kart yeniden kartın üstüne
    // düşüyordu. Yarışı biz kapatıyoruz, backend'in commit'ini beklemeden.
    // ÜST KART BİR ÖRTMEYİ BEKLİYORSA "geçmiş" bir eleman daha uzun sayılıyor
    // (bkz. deckHoldRef): kart gönderildi ve guard'a yazıldı ama hâlâ ekranda,
    // kuyruktan elenmesi desteyi altımızdan kaydırırdı.
    //
    // Ref okuması bilerek: burada "şu anda bir tutma var mı" sorusunun
    // cevabı lazım, reaktif bir bağımlılık değil — tutma bittiğinde index
    // artışı memo'yu zaten yeniden hesaplatıyor.
    const limitBase = currentIndex + (deckHoldRef.current ? 1 : 0);
    const historyLimit = deduped.length > limitBase ? limitBase : 0;
    const out = deduped.filter(
      (p, i) => i < historyLimit || !isGuarded(p.userId),
    );
    return out;
  }, [matchesQuery.data, currentIndex, isGuarded]);

  // ── Üst kartın KİMLİK demiri ────────────────────────────────────────────
  // currentIndex bu diziye bir POZİSYON. Infinite query refetch edilince
  // (foreground invalidate, profil/dil/satın alma invalidate'i, boş deste
  // yoklaması) React Query TÜM sayfaları baştan çekiyor ve backend swipe
  // edilenleri elediği için dizi başından kayıyor → aynı index'te bambaşka
  // biri oturuyordu, kart kullanıcı hiçbir şey yapmadan değişiyordu.
  //
  // Çözüm: üstte duran kullanıcının id'sini tut, veri altımızdan değişince
  // index'i o kişiyi gösterecek şekilde taşı. Realign YALNIZ `data` referansı
  // değiştiğinde yapılıyor — kullanıcının kendi ilerlemesinde (swipe/undo)
  // demir sadece tazeleniyor, yoksa her swipe geri alınırdı.
  //
  // Hizalama ve demir tazeleme TEK effect'te: iki ayrı effect'e bölününce
  // doğruluk tanımlanma sıralarına bağlı hale geliyor (önce hizala, sonra
  // tazele; ters sırada demir yanlış kartla eziliyor ve düzeltme hiç olmuyor).
  // useLayoutEffect: düzeltme aynı commit'te, boyanmadan önce uygulansın —
  // aksi halde yanlış kart bir kare görünürdü. Ortak yolda O(1), state
  // güncellemesi yok; findIndex sadece veri değiştiğinde çalışır.
  // setCurrentIndex sonrası memo yeniden hesaplanır ama demir yerinde kalır
  // (kuyruk budaması yalnız index'ten SONRAsını atar) → tek adımda oturur.
  //
  // Demir MMKV'den hidre ediliyor (deckProgress.ts): backend sırası artık
  // deterministik olduğu için önceki oturumun üst kartı yeni destede de aynı
  // yerde duruyor; ilk veri indiğinde aşağıdaki hizalama kullanıcıyı kaldığı
  // karta götürüyor. Kart destede yoksa (son swipe backend'e inmiş) index 0'da
  // kalır — doğrusu da o, çünkü backend swipe edilenleri havuzdan eliyor.
  const anchorUserIdRef = useRef<string | null>(restoredDeck.anchorUserId);
  const lastMatchesDataRef = useRef<unknown>(null);
  const persistedDeckSigRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const dataChanged = lastMatchesDataRef.current !== matchesQuery.data;
    lastMatchesDataRef.current = matchesQuery.data;
    const anchor = anchorUserIdRef.current;
    if (dataChanged && anchor) {
      const idx = potentialMatches.findIndex((p) => p?.userId === anchor);
      // idx === -1: kart destede yok (backend düşürmüş) → yapacak bir şey yok,
      // index olduğu yerde kalır. Demir bir sonraki commit'te tazelenir.
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx);
        return;
      }
    }
    // Deste boşken demiri SIFIRLAMA. İlk render'da (veri henüz inmemişken)
    // potentialMatches boş; koşulsuz atama MMKV'den gelen demiri daha
    // kullanılmadan siler ve "kaldığı yerden devam" hiç çalışmazdı.
    const topUserId = potentialMatches[currentIndex]?.userId ?? null;
    if (topUserId) anchorUserIdRef.current = topUserId;

    // Kalıcılaştırma: demir ya da swipe kümesi değiştiyse yaz. MMKV senkron ve
    // ucuz, ama her commit'te JSON.stringify etmenin anlamı yok — imza guard'ı
    // yalnız gerçek değişimde yazdırıyor.
    const sig = `${anchorUserIdRef.current ?? ""}|${swipedAtRef.current.size}`;
    if (sig !== persistedDeckSigRef.current) {
      persistedDeckSigRef.current = sig;
      saveDeckProgress(currentUserId, {
        anchorUserId: anchorUserIdRef.current,
        swipes: [...swipedAtRef.current],
      });
    }
  }, [matchesQuery.data, potentialMatches, currentIndex, currentUserId]);

  const loading = matchesQuery.isLoading;
  const filters = filtersQuery.data ?? DEFAULT_FILTERS;
  const remainingUndos = statsQuery.data?.remainingUndos ?? null;

  // ── Expand baseline: her taze destede collapsed başla ────────────────────
  // Expand durumu modül seviyesinde yaşıyor (uiBus), yani bu ekran unmount olsa
  // da değer kalıyor. Ekran yeniden mount olduğunda (tema değişimi ağacı
  // remount ediyor) veya top kart değiştiğinde (deste tazelenmesi, rewind,
  // engelleme) kart 1'de donmuş expand'le doğmasın diye baseline'ı burada
  // sıfırlıyoruz. Kartın kendi mount reset'i (SwipeCard) tek başına yetmiyor:
  // deste o an boşsa resetleyecek kart yok.
  //
  // EFFECT DEĞİL RENDER: hem cardContainerStyle'ın ilk paddingBottom değeri bu
  // render'da hesaplanıyor, hem de SwipeCard yüksekliğini ilk layout'ta ölçüyor.
  // Effect'e bırakılsaydı ilk ölçüm expanded geometride yapılırdı.
  const topProfileId: string | undefined =
    potentialMatches[currentIndex]?.userId;
  const expandBaselineRef = useRef<{ id?: string } | null>(null);
  if (
    !expandBaselineRef.current ||
    expandBaselineRef.current.id !== topProfileId
  ) {
    expandBaselineRef.current = { id: topProfileId };
    resetCardExpandState();
  }
  // Ekran kapanırken de temizle — expanded'ken çıkılıp geri gelindiğinde ilk
  // frame collapsed olsun (deste henüz yüklenmemişse bile header/padding doğru).
  useEffect(() => resetCardExpandState, []);

  // Tier'ın ekrandaki tek kaynağı: abonelik slice'ı (bkz.
  // features/profile/premiumTier). ÖNCESİ `statsQuery.data?.isPremium ?? redux`
  // idi — `/stats` oturumda bir kez çekildiği için premium bitince o cevap
  // "premium" kalıyor ve backtrack/filtre kilitleri açık kalmaya devam
  // ediyordu. `/stats` artık yalnız kota SAYILARININ kaynağı.
  const { isPremium: subscriptionIsPremium, resolved: premiumResolved } =
    usePremiumTier();
  const isPremium = premiumResolved
    ? subscriptionIsPremium
    : (statsQuery.data?.isPremium ?? subscriptionIsPremium);

  // Startup teşhis mark'ları — first-launch profilini ölçmek ve startup crash'inin
  // yerini pinlemek için. Çökmeden önceki son [startup] satırı nerede öldüğünü söyler.
  useEffect(() => {
    mark("discover-mounted");
    // Authed landing: splash'i mount'un ilk paint'i geçince gizle. 2×rAF ile
    // ilk commit boyandıktan sonra açılır — InteractionManager kullanmıyoruz,
    // bu kod tabanında runAfterInteractions handle'ı stuck kalıp callback'i hiç
    // çağırmayabiliyor (bkz. MessagesScreen.openChat notu). Safety timeout (App)
    // yine de her ihtimale karşı 4.5sn'de gizler.
    let r2: number | undefined;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => hideSplash("discover-mount"));
    });
    // Deste boşsa / matches fetch'i hata verirse preload zinciri hiç başlamaz ve
    // kabuk "hazır" işaretlenmez → ertelenmiş overlay'ler sonsuza kilitlenir.
    // Emniyet kemeri: preload zincirinin normal bitişinden (4.4sn) sonra aç.
    const shellSafety = setTimeout(
      () => markAppShellReady("discover-safety"),
      6500,
    );
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
      clearTimeout(shellSafety);
    };
  }, []);
  const firstCardsMarked = useRef(false);
  useEffect(() => {
    if (!firstCardsMarked.current && potentialMatches.length > 0) {
      firstCardsMarked.current = true;
      mark("discover-first-cards");
    }
  }, [potentialMatches.length]);

  // ── Hibrit warm-up: Discover hazır olduktan SONRA kardeş sekmeleri arka
  // planda preload et. lazy:true olduğu için sekmeler boot'ta mount olmaz
  // (storm yok); ama ilk kez o sekmeye basınca "kararıp gelme" (lazy mount
  // flash) oluyordu. Discover ilk kartlarını gösterince (settle) Messages/
  // Profile/Likes'ı staggered preload ediyoruz → görünmeden mount olurlar,
  // sekmeye basınca hazır gelirler. Stagger: hepsini aynı anda mount edip
  // mini-storm yaratmamak için aralıklı. Native bottom tabs preload'u destekler
  // (NativeBottomTabView preloadedRouteKeys). Bir kez.
  const navigation = useNavigation<any>();
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (preloadedRef.current) return;
    if (potentialMatches.length === 0) return; // Discover hazır değil
    if (typeof navigation.preload !== "function") {
      // Preload API yok → sekmeler hiç mount olmayacak; kabuk bu kadar oturuyor.
      markAppShellReady("no-preload-api");
      return;
    }
    preloadedRef.current = true;
    // SIRALI stagger: her tab kendi sessiz penceresinde tek başına mount olsun
    // (aynı anda mount = mini commit-storm = crash riski). Messages en olası
    // sonraki hedef + kendi history-prefetch'i olduğu için önce; sonra Likes
    // (swipe akışının doğal devamı), Profile en sonda — en geç ziyaret edilen.
    // Aralıklar ~1.4sn: Messages'ın prefetch burst'ü (4×300ms) sönecek kadar var.
    //
    // KULLANICIYA YOL VER: kullanıcı stagger bitmeden Chat'e girerse sıradaki
    // preload ATLANIR — Chat'in ağır mount'u (LegendList bootstrap + MVCP +
    // klavye) üzerine arka planda tab mount'u bindirmek ShadowTree::commit
    // (attempts<1024) SIGABRT'ının tetikleyicisiydi (Sentry breadcrumb kanıtlı:
    // boot'tan hemen sonra Chat'e giriş + preload çakışması). Preload yalnız
    // optimizasyon: atlanan sekme ilk ziyarette mount olur, işlev kaybı yok.
    const preloadUnlessInChat = (screen: string) => {
      if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === "Chat") return;
      navigation.preload(screen);
    };
    const timers = [
      setTimeout(() => preloadUnlessInChat("Messages"), 600),
      setTimeout(() => preloadUnlessInChat("Likes"), 2000),
      setTimeout(() => preloadUnlessInChat("Profile"), 3400),
      // Son sekme de mount olup commit'leri söndükten sonra kabuğu "hazır"
      // işaretle → ertelenmiş ağır overlay'ler (match modal) ancak buradan
      // sonra mount olur.
      setTimeout(() => markAppShellReady("tab-preload-done"), 4400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [potentialMatches.length, navigation]);

  // Default'tan sapan filtre sayısı — header filter icon'unun sağ-altındaki
  // rozette gösterilir. Mesafe değişikliği rozet'e dahil edilmez (slider'la sürekli
  // oynanan bir ayar, hep "1" göstermesin). interestedIn de dahil değil: kimden
  // hoşlandığın bir "filtre" değil, kalıcı tercih — rozeti sürekli dolu gösterirdi.
  // Sadece şehir/üni ve görünürlük listeleri sayılır.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.preferredCity) count++;
    // Üniversite tercihi de artık liste: kaç domain seçildiğinden bağımsız 1.
    if ((filters.preferredUniversityDomains || []).length > 0) count++;
    return count;
  }, [filters]);

  // ── LOGONUN DOLUM ORANI KALDIRILDI ────────────────────────────────────
  // Burada `swipeFillRatio` vardı: (limit − kalan) / limit, Lit logosunun
  // dalgayla dolan gövdesini süren oran (WaveFillLogo). Logo kaldırılınca
  // (istek) okuyanı kalmadı.
  //
  // Geri istenirse kuralları: premium, limit −1 (sınırsız), kalan −1 ya da
  // limit bilinmiyorsa (null — eski backend) oran hesaplanmıyordu, logo boş
  // gösteriliyordu.

  // Like kotası bitince true. Premium veya rem<0 (unlimited/unknown) → false.
  // Bu durumda like blok edilir, kart bounce back + paywall açılır.
  // Pass'i KAPSAMAZ — backend pass'i kotaya saymıyor.
  const swipeQuotaExhausted = useMemo(() => {
    if (statsQuery.data?.isPremium) return false;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return false;
    return rem === 0;
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  // Fire kota bitince true. Pull-up swipe + button ikisini de blokar.
  const fireQuotaExhausted = useMemo(() => {
    const rem = statsQuery.data?.superLikesRemaining;
    // `null` = değer henüz bilinmiyor (satın alma sonrası optimistic pencere) →
    // bloklama. Negatif ise TÜKENMİŞ sayılır: Fire'ın "sınırsız" hâli yok
    // (doküman tuzak #2). Eskiden `rem < 0` sınırsız gibi ele alınıyordu ve
    // backend refund'da claw-back yapmama kararını tam bu yanlış yoruma
    // dayandırıyor — v2'de gerçek revoke gelirse bedava Fire dağıtırdık.
    if (rem == null) return false;
    return rem <= 0;
  }, [statsQuery.data?.superLikesRemaining]);

  // Rewind free kullanıcıda artık bir premium özelliği (backend dailyUndoLimit=0
  // dönüyor) — "günlük hakkı tükendi" değil. Rozette "0" göstermek yanlış hikâye
  // anlatıyordu ("hakkım bitti, yarın gelir"); kilit ikonu doğru olanı söylüyor.
  // remainingUndos null = değer bilinmiyor (eski backend / ilk yükleme) → kilit
  // YOK, eski davranış korunur.
  const undoLocked = useMemo(() => {
    if (statsQuery.data?.isPremium) return false;
    return remainingUndos === 0;
  }, [statsQuery.data?.isPremium, remainingUndos]);

  // currentIndex yukarıda, potentialMatches memo'sundan önce tanımlı.
  const [isSwiping, setIsSwiping] = useState(false);
  const [lastSwipeWasPass, setLastSwipeWasPass] = useState(false);

  // Boş kart durumu (radar animasyonu) açıkken her 5sn'de bir potential
  // matches refetch — backend'in yeni profilleri var mı diye yokla. Max 5
  // deneme; sonrasında animasyon devam eder ama istek atmaz. Yeni profil
  // gelirse (isEmpty=false) sayaç resetlenir.
  const pollCountRef = useRef(0);
  const [pollEpoch, setPollEpoch] = useState(0);
  const isEmptyStack =
    !matchesQuery.isLoading && potentialMatches.length <= currentIndex;

  // ── Boş destenin YAPISAL sebebi ─────────────────────────────────────────
  // Backend boş dönerken sessiz değil: `emptyReasonCode` (UT-6xxx) + kardeşi
  // `emptyReason` enum'u ile nedeni taşıyor. Bunlar okunmadığı sürece
  // kullanıcı filtresi çok darken de, profili eksikken de aynı radar
  // animasyonunu izliyordu.
  //
  // Sebep SON sayfadan okunuyor: dolu sayfaların ardından gelen boş sayfa
  // güncel durumu taşır (ilk sayfa dolu geldiyse `emptyReason: "None"`dur).
  const lastPage = matchesQuery.data?.pages?.[matchesQuery.data.pages.length - 1];
  const emptyEntry: CodeEntry | null = useMemo(() => {
    if (!lastPage) return null;
    // Zarftaki `code` ile result'taki `emptyReasonCode` semantik olarak aynı;
    // backend ikisini de doldurabiliyor, hangisi doluysa o kullanılır.
    return resolveCode(
      lastPage.emptyReasonCode ?? lastPage.code,
      lastPage.emptyReason,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPage?.emptyReasonCode, lastPage?.code, lastPage?.emptyReason]);

  // Yapısal sebep VARSA ve o sebep geçici değilse (autoRetry yok) kör yoklama
  // yapma: "filtrelerin çok dar" durumunda 5 kez 5 saniyede bir istek atmanın
  // hiçbir karşılığı yok, sadece kotayı ve pili yiyor. Sebep çözülemediğinde
  // (bilinmeyen kod / alan hiç gelmiyor) eski davranış korunuyor.
  const pollBlocked = emptyEntry != null && !emptyEntry.autoRetry;

  // Foreground'a dönüşte desteyi tazeleme kararı BURADA veriliyor (eskiden
  // AppNavigator koşulsuz invalidate ediyordu). Deste doluysa dokunmuyoruz:
  // kullanıcı destenin ortasındayken tüm sayfaları yeniden çekmek hem 4 ağ
  // isteği + render churn, hem de sırayı kaydırıp kartı altından değiştiriyor.
  // Boşsa tazeliyoruz — AppNavigator'daki asıl gerekçe buydu: önceki oturumdan
  // kalan boş sayfa, kullanıcı filtreye dokunmadan hiç yenilenmiyordu.
  const isEmptyStackRef = useRef(isEmptyStack);
  useEffect(() => {
    isEmptyStackRef.current = isEmptyStack;
  }, [isEmptyStack]);
  const refetchMatches = useEvent(() => {
    matchesQuery.refetch();
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" || !isEmptyStackRef.current) return;
      // Yeni bir "boş deste" periyodu: 5'lik yoklama hakkı da yenilensin,
      // interval yeniden kurulsun (sayaç dolmuşsa effect kendiliğinden
      // çalışmaz, epoch bump'ı olmadan bir daha hiç yoklamaz).
      pollCountRef.current = 0;
      setPollEpoch((e) => e + 1);
      refetchMatches();
    });
    return () => sub.remove();
  }, [refetchMatches]);

  useEffect(() => {
    if (!isEmptyStack) {
      pollCountRef.current = 0;
      return;
    }
    if (pollBlocked) return;
    if (pollCountRef.current >= 5) return;
    const intervalId = setInterval(async () => {
      if (pollCountRef.current >= 5) {
        clearInterval(intervalId);
        return;
      }
      pollCountRef.current += 1;
      // Prune burada YAPILMIYOR. Eskiden refetch sonrası cache'i
      // swipe kümesine göre setQueryData ile yeniden yazıyorduk; iki
      // sorunu vardı: (1) fetchNextPage ile gelen sayfalar bu yoldan hiç
      // geçmediği için swipe edilmiş kullanıcı tekrar kart olarak çıkabiliyordu,
      // (2) her tick cache'i yeniden yazıp gereksiz re-render üretiyordu.
      // Süzgeç artık potentialMatches memo'sunda, tüm veri yollarını kapsıyor.
      await matchesQuery.refetch();
    }, 5000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmptyStack, pollEpoch, pollBlocked]);

  // Refetch (polling veya filter sonrası) backend swipe edilenleri filtrelediği
  // için yeni page 1 daha az profil dönebilir; currentIndex eski uzunluğa göre
  // ileri kalır → length <= currentIndex → EmptyDiscoverCard kilitlenir.
  // Yeni profil geldiyse index'i başa al, listenin başından göstersin.
  useEffect(() => {
    if (potentialMatches.length > 0 && potentialMatches.length <= currentIndex) {
      setCurrentIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potentialMatches.length]);

  const [firePurchaseVisible, setFirePurchaseVisible] = useState(false);

  // Fire kotası bitti → sheet + durumu açıklayan toast birlikte.
  // Toast metni tier'a göre değişiyor: premium'da kota rolling 7-gün cycle ile
  // yenileniyor (satacak bir şey yok, backend de showPaywall:false dönüyor),
  // free'de lifetime hak bitmiş ve kendiliğinden yenilenmiyor.
  const showFireLimitUi = useEvent(() => {
    const resetText = statsQuery.data?.isPremium
      ? formatResetTime(statsQuery.data?.superLikeResetInSeconds, t)
      : null;
    // resetText null → backend "asla resetlenmez" (-1) dedi; cooldown metni
    // yerine tükendi metnine düşüyoruz, yoksa yanlış vaat veriyoruz.
    if (resetText) {
      showInfoToast({
        title: t('discover.swipe.fireCooldownTitle'),
        message: t('discover.swipe.fireCooldownMessage', {
          time: resetText,
        }),
        icon: 'fire',
      });
    } else {
      showInfoToast({
        title: t('discover.swipe.fireExhaustedTitle'),
        message: t('discover.swipe.fireExhaustedMessage'),
        icon: 'fire',
      });
    }
    setFirePurchaseVisible(true);
  });

  // Beğeni kotasının yenilenmesine kalan süre — ÇIPLAK metin, mesajın içine
  // gömülmek için. Ham `swipeResetInSeconds` KULLANILMIYOR: /Stats oturumda bir
  // kez çekiliyor (staleTime: Infinity), saatler önce hesaplanmış bir sayı
  // olduğu yerde donardı. resolveResetSeconds mutlak damgadan
  // (`nextSwipeResetAt`) ya da cache'e yazılma anından tazeliyor.
  // null = gösterilecek geri sayım yok → çağıran süresiz metne düşer, yanlış
  // vaat vermiyoruz (Fire metinlerindeki ayrımın aynısı).
  const resolveSwipeResetText = useEvent(() =>
    formatResetDuration(
      resolveResetSeconds({
        absoluteAt: statsQuery.data?.nextSwipeResetAt,
        seconds: statsQuery.data?.swipeResetInSeconds,
        fetchedAt: statsQuery.dataUpdatedAt,
        now: Date.now(),
      }),
      t,
    ),
  );

  // Kota bitti bilgisi — yalnız BEĞENİ yolunda (buton, sağa kaydırma,
  // backend'in showPaywall'ı). Pass'te BİLEREK sessiziz: pass kotaya sayılmıyor,
  // engellenmiyor ve kullanıcı desteyi elemeye devam ederken her kartta toast
  // yemek istemiyor. Paywall'ı bu fonksiyon AÇMAZ — sheet kararı çağıranın
  // (Fire'taki kalıbın aynısı).
  const showSwipeQuotaExhaustedToast = useEvent(() => {
    const time = resolveSwipeResetText();
    showInfoToast({
      title: t("discover.swipe.quotaExhaustedTitle"),
      message: time
        ? t("discover.swipe.quotaExhaustedMessageWithTime", { time })
        : t("discover.swipe.quotaExhaustedMessage"),
      // Kalp DEĞİL tik: kalp bu ekranda "beğeni gönderildi" işareti, kota
      // toast'ında gönderilmiş bir beğeni yok. Siyah daire iki temada da aynı.
      icon: "check",
    });
  });

  // Kalan hak eşiği (SWIPE_WARN_THRESHOLDS) aşağı doğru geçilince uyarı.
  //
  // Değere doğrudan bakıp "=== 10" demek iki yerde yanılırdı: (1) uygulama
  // zaten 10 hakla açıldığında kullanıcı hiç kaydırmadan toast yerdi, (2)
  // optimistic düşüş ile sunucu cevabı aynı sayıyı iki kez yazınca toast
  // tekrarlardı. O yüzden duyurulan şey değer değil GEÇİŞ: önceki okuma eşiğin
  // üstünde, yenisi eşikte veya altında.
  const lastRemainingSwipesRef = useRef<number | null>(null);
  useEffect(() => {
    const rem = statsQuery.data?.remainingSwipes;
    // Premium / -1 (sınırsız) / null (bilinmiyor) → sayaç anlamsız. Ref de
    // sıfırlanıyor: premium bitip kota geri geldiğinde ilk okuma bir "düşüş"
    // sanılmamalı.
    if (statsQuery.data?.isPremium || rem == null || rem < 0) {
      lastRemainingSwipesRef.current = null;
      return;
    }
    const prev = lastRemainingSwipesRef.current;
    lastRemainingSwipesRef.current = rem;
    // İlk okuma, ya da hak ARTTI (günlük yenilenme, rewind, başarısız swipe'ın
    // geri sarılması) → uyarılacak bir şey yok.
    if (prev == null || rem >= prev) return;
    // 0 bu toast'ın işi değil ("0 hakkın kaldı" demezdi); tükenme mesajı her
    // denemede showSwipeQuotaExhaustedToast'tan çıkıyor.
    if (rem === 0) return;
    if (!SWIPE_WARN_THRESHOLDS.some((th) => prev > th && rem <= th)) return;
    const time = resolveSwipeResetText();
    showInfoToast({
      title: t("discover.swipe.quotaLowTitle"),
      message: time
        ? t("discover.swipe.quotaLowMessageWithTime", { count: rem, time })
        : t("discover.swipe.quotaLowMessage", { count: rem }),
      // Tükenme toast'ıyla aynı simge — ikisi tek hikâyenin iki anı.
      icon: "check",
    });
    // resolveSwipeResetText useEvent — referansı stabil, resubscribe yok.
  }, [
    statsQuery.data?.remainingSwipes,
    statsQuery.data?.isPremium,
    resolveSwipeResetText,
    t,
  ]);

  // Premium modalını açmadan önce canonical state'i tazele (doküman §11):
  // kullanıcı başka bir cihazda premium olmuş olabilir ve ona tekrar satış
  // ekranı göstermek "zaten aldım, hâlâ para istiyor" şikâyetinin kaynağı.
  // Premium çıkarsa modal yerine kotaları tazeliyoruz — bu ekranda "hakkın
  // bitti" sayacı ile premium durumu aynı anda duramaz.
  //
  // NOT: Fire paket sheet'i bu kontrolden GEÇMEZ; o premium'da da açılıyor
  // (backend `showPaywall:true` dönüyor, satılacak paket var — §10).
  const openPremiumPaywall = useEvent(() => {
    dispatch(refreshEntitlementsForPaywall())
      .unwrap()
      .then((premium) => {
        if (premium) {
          statsQuery.refetch?.();
          // Filtreler de premium'a bağlı dönüyor (premiumOnlyFields + kayıtlı
          // premium alanlar); stats'ı tazeleyip onu bayat bırakmak modalı
          // yarım güncel bırakırdı.
          filtersQuery.refetch?.();
          return;
        }
        openLitPlus();
      })
      // Tazeleme başarısızsa paywall'ı YİNE aç: kullanıcıyı satın alma yolundan
      // ağ hatası yüzünden koparmak, gereksiz modaldan daha kötü.
      .catch(() => openLitPlus());
  });

  // Backend SwipeResultDto.ShowPaywall=true geldiğinde (Like/Pass kotası dolu) veya
  // GetPotentialMatches response'unda quota=0 geldiğinde useSwipeMutation uiBus'a event
  // emit eder; biz burada subscribe olup paywall'ı açıyoruz.
  useEffect(() => {
    const unsubSwipe = uiBus.on("swipePaywall", (payload) => {
      // `showPaywall:false` + dolu paywallType = premium kullanıcının cycle'ı
      // doldu (satacak bir şey yok) → sheet AÇILMAZ, sadece bilgi. Eski
      // event'lerde alan yoktu, `=== false` ile geriye dönük uyumlu.
      if (payload?.showPaywall === false) return;
      // Sheet tek başına "neden" demiyor — sağa kaydırma sessizce geri
      // zıplıyordu ve satış ekranı sebepsiz açılmış gibi duruyordu. Toast
      // durumu (ve yenilenme süresini) söylüyor, sheet çıkışı sunuyor.
      //
      // ⚠️ AMA yalnız BEĞENİ kotası yolunda. Bu event'i premium filtreler
      // (FilterModal'daki kilitli bölüm dokunuşu + useSaveFilters'ın 403'ü) ve
      // geri alma kotası da kullanıyor; hepsinde "beğeni hakkın şu saatte
      // yenilenecek" toast'ı çıkması konuyla alakasız bir bilgi veriyordu.
      // `paywallType` yoksa eski/serbest emit (SwipeWrapper sağa kaydırma) —
      // o yol yalnız kota için var, geriye dönük uyumlu kalsın diye toast çıkar.
      const type = payload?.paywallType;
      if (!type || type === "SWIPE_LIMIT") showSwipeQuotaExhaustedToast();
      openPremiumPaywall();
    });
    // Fire kota bittiğinde SwipeWrapper bu event'i emit eder (pull-up swipe).
    const unsubFire = uiBus.on("firePaywall", () => {
      showFireLimitUi();
    });
    // Not bakiyesi biterken backend 200 + showPaywall ile de uyarabiliyor
    // (402 yolu handleSendNote'ta ele alınıyor). İkisi de aynı sheet'i açar.
    const unsubNote = uiBus.on("notePaywall", () => {
      setNotePurchaseVisible(true);
    });
    return () => {
      unsubSwipe();
      unsubFire();
      unsubNote();
    };
    // showFireLimitUi / openPremiumPaywall useEvent — referansları stabil,
    // resubscribe gerekmez.
  }, [showFireLimitUi, openPremiumPaywall, showSwipeQuotaExhaustedToast]);

  const [filterVisible, setFilterVisible] = useState(false);

  // Filtre modalı açılırken tier'ı canonical kaynaktan teyit et. İki cache de
  // kendi başına bayat kalabiliyor: /Stats oturumda BİR KEZ çekiliyor
  // (staleTime: Infinity + refetchOnMount:false), /Filters 5 dk stale duruyor.
  // Premium satın almadan SONRA aktifleşiyorsa — sandbox'ta webhook dakikalar
  // sonra iniyor, RC `purchasePackage` throw edip optimistic patch'i hiç
  // çalıştırmayabiliyor — modal kilitleri ve 50 km tavanı app reload edilene
  // kadar duruyordu.
  //
  // Paywall yolundaki refresh'in aynısı: premium'sa hiç istek atmıyor, 30 sn
  // throttle + 1.5 sn tavan süresi var. Premium çıkarsa redux flip'i UI'ı
  // ANINDA açıyor (useSwipeStats redux'ı /Stats üzerine overlay ediyor);
  // refetch'ler arkadan server-truth kotaları ve premium alan listesini
  // getiriyor.
  const verifyTierForFilters = useEvent(() => {
    dispatch(refreshEntitlementsForPaywall())
      .unwrap()
      .then((premium) => {
        if (!premium) return;
        statsQuery.refetch?.();
        filtersQuery.refetch?.();
      })
      // Teyit başarısızsa elimizdeki değerle devam — modalı bekletmiyoruz.
      .catch(() => {});
  });

  useEffect(() => {
    if (!filterVisible || isPremium) return;
    verifyTierForFilters();
  }, [filterVisible, isPremium, verifyTierForFilters]);

  const lastSwipePromiseRef = useRef(null);

  /*
   * `dragX` ve `buttonDragX` KALDIRILDI (2026-10-13): ilki alttaki kartın
   * tülünü sürükleme oranıyla açıyordu, ikincisinin okuyucusu (kaymayla
   * ölçeklenen eski aksiyon barı) çok önce kalkmıştı. Yatay sürükleme de kartın
   * çıkış uçuşu da yok artık — gerekçenin tamamı SwipeWrapper'da, uçuşun
   * kaldırıldığı not.
   *
   * Rozet kanalları DURUYOR: beğen/geç'te büyük tik/X alev yükselirken kartın
   * üstünde duran tek geri bildirim.
   */
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const programmaticSwipe = useSharedValue(0);
  // Kart yığınının yandan giriş ofseti. Boş-durum aksiyonlarından ÖNCE
  // tanımlı: "Daha uzağı göster" de filtre kaydetme gibi taze desteyi
  // animasyonla içeri alıyor.
  const stackEntryX = useSharedValue(0);

  /**
   * ── YANDAN GİREN DESTE ÖLÇÜLDÜKTEN SONRA KAYIYOR ──────────────────────────
   *
   * Filtre kaydetme ve mesafe sınırını kaldırma, destenin ÜST kartını SIFIRDAN
   * mount ediyor (swipe'ta ise yeni üst kart zaten bir süredir arkada duruyor ve
   * ölçülmüş oluyor). Taze mount'un ilk kareleri sıçramalı: kartın boyu ölçülene
   * kadar isim bloğu ve sağ aksiyon kolonu HİÇ çizilmiyor, ortak nokta pilleri
   * görünmez ölçüm turundan geçiyor (bkz. PillFlow > hideUntilPacked) ve kolonun
   * tabanı pil satırı ölçülünce bir kez daha kayıyor.
   *
   * Eskiden kayma bu sıçramayla AYNI ANDA başlıyordu: kart yanda titreyerek
   * geliyor, yerine oturduktan sonra isim/piller "yok olup geri geliyor",
   * butonlar yeniden hizalanıyordu. Artık deste dışarıda bekliyor ve kayma
   * ancak kart "yerine oturdu" haberini verince başlıyor (aynı haber iskeletin
   * beklediği haber — bkz. coverSettled · SwipeCard > onCoverReady), yani
   * kullanıcı yalnız bitmiş kartın kaymasını görüyor.
   *
   * Bekleme EKRANDA KART OLMADAN geçiyor, o yüzden tavan kısa
   * (STACK_ENTRY_SETTLE_TIMEOUT_MS) ve haber gelmezse kayma yine başlıyor.
   *
   * REWIND BU YOLU KULLANMIYOR (ve kullanmamalı): orada ekranda canlı bir kart
   * duruyor, desteyi yana park etmek o kartı da götürüp arkasındaki sayfa
   * zeminini açıyordu — açık temada tam ekran beyazlık. Geri gelen kart artık
   * hiç kaymıyor, canlı kartın ARDINDA ölçülüyor (bkz. rewindWarmup).
   */
  const pendingStackEntry = useRef(false);
  const stackEntryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releaseStackEntry = useCallback(() => {
    if (!pendingStackEntry.current) return;
    pendingStackEntry.current = false;
    if (stackEntryTimeout.current) {
      clearTimeout(stackEntryTimeout.current);
      stackEntryTimeout.current = null;
    }
    stackEntryX.value = withTiming(0, {
      duration: ENTRY_DURATION,
      easing: ENTRY_EASING,
    });
  }, [stackEntryX]);

  /**
   * Desteyi `offset` kadar yana park et; kaymayı yeni üst kartın ölçüm haberine
   * (ya da tavana) bırak. Üç çağıranı var: rewind (soldan), filtre kaydetme ve
   * mesafe sınırını kaldırma (sağdan).
   */
  const enterStackFrom = useCallback(
    (offset: number) => {
      // Doğrudan atama koşan withTiming'i de iptal ediyor: arka arkaya iki
      // giriş (hızlı rewind) birbirinin yarısından devam etmesin.
      stackEntryX.value = offset;
      pendingStackEntry.current = true;
      if (stackEntryTimeout.current) clearTimeout(stackEntryTimeout.current);
      stackEntryTimeout.current = setTimeout(
        releaseStackEntry,
        STACK_ENTRY_SETTLE_TIMEOUT_MS,
      );
    },
    [releaseStackEntry, stackEntryX],
  );

  /**
   * ── REWIND: GERİ GELEN KART CANLI KARTIN ARDINDA DOĞUYOR ──────────────────
   *
   * Geri alınan profil, `currentIndex` HİÇ KIPIRDAMADAN destenin en altına
   * fazladan bir kart olarak mount ediliyor (bkz. renderStack). Ekranda duran
   * kart tam ekran ve opak, yani ısınan kart görünmüyor; ama normal bir alt kart
   * gibi ölçülüyor — kartın boyu, isim bloğu, pil satırının paketlenmesi. Ölçüm
   * bitince (`onCoverReady`) index tek karede kayıyor: kart son hâlinde, tam
   * boyunda, altındaki kartı tamamen örterek üste geçiyor.
   *
   * KULLANICININ GÖRDÜĞÜ TEK ŞEY YENİ KART: ne beyazlık (deste kıpırdamıyor,
   * sayfa zemini hiç açılmıyor) ne sıçrama (ölçüm örtünün ardında bitti).
   *
   * `currentIndex`E BU PENCEREDE DOKUNULMUYOR, bilerek: index'e bağlı her şey
   * (buton aksiyonları, kota, not hedefi, demir hizalaması) ekranda GÖRÜNEN
   * kartı anlatmaya devam ediyor. Bu yüzden pencere içinde bir swipe gelirse
   * ısınma iptal — index iki yönden birden sürülemez (bkz. cancelRewindWarmup).
   */
  const [rewindWarmup, setRewindWarmup] = useState<string | null>(null);
  const pendingRewind = useRef<string | null>(null);
  const rewindTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Geri gelen kartın giriş ofseti. Destenin KABINA değil KARTA veriliyor —
   * kabı kaydırmak canlı kartı da götürüyordu (bkz. SwipeWrapper > entryX ve
   * aşağıdaki `stackEntryX` ile farkı: o, destenin TAMAMI değişen yollar için).
   */
  const cardEntryX = useSharedValue(0);

  /**
   * ── GİRİŞ KAYMASI COMMIT'TEN SONRA BAŞLIYOR ───────────────────────────────
   *
   * `withTiming` bir dönem `setCurrentIndex` ile AYNI satırda kuruluyordu ve
   * yarışı kaybediyordu: animasyon o anda başlıyor, kart ise ancak React
   * commit'i bitince (bu ekran küçük değil — deste memo'su, hizalama
   * layout-effect'i, kartın kendi ağacı) ÜST KART olup `entryX`i okumaya
   * başlıyor. Arada geçen süre kadarı yutuluyordu; commit uzadığında kayma hiç
   * görünmüyor, kart olduğu yerde PAT diye beliriyordu — "geri al'a bastım,
   * önce eski kart duruyor sonra yeni kart zınk diye geliyor" tarifi bu.
   *
   * Bayrak + dep'siz effect: effect her commit'ten SONRA koşuyor, yani kart
   * ekranda ve başlangıç ofsetinde. Kayma oradan başlıyor.
   */
  const pendingEntryKick = useRef(false);
  useEffect(() => {
    if (!pendingEntryKick.current) return;
    pendingEntryKick.current = false;
    cardEntryX.value = withTiming(0, {
      duration: ENTRY_DURATION,
      easing: ENTRY_EASING,
    });
  });

  const clearRewindTimeout = () => {
    if (rewindTimeout.current) {
      clearTimeout(rewindTimeout.current);
      rewindTimeout.current = null;
    }
  };

  /**
   * Isınan kartı üste al — ölçüm haberiyle ya da tavanda.
   *
   * Kart SOLDAN KAYARAK geliyor: ofset state commit'inden ÖNCE yazılıyor ki
   * kartın üste geçtiği ilk karede zaten dışarıda olsun, sonra `withTiming` onu
   * yerine getiriyor. Kayan tek şey bu kart — altındaki kart yerinde duruyor ve
   * giriş boyunca tam boy kalıyor, yani arada sayfa zemini açılmıyor (bkz.
   * SwipeWrapper > entryX).
   *
   * ÇAPRAZ: dikey pay ve eğim de aynı ofsetten türüyor (bkz. SwipeWrapper >
   * CARD_ENTRY_RISE · CARD_ENTRY_TILT) — hareket, reddetme atışının geri
   * sarımı. Kartın BOYU hiç oynamıyor; giriş animasyonu kaymanın kendisi.
   */
  const commitRewind = useCallback(() => {
    if (!pendingRewind.current) return;
    pendingRewind.current = null;
    clearRewindTimeout();
    setRewindWarmup(null);
    // Ofset ŞİMDİ, kayma commit'ten SONRA (bkz. pendingEntryKick): kart üste
    // geçtiği ilk karede zaten yanda duruyor, yolunu ondan sonra alıyor.
    cardEntryX.value = -CARD_ENTRY_DISTANCE;
    pendingEntryKick.current = true;
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, [cardEntryX]);

  /**
   * Isınmayı DÜŞÜR (index'i kaydırmadan). İki çağıranı var: pencere içinde gelen
   * bir swipe ve geri alma isteğinin başarısız olması.
   */
  const cancelRewindWarmup = useCallback(() => {
    if (!pendingRewind.current) return false;
    pendingRewind.current = null;
    clearRewindTimeout();
    setRewindWarmup(null);
    return true;
  }, []);

  const warmRewind = useCallback(
    (userId: string) => {
      pendingRewind.current = userId;
      setRewindWarmup(userId);
      clearRewindTimeout();
      // Güvenlik ağı: ölçüm haberi hiç gelmezse kart hiç gelmemiş olurdu —
      // haklar düşmüş, geri alma isteği gitmiş ama ekran değişmemiş. ALEV
      // KAPISINI ATLATIYOR (commitRewind, tryCommitRewind değil): ağın işi
      // kilitlenmeyi açmak.
      rewindTimeout.current = setTimeout(
        commitRewind,
        STACK_ENTRY_SETTLE_TIMEOUT_MS,
      );
    },
    [commitRewind],
  );

  /**
   * ── GERİ AL DA ALEVİN ALTINDA DEVREDİYOR (istek, 2026-10-13) ──────────────
   *
   * "Rewind atınca da aynı alev gelsin, kart o sırada değişsin." Yani üç çıkış
   * yönüyle (geç · beğen · Fire, bkz. SwipeWrapper > commitExit) tek dil:
   * kullanıcı ne giden kartı ne gelenini görüyor, yalnız alevi.
   *
   * İKİ SİNYAL BİRLİKTE: alev ekranı kapattı VE geri gelecek kart ölçüldü.
   *   • Yuva yolunda (normal hâl) ikincisi zaten sağlanmış — kart destenin
   *     altında kurulu ve ölçülü duruyor, yani tek bekleyen alev.
   *   • `warmRewind` yolunda (destenin sonu / taze deste) kart şimdi mount
   *     oluyor: hangisi sonra gelirse devri o tetikliyor. Bu yüzden ölçüm
   *     haberi `commitRewind`i DOĞRUDAN değil `tryCommitRewind` üzerinden
   *     çağırıyor — yoksa kart alev henüz yarı yoldayken açıkta değişirdi.
   *
   * `commitRewind` bekleyen basış yoksa no-op, o yüzden iki kapının da
   * kapanmasını beklemek güvenli; sıra önemli değil.
   */
  const rewindFlameUnsub = useRef<(() => void) | null>(null);
  const rewindCovered = useRef(false);
  /**
   * Eşleşme perdesinin örtme aboneliği (bkz. handleSwipe > `matching`). Ayrı
   * ref, çünkü geri al alevinden FARKLI bir olayı bekliyor: biri Keşif'in
   * kendi süpürmesi, öteki MatchModal'ın perdesi.
   */
  const matchCurtainUnsub = useRef<(() => void) | null>(null);

  const tryCommitRewind = useCallback(() => {
    if (!rewindCovered.current) return;
    commitRewind();
  }, [commitRewind]);

  const startRewindUnderCover = useCallback(() => {
    rewindCovered.current = false;
    // Bir önceki alev hâlâ bekliyorsa dinleyicisi bırakılıyor: her basış kendi
    // örtmesini bekler.
    rewindFlameUnsub.current?.();
    rewindFlameUnsub.current = runFlameSweep(() => {
      rewindFlameUnsub.current = null;
      rewindCovered.current = true;
      tryCommitRewind();
    });
  }, [tryCommitRewind]);

  // Ekran ağaçtan düşerse (sekme değişti, tema remount'u) örtme dinleyicileri
  // arkada kalmasın — sözleşme flameSweep'te.
  useEffect(
    () => () => {
      rewindFlameUnsub.current?.();
      rewindFlameUnsub.current = null;
      matchCurtainUnsub.current?.();
      matchCurtainUnsub.current = null;
      // Tutma bayrağı ekranla birlikte gitsin: ekran yeniden mount olduğunda
      // ref sıfırdan doğuyor ama aynı mount'ta iptal edilen bir tutma
      // süzgeci kalıcı olarak bir eleman geriye iterdi.
      deckHoldRef.current = false;
    },
    [],
  );

  /**
   * ── GERİ AL YUVASI: BİR ÖNCEKİ KART UNMOUNT EDİLMİYOR ─────────────────────
   *
   * `warmRewind` yolu doğruydu ama GEÇ: basıştan sonra kart sıfırdan mount
   * oluyor, ölçülüyor, ancak ondan sonra üste geçiyordu. Kullanıcının gördüğü
   * "bastım, bir süre eski kart durdu, sonra yeni kart geldi" — ve ölçüm
   * uzadığında giriş kayması da yetişemiyordu.
   *
   * Çözüm bir zamanlayıcı DEĞİL (bir tur öyle denendi: kullanıcı oyalanırsa
   * kart arkada ısınıyordu — basış erken gelince hiçbir şey kazanmıyordu,
   * yani "bazen hızlı" oluyordu ki en kötüsü o). Artık yapısal: deste
   * ilerlerken ekrandan çıkan kart UNMOUNT EDİLMİYOR, destenin en altındaki
   * yuvada kalıyor. Geri alınacak kart her zaman "bir önce ekranda duran kart"
   * olduğu için yuvadaki kart HER ZAMAN kurulmuş ve ölçülmüş oluyor; basışta
   * yapılacak iş index'i bir geri almaktan ibaret.
   *
   * MOUNT/UNMOUNT TRAFİĞİ ARTMIYOR: her swipe'ta yine bir kart doğuyor (deste
   * önü) ve bir kart ölüyor (yuvanın altı) — yalnız kurban değişti. Bedel
   * ekranda duran kart sayısı: ikiden üçe çıktı. Üçüncünün ağır paneli
   * soğuyarak düşüyor (bkz. SwipeCard > PANEL_COOLDOWN_MS), yani kalıcı olarak
   * taşıdığı şey kapak + zemin.
   *
   * ⚠️ YUVA, ALTTAKİ KART VARKEN KURULUYOR: destenin sonunda (arkada kart yok)
   * üstteki kartı sürüklemek yuvadaki kartı AÇIĞA ÇIKARIRDI — kullanıcı az önce
   * geçtiği kişiyi arkada görürdü. O durumda eski `warmRewind` yolu devrede.
   */
  const rewindSlotIdRef = useRef<string | null>(null);

  // Ölçüm haberi — pratikte yalnız `warmRewind` yolunda işe yarıyor: yuva
  // kuruluyken kart çoktan ölçülmüş oluyor ve haber (tek atımlık, bkz. SwipeCard
  // > coverReadyNotifiedRef) bir daha gelmiyor. Bekleyen basış yoksa no-op.
  const handleRewindSlotReady = useEvent(() => {
    // `tryCommitRewind`: ölçüm geldi ama alev henüz örtmediyse devir bekliyor
    // (bkz. startRewindUnderCover).
    if (pendingRewind.current) tryCommitRewind();
  });

  // Ekran ağaçtan düşerse bekleyen tavanlar arkada kalmasın.
  useEffect(
    () => () => {
      if (stackEntryTimeout.current) clearTimeout(stackEntryTimeout.current);
      if (rewindTimeout.current) clearTimeout(rewindTimeout.current);
    },
    [],
  );

  // ── "Mesafe sınırını kaldır" (kalıcı anahtar) ───────────────────────────
  // Mesafe KATI filtre: yarıçap dışındaki profiller hiç gelmiyor ve backend
  // kendiliğinden genişletmiyor. Az kullanıcılı şehirlerde deste bu yüzden
  // boşalıyordu; kaçış yolu artık filtrelerdeki KALICI `ignoreDistanceFilter`
  // anahtarı (2026-08-22). Tek seferlik "daha uzağı göster" akışı —
  // `canExpandRadius` / `wasRadiusExpanded` / `?expandRadius=true` — tamamen
  // kaldırıldı; backend o alanları artık göndermiyor.
  //
  // Anahtar ZATEN AÇIKKEN buton çizilmemeli: basmak hiçbir şeyi değiştirmez,
  // kullanıcı aynı boş desteye bakmaya devam eder. Eskiden bu kararı backend
  // veriyordu (`canExpandRadius`); alan kalktığı için koşul burada kuruluyor.
  // İki kaynak da okunuyor — deste yanıtı (bu destenin gerçeği) ve filtre
  // yanıtı (kaydedilmiş tercih) — hangisi taze gelirse gelsin buton doğru
  // davransın.
  const distanceLimitAlreadyOff =
    lastPage?.distanceFilterIgnored === true ||
    filters?.ignoreDistanceFilter === true;

  const removeDistanceLimit = useEvent(async () => {
    if (ignoreDistanceMutation.isPending) return;
    try {
      await ignoreDistanceMutation.mutateAsync(true);
      // Taze deste listenin BAŞINDAN gösterilmeli. currentIndex tükenmiş
      // destenin sonunda duruyor; sıfırlanmazsa yeni deste ondan uzunsa
      // baştaki profiller sessizce atlanırdı. Filtre kaydetme yolundaki
      // (handleSaveFilters) davranışın aynısı — giriş animasyonu dahil.
      setCurrentIndex(0);
      enterStackFrom(ENTRY_DISTANCE);
    } catch (err: any) {
      // Sessiz kalma: kullanıcı butona bastı, deste hâlâ boş — hiçbir şey
      // olmadıysa bunu bilmeli, yoksa buton bozuk sanılıp tekrar tekrar
      // basılıyor.
      Alert.alert("", err?.message || t("discover.distanceLimit.error"));
    }
  });

  /**
   * İlk kartın kapak fotoğrafı hazır mı — iskelet bunu bekliyor.
   *
   * Kart, fotoğrafı gelmeden mount edildiğinde ekranda ARA BİR KARE oluyordu:
   * kabuk çizilmiş, kapak boş, iskeletin kendisi ise kartın geometrisiyle
   * (kabuk kartın göründüğü alandan uzun, kapak kutusu ondan da uzun ve yukarı
   * kaydırılmış) bir türlü aynı boya oturmuyordu. Her denemede farklı bir gri
   * dikdörtgen kalıyordu.
   *
   * Çözüm ölçüyü düzeltmek değil, o kareyi HİÇ ÇİZMEMEK: fotoğraf önceden
   * yükleniyor, kart ancak hazır olduğunda mount ediliyor. Ekran iskeletten
   * doğrudan gerçek karta geçiyor.
   *
   * BİR KEZ: yalnız ilk kart için. Deste ilerlerken (swipe) sonraki kartların
   * fotoğrafları zaten arka planda prefetch ediliyor (bkz. SwipeCard) ve orada
   * beklemek her kaydırmada iskelet göstermek olurdu.
   */
  const [firstPhotoReady, setFirstPhotoReady] = useState(false);
  useEffect(() => {
    if (firstPhotoReady) return;
    const first = potentialMatches[0];
    if (!first) return;
    const uri = first.photos?.[0];
    // Fotoğrafsız profilde beklenecek bir şey yok.
    if (!uri) {
      setFirstPhotoReady(true);
      return;
    }
    let cancelled = false;
    // `finally`: yükleme başarısız olsa da kartı göster — aksi halde ağ hatası
    // ekranı kalıcı iskelette bırakırdı.
    ExpoImage.prefetch(uri)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFirstPhotoReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [potentialMatches, firstPhotoReady]);

  /**
   * Kapağın alt chrome'u (yazı bloğu + sağ buton kolonu) yerine oturdu mu —
   * iskelet fotoğraftan SONRA bir de bunu bekliyor.
   *
   * Fotoğrafın hazır olması yetmiyordu: o blokların yerleşimi ölçüme bağlı
   * (bkz. SwipeCard > onCoverReady) ve ölçümler ilk karede yok. Kullanıcı
   * iskeletten çıkınca butonların hizalanmasını ve ortak nokta pillerinin
   * kaybolup geri gelmesini görüyordu. Kart ölçülürken iskelet ÜSTÜNDE
   * duruyor — kart mount olmadan ölçüm de yapılamaz, o yüzden "iskelet mi kart
   * mı" değil, "kartın üstünde iskelet".
   *
   * BİR KEZ, firstPhotoReady ile aynı gerekçe: sonraki kartlar üstteki kartın
   * ARDINDA ölçülüyor, oraya iskelet koymak her kaydırmada perde indirmek
   * olurdu.
   */
  const [coverSettled, setCoverSettled] = useState(false);
  /**
   * HABER İKİ YERE GİDİYOR: perdeyi kaldırıyor (ilk kart) ve yanda park etmiş
   * desteyi içeri alıyor (rewind · filtre) — ikisi de "kart artık sıçramaz"
   * demenin iki ayrı bağlamı, bkz. enterStackFrom.
   *
   * Kart başına BİR KEZ geliyor (SwipeCard > coverReadyNotifiedRef) ve yalnız
   * ÜST karttan: taze mount eden her üst kart kendi haberini veriyor, yani
   * rewind'de geri gelen kart da.
   */
  const handleCoverReady = useCallback(() => {
    setCoverSettled(true);
    releaseStackEntry();
  }, [releaseStackEntry]);

  /**
   * Ekranda kart KALMAYINCA perde yeniden kuruluyor.
   *
   * Deste tükenip (boş kart) sonra takviye gelince yeni kart gene ÜST kart
   * olarak doğuyor, yani ölçüm sıçraması açılıştaki ile birebir aynı. Bayrak
   * tek seferlik bırakılırsa o sıçrama orada geri geliyordu.
   *
   * KAYDIRMA SIRASINDA SIFIRLANMIYOR: koşul "deste bitti mi", "kart değişti mi"
   * değil. Her kaydırmada sıfırlamak ekrana iskelet indirmek olurdu — sonraki
   * kartlar zaten üstteki kartın ardında ölçülüyor.
   */
  const deckHasCard = potentialMatches.length > currentIndex;
  useEffect(() => {
    if (!deckHasCard) setCoverSettled(false);
  }, [deckHasCard]);

  /**
   * Güvenlik ağı: ölçüm haberi hiç gelmezse iskelet kalıcı olmasın.
   *
   * `onCoverReady` onLayout zincirine bağlı (kartın boyu, yazı bloğu, pillerin
   * paketlenmesi) ve o zincir çalışmayan ortamlar var (jest), ayrıca beklenmeyen
   * bir dal haberi hiç vermeyebilir. Takılı kalan bir iskelet, görünen bir
   * sıçramadan KÖTÜ: süre dolunca kart olduğu gibi açılıyor.
   */
  useEffect(() => {
    if (coverSettled || !firstPhotoReady) return;
    const id = setTimeout(() => setCoverSettled(true), COVER_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [coverSettled, firstPhotoReady]);

  // ── Profil keşifte görünmüyorken ETKİLEŞİMLER kilitli ───────────────────
  // GÖRÜNÜRLÜK KİLİT DEĞİL: profil keşif havuzunda görünmüyorken de (fotoğraf
  // incelemede / yetersiz görünür fotoğraf) beğeni, Fire, pass ve not
  // SERBEST. Backend hiçbir uçta foto onayına bakmıyor (rehber §3) — istemcinin
  // kapatması sunucuda karşılığı olmayan bir kural yaratıyordu; kullanıcı
  // butonun neden çalışmadığını anlamıyordu. Durum yalnızca ANLATILIYOR:
  // Discover'da bir kez `ProfileHiddenGate`, profil ekranında kalıcı
  // `ProfileVisibilityBanner`.
  //
  // Tek istisna `Suspended`: o hesap yaptırımı ve kapısı navigator'ın dışında
  // (`AccountBlockedScreen`) — bu ekran hiç mount olmuyor.

  // ── Boş durum metni + aksiyonu ──────────────────────────────────────────
  // Karar `emptyDeckCopy.ts`de (saf + test edilebilir). Özet: mesafe sınırı
  // hâlâ uygulanıyorsa "Mesafe sınırını kaldır" deste hangi sebeple boşalırsa
  // boşalsın teklif edilir; sebebin kendi aksiyonu birincil buton olarak
  // kalır, teklif altına ikincil satır olarak biner.
  const emptyCopy = useMemo(
    () =>
      resolveEmptyDeckCopy({
        entry: emptyEntry,
        backendMessage: lastPage?.emptyReasonMessage,
        distanceLimitOff: distanceLimitAlreadyOff,
        deckSettled: isEmptyStack,
        t,
      }),
    [
      emptyEntry,
      lastPage?.emptyReasonMessage,
      distanceLimitAlreadyOff,
      isEmptyStack,
      t,
    ],
  );

  // `removeDistanceLimit` filtre ekranını AÇMIYOR, anahtarı doğrudan açıyor:
  // tek dokunuşla çözülen bir sorun için ekran değiştirmek gereksiz sürtünme.
  // Kullanıcının seçtiği `maxDistance`a dokunulmuyor — saklanıyor ve anahtar
  // kapatılınca geri geliyor.
  const handleEmptyAction = useEvent(() => {
    switch (emptyCopy?.actionKind) {
      case "removeDistanceLimit":
        removeDistanceLimit();
        return;
      case "openFilters":
        setFilterVisible(true);
        return;
      case "completeProfile":
        navigation.navigate("Profile");
        return;
      case "openPaywall":
        openPremiumPaywall();
        return;
      case "retry":
        // Yoklama hakkını da yenile: PoolWarming'de kullanıcı butona basınca
        // yalnız tek istek değil, yeni bir 5'lik tur başlasın.
        pollCountRef.current = 0;
        setPollEpoch((e) => e + 1);
        refetchMatches();
        return;
      case "contactSupport": {
        const code = emptyEntry?.code ?? "";
        const subject = encodeURIComponent(
          t("discover.empty.supportSubject", {
            code,
            defaultValue: code,
          }),
        );
        Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(
          () => {},
        );
        return;
      }
      default:
        return;
    }
  });

  // ─── Tutorial (ilk giriş kart swipe demo) ────────────────────────────────
  // Flag hesap bazlı: aynı cihazda açılan yeni hesap jesti hiç görmemiş bir
  // kullanıcıdır, tekrar göstermek gerekir.
  const TUTORIAL_TX = 55; // like/pass threshold (85) altında
  const TUTORIAL_SWING_DURATION = 550;
  const TUTORIAL_STORAGE_KEY = "discoverSwipeTutorialShown";
  // Görünürlük kapısı en fazla bu kadar bekler (bkz. tutorialResolved).
  const TUTORIAL_GATE_MAX_WAIT = 8000;
  // currentUserId yukarıda, deste hidrasyonundan önce okunuyor.
  // KVKK onay sheet'i navigator'ın üstünde açılıyor; onaylanana kadar Discover
  // odaklı sayılsa da kart modalın arkasında kalıyor. Tutorial'ı onay sonrasına ertele.
  const kvkkAccepted = useAppSelector(
    (s) => s.auth.kvkkVersion === CURRENT_KVKK_VERSION,
  );
  const tutorialTx = useSharedValue(0);
  const tutorialOpacity = useSharedValue(0);
  const [tutorialActive, setTutorialActive] = useState(false);
  // "Oynuyor mu" guard'ı + aynı mount'ta tekrar oynamasın diye tek seferlik gate.
  const tutorialLiveRef = useRef(false);
  const tutorialDoneRef = useRef(false);
  const screenFocused = useIsFocused();

  /**
   * Görünürlük kapısı (`ProfileHiddenGate`) demoyu beklesin mi?
   *
   * Kapı kartın ÜSTÜNDE açılıyor; profili havuzda görünmeyen (fotoğrafları
   * incelemede olan) YENİ kullanıcıda demo kapının arkasında oynayıp bir daha
   * oynamamak üzere "görüldü" işaretleniyordu. Kapı, demo çözülene kadar
   * bekletiliyor — bkz. swipeTutorialGate.ts.
   *
   * "Çözüldü" = oynadı/yarıda kesildi, ya da oynamayacağı kesinleşti: bayrak
   * zaten yazılı (mount'ta senkron okunuyor — kapı bir kare bile boşuna
   * gecikmesin), demo edilecek kart yok, ya da güvenlik süresi doldu. Süre
   * kaçışı olmadan deste hiç gelmezse kapı sonsuza dek kapalı kalır ve
   * kullanıcı profilinin neden gizli olduğunu HİÇ öğrenemezdi.
   *
   * currentUserId'nin mount'ta dolu olduğu varsayımı yukarıdaki deste
   * hidrasyonuyla (loadDeckProgress) aynı: bu ekran main navigator altında.
   */
  const [tutorialResolved, setTutorialResolved] = useState(() =>
    currentUserId
      ? appPrefs.getBoolean(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`) === true
      : true,
  );

  useEffect(() => {
    setSwipeTutorialBlocking(!tutorialResolved && screenFocused);
  }, [tutorialResolved, screenFocused]);
  // Ekran ağaçtan kalkarsa bayrak asılı kalmasın (kapıyı kilitler).
  useEffect(() => () => setSwipeTutorialBlocking(false), []);

  // markSeen=true → demo sonuna kadar oynadı, flag yazılır. Ekran erkenden
  // arkaplana düşerse yazılmaz; bir sonraki açılışta tekrar oynar.
  const stopTutorial = useEvent((markSeen: boolean) => {
    if (!tutorialLiveRef.current) return;
    tutorialLiveRef.current = false;
    // markSeen'den BAĞIMSIZ: demo bu mount'ta bir daha oynamıyor
    // (tutorialDoneRef), kapıyı daha fazla bekletmenin anlamı yok.
    setTutorialResolved(true);
    cancelAnimation(tutorialTx);
    cancelAnimation(tutorialOpacity);
    tutorialTx.value = withTiming(0, { duration: 150 });
    tutorialOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setTutorialActive)(false);
    });
    if (markSeen && currentUserId) {
      appPrefs.set(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`, true);
    }
  });

  // Ekran arkaplana/başka route'a düşerse demoyu boşluğa oynatma.
  useEffect(() => {
    if (!screenFocused) stopTutorial(false);
  }, [screenFocused, stopTutorial]);

  const hasCardToDemo = potentialMatches.length > 0;

  /**
   * Demonun oynayabilmesi için deste YETMİYOR, EKRANDA GERÇEK KART OLMALI.
   *
   * `potentialMatches` diskten hidrasyonla (loadDeckProgress) ya da taze
   * istekle mount'un ilk karelerinde dolabiliyor; kart ise kapak fotoğrafı
   * hazır olmadan mount EDİLMİYOR, o arada ekranda `SkeletonCard` duruyor (bkz.
   * firstPhotoReady). Demo yalnız `!loading && hasCardToDemo`ya bakıyordu, yani
   * uygulama açılır açılmaz İSKELETİN üstünde oynuyordu: salınan bir kart yok,
   * oklar ve perde boşluğa geliyor ve bitişte "görüldü" yazıldığı için jest bir
   * daha da gösterilmiyordu.
   *
   * KAPIYI (`tutorialResolved`) BU DEĞİL `hasCardToDemo` SÜRÜYOR ve öyle
   * kalmalı: kapı "demo oynamayacağı kesinleşti mi" diye soruyor, fotoğraf
   * beklenirken cevap "henüz bilinmiyor"dur. Buraya bağlanırsa deste varken bile
   * kapı hemen açılıp demoyu kaçırırdı; fotoğraf hiç gelmezse de
   * TUTORIAL_GATE_MAX_WAIT zaten kurtarıyor.
   *
   * `coverSettled` DE ŞART, aynı gerekçenin devamı: kart mount olduktan sonra
   * da kapağın alt chrome'u ölçülene kadar iskelet onun ÜSTÜNDE duruyor (bkz.
   * coverSettled). O perdenin ardında oynayan demo de görülmez. İkisi sırayla
   * geldiği için kilitlenme yok — ölçüm haberi gelmezse 600 ms'lik güvenlik ağı
   * coverSettled'ı zaten açıyor.
   */
  const cardReadyToDemo = hasCardToDemo && firstPhotoReady && coverSettled;

  // Demo oynamayacağı kesinleşince kapıyı serbest bırak. Oynamaya başladıysa
  // (tutorialActive) karışma: bitişte stopTutorial zaten çözüyor. KVKK onayı
  // beklenirken saat işletilmiyor — onay sheet'i uzun sürerse kapı, demo hiç
  // oynamadan açılırdı.
  useEffect(() => {
    if (tutorialResolved || tutorialActive) return;
    if (!loading && !hasCardToDemo) {
      setTutorialResolved(true);
      return;
    }
    if (!kvkkAccepted) return;
    const id = setTimeout(
      () => setTutorialResolved(true),
      TUTORIAL_GATE_MAX_WAIT,
    );
    return () => clearTimeout(id);
  }, [tutorialResolved, tutorialActive, loading, hasCardToDemo, kvkkAccepted]);

  useEffect(() => {
    // İSKELETİN üstünde oynamasın: gerçek kart mount olana kadar bekle (bkz.
    // cardReadyToDemo).
    if (loading || !cardReadyToDemo || !currentUserId) return;
    if (!screenFocused || tutorialDoneRef.current) return;
    // KVKK onay sheet'i kapanmadan tutorial oynatma (kart modalın arkasında kalır).
    if (!kvkkAccepted) return;
    // MMKV senkron — eski AsyncStorage.then() + cancelled-guard yarışı kalktı.
    if (appPrefs.getBoolean(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`)) return;
    tutorialDoneRef.current = true;
    tutorialLiveRef.current = true;
    setTutorialActive(true);
    tutorialTx.value = 0;
    tutorialOpacity.value = withDelay(400, withTiming(1, { duration: 250 }));
    tutorialTx.value = withDelay(
      600,
      withSequence(
        withTiming(TUTORIAL_TX, {
          duration: TUTORIAL_SWING_DURATION,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(-TUTORIAL_TX, {
          duration: TUTORIAL_SWING_DURATION * 1.4,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(
          0,
          {
            duration: TUTORIAL_SWING_DURATION,
            easing: Easing.inOut(Easing.cubic),
          },
          () => {
            runOnJS(stopTutorial)(true);
          },
        ),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, cardReadyToDemo, currentUserId, screenFocused, kvkkAccepted]);

  // Stack entry (undo / filtre sonrası yandan giriş) + tutorial salınımı tek
  // animated style'da: iki ayrı style'ın `transform` key'i flatten'da birbirini
  // ezer, sonuncusu kazanırdı → entry animasyonu hiç görünmezdi.
  const cardStackStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: stackEntryX.value + tutorialTx.value },
      {
        rotate: `${interpolate(tutorialTx.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15])}deg`,
      },
    ],
  }));

  const tutorialOverlayStyle = useAnimatedStyle(() => ({
    opacity: tutorialOpacity.value,
  }));

  const tutorialLeftArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tutorialTx.value, [-TUTORIAL_TX, 0], [-16, 0], "clamp") },
    ],
  }));

  const tutorialRightArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tutorialTx.value, [0, TUTORIAL_TX], [0, 16], "clamp") },
    ],
  }));

  /**
   * Kart kabının alt dolgusu — ARTIK ANİMASYONLU DEĞİL, ve deste varken SIFIR.
   *
   * Kapak fotoğrafı ekranın dibine kadar iniyor: yüzen tab bar'ın altına da
   * giriyor, yani kart tam ekran bir fotoğraf olarak duruyor. Çekişte kart
   * yalnız YUKARI kayıyor (alt kenarı ekranın dibinde sabit) ve altından panel
   * geliyor — açılış tek yönlü bir hareket.
   *
   * Eskiden burada `tabBarOccupied * (1 - cardExpandAnim)` vardı: kart kapalı
   * hâlde tab bar'ın üstünde bitiyor, açılırken dolgu eriyip kart aşağı
   * uzuyordu. İki sorunu vardı — panel aşağıdan gelirken tam o bandın üstünde
   * kesiliyordu, ve dolgu her karede layout'u yeniden hesaplatıyordu (kartın
   * `bottom`u ve panelin `marginTop`u ile birlikte üçüncü layout animasyonu).
   *
   * KAPALI kart tab bar'ın ÜSTÜNDE bitiyor — dolgu her zaman duruyor. Açılışta
   * kabuk bu payı da yiyerek ekranın dibine iniyor, ama onu `bottom` yapıyor
   * (bkz. SwipeWrapper animatedStyle), dolgu değil: kap sabit kaldıkça kartın
   * altındaki her şey (panelin geleceği alan) tek bir yerden ölçülüyor.
   *
   * BU SAYININ TEK OKURU KALDI: kapağın yazı bloğu (bkz. aşağıda
   * `coverBottomInset`). Buradaki `tabBarOccupied` bağı destesi olmayan
   * hâllerin sarmalayıcısıyla birlikte söküldü.
   */

  /**
   * ── ÜST ŞERİDİN KARARTMASI KALDIRILDI (istek) ────────────────────────────
   *
   * Burada `headerScrimStyle` vardı: kart açılırken şeridin üstüne
   * `EXPAND_SCRIM_ALPHA` oranında siyah bir perde iniyordu.
   *
   * Gerekçesi kayıt için duruyor — geri istenirse sıfırdan tartışılmasın:
   * şerit bir dönem yalnız soluyordu ve "zemin zaten koyu, karartma görünmez"
   * deniyordu; o gerekçe AÇIK MODDA geçmiyor, orada zemin beyaz kalıyor ve
   * geçiş "kart bir sayfanın üstüne biniyor" yerine "kart boşluğa kayıyor" gibi
   * okunuyordu. Perde, referans alınan geçişteki (Instagram gönderi açılışı)
   * "arka sayfa solmuyor, KARARIYOR" görüntüsünü veriyordu. 0.92 fazla (şerit
   * simsiyah), 0.3 az (geri çekilme okunmuyor), 0.45 yerleşen değerdi.
   *
   * Geri gelirse kartın içindeki eşiyle (SwipeCard > cardGapScrimStyle) AYNI
   * oranı okumalı; ayrışırlarsa kartın üstü ile kapak-panel arası farklı tonda
   * kararıyor.
   */

  // Expanded'ken header ikonları (rewind/filtre) çalışmasın — sadece kart mode'da
  // aktif. cardExpandAnim'i JS boolean'a çevirip ikon satırının touch'unu kapatırız.
  const [headerLocked, setHeaderLocked] = useState(false);
  useAnimatedReaction(
    () => cardExpandAnim.value > 0.5,
    (v, prev) => {
      if (v !== prev) runOnJS(setHeaderLocked)(v);
    },
  );

  // ── Deste takviyesi: kuyruk 5'in altına düşünce ─────────────────────────
  // Karar mantığı deckTopUp.ts'te (sonsuz döngü guard'ı + neden refetch'in yeni
  // profil getirdiği orada anlatılıyor). Buradaki tek iş kararı uygulamak.
  //
  // Eskiden yalnız fetchNextPage vardı: `hasNextPage` false dönen destede
  // takviye HİÇ olmuyordu, kullanıcı 10 kartı bitirip radar ekranına düşüyor ve
  // yeni profilleri boş-deste yoklamasının ilk tick'inde (≥5sn sonra) görüyordu.
  const lastTopUpSigRef = useRef<string | null>(null);
  const lastTopUpRefetchAtRef = useRef(0);
  useEffect(() => {
    // Kuyruk = henüz gösterilmemiş kartlar. Slice yalnız eşiğin altındayken
    // anlamlı ama ölçüsü zaten küçük; dizi kimliği üzerinden karar veriyoruz
    // çünkü refetch sayfayı ekleme değil DEĞİŞTİRME yapıyor (uzunluk yanıltır).
    const tailIds = potentialMatches
      .slice(currentIndex)
      .map((p: any) => p?.userId)
      .filter(Boolean) as string[];
    const { action, signature } = decideTopUp({
      tailIds,
      // isFetchingNextPage değil isFetching: polling refetch uçarken araya
      // fetchNextPage sokmak sayfaları çakıştırıyor.
      isFetching: matchesQuery.isFetching,
      hasNextPage: !!matchesQuery.hasNextPage,
      refetchBlocked: pollBlocked,
      lastSignature: lastTopUpSigRef.current,
      msSinceLastRefetch: Date.now() - lastTopUpRefetchAtRef.current,
    });
    if (action === "reset") {
      lastTopUpSigRef.current = null;
      return;
    }
    if (action === "none") return;
    lastTopUpSigRef.current = signature;
    if (action === "next-page") {
      matchesQuery.fetchNextPage();
      return;
    }
    lastTopUpRefetchAtRef.current = Date.now();
    refetchMatches();
  }, [
    currentIndex,
    potentialMatches,
    pollBlocked,
    matchesQuery.hasNextPage,
    matchesQuery.isFetching,
    matchesQuery.fetchNextPage,
    refetchMatches,
  ]);

  /**
   * Bu profile gidecek bir beğeni EŞLEŞMEYLE mi sonuçlanır?
   *
   * İki kaynak OR'lanıyor, ikisi de eksik olabildiği için:
   *   • Kartın kendi `hasLikedMe` bayrağı — free üyede düz beğeni için her zaman
   *     `false` geliyor (yalnız Fire/not gerçek değeri taşıyor, bkz. DTO).
   *   • Yerel "beni beğenenler" kümesi — yalnız ÇEKİLEN SAYFAYI biliyor, yani
   *     ikinci sayfadaki bir liker burada görünmüyor.
   * Kestirim yanlışsa maliyet küçük ve tek yönlü: eşleşme sanılmayan bir süper
   * beğenide alev süpürmesi oynar, MatchModal da ardından açılır (düzeltmeye
   * çalıştığımız eski davranışın ta kendisi) — tersi, yani eşleşmeyen bir
   * Fire'ın kutlamasız kalması olmuyor.
   *
   * Kümeyi `store.getState()` ile okuyoruz: selector'la abone olmak her gelen
   * beğenide desteyi yeniden render ederdi (bkz. hasLikedMe'nin kendi notu).
   */
  const willMatchOnLike = useEvent(
    (profile: PotentialMatch | null | undefined) =>
      profile?.hasLikedMe === true ||
      hasLikedMe(store.getState(), profile?.userId),
  );

  const handleSwipe = useEvent((direction, userId, matching) => {
    if (userId) swipedAtRef.current.set(userId, Date.now());
    // Rewind ısınması varsa DÜŞ: index'i iki yönden birden süremeyiz. Bu
    // pencere ~60ms, yani buraya ancak kullanıcı geri al'a basıp hemen
    // ardından kaydırdıysa düşülür; o durumda görünen kartın kaydırılması
    // kazanıyor, geri gelen kart sonraki tazelemede yine destede olur.
    cancelRewindWarmup();
    /**
     * DESTENİN İLERLEMESİ — ya şimdi ya PERDENİN ALTINDA.
     *
     * Çağrıldığı an zaten örtülü oluyor: geç/beğen/Fire'da kart alevin ekranı
     * tam kapattığı karede buraya geliyor (bkz. SwipeWrapper >
     * runCoveredExit), yani burada beklenecek bir şey yok.
     *
     * TEK İSTİSNA `matching`: o dalda alev süpürmesi hiç oynamıyor (kutlama
     * MatchModal'ın perdesi) ve perde ancak aşağıdaki isteğin eşleşme
     * bildirimi dönünce açılıyor. İstek ŞİMDİ gidiyor, index ise perdenin
     * ekranı kapladığı anı bekliyor (bkz. flameSweep > runMatchCurtain) —
     * yoksa "önce kart değişiyor, sonra alev modalı geliyor" oluyordu.
     *
     * Kart o pencerede ekranda duruyor ama kilitli: SwipeWrapper'ın
     * `exitPending` bayrağı ikinci kararı yutuyor, buton kilidi de (1300 ms)
     * aynı pencereyi örtüyor.
     */
    const advanceDeck = () => {
      // Perde altında ilerliyorsa expand değerleri DE burada sıfırlanmalı —
      // sırası `dropProfileFromDeck`takiyle aynı, yoksa yeni top kart donmuş
      // bir oranla doğuyor. Örtüsüz dalda SwipeWrapper çoktan yapmış oldu;
      // ikinci kez yazmak zararsız (ham atama).
      deckHoldRef.current = false;
      resetCardExpandState();
      setCurrentIndex((i) => i + 1);
    };
    if (matching) {
      matchCurtainUnsub.current?.();
      // Kart gönderildi ama ekranda: süzgeç onu kuyruktan ELEMESİN (bkz.
      // deckHoldRef).
      deckHoldRef.current = true;
      matchCurtainUnsub.current = runMatchCurtain(() => {
        matchCurtainUnsub.current = null;
        advanceDeck();
      });
    } else {
      advanceDeck();
    }
    analytics.capture('swipe', { direction });
    const isPass = direction === "left";
    setLastSwipeWasPass(isPass);
    // Kartın kendisi — aşağıdaki kaçırılmış eşleşme toast'ında lazım.
    const swiped = potentialMatches.find((p) => p?.userId === userId);
    // ⚠️ Fire gönderiminde TOAST YOK (bilerek): ekranı süpüren kutlama alevi
    // (bkz. flameSweep) onayı zaten veriyor, üstüne banner düşürmek aynı anı
    // iki kez duyurmak oluyordu. Bir süre "alev kimin Fire aldığını
    // söylemiyor" gerekçesiyle toast duruyordu; ürün kararı görsel onayın
    // yeterli olduğu. Notun toast'ı DURUYOR — orada kutlama premium rozetini
    // gösteriyor, gönderimi değil (bkz. handleSendNote).
    // Destedeki bu kart beni beğenmiş biri miydi? Öyleyse yön ne olursa olsun
    // artık "bekleyen beğeni" değil: sağa kaydırma match yaratır, sola kaydırma
    // eşleşmeyi kaçırır. Rozet iki durumda da ANINDA düşer — MatchNotification'ı
    // ya da bir sonraki WhoLikedMe fetch'ini beklemeden.
    // store.getState(): selector'la abone olmak her gelen beğenide desteyi
    // yeniden render ederdi (render churn = commit-storm riski).
    if (hasLikedMe(store.getState(), userId)) {
      dispatch(removeWhoLikedMe(userId));
      // Likes ekranı mount'sa listesinden düşürsün — sayacı O dispatch etmez.
      uiBus.emit("likerHandled", { userId });
      if (isPass) {
        showMissedMatchToast({
          name: swiped?.displayName,
          photoUrl: swiped?.photos?.[0] || swiped?.profileImageUrl,
        });
      }
    }
    lastSwipePromiseRef.current = swipeMutation.mutateAsync({
      direction,
      userId,
    });
  });

  const handleRewind = async () => {
    // Premium kapısı EN ÖNDE. Aşağıdaki guard'lar önce çalışırsa free kullanıcı
    // like attıktan sonra rewind'e bastığında sessiz no-op oluyor — ne paywall
    // ne geri bildirim. Kilitli kullanıcı için son swipe'ın ne olduğu alâkasız:
    // buton "premium özelliği" diyor, tap her hâlükârda paywall açmalı.
    if (undoLocked) {
      openPremiumPaywall();
      return;
    }
    if (currentIndex === 0) return;
    if (!lastSwipeWasPass) return;
    // Bir geri alma zaten alevin altında bekliyor: ikinci basış aynı kartı bir
    // kez daha geri almaya çalışırdı (index henüz kaymadı). `lastSwipeWasPass`
    // bunu pratikte zaten tutuyor — bu, pencerenin açık kaldığı ~800 ms için
    // açık güvence.
    if (rewindFlameUnsub.current) return;
    if (remainingUndos === 0) {
      // Buraya yalnız premium + kalan hak 0 düşer (free zaten undoLocked'ta
      // yakalandı). openPremiumPaywall entitlement'ı tazeleyip premium çıkarsa
      // modal yerine kotayı refetch ediyor — premium'a "satın al" göstermeyiz.
      openPremiumPaywall();
      return;
    }

    // Undo edilen profili swipedAtRef'ten çıkar — aksi halde sonraki polling
    // refetch'inde koruma penceresi onu listeden silmeye devam eder.
    const undoneUserId = potentialMatches[currentIndex - 1]?.userId;
    if (undoneUserId) swipedAtRef.current.delete(undoneUserId);
    // Geri gelecek kartı okuyamadıysak (deste altımızdan değişti) hiçbir şey
    // yapma: index'i kaydırmak ekranda bambaşka birini açardı.
    if (!undoneUserId) return;

    // Optimistic UI — ama kart EKRANA DEĞİL, canlı kartın ARDINA doğuyor:
    // ölçümünü orada yapıyor, index ancak bitince kayıyor (bkz. warmRewind).
    // Index'i burada kaydırmak kartı yarı ölçülmüş hâlde ekrana koymak, yana
    // park etmek ise altındaki sayfa zeminini açmak demekti.
    setLastSwipeWasPass(false);
    // ALEV ÖNCE BAŞLIYOR, devir onun örtüsü altında (bkz.
    // startRewindUnderCover): kullanıcı kartın değiştiğini görmüyor — geç,
    // beğen ve Fire'da olduğu gibi.
    startRewindUnderCover();
    if (rewindSlotIdRef.current === undoneUserId) {
      // Kart yuvada duruyor — kurulmuş, ölçülmüş, ekranın ardında bekliyor
      // (bkz. rewindSlotIdRef). Ölçüm beklenmiyor; tek kapı alevin örtmesi.
      pendingRewind.current = undoneUserId;
      tryCommitRewind();
    } else {
      // Yuva yok (destenin sonu, taze deste): eski yol — kart canlı kartın
      // ardında mount edilip ölçülüyor, devir iki sinyalin sonuncusuyla.
      warmRewind(undoneUserId);
    }
    const prevUndos = remainingUndos;
    if (remainingUndos !== null && remainingUndos !== -1) {
      updateStatsCache({ remainingUndos: remainingUndos - 1 });
    }

    // Race fix: bekleyen swipe POST'u tamamlansın
    const pending = lastSwipePromiseRef.current;
    let swipeOk = true;
    if (pending) {
      try {
        await pending;
      } catch {
        swipeOk = false;
      }
    }
    lastSwipePromiseRef.current = null;

    // Swipe POST başarısız olduysa: backend'de zaten swipe yok → Undo gönderme
    if (!swipeOk) {
      if (prevUndos !== null) updateStatsCache({ remainingUndos: prevUndos });
      return;
    }

    try {
      await undoMutation.mutateAsync();
    } catch (err) {
      // Kart henüz üste geçmediyse index HİÇ kaymadı: ileri almak desteyi bir
      // fazla sürerdi. O pencerede tek doğru geri alma, ısınan kartı düşürmek.
      if (!cancelRewindWarmup()) setCurrentIndex((i) => i + 1);
      if (undoneUserId) swipedAtRef.current.set(undoneUserId, Date.now());
      if (prevUndos !== null) updateStatsCache({ remainingUndos: prevUndos });
      Alert.alert("", err?.message || t('discover.rewind.error'));
    }
  };

  const handleSaveFilters = async (localFilters) => {
    try {
      await saveFiltersMutation.mutateAsync(localFilters);
      setCurrentIndex(0);
      enterStackFrom(ENTRY_DISTANCE);
      setFilterVisible(false);
    } catch (err) {
      Alert.alert("", err?.message || t('discover.filters.saveError'));
    }
  };

  // useEvent: state değişse bile handler referansı sabit kalır. Aksi halde
  // her setIsSwiping / setCurrentIndex, useCallback deps'i büyütüp SwipeWrapper
  // React.memo compareFn'i (onPass === next.onPass) boşa çıkarır ve iki kart
  // birden re-render olur.
  // Pass günlük kotaya dahil değil (backend DailyLimitBehavior yalnız
  // Like/Fire sayıyor) — kota dolsa bile blok yok, paywall yok.
  const handlePassButton = useEvent(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    setIsSwiping(true);
    programmaticSwipe.value = 1;
    setTimeout(() => setIsSwiping(false), BUTTON_SWIPE_LOCK_MS);
  });

  const handleLikeButton = useEvent(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (swipeQuotaExhausted) {
      // Sağa kaydırma yolundaki (uiBus → swipePaywall) davranışın aynısı:
      // önce durumu söyle, sonra sheet'i aç.
      showSwipeQuotaExhaustedToast();
      openLitPlus();
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 2;
    setTimeout(() => setIsSwiping(false), BUTTON_SWIPE_LOCK_MS);
  });

  const handleFireButton = useEvent(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (fireQuotaExhausted) {
      requestAnimationFrame(showFireLimitUi);
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 3;
    // Diğer iki butonla AYNI süre: üçünde de kart hemen gitmiyor, deste alev
    // ekranı kapatınca (~800 ms, ilk kutlamada lazy chunk payıyla biraz daha)
    // ilerliyor — bkz. BUTTON_SWIPE_LOCK_MS.
    setTimeout(() => setIsSwiping(false), BUTTON_SWIPE_LOCK_MS);
  });

  // ── Moderasyon (expanded kartın altındaki ikonlar) ───────────────────────
  // Kartı desteden düşür. Swipe DEĞİL: swipeMutation atılmaz, analytics'e
  // swipe yazılmaz, rewind hedefi olmaz (lastSwipeWasPass'e dokunmuyoruz).
  // swipedAtRef kaydı şart — polling refetch'i engellenen profili geri
  // getirirse guard penceresi onu eler. Kart top değilse (teorik) sadece
  // guard'a yazıp indeksi oynatmıyoruz.
  // `covered` PARAMETRESİ KALDIRILDI (handleSwipe'dakiyle aynı gerekçe):
  // "kart, ekranı kaplayan bir kutlamanın ALTINDA düşüyor" demekti ve tek işi
  // giriş yayını atlatmaktı; o yay artık yok.
  const dropProfileFromDeck = useEvent((userId: string) => {
    if (!userId) return;
    swipedAtRef.current.set(userId, Date.now());
    // Beni beğenmiş biriyse rozet ANINDA düşsün — handleSwipe'daki temizlikle
    // aynı, tek farkı "kaçırdın" toast'ı YOK: engelleme kaçırılmış bir eşleşme
    // değil, kasıtlı bir kapatma.
    if (hasLikedMe(store.getState(), userId)) {
      dispatch(removeWhoLikedMe(userId));
      uiBus.emit("likerHandled", { userId });
    }
    if (potentialMatches[currentIndex]?.userId !== userId) return;
    // handleSwipe'dakiyle aynı gerekçe: index iki yönden birden sürülemez.
    cancelRewindWarmup();
    // Kart expanded'ken düşüyor: expand shared value'ları sıfırlanmazsa deste
    // biterse (arkada kart yok) boş durum expanded ölçülerde kalır. Yeni bir
    // top kart varsa baseline reset'i zaten aynı işi yapıyor, burada ikinci kez
    // sıfırlamak zararsız — index değişmeden ÖNCE olması boş desteyi kurtarır.
    resetCardExpandState();
    setCurrentIndex((i) => i + 1);
  });

  // ── Not (yorumlu beğeni) ────────────────────────────────────────────────
  // Kartta bir fotoğrafın/prompt'un altındaki kutudan açılıyor. Not bir
  // consumable: kotası günlük like kotasından AYRI, yalnız satın alınıyor.
  //
  // Gönderim ucu 2026-08-26'da BAĞLANDI (sözleşme Faz 1: `POST /api/swipe/Note`,
  // `Stats` alanları ve `WhoLikedMe.note` canlı). Bayrak bilerek duruyor —
  // uç bir sorun çıkarırsa akışı tek satırla arayüze geri düşürmek, çağrı
  // yollarını sökmekten güvenli.
  //
  // ⚠️ Bayrak kapatılırsa bakiye kapısı da kapanır (aşağıdaki koşul): uca istek
  // gitmezken "not hakkın yok" deyip paket sheet'i açmak, satın alınan şeyin
  // hiçbir işe yaramadığı bir tur demek olurdu.
  const NOTE_SEND_WIRED: boolean = true;
  const notesRemaining = statsQuery.data?.notesRemaining ?? null;
  const [notePurchaseVisible, setNotePurchaseVisible] = useState(false);
  const [noteRequest, setNoteRequest] = useState<{
    profile: PotentialMatch;
    target: NoteTarget;
  } | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  // Not kutlaması sürerken ekran ağaçtan düşerse (sekme değişti, tema
  // remount'u) örtme dinleyicisi arkada kalmasın — sökülmüş bir ağaca
  // setCurrentIndex yazardı.
  const noteFlameUnsub = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      noteFlameUnsub.current?.();
      noteFlameUnsub.current = null;
    },
    [],
  );

  const handleNoteRequest = useEvent(
    (profile: PotentialMatch, target: NoteTarget) => {
      if (!profile?.userId) return;
      // Bakiye yok — ya gerçekten 0, ya da backend alanı henüz göndermiyor
      // (`null`). İkisinde de doğru davranış composer değil paket sheet'i:
      // gönderilemeyecek bir metni yazdırmak en kötü sonuç olurdu.
      if (
        NOTE_SEND_WIRED &&
        (typeof notesRemaining !== "number" || notesRemaining <= 0)
      ) {
        analytics.capture("note_paywall_shown", {
          reason: notesRemaining === null ? "unknown_balance" : "empty_balance",
        });
        setNotePurchaseVisible(true);
        return;
      }
      setNoteError(null);
      setNoteRequest({ profile, target });
    },
  );

  const handleSendNote = useEvent(async (comment: string) => {
    const req = noteRequest;
    if (!req?.profile?.userId) return;
    setNoteError(null);
    // Uç bağlı değil: sheet kapanır, başka hiçbir şey olmaz. Toast YOK —
    // "notun gönderildi" demek gönderilmemiş bir şey için yalan olurdu.
    if (!NOTE_SEND_WIRED) {
      setNoteRequest(null);
      return;
    }
    try {
      await noteMutation.mutateAsync({
        userId: req.profile.userId,
        comment,
        target: req.target,
      });
      analytics.capture("note_sent", { targetKind: req.target.kind });
      setNoteRequest(null);
      // ⚠️ `result.isMatch`e BAKMIYORUZ: bu uçta (Like/Fire'ta da) alan
      // karşılıklı beğenide bile hep `false` ve `matchId` hiç yok. Eşleşme
      // arka planda çözülüp SignalR `MatchNotification` ile geliyor —
      // AppNavigator'daki mevcut dinleyici zaten karşılıyor.
      //
      // Toast DURUYOR: kutlama alevi ortada yalnız premium rozetini gösteriyor,
      // "not gönderildi" demiyor — tek onay bu satır. (Kısa bir süre ekranda
      // hem yazılı hem görsel onay dendi; yazı kaldırılınca toast geri geldi.)
      showInfoToast({
        title: t("note.sentTitle"),
        message: t("note.sentMessage", { name: req.profile.displayName ?? "" }),
        icon: "note",
      });
      // Not bir SWIPE: kart destede kalmamalı. `dropProfileFromDeck` beğenmiş
      // kişi temizliğini de yapıyor (rozet + likerHandled). Rewind hedefi
      // olmuyor — not geri alınamaz (öneri dokümanı D5).
      const userId = req.profile.userId;
      // EŞLEŞME GELİYORSA KUTLAMA YOK (bkz. flameSweep'teki kural): MatchModal
      // birazdan aynı ateşin perde hâliyle açılacak, süpürmeyi de oynatmak tek
      // bir nota iki alev demek. Kart o zaman örtüsüz düşüyor — composer'ın
      // kapanışı zaten değişimin üstünde.
      if (willMatchOnLike(req.profile)) {
        dropProfileFromDeck(userId);
        return;
      }
      // Kutlama Fire'ın AYNISI (bkz. flameSweep): alev ekranı süpürüyor
      // ve kart, ekran tam kapalıyken desteden düşüyor.
      noteFlameUnsub.current?.();
      noteFlameUnsub.current = runFlameSweep(() => {
        noteFlameUnsub.current = null;
        dropProfileFromDeck(userId);
      });
    } catch (e: any) {
      const code = e?.response?.data?.code ?? null;

      // Bakiye bitti → composer kapanır, paket sheet'i açılır.
      if (code === NOTE_SEND_CODES.NO_BALANCE) {
        setNoteRequest(null);
        setNotePurchaseVisible(true);
        return;
      }

      // Hedef geçersiz (409/410 değil, 400): foto silinmiş ya da sıralama
      // kaymış, yani kart BAYAT. Metni korumanın anlamı yok — aynı hedefe
      // tekrar gönderilse yine düşer. Composer kapanıyor, deste tazeleniyor;
      // kart düşürülmüyor çünkü kullanıcının kararı hâlâ verilmedi.
      if (code === NOTE_SEND_CODES.INVALID_TARGET) {
        setNoteRequest(null);
        matchesQuery.refetch();
        showInfoToast({
          title: t("note.failedTitle"),
          message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
          icon: "note",
        });
        return;
      }

      // Kredi HARCANMAYAN hatalar: kart artık geçerli değil. Composer'ı açık
      // tutmanın anlamı yok, kartı düşürüp bilgilendiriyoruz.
      if (
        code === NOTE_SEND_CODES.ALREADY_SWIPED ||
        code === NOTE_SEND_CODES.TARGET_UNAVAILABLE
      ) {
        setNoteRequest(null);
        dropProfileFromDeck(req.profile.userId);
        showInfoToast({
          title: t("note.failedTitle"),
          message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
          icon: "note",
        });
        return;
      }

      // Kalanlar kullanıcının düzeltebileceği ya da bekleyip tekrar
      // deneyebileceği hatalar (UT-6402 boş/uzun metin, UT-6406 moderasyon,
      // UT-6407 suistimal freni, ağ) → sheet AÇIK kalır, yazdığı metin korunur.
      // Üçünde de kredi harcanmıyor.
      setNoteError(
        t(noteSendCodeI18nKey(code) ?? "note.codes.generic", {
          defaultValue: e?.response?.data?.message || e?.message,
        }),
      );
    }
  });

  // ReportModal bir bottom sheet; kart expanded'ken üstüne açılıyor. Şikayet
  // sonucu "blocked" gelirse kartı da düşürüyoruz (ReportModal'ın engelle
  // switch'i işaretlenmişse).
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  /**
   * Üç noktaya basılan profil — seçenekler sheet'inin hedefi.
   *
   * Profilin KENDİSİ tutuluyor, id'si değil: sheet kapandıktan sonra
   * şikayet/engelle handler'ları profil nesnesi bekliyor ve o an deste
   * ilerlemiş olabilir (kart uçtu, `currentIndex` oynadı).
   */
  const [optionsProfile, setOptionsProfile] = useState<any>(null);

  const handleReportProfile = useEvent((profile: PotentialMatch) => {
    if (!profile?.userId) return;
    setReportTarget(profile.userId);
  });

  const handleBlockProfile = useEvent((profile: PotentialMatch) => {
    const userId = profile?.userId;
    if (!userId) return;
    Alert.alert(
      t('moderation.block.confirmTitle'),
      t('moderation.block.confirmMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('moderation.block.confirmButton'),
          style: "destructive",
          onPress: async () => {
            try {
              await moderationService.blockUser(userId);
              dropProfileFromDeck(userId);
              Alert.alert(
                t('moderation.block.successTitle'),
                t('moderation.block.successMessage'),
              );
            } catch {
              Alert.alert(t('common.error'), t('moderation.block.error'));
            }
          },
        },
      ],
    );
  });

  /**
   * ── FIRE ÇEKİŞİNİN HEADER PERDESİ KALDIRILDI ───────────────────────────
   * Burada `pullHeaderScrimStyle` vardı: aşağı çekişte header'ın zemini
   * destedeki perdeyle AYNI global orandan (uiBus > cardPullProgress ×
   * FIRE_PULL_SCRIM_ALPHA) kararıyordu. Kararacak bir zemin kalmadı — gerekçe
   * render tarafındaki notta.
   */

  /**
   * Yüzen üst chrome'un ÇIKIŞI — kart açıldıkça sönüyor.
   *
   * ŞART, dekoratif değil: kart artık açılırken kalkmıyor (lift 0), yani bu iki
   * buton kapanmazsa açık kartın kendi üst chrome'uyla ÜST ÜSTE biniyor —
   * sağdaki filtre, kartın sağ üstündeki Fire butonunun tam üstüne düşüyor.
   *
   * SÜRÜCÜ KROM KANALI (`cardChromeAnim`), geometri kanalı DEĞİL. İkisi artık
   * ayrı zamanlanıyor (bkz. SwipeWrapper > OPEN_INTENT_PX / CHROME_FADE):
   * geometri niyet eşiğinde ANINDA devriliyor, yazılar ve butonlar ise kendi
   * süresiyle sönüyor. Bu iki buton "yazı ve buton" tarafında — parmağa oranlı
   * yarı saydam durmaları istenen şey değildi (istek).
   *
   * ⚠️ OPAKLIK CAM YOLUNDA RİSKLİ, bilerek kabul edildi — gerekçesi ve iki
   * hafifletici koşulu CardStickyHeader > menuRevealStyle'da birebir aynı:
   * (a) butonlar kart KAPALIYKEN, yani oran 1'de doğuyor (temiz zincir),
   * (b) uç değerler tam 0 ve tam 1; camın çizilmesi gereken tek durum
   * opaklığın 1 olduğu durum. Bozulursa geçişin birkaç karesinde cam halka
   * erken kaybolur — kalıcı ölü cam değil.
   */
  const headerRevealStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, Math.min(1, cardChromeAnim.value)),
  }));

  /**
   * DESTESİ OLMAYAN HÂLLERİN AYRI KUTUSU KALKTI (2026-10-13). Burada
   * `chromeSafeBoxStyle` vardı: iskeleti ve boş kartı kartın ESKİ kabının
   * paylarıyla (üstte yüzen ikon satırının bittiği çizgi, altta tab bar boyu)
   * küçülten bir sarmalayıcı. İkisi de artık kartla aynı ölçüde tam ekran;
   * metnin/butonun chrome'un ardına girmemesini kendi iç payları sağlıyor
   * (bkz. EmptyDiscoverCard > topInset/coverBottomInset, SkeletonCard).
   */

  // Kartın kapağındaki yazı bloğunun okuduğu tab bar payı — iskelet ve boş
  // kart da aynı sayıyı okuyor (bkz. SwipeCard > coverBottomInset).
  const coverBottomInset = discoverTabBarInset(insets.bottom);

  /**
   * İskeletin İKİ hâli var:
   *
   *  • `deckSkeletonOnly` — kart henüz MOUNT EDİLMEDİ (deste yok ya da ilk
   *    kapak fotoğrafı yüklenmedi). Ekranda yalnız iskelet duruyor.
   *  • `deckSkeletonOverlay` — kart mount edildi, ölçülüyor; iskelet onun
   *    ÜSTÜNDE perde olarak duruyor (bkz. coverSettled).
   *
   * İkincisi olmadan kullanıcı iskeletten çıkınca butonların hizalanmasını ve
   * ortak nokta pillerinin kaybolup geri gelmesini görüyordu.
   */
  const deckSkeletonOnly =
    (loading && potentialMatches.length === 0) ||
    (potentialMatches.length > 0 && !firstPhotoReady);
  const deckSkeletonOverlay =
    !deckSkeletonOnly && potentialMatches.length > currentIndex && !coverSettled;

  /**
   * Yanda park etmiş desteyi BEKLETMEYECEK hâller: ekranda gerçek bir kart yok
   * (iskelet ya da boş durum). Bekleyen tavan dolana kadar durmasın — orada
   * ölçüm haberi verecek bir kart da yok, perdeyi/boş kartı 240ms geciktirmenin
   * karşılığı yok (bkz. enterStackFrom).
   */
  useEffect(() => {
    if (deckSkeletonOnly || !deckHasCard) {
      releaseStackEntry();
      // Deste çizilmiyor = yuva da yok. Bayrağı `renderStack` yazıyor ve o
      // şu an hiç çağrılmıyor; bayat kalırsa geri al basışı kartı mount
      // edilmiş sanıp beklemeden üste alırdı.
      rewindSlotIdRef.current = null;
    }
  }, [deckSkeletonOnly, deckHasCard, releaseStackEntry]);

  const renderStack = () => {
    const topProfile = potentialMatches[currentIndex];
    const nextProfile = potentialMatches[currentIndex + 1];
    const prevProfile =
      currentIndex > 0 ? potentialMatches[currentIndex - 1] : undefined;
    /**
     * GERİ AL YUVASI — destenin EN ALTINDAKİ, ekranda hiç görünmeyen kart
     * (gerekçesi rewindSlotIdRef'in yanında).
     *
     * İki yoldan doluyor:
     *   • Normal hâl: bir önceki kart orada DURMAYA devam ediyor (unmount
     *     edilmiyor). Koşul `nextProfile` — arkada kart yoksa yuva açığa
     *     çıkardı.
     *   • `rewindWarmup`: yuva kurulu değilken basıldı, kart ölçülmek için
     *     şimdi mount ediliyor.
     *
     * KİMLİK KONTROLÜ ŞART: deste altımızdan değişmiş olabilir (polling
     * refetch, demir hizalaması) ve `currentIndex - 1`de artık başka biri
     * durabilir — onu yuvaya koymak yanlış kartı üste almak olurdu.
     */
    const slotProfile =
      prevProfile &&
      (!!nextProfile || prevProfile.userId === rewindWarmup) &&
      (!rewindWarmup || prevProfile.userId === rewindWarmup)
        ? prevProfile
        : undefined;
    rewindSlotIdRef.current = slotProfile?.userId ?? null;

    /**
     * BOYAMA SIRASI, alttan üste: yuva → arkadaki kart → üstteki kart.
     *
     * Açıkça kuruluyor, `reverse()` ile DEĞİL. Eskiden deste iki elemandı ve
     * ters çevirmek yetiyordu; yuva kalıcı olunca dizi doğal sırada
     * [önceki, üstteki, sonraki] geliyor ve ters çevirmek üstteki kartı ortaya
     * atıyordu. Sıra artık okunduğu gibi: son eleman üstte duran kart.
     */
    const painted = [slotProfile, nextProfile, topProfile].filter(
      (p): p is NonNullable<typeof p> => !!p,
    );
    return painted
      .map((profile) => {
        const isTopCard = profile.userId === topProfile?.userId;
        const isWarm = profile.userId === slotProfile?.userId;
        return (
          <SwipeWrapper
            key={profile.userId}
            profile={profile}
            isTopCard={isTopCard}
            onSwipe={handleSwipe}
            overlayDragX={overlayDragX}
            overlayOpacity={overlayOpacity}
            programmaticSwipe={programmaticSwipe}
            onPass={handlePassButton}
            onLike={handleLikeButton}
            onFire={handleFireButton}
            willMatch={willMatchOnLike}
            // `swipeQuotaExhausted` GEÇİLMİYOR: kartta onu okuyan tek dal
            // sağa kaydırma jestiydi ve o jest kaldırıldı (bkz. SwipeWrapper).
            // Kota kapısı artık yalnız beğen butonunda — handleLikeButton.
            fireQuotaExhausted={fireQuotaExhausted}
            entryX={cardEntryX}
            superLikesRemaining={statsQuery.data?.superLikesRemaining ?? null}
            onReport={handleReportProfile}
            onBlock={handleBlockProfile}
            onMenu={setOptionsProfile}
            onNote={handleNoteRequest}
            // Yuvadaki kart EKRANDA DEĞİL: ağır paneli soğuyarak düşüyor (bkz.
            // SwipeWrapper > rewindSlot · SwipeCard > PANEL_COOLDOWN_MS).
            // Üste geçtiğinde prop kalkıyor ve panel geri geliyor; kapağın
            // kendisi (fotoğraf, cam zemin) hiçbir zaman sökülmüyor.
            rewindSlot={isWarm}
            // Ölçüm haberini KİMİN vereceğine burası karar veriyor (kart artık
            // kendi "üst kart mıyım" kontrolünü yapmıyor — bkz. SwipeCard >
            // onCoverReady). İki muhatap var ve ikisi aynı anda olamaz:
            //   • YUVADAKİ kart (rewind) — haber "ölçüm bitti" demek; basış
            //     bekliyorsa devir orada oluyor (handleRewindSlotReady).
            //   • ÜST kart — haber iskelet perdesini kaldırıyor (coverSettled).
            // Prop'u geri kalan kartlardan esirgemek onları memo
            // karşılaştırmasında sabit tutuyor.
            onCoverReady={
              isWarm
                ? handleRewindSlotReady
                : isTopCard
                  ? handleCoverReady
                  : undefined
            }
          />
        );
      });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ── KART: TAM EKRAN ──────────────────────────────────────────────────
          Kap ne üstten ne alttan pay bırakıyor. Kapak fotoğrafı durum
          çubuğunun ardından geçip ekranın tepesine, yüzen tab bar'ın ardından
          geçip dibine dayanıyor; üst chrome (geri al / filtre) ve tab bar
          onun ÜSTÜNDE yüzüyor.

          Okunurluğu kartın kendi rampaları taşıyor: tepede blur + gölge
          (SwipeCard > "KAPAĞIN TEPESİNDEKİ RAMPA"), dipte metin rampası.
          Kapağın alt bandındaki yazı tab bar'ın ARDINA düşmesin diye kart
          kendi içinde bar boyu pay okuyor (SwipeCard > coverBottomInset).

          İSKELET DE TAM EKRAN (kartın yerini tutuyor, bkz. SkeletonCard):
          çerçevesi ve yazı bloğunun çizgisi kartla birebir aynı, yoksa ilk
          fotoğraf gelince kart büyüyor gibi görünüyor.

          BOŞ KART DA TAM EKRAN (2026-10-13): eskiden kendi küçük kutusunda
          eski paylarıyla duruyordu. Metni ve butonu durum çubuğunun / tab
          bar'ın ardına girmesin diye kart kendi içinde pay bırakıyor (bkz.
          EmptyDiscoverCard > topInset/coverBottomInset). */}
      <View style={{ flex: 1 }}>
        {deckSkeletonOnly ? (
          /* İSKELET KABIN İÇİNDE KALIR, kartın kabuğu gibi TAŞMAZ. Bir tur
             `marginBottom: -tabBarOccupied` verilmişti (kabuk ekranın dibine
             iniyor diye); yanlıştı — kabuğun taşan kısmı boş, kartın GÖRÜNEN
             alt kenarı fotoğrafın bittiği yer, yani kabın dibi. İskelet
             uzatılınca karttan bir tab bar boyu uzun duruyordu.

             Kabın kendisi artık tam ekran, o yüzden ayrı bir sarmalayıcı yok —
             iskelet doğrudan `flex: 1` ile ekranı dolduruyor. */
          <SkeletonCard coverBottomInset={coverBottomInset} />
        ) : potentialMatches.length > currentIndex ? (
          <Animated.View
            pointerEvents={tutorialActive ? "none" : "auto"}
            style={[{ flex: 1, position: "relative" }, cardStackStyle]}
          >
            {renderStack()}
            {/* Aşağı çekiş (Fire) ipucu — kartın ALTINDA, arkadaki
                kartın üstünde (kendi zIndex'i 5). Desteden SONRA yazılıyor ama
                sırası önemli değil, katmanı zIndex belirliyor.

                `topInset`: perde ekranın 0'ından başlıyor ama ipucu yazısı
                durum çubuğunun altında kalmalı (bkz. oradaki prop notu). */}
            <FirePullHint topInset={insets.top} />
            <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />
          </Animated.View>
        ) : (
          /* BOŞ KART DA TAM EKRAN: ayrı sarmalayıcı yok, payları kendi içinde
             taşıyor (bkz. EmptyDiscoverCard > topInset/coverBottomInset). */
          <EmptyDiscoverCard
            title={emptyCopy?.title ?? null}
            actionLabel={emptyCopy?.actionLabel ?? null}
            onAction={handleEmptyAction}
            secondaryLabel={emptyCopy?.secondaryLabel ?? null}
            onSecondary={removeDistanceLimit}
            busy={ignoreDistanceMutation.isPending}
            // Yüzen chrome satırının gerçek boyu: şerit cam butondan kısa
            // olabilir, o yüzden aşağıdaki satırla AYNI max okunuyor.
            topInset={
              insets.top +
              Math.max(DISCOVER_HEADER_HEIGHT, DISCOVER_GLASS_BUTTON_SIZE)
            }
            coverBottomInset={coverBottomInset}
          />
        )}

        {/* KARTIN ÜSTÜNDEKİ İSKELET — kart mount oldu ama kapağın alt chrome'u
            henüz ölçülmedi (bkz. coverSettled). Kart ölçülebilmek için ekranda
            olmak zorunda, o yüzden perde onun ÜSTÜNE iniyor; kardeş sırası
            yeterli (aynı ata içinde sonraki kardeş üstte boyanır), zIndex
            ayrıca veriliyor ki destedeki üst kartın kendi zIndex'iyle
            yarışmasın.

            DOKUNMAYI YUTUYOR (pointerEvents verilmedi): altında görünmeyen bir
            kart var, kullanıcı göremediği kartı kaydırmasın. */}
        {deckSkeletonOverlay && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
            <SkeletonCard coverBottomInset={coverBottomInset} />
          </View>
        )}
      </View>

      {/* ── YÜZEN ÜST CHROME ────────────────────────────────────────────────
          Kendi zemini olan bir header şeridi YOK (istek): solda geri al,
          sağda filtre — ikisi de kapak fotoğrafının üstünde duran cam
          yuvarlak butonlar (bkz. DiscoverHeaderGlassButton).

          ORTADAKİ LOGO KALDIRILDI (istek). Dekoratifti ve dolgusu swipe
          oranıyla doluyordu (`WaveFillLogo` + `swipeFillRatio`); bileşen
          duruyor, Keşif artık çizmiyor.

          KARTTAN SONRA YAZILIYOR: aynı ata içinde sonraki kardeş üstte
          çizilir, yani `zIndex` gerekmiyor. `box-none` — satırın boş orta
          kısmı kartın jestlerini (swipe, pull) yutmamalı.

          KART AÇILINCA SÖNÜYOR (headerRevealStyle): kart artık açılırken
          kalkmadığı için bu satır kendiliğinden örtülmüyor. */}
      <Animated.View
        pointerEvents={headerLocked ? "none" : "box-none"}
        style={[
          {
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            // Satır boyu cam butondan BÜYÜK olabilir; buton dikey ortalanıyor.
            height: Math.max(
              DISCOVER_HEADER_HEIGHT,
              DISCOVER_GLASS_BUTTON_SIZE,
            ),
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
          headerRevealStyle,
        ]}
      >
        <DiscoverHeaderGlassButton
          systemName="arrow.counterclockwise"
          fallback={RotateCcw}
          // Keşif'in bütün cam butonları tek çapta (bkz.
          // DISCOVER_GLASS_BUTTON_SIZE) — devirde şeridin uçlarındaki okun ve
          // Fire'ın yerini alıyorlar.
          size={DISCOVER_GLASS_BUTTON_SIZE}
          onPress={handleRewind}
          label={t("discover.rewind.label")}
          // Kilitliyken sönük göstermiyoruz: sönüklük "şu an kullanılamaz"
          // demek, oysa kilitli buton her zaman tıklanabilir (paywall açar).
          // Sönüklük yalnız premium'un "geri alacak pass yok" hâline kalıyor.
          dimmed={!(undoLocked || lastSwipeWasPass)}
          // SINIRSIZDA ROZET YOK (istek): `remainingUndos === -1` sayı değil
          // "sınır yok" demek ve eskiden "∞" rozetiyle çiziliyordu. Sonsuz
          // işareti bir SAYAÇ gibi okunuyor — oysa sayacak bir şey kalmadığı
          // durumun işareti. Kalan hak bir SAYIYSA rozet yine çıkıyor, kilitte
          // de kilit glifi duruyor.
          badge={
            undoLocked ? (
              <HeaderCountBadge icon text="" />
            ) : remainingUndos !== null && remainingUndos !== -1 ? (
              <HeaderCountBadge text={String(remainingUndos)} />
            ) : null
          }
        />

        <DiscoverHeaderGlassButton
          systemName="slider.horizontal.3"
          fallback={SlidersHorizontal}
          size={DISCOVER_GLASS_BUTTON_SIZE}
          onPress={() => setFilterVisible(true)}
          label={t("discover.filters.title")}
          badge={
            activeFilterCount > 0 ? (
              <HeaderCountBadge text={String(activeFilterCount)} />
            ) : null
          }
        />
      </Animated.View>

      {/* ── KART AÇILIRKEN ŞERİDİ KARARTAN PERDE KALDIRILDI (istek) ──────────
          Kart açılırken üst şeridin üstüne inen siyah perde buradaydı
          (EXPAND_SCRIM_ALPHA oranında). Geri istenirse gerekçesi hâlâ ayakta
          ("arkadaki sayfa geri çekilmiş görünsün" — referans: Instagram'ın
          gönderi açılışı), ama kartın içindeki eşiyle (SwipeCard >
          cardGapScrimStyle) AYNI oranı okumak zorunda.

          ── FIRE ÇEKİŞİNİN HEADER PERDESİ DE KALDIRILDI ─────────────────────
          Aşağı çekişte (Fire) header'ın zeminini destedeki şeritle aynı oranda
          karartan katman da buradaydı (`pullHeaderScrimStyle` +
          FIRE_PULL_SCRIM_ALPHA). KARARTACAK BİR ZEMİN KALMADI: header artık
          kartın üstünde yüzen iki cam buton. Siyah bir perde onların altına
          değil ÜSTÜNE düşerdi — camı da glifi de boğar, üstelik bir ata olarak
          verilseydi cam efektini tamamen yok ederdi.

          Şeridin DOKUNMA kilidi hiçbir perdede değildi, ayrı bir kapıda
          (headerLocked) — o duruyor. */}

      {/* Fire alevi burada DEĞİL: tab bar'ı da kaplaması gerektiği için
          navigator'ın dışına, kök ağaca taşındı (bkz. AppNavigator). */}

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        isPremium={isPremium}
        onSave={handleSaveFilters}
        saving={saveFiltersMutation.isPending}
      />
      {/* Fire kotası bitti → premium paywall DEĞİL, consumable paket sheet'i.
          Premium kullanıcının da satın alabileceği bir ürün olduğu için backend
          artık iki tier'da da showPaywall:true dönüyor. Bakiye redeem yanıtından
          cache'e yazılıyor; buradaki refetch server-truth'u teyit eder. */}
      <FirePurchaseModal
        visible={firePurchaseVisible}
        onClose={() => setFirePurchaseVisible(false)}
        onPurchased={() => {
          setFirePurchaseVisible(false);
          statsQuery.refetch();
        }}
      />

      {/* Not yazma sheet'i — kartta bir fotoğrafın/prompt'un altındaki kutudan
          açılır. Hata gelince KAPANMAZ: metin korunup inline hata gösterilir. */}
      <NoteComposerModal
        visible={!!noteRequest}
        onClose={() => {
          setNoteRequest(null);
          setNoteError(null);
        }}
        onSend={handleSendNote}
        target={noteRequest?.target ?? null}
        prompts={noteRequest?.profile?.prompts ?? null}
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
      />

      {/* Not paketi — bakiye 0 iken kutuya basınca ve UT-6401'de açılır.
          Fire sheet'iyle aynı kabuk, ayrı ürün ve ayrı redeem kuyruğu. */}
      <NotePurchaseModal
        visible={notePurchaseVisible}
        onClose={() => setNotePurchaseVisible(false)}
        onPurchased={() => {
          setNotePurchaseVisible(false);
          statsQuery.refetch();
        }}
      />

      {/* Şikayet akışı — expanded kartın bayrak ikonundan açılır. Kart bir
          sheet değil (destenin kendisi), o yüzden LikerSwipeModal'daki gibi
          önce kapatmaya gerek yok. */}
      {/* Kapağın sağ alt kolonundaki üç noktanın açtığı menü. Sheet EKRANDA,
          kartta DEĞİL: deste iki kart mount ediyor ve her birine bir sheet
          koymak aynı anda iki modal demek olurdu. İçindeki iki satır (şikayet ·
          engelle) kartın panelindeki moderasyon satırıyla aynı handler'lara
          düşüyor — kapaktaki giriş onun kısayolu.

          `stackBehavior` YOK: Keşif'te kart bir sheet değil (destenin kendisi),
          yani altında minimize edilecek bir sheet de yok. */}
      <ProfileOptionsSheet
        visible={!!optionsProfile}
        onClose={() => setOptionsProfile(null)}
        onReport={() => {
          const target = optionsProfile;
          setOptionsProfile(null);
          if (target) handleReportProfile(target);
        }}
        onBlock={() => {
          const target = optionsProfile;
          setOptionsProfile(null);
          if (target) handleBlockProfile(target);
        }}
      />

      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget}
        onSuccess={(result: any) => {
          // Şikayetle birlikte engellediyse kart destede kalmasın.
          if (result?.blocked && reportTarget) dropProfileFromDeck(reportTarget);
        }}
      />

      {/* Ekran içi absolute overlay tab bar'ı kapatamıyor — floating bar
          navigator tarafında, ekranın üstünde ayrı render ediliyor. Kendi
          penceresi olan RN Modal demo bitene kadar tab dokunuşlarını da yutar. */}
      <Modal
        visible={tutorialActive}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => {}}
      >
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: scrimAt(0.45),
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
            },
            tutorialOverlayStyle,
          ]}
        >
          {/* Oklar `onMedia` (sabit beyaz), `text` DEĞİL: perde iki modda da
              siyah (scrimAt) — moda dönen mürekkep açık temada siyah oku siyah
              perdeye çiziyordu. */}
          <Animated.View style={tutorialLeftArrowStyle}>
            <SFIcon name="arrow.left" fallback={ArrowLeft} size={64} color={colors.onMedia} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View style={tutorialRightArrowStyle}>
            <SFIcon name="arrow.right" fallback={ArrowRight} size={64} color={colors.onMedia} strokeWidth={1.5} />
          </Animated.View>
        </Animated.View>
      </Modal>
    </GestureHandlerRootView>
  );
}
