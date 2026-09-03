import { useCallback, useEffect, useRef, useState } from "react";
import { View, Modal, Dimensions, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  interpolate,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { appPrefs } from "../../../shared/utils/appPrefs";
import { ArrowLeft, ArrowRight } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SwipeCard from "@/features/discover/components/SwipeCard";
import CardGlassBackdrop from "@/features/discover/components/CardGlassBackdrop";
import CardSheetScrollView from "@/features/discover/components/CardSheetScrollView";
import CardStickyHeader, {
  CARD_CHROME_TOP_DROP,
  CARD_EXPANDED_CORNER_RADIUS,
} from "@/features/discover/components/CardStickyHeader";
import SwipeOverlay from "@/features/discover/components/SwipeOverlay";
import ProfileOptionsSheet from "@/features/discover/components/ProfileOptionsSheet";
import { photoPinchActive } from "@/shared/components/pinchZoom";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import { useSwipeMutation } from "@/features/discover/swipeQueries";
import { useAppSelector } from "@/shared/hooks/redux";
import { useEvent } from "@/shared/hooks/useEvent";
import { colors } from "../../../shared/theme/colors";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 85;
const EXIT_DISTANCE = width * 1.2;
const EXIT_DURATION = 180;
const FADE_OUT_DURATION = 350;
const TUTORIAL_TX = 55; // threshold (85) altında — like/pass tetiklenmesin
const TUTORIAL_SWING_DURATION = 550;
const TUTORIAL_STORAGE_KEY = "likerSwipeTutorialShown";

const exitConfig = { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) };
const fadeOutConfig = { duration: FADE_OUT_DURATION };
const springConfig = { damping: 16, stiffness: 380, mass: 1 };

function triggerHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * @param swipeDisabled Kart yalnız OKUNUR açılır: yatay jest, X/tik satırı ve
 *   süper beğeni yok; şikayet/engelle kalır. "Kaçırdıkların" sekmesi için —
 *   orada verilebilecek tek yanıt KURTARMA (hak harcar, bkz. LikesScreen'deki
 *   `handleRecover`) ve liste kartı da zaten sadece o butonu çiziyor. Detay
 *   açıldığında swipe'ın canlı kalması, listede olmayan bir aksiyonu (pas /
 *   beğen) kotasız bir arka kapıdan sunuyordu.
 */
export default function LikerSwipeModal({
  visible,
  profile,
  onClose,
  onSwipe,
  swipeDisabled = false,
}: any) {
  const swipeMutation = useSwipeMutation();
  const { t } = useTranslation();
  // Şikayet edilen kullanıcı — sheet kapandıktan SONRA açılan ReportModal'ın
  // hedefi. Sheet'in `profile`'ı o an null'lanabildiği için ayrı tutulur.
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  // Şeridin sağ üstündeki üç noktanın açtığı menü (bkz. ProfileOptionsSheet).
  // Kart sheet'inin ÜSTÜNE biniyor, onu kapatmıyor.
  const [optionsOpen, setOptionsOpen] = useState(false);

  const tx = useSharedValue(0);
  // Top'a çarpma zoom'u — scroll CardSheetScrollView'da, foto katmanı SwipeCard'da.
  const photoZoom = useSharedValue(0);
  // Ham scroll konumu — sticky şerit "bugün aktif"i buna göre söndürüp ismi
  // ortalıyor (bkz. CardStickyHeader).
  const scrollY = useSharedValue(0);

  /**
   * Kartın zemini: ana fotoğrafın blur'lu hali (bkz. CardGlassBackdrop).
   * Sheet çiziyor, kart değil — gerekçe aşağıda, çizildiği yerde.
   *
   * Kapı fotoğraf: fotoğrafsız profilde SwipeCard da eski gri paneline düşüyor
   * (`glassPanel`), zemin çizmek onun altında görünmez bir katman olurdu.
   */
  const backdropUri: string | undefined = profile?.photos?.[0];
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const hasVibrated = useSharedValue(false);

  // Tutorial flag'i hesap bazlı: aynı cihazda açılan yeni hesap jesti hiç
  // görmemiş bir kullanıcıdır, tekrar göstermek gerekir.
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const tutorialOpacity = useSharedValue(0);
  const [tutorialActive, setTutorialActive] = useState(false);
  const tutorialLiveRef = useRef(false);

  // markSeen=true → demo sonuna kadar oynadı, flag yazılır. Sheet erkenden
  // kapanırsa yazılmaz; kullanıcı jesti görmemiş sayılır, tekrar oynar.
  const stopTutorial = useEvent((markSeen: boolean) => {
    if (!tutorialLiveRef.current) return;
    tutorialLiveRef.current = false;
    cancelAnimation(tutorialOpacity);
    tutorialOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setTutorialActive)(false);
    });
    if (markSeen && currentUserId) {
      appPrefs.set(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`, true);
    }
  });

  useEffect(() => {
    if (!visible) {
      stopTutorial(false);
      // Kart kapandıysa üstündeki menü de kapanır: sheet kapanışı menüden
      // geçmeyen yollardan da gelebiliyor (swipe, backdrop, liste tazelemesi).
      setOptionsOpen(false);
      tx.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      hasVibrated.value = false;
      tutorialOpacity.value = 0;
      setTutorialActive(false);
      return;
    }

    if (!currentUserId) return;
    // Jest kapalıyken demo da oynamaz — öğretilecek bir hareket yok. Bayrak da
    // YAZILMIYOR (erken `return`): burada "gördü" saymak, kullanıcının jesti
    // gerçekten kullanabileceği ilk kartta demoyu yutardı.
    if (swipeDisabled) return;
    // MMKV senkron — eski AsyncStorage.then() + cancelled-guard yarışı kalktı.
    if (appPrefs.getBoolean(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`)) return;
    tutorialLiveRef.current = true;
    setTutorialActive(true);
    // Sheet slide-up animasyonu bitince başlat.
    tutorialOpacity.value = withDelay(400, withTiming(1, { duration: 250 }));
    tx.value = withDelay(
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
          { duration: TUTORIAL_SWING_DURATION, easing: Easing.inOut(Easing.cubic) },
          () => {
            runOnJS(stopTutorial)(true);
          },
        ),
      ),
    );
  }, [
    visible,
    currentUserId,
    swipeDisabled,
    tx,
    overlayDragX,
    overlayOpacity,
    hasVibrated,
    tutorialOpacity,
    stopTutorial,
  ]);

  const handleSwipe = (direction: "left" | "right") => {
    const userId = profile?.userId;
    if (userId) {
      swipeMutation.mutate({ direction, userId });
      onSwipe?.(userId, direction);
    }
    onClose?.();
  };

  // ── Moderasyon (kart altındaki kırmızı satırlar) ─────────────────────────
  // Şikayet için sheet'i ÖNCE kapatıyoruz: ReportModal da bir bottom sheet,
  // ikisi üst üste binince alttaki jestleri yakalıyor.
  const handleReportPress = useCallback(() => {
    setReportTarget(profile?.userId ?? null);
    onClose?.();
  }, [profile?.userId, onClose]);

  const handleBlockPress = useCallback(() => {
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
              // direction "block": LikesScreen bunu listeden düşürmek için
              // kullanır ama "kaçırdın" toast'ını ATMAZ — o yalnız pass'e özel.
              onSwipe?.(userId, "block");
              onClose?.();
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
  }, [profile?.userId, onClose, onSwipe, t]);

  const triggerAction = (direction: "left" | "right") => {
    const to = direction === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
    const overlayTarget =
      direction === "right" ? SWIPE_THRESHOLD : -SWIPE_THRESHOLD;
    overlayDragX.value = withTiming(overlayTarget, exitConfig);
    overlayOpacity.value = withTiming(0, fadeOutConfig);
    tx.value = withTiming(to, exitConfig, () => {
      runOnJS(handleSwipe)(direction);
    });
  };

  // Fotoğraf iki parmakla büyütülmeye başladı: o ana kadar birikmiş yatay
  // sürükleme geri alınıyor. Pinch'in iki parmağı ortak hareket ettiğinde jest
  // tek parmaklı bir swipe'tan ayırt edilemiyor ve kart yana eğiliyordu
  // (Discover'daki destede aynı kaçış var — bkz. SwipeWrapper).
  const cancelDragForPinch = () => {
    "worklet";
    hasVibrated.value = false;
    tx.value = withSpring(0, springConfig);
    overlayDragX.value = withSpring(0, springConfig);
    overlayOpacity.value = 1;
  };

  useAnimatedReaction(
    () => photoPinchActive.value,
    (active, prev) => {
      if (active && !prev) cancelDragForPinch();
    },
  );

  const horizontalPan = Gesture.Pan()
    // Demo `tx`'i sürüyor; aynı anda kullanıcı da sürükleyemesin.
    // `swipeDisabled` → jest hiç kurulmaz (bkz. prop). Jesti açık bırakıp
    // `handleSwipe`i susturmak yetmezdi: kart yine parmakla eğilir, tik/çarpı
    // perdesi (SwipeOverlay) yine yanar, yani ekran olmayan bir aksiyonu vaat
    // ederdi.
    .enabled(!tutorialActive && !swipeDisabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      "worklet";
      // Foto büyütülüyor → kart kıpırdamasın (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      const delta = event.translationX;
      const absDelta = Math.abs(delta);
      const max = 400;
      const c = 1.2;
      const damped = (absDelta * max * c) / (max + c * absDelta);
      const signed = delta < 0 ? -damped : damped;
      tx.value = signed;
      overlayDragX.value = signed;

      if (!hasVibrated.value && Math.abs(signed) > SWIPE_THRESHOLD) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }
      if (hasVibrated.value && Math.abs(signed) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd((event) => {
      "worklet";
      hasVibrated.value = false;

      // Parmaklar kalktı ama büyütme kapanışı sürüyor: bu jest pinch'in
      // parçasıydı, swipe olarak yorumlanmamalı (bayrak kapanış animasyonunun
      // SONUNDA düşüyor — bkz. photoPinchActive).
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

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

      if (goRight) {
        overlayDragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(handleSwipe)("right");
        });
      } else if (goLeft) {
        overlayDragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(handleSwipe)("left");
        });
      } else {
        tx.value = withSpring(0, springConfig);
        overlayDragX.value = withSpring(0, springConfig);
        overlayOpacity.value = 1;
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-width, 0, width], [-15, 0, 15]);
    return {
      transform: [{ translateX: tx.value }, { rotate: `${rotate}deg` }] as any,
    };
  });


  const tutorialOverlayStyle = useAnimatedStyle(() => ({
    opacity: tutorialOpacity.value,
  }));

  const leftArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tx.value, [-TUTORIAL_TX, 0], [-16, 0], "clamp") },
    ],
  }));

  const rightArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tx.value, [0, TUTORIAL_TX], [0, 16], "clamp") },
    ],
  }));

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
        pressBehavior={tutorialActive ? "none" : "close"}
      />
    ),
    [tutorialActive],
  );

  return (
    <>
      <AppBottomSheet
        visible={visible}
        onClose={onClose}
        // TEK DETENT, TAM EKRAN — diğer kart sheet'leriyle (PreviewModal) aynı:
        // sheet doğrudan telefonun en tepesinde açılıyor, Keşif'te expand
        // edilen kartın oturduğu yerde (bkz. SwipeWrapper > HEADER_COVER).
        //
        // TARİHÇE: [ekranın %85'i, SCREEN_HEIGHT - insets.top] idi — kart önce
        // alt detent'te açılıyor, tepeye ancak elle çekilince geliyordu.
        // Alt detent kaldırıldı: kartı okumak için ikinci bir jest gerekiyordu
        // ve aşağı çekiş artık tek adımda kapatıyor (yine PreviewModal gibi).
        snapPoints={[SCREEN_HEIGHT]}
        topInset={0}
        handleComponent={null}
        backdropComponent={renderBackdrop}
        // Kartın ve sticky şeridin köşesiyle AYNI — varsayılan 36, kartın
        // köşesiyle üst üste binip uyumsuz iki eğri gösteriyordu. (Burada
        // yalnız sheet'in kendi zeminini etkiliyor: clipContent kapalı,
        // kırpmayı kartın kabuğu yapıyor.)
        cornerRadius={CARD_EXPANDED_CORNER_RADIUS}
        cornerCurve="continuous"
        // Sheet KIRPMASIN — köşeyi aşağıdaki dönen kart kendi çiziyor.
        // Kırpma burada kalırsa kutu eksenlere sabit, kart ise yana kayarken
        // eğiliyor: kartın üst köşeleri sheet'in düz kenarında dilimleniyor,
        // Keşif'te olmayan bir "çerçeve içinde kalmış" görüntüsü çıkıyordu.
        clipContent={false}
        backgroundStyle={{ backgroundColor: "transparent" }}
        enablePanDownToClose={!tutorialActive}
        enableContentPanningGesture={!tutorialActive}
        enableHandlePanningGesture={!tutorialActive}
        // Sheet'in kendi pan'i yatay hareketi kapmasın: 10px yatay geçince
        // fail eder, kartın horizontalPan'i aktive olur. Dikeyde ise 10px'ten
        // sonra sheet devralır → pan-down-to-close korunur.
        activeOffsetY={[-10, 10]}
        failOffsetX={[-10, 10]}
      >
        <View style={{ flex: 1, position: "relative" }}>
          {profile && (
            <GestureDetector gesture={horizontalPan}>
              <Animated.View
                pointerEvents={tutorialActive ? "none" : "auto"}
                style={[
                  {
                    flex: 1,
                    // KART KABUĞU BURADA KAPANIYOR, sheet'te değil
                    // (bkz. yukarıdaki `clipContent={false}`). Kırpma bu
                    // view'in KENDİ koordinatında yapıldığı için köşeler
                    // döndürmeyle birlikte eğiliyor: kart Keşif'teki gibi tek
                    // parça bir yüzey olarak yatıyor, sabit bir çerçevenin
                    // kenarında dilimlenmiyor.
                    //
                    // Yarıçap AÇIK değer: sheet tek detent'te ve ekranın
                    // tepesinde açılıyor, yani kartın üst köşeleri telefonun
                    // köşelerinde. 50 orada maskeden yuvarlak kalıp hilal
                    // bırakırdı (bkz. CARD_EXPANDED_CORNER_RADIUS). Kabuk,
                    // şeridin kırpması ve sheet clip'i aynı sayıyı okumak
                    // zorunda — üçüncü kopya için bkz. CARD_CORNER_RADIUS notu.
                    //
                    // ALT KÖŞELER KARE, bilerek: kartın dibi ekranın dibi,
                    // orayı yuvarlatmak duran kartta ekranın alt köşelerinden
                    // arkadaki perdeyi sızdırırdı.
                    borderTopLeftRadius: CARD_EXPANDED_CORNER_RADIUS,
                    borderTopRightRadius: CARD_EXPANDED_CORNER_RADIUS,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  },
                  animatedStyle,
                ]}
              >
                {/* Kartın sabit zemini — ana fotoğrafın blur'lu hali.
                    SHEET ÇİZİYOR, kart değil: burada scroll kartın DIŞINDA ve
                    kayan şey kartın kendisi, zemin kartın içinde olsaydı
                    içerikle birlikte kayardı (bkz. CardGlassBackdrop ve
                    SwipeCard'daki `glassPanel` notu). Yatay pan'in İÇİNDE ama
                    scroll'un DIŞINDA: kart yana kayarken zemin onunla gider,
                    dikey scroll'da yerinde kalır — sticky şeritle aynı kural.
                    Sırası önemli: scroll'un ÖNÜNDE, her şeyin altında. */}
                {backdropUri && <CardGlassBackdrop uri={backdropUri} />}

                {/* Scroll'u CardSheetScrollView yapar — sheet'in scrollable
                    koordinasyonu buna bağlı: içerik en üstteyken aşağı çekince
                    sheet sürüklenip kapanır. SwipeCard'ın kendi ScrollView'ı
                    (expanded={false}) kapalı; ikisi birden açık olsa içteki
                    native scroll dikey jesti yutup kapatmayı bloke ediyordu.
                    Bounce/zoom davranışı Discover'daki kartla aynı. */}
                <CardSheetScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 0 }}
                  scrollEnabled={!tutorialActive}
                  zoomImpact={photoZoom}
                  scrollY={scrollY}
                  // Zemin varken alt uçtaki bounce boşluğunu o dolduruyor;
                  // kuyruk onun üstüne opak bir şerit çizerdi.
                  fillOverscroll={!backdropUri}
                >
                  <SwipeCard
                    profile={profile}
                    previewMode
                    expanded={false}
                    hideChevron
                    hideSuperLike
                    // Jest kapalıysa kartın altındaki X/tik satırı da kalkar:
                    // ikisi AYNI aksiyonun iki yolu, birini bırakmak kapıyı
                    // kapatmamak olurdu. Moderasyon ikonları kalır — SwipeCard
                    // `hideActions` halinde onları kendi ortalanmış satırında
                    // çiziyor (bkz. showModeration).
                    hideActions={swipeDisabled}
                    zoomImpact={photoZoom}
                    onPass={() => triggerAction("left")}
                    onLike={() => triggerAction("right")}
                    onReport={handleReportPress}
                    onBlock={handleBlockPress}
                  />
                </CardSheetScrollView>

                {/* Kartın sabit başlığı: isim/yaş YALNIZ burada — kartın
                    içinde ayrıca çizilmiyor, o yüzden scroll beklemeden açık
                    duruyor. Scroll'un DIŞINDA ama yatay pan'in İÇİNDE: kart
                    yana kayarken şerit onunla gider, dikey scroll'da yerinde
                    kalır. */}
                <CardStickyHeader
                  profile={profile}
                  alwaysOpen
                  // Üst detent'te kartın tepesi ekranın 0'ı → şeridin içeriği
                  // durum çubuğunun altına insin. Keşif'teki köşe butonlarıyla
                  // aynı pay; alt detent'te de fazladan bir nefes olarak kalıyor.
                  topInset={CARD_CHROME_TOP_DROP}
                  // Bandın kendi kırpması, sarmalayıcı kabuğun EN KARE hâlinden
                  // daha yuvarlak OLMAMALI: aksi halde üst köşelerde kabuğun
                  // içinde kalan ama bandın dışına düşen, camsız bir dilim
                  // görünür. 35'te iki detent'te de kırpmayı kabuk yapıyor.
                  radius={CARD_EXPANDED_CORNER_RADIUS}
                  // Sohbetten açılan profil önizlemesindeki üç noktanın aynısı
                  // — kart tam ekranı kapladığı için ekranın kendi başlığı
                  // erişilemez oluyor. Açtığı menü orada dört satır, burada
                  // İKİ: henüz eşleşme yok (bkz. ProfileOptionsSheet).
                  onMenu={() => setOptionsOpen(true)}
                  // Şerit açık doğuyor (`alwaysOpen`), yani scroll'u başlığı
                  // AÇMAK için okumuyor: "bugün aktif" bununla sönüyor ve isim
                  // ortalanıyor.
                  scrollY={scrollY}
                />
              </Animated.View>
            </GestureDetector>
          )}

          {/* Overlay kartın DIŞINDA — DiscoverScreen'deki gibi. İçeride olsaydı
              kart translate'i ile overlay'in kendi translate'i toplanıp tik/çarpı
              ekran dışına çıkıyordu. */}
          <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />
        </View>
      </AppBottomSheet>

      {/* Üç noktanın menüsü — kart sheet'inin ÜSTÜNE biniyor (`push`), kart
          açık kalıyor. Seçilen aksiyonlar kartın altındaki kırmızı satırlarla
          AYNI handler'lar: şikayet kartı kapatıp ReportModal'ı açıyor, engelle
          onayı kendi soruyor. */}
      <ProfileOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        stackBehavior="push"
        onReport={handleReportPress}
        onBlock={handleBlockPress}
      />

      {/* Şikayet akışı sheet'in KARDEŞİ — kart sheet'i kapandıktan sonra
          açılır, iki bottom sheet üst üste binmez. */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget}
        onSuccess={(result: any) => {
          // Şikayetle birlikte engellediyse bu kişi listede kalmasın.
          if (result?.blocked && reportTarget) {
            onSwipe?.(reportTarget, "block");
          }
        }}
      />

      {/* Ayrı bir RN Modal: sheet'in de üstünde kendi penceresi olduğu için
          demo bitene kadar tüm dokunmaları yutar. */}
      <Modal
        visible={visible && tutorialActive}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => {}}
      >
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: colors.mediaScrimSoft,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
            },
            tutorialOverlayStyle,
          ]}
        >
          {/* Oklar `onMedia` (sabit beyaz), `text` DEĞİL: perde iki modda da
              siyah (mediaScrimSoft) — moda dönen mürekkep açık temada siyah
              oku siyah perdeye çiziyordu. */}
          <Animated.View style={leftArrowStyle}>
            <SFIcon
              name="arrow.left"
              fallback={ArrowLeft}
              size={64}
              color={colors.onMedia}
              strokeWidth={1.5}
            />
          </Animated.View>
          <Animated.View style={rightArrowStyle}>
            <SFIcon
              name="arrow.right"
              fallback={ArrowRight}
              size={64}
              color={colors.onMedia}
              strokeWidth={1.5}
            />
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}
