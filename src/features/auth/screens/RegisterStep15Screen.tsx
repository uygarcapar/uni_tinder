import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
} from "react-native";
import { File } from "expo-file-system";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import {
  updateMultipleFields,
  registerAndComplete,
  type ProfileSubmitError,
} from "@/features/profile/profileSlice";
import {
  extractModerationPhotos,
  isFatalReasonCode,
  moderationReasonText,
  moderationReasonTitle,
  summarizeModeration,
} from "@/features/profile/photoModeration";
import {
  setUserAndToken,
  clearRegistrationForm,
} from "@/features/auth/authSlice";
import * as Location from "expo-location";
import { Plus, X, Star } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import {
  pickAndCropPhotos,
  captureAndCropPhoto,
} from "../../../shared/utils/photoPicker";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { photosSchema, PhotosForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';
import { devLog } from '@/shared/utils/devLog';
import { checkRegistrationToken } from '@/features/auth/registrationToken';

const { width } = Dimensions.get("window");
const CONTAINER_PADDING = 24;
const AVAILABLE_WIDTH = width - CONTAINER_PADDING * 2;
const ITEM_WIDTH = AVAILABLE_WIDTH * 0.48;
const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);
const HORIZONTAL_GAP = AVAILABLE_WIDTH - ITEM_WIDTH * 2;
const ROW_GAP = 20;
const SPRING_CONFIG = { damping: 22, stiffness: 140, mass: 1.4 };

/**
 * Yerel dosya hâlâ diskte mi? EMİN OLAMADIĞIMIZDA `true` döner (fail-open):
 * yanlış negatif, kullanıcının duran fotoğrafını silmek demek olurdu.
 * file:// dışı şemalar (ph://, content://) burada doğrulanamaz, dokunulmaz.
 */
const fileStillExists = (uri: string) => {
  const normalized = uri.startsWith("/") ? `file://${uri}` : uri;
  if (!normalized.startsWith("file://")) return true;
  try {
    return new File(normalized).exists;
  } catch {
    return true;
  }
};

const getPosition = (index: number) => {
  "worklet";
  return {
    x: (index % 2) * (ITEM_WIDTH + HORIZONTAL_GAP),
    y: Math.floor(index / 2) * (ITEM_HEIGHT + ROW_GAP),
  };
};

const getOrder = (tx: number, ty: number, maxIndex: number) => {
  "worklet";
  const col = Math.round(tx / (ITEM_WIDTH + HORIZONTAL_GAP));
  const row = Math.round(ty / (ITEM_HEIGHT + ROW_GAP));
  return Math.max(0, Math.min(row * 2 + col, maxIndex));
};

function SortablePhoto({ id, index, positions, maxIndex, children, onDragStart, onDragEnd, disabled = false }: any) {
  const isDragging = useSharedValue(false);
  const position = getPosition(index);
  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useAnimatedReaction(
    () => positions.value[id],
    (newIndex: number) => {
      if (!isDragging.value && newIndex !== undefined) {
        const pos = getPosition(newIndex);
        translateX.value = withSpring(pos.x, SPRING_CONFIG);
        translateY.value = withSpring(pos.y, SPRING_CONFIG);
      }
    },
  );

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      isDragging.value = true;
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
      const newIndex = getOrder(translateX.value, translateY.value, maxIndex);
      const oldIndex = positions.value[id];
      if (newIndex !== oldIndex && newIndex !== undefined) {
        const newPositions = { ...positions.value };
        for (const key in newPositions) {
          if (newPositions[key] === newIndex) { newPositions[key] = oldIndex; break; }
        }
        newPositions[id] = newIndex;
        positions.value = newPositions;
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      const finalPos = getPosition(positions.value[id]);
      translateX.value = withSpring(finalPos.x, SPRING_CONFIG);
      translateY.value = withSpring(finalPos.y, SPRING_CONFIG, () => { runOnJS(onDragEnd)(positions.value); });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute", top: 0, left: 0, width: ITEM_WIDTH, height: ITEM_HEIGHT,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: withSpring(isDragging.value ? 1.05 : 1, SPRING_CONFIG) }],
    zIndex: isDragging.value ? 100 : 0,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

function PhotoCard({ photo, onRemove, isMain, pickMode, onPickMain, mainLabel }: any) {
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View style={{ width: "100%", height: "100%", borderRadius: 32, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface, borderWidth: pickMode ? 2 : 0, borderColor: colors.primary }}>
        <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        {/* Ana fotoğraf ilk sıradaki. Kural (tam 1 kişi) yalnızca buna
            uygulandığı için hangisi olduğu görünür olmalı. */}
        {isMain && !pickMode ? (
          <View style={{ position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderCurve: "continuous", backgroundColor: colors.mediaChipBg, borderWidth: 0.5, borderColor: colors.mediaHairline }}>
            <SFIcon name="star.fill" fallback={Star} size={11} strokeWidth={2.5} color={colors.onMedia} weight="semibold" fill={colors.onMedia} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.onMedia }}>{mainLabel}</Text>
          </View>
        ) : null}
        {/* Seçim modu: dokunulan foto ilk sıraya (ana fotoğrafa) taşınır. */}
        {pickMode ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onPickMain} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        ) : null}
      </View>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onRemove}
        style={{ position: "absolute", top: -8, right: -8, borderRadius: 999, width: 32, height: 32, alignItems: "center", justifyContent: "center", zIndex: 50, backgroundColor: colors.surface, borderWidth: 0.4, borderColor: colors.border }}
      >
        <View pointerEvents="none"><SFIcon name="xmark" fallback={X} size={16} strokeWidth={3} color={colors.textSecondary} weight="bold" /></View>
      </TouchableOpacity>
    </View>
  );
}

export default function RegisterStep15Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep15'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});
  const loading = useAppSelector((s) => (s as any).profile.loading);
  const registrationEmail = useAppSelector((s) => (s as any).auth.registrationEmail);
  const emailVerifiedToken = useAppSelector((s) => (s as any).auth.emailVerifiedToken);

  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  // Ana fotoğraf hatası aldıktan sonra açılan seçim modu: fotoğrafı silmek
  // yerine BAŞKA birini ana yapmak çoğu durumda doğru çözüm (rehber §4).
  const [mainPickMode, setMainPickMode] = useState(false);
  const positions = useSharedValue({});

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<PhotosForm>({
    resolver: zodResolver(photosSchema),
    defaultValues: { photos: profile.photos || [] },
  });

  const photos = watch("photos");

  useEffect(() => {
    const newPositions: Record<string, number> = {};
    photos.forEach((photo, i) => { newPositions[photo] = i; });
    positions.value = newPositions;
  }, [photos]);

  useEffect(() => {
    dispatch(updateMultipleFields({ photos }));
  }, [photos, dispatch]);

  /**
   * Yarım kayıttan dönüşte ÖLÜ fotoğraf yollarını ayıkla.
   *
   * crop-picker çıktıyı iOS'ta tmp/, Android'de cache/ altına yazıyor; persist
   * edilen yalnızca yol. OS bu dizinleri uygulama kapalıyken temizleyebiliyor
   * (depolama baskısı, sürüm güncellemesi, "önbelleği temizle"). Yol ölmüşse
   * tile boş görünüyor ve gönderim native tarafta patlayıp kullanıcıya sebebi
   * anlaşılmayan bir hata veriyordu — burada sessizce düşürüp haber veriyoruz.
   *
   * Yalnız MOUNT'ta: oturum içinde seçilen fotoğraflar zaten taze.
   */
  const prunedRef = useRef(false);
  useEffect(() => {
    if (prunedRef.current) return;
    prunedRef.current = true;
    const initial = photos;
    if (initial.length === 0) return;
    const alive = initial.filter(fileStillExists);
    if (alive.length === initial.length) return;
    devLog(`🧹 [RegisterStep15] ${initial.length - alive.length} photo(s) vanished from cache`);
    setValue("photos", alive, { shouldValidate: true });
    Alert.alert(
      t('auth.step15.photosMissingTitle'),
      t('auth.step15.photosMissing'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * `emailVerifiedToken` yalnız soğuk açılışta doğrulanıyordu; uygulama arka
   * planda günlerce bekleyip öne alındığında süresi dolmuş token'la POST atılıp
   * generic hata alınıyordu. Son adımda (ve her foreground'a dönüşte) bir kez
   * daha soruyoruz — geçersizse kullanıcıyı boş yere fotoğraf yüklettirmeden
   * doğrulamaya gönderiyoruz. Kayıt başarıyla bitince token null olur ve efekt
   * hiç çalışmaz (aksi halde uygulamaya girerken Step1'e atardı).
   */
  useEffect(() => {
    if (!registrationEmail || !emailVerifiedToken) return;
    let cancelled = false;

    const verify = () => {
      checkRegistrationToken(registrationEmail, emailVerifiedToken).then((result) => {
        // 'unknown' (ağ hatası) akışı KESMEZ — gönderim zaten kendi hatasını verir.
        if (cancelled || result !== 'invalid') return;
        Alert.alert(
          t('auth.step15.sessionExpiredTitle'),
          t('auth.step15.sessionExpired'),
          [
            {
              text: t('common.ok'),
              onPress: () =>
                navigation.reset({ index: 0, routes: [{ name: "RegisterStep1" }] }),
            },
          ],
        );
      });
    };

    verify();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') verify();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [registrationEmail, emailVerifiedToken, navigation, t]);

  const appendPhotos = (uris: string[]) => {
    if (uris.length === 0) return;
    setValue("photos", [...photos, ...uris], { shouldValidate: true });
  };

  const addFromGallery = async (remainingSlots: number) => {
    try {
      const newCroppedPhotos = await pickAndCropPhotos(remainingSlots);
      appendPhotos(newCroppedPhotos.map((p) => p.uri));
    } catch (error: any) {
      if (error?.code === "E_NO_LIBRARY_PERMISSION") {
        Alert.alert(t('profile.permissions.title'), t('profile.permissions.galleryMessage'));
        return;
      }
      devLog("Galeri seçimi hatası:", error);
    }
  };

  const addFromCamera = async () => {
    try {
      const taken = await captureAndCropPhoto();
      if (taken) appendPhotos([taken.uri]);
    } catch (error: any) {
      if (error?.code === "E_NO_CAMERA_PERMISSION") {
        Alert.alert(t('profile.permissions.title'), t('profile.permissions.cameraMessage'));
        return;
      }
      devLog("Kamera çekimi hatası:", error);
    }
  };

  // Kaynak seçimi — ProfileScreen'deki Alert tabanlı desenle aynı.
  const pickImage = () => {
    const remainingSlots = 6 - photos.length;
    if (remainingSlots <= 0) { Alert.alert(t('common.error'), t('auth.step15.maxPhotosError')); return; }
    Alert.alert(
      t('profile.photos.addTitle'),
      t('profile.photos.addMessage'),
      [
        { text: t('profile.photos.sourceCamera'), onPress: addFromCamera },
        { text: t('profile.photos.sourceGallery'), onPress: () => addFromGallery(remainingSlots) },
        { text: t('common.cancel'), style: "cancel" },
      ],
    );
  };

  const removePhoto = (photoToRemove: string) => {
    setValue("photos", photos.filter((p) => p !== photoToRemove), { shouldValidate: true });
  };

  // Ana fotoğraf = ilk sıradaki (MainPhotoIndex hep 0 gönderiliyor), yani
  // "ana yap" işlemi listeyi yeniden sıralamaktan ibaret.
  const promoteToMain = (photo: string) => {
    setMainPickMode(false);
    if (photos[0] === photo) return;
    setValue("photos", [photo, ...photos.filter((p) => p !== photo)], {
      shouldValidate: true,
    });
  };

  const handleDragStart = () => { setIsDraggingPhoto(true); };

  const handleDragEnd = (newPositions: Record<string, number>) => {
    setIsDraggingPhoto(false);
    const newOrder = [...photos].sort((a, b) => newPositions[a] - newPositions[b]);
    const isChanged = newOrder.some((p, i) => p !== photos[i]);
    if (isChanged) setValue("photos", newOrder);
  };

  const handleCompleteProfile = handleSubmit(async ({ photos: finalPhotos }) => {
    try {
      // Koordinat normalde Step9'da (zorunlu izin adımı) alınıp redux'a yazılır.
      // Burada yalnızca fallback okuma var: kullanıcı Step9'dan sonra izni
      // kapattıysa veya persist edilmiş yarım kayıt akışıyla doğrudan buraya
      // düştüyse. İzin yoksa Step9'a geri gönderiyoruz — backend
      // Latitude/Longitude'u [Required] bekliyor.
      let latitude = profile.latitude;
      let longitude = profile.longitude;
      if (latitude == null || longitude == null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { navigation.navigate("RegisterStep9"); return; }
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
      }
      const response = await (dispatch(
        registerAndComplete({ photos: finalPhotos, mainPhotoIndex: 0, latitude, longitude }),
      ) as any).unwrap();
      if (!response?.isSuccess) { return; }

      const enterApp = () => {
        dispatch(setUserAndToken({ user: response.result.user, token: response.result.token, refreshToken: response.result.refreshToken }));
        dispatch(clearRegistrationForm());
      };

      // register-and-complete'in LoginResponseDto'suna opsiyonel `photos` alanı
      // eklendi. Review/Pending fotoğraf kaydı ENGELLEMEZ — profil oluşur, foto
      // gizli kalır. Kullanıcıya "beklemen yeterli, yeniden yükleme" demek için
      // uygulamaya girmeden önce bir kez bilgilendiriyoruz.
      const summary = summarizeModeration(extractModerationPhotos(response.result));
      if (summary) {
        Alert.alert(summary.title, summary.message, [
          { text: t('common.ok'), onPress: enterApp },
        ]);
        return;
      }
      enterApp();
    } catch (err) {
      // Eskiden burada yalnızca devLog vardı: ana fotoğraf reddedildiğinde
      // spinner duruyor ve kullanıcıya HİÇBİR ŞEY gösterilmiyordu.
      devLog("❌ registerAndComplete error:", err);
      const submitError = err as ProfileSubmitError;
      if (!submitError?.message) {
        Alert.alert(t('common.error'), t('auth.step15.submitError'));
        return;
      }

      const fatal = submitError.photos?.find((p) => isFatalReasonCode(p.reasonCode));
      const reasonCode = submitError.reasonCode;
      const title = reasonCode
        ? moderationReasonTitle(fatal?.status ?? 'Rejected', reasonCode)
        : t('common.error');

      // Ana fotoğraf hatasında fotoğrafı SİLMEK gerekmiyor — başka birini ana
      // yapmak yetiyor. Doğrudan o aksiyonu sunuyoruz.
      if (isFatalReasonCode(reasonCode) && photos.length > 1) {
        Alert.alert(title, submitError.message, [
          {
            text: t('profile.photoModeration.chooseAnotherMain'),
            onPress: () => setMainPickMode(true),
          },
          { text: t('common.cancel'), style: "cancel" },
        ]);
        return;
      }
      Alert.alert(title, submitError.message);
    }
  });

  const totalSlots = photos.length + (photos.length < 6 ? 1 : 0);
  const numRows = Math.max(1, Math.ceil(totalSlots / 2));
  const containerHeight = numRows * ITEM_HEIGHT + (numRows - 1) * ROW_GAP;
  const addPos = getPosition(photos.length);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <RegisterProgressBar step={15} />

      <ScrollView className="flex-1 px-6 py-6 pt-0" keyboardShouldPersistTaps="handled">
        <View className="flex flex-col gap-2 mb-6">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>{t('auth.step15.titleWithCount', { count: photos.length })}</Text>
          <Text className="text-[18px] font-normal" style={{ color: colors.textSecondary }}>
            {mainPickMode ? t('auth.step15.pickMainHint') : t('auth.step15.description')}
          </Text>
          {/* Ana fotoğraf / diğerleri ayrımı AÇIKÇA yazılmalı: kullanıcı "her
              fotoğrafta yalnız olmalıyım" sanarsa grup fotoğraflarını hiç
              yüklemez. Kural yalnızca ana fotoğrafa uygulanıyor. */}
          {!mainPickMode ? (
            <View className="mt-2 flex flex-col gap-1">
              <Text className="text-[14px] font-normal" style={{ color: colors.textSecondary }}>
                ⭐  {t('profile.photoModeration.mainHint')}
              </Text>
              <Text className="text-[14px] font-normal" style={{ color: colors.textMuted }}>
                {t('profile.photoModeration.otherHint')}
              </Text>
            </View>
          ) : null}
          {errors.photos ? (
            <Text className="text-[14px] font-normal mt-2" style={{ color: colors.error }}>{errors.photos.message}</Text>
          ) : null}
        </View>

        {/* Grid */}
        <View style={{ height: containerHeight, position: "relative", marginBottom: 40 }}>
          {photos.map((photo, index) => (
            <SortablePhoto
              key={photo}
              id={photo}
              index={index}
              positions={positions}
              maxIndex={photos.length - 1}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              disabled={loading || mainPickMode}
            >
              <PhotoCard
                photo={photo}
                onRemove={loading || mainPickMode ? undefined : () => removePhoto(photo)}
                isMain={index === 0}
                pickMode={mainPickMode}
                onPickMain={() => promoteToMain(photo)}
                mainLabel={t('auth.step15.mainPhotoLabel')}
              />
            </SortablePhoto>
          ))}

          {photos.length < 6 && (
            <View style={{ position: "absolute", left: addPos.x, top: addPos.y, width: ITEM_WIDTH, height: ITEM_HEIGHT }}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={pickImage}
                disabled={loading}
                style={{ width: "100%", height: "100%", borderRadius: 32, borderCurve: "continuous", overflow: "hidden", borderWidth: 0.5, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: loading ? 0.5 : 1 }}
              >
                <View pointerEvents="none"><SFIcon name="plus" fallback={Plus} size={40} strokeWidth={2} color={colors.textMuted} weight="semibold" /></View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
        <AnimatedPressable
          onPress={handleCompleteProfile}
          disabled={loading || photos.length < 2 || isDraggingPhoto || mainPickMode}
          style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", opacity: loading || photos.length < 2 || isDraggingPhoto || mainPickMode ? 0.5 : 1, backgroundColor: colors.inverseSurface }}
        >
          {loading ? (
            <View className="py-[18px]"><ActivityIndicator color={colors.onInverseSurface} /></View>
          ) : (
            <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>{t('auth.step15.submitButton')}</Text>
          )}
        </AnimatedPressable>
      </View>
    </View>
  );
}
