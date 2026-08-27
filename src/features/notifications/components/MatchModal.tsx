import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { MessageCircle } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { flameCurtainGeometry } from "@/features/discover/components/flameWavePath";
import { colors, onMediaAt, scrimAt } from "../../../shared/theme/colors";

/**
 * Kutlama zemini: süper beğenideki alev dalgasının PERDE hâli (bkz.
 * flameCurtainGeometry). Eskiden burada tam ekran blur + iki yandan konfeti
 * patlaması vardı; süper beğeniyle aynı ateşten okunsun diye ikisi de kalktı.
 *
 * Skia ağır ve bu bileşen kökte SÜREKLİ mount (bkz. AppNavigator) — canvas
 * ayrı chunk'ta, ilk eşleşmeye kadar hiç yüklenmiyor. Aynı gerekçe
 * SuperLikeFlame'de de yazılı.
 */
const FlameCurtain = lazy(() =>
  import("@/features/discover/components/SuperLikeFlameCanvas").then((m) => ({
    default: m.FlameCurtainCanvas,
  })),
);

/** İçerik perdeden ÖNDE sönsün: perde yukarı süpürülürken altı boş kalmasın. */
const CONTENT_FADE_OUT_MS = 180;

export default function MatchModal({ match, myPhoto, onClose, onSendMessage }: any) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  // Perdenin süreleri Skia'sız hesaplanıyor: canvas chunk'ı hiç yüklenemese de
  // modal aynı ritimde açılıp kapanmalı (kutlama atlanır, akış durmaz).
  const curtain = useMemo(
    () => flameCurtainGeometry(width, height),
    [width, height],
  );

  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const leftAnim = useRef(new Animated.Value(-60)).current;
  const rightAnim = useRef(new Animated.Value(60)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  const backScale = useRef(new Animated.Value(1)).current;
  const titleShake = useRef(new Animated.Value(0)).current;
  const sendShake = useRef(new Animated.Value(0)).current;
  const sendLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const [myLoaded, setMyLoaded] = useState(!myPhoto);
  const [matchLoaded, setMatchLoaded] = useState(!match?.matchedUserPhoto);
  const imagesReady = myLoaded && matchLoaded;

  // Kapanış perdenin ÇIKIŞ süpürmesini bekliyor; asıl aksiyon (kapat / sohbete
  // git) süpürme bitince çalışıyor. Ref de var çünkü çift dokunuş `closing`
  // state'i güncellenmeden ikinci kez gelebiliyor.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setMyLoaded(!myPhoto);
    setMatchLoaded(!match?.matchedUserPhoto);
  }, [match?.conversationId, myPhoto, match?.matchedUserPhoto]);

  // Yeni eşleşme aynı mount'ta gelebilir (arka arkaya iki match): kapanış
  // durumu devredilirse ikinci kutlama daha açılmadan kapanmış sayılırdı.
  useEffect(() => {
    setClosing(false);
    closingRef.current = false;
    closeActionRef.current = null;
  }, [match?.conversationId]);

  useEffect(() => {
    if (!match) return;
    const t = setTimeout(() => {
      setMyLoaded(true);
      setMatchLoaded(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [match?.conversationId]);

  const startClose = (action: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    closeActionRef.current = action;
    setClosing(true);
  };

  const handlePressIn = (val) => {
    Animated.spring(val, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };
  const handlePressOut = (val) => {
    Animated.spring(val, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 20,
    }).start();
  };
  useEffect(() => {
    if (!match || !imagesReady) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );

    // Zemin, perde daha alttayken kararıyor: alev karanlığa karşı yükselsin.
    Animated.timing(scrimOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // İçerik perde YERİNE OTURDUKTAN sonra açılıyor: önce ateş, sonra kutlama.
    // Üst üste binseydi fotoğraflar hâlâ yükselen alevin altında belirirdi.
    const reveal = Animated.sequence([
      Animated.delay(curtain.enterMs),
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(leftAnim, {
          toValue: 0,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.spring(rightAnim, {
          toValue: 0,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
    ]);
    reveal.start();

    const shake = Animated.sequence([
      Animated.delay(curtain.enterMs + 120),
      Animated.timing(titleShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: 0.6, duration: 50, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: -0.6, duration: 50, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]);
    shake.start();

    // "Mesaj Gönder" butonu dikkat titremesi: açılışta daha uzun süren bir burst,
    // sonrasında sonsuz tekrar eden nabız. Genlik ve hız ikisinde de aynı — açılış
    // yalnızca daha çok salınım yapıyor, daha sert değil.
    const wig = (toValue: number, duration: number) =>
      Animated.timing(sendShake, { toValue, duration, useNativeDriver: true });

    const AMP = 0.7;

    const intro = Animated.sequence([
      Animated.delay(curtain.enterMs + 650),
      wig(AMP, 70),
      wig(-AMP, 70),
      wig(AMP, 70),
      wig(-AMP, 70),
      wig(AMP * 0.7, 65),
      wig(-AMP * 0.7, 65),
      wig(AMP * 0.7, 65),
      wig(-AMP * 0.7, 65),
      wig(AMP * 0.4, 60),
      wig(-AMP * 0.4, 60),
      wig(0, 60),
    ]);

    intro.start(({ finished }) => {
      if (!finished) return;
      sendLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.delay(1600),
          wig(AMP, 70),
          wig(-AMP, 70),
          wig(AMP * 0.7, 65),
          wig(-AMP * 0.7, 65),
          wig(AMP * 0.4, 60),
          wig(0, 60),
        ]),
      );
      sendLoopRef.current.start();
    });

    return () => {
      reveal.stop();
      shake.stop();
      intro.stop();
      sendLoopRef.current?.stop();
      sendLoopRef.current = null;
      scale.setValue(0.6);
      opacity.setValue(0);
      scrimOpacity.setValue(0);
      leftAnim.setValue(-60);
      rightAnim.setValue(60);
      titleShake.setValue(0);
      sendShake.setValue(0);
    };
  }, [match, imagesReady, curtain.enterMs]);

  // Çıkış: perde yukarı süpürülürken içerik önden sönüyor, zemin de perdeyle
  // birlikte açılıyor. Zamanlayıcı CANVAS'a bağlı değil — Skia chunk'ı hiç
  // yüklenemese de modal kapanmak zorunda.
  useEffect(() => {
    if (!closing) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: CONTENT_FADE_OUT_MS,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start();
    Animated.timing(scrimOpacity, {
      toValue: 0,
      duration: curtain.exitMs,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start();
    const done = setTimeout(() => {
      const run = closeActionRef.current;
      closeActionRef.current = null;
      run?.();
    }, curtain.exitMs);
    return () => clearTimeout(done);
  }, [closing, curtain.exitMs]);

  if (!match) return null;

  const AVATAR = 150;
  const OVERLAP = 28;

  return (
    <Modal
      visible
      transparent
      // Perdenin kendi giriş/çıkış süpürmesi var; Modal'ın fade'i onu bir de
      // opaklıktan geçirirdi (alev yükselmek yerine belirirdi).
      animationType="none"
      onRequestClose={() => startClose(onClose)}
    >
      <View style={{ flex: 1 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: scrimAt(0.72), opacity: scrimOpacity },
          ]}
        />
        {imagesReady && (
          <Suspense fallback={null}>
            <FlameCurtain key={match.conversationId} closing={closing} />
          </Suspense>
        )}
        <Animated.View
          pointerEvents={closing ? "none" : "auto"}
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            // Perdenin alt kenarı delikli: içerik alevlerin arasına düşmesin.
            paddingBottom: curtain.hemHeight,
            opacity,
          }}
        >
          <Animated.View
            style={{
              transform: [{ scale }],
              alignItems: "center",
              paddingHorizontal: 60,
              alignSelf: "stretch",
            }}
          >
            <Animated.View
              style={{
                // Negatif marj BİLEREK: başlık, butonları saran 60px'lik
                // paddingHorizontal'ın dışına taşıyor. Punto otomatik küçüldüğü
                // için (aşağıya bkz.) dar kutu doğrudan küçük yazı demekti —
                // kutu genişleyince başlık ekranın izin verdiği kadar büyük
                // kalıyor. Butonların genişliği bundan etkilenmiyor.
                marginHorizontal: -44,
                paddingVertical: 12,
                marginBottom: 36,
                transform: [
                  {
                    translateX: titleShake.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [-10, 0, 10],
                    }),
                  },
                  {
                    rotate: titleShake.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: ["-6deg", "0deg", "6deg"],
                    }),
                  },
                ],
              }}
            >
              {/* Tek satırda kalsın: 44px kısa başlığın (EN "It's Lit!") tam
                  boyu, uzun olanı (TR "Biriyle Eşleştin!") satıra sığacak
                  kadar küçülüyor. Sarmaya izin verilseydi iki satırlık başlık
                  küçük ekranlarda içeriği alevlerin şeridine taşıyordu. */}
              <Text
                className="font-bold text-[44px]"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ color: colors.onMedia, textAlign: "center" }}
              >
                {t('match.title')}
              </Text>
            </Animated.View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                height: AVATAR,
              }}
            >
              <Animated.View
                style={{
                  transform: [{ translateX: leftAnim }, { rotate: "-6deg" }],
                  marginRight: -OVERLAP,
                }}
              >
                <View
                  style={{
                    width: AVATAR,
                    height: AVATAR,
                    borderRadius: AVATAR / 2,
                    // Kalın beyaz halka: fotoğraflar alev perdesinin üstünde
                    // kesilip çıkarılmış gibi dursun. `onMedia` iki modda da
                    // beyaz — zemin sabit marka gradyanı, modla dönmüyor.
                    borderWidth: 4,
                    borderColor: colors.onMedia,
                    overflow: "hidden",
                    backgroundColor: colors.surface2,
                  }}
                >
                  {myPhoto && (
                    <Image
                      source={{ uri: myPhoto }}
                      style={{ width: "100%", height: "100%" }}
                      cachePolicy="memory-disk"
                      transition={0}
                      contentFit="cover"
                      onLoad={() => setMyLoaded(true)}
                      onError={() => setMyLoaded(true)}
                    />
                  )}
                </View>
              </Animated.View>

              <Animated.View
                style={{
                  transform: [{ translateX: rightAnim }, { rotate: "6deg" }],
                  marginLeft: -OVERLAP,
                }}
              >
                <View
                  style={{
                    width: AVATAR,
                    height: AVATAR,
                    borderRadius: AVATAR / 2,
                    // Kalın beyaz halka: fotoğraflar alev perdesinin üstünde
                    // kesilip çıkarılmış gibi dursun. `onMedia` iki modda da
                    // beyaz — zemin sabit marka gradyanı, modla dönmüyor.
                    borderWidth: 4,
                    borderColor: colors.onMedia,
                    overflow: "hidden",
                    backgroundColor: colors.surface2,
                  }}
                >
                  {!!match.matchedUserPhoto && (
                    <Image
                      source={{ uri: match.matchedUserPhoto }}
                      style={{ width: "100%", height: "100%" }}
                      cachePolicy="memory-disk"
                      transition={0}
                      contentFit="cover"
                      onLoad={() => setMatchLoaded(true)}
                      onError={() => setMatchLoaded(true)}
                    />
                  )}
                </View>
              </Animated.View>
            </View>

            <Text className="text-[15px] text-center font-semibold mt-8" style={{ color: colors.onMedia }}>
              {t('match.subtitle', { name: match.matchedUserName })}
            </Text>

            <Animated.View
              style={{
                width: "100%",
                transform: [
                  { scale: sendScale },
                  {
                    translateX: sendShake.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [-5, 0, 5],
                    }),
                  },
                  {
                    rotate: sendShake.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: ["-1.2deg", "0deg", "1.2deg"],
                    }),
                  },
                ],
              }}
              className="mt-8"
            >
              {/* CTA artık litPlus DOLGULU DEĞİL: zemin alev perdesi olduğundan
                  (gradients.swipeHeart) kırmızı buton kırmızı üstünde kayboluyordu.
                  Ters çevrildi — beyaz dolgu, koyu mürekkep. Mürekkep `text`
                  DEĞİL `onMediaInverse`: dolgu iki modda da beyaz (onMedia),
                  `text` koyu modda beyaza dönüp butonda kaybolurdu. */}
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => startClose(() => onSendMessage?.(match.conversationId))}
                onPressIn={() => handlePressIn(sendScale)}
                onPressOut={() => handlePressOut(sendScale)}
                className="w-full flex-row items-center justify-center py-[16px] rounded-full"
                style={{ backgroundColor: colors.onMedia, borderCurve: "continuous" }}
              >
                <SFIcon name="message.fill" fallback={MessageCircle} size={18} color={colors.onMediaInverse} strokeWidth={2} weight="semibold" />
                <Text className="font-semibold text-[14px] ml-2" style={{ color: colors.onMediaInverse }}>
                  {t('match.sendMessage')}
                </Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View
              style={{ width: "100%", transform: [{ scale: backScale }] }}
              className="mt-3"
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => startClose(onClose)}
                onPressIn={() => handlePressIn(backScale)}
                onPressOut={() => handlePressOut(backScale)}
                className="w-full flex-row items-center justify-center py-5 rounded-full"
                style={{
                  backgroundColor: onMediaAt(0.15),
                  borderCurve: "continuous",
                }}
              >
                <Text className="font-medium text-[14px]" style={{ color: onMediaAt(0.85) }}>
                  {t('match.back')}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}
