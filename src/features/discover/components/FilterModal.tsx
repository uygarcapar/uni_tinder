import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Keyboard,
  Animated as RNAnimated,
  Easing as RNEasing,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  withTiming,
  withSequence,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import {
  Lock,
  InfoIcon,
  Mars,
  Venus,
  Transgender,
  VenusAndMars,
  Navigation,
  ChevronDown,
  X as XIcon,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import AppModal from "@/shared/components/AppModal";
import CityPickerModal from "@/features/discover/components/CityPickerModal";
import { useCities } from "@/shared/queries/commonQueries";
import { colors } from "../../../shared/theme/colors";

const GENDER_OPTIONS = [
  { label: "Erkek", value: "Male", icon: Mars },
  { label: "Kadın", value: "Female", icon: Venus },
  { label: "Non-Binary", value: "NonBinary", icon: Transgender },
  { label: "Diğer", value: "Other", icon: VenusAndMars },
];

// Backend (DiscoveryOptions.FreeMaxDistanceKm) bunu zaten 50'ye clamp ediyor — UI'da da
// aynı sınırı görünür hâle getir, kullanıcı 100 yazıp 50 sonuç alıp şaşırmasın.
const FREE_MAX_DISTANCE_KM = 50;
const MIN_DISTANCE_KM = 5;
const MAX_DISTANCE_KM = 100;

// Radial slider — merkez nokta + concentric ring marks. Kullanıcı parmağıyla
// merkeze göre dışa doğru çekerek yarıçapı (= mesafeyi) ayarlıyor.
// Free zone: merkez → 50 km, Premium zone: 50 → 100 km (dashed, kilitli).
const CIRCLE_SIZE = 280;
const CIRCLE_CENTER = CIRCLE_SIZE / 2;
const MIN_RADIUS = 30;
const MAX_RADIUS = 128;
const RING_KM_STEP = 25;

const kmToRadius = (km: number) => {
  const visualRange = MAX_DISTANCE_KM - MIN_DISTANCE_KM;
  const pct = (km - MIN_DISTANCE_KM) / visualRange;
  return MIN_RADIUS + pct * (MAX_RADIUS - MIN_RADIUS);
};

// 10/20/30...100 km'de concentric gri yuvarlaklar. Free üyede 50 km üstündeki
// halkalar daha solgun renkte → premium zone'u görsel olarak ayırır.
// SVG kullanılıyor çünkü RN'in `borderStyle:"dotted"` dot boyutunu/aralığını
// kontrol etmiyor; burada strokeLinecap:"round" + sıfıra yakın dash ile gerçek
// yuvarlak noktalar elde ediyoruz (dot çapı = strokeWidth).
const DOT_SIZE = 2.5;
const DOT_GAP = 6;

const RingMarks = React.memo(function RingMarks({
  isPremium,
}: {
  isPremium: boolean;
}) {
  const rings: number[] = [];
  for (let km = RING_KM_STEP; km <= MAX_DISTANCE_KM; km += RING_KM_STEP) {
    rings.push(km);
  }

  return (
    <Svg
      pointerEvents="none"
      width={CIRCLE_SIZE}
      height={CIRCLE_SIZE}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {rings.map((km) => {
        const r = kmToRadius(km);
        const isPremiumRing = km > FREE_MAX_DISTANCE_KM;
        const color =
          isPremiumRing && !isPremium
            ? "rgba(255,255,255,0.15)"
            : "rgba(255,255,255,0.5)";
        return (
          <Circle
            key={km}
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={r}
            stroke={color}
            strokeWidth={DOT_SIZE}
            fill="none"
            strokeDasharray={`0.1 ${DOT_GAP}`}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
});

function DistanceCircle({ value, onChange, isPremium }: any) {
  const userMaxKm = isPremium ? MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM;
  const visualRange = MAX_DISTANCE_KM - MIN_DISTANCE_KM;

  const valueSV = useSharedValue(value || MIN_DISTANCE_KM);
  const shakeSV = useSharedValue(0);
  const [displayValue, setDisplayValue] = useState(value || MIN_DISTANCE_KM);
  const lastTickRef = useRef(value || MIN_DISTANCE_KM);
  const shakeFiredRef = useRef(false);

  const valueScale = useRef(new RNAnimated.Value(1)).current;
  const shrinkTimerRef = useRef<any>(null);
  const isScaledUpRef = useRef(false);

  useEffect(() => {
    const v = value || MIN_DISTANCE_KM;
    valueSV.value = v;
    setDisplayValue(v);
    lastTickRef.current = v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const triggerScaleUp = () => {
    Haptics.selectionAsync().catch(() => {});
    if (!isScaledUpRef.current) {
      isScaledUpRef.current = true;
      RNAnimated.timing(valueScale, {
        toValue: 1.15,
        duration: 120,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }).start();
    }
  };

  const startShrink = () => {
    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    shrinkTimerRef.current = setTimeout(() => {
      isScaledUpRef.current = false;
      RNAnimated.timing(valueScale, {
        toValue: 1,
        duration: 380,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }).start();
    }, 250);
  };

  const triggerShake = () => {
    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
    shakeSV.value = withSequence(
      withTiming(-7, { duration: 45 }),
      withTiming(7, { duration: 45 }),
      withTiming(-5, { duration: 45 }),
      withTiming(5, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
  };

  const onTickChange = (v: number) => {
    if (v !== lastTickRef.current) {
      lastTickRef.current = v;
      setDisplayValue(v);
      triggerScaleUp();
    }
  };

  const commitChange = (v: number) => {
    onChange(v);
    startShrink();
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onUpdate((e) => {
          const dx = e.x - CIRCLE_CENTER;
          const dy = e.y - CIRCLE_CENTER;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const clampedDist = Math.max(
            MIN_RADIUS,
            Math.min(MAX_RADIUS, dist),
          );
          const rawKm = Math.round(
            MIN_DISTANCE_KM +
              ((clampedDist - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)) *
                visualRange,
          );

          if (rawKm > userMaxKm) {
            // Premium zone'a girmeye çalışıyor — cap'le ve shake tetikle.
            if (valueSV.value !== userMaxKm) {
              valueSV.value = userMaxKm;
              runOnJS(onTickChange)(userMaxKm);
            }
            runOnJS(handleOverLimit)();
          } else {
            runOnJS(resetOverLimitFlag)();
            if (rawKm !== valueSV.value) {
              valueSV.value = rawKm;
              runOnJS(onTickChange)(rawKm);
            }
          }
        })
        .onEnd(() => {
          runOnJS(commitChange)(valueSV.value);
        })
        .onFinalize(() => {
          runOnJS(startShrink)();
          runOnJS(resetOverLimitFlag)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userMaxKm, visualRange],
  );

  function handleOverLimit() {
    if (!shakeFiredRef.current) {
      shakeFiredRef.current = true;
      triggerShake();
    }
  }

  function resetOverLimitFlag() {
    shakeFiredRef.current = false;
  }

  const innerCircleStyle = useAnimatedStyle(() => {
    const pct = (valueSV.value - MIN_DISTANCE_KM) / visualRange;
    const r = MIN_RADIUS + pct * (MAX_RADIUS - MIN_RADIUS);
    return {
      width: r * 2,
      height: r * 2,
      borderRadius: r,
      left: CIRCLE_CENTER - r,
      top: CIRCLE_CENTER - r,
      transform: [{ translateX: shakeSV.value }],
    };
  });

  return (
    <View style={{ alignItems: "center", marginTop: -4, marginBottom: -4 }}>
      <GestureDetector gesture={gesture}>
        <View
          style={{
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            position: "relative",
          }}
        >
          {/* Concentric ring marks (10, 20 ... 100 km) */}
          <RingMarks isPremium={!!isPremium} />

          {/* Aktif (dolu) yarıçap */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                backgroundColor: "rgba(255,255,255,0.3)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.4)",
                borderCurve: "continuous",
              },
              innerCircleStyle,
            ]}
          />

          {/* Merkez değer */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RNAnimated.Text
              style={{
                color: colors.text,
                fontSize: 26,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
                transform: [{ scale: valueScale }],
              }}
            >
              {displayValue} km
            </RNAnimated.Text>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

// EditModal section header patterni: büyük beyaz başlık + InfoIcon + gri açıklama.
function FilterSection({
  title,
  description,
  marginTop = 28,
  locked = false,
}: any) {
  return (
    <View
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        marginTop,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: description ? 9 : 0,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
          {title}
        </Text>
        {locked && <Lock size={15} color={colors.textSecondary} />}
      </View>
      {description ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingRight: 16,
            marginBottom: 12,
          }}
        >
          <InfoIcon size={16} color={colors.textSecondary} />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {description}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function FilterModal({
  visible,
  onClose,
  filters,
  isPremium,
  onSave,
  saving,
}: any) {
  // Free user için maxDistance'ı initial state'te de clamp et — backend zaten yapıyor
  // ama UI bunu yansıtmazsa kullanıcı "100 km" görür, sonuç 50 km içinden gelir → şaşırır.
  const clampFiltersForFree = (f: any) => {
    if (isPremium || !f) return f;
    const d = parseInt(f.maxDistance);
    if (!isNaN(d) && d > FREE_MAX_DISTANCE_KM) {
      return { ...f, maxDistance: FREE_MAX_DISTANCE_KM };
    }
    return f;
  };

  const [local, setLocal] = useState(() => clampFiltersForFree(filters));
  const [cityPickerVisible, setCityPickerVisible] = useState(false);

  const citiesQuery = useCities();
  const cityOptions = citiesQuery.data ?? [];

  // preferredCity enumName olarak saklanır; UI'da Türkçe ismi göstermek için
  // cityOptions üzerinden lookup yap.
  const selectedCityName = useMemo(() => {
    if (!local?.preferredCity) return null;
    return (
      cityOptions.find((c) => c.enumName === local.preferredCity)?.name ?? null
    );
  }, [local?.preferredCity, cityOptions]);

  // Modal her açıldığında local state'i server state'inden (filters) sıfırla.
  // Apply'a basmadan kapatıp tekrar açan kullanıcı stale değer görmesin.
  useEffect(() => {
    if (visible) setLocal(clampFiltersForFree(filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, filters, isPremium]);

  const toggleGender = (value: string) => {
    const current = local.genders || [];
    setLocal((prev: any) => ({
      ...prev,
      genders: current.includes(value)
        ? current.filter((g: string) => g !== value)
        : [...current, value],
    }));
  };

  const onCityConfirm = (enumName: string) => {
    setCityPickerVisible(false);
    if (!enumName) return;
    setLocal((prev: any) => ({ ...prev, preferredCity: enumName }));
  };

  const clearCity = () => {
    setLocal((prev: any) => ({ ...prev, preferredCity: null }));
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Filtreler"
      actionLabel="Uygula"
      onAction={() => {
        Keyboard.dismiss();
        // Yaş filtresi UI'dan kaldırıldı — backend'e her zaman tüm yaşları
        // kapsayan default (18-65) gönder.
        onSave({ ...local, ageRangeMin: 18, ageRangeMax: 65 });
      }}
      actionLoading={saving}
      snapPoints={["90%"]}
      // Varsayılan paddingBottom 40'a ek bir tık daha — uzun içerik alt kenarda
      // sıkışmasın, sonraki section'lar nefes alsın.
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {/* Maksimum Mesafe */}
      <FilterSection
        title="Maksimum Mesafe"
        description={
          isPremium
            ? "Eşleşmek istediğin kullanıcıların maksimum uzaklığını belirle. Daireyi parmağınla sürükleyerek ayarlayabilirsin."
            : `Eşleşmek istediğin kullanıcıların maksimum uzaklığını belirle. Ücretsiz üyelikte bu mesafe ${FREE_MAX_DISTANCE_KM} km ile sınırlıdır; daha geniş bir aralık için Premium üyelik gerekir.`
        }
        marginTop={20}
      />
      <DistanceCircle
        value={parseInt(local.maxDistance) || MIN_DISTANCE_KM}
        isPremium={isPremium}
        onChange={(v: number) =>
          setLocal((p: any) => ({ ...p, maxDistance: v }))
        }
      />

      {/* Cinsiyet */}
      <FilterSection
        title="Cinsiyet"
        description="Hangi cinsiyetteki kullanıcıları görmek istediğini seç."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {GENDER_OPTIONS.map((opt) => {
          const selected = (local.genders || []).includes(opt.value);
          const Icon = opt.icon;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => toggleGender(opt.value)}
              activeOpacity={1}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                paddingHorizontal: 12,
                paddingVertical: 11,
                borderWidth: 0.5,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: selected ? colors.text : "transparent",
                borderColor: selected ? colors.text : "rgba(255,255,255,0.1)",
              }}
            >
              <Icon
                size={20}
                color={selected ? "#000" : colors.textSecondary}
                strokeWidth={1.5}
              />
              <Text
                style={{
                  color: selected ? "#000" : colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "500",
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Şehir — premium-only. Free üyede locked görünüm + tıklama kapalı. */}
      <View
        style={{
          opacity: isPremium ? 1 : 0.4,
          pointerEvents: isPremium ? "auto" : "none",
        }}
      >
        <FilterSection
          title="Şehir"
          description="Belirli bir şehirden kullanıcıları gör."
          locked={!isPremium}
        />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setCityPickerVisible(true)}
          disabled={cityOptions.length === 0}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.1)",
            paddingHorizontal: 16,
            paddingVertical: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: cityOptions.length === 0 ? 0.6 : 1,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flex: 1,
            }}
          >
            <Navigation size={18} color={colors.textSecondary} strokeWidth={1.5} />
            <Text
              style={{
                color: selectedCityName ? colors.text : colors.textSecondary,
                fontSize: 15,
                fontWeight: "500",
              }}
            >
              {selectedCityName || "Şehir Seç"}
            </Text>
          </View>
          {selectedCityName ? (
            <TouchableOpacity
              onPress={clearCity}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <XIcon size={18} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          ) : (
            <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      {/* Üniversite — backend endpoint'i (uni listesi) hazır olana kadar disabled.
          Premium ya da değil fark etmez; "Yakında" olarak göster. */}
      <FilterSection
        title="Üniversite"
        description="Yakında: belirli bir üniversiteden kullanıcıları görebileceksin."
      />
      <View
        style={{
          opacity: 0.4,
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.1)",
          paddingHorizontal: 16,
          paddingVertical: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
        pointerEvents="none"
      >
        <Lock size={16} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "500" }}>
          Yakında
        </Text>
      </View>

      {/* City picker — AppModal-based, stackBehavior:"push" → FilterModal
          geride kalır, üstüne biner. */}
      <CityPickerModal
        visible={cityPickerVisible}
        onClose={() => setCityPickerVisible(false)}
        items={cityOptions}
        initialValue={local?.preferredCity ?? ""}
        onConfirm={onCityConfirm}
      />
    </AppModal>
  );
}
