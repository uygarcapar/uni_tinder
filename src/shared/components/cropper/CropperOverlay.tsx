import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { setStatusBarStyle } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  font,
  frame,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { RotateCcw, X } from "lucide-react-native";

import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, isLight, onMediaAt, scrimAt } from "@/shared/theme/colors";
import { glassFallback, HAS_LIQUID_GLASS } from "@/shared/theme/glass";
import { persistPickedPhoto } from "@/shared/utils/photoStore";
import { devLog } from "@/shared/utils/devLog";
import {
  bindCropper,
  type CropOutcome,
  type CropRequest,
} from "./cropperBridge";
import { clamp, coverScale, maxOffset, maxZoom, toSourceRect } from "./cropGeometry";

/**
 * Uygulama içi 3:4 kırpma ekranı (Apple Photos düzeni).
 *
 * NEREYE MOUNT EDİLİR — DİKKAT: `@gorhom/portal` host'unu `children`'dan SONRA
 * render ediyor, yani her bottom sheet `children` içindeki her şeyin üstüne
 * boyanıyor. Profil düzenleme akışı (EditProfileForm → AppModal →
 * BottomSheetModal) bunun içinde olduğu için, bu overlay
 * `BottomSheetModalProvider`'ın İÇİNE konursa modalın ALTINDA açılır ve
 * "cropper açılmıyor" gibi görünür. Doğru yer: provider'ın hemen DIŞI
 * (bkz. App.tsx). `key={mode}` remount'unun da dışında — tema değişimi kırpma
 * ortasında promise'i düşürmemeli.
 *
 * Boştayken `null` döner: aktif değilken ağaçta hiçbir düğüm yok.
 */

const ASPECT_W = 3;
const ASPECT_H = 4;
const OUT_W = 900;
const OUT_H = 1200;
const QUALITY = 0.85;

/** Ölçek 1'in altına inebildiği lastik bölge — bırakınca 1'e yaylanır. */
const RUBBER_MIN = 0.85;
const SPRING = { damping: 20, stiffness: 180, mass: 0.9 };

/**
 * Chrome ölçüleri SABİT — Host'lara `matchContents` VERİLMİYOR.
 *
 * SwiftUI intrinsic ölçüsü ikinci Fabric commit'inde geliyor; ilk karede host
 * 0×0 kalıyor ve buton o sıfır ölçülü kutunun origin'ine ORTALANARAK çiziliyor
 * (bkz. ChatScreen header notu). Tam ekran bir overlay'de bu "butonlar köşeden
 * yerine sıçradı" olarak görünürdü.
 */
const ICON_BTN = 44;
const CTA_W = 200;
const CTA_H = 52;

type Session = { request: CropRequest; settle: (outcome: CropOutcome) => void };

export default function CropperOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const gestureActive = useSharedValue(0);
  const atEdge = useSharedValue(false);

  /**
   * Jest değerlerinin JS tarafındaki AYNASI.
   *
   * "Seç" işleyicisinde `scale.value`'yu doğrudan okumuyoruz: Fabric altında
   * UI thread'den senkron okuma bayat kalabiliyor. Her jest bittiğinde buraya
   * yazıyoruz; buton zaten ancak aktif jest yokken basılabiliyor.
   */
  const latest = useRef({ s: 1, tx: 0, ty: 0 });
  const commit = useCallback((s: number, x: number, y: number) => {
    latest.current = { s, tx: x, ty: y };
  }, []);

  // ---------------------------------------------------------------- yerleşim
  const layout = useMemo(() => {
    const headerH = insets.top + 56;
    // 16 (üst pad) + 15 (ipucu satırı) + 14 (boşluk) + CTA + 16 (alt pad).
    const footerH = insets.bottom + 61 + CTA_H;
    const availW = screenW - 32;
    const availH = Math.max(120, screenH - headerH - footerH - 24);
    const winW = Math.min(availW, (availH * ASPECT_W) / ASPECT_H);
    const winH = (winW * ASPECT_H) / ASPECT_W;
    return {
      headerH,
      footerH,
      winW,
      winH,
      winCX: screenW / 2,
      winCY: headerH + 12 + availH / 2,
    };
  }, [insets.top, insets.bottom, screenW, screenH]);

  const srcW = session?.request.srcWidth ?? 1;
  const srcH = session?.request.srcHeight ?? 1;
  const baseScale = useMemo(
    () => coverScale(srcW, srcH, layout.winW, layout.winH),
    [srcW, srcH, layout.winW, layout.winH],
  );
  const maxScale = useMemo(
    () => maxZoom(baseScale, layout.winW, OUT_W),
    [baseScale, layout.winW],
  );

  // ------------------------------------------------------------------ köprü
  const present = useCallback((request: CropRequest, settle: (o: CropOutcome) => void) => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    gestureActive.value = 0;
    atEdge.value = false;
    latest.current = { s: 1, tx: 0, ty: 0 };
    setBusy(false);
    setSession({ request, settle });
  }, [scale, tx, ty, gestureActive, atEdge]);

  useEffect(() => {
    bindCropper(present);
    return () => bindCropper(null);
  }, [present]);

  const open = session !== null;
  useEffect(() => {
    if (!open) return;
    setStatusBarStyle("light", true);
    return () => setStatusBarStyle(isLight() ? "dark" : "light", true);
  }, [open]);

  // Sonuçlandırma state updater'ının İÇİNDE yapılamaz: React updater'ı iki kez
  // çağırabiliyor (StrictMode) ve promise iki kez çözülürdü.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const finish = useCallback((outcome: CropOutcome) => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    current?.settle(outcome);
  }, []);

  // ------------------------------------------------------------------ jestler
  const { winW, winH, winCX, winCY } = layout;

  const edgeHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const gestures = useMemo(() => {
    const clampTranslate = (notify: boolean) => {
      "worklet";
      const pps = baseScale * scale.value;
      const mx = maxOffset(srcW * pps, winW);
      const my = maxOffset(srcH * pps, winH);
      const nx = clamp(tx.value, -mx, mx);
      const ny = clamp(ty.value, -my, my);
      const hit = nx !== tx.value || ny !== ty.value;
      tx.value = nx;
      ty.value = ny;
      // Haptik KENAR BAŞINA bir kez — her frame'de tetiklenirse titreşim
      // sürekli çalar ve jest tökezler.
      if (notify) {
        if (hit && !atEdge.value) {
          atEdge.value = true;
          runOnJS(edgeHaptic)();
        } else if (!hit && atEdge.value) {
          atEdge.value = false;
        }
      }
    };

    const settleBack = () => {
      "worklet";
      gestureActive.value = 0;
      atEdge.value = false;
      if (scale.value < 1) {
        // Lastik bölgeden 1'e dön. Hedefleri ÖNCE hesaplıyoruz: `withSpring`
        // atandığı anda `.value` animasyonun okunması güvenilmez oluyor.
        const mx = maxOffset(srcW * baseScale, winW);
        const my = maxOffset(srcH * baseScale, winH);
        const targetX = clamp(tx.value, -mx, mx);
        const targetY = clamp(ty.value, -my, my);
        scale.value = withSpring(1, SPRING);
        tx.value = withSpring(targetX, SPRING);
        ty.value = withSpring(targetY, SPRING);
        runOnJS(commit)(1, targetX, targetY);
        return;
      }
      runOnJS(commit)(scale.value, tx.value, ty.value);
    };

    /**
     * ARTIMLI payload şart: `Simultaneous` altında kendi snapshot'ından
     * `startTx + translationX` hesaplayan bir pan, pinch'in aynı karedeki
     * yazımlarını her frame silerdi.
     */
    const pan = Gesture.Pan()
      .onStart(() => {
        "worklet";
        gestureActive.value = 1;
      })
      .onChange((e) => {
        "worklet";
        tx.value += e.changeX;
        ty.value += e.changeY;
        clampTranslate(true);
      })
      .onFinalize(settleBack);

    const pinch = Gesture.Pinch()
      .onStart(() => {
        "worklet";
        gestureActive.value = 1;
      })
      .onChange((e) => {
        "worklet";
        const prev = scale.value;
        const next = clamp(prev * e.scaleChange, RUBBER_MIN, maxScale);
        const k = next / prev;
        // Parmakların altındaki nokta sabit kalsın: f = t + p·s, p sabit
        // tutulunca t' = f + (t − f)·(s'/s).
        const fx = e.focalX - winCX;
        const fy = e.focalY - winCY;
        scale.value = next;
        tx.value = fx + (tx.value - fx) * k;
        ty.value = fy + (ty.value - fy) * k;
        // Lastik bölgede (scale < 1) clamp'lemiyoruz; yoksa geri yaylanma
        // sırasında görüntü kenara yapışır.
        if (next >= 1) clampTranslate(false);
      })
      .onFinalize(settleBack);

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd((e) => {
        "worklet";
        const target = scale.value > 1.05 ? 1 : Math.min(2.2, maxScale);
        const k = target / scale.value;
        const fx = e.x - winCX;
        const fy = e.y - winCY;
        const nextX = fx + (tx.value - fx) * k;
        const nextY = fy + (ty.value - fy) * k;
        const pps = baseScale * target;
        const mx = maxOffset(srcW * pps, winW);
        const my = maxOffset(srcH * pps, winH);
        const finalX = clamp(nextX, -mx, mx);
        const finalY = clamp(nextY, -my, my);
        scale.value = withSpring(target, SPRING);
        tx.value = withSpring(finalX, SPRING);
        ty.value = withSpring(finalY, SPRING);
        runOnJS(commit)(target, finalX, finalY);
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [
    baseScale, maxScale, srcW, srcH, winW, winH, winCX, winCY,
    scale, tx, ty, gestureActive, atEdge, commit, edgeHaptic,
  ]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ] as const,
  }));

  const gridStyle = useAnimatedStyle(() => ({
    opacity: withTiming(gestureActive.value ? 1 : 0.25, { duration: 160 }),
  }));

  // ------------------------------------------------------------------ eylemler
  const handleReset = () => {
    Haptics.selectionAsync().catch(() => {});
    scale.value = withSpring(1, SPRING);
    tx.value = withSpring(0, SPRING);
    ty.value = withSpring(0, SPRING);
    latest.current = { s: 1, tx: 0, ty: 0 };
  };

  const handleCancel = () => {
    if (busy) return;
    finish({ status: "skipped" });
  };

  const handleConfirm = async () => {
    if (!session || busy) return;
    setBusy(true);

    // Kimlik dönüşümü = kullanıcı çerçeveye hiç dokunmadı. Yeniden kırpma
    // akışının bunu bilmesi gerekiyor (bkz. CropOutcome.adjusted).
    const { s, tx: dx, ty: dy } = latest.current;
    const adjusted = s !== 1 || dx !== 0 || dy !== 0;

    const rect = toSourceRect({
      srcW, srcH,
      winW: layout.winW,
      winH: layout.winH,
      baseScale,
      scale: latest.current.s,
      tx: latest.current.tx,
      ty: latest.current.ty,
      aspectW: ASPECT_W,
      aspectH: ASPECT_H,
    });

    // EXIF yönü ELLE işlenmiyor: manipulate() her zaman başa bir
    // fix-orientation dönüşümü ekliyor ve picker görsel olarak DİK boyut
    // raporluyor — yani asset.width/height ile crop() aynı piksel uzayında.
    const context = ImageManipulator.manipulate(session.request.uri);
    let ref: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    try {
      context.crop(rect).resize({ width: OUT_W, height: OUT_H });
      ref = await context.renderAsync();
      const result = await ref.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
      const fileName = `photo_${Date.now()}.jpg`;
      const uri = await persistPickedPhoto(result.uri, fileName);
      finish({ status: "done", photo: { uri, mime: "image/jpeg", fileName }, adjusted });
    } catch (error) {
      devLog("✂️ [cropper] kırpma başarısız", error);
      finish({ status: "failed", error });
    } finally {
      // release() İHMAL EDİLEMEZ: 48MP bir kaynakta sızdırılan tek bir ImageRef
      // ~190 MB. Kayıt akışı arka arkaya 6 fotoğraf kırpabiliyor.
      ref?.release?.();
      context.release?.();
      setBusy(false);
    }
  };

  if (!session) return null;

  const { index, total, uri } = session.request;
  const showCounter = (total ?? 1) > 1 && index != null;
  const dispW = srcW * baseScale;
  const dispH = srcH * baseScale;

  const scrim = scrimAt(0.72);
  const winLeft = layout.winCX - layout.winW / 2;
  const winTop = layout.winCY - layout.winH / 2;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: scrimAt(1) }]}>
      <GestureDetector gesture={gestures}>
        <Animated.View style={StyleSheet.absoluteFill} collapsable={false}>
          {/* Kutu zaten kaynağın TAM oranında boyutlanıyor; contentFit="cover"
              burada sessizce ikinci bir kırpma yapardı. */}
          <Animated.View
            style={[
              {
                position: "absolute",
                left: layout.winCX,
                top: layout.winCY,
                width: dispW,
                height: dispH,
                marginLeft: -dispW / 2,
                marginTop: -dispH / 2,
              },
              imageStyle,
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="fill"
              cachePolicy="memory-disk"
              recyclingKey={uri}
              allowDownscaling
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Karartma: pencerenin dört yanına dikdörtgen. Yuvarlak delik svg
          maskesi gerektirirdi; Apple Photos da keskin köşe kullanıyor. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: winTop, backgroundColor: scrim }} />
        <View style={{ position: "absolute", left: 0, right: 0, top: winTop + layout.winH, bottom: 0, backgroundColor: scrim }} />
        <View style={{ position: "absolute", left: 0, width: winLeft, top: winTop, height: layout.winH, backgroundColor: scrim }} />
        <View style={{ position: "absolute", right: 0, width: winLeft, top: winTop, height: layout.winH, backgroundColor: scrim }} />

        <Animated.View
          style={[
            { position: "absolute", left: winLeft, top: winTop, width: layout.winW, height: layout.winH },
            gridStyle,
          ]}
        >
          {[1, 2].map((i) => (
            <View
              key={`v${i}`}
              style={{ position: "absolute", top: 0, bottom: 0, left: (layout.winW * i) / 3, width: StyleSheet.hairlineWidth, backgroundColor: onMediaAt(0.28) }}
            />
          ))}
          {[1, 2].map((i) => (
            <View
              key={`h${i}`}
              style={{ position: "absolute", left: 0, right: 0, top: (layout.winH * i) / 3, height: StyleSheet.hairlineWidth, backgroundColor: onMediaAt(0.28) }}
            />
          ))}
        </Animated.View>

        <CornerTicks left={winLeft} top={winTop} width={layout.winW} height={layout.winH} />
      </View>

      {/* ------------------------------------------------------------ başlık */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: layout.headerH, paddingTop: insets.top, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <ChromeIconButton
          systemImage="xmark"
          fallbackIcon={X}
          label={t("common.cancel")}
          onPress={handleCancel}
          disabled={busy}
        />

        {showCounter ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.mediaChipBg }}>
            <Text style={{ color: colors.onMedia, fontSize: 13, fontWeight: "600" }}>
              {t("common.cropper.progress", { index, total })}
            </Text>
          </View>
        ) : (
          <Text style={{ color: colors.onMedia, fontSize: 16, fontWeight: "700" }}>
            {t("common.cropper.title")}
          </Text>
        )}

        {/* Sıfırla ARTIK BURADA: alt barda üç buton yan yanayken "İptal" hem
            başlıkta hem altta duruyordu. Apple Photos düzeni — iptal ve sıfırla
            üstte, tek birincil eylem altta. */}
        <ChromeIconButton
          systemImage="arrow.counterclockwise"
          fallbackIcon={RotateCcw}
          label={t("common.cropper.reset")}
          onPress={handleReset}
          disabled={busy}
        />
      </View>

      {/* -------------------------------------------------------------- alt bar
          pointerEvents VERİLMİYOR (box-none DEĞİL): opak şerit dokunuşları
          yutmalı, yoksa altındaki GestureDetector'a düşüp görüntü kayardı. */}
      <View
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 16, paddingHorizontal: 20, backgroundColor: scrimAt(0.9), alignItems: "center" }}
      >
        <Text style={{ color: onMediaAt(0.55), fontSize: 12, textAlign: "center", marginBottom: 14 }}>
          {t("common.cropper.hint")}
        </Text>
        <ChromeConfirmButton
          label={t("common.cropper.choose")}
          onPress={handleConfirm}
          busy={busy}
        />
      </View>
    </View>
  );
}

/**
 * Chrome'un yuvarlak ikon butonu (kapat / sıfırla).
 *
 * iOS'ta @expo/ui'nin native SwiftUI Button'ı — uygulamanın geri kalanıyla
 * (AppModal, ChatScreen header, RegisterBackButton) aynı liquid glass dili.
 * Zemin fotoğraf olduğu için tint `onMedia`: tema ne olursa olsun beyaz kalır.
 */
function ChromeIconButton({
  systemImage,
  fallbackIcon,
  label,
  onPress,
  disabled,
}: {
  systemImage: SFSymbol;
  fallbackIcon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  if (Platform.OS === "ios") {
    return (
      // Basılamaz hâl `onPress`i no-op'a çevirerek veriliyor: SwiftUI butonuna
      // disabled geçmek label'ı da soluklaştırıp koyu zeminde okunmaz yapıyor.
      <Host style={{ width: ICON_BTN, height: ICON_BTN, opacity: disabled ? 0.5 : 1 }}>
        <SwiftUIButton
          label={label}
          systemImage={systemImage}
          onPress={disabled ? () => {} : onPress}
          modifiers={[
            buttonStyle("glass"),
            tint(colors.onMedia),
            controlSize("large"),
            labelStyle("iconOnly"),
            font({ size: 17, weight: "semibold" }),
            frame({ width: ICON_BTN, height: ICON_BTN }),
            // iOS 26 altında glass .automatic'e düşüyor → zeminsiz kalıyor.
            // Medya üstünde çalışan koyu çip + açık kenar veriyoruz.
            ...glassFallback({
              shape: "circle",
              color: colors.onMedia,
              backgroundColor: colors.mediaChipBg,
              borderColor: onMediaAt(0.35),
            }),
          ]}
        />
      </Host>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={{
        width: ICON_BTN,
        height: ICON_BTN,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.mediaChipBg,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View pointerEvents="none">
        <SFIcon name={systemImage} fallback={fallbackIcon} size={18} strokeWidth={2.5} color={colors.onMedia} weight="semibold" />
      </View>
    </AnimatedPressable>
  );
}

/** Alt bardaki tek birincil eylem ("Seç"). */
function ChromeConfirmButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  // Kırpma sürerken Host, aynı ölçüdeki düz bir pill + spinner ile DEĞİŞTİRİLİR:
  // native SwiftUI butonunun üstüne RN spinner bindirmek katman sırasına bağlı
  // kalırdı, ölçü aynı olduğu için alt bar zıplamıyor.
  if (busy) {
    return (
      <View
        style={{ width: CTA_W, height: CTA_H, borderRadius: 999, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: 0.7 }}
      >
        <ActivityIndicator size="small" color={colors.onMedia} />
      </View>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <Host style={{ width: CTA_W, height: CTA_H }}>
        <SwiftUIButton
          label={label}
          onPress={onPress}
          modifiers={[
            // glassProminent = dolgulu (tint'li) cam. iOS 26 altında sessizce
            // .automatic'e düşeceği için orada "glass" + fallback dolgusu
            // kullanılıyor; iki yolda da sonuç birincil kırmızı kapsül.
            buttonStyle(HAS_LIQUID_GLASS ? "glassProminent" : "glass"),
            controlSize("large"),
            tint(HAS_LIQUID_GLASS ? colors.primary : colors.onMedia),
            font({ size: 16, weight: "semibold" }),
            frame({ width: CTA_W, height: CTA_H }),
            ...glassFallback({
              shape: "capsule",
              backgroundColor: colors.primary,
              borderColor: colors.primary,
            }),
          ]}
        />
      </Host>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ width: CTA_W, height: CTA_H, borderRadius: 999, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}
    >
      <Text style={{ color: colors.onMedia, fontSize: 16, fontWeight: "700" }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** Çerçevenin dört köşesindeki L biçimli tırnaklar. */
function CornerTicks({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const LEN = 22;
  const THICK = 2;
  const tick = onMediaAt(0.95);
  const corners = [
    { x: left, y: top, hx: 0, hy: 0, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top, hx: 0, hy: 0, vx: LEN - THICK, vy: 0 },
    { x: left, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: LEN - THICK, vy: 0 },
  ];
  return (
    <>
      {corners.map((c, i) => (
        <View key={i} style={{ position: "absolute", left: c.x, top: c.y, width: LEN, height: LEN }}>
          <View style={{ position: "absolute", left: c.hx, top: c.hy, width: LEN, height: THICK, backgroundColor: tick }} />
          <View style={{ position: "absolute", left: c.vx, top: c.vy, width: THICK, height: LEN, backgroundColor: tick }} />
        </View>
      ))}
    </>
  );
}
