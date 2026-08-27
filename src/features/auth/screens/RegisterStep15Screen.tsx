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
  Linking,
} from "react-native";
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
  isBlockingPhoto,
  moderationReasonText,
  moderationReasonTitle,
  requiresUserAction,
  summarizeModeration,
  type PhotoModeration,
} from "@/features/profile/photoModeration";
import PhotoModerationBadge, {
  PhotoModerationScrim,
} from "@/features/profile/components/PhotoModerationBadge";
import { isPhotoProviderUnavailable } from "@/shared/constants/responseCodes";
import {
  setUserAndToken,
  clearRegistrationForm,
} from "@/features/auth/authSlice";
import * as Location from "expo-location";
import { Plus, X } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterStickyFooter from "@/features/auth/components/RegisterStickyFooter";
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
import { photoExists, pruneOrphanPhotos } from "@/shared/utils/photoStore";
import PhotoSourceSheet from "@/shared/components/PhotoSourceSheet";
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
 * Sunucunun foto foto verdiği kararları YEREL dosya yollarına bağlar.
 *
 * Kayıt akışında fotoğrafın `photoId`si yok (profil henüz oluşmadı), tek
 * hizalama anahtarı sıra. `order` 1 tabanlı geliyor (bkz. `PhotoOrders` /
 * `NewOrder` Range(1,6)); 0 gören bir yanıt 0 tabanlıdır.
 *
 * Hizalama BELİRSİZSE hiçbir şey işaretlenmiyor: yanlış fotoğrafın üstüne
 * "bu elendi" yazmak, hiç işaretlememekten kötü.
 */
const mapModerationToUris = (
  decisions: PhotoModeration[],
  uris: string[],
): Record<string, PhotoModeration> => {
  const mapped: Record<string, PhotoModeration> = {};
  if (decisions.length === 0) return mapped;

  const hasOrder = decisions.every((d) => typeof d.order === "number");
  // `order` yoksa geriye yalnız dizi sırası kalıyor; uzunluklar tutmuyorsa
  // hangi kararın hangi fotoğrafa ait olduğu bilinmiyor demektir.
  if (!hasOrder && decisions.length !== uris.length) return mapped;

  const zeroBased = decisions.some((d) => d.order === 0);
  decisions.forEach((decision, i) => {
    const raw =
      typeof decision.order === "number"
        ? zeroBased
          ? decision.order
          : decision.order - 1
        : i;
    const index = raw >= 0 && raw < uris.length ? raw : i;
    const uri = uris[index];
    if (uri) mapped[uri] = decision;
  });
  return mapped;
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

function SortablePhoto({ id, index, positions, maxIndex, children, onDragStart, onDragEnd, disabled = false, onTap }: any) {
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

  // Dokunma sürüklemeyle YARIŞIYOR: pan yalnız parmak hareket edince
  // etkinleşiyor, yerinde bırakılan dokunuş tap'e gidiyor. Ayrı bir
  // TouchableOpacity katmanı koymak yerine burada çözülüyor ki sürükleme
  // hissi bozulmasın (kart üstündeki overlay pan'ı yutuyordu).
  const tapGesture = Gesture.Tap()
    .enabled(!!onTap)
    .onEnd((_e, success) => {
      if (success) runOnJS(onTap)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute", top: 0, left: 0, width: ITEM_WIDTH, height: ITEM_HEIGHT,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: withSpring(isDragging.value ? 1.05 : 1, SPRING_CONFIG) }],
    zIndex: isDragging.value ? 100 : 0,
  }));

  return (
    <GestureDetector gesture={Gesture.Race(panGesture, tapGesture)}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

function PhotoCard({ photo, onRemove, isMain, pickMode, moderation }: any) {
  // Ana fotoğraf ilk sıradaki. Kural (tam 1 kişi) yalnızca buna uygulandığı
  // için hangisi olduğu görünür olmalı — rozet yerine sade bir çerçeveyle.
  const outlined = pickMode || isMain;
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View style={{ width: "100%", height: "100%", borderRadius: 32, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface, borderWidth: outlined ? 2 : 0, borderColor: pickMode ? colors.primary : colors.text }}>
        <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        {/* Moderasyon kararı geldiyse profil düzenlemedeki AYNI dil: yayında
            olmayan foto soluklaşıyor + sol altta durum rozeti. Karar yoksa
            (henüz gönderilmemiş / yeni eklenmiş foto) hiçbir şey çizilmiyor. */}
        {moderation ? (
          <>
            <PhotoModerationScrim
              isVisibleToOthers={moderation.isVisibleToOthers}
              borderRadius={32}
            />
            <PhotoModerationBadge
              status={moderation.status}
              isVisibleToOthers={moderation.isVisibleToOthers}
            />
          </>
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
  /**
   * Gönderim sonrası sunucudan dönen foto foto moderasyon kararları, yerel
   * dosya yoluna göre. Kayıtta `photoId` yok — anahtar bu yüzden URI.
   * Her denemede KOŞULSUZ yeniden yazılıyor: bir önceki denemenin kararı yeni
   * yanıtta geçerli olmayabilir, bayat rozet göstermek yanlış yönlendirir.
   */
  const [moderationByUri, setModerationByUri] = useState<
    Record<string, PhotoModeration>
  >({});
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  // Seçim + sıralı kırpma uzun sürebiliyor (iCloud indirmesi, 6 fotoğraf):
  // bu arada ikinci bir tur başlarsa kalan slot hesabı bayat kalır.
  const pickingRef = useRef(false);
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
   * Yarım kayıttan dönüşte ÖLÜ fotoğraf yollarını ayıkla + artıkları temizle.
   *
   * Kırpma çıktısı artık `Documents/profile-photos` altında (bkz. photoStore) —
   * OS orayı temizlemiyor, yani bu kontrol pratikte tetiklenmiyor. Yine de
   * duruyor: persist edilen tek şey YOL ve taşıma fail-soft (disk doluysa
   * geçici yol dönüyor), dolayısıyla hata sınıfı hâlâ mümkün.
   *
   * `pruneOrphanPhotos` ise ters yön: terk edilmiş kayıtlardan kalan dosyalar
   * Documents'ta asılı kalmasın (iOS orayı hiç geri almaz, iCloud yedeğine sayar).
   *
   * Yalnız MOUNT'ta: oturum içinde seçilen fotoğraflar zaten taze.
   */
  const prunedRef = useRef(false);
  useEffect(() => {
    if (prunedRef.current) return;
    prunedRef.current = true;
    const initial = photos;
    const alive = initial.filter(photoExists);
    pruneOrphanPhotos(alive);
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
   * generic hata alınıyordu. Son adımda (ve arka plandan dönüşte) bir kez daha
   * soruyoruz — geçersizse kullanıcıyı boş yere fotoğraf yüklettirmeden
   * doğrulamaya gönderiyoruz. Kayıt başarıyla bitince token null olur ve efekt
   * hiç çalışmaz (aksi halde uygulamaya girerken Step1'e atardı).
   *
   * DİKKAT — yalnız 'background' → 'active' geçişi sayılıyor, 'inactive' →
   * 'active' DEĞİL: bu ekran uygulamayı sürekli 'inactive'e düşürüyor (foto
   * seçici, kamera, izin diyaloğu, konum izni). Her dönüşte sorulduğunda tek
   * bir fotoğraf seçme turu 5 istek/dk'lık `auth` rate limit'ini tüketiyor,
   * sunucu 429 dönüyor ve kullanıcı GEÇERLİ token'la "süren doldu" diye
   * akıştan atılıyordu (bkz. registrationToken.isTransientStatus).
   */
  const appStateRef = useRef(AppState.currentState);
  const expiryHandledRef = useRef(false);
  useEffect(() => {
    if (!registrationEmail || !emailVerifiedToken) return;
    let cancelled = false;

    const verify = () => {
      checkRegistrationToken(registrationEmail, emailVerifiedToken).then((result) => {
        // 'unknown' (ağ hatası, rate limit, 5xx) akışı KESMEZ — gönderim zaten
        // kendi hatasını verir.
        if (cancelled || result !== 'invalid' || expiryHandledRef.current) return;
        expiryHandledRef.current = true;
        // Ölü token state'te KALMAMALI: kalırsa Step1'in "token zaten var"
        // kısayolu aynı token'la aynı duvara toslar. E-posta korunuyor —
        // kullanıcı aynı adresle devam ederse 12 adımlık cevabını kaybetmesin
        // (bkz. clearRegistrationForm keepEmail notu).
        dispatch(clearRegistrationForm({ keepEmail: true }));
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
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (next === 'active' && previous === 'background') verify();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [registrationEmail, emailVerifiedToken, navigation, dispatch, t]);

  const appendPhotos = (uris: string[]) => {
    if (uris.length === 0) return;
    setValue("photos", [...photos, ...uris], { shouldValidate: true });
  };

  // İzin reddedildi ve bir daha sorulamıyorsa tek çıkış Ayarlar.
  const alertCameraPermission = (canAskAgain: boolean) => {
    Alert.alert(
      t('profile.permissions.title'),
      t('profile.permissions.cameraMessage'),
      canAskAgain
        ? undefined
        : [
            { text: t('common.cancel'), style: "cancel" },
            { text: t('profile.permissions.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
          ],
    );
  };

  const addFromGallery = async (remainingSlots: number) => {
    // iCloud'dan indirme + sıralı kırpma uzun sürebiliyor; bu arada ekle
    // butonuna tekrar basılırsa slot hesabı bayat kalırdı.
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const newCroppedPhotos = await pickAndCropPhotos(remainingSlots);
      appendPhotos(newCroppedPhotos.map((p) => p.uri));
    } catch (error: any) {
      devLog("Galeri seçimi hatası:", error);
    } finally {
      pickingRef.current = false;
    }
  };

  const addFromCamera = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const taken = await captureAndCropPhoto();
      if (taken) appendPhotos([taken.uri]);
    } catch (error: any) {
      if (error?.code === "E_NO_CAMERA_PERMISSION") {
        alertCameraPermission(error?.canAskAgain !== false);
        return;
      }
      devLog("Kamera çekimi hatası:", error);
    } finally {
      pickingRef.current = false;
    }
  };

  // Kaynak seçimi — ProfileScreen ile ortak PhotoSourceSheet.
  const pickImage = () => {
    const remainingSlots = 6 - photos.length;
    if (remainingSlots <= 0) { Alert.alert(t('common.error'), t('auth.step15.maxPhotosError')); return; }
    setSourceSheetOpen(true);
  };

  const forgetDecisions = (removed: readonly string[]) => {
    setModerationByUri((prev) => {
      if (!removed.some((uri) => prev[uri])) return prev;
      const next = { ...prev };
      removed.forEach((uri) => delete next[uri]);
      return next;
    });
  };

  const removePhoto = (photoToRemove: string) => {
    setValue("photos", photos.filter((p) => p !== photoToRemove), { shouldValidate: true });
    forgetDecisions([photoToRemove]);
  };

  /** Elenen fotoğrafların hepsini birden kaldır — hata alert'indeki "Değiştir". */
  const removeRejectedPhotos = (decisions: Record<string, PhotoModeration>) => {
    const doomed = Object.keys(decisions).filter(
      (uri) => decisions[uri].status === "Rejected",
    );
    if (doomed.length === 0) return;
    setValue(
      "photos",
      photos.filter((p) => !doomed.includes(p)),
      { shouldValidate: true },
    );
    forgetDecisions(doomed);
  };

  /**
   * Yayında OLMAYAN bir fotoğraf ilk sıraya (ana fotoğrafa) alınamaz: profil
   * kartı boş görünürdü ve bir sonraki gönderim aynı duvara toslardı. Profil
   * düzenlemedeki sıralama kapısının kayıttaki karşılığı.
   */
  const blockedAsMain = (photo: string) => {
    const decision = moderationByUri[photo];
    return !!decision && !decision.isVisibleToOthers;
  };

  // Ana fotoğraf = ilk sıradaki (MainPhotoIndex hep 0 gönderiliyor), yani
  // "ana yap" işlemi listeyi yeniden sıralamaktan ibaret.
  const promoteToMain = (photo: string) => {
    if (blockedAsMain(photo)) {
      // Seçim modu AÇIK kalıyor: kullanıcı hemen başka bir fotoğrafa dokunabilsin.
      Alert.alert(
        t('profile.photoModeration.setMainBlockedTitle'),
        t('profile.photoModeration.setMainBlockedMessage'),
      );
      return;
    }
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
    if (!isChanged) return;
    if (blockedAsMain(newOrder[0])) {
      Alert.alert(
        t('profile.photoModeration.reorderMainBlockedTitle'),
        t('profile.photoModeration.reorderMainBlockedMessage'),
      );
      // `photos` değişmediği için pozisyonları yazan efekt tetiklenmez —
      // kartları eski sıralarına elle geri yayıyoruz.
      const reverted: Record<string, number> = {};
      photos.forEach((p, i) => { reverted[p] = i; });
      positions.value = reverted;
      return;
    }
    setValue("photos", newOrder);
  };

  /**
   * Karara bağlanmış bir fotoğrafa dokunma: sebebi göster, gerekiyorsa
   * değiştirme yolunu aç. İtiraz YOK — hesap henüz oluşmadığı için itiraz ucu
   * çağrılamaz; kullanıcı uygulamaya girdikten sonra profil ekranından itiraz
   * edebilir.
   */
  const showModerationDetail = (photo: string) => {
    const decision = moderationByUri[photo];
    if (!decision) return;
    const { status, reasonCode, reasonText } = decision;
    Alert.alert(
      moderationReasonTitle(status, reasonCode),
      moderationReasonText(status, reasonCode, reasonText),
      requiresUserAction(status)
        ? [
            {
              text: t('profile.photoModeration.replace'),
              style: "destructive",
              onPress: () => removePhoto(photo),
            },
            { text: t('common.cancel'), style: "cancel" },
          ]
        : [{ text: t('common.ok') }],
    );
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
        // Fotoğraflar sunucuda; yerel kopyaların tamamı artık ölü ağırlık.
        // Documents dizinini OS temizlemediği için bunu KENDİMİZ yapmalıyız.
        pruneOrphanPhotos([]);
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

      // Sunucu foto foto karar döndüyse kararları kartlara bağla: kullanıcı
      // HANGİ fotoğrafın elendiğini rozet + karartmadan görsün, tek cümlelik
      // alert'ten tahmin etmeye çalışmasın (profil düzenlemedeki davranış).
      const decided = mapModerationToUris(submitError.photos ?? [], photos);
      setModerationByUri(decided);

      // Akışı durduran kararı SUNUCU işaretliyor (`severity: 'Blocking'`) —
      // istemcide kod listesi yok.
      const fatal = submitError.photos?.find(isBlockingPhoto);
      const reasonCode = submitError.reasonCode;
      const title = reasonCode
        ? moderationReasonTitle(fatal?.status ?? 'Rejected', reasonCode)
        : t('common.error');

      // Moderasyon sağlayıcısı erişilemez (UT-6306): fotoğraflarda bir sorun
      // yok, kontrol yapılamadı. Kullanıcıya silecek/değiştirecek bir şey
      // göstermek yanlış olur — tek doğru aksiyon tekrar denemek.
      if (isPhotoProviderUnavailable(submitError.code)) {
        Alert.alert(t('common.error'), submitError.message, [
          { text: t('auth.step15.tryAgain'), onPress: () => handleCompleteProfile() },
          { text: t('common.cancel'), style: "cancel" },
        ]);
        return;
      }

      // Ana fotoğraf hatasında fotoğrafı SİLMEK gerekmiyor — başka birini ana
      // yapmak yetiyor. Doğrudan o aksiyonu sunuyoruz.
      if (fatal && photos.length > 1) {
        Alert.alert(title, submitError.message, [
          {
            text: t('profile.photoModeration.chooseAnotherMain'),
            onPress: () => setMainPickMode(true),
          },
          { text: t('common.cancel'), style: "cancel" },
        ]);
        return;
      }

      const decisions = Object.values(decided);
      const rejected = decisions.filter((d) => d.status === 'Rejected');
      const awaiting = decisions.filter(
        (d) => d.status === 'Review' || d.status === 'Pending',
      );

      // Elenen fotoğraf var → kullanıcının işi belli: değiştirmek.
      if (rejected.length > 0) {
        Alert.alert(title, submitError.message, [
          {
            text: t('profile.photoModeration.replace'),
            style: "destructive",
            onPress: () => removeRejectedPhotos(decided),
          },
          { text: t('common.cancel'), style: "cancel" },
        ]);
        return;
      }

      // Hiçbiri reddedilmemiş, hepsi inceleniyor: yapılacak bir şey YOK —
      // yeni fotoğraf yüklemek de aynı kuyruğa girer. Sunucunun tek fotoğraf
      // için yazdığı "inceliyoruz" cümlesi kaydın neden ilerlemediğini
      // anlatmıyor; kayda özel metni gösteriyoruz.
      if (awaiting.length > 0) {
        Alert.alert(
          t('auth.step15.photosUnderReviewTitle'),
          t('auth.step15.photosUnderReviewMessage', { count: awaiting.length }),
          [
            { text: t('auth.step15.tryAgain'), onPress: () => handleCompleteProfile() },
            { text: t('common.ok'), style: "cancel" },
          ],
        );
        return;
      }

      Alert.alert(title, submitError.message);
    }
  });

  // Karara bağlanmış ama yayınlanamayan foto var mı — başlık altındaki ipucu
  // yalnız o zaman görünüyor.
  const hasHiddenDecision = photos.some((p) => {
    const decision = moderationByUri[p];
    return !!decision && !decision.isVisibleToOthers;
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
            {mainPickMode
              ? t('auth.step15.pickMainHint')
              : hasHiddenDecision
                ? t('auth.step15.moderationHint')
                : t('auth.step15.description')}
          </Text>
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
              onTap={
                loading
                  ? undefined
                  : mainPickMode
                    ? // Seçim modu: dokunulan foto ilk sıraya (ana fotoğrafa) taşınır.
                      () => promoteToMain(photo)
                    : moderationByUri[photo]
                      ? () => showModerationDetail(photo)
                      : undefined
              }
            >
              <PhotoCard
                photo={photo}
                onRemove={loading || mainPickMode ? undefined : () => removePhoto(photo)}
                isMain={index === 0}
                pickMode={mainPickMode}
                moderation={moderationByUri[photo]}
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
      <RegisterStickyFooter>
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
      </RegisterStickyFooter>

      <PhotoSourceSheet
        visible={sourceSheetOpen}
        onClose={() => setSourceSheetOpen(false)}
        onCamera={addFromCamera}
        onGallery={() => addFromGallery(6 - photos.length)}
      />
    </View>
  );
}
