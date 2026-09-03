import React, { useEffect, useState } from "react";
import { Dimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue,
  useAnimatedReaction,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "@/features/discover/components/SwipeCard";
import { CARD_CORNER_RADIUS } from "@/features/discover/components/CardStickyHeader";
import { colors } from "@/shared/theme/colors";
import { runFlameSweep } from "@/features/discover/flameSweep";
import uiBus, { cardExpandAnim, cardPullProgress } from "@/shared/services/uiBus";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DISCOVER_CARD_TOP_GAP,
  DISCOVER_HEADER_HEIGHT,
} from "@/features/discover/components/discoverHeaderMetrics";
import { photoPinchActive } from "@/shared/components/pinchZoom";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = 85;

/**
 * Yana kaydırırken kartın en fazla ne kadar kararacağı (0-1).
 *
 * Eşiğe (SWIPE_THRESHOLD) varıldığında bu değere ulaşır, ötesinde artmaz —
 * karar verilmiş bir kartı daha da karartmanın anlatacağı bir şey yok, üstelik
 * tam o anda ✓/✗ glifi (SwipeOverlay) devreye giriyor ve perde onu yutar.
 */
const SWIPE_DIM_MAX = 0.22;
const SUPER_LIKE_PULL_THRESHOLD = 50; // pull down ty.value bu px'e ulaşınca süper beğeni "ready"

// Animasyon süreleri
const EXIT_DURATION = 180;
const FADE_IN_DURATION = 100;
const FADE_OUT_DURATION = 350;
const EXIT_DISTANCE = width * 1.2;

export type SwipeDirection = "left" | "right" | "up";

interface SwipeWrapperProps {
  profile: PotentialMatch;
  onSwipe: (direction: SwipeDirection, userId: string) => void;
  isTopCard: boolean;
  // DiscoverScreen'de yaşayan, kartlar arasında PAYLAŞILAN shared value'lar:
  // üst kart yazar, overlay ve alttaki kart okur.
  dragX: SharedValue<number>;
  overlayDragX: SharedValue<number>;
  overlayOpacity: SharedValue<number>;
  buttonDragX: SharedValue<number>;
  /** 0 = yok, 1 = pass, 2 = like, 3 = super like (buton tetiklemesi). */
  programmaticSwipe: SharedValue<number>;
  onPass: () => void;
  onLike: () => void;
  onSuperLike: () => void;
  swipeQuotaExhausted?: boolean;
  superLikeQuotaExhausted?: boolean;
  /**
   * Bu kart, ekranı kaplayan bir kutlamanın ALTINDA top karta yükseldi: giriş
   * animasyonu atlanır, kart doğrudan son hâlinde çizilir (bkz. `scale`).
   */
  snapEntry?: boolean;
  superLikesRemaining: number | null;
  /** Kart altındaki moderasyon ikonları — VERİLMEZSE hiç çizilmez. */
  onReport?: (profile: PotentialMatch) => void;
  onBlock?: (profile: PotentialMatch) => void;
  /** Not kutuları — VERİLMEZSE hiç çizilmez (bkz. SwipeCard.onNote). */
  onNote?: (profile: PotentialMatch, target: NoteTarget) => void;
}

function SwipeWrapper({
  profile,
  onSwipe,
  isTopCard,
  dragX,
  overlayDragX,
  overlayOpacity,
  buttonDragX,
  programmaticSwipe,
  onPass,
  onLike,
  onSuperLike,
  swipeQuotaExhausted = false,
  superLikeQuotaExhausted = false,
  snapEntry = false,
  superLikesRemaining,
  onReport,
  onBlock,
  onNote,
}: SwipeWrapperProps) {
  useRenderCount("SwipeWrapper");
  const insets = useSafeAreaInsets();
  // Expanded'ken kart EKRANIN EN TEPESİNE çıkıp orada kalsın (kapatılana
  // kadar): header şeridi tamamen örtülür, kartın üst kenarı ekranın 0'ına
  // oturur — durum çubuğu artık kapak fotoğrafının üstünde durur. Okunurluğu
  // fotonun üstündeki koyu blur rampası taşıyor (bkz. SwipeCard'daki "Top Blur
  // Gradient Overlay", 230px).
  //
  // Hesap: kart container'ının tepesi ekranın tepesinden insets.top (durum
  // çubuğu) + header satırı + container paddingTop kadar aşağıda (bkz.
  // DiscoverScreen) — lift o farkın tamamı. Son iki sayı ortak dosyadan
  // okunuyor, burada tekrar yazma (bkz. discoverHeaderMetrics).
  //
  // KARTIN LİFT'İ SABİT, ÜST CHROME'U KÜÇÜK BİR PAY GERİ ALIR: köşe butonları
  // (sağ üstte süper beğeni, sol üstte "başa dön" oku) diyagonalin biraz
  // altına iniyor — ne durum çubuğuna girsinler ne de köşeden kopsunlar
  // (bkz. SwipeCard > EXPANDED_CORNER_DROP). Buradaki lift'i o pay için
  // DEĞİŞTİRME: kabuk tepeye kadar gitmeye devam etmeli.
  //
  // TARİHÇE: header satırı + 1 - LOGO_INK_CENTER_Y (≈28.75) idi — kartın üst kenarı
  // logonun görünür dikey merkezinde duruyor, header'ın üst yarısı açıkta
  // kalıyordu. Ondan önce 51 (header tam örtülü, kart safe-area'nın tepesinde),
  // en başta 25 (logonun altında kalıyordu). cardExpandAnim'e bağlı: expand
  // oranıyla yukarı biner, collapse'de (gesture/chevron/cam buton) senkron
  // geri iner.
  const HEADER_COVER =
    insets.top + DISCOVER_HEADER_HEIGHT + DISCOVER_CARD_TOP_GAP;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Scroll bitip rubber-band'in başladığı andaki translationY baseline'ı.
  // Sürekli gesture'da scroll → rubber-band geçişi yumuşak olsun diye.
  const dragOffsetY = useSharedValue(0);
  const hasVibrated = useSharedValue(false);
  // Pull-down sırasında süper-like kalbinin doluluk oranı (0-1). SwipeCard'a iletilir.
  const superLikeProgress = useSharedValue(0);
  // Threshold geçildiğinde haptic gate (gesture başına 1 kez patlasın).
  const superLikeReady = useSharedValue(false);
  // Expand state — sadece top kart için. Pan threshold geçince true olur, ScrollView
  // SwipeCard içinde scrollEnabled={expanded} ile native scroll'a açılır.
  //
  // expandedSV KANONİK, React `expanded` onun aynası — tersi değil. Eskiden SV
  // bir useEffect ile React state'inden besleniyordu: runOnJS → render → effect
  // zinciri en az bir frame (ağır kartta birkaç frame) sürüyor ve o pencerede
  // başlayan yeni bir pan ESKİ değeri okuyup yanlış moda giriyordu:
  //   expand → hemen pull-down  ⇒ CARD MODE dalı, cardExpandAnim anında 0,
  //   ama React `expanded` true kaldığı için ScrollView açık kalıyor:
  //   görsel collapsed + kart scroll'lanabilir + scrollY>0 olunca dikey pan
  //   tamamen ölüyor = kilitlenmiş bug durumu.
  // Bu yüzden SV artık karar anında, worklet'in İÇİNDE yazılıyor.
  const [expanded, setExpanded] = useState(false);
  const expandedSV = useSharedValue(false);
  const applyExpanded = React.useCallback((next: boolean) => {
    setExpanded(next);
  }, []);
  const commitExpanded = React.useCallback(
    (next: boolean) => {
      "worklet";
      if (expandedSV.value === next) return;
      expandedSV.value = next;
      // Collapse'de scroll gate'ini de temizle: scrollY>0 kalırsa card mode'daki
      // pull-up expand kalıcı olarak early-return'e düşüyor (BounceScrollView de
      // native offset'i 0'a çeker, iki taraf tutarlı olsun).
      if (!next) scrollY.value = 0;
      runOnJS(applyExpanded)(next);
    },
    [applyExpanded, expandedSV, scrollY],
  );
  const expandHapticFired = useSharedValue(false);
  const collapseHapticFired = useSharedValue(false);
  const EXPAND_PULL_THRESHOLD = 50;

  // Native scroll gesture — pan ile simultaneous çalışsın diye SwipeCard içindeki
  // ScrollView'a uygulanır. Aynı obje referansı pan ve ScrollView arasında paylaşılır.
  const nativeScrollGesture = React.useMemo(() => Gesture.Native(), []);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const triggerSuperLikeHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  // Pull-down sırasında threshold'a kadar artan sıklıkta haptic. Kendini
  // yeniden zamanlayan JS loop'u; interval progress arttıkça kısalır → titreşim
  // hızlanır. progress ref'ten okunur (worklet her frame runOnJS ile günceller).
  const superProgressRef = React.useRef(0);
  const superHapticTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const runSuperLikeHapticTick = () => {
    const p = superProgressRef.current;
    // Yalnızca pull sürerken (0<p<1) çalışır; threshold'da Heavy haptic devralır.
    if (p <= 0.05 || p >= 1) {
      superHapticTimer.current = null;
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const interval = 260 - p * 190; // ~260ms → ~70ms
    superHapticTimer.current = setTimeout(runSuperLikeHapticTick, interval);
  };
  const updateSuperHaptics = (p: number) => {
    superProgressRef.current = p;
    if (p > 0.05 && p < 1 && superHapticTimer.current == null) {
      runSuperLikeHapticTick();
    }
  };
  const resetSuperHaptics = () => {
    superProgressRef.current = 0;
    if (superHapticTimer.current != null) {
      clearTimeout(superHapticTimer.current);
      superHapticTimer.current = null;
    }
  };
  useEffect(() => resetSuperHaptics, []);

  const triggerExpandHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openPaywall = () => {
    uiBus.emit("swipePaywall", {});
  };

  const openSuperLikePaywall = () => {
    uiBus.emit("superLikePaywall", {});
  };

  /**
   * Süper beğeni onaylandı.
   *
   * Kart FIRLAMIYOR: yerinde kalıyor, kutlama ekranı alttan yukarı süpürüyor ve
   * deste dalga ekranı tam kapattığında ilerliyor (sözleşme: flameSweep). Not
   * gönderimi de aynı yolu kullanıyor.
   *
   * Eskiden kart 320 ms'de yukarı fırlar, swipe da orada işlenirdi: alev daha
   * ekranın alt yarısındayken kart çoktan gitmiş, yenisi açıkta belirmiş olurdu.
   */
  const flameCoverUnsub = React.useRef<(() => void) | null>(null);
  const runSuperLike = () => {
    if (flameCoverUnsub.current) return;
    flameCoverUnsub.current = runFlameSweep(() => {
      flameCoverUnsub.current = null;
      onSwipe("up", profile.userId);
    });
  };
  // Kart örtme anından ÖNCE ağaçtan düşerse (deste tazelendi, sekme değişti,
  // tema remount'u) dinleyici arkada kalmasın.
  useEffect(
    () => () => {
      flameCoverUnsub.current?.();
      flameCoverUnsub.current = null;
    },
    [],
  );

  // Süper beğeni işlendi ve örtme bekleniyor. Kart hâlâ ekranda ve dokunulabilir
  // duruyor; bu bayrak o pencerede İKİNCİ bir karar alınmasını engelliyor
  // (jestler ve buton tetiklemeleri) — aksi halde aynı profile art arda iki
  // swipe gidebilirdi.
  const superLikePending = useSharedValue(false);

  // Worklet'ten okumak için mirror — runOnJS'siz quota check.
  const quotaExhaustedSV = useSharedValue(swipeQuotaExhausted);
  useEffect(() => {
    quotaExhaustedSV.value = swipeQuotaExhausted;
  }, [swipeQuotaExhausted, quotaExhaustedSV]);
  const superLikeExhaustedSV = useSharedValue(superLikeQuotaExhausted);
  useEffect(() => {
    superLikeExhaustedSV.value = superLikeQuotaExhausted;
  }, [superLikeQuotaExhausted, superLikeExhaustedSV]);

  useEffect(() => {
    if (isTopCard) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      hasVibrated.value = false;
      // Canlı kart artık bu: bekleyen bir süper beğeni kilidi devralınmasın.
      superLikePending.value = false;
      return;
    }
    // Kart tepeden düştü. Deste yalnız ileri gitmiyor: rewind currentIndex'i
    // geri alıp o anki top kartı ALT kart yapıyor. Expand state'i üstünde
    // kalırsa tekrar top olduğunda cardExpandAnim (global) 0'a resetlenmiş
    // olur ama `expanded` true kalır → görsel collapsed, ScrollView açık,
    // dikey pan EXPANDED MODE'a girer = aynı desync.
    expandedSV.value = false;
    scrollY.value = 0;
    setExpanded(false);
  }, [
    isTopCard,
    dragX,
    overlayDragX,
    overlayOpacity,
    buttonDragX,
    expandedSV,
    scrollY,
    superLikePending,
  ]);

  const exitConfig = {
    duration: EXIT_DURATION,
    easing: Easing.out(Easing.cubic),
  };
  // Yumuşak fade out ayarı
  const fadeOutConfig = {
    duration: FADE_OUT_DURATION,
    easing: Easing.out(Easing.quad),
  };

  /**
   * Süper beğeninin GÖRSEL tarafı — jest ve buton yolları aynı yere düşsün.
   *
   * Kart yerine oturuyor: pull-down geri sarılıyor, dolan kalp sönüyor, açıksa
   * panel kapanıyor. Sonrası alevde: değişimi runSuperLike bekletiyor.
   */
  const commitSuperLike = () => {
    "worklet";
    if (superLikePending.value) return;
    superLikePending.value = true;
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    ty.value = withSpring(0, cfg);
    superLikeProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    // commitExpanded, cardExpandAnim'i tek başına sıfırlamaktan farklı: React
    // `expanded` aynasını da indiriyor. Kart artık uçup unmount OLMADIĞI için
    // ikisinin ayrışması (görsel collapsed + ScrollView açık) gerçek bir hâl.
    if (expandedSV.value) commitExpanded(false);
    if (cardExpandAnim.value > 0)
      cardExpandAnim.value = withTiming(0, { duration: 300 });
    runOnJS(runSuperLike)();
  };

  useAnimatedReaction(
    () => programmaticSwipe?.value,
    (value, previous) => {
      if (!isTopCard || value === 0 || value === previous) return;
      // Süper beğeni örtme bekliyor: buton tetiklemeleri yutulsun. Bayrağı
      // SIFIRLAMAK şart — non-zero kalırsa bir sonraki kart mount olduğunda
      // reaction'ın ilk çalışmasında (previous === undefined) tetiklenir ve
      // yeni kart kendiliğinden kayar.
      if (superLikePending.value) {
        programmaticSwipe.value = 0;
        return;
      }

      if (value === 1) {
        dragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });

        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 2) {
        dragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });

        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 3) {
        // Süper beğeni — kart yerinde kalır, değişimi alev örter.
        commitSuperLike();
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard],
  );

  const scale = useDerivedValue(() => {
    if (isTopCard) {
      // Deste alevin ALTINDA ilerlediyse (süper beğeni) büyüme animasyonu YOK.
      // Değişimin kendisi örtülüyor ama 0.92→1 yayı ~yarım saniye sürüyor:
      // dalga çekildikten sonra da devam ettiği için kart "o an geliyormuş"
      // gibi görünüyordu. Örtülü değişimde kart son hâlinde doğuyor.
      //
      // snapEntry bir prop, yani worklet'in kapanışına RENDER anında giriyor —
      // UI thread'de bu satırın ne zaman değerlendirildiği kararı değiştirmez
      // (paylaşılan bir bayrak okusaydı, swap'taki JS takılması kararı
      // kaçırabilirdi).
      if (snapEntry) return 1;
      return withSpring(1, { damping: 20, stiffness: 100 });
    }

    // Bottom kart scale'i: yatay swipe oranı VE pull-down (super-like) oranı
    // hangisi büyükse onu kullan → her iki gesture'da da arkadaki kart önden büyür.
    const horizontal = Math.abs(dragX.value) / SWIPE_THRESHOLD;
    const vertical = cardPullProgress.value;
    const combined = Math.min(1, Math.max(horizontal, vertical));
    return interpolate(combined, [0, 1], [0.92, 1], Extrapolate.CLAMP);
  });

  /**
   * Foto büyütme (pinch) başlayınca kartın sürüklemesini iptal et.
   *
   * İki parmak birbirinden uzaklaşırken parmakların ORTAK hareketi pan için tek
   * parmaklı bir sürüklemeden ayırt edilemiyor: kart yana kayıyor, hatta
   * beğeni/geçme eşiğini geçiyordu. Jest ilişkisi (blocksExternalGesture)
   * yerine bayrak: "önce pinch'in başarısız olmasını bekle" ilişkisi TEK
   * parmaklı swipe'ı da geciktirir, o da uygulamanın ana hareketi.
   */
  const cancelDragForPinch = () => {
    "worklet";
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    tx.value = withSpring(0, cfg);
    dragX.value = withSpring(0, cfg);
    overlayDragX.value = withSpring(0, cfg);
    buttonDragX.value = withSpring(0, cfg);
    overlayOpacity.value = 1;
    hasVibrated.value = false;
    ty.value = withSpring(0, cfg);
    superLikeProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    superLikeReady.value = false;
    expandHapticFired.value = false;
    collapseHapticFired.value = false;
    // Expand durumu KORUNUYOR: pinch çoğunlukla expanded panelde yapılıyor,
    // yarım kalmış bir collapse varsa bulunduğu uca geri otursun.
    cardExpandAnim.value = withSpring(expandedSV.value ? 1 : 0, cfg);
    runOnJS(resetSuperHaptics)();
  };

  useAnimatedReaction(
    () => photoPinchActive.value,
    (active, prev) => {
      if (active && !prev) cancelDragForPinch();
    },
  );

  // Yatay swipe — asymptotic rubber-band ile orta zorlanma hissi.
  // max=400, c=1.2 → delta=200'de tx ~150 (threshold), delta=400'de ~240,
  // asymptote 400 → daha güçlü pull'da hala kart hareketi var ama dampened.
  const horizontalPan = Gesture.Pan()
    .enabled(isTopCard)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      // Foto büyütülüyor → kart kıpırdamasın (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      // Süper beğeni verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (superLikePending.value) return;
      const delta = event.translationX;
      const absDelta = Math.abs(delta);
      const max = 400;
      const c = 1.2;
      const damped = (absDelta * max * c) / (max + c * absDelta);
      const signed = delta < 0 ? -damped : damped;
      tx.value = signed;
      dragX.value = signed;
      overlayDragX.value = signed;
      buttonDragX.value = signed;

      // Haptic: visual tx üzerinden — kart threshold'u görsel olarak geçince patlasın.
      if (!hasVibrated.value && Math.abs(signed) > SWIPE_THRESHOLD) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }
      if (hasVibrated.value && Math.abs(signed) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd((event) => {
      hasVibrated.value = false;
      if (superLikePending.value) return;
      // Parmaklar kalktı ama büyütme kapanışı sürüyor: bu jest pinch'in
      // parçasıydı, swipe olarak yorumlanmamalı.
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

      // Displacement (85) + velocity (2500 + min 60px) — daha kolay swipe.
      const VELOCITY_THRESHOLD = 2500;
      const VELOCITY_MIN_DISPLACEMENT = 60;
      const goRight =
        tx.value > SWIPE_THRESHOLD ||
        (event.velocityX > VELOCITY_THRESHOLD &&
          tx.value > VELOCITY_MIN_DISPLACEMENT);
      const goLeft =
        tx.value < -SWIPE_THRESHOLD ||
        (event.velocityX < -VELOCITY_THRESHOLD &&
          tx.value < -VELOCITY_MIN_DISPLACEMENT);

      // Like kotası bittiyse: sağa swipe gerçekleşmiş olsa bile karta geri
      // dönsün, istek atılmasın, paywall açılsın. Sola swipe (Pass) backend'de
      // kotaya sayılmadığı için burada da bloklanmıyor.
      // KOTA DIŞINDA KİLİT YOK: profil keşif havuzunda görünmese bile backend
      // like/pass/süper beğeniyi kabul ediyor (rehber §3), istemci kendi kuralını
      // uydurmuyor.
      if (goRight && quotaExhaustedSV.value) {
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
        runOnJS(openPaywall)();
        return;
      }

      if (goRight) {
        dragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        overlayDragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        // Expand state varsa swipe boyunca paralel unwind et — yeni top kartı
        // mount olunca instant snap olmasın, swipe ile orantılı geri sarsın.
        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });
      } else if (goLeft) {
        dragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        overlayDragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });
      } else {
        // Threshold geçemedi — super-like ile aynı spring physics ile bounce-back.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
      }
    });

  // Dikey pan: 3 modda çalışır:
  //  - Card mode + pull-down → super-like (mevcut)
  //  - Card mode + pull-up → expand (rubber-band)
  //  - Expanded mode + pull-down (scrollY=0) → collapse (rubber-band)
  // Expanded mode + pull-up: ScrollView native scroll'u handle eder.
  const verticalPan = Gesture.Pan()
    .enabled(isTopCard)
    .activeOffsetY([-15, 15])
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(nativeScrollGesture)
    .onBegin(() => {
      dragOffsetY.value = 0;
    })
    .onUpdate((event) => {
      // Foto büyütülüyor → ne collapse ne super-like (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      // Süper beğeni verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (superLikePending.value) return;
      if (expandedSV.value) {
        // EXPANDED MODE — sadece scrollY=0'da pull-down ile collapse.
        if (scrollY.value > 0) {
          dragOffsetY.value = event.translationY;
          ty.value = 0;
          return;
        }
        const delta = event.translationY - dragOffsetY.value;
        if (delta > 0) {
          // Expand ile aynı rubber-band + görsel scale — collapse de aynı
          // zorlukta hissedilsin.
          const max = 200;
          const c = 1.0;
          const tyAbs = (delta * max * c) / (max + c * delta);
          ty.value = tyAbs * 0.5; // kart aşağı translate (geri çekiliyor hissi)
          const progress = Math.min(tyAbs / EXPAND_PULL_THRESHOLD, 1);
          // cardExpandAnim 1'den 0'a iner (geri sarma)
          cardExpandAnim.value = 1 - progress;
          if (progress >= 1 && !collapseHapticFired.value) {
            collapseHapticFired.value = true;
            runOnJS(triggerExpandHaptic)();
          } else if (progress < 1 && collapseHapticFired.value) {
            collapseHapticFired.value = false;
          }
        } else {
          // Pull-up expanded'da: scroll handle etmeli. Collapse'i yarıda bırakıp
          // geri yukarı çekildiyse görseli de expanded'a geri al — yoksa
          // cardExpandAnim son (kısmi/0) değerinde donuyor: kart collapsed
          // görünürken mod hâlâ expanded kalıyordu.
          ty.value = 0;
          if (collapseHapticFired.value || cardExpandAnim.value < 1) {
            collapseHapticFired.value = false;
            cardExpandAnim.value = 1;
          }
        }
        return;
      }

      // CARD MODE
      if (scrollY.value > 0) {
        dragOffsetY.value = event.translationY;
        ty.value = 0;
        superLikeProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
        return;
      }
      const delta = event.translationY - dragOffsetY.value;
      if (delta > 0) {
        // PULL-DOWN — super-like
        const max = 100;
        const c = 0.5;
        ty.value = (delta * max * c) / (max + c * delta);
        const progress = Math.min(ty.value / SUPER_LIKE_PULL_THRESHOLD, 1);
        superLikeProgress.value = progress;
        cardPullProgress.value = progress;
        cardExpandAnim.value = 0;
        // Yön değişti: aynı jest içinde önce yukarı çekip expand eşiğini geçmiş
        // olabilir. Bayrağı temizlemezsek bırakışta hem super-like iptal olur
        // hem de wasExpandReady hâlâ true olduğu için kart expand ediyordu.
        expandHapticFired.value = false;
        if (progress >= 1 && !superLikeReady.value) {
          superLikeReady.value = true;
          runOnJS(resetSuperHaptics)();
          runOnJS(triggerSuperLikeHaptic)();
        } else if (progress < 1) {
          if (superLikeReady.value) superLikeReady.value = false;
          // Threshold'a kadar artan sıklıkta haptic (JS loop'u kendini zamanlar).
          runOnJS(updateSuperHaptics)(progress);
        }
      } else if (delta < 0) {
        // PULL-UP — expand. cardPullProgress da güncellenir → arkadaki kart
        // pull oranıyla öne büyür (super-like'taki gibi).
        // Pull-down (super-like) ile aynı rubber-band'i kullanmıyoruz: expand
        // sık erişilen bir hareket, super-like ise daha kasıtlı olmalı.
        const absDelta = -delta;
        const max = 200;
        const c = 1.0;
        const tyAbs = (absDelta * max * c) / (max + c * absDelta);
        // Progress/haptic tyAbs üzerinden hesaplanıyor; ty.value (görsel kart
        // translateY) ayrı scale'leniyor → kart daha az yukarı kalksın.
        ty.value = -tyAbs * 0.5;
        const progress = Math.min(tyAbs / EXPAND_PULL_THRESHOLD, 1);
        cardExpandAnim.value = progress;
        superLikeProgress.value = 0;
        cardPullProgress.value = progress;
        // Simetrik temizlik: önce aşağı çekip super-like eşiğini geçtiyse,
        // yukarı dönüşte o niyet iptal olmalı — yoksa expand'e bırakırken kart
        // super-like olarak uçuyordu.
        superLikeReady.value = false;
        runOnJS(resetSuperHaptics)();
        if (progress >= 1 && !expandHapticFired.value) {
          expandHapticFired.value = true;
          runOnJS(triggerExpandHaptic)();
        } else if (progress < 1 && expandHapticFired.value) {
          expandHapticFired.value = false;
        }
      } else {
        ty.value = 0;
        superLikeProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
      }
    })
    .onEnd(() => {
      dragOffsetY.value = 0;
      if (superLikePending.value) return;
      // Pinch'in parçasıydı: expand/collapse/super-like kararlarının hiçbiri
      // verilmemeli, kart bulunduğu uca geri otursun.
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

      if (expandedSV.value) {
        // EXPANDED MODE release
        const wasCollapseReady = collapseHapticFired.value;
        collapseHapticFired.value = false;
        if (wasCollapseReady) {
          // Threshold geçildi → collapse. paddingBottom cardExpandAnim'e bağlı,
          // spring 1→0 boyunca senkron küçülür.
          commitExpanded(false);
          cardExpandAnim.value = withSpring(0, {
            damping: 16,
            stiffness: 380,
            mass: 1,
          });
          ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        } else {
          // Threshold geçemedi → expanded'a geri snap
          cardExpandAnim.value = withSpring(1, {
            damping: 16,
            stiffness: 380,
            mass: 1,
          });
          ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        }
        return;
      }

      // CARD MODE release
      const wasReady = superLikeReady.value;
      const wasExpandReady = expandHapticFired.value;
      superLikeReady.value = false;
      expandHapticFired.value = false;
      runOnJS(resetSuperHaptics)();

      if (wasReady && superLikeExhaustedSV.value) {
        // SuperLike kotası bitti — kart geri yerine spring ile dönsün, istek yok,
        // ayrı superlike paywall modal'ı açılsın.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        ty.value = withSpring(0, cfg);
        superLikeProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        runOnJS(openSuperLikePaywall)();
      } else if (wasReady) {
        commitSuperLike();
      } else if (wasExpandReady) {
        ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        // paddingBottom cardExpandAnim'e bağlı, spring 0→1 boyunca senkron büyür.
        cardExpandAnim.value = withSpring(1, {
          damping: 16,
          stiffness: 380,
          mass: 1,
        });
        // Bottom kart geri arkaya yerleşsin — bu kart top kalmaya devam.
        cardPullProgress.value = withSpring(0, {
          damping: 16,
          stiffness: 380,
          mass: 1,
        });
        commitExpanded(true);
      } else {
        ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        superLikeProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        cardExpandAnim.value = withSpring(0, {
          damping: 16,
          stiffness: 380,
          mass: 1,
        });
      }
    });

  const composedGesture = Gesture.Simultaneous(horizontalPan, verticalPan);

  // Moderasyon köprüleri — SwipeCard argümansız handler bekliyor, DiscoverScreen
  // ise hangi profilin şikayet/engel edildiğini bilmek zorunda. Prop verilmezse
  // undefined kalır: SwipeCard o zaman ikonları hiç çizmez.
  const handleReport = React.useCallback(
    () => onReport?.(profile),
    [onReport, profile],
  );
  const handleBlock = React.useCallback(
    () => onBlock?.(profile),
    [onBlock, profile],
  );
  // Aynı köprü notlar için: SwipeCard yalnız HEDEFİ biliyor, hangi profile
  // yazıldığını burada ekliyoruz.
  const handleNote = React.useCallback(
    (target: NoteTarget) => onNote?.(profile, target),
    [onNote, profile],
  );

  // Chevron (SwipeCard alt ok) tap ile expand/collapse toggle — pull-up ve
  // pull-down gesture'larıyla aynı spring config'i.
  const handleExpandPress = React.useCallback(() => {
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    if (expandedSV.value) {
      commitExpanded(false);
      cardExpandAnim.value = withSpring(0, cfg);
      ty.value = withSpring(0, cfg);
    } else {
      ty.value = withSpring(0, cfg);
      cardExpandAnim.value = withSpring(1, cfg);
      cardPullProgress.value = withSpring(0, cfg);
      commitExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitExpanded]);

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-width, 0, width], [-15, 0, 15]);

    return {
      // Expanded lift'in bedeli: kart HEADER_COVER kadar yukarı binince,
      // kutusu `inset:0` olduğu için aynı miktar kartın ALTINDA boşluk olarak
      // kalıyordu (tab bar'ın altındaki şerit). Kutuyu aşağı doğru aynı
      // miktarda büyütüyoruz → alt kenar container'ın dibinde kalır ve o şeridi
      // expanded içeriğin devamı doldurur. Kartın iç yapısı değişmiyor.
      //
      // BİR ARA `top` İLE YAPILDI, GERİ ALINDI: amacı kart açıkken ata
      // transform'unu kimliksel tutup içerideki cam kutuları kurtarmaktı
      // (bkz. CardSectionBox'taki ata kuralı). Kâğıt üstünde geometri birebir
      // aynı — ama camları düzeltmedi ve kartın yerleşiminde gerileme yarattı.
      // Amacını vermeyen bir değişikliği tutmadık. Tekrar denenecekse önce
      // yerleşim doğrulanmalı.
      //
      // Spring overshoot expandAnim'i 1'in üstüne çıkarabiliyor → clamp.
      bottom: isTopCard
        ? -HEADER_COVER * Math.max(0, Math.min(1, cardExpandAnim.value))
        : 0,
      transform: [
        { translateX: tx.value },
        // ty.value: geçici drag peek/rubber-band. -HEADER_COVER*cardExpandAnim:
        // expanded'ken kalıcı olarak header'ın üstüne binen lift (kapatana kadar).
        // cardExpandAnim global → sadece top karta uygula, arkadaki kart kaymasın.
        {
          translateY:
            ty.value - (isTopCard ? HEADER_COVER * cardExpandAnim.value : 0),
        },
        { rotate: isTopCard ? `${rotate}deg` : "0deg" },
        { scale: scale.value },
        // `as any`: RN'in transform tipi her elemanın TEK anahtarlı olmasını
        // istiyor, TS ise heterojen diziyi `{translateX; translateY?: undefined}`
        // birleşimi olarak çıkarıyor (undefined ≠ never). Ekranın kendi
        // FigureEightRadar'ında da aynı kaçış kullanılıyor. Props `any` iken
        // hata görünmüyordu, tipleme onu ortaya çıkardı — davranış aynı.
      ] as any,
      opacity: isTopCard
        ? 1
        : interpolate(
            // Scale ile aynı combined: horizontal swipe VE vertical pull-down
            // (super-like) hangisi büyükse onu kullan → super-like sırasında da
            // bottom card brightness artar, swipe sonrası "0.8 → 1 zıplaması" olmaz.
            Math.min(
              1,
              Math.max(
                Math.abs(dragX.value) / SWIPE_THRESHOLD,
                cardPullProgress.value,
              ),
            ),
            [0, 1],
            [0.8, 1],
            Extrapolate.CLAMP,
          ),
      zIndex: isTopCard ? 10 : 1,
    };
  });

  /**
   * Yana kaydırırken kartı karartan perde.
   *
   * KARTIN KENDİ `opacity`Sİ İLE YAPILMIYOR, ŞART. Cam yüzeyler ata zincirinde
   * alfa 1'in altına düştüğü anda hiç render edilmiyor (bkz. CardSectionBox'taki
   * "ATA ZİNCİRİNDE OPACITY < 1 OLAMAZ" notu) — kartı soldurmak açık paneldeki
   * bütün cam kutuları öldürürdü. Perde bu yüzden kartın ATASI değil KARDEŞİ:
   * kendi opaklığı animasyonlanıyor, kartınki 1'de sabit kalıyor.
   *
   * `tx` okunuyor, `dragX` değil: `tx` bu kartın kendi konumu. `dragX` deste
   * geneli için paylaşılıyor ve arkadaki kart da onu okuyor — buradan sürseydik
   * üstteki kart uçarken alttaki de kararırdı.
   */
  const swipeDimStyle = useAnimatedStyle(() => {
    if (!isTopCard) return { opacity: 0 };
    const progress = interpolate(
      Math.abs(tx.value),
      [0, SWIPE_THRESHOLD],
      [0, SWIPE_DIM_MAX],
      Extrapolate.CLAMP,
    );
    return { opacity: progress };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        // `inset: 0` kısayolu yerine açık kenarlar: animatedStyle'daki `bottom`
        // (expanded'da negatife inen) statik değerle ezilmesin.
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
          animatedStyle,
        ]}
      >
        <SwipeCard
          profile={profile}
          onPass={onPass}
          onLike={onLike}
          onSuperLike={onSuperLike}
          onExpandPress={handleExpandPress}
          scrollY={scrollY}
          nativeScrollGesture={nativeScrollGesture}
          superLikeProgress={superLikeProgress}
          isTopCard={isTopCard}
          expanded={expanded}
          superLikesRemaining={superLikesRemaining}
          onReport={onReport ? handleReport : undefined}
          onBlock={onBlock ? handleBlock : undefined}
          onNote={onNote ? handleNote : undefined}
        />
        {/* Karartma perdesi — KARTTAN SONRA çiziliyor ki üstünde kalsın.
            Yarıçap kartınkiyle aynı (CARD_CORNER_RADIUS): kartın köşeleri
            yuvarlak, perde kare olsaydı sürüklerken köşelerde koyu üçgenler
            taşardı. Dokunmaları geçirmesi gerekiyor — jest kartın kendisinde. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              // Açık kenarlar: ata `bottom`u expanded'da negatife indiriyor,
              // perde de onunla birlikte uzasın.
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: CARD_CORNER_RADIUS,
              borderCurve: "continuous",
              backgroundColor: colors.mediaScrim,
            },
            swipeDimStyle,
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// React.memo: DiscoverScreen optimistic stats update'inde re-render olunca
// SwipeWrapper'lar tekrar render edilmesin. Profile + isTopCard + quota
// flag'leri değişmediği sürece skip et. Handler ref'leri DiscoverScreen'de
// useCallback ile stabilize edildi.
export default React.memo(SwipeWrapper, (prev, next) => {
  return (
    prev.profile?.userId === next.profile?.userId &&
    prev.isTopCard === next.isTopCard &&
    prev.swipeQuotaExhausted === next.swipeQuotaExhausted &&
    prev.superLikeQuotaExhausted === next.superLikeQuotaExhausted &&
    prev.snapEntry === next.snapEntry &&
    prev.superLikesRemaining === next.superLikesRemaining &&
    prev.onSwipe === next.onSwipe &&
    prev.onPass === next.onPass &&
    prev.onLike === next.onLike &&
    prev.onSuperLike === next.onSuperLike &&
    prev.onReport === next.onReport &&
    prev.onBlock === next.onBlock &&
    prev.onNote === next.onNote
  );
});
