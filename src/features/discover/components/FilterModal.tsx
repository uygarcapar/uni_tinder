import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
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
  GraduationCap,
  InfoIcon,
  Navigation,
  ChevronDown,
  X as XIcon,
  User,
  UserRound,
  Users,
  Eye,
  EyeOff,
  Dumbbell,
  Utensils,
  Palette,
  Music,
  Trees,
  BookOpen,
  Gamepad2,
  Plane,
  Sparkles,
  Dog,
  Briefcase,
  Heart,
  Lightbulb,
  Theater,
  Film,
  PartyPopper,
  Code,
  type LucideIcon,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import HobbyIcon from "@/shared/components/HobbyIcon";
import AppModal from "@/shared/components/AppModal";
import CityPickerModal from "@/features/discover/components/CityPickerModal";
import UniversityPickerModal from "@/features/discover/components/UniversityPickerModal";
import {
  useCities,
  useUniversities,
  useHobbies,
  useRelationshipIntents,
  useZodiacs,
  useSmokingStatuses,
  useUsagePurposes,
  normalizeDomain,
  resolveLocalized,
} from "@/shared/queries/commonQueries";
import { getRelationshipIntentIcon } from "@/shared/constants/relationshipIntent";
import {
  getZodiacIcon,
  getSmokingIcon,
  getUsagePurposeIcon,
  getHasPetsIcon,
  getYearOfStudyIcon,
} from "@/shared/constants/filterEnumIcons";
import { showInfoToast } from "@/shared/services/toaster";
import uiBus from "@/shared/services/uiBus";
import {
  DEFAULT_AGE_RANGE,
  DISTANCE_RANGE_KM,
  MAX_PREFERRED_HOBBIES,
} from "@/shared/constants/limits";
import { colors } from "../../../shared/theme/colors";

const MIN_DISTANCE_KM = DISTANCE_RANGE_KM.min;
const MAX_DISTANCE_KM = DISTANCE_RANGE_KM.max;

// Backend (DiscoveryOptions.FreeMaxDistanceKm) free hesabı 50 km'ye clamp
// ediyor — UI'da da aynı sınırı uygula, kullanıcı 100 seçip 50 km içinden
// sonuç alıp şaşırmasın.
const FREE_MAX_DISTANCE_KM = 50;

// Görünürlük listelerinin (allowlist/blocklist) backend limiti. Fazlası sunucuda
// SESSİZCE kırpılıyor — sınırı UI'da uygulayıp kullanıcıya bildiriyoruz.
const MAX_VISIBILITY_DOMAINS = 100;

// DomainSelectRow props'u any olduğu için isimler orada denetlenmiyor; SFSymbol
// olarak burada sabitleyip yazım hatasını compile-time'da yakalıyoruz.
const VISIBLE_ONLY_ICON: SFSymbol = "eye.fill";
const HIDDEN_FROM_ICON: SFSymbol = "eye.slash.fill";
const UNIVERSITY_ICON: SFSymbol = "graduationcap.fill";

// Görünürlük listeleri backend'de trim + lowercase + tekilleştirme görüyor.
// Aynı kuralı okurken de uygula: seçili gösterimi ve overlap kontrolü
// picker'daki normalize domain'lerle birebir eşleşsin.
const toDomainList = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    const domain = normalizeDomain(value);
    if (domain) seen.add(domain);
  }
  return Array.from(seen).slice(0, MAX_VISIBILITY_DOMAINS);
};

// GET /api/swipe/Filters enum dizisini string ("Yoga") ya da obje
// ({ enumName: "Yoga" }) olarak dönebiliyor — ikisini de enumName listesine indir.
const toHobbyList = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    const enumName =
      typeof value === "string" ? value.trim() : value?.enumName?.trim?.();
    if (enumName) seen.add(enumName);
  }
  return Array.from(seen).slice(0, MAX_PREFERRED_HOBBIES);
};

// GET /Swipe/Filters ilişki niyetlerini string ("LongTerm") ya da obje
// ({ enumName: "LongTerm" }) olarak dönebiliyor — ikisini de enumName listesine
// indir. Hobilerin aksine sayı sınırı yok (toplam 5 seçenek var).
const toIntentList = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    const enumName =
      typeof value === "string" ? value.trim() : value?.enumName?.trim?.();
    if (enumName) seen.add(enumName);
  }
  return Array.from(seen);
};

// Backend hangi alanların premium-gated olduğunu response'ta bildiriyor
// (premiumOnlyFields). Alan listede yoksa gate uygulanmaz — backend ileride
// alanı free'ye açarsa UI kendiliğinden takip etsin. Liste hiç gelmediyse
// güvenli varsayım: premium-only (aksi halde free kullanıcı seçim yapıp 403 yer).
const isFieldPremiumGated = (f: any, field: string) => {
  const fields = f?.premiumOnlyFields;
  if (!Array.isArray(fields) || fields.length === 0) return true;
  const target = field.toLowerCase();
  return fields.some((x: any) => String(x).toLowerCase() === target);
};

const isHobbiesPremiumGated = (f: any) =>
  isFieldPremiumGated(f, "preferredHobbies");

const isIntentsPremiumGated = (f: any) =>
  isFieldPremiumGated(f, "relationshipIntents");

// Görünürlük listeleri de premiumOnlyFields üzerinden gate'leniyor. DİKKAT:
// backend bu listede PUT alan adlarını kullanıyor (GET'teki Preferred* adlarını
// değil) — bu iki alanda GET/PUT adı zaten aynı. isFieldPremiumGated iki tarafı
// da lowercase'lediği için PascalCase/camelCase farkı sorun değil.
const isVisibleOnlyPremiumGated = (f: any) =>
  isFieldPremiumGated(f, "VisibleOnlyToUniversityDomains");

const isHiddenFromPremiumGated = (f: any) =>
  isFieldPremiumGated(f, "HiddenFromUniversityDomains");

// "Ben kimi göreyim" üniversite filtresi. premiumOnlyFields PUT adını
// (`UniversityDomain`) taşıyor — GET'teki `preferredUniversityDomain` değil.
const isUniversityPremiumGated = (f: any) =>
  isFieldPremiumGated(f, "UniversityDomain");

// ─── Dealbreaker (olmazsa olmaz) ────────────────────────────────────────────
// Kullanıcı her filtrenin katı olup olmadığını seçiyor (Hinge modeli):
//   işaretli   → aday tükense bile gevşemez, kullanıcı boş ekran görür
//   işaretsiz  → keşif boşaldığında o filtre otomatik düşer
//
// Backend hangi filtrelerin toggle'ı OLABİLECEĞİNİ response'ta bildiriyor
// (dealbreakerCapableFields). premiumOnlyFields gibi hardcode ETME: ileride yeni
// alan eklenirse UI kendiliğinden alsın. Liste hiç gelmediyse (eski backend)
// toggle gösterme — yanlış ad göndermek 400 döndürüyor.
//
// Şehir/bölüm/üniversite bu listede YOK: onlar her zaman katı, toggle'ları yok.
// Hobiler ve ilişki niyetleri de yok: onlar hard filtre değil, skor boost'u.
const DEALBREAKER_FIELDS = {
  height: "Height",
  yearOfStudy: "YearOfStudy",
  zodiac: "Zodiac",
  smoking: "Smoking",
  pets: "Pets",
  usagePurpose: "UsagePurpose",
} as const;

type DealbreakerKey = keyof typeof DEALBREAKER_FIELDS;

const isDealbreakerCapable = (f: any, field: string) => {
  const fields = f?.dealbreakerCapableFields;
  if (!Array.isArray(fields)) return false;
  const target = field.toLowerCase();
  return fields.some((x: any) => String(x).toLowerCase() === target);
};

// Backend'in kabul ettiği adlara indir. Geçersiz ad 400 döndürüyor
// ("Geçersiz dealbreaker alanı: X") — sessizce yutulmuyor, o yüzden sadece
// tanıdığımız adları geçiriyoruz.
const VALID_DEALBREAKERS = Object.values(DEALBREAKER_FIELDS) as string[];

// Premium filtrelerin GET/PUT alan adları. Bu alt grupta GET ve PUT adları AYNI
// (şehir/bölüm/üniversitedeki preferredCity→city tarzı sapma yok). Local state
// kendi anahtarlarını kullanıyor, API adı yalnızca burada ve payload'da geçiyor.
const FILTER_FIELD = {
  heightMin: "heightMin",
  heightMax: "heightMax",
  zodiac: "zodiacSigns",
  smoking: "smokingStatuses",
  // DİKKAT: enum listesi DEĞİL — `bool?`. 3 durumlu: null/true/false.
  pets: "hasPets",
  usagePurpose: "usagePurposes",
  yearOfStudy: "yearsOfStudy",
} as const;

// Backend HeightMin/HeightMax'i 120–230 cm aralığında doğruluyor; dışına çıkan
// değer 400 döndürür. UI aynı aralığı uyguluyor.
const HEIGHT_RANGE_CM = { min: 120, max: 230 };

// Sınıf (YearOfStudy) profil tarafında int: 0 = hazırlık, 1..6 = sınıf.
// RegisterStep8'deki YEAR_OF_STUDY_VALUES ile aynı aralık — filtre de int
// gönderiyor, enum endpoint'i (/api/common/classes) gerekmiyor.
const YEAR_OF_STUDY_VALUES = [0, 1, 2, 3, 4, 5, 6];

// Enum çoklu seçim listeleri. Telde ÜÇ biçim de görülebiliyor ve hangisinin
// geleceği garanti değil:
//   "Aries"            → enumName string (JsonStringEnumConverter serileştirmesi)
//   { enumName: "..." } → obje
//   0                  → enum'un int değeri (DTO tipi ZodiacType[])
// Üçünü de kabul ediyoruz; int'ler int olarak korunuyor (option listesi henüz
// yüklenmemişken enumName'e çevirmeye kalkarsak seçim sessizce kaybolurdu).
// Backend iki biçimi de kabul ediyor — şehir/hobi/niyet alanları bugün string
// gönderiyor ve çalışıyor.
type EnumValue = string | number;

const toEnumList = (raw: any): EnumValue[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<EnumValue>();
  for (const value of raw) {
    if (typeof value === "number" && Number.isFinite(value)) {
      seen.add(value);
      continue;
    }
    const enumName =
      typeof value === "string" ? value.trim() : value?.enumName?.trim?.();
    if (enumName) seen.add(enumName);
  }
  return Array.from(seen);
};

// Bir option'ın seçili olup olmadığı: değer listede enumName ya da id olarak
// duruyor olabilir (yukarıdaki biçim belirsizliği).
const isEnumSelected = (selected: EnumValue[], opt: any) =>
  selected.includes(opt?.enumName) ||
  (opt?.id != null && selected.includes(opt.id));

// Boy alt sınırı — null/0/geçersiz = "farketmez" (filtre uygulanmaz).
// clampKm'le aynı gerekçe: backend sentinel dönerse slider dolgusu taşmasın.
const clampHeight = (raw: any): number | null => {
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(HEIGHT_RANGE_CM.max, Math.max(HEIGHT_RANGE_CM.min, n));
};

const toIntList = (raw: any): number[] => {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    const n = typeof value === "number" ? value : parseInt(value, 10);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out;
};

const toDealbreakerList = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    const name = typeof value === "string" ? value.trim() : "";
    const canonical = VALID_DEALBREAKERS.find(
      (v) => v.toLowerCase() === name.toLowerCase(),
    );
    if (canonical) seen.add(canonical);
  }
  return Array.from(seen);
};

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

// ─── Hobi kategorisi ikonları ──────────────────────────────────────────────
// EditProfileForm'daki map'in filtre ekranına taşınmış hali: backend
// categoryEnumName slug'ları + eski TR display isimleri (geçiş dönemi).
type IconEntry = { sf?: SFSymbol; lucide: LucideIcon };

const DUMBBELL_ICON: IconEntry = { sf: "dumbbell.fill", lucide: Dumbbell };
const UTENSILS_ICON: IconEntry = { sf: "fork.knife", lucide: Utensils };
const PALETTE_ICON: IconEntry = { sf: "paintpalette.fill", lucide: Palette };
const MUSIC_ICON: IconEntry = { sf: "music.note", lucide: Music };
const TREES_ICON: IconEntry = { sf: "tree.fill", lucide: Trees };
const BOOK_ICON: IconEntry = { sf: "book.fill", lucide: BookOpen };
const GAMEPAD_ICON: IconEntry = { sf: "gamecontroller.fill", lucide: Gamepad2 };
const USERS_ICON: IconEntry = { sf: "person.2.fill", lucide: Users };
const PLANE_ICON: IconEntry = { sf: "airplane", lucide: Plane };
const SPARKLES_ICON: IconEntry = { sf: "sparkles", lucide: Sparkles };
const DOG_ICON: IconEntry = { sf: "dog.fill", lucide: Dog };
const BRIEFCASE_ICON: IconEntry = { sf: "briefcase.fill", lucide: Briefcase };
const HEART_ICON: IconEntry = { sf: "heart", lucide: Heart };

const HOBBY_CATEGORY_ICON_MAP: Record<string, IconEntry> = {
  // Backend categoryEnumName (9 confirmed slugs)
  SportsFitness: DUMBBELL_ICON,
  FoodDrink: UTENSILS_ICON,
  ArtCreativity: PALETTE_ICON,
  MusicConcerts: MUSIC_ICON,
  NatureAdventure: TREES_ICON,
  CultureLearning: BOOK_ICON,
  GamingTech: GAMEPAD_ICON,
  SocialLifestyle: USERS_ICON,
  Intellectual: { sf: "lightbulb.fill", lucide: Lightbulb },
  // Legacy TR display keys
  "Spor & Fitness": DUMBBELL_ICON,
  Spor: DUMBBELL_ICON,
  Fitness: DUMBBELL_ICON,
  "Yemek & İçecek": UTENSILS_ICON,
  Yemek: UTENSILS_ICON,
  Mutfak: UTENSILS_ICON,
  "Sanat & Yaratıcılık": PALETTE_ICON,
  Sanat: PALETTE_ICON,
  Müzik: MUSIC_ICON,
  "Müzik & Konser": MUSIC_ICON,
  "Seyahat & Doğa": PLANE_ICON,
  Seyahat: PLANE_ICON,
  Doğa: TREES_ICON,
  "Doğa & Açık Hava": TREES_ICON,
  "Okuma & Kültür": BOOK_ICON,
  Kültür: { sf: "theatermasks.fill", lucide: Theater },
  "Sinema & Tiyatro": { sf: "film.fill", lucide: Film },
  "Oyun & Eğlence": GAMEPAD_ICON,
  Oyun: GAMEPAD_ICON,
  Eğlence: { sf: "party.popper.fill", lucide: PartyPopper },
  "Yaşam Tarzı": SPARKLES_ICON,
  Sosyal: USERS_ICON,
  Topluluk: USERS_ICON,
  Gönüllülük: USERS_ICON,
  Hayvanlar: DOG_ICON,
  "Evcil Hayvanlar": DOG_ICON,
  "Bilim & Kariyer": BRIEFCASE_ICON,
  Kariyer: BRIEFCASE_ICON,
  Teknoloji: { sf: "chevron.left.forwardslash.chevron.right", lucide: Code },
};

const getHobbyCategoryIcon = (category?: string): IconEntry => {
  if (!category) return HEART_ICON;
  const exact = HOBBY_CATEGORY_ICON_MAP[category];
  if (exact) return exact;
  // Keyword fallback — kategori string'i map key'lerinden birini içeriyor mu?
  const lower = category.toLowerCase();
  for (const [key, entry] of Object.entries(HOBBY_CATEGORY_ICON_MAP)) {
    if (lower.includes(key.toLowerCase())) return entry;
  }
  return HEART_ICON;
};

// Hobi pill'i — EditProfileForm'un aynısı; farkı seçimin id değil enumName ile
// takip edilmesi (filtre payload'ı enum string dizisi bekliyor).
const HobbyPill = React.memo(function HobbyPill({
  hobby,
  isSelected,
  onPress,
}: any) {
  const { i18n } = useTranslation();
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => onPress(hobby.enumName)}
      style={{
        ...PILL_STYLE,
        backgroundColor: pillColors(isSelected).backgroundColor,
        borderColor: pillColors(isSelected).borderColor,
      }}
    >
      <HobbyIcon
        hobby={hobby.enumName ?? hobby.name}
        size={PILL_ICON_SIZE}
        color={pillColors(isSelected).fg}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: pillColors(isSelected).fg,
          fontSize: PILL_TEXT_SIZE,
          fontWeight: "500",
        }}
      >
        {resolveLocalized(hobby.display, i18n.language, hobby.name)}
      </Text>
    </TouchableOpacity>
  );
});

// Kategori accordion'ı — tıklanmadan içerik render edilmez (9 kategori × ~8 pill
// mount maliyeti modal açılışına binmesin).
const HobbyGroupAccordion = React.memo(function HobbyGroupAccordion({
  group,
  selectedEnums,
  onToggle,
  locked,
  onLockedPress,
}: any) {
  const { i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hobbies = useMemo(() => group.hobbies ?? [], [group.hobbies]);
  const selectedCount = useMemo(
    () => hobbies.filter((h: any) => selectedEnums.includes(h.enumName)).length,
    [hobbies, selectedEnums],
  );

  const categoryIcon = useMemo(
    () => getHobbyCategoryIcon(group.categoryEnumName ?? group.category),
    [group.categoryEnumName, group.category],
  );

  // Kilitliyken accordion açılmaz; dokunuş doğrudan paywall'a gider.
  const handleToggle = () => {
    if (locked) {
      onLockedPress();
      return;
    }
    setExpanded((e) => !e);
  };

  return (
    <View
      style={{
        marginTop: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: "rgba(255,255,255,0.08)",
      }}
    >
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.7}
        style={{
          paddingVertical: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            flex: 1,
          }}
        >
          <SFIcon
            name={categoryIcon.sf as SFSymbol}
            fallback={categoryIcon.lucide}
            size={18}
            color={colors.text}
            strokeWidth={1.5}
          />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {resolveLocalized(
              group.categoryDisplay,
              i18n.language,
              group.category,
            )}
          </Text>
          {selectedCount > 0 && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.error,
              }}
            />
          )}
        </View>
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
          <SFIcon
            name="chevron.down"
            fallback={ChevronDown}
            size={18}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View
          style={{
            paddingBottom: 16,
            paddingTop: 4,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {hobbies.map((h: any) => (
            <HobbyPill
              key={h.enumName}
              hobby={h}
              isSelected={selectedEnums.includes(h.enumName)}
              onPress={onToggle}
            />
          ))}
        </View>
      )}
    </View>
  );
});

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

// "Premium Filtreler" grup başlığı — altındaki tüm bölümleri çerçeveler.
// FilterSection'la aynı tipografi (20px başlık + info.circle'lı açıklama), farkı
// üstteki ayırıcı çizgi: tek bir filtreyi değil, bir grubu açıyor.
function PremiumGroupHeader({ title, description, locked }: any) {
  return (
    <View style={{ marginTop: 32 }}>
      <View
        style={{
          height: 0.5,
          backgroundColor: "rgba(255,255,255,0.08)",
          marginBottom: 20,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 9,
        }}
      >
        {/* Grup başlığı tek tek filtre başlıklarından (FilterSection, 20px)
            bir kademe büyük — hiyerarşi göz ile ayrılabilsin. */}
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: "700" }}>
          {title}
        </Text>
        {locked && (
          <SFIcon
            name="lock.fill"
            fallback={Lock}
            size={17}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingRight: 16,
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
    </View>
  );
}

// Premium bölümü kilitleme sarmalayıcısı. City'nin pointerEvents:"none"
// yaklaşımından farkı: dokunuş yutulmuyor, paywall'a yönlendiriliyor (Görünürlük
// ve hobi bölümleriyle aynı davranış). İçerideki kontroller kilitliyken
// tepkisiz — kullanıcı yanlışlıkla seçim yapıp 403 yemesin.
function PremiumGate({ locked, onLockedPress, children }: any) {
  if (!locked) return children;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onLockedPress}>
      <View style={{ opacity: 0.4 }} pointerEvents="none">
        {children}
      </View>
    </TouchableOpacity>
  );
}

// "Olmazsa olmaz" anahtarı — filtrenin katı mı esnek mi olduğunu seçer.
// Metin duruma göre değişiyor çünkü asıl anlaşılması gereken şey sonucu:
// açık = daha az ama tam istediğin profil, kapalı = daha çok profil.
function DealbreakerToggle({ value, onToggle, disabled, testID }: any) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 24,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
          flex: 1,
        }}
      >
        {value
          ? t("discover.filters.dealbreaker.on")
          : t("discover.filters.dealbreaker.off")}
      </Text>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: "rgba(255,255,255,0.15)", true: colors.successIos }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

// Tüm seçim pill'lerinin ortak ölçüsü — referans "İlgi Alanı" (interestedIn)
// pill'leri. Hobiler, sınıf, burç, sigara, evcil hayvan, kullanım amacı ve
// ilişki niyeti hepsi bunu kullanıyor ki modal boyunca tek bir dokunma hedefi
// ve tipografi olsun.
const PILL_STYLE = {
  borderRadius: 999,
  borderCurve: "continuous",
  overflow: "hidden",
  paddingHorizontal: 12,
  paddingVertical: 11,
  borderWidth: 0.5,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
} as const;

const PILL_ICON_SIZE = 20;
const PILL_TEXT_SIZE = 14;

// Pill'in seçili/seçilmemiş rengi — ikon ve metin aynı rengi alır.
const pillColors = (selected: boolean) => ({
  backgroundColor: selected ? colors.text : "transparent",
  borderColor: selected ? colors.text : "rgba(255,255,255,0.1)",
  fg: selected ? "#000" : colors.textSecondary,
});

function PillIcon({ icon, selected }: any) {
  if (!icon) return null;
  return (
    <SFIcon
      name={icon.sf}
      fallback={icon.lucide}
      size={PILL_ICON_SIZE}
      color={pillColors(selected).fg}
      strokeWidth={1.5}
    />
  );
}

// Enum çoklu seçim pill'leri (burç, sigara, kullanım amacı). İlişki niyeti
// pill'leriyle aynı görünüm; ikon `getIcon` ile enumName'den çözülüyor.
const EnumPillGroup = React.memo(function EnumPillGroup({
  options,
  selected,
  onToggle,
  getIcon,
}: any) {
  const { i18n } = useTranslation();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt: any) => {
        const isSelected = isEnumSelected(selected, opt);
        return (
          <TouchableOpacity
            key={opt.enumName}
            activeOpacity={1}
            onPress={() => onToggle(opt)}
            style={{
              ...PILL_STYLE,
              backgroundColor: pillColors(isSelected).backgroundColor,
              borderColor: pillColors(isSelected).borderColor,
            }}
          >
            <PillIcon icon={getIcon?.(opt.enumName)} selected={isSelected} />
            <Text
              style={{
                color: pillColors(isSelected).fg,
                fontSize: PILL_TEXT_SIZE,
                fontWeight: "500",
              }}
            >
              {resolveLocalized(opt.display, i18n.language, opt.name)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// Boy aralığı — çift tutamaklı slider. İki uç BAĞIMSIZ nullable:
//   min=null, max=null → "Farketmez" (filtre uygulanmaz)
//   min=170, max=null  → "170 cm ve üzeri"
//   min=null, max=190  → "190 cm ve altı"
//   min=170, max=190   → "170 – 190 cm"
// Backend HeightMin > HeightMax gelirse 400 döndürüyor; tutamaklar birbirini
// geçemeyecek şekilde clamp'leniyor, o hata UI'dan hiç çıkmıyor.
//
// Değerler shared value'da tutuluyor (worklet clamp'i karşı tutamağı bilmeli),
// display ayrıca state'te — DistanceCircle'ın deseni: sürükleme boyunca tick,
// commit parmak kalkınca.
const HEIGHT_THUMB = 26;
const HEIGHT_TRACK = 3;

function HeightRangeSlider({ min, max, onChange }: any) {
  const { t } = useTranslation();
  const widthSV = useSharedValue(0);
  // Tutamak konumları her zaman sayı; "null" (uç serbest) bilgisi JS state'inde.
  // Serbest uç kendi ucunda duruyor, oradan çekilince gerçek değere dönüşüyor.
  const minSV = useSharedValue(min ?? HEIGHT_RANGE_CM.min);
  const maxSV = useSharedValue(max ?? HEIGHT_RANGE_CM.max);
  const activeSV = useSharedValue<"min" | "max">("min");

  const [range, setRange] = useState<{
    min: number | null;
    max: number | null;
  }>({ min: min ?? null, max: max ?? null });
  const rangeRef = useRef(range);

  useEffect(() => {
    const next = { min: min ?? null, max: max ?? null };
    rangeRef.current = next;
    setRange(next);
    minSV.value = next.min ?? HEIGHT_RANGE_CM.min;
    maxSV.value = next.max ?? HEIGHT_RANGE_CM.max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  const span = HEIGHT_RANGE_CM.max - HEIGHT_RANGE_CM.min;
  const toPct = (cm: number) => (cm - HEIGHT_RANGE_CM.min) / span;

  const onTick = (side: "min" | "max", cm: number) => {
    if (rangeRef.current[side] === cm) return;
    rangeRef.current = { ...rangeRef.current, [side]: cm };
    setRange(rangeRef.current);
    Haptics.selectionAsync().catch(() => {});
  };

  const onCommit = () => {
    onChange(rangeRef.current);
  };

  const clear = () => {
    const next = { min: null, max: null };
    rangeRef.current = next;
    setRange(next);
    minSV.value = HEIGHT_RANGE_CM.min;
    maxSV.value = HEIGHT_RANGE_CM.max;
    onChange(next);
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        // Hangi tutamağın sürükleneceği dokunma anında belirleniyor: parmağa
        // yakın olan. Sonrasında pan boyunca sabit kalır ki tutamaklar
        // birbirine yaklaşınca kontrol el değiştirmesin.
        .onBegin((e) => {
          const w = widthSV.value;
          if (w <= 0) return;
          const cm =
            HEIGHT_RANGE_CM.min + Math.max(0, Math.min(1, e.x / w)) * span;
          activeSV.value =
            Math.abs(cm - minSV.value) <= Math.abs(cm - maxSV.value)
              ? "min"
              : "max";
        })
        .onUpdate((e) => {
          const w = widthSV.value;
          if (w <= 0) return;
          const pct = Math.max(0, Math.min(1, e.x / w));
          const raw = Math.round(HEIGHT_RANGE_CM.min + pct * span);
          if (activeSV.value === "min") {
            const next = Math.max(
              HEIGHT_RANGE_CM.min,
              Math.min(raw, maxSV.value),
            );
            minSV.value = next;
            runOnJS(onTick)("min", next);
          } else {
            const next = Math.min(
              HEIGHT_RANGE_CM.max,
              Math.max(raw, minSV.value),
            );
            maxSV.value = next;
            runOnJS(onTick)("max", next);
          }
        })
        .onEnd(() => {
          runOnJS(onCommit)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [span],
  );

  const label = () => {
    if (range.min == null && range.max == null) {
      return t("discover.filters.height.any");
    }
    if (range.max == null) {
      return t("discover.filters.height.atLeast", { cm: range.min });
    }
    if (range.min == null) {
      return t("discover.filters.height.atMost", { cm: range.max });
    }
    return t("discover.filters.height.between", {
      min: range.min,
      max: range.max,
    });
  };

  const minPct = toPct(range.min ?? HEIGHT_RANGE_CM.min);
  const maxPct = toPct(range.max ?? HEIGHT_RANGE_CM.max);

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>
          {label()}
        </Text>
        {range.min != null || range.max != null ? (
          <TouchableOpacity hitSlop={12} activeOpacity={0.7} onPress={clear}>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {t("discover.filters.height.clear")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e) => {
            widthSV.value = e.nativeEvent.layout.width;
          }}
          // Track ince ama dokunma alanı parmak boyutunda olmalı.
          style={{ paddingVertical: 12, justifyContent: "center" }}
        >
          <View
            style={{
              height: HEIGHT_TRACK,
              borderRadius: HEIGHT_TRACK / 2,
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${minPct * 100}%`,
              width: `${(maxPct - minPct) * 100}%`,
              height: HEIGHT_TRACK,
              borderRadius: HEIGHT_TRACK / 2,
              backgroundColor: "rgba(255,255,255,0.45)",
            }}
          />
          {[minPct, maxPct].map((pct, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: `${pct * 100}%`,
                marginLeft: -HEIGHT_THUMB / 2,
                width: HEIGHT_THUMB,
                height: HEIGHT_THUMB,
                borderRadius: HEIGHT_THUMB / 2,
                backgroundColor: colors.text,
              }}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

// Dealbreaker'lı premium filtre bölümü: başlık + seçim kontrolü + (varsa)
// "olmazsa olmaz" anahtarı. Toggle KOŞULLU: yalnızca backend o alanı
// dealbreakerCapableFields'ta bildirdiyse çizilir — hobiler/niyetler gibi
// ranking-only alanlarda hiç görünmez, backend zaten kabul etmez.
function PremiumFilterSection({
  title,
  description,
  locked,
  onLockedPress,
  capable,
  dealbreakerOn,
  onToggleDealbreaker,
  testID,
  children,
}: any) {
  return (
    <PremiumGate locked={locked} onLockedPress={onLockedPress}>
      <View>
        <FilterSection title={title} description={description} />
        {children}
        {capable ? (
          <DealbreakerToggle
            testID={testID}
            value={dealbreakerOn}
            onToggle={onToggleDealbreaker}
          />
        ) : null}
      </View>
    </PremiumGate>
  );
}

// Görünürlük listesinin etiketi + doluluk sayacı. Backend her listeyi 100
// domain'de SESSİZCE kırpıyor; picker sınıra gelince uyarıyor ama kullanıcı
// nerede olduğunu ancak sayaçla görebiliyor. Sayaç yalnızca seçim varken
// çıkıyor — boş listede "0/100" gereksiz gürültü.
function VisibilityListLabel({ label, count, marginTop = 0 }: any) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop,
        marginBottom: 8,
      }}
    >
      <Text
        style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "500" }}
      >
        {label}
      </Text>
      {count > 0 ? (
        <Text
          style={{
            color: count >= MAX_VISIBILITY_DOMAINS
              ? colors.text
              : colors.textMuted,
            fontSize: 13,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          {count}/{MAX_VISIBILITY_DOMAINS}
        </Text>
      ) : null}
    </View>
  );
}

// Görünürlük listelerinin seçim satırı. Şehir satırıyla aynı pill görünümü;
// farkı çoklu seçimi özetlemesi ("İTÜ +2") ve X'in listeyi tamamen temizlemesi.
function DomainSelectRow({
  sfIcon,
  lucideIcon,
  value,
  placeholder,
  onPress,
  onClear,
  disabled,
}: any) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
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
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
      >
        <SFIcon
          name={sfIcon}
          fallback={lucideIcon}
          size={18}
          color={colors.textSecondary}
          strokeWidth={1.5}
        />
        <Text
          numberOfLines={1}
          style={{
            color: value ? colors.text : colors.textSecondary,
            fontSize: 15,
            fontWeight: "500",
            flex: 1,
          }}
        >
          {value || placeholder}
        </Text>
      </View>
      {value ? (
        <TouchableOpacity onPress={onClear} hitSlop={12} activeOpacity={0.7}>
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
  );
}

export default function FilterModal({
  visible,
  onClose,
  filters,
  isPremium: isPremiumProp,
  onSave,
  saving,
}: any) {
  const { t, i18n } = useTranslation();

  // Tier kararının BİRİNCİL kaynağı filtre yanıtının kendi `isPremium` alanı.
  // Prop, swipe Stats sorgusundan geliyor: o sorgu staleTime:Infinity +
  // refetchOnMount:false ile oturumda BİR KEZ çekiliyor, yani açılışta
  // başarısız olur ya da premium sonradan aktifleşirse `false`ta çakılı kalıyor
  // ve premium kullanıcı kilit ikonu görüyordu. GET /Filters ise modal her
  // açıldığında tazeleniyor ve backend gating'i zaten bu alandan bildiriyor.
  //
  // OR ile birleştiriliyor (useSwipeStats'ın kendi içindeki desenle aynı):
  // satın alma sonrası optimistic premium penceresinde Stats önce doğruyu
  // söyleyebiliyor. Ters yönde yanılırsak (premium bitmiş ama prop bayat)
  // kaydetme 403 + paywall ile zaten yakalanıyor.
  const isPremium = isPremiumProp === true || filters?.isPremium === true;

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
    // Hobiler gate'i backend'in premiumOnlyFields listesine bağlı; karar hep
    // server state'inden (filters) okunuyor ki local kopyada alan eksikse de
    // aynı sonucu versin.
    const hobbiesGated = isHobbiesPremiumGated(filters);
    const intentsGated = isIntentsPremiumGated(filters);
    const universityGated = isUniversityPremiumGated(filters);
    const visibleOnlyGated = isVisibleOnlyPremiumGated(filters);
    const hiddenFromGated = isHiddenFromPremiumGated(filters);
    const hasPremiumValue =
      f.preferredCity != null ||
      (universityGated && f.preferredUniversityDomain != null) ||
      (visibleOnlyGated &&
        (f.visibleOnlyToUniversityDomains?.length ?? 0) > 0) ||
      (hiddenFromGated && (f.hiddenFromUniversityDomains?.length ?? 0) > 0) ||
      (hobbiesGated && (f.preferredHobbies?.length ?? 0) > 0) ||
      (intentsGated && (f.relationshipIntents?.length ?? 0) > 0) ||
      // Dealbreaker'lı premium filtreler — hepsi premium-only, biri bile
      // doluysa free kullanıcının TÜM isteği 403 yer. Bunlar local state'in
      // KENDİ anahtarları (API adları FILTER_FIELD'da) — sanitize her zaman
      // normalize edilmiş local shape üzerinde çalışıyor.
      f.heightMin != null ||
      f.heightMax != null ||
      (f.zodiac?.length ?? 0) > 0 ||
      (f.smoking?.length ?? 0) > 0 ||
      f.pets != null ||
      (f.usagePurpose?.length ?? 0) > 0 ||
      (f.yearOfStudy?.length ?? 0) > 0 ||
      (f.dealbreakers?.length ?? 0) > 0;
    if (!hasPremiumValue) return f;
    // Görünürlük listeleri overwrite semantiğiyle yazılıyor: free kullanıcıda boş
    // dizi göndermek premium döneminden kalan kısıtlamayı da temizler — istenen
    // davranış bu, aksi halde kullanıcı düşürdüğü premium'un gizlilik kuralına
    // kilitli kalırdı.
    return {
      ...f,
      preferredCity: null,
      ...(universityGated ? { preferredUniversityDomain: null } : {}),
      ...(visibleOnlyGated ? { visibleOnlyToUniversityDomains: [] } : {}),
      ...(hiddenFromGated ? { hiddenFromUniversityDomains: [] } : {}),
      preferredHobbies: [],
      relationshipIntents: [],
      heightMin: null,
      heightMax: null,
      zodiac: [],
      smoking: [],
      // `hasPets` bool? — enum listesi değil, temizlenmiş hali null.
      pets: null,
      usagePurpose: [],
      yearOfStudy: [],
      // Free kullanıcıda dealbreaker listesi de boşaltılır; onSave zaten
      // premium değilse alanı hiç göndermiyor (bkz. Apply).
      dealbreakers: [],
    };
  };

  // Server response'unu local state'e indir. İki iş yapıyor:
  //  1. Normalize — interestedIn int listesi, enum'lar enumName string listesi.
  //  2. API adı → local anahtar eşlemesi (FILTER_FIELD). Local state API
  //     adlarından bağımsız kalsın ki backend adı değişince tek yer düzelsin.
  // Sanitize normalize'dan SONRA çalışıyor: tier temizliği hep local shape
  // üzerinde, tek bir anahtar setiyle.
  const toLocalState = (f: any) => {
    if (!f) return f;
    return sanitizeForTier({
      ...f,
      interestedIn: normalizeInterestedIn(f.interestedIn),
      // Görünürlük listeleri: backend boş dizi döner (null değil) ama eski
      // response'lara / eksik alana karşı da normalize et.
      visibleOnlyToUniversityDomains: toDomainList(
        f.visibleOnlyToUniversityDomains,
      ),
      hiddenFromUniversityDomains: toDomainList(f.hiddenFromUniversityDomains),
      // "Ben kimi göreyim" üniversite tercihi — TEK domain. GET adı
      // `preferredUniversityDomain`, PUT adı `universityDomain`.
      preferredUniversityDomain:
        normalizeDomain(f.preferredUniversityDomain) || null,
      // Karşıda aranan hobiler: enumName string listesi (premium-only).
      preferredHobbies: toHobbyList(f.preferredHobbies),
      // Karşıda aranan ilişki niyetleri: enumName string listesi (premium-only).
      relationshipIntents: toIntentList(f.relationshipIntents),
      // Dealbreaker'lı premium filtreler.
      heightMin: clampHeight(f[FILTER_FIELD.heightMin]),
      heightMax: clampHeight(f[FILTER_FIELD.heightMax]),
      zodiac: toEnumList(f[FILTER_FIELD.zodiac]),
      smoking: toEnumList(f[FILTER_FIELD.smoking]),
      // 3 durumlu bool: null = farketmez, true = sahip olanlar, false = olmayanlar.
      pets: typeof f[FILTER_FIELD.pets] === "boolean" ? f[FILTER_FIELD.pets] : null,
      usagePurpose: toEnumList(f[FILTER_FIELD.usagePurpose]),
      yearOfStudy: toIntList(f[FILTER_FIELD.yearOfStudy]),
      // Hangi filtreler "olmazsa olmaz" işaretli. Mevcut kullanıcılarda
      // migration altısını da işaretlemiş — bilinçli, eski davranış "hepsi
      // katı" idi.
      dealbreakers: toDealbreakerList(f.dealbreakers),
      // Clamp'lenmiş değer Apply payload'ına da gider — kullanıcı slider'a hiç
      // dokunmadan kaydetse bile backend'e 20000 geri yazılmaz; free'de premium
      // döneminden kalan 50+ değer de cap'e çekilir.
      maxDistance: clampKm(
        f.maxDistance,
        isPremium ? MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM,
      ),
    });
  };

  const [local, setLocal] = useState(() => toLocalState(filters));
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  // Tek picker instance'ı iki listeye de hizmet ediyor. Açık/kapalı ile hedef
  // liste AYRI tutuluyor: gorhom dismiss animasyonlu (~300ms) ve hedefi tek bir
  // nullable state'te tutarsak kapanış sırasında null'a düşüp başlık diğer
  // listeninkine atlıyor. Hedef kapanış boyunca sabit kalsın.
  const [visibilityPickerVisible, setVisibilityPickerVisible] = useState(false);
  // Üçüncü hedef "preferred" = "ben kimi göreyim" (tek seçim). Diğer ikisi
  // görünürlük listeleri (çoklu seçim).
  const [visibilityPicker, setVisibilityPicker] = useState<
    "visibleOnly" | "hiddenFrom" | "preferred"
  >("visibleOnly");

  const citiesQuery = useCities();
  const cityOptions = citiesQuery.data ?? [];
  const hobbiesQuery = useHobbies();
  const hobbyGroups = useMemo(
    () => hobbiesQuery.data ?? [],
    [hobbiesQuery.data],
  );
  const relationshipIntentsQuery = useRelationshipIntents();
  const relationshipIntentOptions = useMemo(
    () => relationshipIntentsQuery.data ?? [],
    [relationshipIntentsQuery.data],
  );
  // Dealbreaker'lı premium filtrelerin enum listeleri. staticGet oturum-boyu
  // tek fetch yaptığı için ProfileScreen aynı listeleri çekiyorsa istek
  // tekrarlanmıyor.
  const zodiacsQuery = useZodiacs();
  const smokingQuery = useSmokingStatuses();
  const usagePurposesQuery = useUsagePurposes();

  const universitiesQuery = useUniversities();
  const universityOptions = useMemo(
    () => universitiesQuery.data ?? [],
    [universitiesQuery.data],
  );

  // Listelerde domain saklanıyor; satırda üniversite adını göstermek için lookup.
  const universityNameByDomain = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of universityOptions) map.set(u.domain, u.name);
    return map;
  }, [universityOptions]);

  const summarizeDomains = (domains: string[]) => {
    if (!domains || domains.length === 0) return null;
    const first = universityNameByDomain.get(domains[0]) ?? domains[0];
    return domains.length > 1 ? `${first} +${domains.length - 1}` : first;
  };

  const visibleOnlyDomains: string[] = useMemo(
    () => local?.visibleOnlyToUniversityDomains ?? [],
    [local?.visibleOnlyToUniversityDomains],
  );
  const hiddenFromDomains: string[] = useMemo(
    () => local?.hiddenFromUniversityDomains ?? [],
    [local?.hiddenFromUniversityDomains],
  );

  // Aynı domain iki listede birdense backend'de block kazanır (kullanıcı o
  // üniversiteden kimseye görünmez) — sessiz kalmak yerine uyarı gösteriyoruz.
  const visibilityOverlap = useMemo(() => {
    if (visibleOnlyDomains.length === 0 || hiddenFromDomains.length === 0) {
      return false;
    }
    const blocked = new Set(hiddenFromDomains);
    return visibleOnlyDomains.some((d) => blocked.has(d));
  }, [visibleOnlyDomains, hiddenFromDomains]);

  // Free kullanıcı kilitli alana dokununca paywall. useSaveFilters'ın 403
  // yolundaki event'in aynısı — DiscoverScreen "swipePaywall"i dinleyip
  // PurchaseModal'ı açıyor.
  const openPremiumPaywall = () => {
    uiBus.emit("swipePaywall", {
      paywallType: "PREMIUM_FILTERS",
      showPaywall: true,
      message: null,
    });
  };

  const onVisibilityConfirm = (domains: string[]) => {
    setVisibilityPickerVisible(false);
    if (visibilityPicker === "preferred") {
      // Tek seçim: dizi olarak geliyor, ilk (tek) domain'i saklıyoruz.
      setLocal((prev: any) => ({
        ...prev,
        preferredUniversityDomain: normalizeDomain(domains[0]) || null,
      }));
      return;
    }
    const field =
      visibilityPicker === "hiddenFrom"
        ? "hiddenFromUniversityDomains"
        : "visibleOnlyToUniversityDomains";
    setLocal((prev: any) => ({ ...prev, [field]: toDomainList(domains) }));
  };

  // Kilit kararı premiumOnlyFields'tan geliyor (hobiler/niyetlerle aynı):
  // backend bir listeyi ileride free'ye açarsa UI kendiliğinden takip etsin.
  // İki liste ayrı ayrı değerlendiriliyor çünkü backend'de de ayrı alanlar.
  const visibleOnlyLocked = !isPremium && isVisibleOnlyPremiumGated(filters);
  const hiddenFromLocked = !isPremium && isHiddenFromPremiumGated(filters);
  const visibilityLocked = visibleOnlyLocked || hiddenFromLocked;

  // Picker'ı hedef listeye kilitleyip aç. Free kullanıcı kilitli satıra
  // dokununca picker yerine paywall.
  const openVisibilityPicker = (target: "visibleOnly" | "hiddenFrom") => {
    if (target === "hiddenFrom" ? hiddenFromLocked : visibleOnlyLocked) {
      openPremiumPaywall();
      return;
    }
    setVisibilityPicker(target);
    setVisibilityPickerVisible(true);
  };

  // "Ben kimi göreyim" üniversite filtresi — premium-only, tek seçim.
  const universityLocked = !isPremium && isUniversityPremiumGated(filters);

  const openUniversityPicker = (target: "preferred") => {
    if (universityLocked) {
      openPremiumPaywall();
      return;
    }
    setVisibilityPicker(target);
    setVisibilityPickerVisible(true);
  };

  // Listede domain saklanıyor; satırda üniversite adını göster.
  const selectedUniversityName = useMemo(() => {
    const domain = local?.preferredUniversityDomain;
    if (!domain) return null;
    return universityNameByDomain.get(domain) ?? domain;
  }, [local?.preferredUniversityDomain, universityNameByDomain]);

  const hobbiesLocked = !isPremium && isHobbiesPremiumGated(filters);

  const preferredHobbies: string[] = useMemo(
    () => local?.preferredHobbies ?? [],
    [local?.preferredHobbies],
  );

  // Seçim enumName ile takip ediliyor — API'ye giden değer bu. Max 10; sınıra
  // gelince seçim eklenmez, toast ile bildirilir (backend 400 dönmeden önce).
  const togglePreferredHobby = (enumName: string) => {
    if (hobbiesLocked) {
      openPremiumPaywall();
      return;
    }
    if (preferredHobbies.includes(enumName)) {
      setLocal((prev: any) => ({
        ...prev,
        preferredHobbies: (prev?.preferredHobbies ?? []).filter(
          (h: string) => h !== enumName,
        ),
      }));
      return;
    }
    if (preferredHobbies.length >= MAX_PREFERRED_HOBBIES) {
      showInfoToast({
        title: t("discover.filters.preferredHobbies.limitTitle"),
        message: t("discover.filters.preferredHobbies.limitMsg", {
          max: MAX_PREFERRED_HOBBIES,
        }),
        variant: "error",
      });
      return;
    }
    setLocal((prev: any) => ({
      ...prev,
      preferredHobbies: [...(prev?.preferredHobbies ?? []), enumName],
    }));
  };

  const clearPreferredHobbies = () => {
    setLocal((prev: any) => ({ ...prev, preferredHobbies: [] }));
  };

  const intentsLocked = !isPremium && isIntentsPremiumGated(filters);

  const relationshipIntents: string[] = useMemo(
    () => local?.relationshipIntents ?? [],
    [local?.relationshipIntents],
  );

  // Çoklu seçim, sayı sınırı yok (toplam 5 seçenek). Seçim enumName ile takip
  // ediliyor — API'ye giden değer bu.
  const toggleRelationshipIntent = (enumName: string) => {
    if (intentsLocked) {
      openPremiumPaywall();
      return;
    }
    setLocal((prev: any) => {
      const current: string[] = prev?.relationshipIntents ?? [];
      return {
        ...prev,
        relationshipIntents: current.includes(enumName)
          ? current.filter((v) => v !== enumName)
          : [...current, enumName],
      };
    });
  };

  const clearRelationshipIntents = () => {
    setLocal((prev: any) => ({ ...prev, relationshipIntents: [] }));
  };

  // ─── Dealbreaker'lı premium filtreler ─────────────────────────────────────
  // Altısı da premium-only; free kullanıcıda bölüm kilitli, dokunuş paywall'a
  // gidiyor (Görünürlük/hobi bölümleriyle aynı davranış).
  const premiumFiltersLocked = !isPremium;

  const dealbreakers: string[] = useMemo(
    () => local?.dealbreakers ?? [],
    [local?.dealbreakers],
  );

  // Toggle durumu listede o adın olup olmamasıyla belirleniyor — ayrı bir
  // boolean state yok, tek kaynak `dealbreakers`.
  const toggleDealbreaker = (key: DealbreakerKey) => {
    const name = DEALBREAKER_FIELDS[key];
    setLocal((prev: any) => {
      const current: string[] = prev?.dealbreakers ?? [];
      return {
        ...prev,
        dealbreakers: current.includes(name)
          ? current.filter((v) => v !== name)
          : [...current, name],
      };
    });
  };

  // Enum çoklu seçimleri (burç/sigara/evcil hayvan/kullanım amacı) tek
  // işleyiciden geçiyor — hepsi aynı overwrite semantiğinde string listesi.
  // Option TAMAMI geliyor: kaldırırken listedeki değer enumName ya da id
  // biçiminde olabilir (bkz. toEnumList), ikisini de düşürüyoruz. Eklerken
  // enumName yazıyoruz — GET'in serileştirdiği biçim bu ve backend kabul ediyor.
  const toggleEnumValue = (key: DealbreakerKey, opt: any) => {
    setLocal((prev: any) => {
      const current: EnumValue[] = prev?.[key] ?? [];
      return {
        ...prev,
        [key]: isEnumSelected(current, opt)
          ? current.filter((v) => v !== opt.enumName && v !== opt.id)
          : [...current, opt.enumName],
      };
    });
  };

  const toggleYearOfStudy = (year: number) => {
    setLocal((prev: any) => {
      const current: number[] = prev?.yearOfStudy ?? [];
      return {
        ...prev,
        yearOfStudy: current.includes(year)
          ? current.filter((v) => v !== year)
          : [...current, year],
      };
    });
  };

  const setHeightRange = (next: { min: number | null; max: number | null }) => {
    setLocal((prev: any) => ({
      ...prev,
      heightMin: next.min,
      heightMax: next.max,
    }));
  };

  // `hasPets` 3 durumlu bool: aynı seçeneğe tekrar basmak "farketmez"e döner.
  const setHasPets = (next: boolean | null) => {
    setLocal((prev: any) => ({
      ...prev,
      pets: prev?.pets === next ? null : next,
    }));
  };

  const clearVisibilityList = (
    field: "visibleOnlyToUniversityDomains" | "hiddenFromUniversityDomains",
  ) => {
    setLocal((prev: any) => ({ ...prev, [field]: [] }));
  };

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

  // Karşımda görmek istediğim hobiler — premium-only, HARD FİLTRE DEĞİL.
  // Backend bunu skor boost'u olarak kullanıyor: seçilen hobilere sahip
  // adaylar destede yukarı çıkar, diğerleri elenmez. Metin de bunu söylemeli
  // ("öne çıkar", "sadece onlar gelir" DEĞİL).
  // City'den farkı: pointerEvents kapatılmıyor — free kullanıcı dokununca
  // paywall açılsın (Görünürlük bölümüyle aynı davranış).
  const hobbiesSection = (
    <View style={{ opacity: hobbiesLocked ? 0.4 : 1 }}>
      <FilterSection
        title={t("discover.filters.preferredHobbies.title")}
        description={t("discover.filters.preferredHobbies.description")}
        locked={hobbiesLocked}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            fontWeight: "500",
          }}
        >
          {t("discover.filters.preferredHobbies.selected", {
            // `count` DEĞİL: i18next'te çoğul çözümlemesini tetikler.
            selected: preferredHobbies.length,
            max: MAX_PREFERRED_HOBBIES,
          })}
        </Text>
        {preferredHobbies.length > 0 && !hobbiesLocked ? (
          <TouchableOpacity
            onPress={clearPreferredHobbies}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {t("discover.filters.preferredHobbies.clear")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {hobbyGroups.length === 0 ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            fontWeight: "400",
            marginTop: 12,
          }}
        >
          {hobbiesQuery.isLoading
            ? t("discover.filters.preferredHobbies.loading")
            : t("discover.filters.preferredHobbies.unavailable")}
        </Text>
      ) : (
        hobbyGroups.map((group: any, gi: number) => (
          <HobbyGroupAccordion
            key={group.categoryEnumName ?? group.category ?? gi}
            group={group}
            selectedEnums={preferredHobbies}
            onToggle={togglePreferredHobby}
            locked={hobbiesLocked}
            onLockedPress={openPremiumPaywall}
          />
        ))
      )}
    </View>
  );

  // Karşımda görmek istediğim ilişki niyetleri — premium-only, ÇOKLU seçim,
  // HARD FİLTRE DEĞİL. Backend skor boost'u olarak kullanıyor (max +12):
  // seçilen niyetlere sahip adaylar destede yukarı taşınır, niyetini
  // doldurmamış olanlar da destede kalır. Metin bunu söylemeli ("öne çıkar",
  // "sadece onlar gelir" DEĞİL).
  // Kullanıcının KENDİ niyetinden bağımsız (o profil düzenlemede).
  // Hobilerle aynı davranış: pointerEvents kapatılmıyor, free kullanıcı
  // dokununca paywall açılıyor.
  const intentsSection = (
    <View style={{ opacity: intentsLocked ? 0.4 : 1 }}>
      <FilterSection
        title={t("discover.filters.relationshipIntents.title")}
        description={t("discover.filters.relationshipIntents.description")}
        locked={intentsLocked}
      />

      {relationshipIntentOptions.length === 0 ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            fontWeight: "400",
          }}
        >
          {relationshipIntentsQuery.isLoading
            ? t("discover.filters.relationshipIntents.loading")
            : t("discover.filters.relationshipIntents.unavailable")}
        </Text>
      ) : (
        <>
          {/* "x/x seçili" sayacı kaldırıldı; satır sadece "temizle" için var,
              o da seçim yoksa hiç render edilmiyor (boş boşluk bırakmasın). */}
          {relationshipIntents.length > 0 && !intentsLocked ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                marginBottom: 12,
              }}
            >
              <TouchableOpacity
                onPress={clearRelationshipIntents}
                hitSlop={12}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {t("discover.filters.relationshipIntents.clear")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {relationshipIntentOptions.map((opt: any) => {
              const selected = relationshipIntents.includes(opt.enumName);
              const icon = getRelationshipIntentIcon(opt.enumName);
              return (
                <TouchableOpacity
                  key={opt.enumName}
                  activeOpacity={1}
                  onPress={() => toggleRelationshipIntent(opt.enumName)}
                  style={{
                    ...PILL_STYLE,
                    backgroundColor: pillColors(selected).backgroundColor,
                    borderColor: pillColors(selected).borderColor,
                  }}
                >
                  <PillIcon icon={icon} selected={selected} />
                  <Text
                    style={{
                      color: pillColors(selected).fg,
                      fontSize: PILL_TEXT_SIZE,
                      fontWeight: "500",
                    }}
                  >
                    {resolveLocalized(opt.display, i18n.language, opt.name)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('discover.filters.title')}
      actionLabel={t('discover.filters.apply')}
      onAction={() => {
        Keyboard.dismiss();
        // `dealbreakers` spread'in DIŞINDA tutuluyor: local state onu taşıyor ve
        // koşulsuz yayılırsa free kullanıcıda boş dizi olarak gider — backend
        // semantiğinde bu "hepsini esnet" demek, yani kullanıcının kayıtlı
        // katılık ayarını habersiz sıfırlar. Aşağıda yalnızca premium'da,
        // kanonik adlara indirgenmiş halde ekleniyor.
        const { dealbreakers: dealbreakersFromState, ...sanitized } =
          sanitizeForTier(local) ?? {};
        // Yaş filtresi UI'dan kaldırıldı — backend'e her zaman tüm yaşları
        // kapsayan default'u gönder.
        onSave({
          ...sanitized,
          // Alanı hiç göndermemek "değiştirme", dolu dizi ise "bu değere ayarla"
          // demek. Boş dizi gönderilmiyor — interestedInEmpty guard'ı Apply'ı
          // kilitliyor (bkz. yukarıdaki not: flags 0 = hesap görünmez olur).
          interestedIn: local.interestedIn || [],
          ageRangeMin: DEFAULT_AGE_RANGE.min,
          ageRangeMax: DEFAULT_AGE_RANGE.max,
          // Görünürlük listeleri OVERWRITE semantiğiyle yazılıyor: backend her
          // UpdateFilters'ta premium alanların tamamını gönderilen state'e göre
          // yeniden kuruyor. Bu yüzden ekrandaki güncel state'in TAMAMI her
          // kaydetmede gitmeli — alanı atlamak listeyi silmekle aynı şey.
          // PUT adı `universityDomain`; eşleme useSaveFilters'ta (şehirle aynı).
          preferredUniversityDomain:
            sanitized?.preferredUniversityDomain ?? null,
          visibleOnlyToUniversityDomains: toDomainList(
            sanitized?.visibleOnlyToUniversityDomains,
          ),
          hiddenFromUniversityDomains: toDomainList(
            sanitized?.hiddenFromUniversityDomains,
          ),
          // Hobiler de OVERWRITE: boş dizi = tercihi temizle. Bu yüzden koşulsuz
          // gönderiliyor, aksi halde kullanıcı seçimini silemezdi.
          preferredHobbies: toHobbyList(sanitized?.preferredHobbies),
          // İlişki niyetleri de OVERWRITE: boş dizi = tercihi temizle.
          relationshipIntents: toIntentList(sanitized?.relationshipIntents),
          // Dealbreaker'lı premium filtreler. Local anahtarlar → API adları
          // SADECE burada eşleniyor (FILTER_FIELD); backend adı değiştirirse
          // düzeltilecek tek yer orası. Hepsi OVERWRITE: boş dizi / null =
          // tercihi temizle.
          premiumFilters: {
            [FILTER_FIELD.heightMin]: sanitized?.heightMin ?? null,
            [FILTER_FIELD.heightMax]: sanitized?.heightMax ?? null,
            [FILTER_FIELD.zodiac]: toEnumList(sanitized?.zodiac),
            [FILTER_FIELD.smoking]: toEnumList(sanitized?.smoking),
            // bool? — enum listesi değil; null = farketmez.
            [FILTER_FIELD.pets]:
              typeof sanitized?.pets === "boolean" ? sanitized.pets : null,
            [FILTER_FIELD.usagePurpose]: toEnumList(sanitized?.usagePurpose),
            [FILTER_FIELD.yearOfStudy]: toIntList(sanitized?.yearOfStudy),
          },
          // `dealbreakers` semantiği DİĞER premium alanlardan FARKLI:
          //   yok/null → değiştirme, [] → hepsini esnet, [...] → tam liste.
          // Free kullanıcıda hiç gönderilmiyor (premium alan, 403 döner);
          // premium'da TAM liste gidiyor — kısmi güncelleme yok.
          ...(isPremium
            ? { dealbreakers: toDealbreakerList(dealbreakersFromState) }
            : {}),
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
                ...PILL_STYLE,
                backgroundColor: pillColors(selected).backgroundColor,
                borderColor: pillColors(selected).borderColor,
              }}
            >
              <SFIcon
                name={opt.sf}
                fallback={opt.lucide}
                size={PILL_ICON_SIZE}
                color={pillColors(selected).fg}
                strokeWidth={1.5}
              />
              <Text
                style={{
                  color: pillColors(selected).fg,
                  fontSize: PILL_TEXT_SIZE,
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


      {/* Premium Filtreler — buradan aşağısı tamamen premium. Toggle'lı olanlar
          (boy/sınıf/burç/sigara/evcil hayvan/kullanım amacı) hard filtre;
          hobiler ve ilişki niyetleri toggle'sız çünkü onlar eleme yapmıyor,
          skor boost'u — kendi açıklamaları bunu söylüyor. */}
      <PremiumGroupHeader
        title={t("discover.filters.premiumFilters.title")}
        description={t("discover.filters.premiumFilters.description")}
        locked={premiumFiltersLocked}
      />

      {/* Üniversite ("ben kimi göreyim") — premium-only, TEK seçim, HER ZAMAN
          katı: aday tükense bile gevşemez, o yüzden dealbreaker toggle'ı yok.
          Aşağıdaki Görünürlük listeleriyle KARIŞTIRMA: onlar "beni kim görsün"
          ve karşı tarafın destesini etkiliyor.
          DİKKAT: GET'te `preferredUniversityDomain`, PUT'ta `universityDomain`
          — ad eşlemesi useSaveFilters'ta (şehirdeki preferredCity→city gibi). */}
      <PremiumGate locked={universityLocked} onLockedPress={openPremiumPaywall}>
        <View>
          <FilterSection
            title={t("discover.filters.university.title")}
            description={t("discover.filters.university.description")}
            locked={universityLocked}
          />
          <DomainSelectRow
            sfIcon={UNIVERSITY_ICON}
            lucideIcon={GraduationCap}
            value={selectedUniversityName}
            placeholder={t("discover.filters.university.select")}
            disabled={!universityLocked && universityOptions.length === 0}
            onPress={() => openUniversityPicker("preferred")}
            onClear={() =>
              setLocal((prev: any) => ({
                ...prev,
                preferredUniversityDomain: null,
              }))
            }
          />
        </View>
      </PremiumGate>

      {/* Şehir — premium-only, HER ZAMAN katı (aday tükense bile gevşemez,
          o yüzden dealbreaker toggle'ı yok). Grubun geri kalanıyla aynı kilit
          davranışı: dokunuş yutulmuyor, paywall'a gidiyor. */}
      <PremiumGate locked={!isPremium} onLockedPress={openPremiumPaywall}>
        <View>
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
      </PremiumGate>

      {/* Boy — alt sınır. "Farketmez" ayrı bir durum: filtre hiç uygulanmaz. */}
      <PremiumFilterSection
        title={t("discover.filters.height.title")}
        description={t("discover.filters.height.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={isDealbreakerCapable(filters, DEALBREAKER_FIELDS.height)}
        dealbreakerOn={dealbreakers.includes(DEALBREAKER_FIELDS.height)}
        onToggleDealbreaker={() => toggleDealbreaker("height")}
        testID={`dealbreaker-${DEALBREAKER_FIELDS.height}`}
      >
        <HeightRangeSlider
          min={local?.heightMin ?? null}
          max={local?.heightMax ?? null}
          onChange={setHeightRange}
        />
      </PremiumFilterSection>

      {/* Sınıf — int (0 = hazırlık, 1..6). Enum endpoint'i yok, kayıt
          ekranıyla (RegisterStep8) aynı aralık. */}
      <PremiumFilterSection
        title={t("discover.filters.yearOfStudy.title")}
        description={t("discover.filters.yearOfStudy.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={isDealbreakerCapable(filters, DEALBREAKER_FIELDS.yearOfStudy)}
        dealbreakerOn={dealbreakers.includes(DEALBREAKER_FIELDS.yearOfStudy)}
        onToggleDealbreaker={() => toggleDealbreaker("yearOfStudy")}
        testID={`dealbreaker-${DEALBREAKER_FIELDS.yearOfStudy}`}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {YEAR_OF_STUDY_VALUES.map((year) => {
            const selected = (local?.yearOfStudy ?? []).includes(year);
            return (
              <TouchableOpacity
                key={year}
                activeOpacity={1}
                onPress={() => toggleYearOfStudy(year)}
                style={{
                  ...PILL_STYLE,
                  backgroundColor: pillColors(selected).backgroundColor,
                  borderColor: pillColors(selected).borderColor,
                }}
              >
                <PillIcon icon={getYearOfStudyIcon(year)} selected={selected} />
                <Text
                  style={{
                    color: pillColors(selected).fg,
                    fontSize: PILL_TEXT_SIZE,
                    fontWeight: "500",
                  }}
                >
                  {year === 0
                    ? t("discover.filters.yearOfStudy.prep")
                    : t("discover.filters.yearOfStudy.year", { year })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </PremiumFilterSection>

      {/* Burç / Sigara / Evcil hayvan / Kullanım amacı — hepsi düz enum çoklu
          seçimi, aynı pill grubundan geçiyor. */}
      {[
        {
          key: "zodiac" as DealbreakerKey,
          query: zodiacsQuery,
          getIcon: getZodiacIcon,
          titleKey: "discover.filters.zodiac.title",
          descKey: "discover.filters.zodiac.description",
        },
        {
          key: "smoking" as DealbreakerKey,
          query: smokingQuery,
          getIcon: getSmokingIcon,
          titleKey: "discover.filters.smoking.title",
          descKey: "discover.filters.smoking.description",
        },
        {
          key: "usagePurpose" as DealbreakerKey,
          query: usagePurposesQuery,
          getIcon: getUsagePurposeIcon,
          titleKey: "discover.filters.usagePurpose.title",
          descKey: "discover.filters.usagePurpose.description",
        },
      ].map(({ key, query, titleKey, descKey, getIcon }) => {
        const options = query.data ?? [];
        return (
          <PremiumFilterSection
            key={key}
            title={t(titleKey)}
            description={t(descKey)}
            locked={premiumFiltersLocked}
            onLockedPress={openPremiumPaywall}
            capable={isDealbreakerCapable(filters, DEALBREAKER_FIELDS[key])}
            dealbreakerOn={dealbreakers.includes(DEALBREAKER_FIELDS[key])}
            onToggleDealbreaker={() => toggleDealbreaker(key)}
            testID={`dealbreaker-${DEALBREAKER_FIELDS[key]}`}
          >
            {options.length === 0 ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "400",
                }}
              >
                {query.isLoading
                  ? t("discover.filters.enumLoading")
                  : t("discover.filters.enumUnavailable")}
              </Text>
            ) : (
              <EnumPillGroup
                options={options}
                selected={local?.[key] ?? []}
                onToggle={(opt: any) => toggleEnumValue(key, opt)}
                getIcon={getIcon}
              />
            )}
          </PremiumFilterSection>
        );
      })}

      {/* Evcil hayvan — enum listesi DEĞİL, `hasPets: bool?`. Üç durum tek
          satırda: farketmez (null) / var (true) / yok (false). /api/common/pets
          bu filtrede kullanılmıyor, o liste profilin kendi hayvanları için. */}
      <PremiumFilterSection
        title={t("discover.filters.pets.title")}
        description={t("discover.filters.pets.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={isDealbreakerCapable(filters, DEALBREAKER_FIELDS.pets)}
        dealbreakerOn={dealbreakers.includes(DEALBREAKER_FIELDS.pets)}
        onToggleDealbreaker={() => toggleDealbreaker("pets")}
        testID={`dealbreaker-${DEALBREAKER_FIELDS.pets}`}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { value: null, labelKey: "discover.filters.pets.any" },
            { value: true, labelKey: "discover.filters.pets.has" },
            { value: false, labelKey: "discover.filters.pets.hasNot" },
          ].map((opt) => {
            const selected = (local?.pets ?? null) === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                activeOpacity={1}
                onPress={() => setHasPets(opt.value)}
                style={{
                  ...PILL_STYLE,
                  backgroundColor: pillColors(selected).backgroundColor,
                  borderColor: pillColors(selected).borderColor,
                }}
              >
                <PillIcon icon={getHasPetsIcon(opt.value)} selected={selected} />
                <Text
                  style={{
                    color: pillColors(selected).fg,
                    fontSize: PILL_TEXT_SIZE,
                    fontWeight: "500",
                  }}
                >
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </PremiumFilterSection>

      {hobbiesSection}
      {intentsSection}

      {/* Görünürlük — premium-only, iki ayrı liste. Yukarıdaki filtrelerden
          KAVRAM OLARAK ayrı: onlar "ben kimi göreyim", bu "beni kim görsün".
          Değerler karşı kullanıcının destesini etkiliyor.
          pointerEvents kapatılmıyor (City'den farkı): free kullanıcı satıra
          dokununca paywall açılsın. */}
      <View style={{ opacity: visibilityLocked ? 0.4 : 1 }}>
        <FilterSection
          title={t('discover.filters.visibility.title')}
          description={t('discover.filters.visibility.description')}
          locked={visibilityLocked}
        />

        <VisibilityListLabel
          label={t('discover.filters.visibility.visibleOnlyLabel')}
          count={visibleOnlyDomains.length}
        />
        <DomainSelectRow
          sfIcon={VISIBLE_ONLY_ICON}
          lucideIcon={Eye}
          value={summarizeDomains(visibleOnlyDomains)}
          placeholder={t('discover.filters.visibility.selectUniversities')}
          disabled={!visibleOnlyLocked && universityOptions.length === 0}
          onPress={() => openVisibilityPicker("visibleOnly")}
          onClear={() => clearVisibilityList("visibleOnlyToUniversityDomains")}
        />

        <VisibilityListLabel
          label={t('discover.filters.visibility.hiddenFromLabel')}
          count={hiddenFromDomains.length}
          marginTop={18}
        />
        <DomainSelectRow
          sfIcon={HIDDEN_FROM_ICON}
          lucideIcon={EyeOff}
          value={summarizeDomains(hiddenFromDomains)}
          placeholder={t('discover.filters.visibility.selectUniversities')}
          disabled={!hiddenFromLocked && universityOptions.length === 0}
          onPress={() => openVisibilityPicker("hiddenFrom")}
          onClear={() => clearVisibilityList("hiddenFromUniversityDomains")}
        />

        {visibilityOverlap ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: "500",
              marginTop: 10,
            }}
          >
            {t('discover.filters.visibility.overlapWarning')}
          </Text>
        ) : null}
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

      {/* Tek üniversite picker'ı iki listeye de hizmet ediyor; hangi listenin
          hedeflendiğini visibilityPicker tutuyor (kapanış animasyonu boyunca
          da sabit kalır — bkz. state tanımındaki not). */}
      <UniversityPickerModal
        visible={visibilityPickerVisible}
        onClose={() => setVisibilityPickerVisible(false)}
        title={
          visibilityPicker === "preferred"
            ? t('discover.universityPicker.preferredTitle')
            : visibilityPicker === "hiddenFrom"
              ? t('discover.universityPicker.hiddenFromTitle')
              : t('discover.universityPicker.visibleOnlyTitle')
        }
        items={universityOptions}
        initialSelectedValues={
          visibilityPicker === "preferred"
            ? local?.preferredUniversityDomain
              ? [local.preferredUniversityDomain]
              : []
            : visibilityPicker === "hiddenFrom"
              ? hiddenFromDomains
              : visibleOnlyDomains
        }
        // "Ben kimi göreyim" tek üniversite; görünürlük listeleri çoklu.
        singleSelect={visibilityPicker === "preferred"}
        maxLimit={MAX_VISIBILITY_DOMAINS}
        limitMsg={t('discover.universityPicker.limitMsg', {
          // `count` DEĞİL: i18next'te count çoğul çözümlemesini tetikler
          // (limitMsg_other arar) ve anahtar bulunamaz.
          max: MAX_VISIBILITY_DOMAINS,
        })}
        onConfirm={onVisibilityConfirm}
      />
    </AppModal>
  );
}
