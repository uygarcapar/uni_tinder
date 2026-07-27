import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Navigation,
  ChevronDown,
  X as XIcon,
  User,
  UserRound,
  Users,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import CityPickerModal from "@/features/discover/components/CityPickerModal";
import { useCities } from "@/shared/queries/commonQueries";
import { DEFAULT_AGE_RANGE, DISTANCE_RANGE_KM } from "@/shared/constants/limits";
import { colors } from "../../../shared/theme/colors";

const MIN_DISTANCE_KM = DISTANCE_RANGE_KM.min;
const MAX_DISTANCE_KM = DISTANCE_RANGE_KM.max;

// Backend (DiscoveryOptions.FreeMaxDistanceKm) free hesabı 50 km'ye clamp
// ediyor — UI'da da aynı sınırı uygula, kullanıcı 100 seçip 50 km içinden
// sonuç alıp şaşırmasın.
const FREE_MAX_DISTANCE_KM = 50;

// Backend Filters, hiç filtre kaydetmemiş kullanıcıda "sınırsız" sentinel'i
// (ör. 20000) dönebiliyor. Clamp'siz girerse gri dolgu dairesi pct>1 ile
// binlerce px'e büyüyüp tüm modalı kaplıyor — okurken tier'ın aralığına sabitle.
const clampKm = (raw: any, maxKm: number) => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return MIN_DISTANCE_KM;
  return Math.min(maxKm, Math.max(MIN_DISTANCE_KM, n));
};

// InterestedIn profil düzenlemeden buraya taşındı: artık kalıcı bir profil alanı
// değil, swipe filtresi. Backend InterestedInType int bekliyor (Men=0, Women=1,
// NonBinary=2); GET /api/swipe/Filters ise enumName string dönebiliyor, o yüzden
// okurken normalize ediyoruz. Free alan — premium gate'e takılmaz.
const INTERESTED_IN_ENUM: Record<string, number> = {
  Men: 0,
  Women: 1,
  NonBinary: 2,
};

const normalizeInterestedIn = (raw: any): number[] => {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  raw.forEach((v) => {
    const n =
      typeof v === "number"
        ? v
        : INTERESTED_IN_ENUM[typeof v === "object" ? v?.enumName : v];
    if (typeof n === "number" && !out.includes(n)) out.push(n);
  });
  return out;
};

// Radial slider — merkez nokta + concentric ring marks. Kullanıcı parmağıyla
// merkeze göre dışa doğru çekerek yarıçapı (= mesafeyi) ayarlıyor.
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

// RING_KM_STEP aralıklarla concentric gri yuvarlaklar (tier'dan bağımsız).
// SVG kullanılıyor çünkü RN'in `borderStyle:"dotted"` dot boyutunu/aralığını
// kontrol etmiyor; burada strokeLinecap:"round" + sıfıra yakın dash ile gerçek
// yuvarlak noktalar elde ediyoruz (dot çapı = strokeWidth).
const DOT_SIZE = 2.5;
const DOT_GAP = 6;

const RingMarks = React.memo(function RingMarks({
  userMaxKm,
}: {
  userMaxKm: number;
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
        return (
          <Circle
            key={km}
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={r}
            // Cap üstündeki halkalar (free'de 50+) soluk — erişilemeyen premium
            // aralığı görsel olarak ayırır.
            stroke={
              km > userMaxKm
                ? "rgba(255,255,255,0.18)"
                : "rgba(255,255,255,0.5)"
            }
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

function DistanceCircle({ value, onChange, userMaxKm }: any) {
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
            // Slider'ın üst sınırını aşmaya çalışıyor — cap'le ve shake tetikle.
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
          {/* Concentric ring marks (25, 50 ... 100 km) */}
          <RingMarks userMaxKm={userMaxKm} />

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
        {locked && (
          <SFIcon
            name="lock.fill"
            fallback={Lock}
            size={15}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
        )}
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
          <SFIcon
            name="info.circle"
            fallback={InfoIcon}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
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
  const { t } = useTranslation();

  const interestedInOptions = useMemo(() => [
    { label: t('discover.filters.interestedIn.men'), value: 0, sf: "person.fill" as SFSymbol, lucide: User },
    { label: t('discover.filters.interestedIn.women'), value: 1, sf: "person.fill" as SFSymbol, lucide: UserRound },
    { label: t('discover.filters.interestedIn.nonBinary'), value: 2, sf: "person.2.fill" as SFSymbol, lucide: Users },
  ], [t]);

  // Premium-only filtre alanlarını free kullanıcıda temizle. Backend bu
  // alanlardan HERHANGİ biri dolu gelirse isteğin TAMAMINI 403 + PREMIUM_FILTERS
  // ile reddediyor — premium'dan düşen kullanıcının kayıtlı şehri payload'da
  // kalırsa mesafe/cinsiyet güncellemesi bile kaydedilemiyordu.
  const sanitizeForTier = (f: any) => {
    if (isPremium || !f) return f;
    if (f.preferredCity == null) return f;
    return { ...f, preferredCity: null };
  };

  // Server'dan gelen filtreyi local state'e alırken interestedIn'i int listesine
  // normalize et — UI ve PUT payload'ı hep int üzerinden çalışsın.
  const toLocalState = (f: any) => {
    const s = sanitizeForTier(f);
    if (!s) return s;
    return {
      ...s,
      interestedIn: normalizeInterestedIn(s.interestedIn),
      // Clamp'lenmiş değer Apply payload'ına da gider — kullanıcı slider'a hiç
      // dokunmadan kaydetse bile backend'e 20000 geri yazılmaz; free'de premium
      // döneminden kalan 50+ değer de cap'e çekilir.
      maxDistance: clampKm(
        s.maxDistance,
        isPremium ? MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM,
      ),
    };
  };

  const [local, setLocal] = useState(() => toLocalState(filters));
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
    if (visible) setLocal(toLocalState(filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, filters, isPremium]);

  const toggleInterestedIn = (value: number) => {
    setLocal((prev: any) => {
      const current = prev?.interestedIn || [];
      return {
        ...prev,
        interestedIn: current.includes(value)
          ? current.filter((v: number) => v !== value)
          : [...current, value],
      };
    });
  };

  const onCityConfirm = (enumName: string) => {
    setCityPickerVisible(false);
    if (!enumName) return;
    setLocal((prev: any) => ({ ...prev, preferredCity: enumName }));
  };

  const clearCity = () => {
    setLocal((prev: any) => ({ ...prev, preferredCity: null }));
  };

  // Register (interestedInSchema) en az 1 seçim şart koşuyor; filtre ekranı da
  // aynı kuralı uyguluyor. Backend boş listeyi artık 7 (herkes) olarak yazıyor,
  // yani hesabı karartmıyor — ama "hiçbiri seçili değil" ile "hepsi seçili"
  // aynı sonucu veren belirsiz bir durum olurdu, o yüzden Apply kilitli kalıyor.
  const interestedInEmpty = (local?.interestedIn || []).length === 0;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('discover.filters.title')}
      actionLabel={t('discover.filters.apply')}
      onAction={() => {
        Keyboard.dismiss();
        // Yaş filtresi UI'dan kaldırıldı — backend'e her zaman tüm yaşları
        // kapsayan default'u gönder.
        onSave({
          ...sanitizeForTier(local),
          // Alanı hiç göndermemek "değiştirme", dolu dizi ise "bu değere ayarla"
          // demek. Boş dizi gönderilmiyor — interestedInEmpty guard'ı Apply'ı
          // kilitliyor (bkz. yukarıdaki not: flags 0 = hesap görünmez olur).
          interestedIn: local.interestedIn || [],
          ageRangeMin: DEFAULT_AGE_RANGE.min,
          ageRangeMax: DEFAULT_AGE_RANGE.max,
        });
      }}
      actionDisabled={interestedInEmpty}
      actionLoading={saving}
      snapPoints={["90%"]}
      // Varsayılan paddingBottom 40'a ek bir tık daha — uzun içerik alt kenarda
      // sıkışmasın, sonraki section'lar nefes alsın.
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {/* Maksimum Mesafe — tier'dan bağımsız, free'de de tam aralık açık. */}
      <FilterSection
        title={t('discover.filters.maxDistance.title')}
        description={t('discover.filters.maxDistance.desc')}
        marginTop={20}
      />
      <DistanceCircle
        value={clampKm(
          local.maxDistance,
          isPremium ? MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM,
        )}
        userMaxKm={isPremium ? MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM}
        onChange={(v: number) =>
          setLocal((p: any) => ({ ...p, maxDistance: v }))
        }
      />

      {/* İlgilendiğim cinsiyet — eskiden profil düzenlemedeydi, artık filtre.
          Free alan: premium gate yok. Cinsiyet tercihinin TEK kaynağı burası;
          eski "Cinsiyet" bölümü (genders/PreferredGendersFlags) kaldırıldı. */}
      <FilterSection
        title={t('discover.filters.interestedIn.title')}
        description={t('discover.filters.interestedIn.description')}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {interestedInOptions.map((opt) => {
          const selected = (local.interestedIn || []).includes(opt.value);
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => toggleInterestedIn(opt.value)}
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
              <SFIcon
                name={opt.sf}
                fallback={opt.lucide}
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
      {interestedInEmpty ? (
        <Text
          style={{
            color: colors.error,
            fontSize: 13,
            fontWeight: "500",
            marginTop: 10,
          }}
        >
          {t('discover.filters.interestedIn.required')}
        </Text>
      ) : null}

      {/* Şehir — premium-only. Free üyede locked görünüm + tıklama kapalı. */}
      <View
        style={{
          opacity: isPremium ? 1 : 0.4,
          pointerEvents: isPremium ? "auto" : "none",
        }}
      >
        <FilterSection
          title={t('discover.filters.city.title')}
          description={t('discover.filters.city.description')}
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
            <SFIcon
              name="location.fill"
              fallback={Navigation}
              size={18}
              color={colors.textSecondary}
              strokeWidth={1.5}
            />
            <Text
              style={{
                color: selectedCityName ? colors.text : colors.textSecondary,
                fontSize: 15,
                fontWeight: "500",
              }}
            >
              {selectedCityName || t('profile.edit.selectCity')}
            </Text>
          </View>
          {selectedCityName ? (
            <TouchableOpacity
              onPress={clearCity}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <SFIcon
                name="xmark"
                fallback={XIcon}
                size={18}
                color={colors.textSecondary}
                strokeWidth={2}
                weight="semibold"
              />
            </TouchableOpacity>
          ) : (
            <SFIcon
              name="chevron.down"
              fallback={ChevronDown}
              size={18}
              color={colors.textSecondary}
              strokeWidth={2}
              weight="semibold"
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Üniversite — backend endpoint'i (uni listesi) hazır olana kadar disabled.
          Premium ya da değil fark etmez; "Yakında" olarak göster. */}
      <FilterSection
        title={t('discover.filters.university.title')}
        description={t('discover.filters.university.description')}
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
        <SFIcon
          name="lock.fill"
          fallback={Lock}
          size={16}
          color={colors.textSecondary}
          strokeWidth={2}
          weight="semibold"
        />
        <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "500" }}>
          {t('discover.filters.university.comingSoon')}
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
