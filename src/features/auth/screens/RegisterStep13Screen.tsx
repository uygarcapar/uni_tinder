import { useState, useEffect, useCallback, memo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  InteractionManager,
} from "react-native";
// Skeleton nabzı RN Animated ile sürülüyor (yukarıdaki `Animated`); scroll
// header'ı reanimated worklet'i istiyor — ikisi aynı dosyada, isim çakışmasın.
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { useHobbies } from "@/shared/queries/commonQueries";
import { useTranslation } from 'react-i18next';
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterStickyFooter from "@/features/auth/components/RegisterStickyFooter";
import RegisterStickyHeader, {
  REGISTER_HEADER_HEIGHT,
} from "@/features/auth/components/RegisterStickyHeader";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import PillFlow from "@/shared/components/PillFlow";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { hobbiesSchema, HobbiesForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import HobbyIcon from "@/shared/components/HobbyIcon";

// Pil ölçüleri, tipografisi ve renkleri EditProfileForm'daki HobbyPill ile
// ORTAK: aynı hobi listesi iki ekranda da aynı görünsün (radius 999 / 12-9
// padding / 20px ikon / gap 6 / 13-500 yazı / seçilmemişte zeminsiz).
// HobbyIcon emoji çiziyor ve emojinin satır kutusu fontSize'ın ~1.25 katı →
// 20px ikon 25px'lik kutu üretiyor, pil yüksekliği 18 + 25.
const PILL_HEIGHT = 43;
const SKELETON_PILL_WIDTHS = [96, 128, 84, 112, 140, 92, 120, 104];
// İlk karede çizilen kategori sayısı — bir ekran dolusundan biraz fazlası.
// Gerisi InteractionManager ile geçişten sonra mount ediliyor (bkz. kullanım).
const FIRST_PAINT_CATEGORIES = 2;

const SkeletonHobbyPill = memo(({ width: w }: { width: number }) => {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ width: w, height: PILL_HEIGHT, borderRadius: 999, borderCurve: "continuous", borderWidth: 0.5, borderColor: colors.hairline, backgroundColor: colors.shimmer, opacity: pulse }} />
  );
});

const HobbyItem = memo(({ hobby, isSelected, onPress }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scaleValue, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
  const handlePressOut = () => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 20 }).start();
  return (
    <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onPress(hobby.enumName)}
        style={{
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderWidth: 0.5,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderColor: isSelected ? colors.inverseSurfaceSoft : colors.hairline,
          backgroundColor: isSelected ? colors.inverseSurfaceSoft : "transparent",
        }}
      >
        <HobbyIcon hobby={hobby.enumName ?? hobby.name} size={20} color={isSelected ? colors.onInverseSurface : colors.textSecondary} strokeWidth={1.5} />
        {/* Pil içeriğe göre genişlediği için kırpma yok — isim tam görünüyor. */}
        {/* Pil yazı boyutu 14: Step16'daki burç/dini görüş pilleriyle ORTAK. */}
        <Text style={{ color: isSelected ? colors.onInverseSurface : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>
          {hobby.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function RegisterStep13Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep13'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  // Katalog `useHobbies` ile çekiliyor (react-query staleTime: Infinity +
  // staticGet'in oturum-boyu endpoint cache'i). Eskiden burada ham `fetch` +
  // local state vardı: ekranın her mount'u yeni bir istek atıyor ve iskeleti
  // sıfırdan gösteriyordu — kullanıcı geri gidip tekrar girdiğinde (native
  // stack pop ettiği için ekran unmount olur) liste hazırken bile iskelet
  // çıkıyordu. Şimdi ikinci girişte veri cache'ten geliyor, iskelet yok.
  const { data: hobbyCategories = [], isPending, isError } = useHobbies();
  const loadingHobbies = isPending;

  // Header listenin ÜSTÜNDE (absolute) duruyor, içerik altından geçiyor.
  // Yükseklik ölçülmüyor: REGISTER_HEADER_HEIGHT hem header kabının hem
  // içeriğin paddingTop'unun tek kaynağı (bkz. RegisterStickyHeader).
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const { handleSubmit, setValue, watch } = useForm<HobbiesForm>({
    resolver: zodResolver(hobbiesSchema),
    defaultValues: { hobbies: profile.hobbies || [] },
  });

  const hobbies = watch("hobbies");

  // Hata bildirimi eski davranışla aynı (tek uyarı) — react-query retry'ları
  // bitip sorgu gerçekten hata verdiğinde çıkıyor.
  useEffect(() => {
    if (isError) alert(t('auth.step13.loadError'));
  }, [isError, t]);

  // İLK COMMIT HAFİF OLMALI: native stack push'u yeni ekranın ilk render'ı
  // commit olana kadar bekliyor. Katalog cache'ten hazır geldiği için tüm
  // kategoriler (yüzlerce pil + her birinin PillFlow ölçüm turu) tek karede
  // çizilmeye çalışıyordu ve "Devam"a basınca geçiş gecikiyordu. İlk ekran
  // dolusu kadar kategori anında çiziliyor, kalanı etkileşim bitince —
  // ertelenen kategoriler ekranın altında kaldığı için gözle görünmüyor.
  const [showAllCategories, setShowAllCategories] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() =>
      setShowAllCategories(true),
    );
    return () => handle.cancel();
  }, []);

  // Seçim anında store'a da yazılıyor: kullanıcı "Devam"a basmadan geri döner
  // ve ekrana tekrar girerse (screen unmount olur) seçimleri kaybolmasın.
  const toggleHobby = useCallback((enumName: string) => {
    if (!enumName) return;
    const current = hobbies;
    const next = current.includes(enumName)
      ? current.filter((h) => h !== enumName)
      : current.length < 10 ? [...current, enumName] : current;
    if (next === current) return;
    setValue("hobbies", next, { shouldValidate: false });
    dispatch(updateMultipleFields({ hobbies: next }));
  }, [hobbies, setValue, dispatch]);

  const handleNext = handleSubmit(({ hobbies: h }) => {
    dispatch(updateMultipleFields({ hobbies: h }));
    navigation.navigate("RegisterStep17");
  });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <Reanimated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}
        contentContainerStyle={{ paddingTop: REGISTER_HEADER_HEIGHT }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!loadingHobbies}
      >
        <View className="flex flex-col gap-2 mb-3">
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {t('auth.step13.description')}
          </Text>
        </View>

        {loadingHobbies
          ? Array.from({ length: showAllCategories ? 5 : FIRST_PAINT_CATEGORIES }).map((_, catIdx) => (
              <View key={catIdx} className="mb-10">
                {/* Başlık için iskelet çubuğu YOK: tek iskelet dili pil olsun
                    (yükleme turu ile ölçüm turu aynı görünüyor, sadece pil).
                    Yerine görünmez boşluk — gerçek başlık gelince (17px yazı +
                    py-3 + mb-10) piller aşağı zıplamasın. */}
                <View style={{ height: 46, marginBottom: 40 }} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 8 }}>
                  {SKELETON_PILL_WIDTHS.map((w, i) => <SkeletonHobbyPill key={i} width={w} />)}
                </View>
              </View>
            ))
          : ((showAllCategories
              ? hobbyCategories
              : hobbyCategories.slice(0, FIRST_PAINT_CATEGORIES)) as any[]
            ).map((category, categoryIndex) => (
              <View key={categoryIndex} className="mb-10">
                {/* Kategori başlığı `text` ile çiziliyor, neutral200 ile değil:
                    açık modda o token gri (#374151) kalıyordu, başlıklar kart
                    yazılarından sönük görünüyordu. `text` her iki modda da tam
                    kontrast (açıkta siyah, koyuda beyaz). */}
                <Text className="text-[17px] text-center font-bold py-3 mb-10" style={{ color: colors.text }}>{category.category}</Text>
                {/* EditProfileForm'daki hobi ızgarasının aynısı: first-fit
                    paketleme + fillWidth, satır sonlarında boşluk kalmasın. */}
                <PillFlow
                  gap={8}
                  fillWidth
                  // Kayıt akışında bu etiketler ilk kez ölçülüyor (önbellek
                  // soğuk) — ölçüm turu görünürse piller bir kare sonra yer
                  // değiştiriyor.
                  hideUntilPacked
                  // Ölçüm turu görünmez olduğu için pil alanı o sürede boş
                  // kalıyordu (başlık var, piller yok). İskelet pil sayısı
                  // kategorinin gerçek pil sayısı — yükseklik yaklaşık tutsun.
                  placeholder={
                    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 8 }}>
                      {(category.hobbies as any[]).map((_, i) => (
                        <SkeletonHobbyPill key={i} width={SKELETON_PILL_WIDTHS[i % SKELETON_PILL_WIDTHS.length]} />
                      ))}
                    </View>
                  }
                  items={category.hobbies.map((hobby: any) => ({
                    id: `hobby:${hobby.enumName ?? hobby.name}`,
                    element: (
                      <HobbyItem
                        hobby={hobby}
                        isSelected={hobbies.includes(hobby.enumName)}
                        onPress={toggleHobby}
                      />
                    ),
                  }))}
                />
              </View>
            ))}

        <View className="h-20" />
      </Reanimated.ScrollView>

      {/* Başlık listenin üstünde: zemini yok, blur + veil taşıyor. ScrollView'dan
          SONRA render ediliyor (zIndex'e ek olarak doğal sıra da üstte tutsun). */}
      <RegisterStickyHeader scrollY={scrollY}>
        {/* box-none: başlık şeridinde başlayan sürüklemeler altındaki listeye
            geçsin, yalnız geri butonu dokunuşu tutsun. */}
        <View pointerEvents="box-none" className="pt-16 pb-6 px-6">
          {/* Satır yüksekliği SABİT 44 — REGISTER_HEADER_HEIGHT'ın varsaydığı
              ölçü. Geri butonu absolute olduğu için satır kendi başına yalnız
              başlık metni kadar (~31px) yer kaplardı. */}
          <View pointerEvents="box-none" style={{ height: 44 }} className="flex-row items-center justify-center relative">
            <View className="absolute left-0">
              <RegisterBackButton onPress={() => navigation.goBack()} />
            </View>
            <Text className="text-[26px] font-bold tracking-wider" style={{ color: colors.text }}>
              {t('auth.step13.titleWithCount', { count: hobbies.length })}
            </Text>
          </View>
        </View>

        <RegisterProgressBar step={13} />
      </RegisterStickyHeader>

      {/* Sticky Button */}
      <RegisterStickyFooter>
        <AnimatedPressable
          onPress={handleNext}
          style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.inverseSurface }}
        >
          <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
            {t('common.continueButton')}
          </Text>
        </AnimatedPressable>
      </RegisterStickyFooter>
    </View>
  );
}
