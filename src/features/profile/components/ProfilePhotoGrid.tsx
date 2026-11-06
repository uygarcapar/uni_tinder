import React, { useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, X } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { MAX_PROFILE_PHOTOS } from "@/shared/constants/limits";
import { resolvePhotoUri } from "@/shared/utils/photoUri";
import { normalizePhotoModeration } from "@/features/profile/photoModeration";
import PhotoModerationBadge, {
  PhotoModerationScrim,
} from "@/features/profile/components/PhotoModerationBadge";
import {
  ITEM_HEIGHT,
  ITEM_WIDTH,
  SPRING_CONFIG,
  getContainerHeight,
  getOrder,
  getPosition,
} from "@/features/profile/components/photoGridGeometry";
import { colors } from "../../../shared/theme/colors";

/**
 * Profil fotoğraf ızgarası — sürükle-sırala, ekle karosu, moderasyon rozetleri.
 *
 * ⚠️ NEDEN AYRI DOSYA: bu ızgara `EditProfileForm`ın (3500 satır, SIFIR test)
 * içinde satır içi yaşıyordu ve mod başına fotoğrafla birlikte İKİNCİ bir
 * çağıran geliyor — mod kurulum sheet'i, o modun ilk fotoğraflarını seçme adımı
 * (bkz. backend_per_mode_photos_2026-11-05). Kopyalanmış bir ızgara iki yüzeyin
 * sessizce ayrışması demekti: sürükleme birinde doğru, diğerinde bir slot
 * kaymış olurdu.
 *
 * Geometri burada DEĞİL, saf modülde (`photoGridGeometry`) ve node'da testli —
 * `cropGeometry` kalıbının aynısı. Bu dosyada yalnız render ve jest var.
 *
 * ⚠️ BU BİLEŞEN KENDİ VERİSİNE SAHİP DEĞİL. Sıra, kaydetme ve sunucu senkronu
 * çağıranda kalıyor; buradan yalnız "kullanıcı şunu yaptı" sinyali çıkıyor.
 * Gerekçe: editörde sürükleme `PhotoOrders` + `NewMainPhotoId` üretiyor ve ana
 * foto değişimi selfie onayı gerektirebiliyor (confirmMainPhotoChange); kurulum
 * yüzeyinde ise aynı jest yalnız bir seçim listesi üretecek. İki politika, tek
 * görsel.
 */

// ─── Yükleme parıltısı ──────────────────────────────────────────────────────
// Foto yüklenirken absolute overlay. Gradient seamless loop: 200% genişlik +
// 2 peak (0.25 ve 0.75) → period = kutu genişliği. translateX'i -w → 0
// aralığında sürüp snap'lediğimizde peak hep aynı mutlak konuma düşüyor, görsel
// kopukluk olmuyor. Naive tek-peak gradient döngünün %50'sinde görünmüyordu
// (band ekrandan çıkıp soldan tekrar girene kadar boşluk) → kullanıcıya "geri
// dönüş" gibi geliyordu.
function PhotoShimmer({ borderRadius = 0 }: { borderRadius?: number }) {
  const shimmer = useSharedValue(0);
  const widthSV = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (shimmer.value - 1) * widthSV.value }],
  }));

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        widthSV.value = e.nativeEvent.layout.width;
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: "200%",
            height: "100%",
          },
          animStyle,
        ]}
      >
        <LinearGradient
          colors={[
            "transparent",
            colors.shimmer,
            "transparent",
            colors.shimmer,
            "transparent",
          ]}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Bildirimden gelen fotoğrafın etrafında nabız gibi atan halka.
 *
 * Kutunun İÇİNDE (absoluteFill + aynı yarıçap): kart `overflow: hidden` ve
 * dışarı çizilen bir halka kırpılırdı. `pointerEvents="none"` — vurgu yalnız
 * görsel, altındaki sürükle/sil hedeflerini yutmuyor.
 *
 * Ömrü kendi içinde bitiyor: yumuşak açılış → birkaç nabız → yavaş sönme.
 * Eskiden sonsuz `withRepeat` idi ve ProfileScreen 4.5sn sonra bileşeni
 * unmount edince halka tam parlaklıkken bir karede yok oluyordu. Sekans
 * kasten o pencereden kısa (≈4.4sn): unmount ettiğinde ekranda zaten
 * görünmüyor, sönme kesilmiyor.
 */
const HIGHLIGHT_FADE_IN_MS = 260;
const HIGHLIGHT_PULSE_MS = 850;
const HIGHLIGHT_PULSE_COUNT = 4; // çift sayı → sekans tam parlaklıkta biter
const HIGHLIGHT_FADE_OUT_MS = 700;

function PhotoHighlightRing({ borderRadius }: { borderRadius: number }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, {
        duration: HIGHLIGHT_FADE_IN_MS,
        easing: Easing.out(Easing.quad),
      }),
      withRepeat(
        withTiming(0.4, {
          duration: HIGHLIGHT_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
        }),
        HIGHLIGHT_PULSE_COUNT,
        true,
      ),
      withTiming(0, {
        duration: HIGHLIGHT_FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
      }),
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius,
          borderCurve: "continuous",
          borderWidth: 3,
          // litPlus kırmızısı — primary'nin bir tık doygunu, vurgu bu yüzden
          // kart kenarlarında daha net okunuyor.
          //
          // ⚠️ MODLA DÖNMÜYOR, bilerek. Eskiden "Kaydırmaya başla" CTA'sıyla
          // aynı renk olduğu yazılıydı; o CTA artık `modeAccent` okuyor
          // (Friends'te yeşil), bu halka okumuyor. Gerekçe: bu halka kalıcı bir
          // yüzey değil — bir kez atıp sönen darbe.
          //
          // ⚠️ Mod başına fotoğraf indiğinde yeniden sorulacak bir karar:
          // fotoğraflar artık modun KENDİ içeriği olacak (eski gerekçe
          // "fotoğraflar iki modun paylaştığı veri" idi ve o cümle düşüyor).
          borderColor: colors.litPlus,
        },
        style,
      ]}
    />
  );
}

// expo-image — memory+disk cache → modal her açıldığında foto cache'ten anında
// gelir, ilk yüklemede shimmer gösterilir. Native cachePolicy reliable olduğu
// için RN Image'daki onLoad-cached-hit problemi ve 5s safety-net gerekmez.
function PhotoItem({ photo, onPress, savingPhoto, highlighted = false }: any) {
  const [loading, setLoading] = useState(true);
  // photoId'li sürüm parametresi: silinip yeniden yüklenen foto backend'de aynı
  // slot URL'ine düşse bile cache anahtarı değişir (bkz. photoUri.ts).
  const uri = resolvePhotoUri(photo);
  const { status, isVisibleToOthers } = normalizePhotoModeration(photo);

  return (
    <View
      testID={`profile-photo-${photo.photoId}`}
      style={{ width: "100%", height: "100%" }}
    >
      <View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 20,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.surface,
          // "+" kutusuyla aynı çerçeve (bkz. add-btn): koyu fotoğrafların
          // kenarı zeminde kaybolmasın, boş slotla dolu slot aynı kutu okunsun.
          borderWidth: 0.5,
          borderColor: colors.hairline,
        }}
      >
        <Image
          source={uri ? { uri } : null}
          // recyclingKey: view yeniden kullanıldığında expo-image önceki
          // görüntüyü ekranda tutar; anahtar değişince temizler. Foto ekleme /
          // silme sonrası bir sonraki foto "eski foto" olarak çizilmesin.
          recyclingKey={photo.photoId != null ? String(photo.photoId) : null}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
        {/* Kullanıcı KENDİ fotoğrafını her durumda görür; yayında olmayanı
            gizlemek yerine soluklaştırıp rozetle sebebini belirtiyoruz. */}
        <PhotoModerationScrim
          isVisibleToOthers={isVisibleToOthers}
          borderRadius={20}
        />
        <PhotoModerationBadge
          status={status}
          isVisibleToOthers={isVisibleToOthers}
        />
        {loading && <PhotoShimmer borderRadius={20} />}
        {highlighted && <PhotoHighlightRing borderRadius={20} />}
      </View>
      <TouchableOpacity
        testID={`profile-photo-action-${photo.photoId}`}
        activeOpacity={1}
        onPress={() => onPress(photo)}
        disabled={savingPhoto}
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          borderRadius: 999,
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          backgroundColor: colors.surface,
        }}
      >
        <View pointerEvents="none">
          <SFIcon
            name="xmark"
            fallback={X}
            size={16}
            strokeWidth={3}
            color={colors.textSecondary}
            weight="bold"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const SortablePhoto = React.memo(function SortablePhoto({
  id,
  index,
  positions,
  maxIndex,
  children,
  onDragEnd,
}: any) {
  const isDragging = useSharedValue(false);
  const position = getPosition(index);
  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(1);
  // zIndex'i state ile tutuyoruz, useAnimatedStyle'a sokmuyoruz. Fabric'te
  // zIndex layout property'sidir ve animated style içinde okunduğunda her
  // frame ShadowTree commit'i tetikler — 6 photo × her frame = saniyede
  // yüzlerce commit → react_native_assert "attempts < 1024" SIGABRT.
  const [dragZ, setDragZ] = useState(0);

  // ÖNCEKİ: mount'ta withSpring(translateX.value) no-op spring fırlatıyordu →
  // 12 paralel spring loop. Initial değer zaten doğru, spring'e gerek yok.

  useAnimatedReaction(
    () => positions.value[id],
    (newIndex, prev) => {
      // Initial fire'da (prev === null) ve değişiklik yoksa spring kurma —
      // mount sırasındaki gereksiz spring cascade'ini önler.
      if (newIndex === undefined) return;
      if (prev === undefined && newIndex === index) return;
      if (newIndex === prev) return;
      if (isDragging.value) return;
      const pos = getPosition(newIndex);
      translateX.value = withSpring(pos.x, SPRING_CONFIG);
      translateY.value = withSpring(pos.y, SPRING_CONFIG);
    },
  );

  // ÖNCESİ: useAnimatedReaction(isDragging) mount sırasında 6 photo × 1
  // worklet kaydı → reanimated başlangıç maliyeti. SONRASI: scale spring'i
  // ve dragZ state'i pan gesture handler'larında doğrudan tetikleniyor.
  // Mount'ta hiçbir worklet kayıt edilmiyor, drag feedback aynı.

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
          isDragging.value = true;
          startX.value = translateX.value;
          startY.value = translateY.value;
          scale.value = withSpring(1.05, SPRING_CONFIG);
          runOnJS(setDragZ)(100);
        })
        .onUpdate((event) => {
          translateX.value = startX.value + event.translationX;
          translateY.value = startY.value + event.translationY;

          const newIndex = getOrder(
            translateX.value,
            translateY.value,
            maxIndex,
          );
          const oldIndex = positions.value[id];

          if (newIndex !== oldIndex && newIndex !== undefined) {
            const newPositions = { ...positions.value };
            for (const key in newPositions) {
              if (newPositions[key] === newIndex) {
                newPositions[key] = oldIndex;
                break;
              }
            }
            newPositions[id] = newIndex;
            positions.value = newPositions;
          }
        })
        .onEnd(() => {
          isDragging.value = false;
          scale.value = withSpring(1, SPRING_CONFIG);
          runOnJS(setDragZ)(0);
          const finalPos = getPosition(positions.value[id]);
          runOnJS(onDragEnd)(positions.value, false);
          translateX.value = withSpring(finalPos.x, SPRING_CONFIG);
          translateY.value = withSpring(finalPos.y, SPRING_CONFIG, () => {
            runOnJS(onDragEnd)(positions.value, true);
          });
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, maxIndex, onDragEnd],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as any,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[animatedStyle, { zIndex: dragZ }]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
});

export type ProfilePhotoGridProps = {
  /** Ekrandaki SIRA — dizinin kendi sırası slot sırasıdır. */
  photos: any[];
  /**
   * Sürükleme sırasında canlı slot haritası (`{ [photoId]: index }`).
   *
   * ⚠️ ÇAĞIRANIN shared value'su: sürükleme UI thread'inde ilerliyor ve
   * çağıran (kaydetme, taslak sırası) aynı değeri okumak zorunda. İçeride
   * açsaydık her yeniden render'da yeni bir referans doğar, taşınan karo
   * yerine zıplardı.
   */
  positions: SharedValue<Record<string, number>>;
  /** `(positions, settled)` — `settled` yay bittiğinde true. */
  onDragEnd: (positions: Record<string, number>, settled: boolean) => void;
  onAddPhoto: () => void;
  onPhotoPress: (photo: any) => void;
  /** Kaydetme uçuşta: silme/ekleme dokunuşları kapanıyor. */
  saving?: boolean;
  /** Bildirimden gelen vurgulu foto (string/sayı — karşılaştırma string). */
  highlightPhotoId?: string | number | null;
  /** Slot tavanı. Mod başına fotoğrafta MODUN tavanı (bkz. sözleşme §3.4). */
  maxPhotos?: number;
};

/**
 * ⚠️ Izgara MUTLAK konumlu: karolar `position: absolute` + transform ile
 * yerleşiyor, akışla değil. Sürükleme bunu gerektiriyor — akışta duran bir
 * karo taşınırken kardeşlerini iter ve her kare layout commit'i doğar.
 */
export default function ProfilePhotoGrid({
  photos,
  positions,
  onDragEnd,
  onAddPhoto,
  onPhotoPress,
  saving = false,
  highlightPhotoId = null,
  maxPhotos = MAX_PROFILE_PHOTOS,
}: ProfilePhotoGridProps) {
  // Slot listesi TAVANDAN türüyor — eskiden `[0,1,2,3,4,5]` elle yazılıydı ve
  // tavan değişse sessizce ayrışırdı (mod başına fotoğrafta tavan çağırandan
  // gelebiliyor).
  const slots = useMemo(
    () => Array.from({ length: maxPhotos }, (_, i) => i),
    [maxPhotos],
  );

  return (
    <View
      style={{
        position: "relative",
        width: "100%",
        height: getContainerHeight(photos.length),
      }}
    >
      {slots.map((idx) => {
        const isAddBtn = idx === photos.length;
        const isGhost = idx > photos.length;
        const pos = getPosition(idx);

        if (isAddBtn) {
          return (
            <View
              key="add-btn"
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
              }}
            >
              <TouchableOpacity
                testID="profile-btn-add-photo"
                activeOpacity={1}
                onPress={onAddPhoto}
                disabled={saving}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 28,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  backgroundColor: colors.surface,
                  borderWidth: 0.5,
                  borderColor: colors.hairline,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View className="flex justify-center items-center pointer-events-none">
                  <SFIcon
                    name="plus"
                    fallback={Plus}
                    size={40}
                    strokeWidth={2}
                    color={colors.textMuted}
                    weight="semibold"
                  />
                </View>
              </TouchableOpacity>
            </View>
          );
        }

        if (isGhost) {
          return (
            <View
              key={`ghost-${idx}`}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
              }}
            />
          );
        }
        return null;
      })}

      {photos.map((photo, index) => (
        <SortablePhoto
          key={`${photo.photoId}-${photo.photoImageUrl}`}
          id={photo.photoId}
          index={index}
          positions={positions}
          maxIndex={photos.length - 1}
          onDragEnd={onDragEnd}
        >
          <PhotoItem
            photo={photo}
            onPress={onPhotoPress}
            savingPhoto={saving}
            // Karşılaştırma STRING üzerinden: photoId backend'de sayı,
            // bildirimin `relatedEntityId`i ise metin geliyor.
            highlighted={
              highlightPhotoId != null &&
              String(photo.photoId) === String(highlightPhotoId)
            }
          />
        </SortablePhoto>
      ))}
    </View>
  );
}
