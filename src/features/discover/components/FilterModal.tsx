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
  Easing,
} from "react-native-reanimated";
import {
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
  PauseCircle,
  Languages,
  type LucideIcon,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import HobbyIcon from "@/shared/components/HobbyIcon";
import AppModal from "@/shared/components/AppModal";
import CityPickerModal from "@/features/discover/components/CityPickerModal";
import UniversityPickerModal from "@/features/discover/components/UniversityPickerModal";
import LanguagePickerModal from "@/shared/components/LanguagePickerModal";
import {
  useCities,
  useUniversities,
  useHobbies,
  useRelationshipIntents,
  useZodiacs,
  useSmokingStatuses,
  usePets,
  useAlcoholUsages,
  useReligiousViews,
  useLanguages,
  normalizeDomain,
  resolveLocalized,
} from "@/shared/queries/commonQueries";
import { getRelationshipIntentIcon } from "@/shared/constants/relationshipIntent";
import {
  getZodiacIcon,
  getSmokingIcon,
  getHasPetsIcon,
  getPetIcon,
  getAlcoholIcon,
  getYearOfStudyIcon,
  getReligiousViewIcon,
  getLanguageIcon,
  sortZodiacOptions,
} from "@/shared/constants/filterEnumIcons";
import { showInfoToast } from "@/shared/services/toaster";
import uiBus from "@/shared/services/uiBus";
import {
  DEFAULT_AGE_RANGE,
  DISTANCE_RANGE_KM,
  MAX_PREFERRED_HOBBIES,
  MAX_UNIVERSITY_DOMAINS,
  resolveDistanceBounds,
} from "@/shared/constants/limits";
import { colors, ink, isLight } from "../../../shared/theme/colors";

// NOT: slider'ın sınırları ARTIK SABİT DEĞİL. Taban ve seçilebilir tavan
// `GET /api/swipe/Filters` yanıtından geliyor (minSelectableDistanceKm /
// maxSelectableDistanceKm — free 75, premium 150) ve aşağıda prop olarak
// aktarılıyor; DISTANCE_RANGE_KM yalnız yanıt gelmediğinde fallback.
// Sunucu config'i değişirse FE güncellemesi gerekmiyor (sözleşme §9).
//
// Görsel aralık ile seçilebilir aralık AYRI: halkalar premium tavanına kadar
// çiziliyor, tier tavanının üstündekiler soluk — free kullanıcı erişemediği
// aralığı görüyor. Backend tavanın üstünü 400 ile reddetmiyor, sessizce
// kırpıyor; cap'i FE zorlamazsa kullanıcı 150 km seçtiğini sanıp 75 km'lik
// deste görür. Mesafe artık KATI filtre olduğu için bu yalan eskisinden
// pahalı: yarıçap dışı profiller hiç gösterilmiyor.

// Picker hedefi → local state alanı. Üç üniversite listesi de aynı bileşenden
// besleniyor; hangi alana yazılacağı tek yerde tanımlı olsun.
const DOMAIN_FIELD_BY_TARGET = {
  preferred: "preferredUniversityDomains",
  visibleOnly: "visibleOnlyToUniversityDomains",
  hiddenFrom: "hiddenFromUniversityDomains",
} as const;

type DomainTarget = keyof typeof DOMAIN_FIELD_BY_TARGET;
type DomainField = (typeof DOMAIN_FIELD_BY_TARGET)[DomainTarget];

// SelectRow props'u any olduğu için isimler orada denetlenmiyor; SFSymbol
// olarak burada sabitleyip yazım hatasını compile-time'da yakalıyoruz.
const VISIBLE_ONLY_ICON: SFSymbol = "eye.fill";
const HIDDEN_FROM_ICON: SFSymbol = "eye.slash.fill";
const UNIVERSITY_ICON: SFSymbol = "graduationcap.fill";
// Dil satırının ikonu — pill'lerdekiyle (getLanguageIcon) aynı sembol.
const LANGUAGE_ICON: SFSymbol = "character.bubble";

// Üniversite listeleri backend'de trim + lowercase + tekilleştirme görüyor.
// Aynı kuralı okurken de uygula: seçili gösterimi ve overlap kontrolü
// picker'daki normalize domain'lerle birebir eşleşsin.
const toDomainList = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    const domain = normalizeDomain(value);
    if (domain) seen.add(domain);
  }
  return Array.from(seen).slice(0, MAX_UNIVERSITY_DOMAINS);
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

// "Ben kimi göreyim" üniversite filtresi. premiumOnlyFields PUT adını taşıyor —
// GET'teki `preferred*` adını değil. Alan çoğullaşırken (`universityDomain` →
// `universityDomains`) backend'in bu listede hangi adı döndüreceği garanti
// değil, o yüzden İKİSİNDEN biri yeterli: tekil adı hâlâ bildiren bir sunucuda
// da gate düşmesin (düşerse free kullanıcı seçim yapıp 403 yerdi).
const isUniversityPremiumGated = (f: any) =>
  isFieldPremiumGated(f, "UniversityDomains") ||
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
//
// `Pets` biti TEK: hem legacy `hasPets` hem spesifik `pets` tür listesi onun
// altında. Kullanıcı açısından ikisi de "evcil hayvan tercihi" — ayrı iki
// anahtar kafa karıştırırdı (backend de tek bit tutuyor).
const DEALBREAKER_FIELDS = {
  height: "Height",
  yearOfStudy: "YearOfStudy",
  zodiac: "Zodiac",
  smoking: "Smoking",
  alcohol: "Alcohol",
  pets: "Pets",
  // `UsagePurpose` KALDIRILDI: alan üründen çıktı ve dealbreakerCapableFields
  // artık onu bildirmiyor. Backend listede gelirse sessizce yok sayıyor (400
  // dönmüyor), ama göndermenin de bir karşılığı yok.
  // 2026-08-17 sözleşmesiyle geldi. Alan adları GET/PUT'takinden farklı
  // (`spokenLanguages` → "Language", `religiousViews` → "Religion") —
  // dealbreaker listesi kendi ad uzayını kullanıyor.
  language: "Language",
  religion: "Religion",
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

const DEALBREAKER_KEY_BY_FIELD = Object.fromEntries(
  Object.entries(DEALBREAKER_FIELDS).map(([key, field]) => [field, key]),
) as Record<string, DealbreakerKey>;

// Dealbreaker yalnızca DOLU bir filtre için anlamlı: seçim yokken "bu filtreye
// uymayanları hiç gösterme" hiçbir şeyi daraltmıyor. Ama anahtar boş filtrede de
// AÇIK geliyordu (migration mevcut kullanıcılarda altı alanı da işaretlemiş) —
// kullanıcı ilk pill'e dokunduğu anda filtre habersizce katı hale geliyor, kuyruk
// sessizce boşalabiliyordu. Katılık opt-in kalsın: değeri olmayan alanın işareti
// server response'u local state'e inerken düşürülüyor (bkz. activeDealbreakers),
// yani anahtar KAPALI başlıyor. Anahtarın kendisi her zaman çiziliyor.
const hasDealbreakerValue = (f: any, key: DealbreakerKey) => {
  if (!f) return false;
  switch (key) {
    // İki uçtan biri bile serbestse filtre uygulanıyor demektir.
    case "height":
      return f.heightMin != null || f.heightMax != null;
    // Tek bit, iki alan: tür listesi (yeni) ya da legacy `hasPets` bool?.
    // İkisinden biri doluysa filtre uygulanıyor.
    case "pets":
      return (f.pets?.length ?? 0) > 0 || typeof f.hasPets === "boolean";
    // Kalanların hepsi local state'te dizi (sınıf/burç/sigara/alkol).
    default:
      return (f[key]?.length ?? 0) > 0;
  }
};

// Premium filtrelerin GET/PUT alan adları. Bu alt grupta GET ve PUT adları AYNI
// (şehir/bölüm/üniversitedeki preferredCity→city tarzı sapma yok). Local state
// kendi anahtarlarını kullanıyor, API adı yalnızca burada ve payload'da geçiyor.
const FILTER_FIELD = {
  heightMin: "heightMin",
  heightMax: "heightMax",
  zodiac: "zodiacSigns",
  smoking: "smokingStatuses",
  alcohol: "alcoholUsages",
  // Tür bazlı evcil hayvan tercihi (PetType enum listesi) — OR semantiği:
  // ["Cat","Dog"] = "kedisi VEYA köpeği olan".
  pets: "pets",
  // Legacy 3 durumlu bool (null/true/false). KALDIRILMADI ama spesifik seçim
  // onu eziyor: `pets` doluyken backend `hasPets`i null'a çekip yok sayıyor
  // (aksi halde "kedisi olsun" + "hayvanı olmasın" çelişkisi desteyi sessizce
  // boşaltırdı). UI zaten tek seçim grubu kullanıyor, ikisi aynı anda dolamaz.
  hasPets: "hasPets",
  yearOfStudy: "yearsOfStudy",
  // Dil — OR semantiği: ["English","German"] = "İngilizce VEYA Almanca bilen".
  // Adayın listesinden EN AZ BİRİ eşleşiyorsa geçer; dilini hiç belirtmemiş
  // aday elenir (alkol/sigara ile aynı sınıf).
  language: "spokenLanguages",
  // Dini görüş — seçilen görüşlerdeki adaylar gelir, belirtmemişler elenir.
  religion: "religiousViews",
} as const;

// Filtre listesinde GÖSTERİLMEYEN pet türleri. Bunlar profil ekranı için
// anlamlı ("benim hayvanım yok" / "alerjim var"), filtre için değil:
// "hayvanı olmayanları göster" zaten legacy `hasPets: false` moduyla yapılıyor.
const FILTER_HIDDEN_PETS = new Set(["None", "Allergic", "Other"]);

// Filtrede GÖSTERİLMEYEN dini görüş. `PreferNotToSay` profil için anlamlı bir
// cevap ("belirtmek istemiyorum") ama filtre olarak anlamsız: backend bu filtre
// açıkken görüşünü paylaşmayan adayları zaten eliyor, yani "belirtmek
// istemeyenleri göster" seçeneği hiçbir zaman sonuç üretmezdi.
// FILTER_HIDDEN_PETS ile aynı desen.
const FILTER_HIDDEN_RELIGIOUS_VIEWS = new Set(["PreferNotToSay"]);

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

// Sınıf filtresi ASİMETRİK: PUT'a int listesi gönderiyoruz (backend kabul
// ediyor), ama yanıtta enumName string'i geri geliyor — gözlemlenen wire trafiği
// `[4,2]` gönderildi → `["Second","Fourth"]` döndü. Ham parseInt("Second") NaN
// olduğu için seçim okurken sessizce boşalıyordu: kullanıcı tercihi hiç
// kaydolmamış sanıyordu (kayıt aslında BAŞARILIYDI).
//
// Ad→int eşlemesi /api/common/classes'ın kanonik listesi (0 = Preparatory,
// 1..6 = First..Sixth). Endpoint ÇAĞRILMIYOR: toLocalState senkron ve modal
// açılışında çalışıyor, liste henüz gelmemişken çeviremez — seçim yine
// kaybolurdu (enum pill'lerindeki int'leri korumakla aynı gerekçe).
const YEAR_OF_STUDY_ENUM_TO_INT: Record<string, number> = {
  preparatory: 0,
  prep: 0,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
};

// Tek bir sınıf değerini int'e indir. Üç biçim de karşılanıyor: int (bizim
// gönderdiğimiz), enumName string'i (backend'in döndürdüğü), { enumName | id }
// objesi (diğer enum alanlarının biçimi — sınıfta görülmedi, ucuz sigorta).
const toYearValue = (raw: any): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const key = raw.trim().toLowerCase();
    if (!key) return null;
    const mapped = YEAR_OF_STUDY_ENUM_TO_INT[key];
    if (mapped != null) return mapped;
    // "1st Year" / "3" gibi sayı taşıyan biçimler de kurtarılsın.
    const n = parseInt(key, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (raw && typeof raw === "object") {
    if (raw.enumName != null) return toYearValue(raw.enumName);
    if (typeof raw.id === "number") return raw.id;
  }
  return null;
};

const toYearList = (raw: any): number[] => {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    const n = toYearValue(value);
    if (n != null && !out.includes(n)) out.push(n);
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

// Server'dan gelen dealbreaker listesini ekrana indirirken filtresi boş olanları
// düşür — anahtar kapalı başlasın. Yalnızca OKUMA tarafında uygulanıyor: bundan
// sonrası kullanıcının kendi tercihi, boş bir filtrenin anahtarını bilerek açarsa
// o kayıt olur (bkz. Apply).
const activeDealbreakers = (f: any): string[] =>
  toDealbreakerList(f?.dealbreakers).filter((name) =>
    hasDealbreakerValue(f, DEALBREAKER_KEY_BY_FIELD[name]),
  );

// Backend Filters, hiç filtre kaydetmemiş kullanıcıda "sınırsız" sentinel'i
// (ör. 20000) dönebiliyor. Clamp'siz girerse gri dolgu dairesi pct>1 ile
// binlerce px'e büyüyüp tüm modalı kaplıyor — okurken tier'ın aralığına sabitle.
const clampKm = (raw: any, minKm: number, maxKm: number) => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return minKm;
  return Math.min(maxKm, Math.max(minKm, n));
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

const kmToRadius = (km: number, minKm: number, visualMaxKm: number) => {
  // Sınırlar backend'den geliyor; bozuk/eksik yanıtta aralık sıfıra düşerse
  // bölme NaN üretip daireyi yok ederdi.
  const visualRange = Math.max(1, visualMaxKm - minKm);
  const pct = (km - minKm) / visualRange;
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
  minKm,
  visualMaxKm,
}: {
  userMaxKm: number;
  minKm: number;
  visualMaxKm: number;
}) {
  const rings: number[] = [];
  for (let km = RING_KM_STEP; km <= visualMaxKm; km += RING_KM_STEP) {
    if (km > minKm) rings.push(km);
  }

  return (
    <Svg
      pointerEvents="none"
      width={CIRCLE_SIZE}
      height={CIRCLE_SIZE}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {rings.map((km) => {
        const r = kmToRadius(km, minKm, visualMaxKm);
        return (
          <Circle
            key={km}
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={r}
            // Cap üstündeki halkalar (free'de 75+) soluk — erişilemeyen premium
            // aralığı görsel olarak ayırır.
            stroke={km > userMaxKm ? ink(0.18) : ink(0.5)}
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

function DistanceCircle({
  value,
  onChange,
  userMaxKm,
  minKm,
  visualMaxKm,
  disabled,
}: any) {
  const visualRange = Math.max(1, visualMaxKm - minKm);

  const valueSV = useSharedValue(value || minKm);
  const shakeSV = useSharedValue(0);
  const [displayValue, setDisplayValue] = useState(value || minKm);
  const lastTickRef = useRef(value || minKm);
  const shakeFiredRef = useRef(false);

  const valueScale = useRef(new RNAnimated.Value(1)).current;
  const shrinkTimerRef = useRef<any>(null);
  const isScaledUpRef = useRef(false);

  useEffect(() => {
    const v = value || minKm;
    valueSV.value = v;
    setDisplayValue(v);
    lastTickRef.current = v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minKm]);

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
        // "Mesafe sınırı olmasın" açıkken dial PASİF ama GÖRÜNÜR: değer
        // saklanıyor ve anahtar kapatılınca ona dönülecek — gizlersek kullanıcı
        // neye döneceğini bilmez. Kapatma sarmalayıcı View'ın pointerEvents'ine
        // BIRAKILMIYOR: gesture-handler onu her platformda tutarlı okumuyor,
        // tek güvenilir yer jestin kendisi.
        .enabled(!disabled)
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
            minKm +
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
    [userMaxKm, minKm, visualRange, disabled],
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
    const pct = (valueSV.value - minKm) / visualRange;
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

  // "Mesafe sınırı olmasın" anahtarı dial'ı soluklaştırıyor; geçiş ANİ OLMAMALI
  // — anahtarın kendi thumb animasyonu ~200ms sürüyor, dial bir anda zıplarsa
  // iki hareket birbirini tutmuyor. `disabled` deps'te: değişince worklet
  // yeniden koşuyor ve withTiming o anki opaklıktan devam ediyor.
  const dimStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(disabled ? 0.4 : 1, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      }),
    }),
    [disabled],
  );

  return (
    <Animated.View
      style={[
        {
          alignItems: "center",
          marginTop: -4,
          marginBottom: -4,
        },
        dimStyle,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={{
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            position: "relative",
          }}
        >
          {/* Concentric ring marks (25, 50 ... visualMaxKm) */}
          <RingMarks
            userMaxKm={userMaxKm}
            minKm={minKm}
            visualMaxKm={visualMaxKm}
          />

          {/* Aktif (dolu) yarıçap */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                // Açık modda hairlineMuted (siyah %26) + %40 kenar bu boyutta
                // ağır bir disk oluşturuyor; açıkta bir tık soluklaştırıyoruz.
                // Koyu mod token'ın kendisinde kalıyor.
                position: "absolute",
                backgroundColor: isLight() ? ink(0.17) : colors.hairlineMuted,
                borderWidth: 1,
                borderColor: isLight() ? ink(0.28) : ink(0.4),
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
    </Animated.View>
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
        size={PILL_EMOJI_SIZE}
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
        borderBottomColor: colors.hairlineSoft,
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
// Bölümler arası boşluk da EditProfileForm ile aynı: orada dış sarmalayıcının
// marginTop'u (28) ile başlık bloğunun marginTop'u (12) toplanıp 40 ediyor.
// Burada tek bir View olduğu için o toplam doğrudan yazılı — iki ekranın
// ritmi birebir aynı olsun.
// Başlıkta kilit ikonu YOK (kasıtlı): kilitli bölüm zaten soluk (opacity 0.4)
// + dokunuşu paywall'a gidiyor, başlıktaki ikon aynı şeyi üçüncü kez söylüyor
// ve premium grubunda başlık başına bir kilit sıralanınca ekran kilit ikonu
// tarlasına dönüyordu. Kilit sinyali görsel katmanda kalsın.
function FilterSection({ title, description, marginTop = 40 }: any) {
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
// Kilit ikonu FilterSection'la aynı gerekçeyle YOK: kilit hâli soluk bölüm +
// paywall dokunuşuyla zaten anlatılıyor.
function PremiumGroupHeader({ title, description }: any) {
  return (
    // Üstündeki boşluk FilterSection'ın varsayılanıyla aynı (40): grup başlığı
    // bir bölümden daha zayıf ayrılıyormuş gibi görünmesin.
    <View style={{ marginTop: 40 }}>
      <View
        style={{
          height: 0.5,
          backgroundColor: colors.hairlineSoft,
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
        {/* Başlıkta İKON YOK: ne kilit ne premium ateşi. İkisi de denendi,
            ikisi de kaldırıldı — başlık yalın kalsın. */}
        {/* Grup başlığı tek tek filtre başlıklarından (FilterSection, 20px)
            bir kademe büyük — hiyerarşi göz ile ayrılabilsin. */}
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: "700" }}>
          {title}
        </Text>
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
        borderColor: colors.hairline,
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
        trackColor={{ false: colors.hairlineStrong, true: colors.errorStrong }}
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

// Hobi pilleri emoji kullanıyor (bkz. HobbyIcon) ve emojinin satır kutusu
// fontSize'ın 1.25 katı. Aynı size verildiğinde SFIcon 20px'lik kutu üretirken
// emoji 25px üretiyor ve hobi pili burç/sigara pillerinden yüksek çıkıyordu.
// Emojiyi kutusu tam PILL_ICON_SIZE olacak boyuta indiriyoruz.
const PILL_EMOJI_SIZE = Math.round(PILL_ICON_SIZE / 1.25);

// Pill'in seçili/seçilmemiş rengi — ikon ve metin aynı rengi alır.
const pillColors = (selected: boolean) => ({
  backgroundColor: selected ? colors.inverseSurface : "transparent",
  borderColor: selected ? colors.inverseSurface : colors.hairline,
  fg: selected ? colors.onInverseSurface : colors.textSecondary,
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
// Tutamakların track uçlarından içeri çekildiği pay. Serbest uç (null) kendi
// ucunda park ettiği için "Farketmez"de iki tutamak da tam kenara yapışıyordu;
// bu payla ikisi de şeridin biraz daha ortasında duruyor, uçları da nefes
// alıyor. Değer eşlemesi DEĞİŞMİYOR (0% hâlâ 120cm, 100% hâlâ 230cm) — sadece
// piksel yolu daralıyor. Gesture ve render AYNI payı kullanmak ZORUNDA, yoksa
// tutamak parmağın altından kayar.
const HEIGHT_EDGE_INSET = 16;

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
          // Tutamak merkezleri track'in THUMB/2 + kenar payı içinden başlıyor
          // (uçlarda taşmasınlar + kenara yapışmasınlar diye) — dokunma da aynı
          // daraltılmış eksene göre.
          const usable =
            widthSV.value - HEIGHT_THUMB - HEIGHT_EDGE_INSET * 2;
          if (usable <= 0) return;
          const pct = Math.max(
            0,
            Math.min(
              1,
              (e.x - HEIGHT_THUMB / 2 - HEIGHT_EDGE_INSET) / usable,
            ),
          );
          const cm = HEIGHT_RANGE_CM.min + pct * span;
          activeSV.value =
            Math.abs(cm - minSV.value) <= Math.abs(cm - maxSV.value)
              ? "min"
              : "max";
        })
        .onUpdate((e) => {
          const usable =
            widthSV.value - HEIGHT_THUMB - HEIGHT_EDGE_INSET * 2;
          if (usable <= 0) return;
          const pct = Math.max(
            0,
            Math.min(
              1,
              (e.x - HEIGHT_THUMB / 2 - HEIGHT_EDGE_INSET) / usable,
            ),
          );
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
              backgroundColor: ink(0.12),
            }}
          />
          {/* Tutamaklar bu daraltılmış katmanda konumlanıyor: yüzdeler track
              genişliği - THUMB - 2*kenar payı üzerinden hesaplandığı için
              uçtaki tutamak taşmıyor VE track kenarına yapışmıyor. Dolu aralık
              çubuğu da aynı katmanda, yüzdeleri kendiliğinden uyuyor. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: HEIGHT_THUMB / 2 + HEIGHT_EDGE_INSET,
              right: HEIGHT_THUMB / 2 + HEIGHT_EDGE_INSET,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: `${minPct * 100}%`,
                width: `${(maxPct - minPct) * 100}%`,
                height: HEIGHT_TRACK,
                borderRadius: HEIGHT_TRACK / 2,
                backgroundColor: ink(0.45),
              }}
            />
            {[minPct, maxPct].map((pct, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: `${pct * 100}%`,
                  marginLeft: -HEIGHT_THUMB / 2,
                  width: HEIGHT_THUMB,
                  height: HEIGHT_THUMB,
                  borderRadius: HEIGHT_THUMB / 2,
                  backgroundColor: colors.inverseSurface,
                }}
              />
            ))}
          </View>
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

// Üniversite listesinin etiketi + doluluk sayacı. Limit 3'e indiği için sayaç
// artık kritik: picker sınıra gelince uyarıyor ama kullanıcı kaç hakkı kaldığını
// ancak burada görüyor. Sayaç yalnızca seçim varken çıkıyor — boş listede "0/3"
// gereksiz gürültü.
// `label` opsiyoneldir: üniversite bölümü yalnızca sayaç gösteriyor, o yüzden
// etiket yokken satır sağa yaslanır, sayaç da yoksa hiç render edilmez.
function VisibilityListLabel({ label, count, marginTop = 0 }: any) {
  if (!label && !(count > 0)) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: label ? "space-between" : "flex-end",
        gap: 12,
        marginTop,
        marginBottom: 8,
      }}
    >
      {label ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
      ) : null}
      {count > 0 ? (
        <Text
          style={{
            color: count >= MAX_UNIVERSITY_DOMAINS
              ? colors.text
              : colors.textMuted,
            fontSize: 13,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          {count}/{MAX_UNIVERSITY_DOMAINS}
        </Text>
      ) : null}
    </View>
  );
}

// Çoklu seçim picker'ını açan satır. Şehir satırıyla aynı pill görünümü; farkı
// seçimi özetlemesi ("İTÜ +2", "3 dil seçildi") ve X'in listeyi tamamen
// temizlemesi. Üç üniversite listesi ve dil filtresi bunu paylaşıyor.
function SelectRow({
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
        borderColor: colors.hairline,
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

  // Tier kararı prop'tan gelir; prop'un kaynağı DiscoverScreen'deki kanonik
  // premium (bkz. features/profile/premiumTier). Bu bileşen bilerek "saf":
  // redux'a kendisi bağlanmıyor, testlerde tek başına render edilebiliyor.
  //
  // ÖNCESİ `prop === true || filters?.isPremium === true` idi. O OR, prop'un
  // kaynağı bayat `/stats` cevabıyken yazılmıştı; kaynak düzeldiği için artık
  // gereksiz ve ZARARLI: tek yönlü olduğundan premium bitince `/filters`
  // yanıtındaki eski `isPremium:true` kilitleri açık tutuyordu.
  //
  // `??` bilinçli: prop VERİLMEMİŞSE (bileşen tek başına kullanılırsa) yanıtın
  // kendi alanına düşülür, ama açıkça `false` gelen prop artık kazanır.
  const isPremium = isPremiumProp ?? filters?.isPremium === true;

  // Mesafe slider'ının sınırları — KAYNAK BACKEND (`/api/swipe/Filters` →
  // minSelectableDistanceKm / maxSelectableDistanceKm; free 75, premium 150).
  // Hard-code YOK: sunucu config'i değişirse FE'ye dokunmadan yeni sınır gelir.
  // Alanlar yoksa tier sabitlerine düşülür (bkz. resolveDistanceBounds).
  //
  // `filters` premium satın alma sonrası invalidate ediliyor; aşağıdaki
  // useEffect local state'i tazeliyor ve tavan aynı oturumda 75 → 150'ye
  // çıkıyor.
  const { minKm: minSelectableKm, maxKm: tierMaxKm } = resolveDistanceBounds(
    filters,
    isPremium,
  );
  // Halkaların GÖRSEL tavanı: free kullanıcı da erişemediği premium aralığı
  // (soluk halkalar) görsün diye tier tavanından bağımsız. Premium tavanını
  // free kullanıcıya backend söylemiyor — o yüzden burada sabit fallback.
  const visualMaxKm = Math.max(tierMaxKm, DISTANCE_RANGE_KM.max);

  const interestedInOptions = useMemo(() => [
    { label: t('discover.filters.interestedIn.men'), value: 0, sf: "person.fill" as SFSymbol, lucide: User },
    { label: t('discover.filters.interestedIn.women'), value: 1, sf: "person.fill" as SFSymbol, lucide: UserRound },
    { label: t('discover.filters.interestedIn.nonBinary'), value: 2, sf: "person.2.fill" as SFSymbol, lucide: Users },
  ], [t]);

  // Premium-only filtre alanlarını free kullanıcıda temizle. Backend bu
  // alanlardan HERHANGİ biri dolu gelirse isteğin TAMAMINI 403 + PREMIUM_FILTERS
  // ile reddediyor — premium'dan düşen kullanıcının kayıtlı şehri payload'da
  // kalırsa mesafe/cinsiyet güncellemesi bile kaydedilemiyordu.
  //
  // YALNIZ PAYLOAD İÇİN. Okuma tarafında (toLocalState) ÇALIŞTIRMA: premium'dan
  // düşen kullanıcı kayıtlı seçimlerini ekranda görmeye devam etmeli
  // ("duraklatıldı" durumu). Backend bu alanları free kullanıcıda zaten yazmıyor,
  // yani sunucudaki kayıt korunuyor ve premium dönünce aynen geri geliyor —
  // ekranda boş göstermek "filtrelerim silinmiş" yanılgısı üretiyordu.
  // Local shape'te dolu premium filtre var mı? İki yerde okunuyor: payload
  // temizliği (aşağıda) ve "duraklatıldı" şeridi (pausedPremiumFilters). Tek
  // tanım, çünkü ikisi aynı soruyu soruyor — "bu kullanıcının kaybettiği bir
  // şey var mı".
  const hasPremiumValue = (f: any) => {
    if (!f) return false;
    // Hobiler gate'i backend'in premiumOnlyFields listesine bağlı; karar hep
    // server state'inden (filters) okunuyor ki local kopyada alan eksikse de
    // aynı sonucu versin.
    const hobbiesGated = isHobbiesPremiumGated(filters);
    const intentsGated = isIntentsPremiumGated(filters);
    const universityGated = isUniversityPremiumGated(filters);
    const visibleOnlyGated = isVisibleOnlyPremiumGated(filters);
    const hiddenFromGated = isHiddenFromPremiumGated(filters);
    return (
      f.preferredCity != null ||
      (universityGated && (f.preferredUniversityDomains?.length ?? 0) > 0) ||
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
      (f.alcohol?.length ?? 0) > 0 ||
      (f.pets?.length ?? 0) > 0 ||
      f.hasPets != null ||
      (f.yearOfStudy?.length ?? 0) > 0 ||
      (f.language?.length ?? 0) > 0 ||
      (f.religion?.length ?? 0) > 0 ||
      (f.dealbreakers?.length ?? 0) > 0
    );
  };

  // Payload temizliği: free kullanıcının gövdesinde dolu premium alan kalmasın.
  // Yalnız Apply'da çalışır (bkz. yukarıdaki not) — ekranda gösterilen state'e
  // dokunmaz.
  const sanitizeForTier = (f: any) => {
    if (isPremium || !f) return f;
    if (!hasPremiumValue(f)) return f;
    const universityGated = isUniversityPremiumGated(filters);
    const visibleOnlyGated = isVisibleOnlyPremiumGated(filters);
    const hiddenFromGated = isHiddenFromPremiumGated(filters);
    // Görünürlük listeleri overwrite semantiğiyle yazılıyor: free kullanıcıda boş
    // dizi göndermek premium döneminden kalan kısıtlamayı da temizler — istenen
    // davranış bu, aksi halde kullanıcı düşürdüğü premium'un gizlilik kuralına
    // kilitli kalırdı.
    return {
      ...f,
      preferredCity: null,
      ...(universityGated ? { preferredUniversityDomains: [] } : {}),
      ...(visibleOnlyGated ? { visibleOnlyToUniversityDomains: [] } : {}),
      ...(hiddenFromGated ? { hiddenFromUniversityDomains: [] } : {}),
      preferredHobbies: [],
      relationshipIntents: [],
      heightMin: null,
      heightMax: null,
      zodiac: [],
      smoking: [],
      alcohol: [],
      // Evcil hayvan iki alan: tür listesi boşalır, legacy bool null'a döner.
      pets: [],
      hasPets: null,
      yearOfStudy: [],
      language: [],
      religion: [],
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
    const normalized = {
      ...f,
      interestedIn: normalizeInterestedIn(f.interestedIn),
      // Görünürlük listeleri: backend boş dizi döner (null değil) ama eski
      // response'lara / eksik alana karşı da normalize et.
      visibleOnlyToUniversityDomains: toDomainList(
        f.visibleOnlyToUniversityDomains,
      ),
      hiddenFromUniversityDomains: toDomainList(f.hiddenFromUniversityDomains),
      // "Ben kimi göreyim" üniversite tercihi — artık ÇOKLU (max 3). GET adı
      // `preferredUniversityDomains`, PUT adı `universityDomains`.
      // Tekil `preferredUniversityDomain` deprecated ama backend hâlâ döndürüyor:
      // çoğul alan gelmezse ondan besleniyoruz ki eski kayıtlı tercih kaybolmasın.
      preferredUniversityDomains: toDomainList(
        Array.isArray(f.preferredUniversityDomains)
          ? f.preferredUniversityDomains
          : f.preferredUniversityDomain
            ? [f.preferredUniversityDomain]
            : [],
      ),
      // Karşıda aranan hobiler: enumName string listesi (premium-only).
      preferredHobbies: toHobbyList(f.preferredHobbies),
      // Karşıda aranan ilişki niyetleri: enumName string listesi (premium-only).
      relationshipIntents: toIntentList(f.relationshipIntents),
      // Dealbreaker'lı premium filtreler.
      heightMin: clampHeight(f[FILTER_FIELD.heightMin]),
      heightMax: clampHeight(f[FILTER_FIELD.heightMax]),
      zodiac: toEnumList(f[FILTER_FIELD.zodiac]),
      smoking: toEnumList(f[FILTER_FIELD.smoking]),
      alcohol: toEnumList(f[FILTER_FIELD.alcohol]),
      // Tür bazlı seçim (PetType listesi). Doluysa legacy `hasPets` yok
      // sayılıyor — backend de öyle yapıyor, aşağıda tekrar düşürülüyor.
      pets: toEnumList(f[FILTER_FIELD.pets]),
      // Legacy 3 durumlu bool: null = farketmez, true = sahip olanlar,
      // false = olmayanlar. Tür seçimi varken null'a çekiliyor ki iki mod
      // aynı anda görünmesin (bkz. petMode).
      hasPets:
        typeof f[FILTER_FIELD.hasPets] === "boolean"
          ? f[FILTER_FIELD.hasPets]
          : null,
      // enumName ("Second") ya da int (2) — ikisi de kabul (bkz. toYearList).
      yearOfStudy: toYearList(f[FILTER_FIELD.yearOfStudy]),
      // Dil ve dini görüş — diğer enum çoklu seçimleriyle aynı biçim
      // belirsizliği (string / { enumName } / int), aynı normalize.
      language: toEnumList(f[FILTER_FIELD.language]),
      religion: toEnumList(f[FILTER_FIELD.religion]),
      // Hangi filtreler "olmazsa olmaz" işaretli. Mevcut kullanıcılarda
      // migration altısını da işaretlemiş — dolu filtrede bu bilinçli (eski
      // davranış "hepsi katı" idi), boş filtrede ise aşağıda eleniyor.
      dealbreakers: toDealbreakerList(f.dealbreakers),
      // Clamp'lenmiş değer Apply payload'ına da gider — kullanıcı slider'a hiç
      // dokunmadan kaydetse bile backend'e aralık dışı bir değer geri yazılmaz
      // (Range(5,150) dışı 400 alır).
      //
      // Aralık BACKEND'DEN: mevcut kullanıcıların DB değerleri migrate
      // EDİLMEDİ, okuma sırasında aralığa çekiliyor (1-4 km → 5, 300 km free →
      // 75). `/Filters` zaten düzeltilmiş `maxDistance` döndürüyor; buradaki
      // clamp bayat cache'e karşı ikinci hat.
      maxDistance: clampKm(f.maxDistance, minSelectableKm, tierMaxKm),
      // "Mesafe sınırı olmasın" — kalıcı anahtar, `maxDistance`tan BAĞIMSIZ.
      // Yukarıdaki clamp anahtar açıkken de çalışıyor: değer saklanıyor ve
      // anahtar kapatılınca aynen geri yükleniyor (sözleşme §1).
      //
      // VARSAYILAN KAPALI: alan hiç gelmemişse (anahtarı taşımayan yanıt ya da
      // kullanıcının hiç dokunmadığı kayıt) anahtar KAPALI başlıyor — yani
      // seçilen yarıçap uygulanır. Açık varsayılan, mesafeyi hiç umursamayan
      // bir desteyi kullanıcının haberi olmadan norm yapıyordu; sınırı kaldırma
      // artık bilinçli bir tercih (boş destede DiscoverScreen'deki "Mesafe
      // sınırını kaldır" butonu da aynı anahtarı açıyor).
      // AÇIKÇA `true` gelen kayıt elbette açık kalır.
      ignoreDistanceFilter: f.ignoreDistanceFilter === true,
    };
    // NOT: sanitizeForTier BURADA çağrılmıyor — free kullanıcı da kayıtlı
    // premium seçimlerini görsün (bkz. pausedPremiumFilters). Temizlik yalnız
    // Apply'da, payload üretilirken yapılıyor.
    return {
      ...normalized,
      // Çelişkiyi okurken kes: backend `pets` doluyken `hasPets`i zaten yok
      // sayıyor, ama ikisi de dolu gelirse (eski kayıt + yeni seçim) ekranda
      // iki mod birden seçili görünürdü. Tür listesi kazanır.
      hasPets: normalized.pets.length > 0 ? null : normalized.hasPets,
      // Anahtar kapalı başlasın: değeri olmayan filtrenin işareti düşürülüyor.
      // activeDealbreakers normalize EDİLMİŞ shape'i okuyor (local anahtarlar),
      // o yüzden burada — spread'in içinde değil.
      dealbreakers: activeDealbreakers(normalized),
    };
  };

  const [local, setLocal] = useState(() => toLocalState(filters));
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  // Dil listesi 34 değer — pill ızgarası yerine aranabilir picker (profil
  // düzenlemedeki dil seçiciyle aynı bileşen, farklı başlık).
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  // Tek picker instance'ı iki listeye de hizmet ediyor. Açık/kapalı ile hedef
  // liste AYRI tutuluyor: gorhom dismiss animasyonlu (~300ms) ve hedefi tek bir
  // nullable state'te tutarsak kapanış sırasında null'a düşüp başlık diğer
  // listeninkine atlıyor. Hedef kapanış boyunca sabit kalsın.
  const [visibilityPickerVisible, setVisibilityPickerVisible] = useState(false);
  // Üçüncü hedef "preferred" = "ben kimi göreyim". Üçü de çoklu seçim ve aynı
  // limite (MAX_UNIVERSITY_DOMAINS) tabi; farkları yalnızca hangi alana
  // yazdıkları ve picker başlığı.
  const [visibilityPicker, setVisibilityPicker] =
    useState<DomainTarget>("visibleOnly");

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
  const alcoholQuery = useAlcoholUsages();
  const petsQuery = usePets();
  const religiousViewsQuery = useReligiousViews();
  const languagesQuery = useLanguages();

  // Filtre listesinden None/Allergic/Other düşürülüyor; kalanların SIRASI
  // backend'den geldiği gibi korunuyor (gerçek türler zaten başta geliyor).
  const petOptions = useMemo(
    () =>
      (petsQuery.data ?? []).filter(
        (opt: any) => !FILTER_HIDDEN_PETS.has(opt?.enumName),
      ),
    [petsQuery.data],
  );

  // Burçlar backend sırasında DEĞİL, burç sırasında (Koç→Balık) listeleniyor.
  const zodiacOptions = useMemo(
    () => sortZodiacOptions(zodiacsQuery.data ?? []),
    [zodiacsQuery.data],
  );

  // "Belirtmek istemiyorum" filtre seçeneği olarak listelenmiyor
  // (bkz. FILTER_HIDDEN_RELIGIOUS_VIEWS).
  const religiousViewOptions = useMemo(
    () =>
      (religiousViewsQuery.data ?? []).filter(
        (opt: any) => !FILTER_HIDDEN_RELIGIOUS_VIEWS.has(opt?.enumName),
      ),
    [religiousViewsQuery.data],
  );

  const languageOptions = useMemo(
    () => languagesQuery.data ?? [],
    [languagesQuery.data],
  );

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

  const preferredUniversityDomains: string[] = useMemo(
    () => local?.preferredUniversityDomains ?? [],
    [local?.preferredUniversityDomains],
  );
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
    const field = DOMAIN_FIELD_BY_TARGET[visibilityPicker];
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

  // "Ben kimi göreyim" üniversite filtresi — premium-only, çoklu seçim (max 3).
  const universityLocked = !isPremium && isUniversityPremiumGated(filters);

  const openUniversityPicker = () => {
    if (universityLocked) {
      openPremiumPaywall();
      return;
    }
    setVisibilityPicker("preferred");
    setVisibilityPickerVisible(true);
  };

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

  // Pill etiketi. Backend display'i cümle uzunluğunda ("Long term relationship",
  // "Uzun süreli ilişki") ve pill'ler iki satıra taşıyordu; enumName başına kısa
  // bir yerel karşılık varsa onu kullanıyoruz. Anahtar yoksa backend display'ine
  // düşer, yani yeni bir enum değeri eklendiğinde boş etiket çıkmaz.
  const intentPillLabel = (opt: any) => {
    const short = t(
      `discover.filters.relationshipIntents.short.${opt.enumName}`,
      { defaultValue: "" },
    );
    return short || resolveLocalized(opt.display, i18n.language, opt.name);
  };

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

  // ─── Dealbreaker'lı premium filtreler ─────────────────────────────────────
  // Altısı da premium-only; free kullanıcıda bölüm kilitli, dokunuş paywall'a
  // gidiyor (Görünürlük/hobi bölümleriyle aynı davranış).
  const premiumFiltersLocked = !isPremium;

  // Premium'u biten kullanıcının kayıtlı premium filtreleri: sunucuda duruyor
  // ama deste onlara göre süzülmüyor. Ekranda seçimler görünmeye devam ediyor
  // (toLocalState artık temizlemiyor), bu şerit de aradaki farkı söylüyor —
  // "aktifmiş gibi" göstermek sessiz bir yalan olurdu.
  const premiumFiltersPaused = useMemo(
    () => !isPremium && hasPremiumValue(local),
    // hasPremiumValue `filters`ı okuyor (gate listeleri); ikisi de bağımlılıkta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPremium, local, filters],
  );

  const dealbreakers: string[] = useMemo(
    () => local?.dealbreakers ?? [],
    [local?.dealbreakers],
  );

  // Anahtar, backend alanı dealbreakerCapableFields'ta bildirdiği sürece HER
  // ZAMAN çiziliyor — filtre boşken de. Kontrolün varlığı kullanıcıya seçeneği
  // öğretiyor; boş filtrede yalnızca kapalı başlıyor (bkz. activeDealbreakers).
  const dealbreakerCapable = (key: DealbreakerKey) =>
    isDealbreakerCapable(filters, DEALBREAKER_FIELDS[key]);

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

  // ─── Evcil hayvan: tek seçim grubu, dört mod ──────────────────────────────
  // Legacy `hasPets` ile spesifik `pets` YAN YANA BAĞIMSIZ gösterilmiyor:
  // kullanıcı "kedisi olsun" + "hayvanı olmasın" gibi çelişkili bir çift
  // kurabilir ve backend `hasPets`i sessizce düşürdüğü için neden istediği
  // sonucu almadığını anlayamazdı. Tek grup → çelişki UI seviyesinde imkânsız.
  //
  //   any      → pets: [],        hasPets: null
  //   has      → pets: [],        hasPets: true
  //   hasNot   → pets: [],        hasPets: false
  //   specific → pets: [...],     hasPets: null
  type PetMode = "any" | "has" | "hasNot" | "specific";

  // "Belirli türler" henüz hiç tür seçilmeden de seçili durabilmeli (chip'ler
  // açılsın diye), o yüzden mod state'ten türetilemiyor — ayrı bayrak.
  // Ham `filters` yerine normalize edilmiş `local`den okunuyor: free kullanıcıda
  // tür listesi sanitize'da temizleniyor, ham yanıttan bakılsa mod boş chip
  // listesiyle "Belirli türler"de açılırdı.
  const [petSpecificOpen, setPetSpecificOpen] = useState(
    () => (local?.pets?.length ?? 0) > 0,
  );

  const petTypes: EnumValue[] = useMemo(() => local?.pets ?? [], [local?.pets]);

  const petMode: PetMode =
    petSpecificOpen || petTypes.length > 0
      ? "specific"
      : local?.hasPets === true
        ? "has"
        : local?.hasPets === false
          ? "hasNot"
          : "any";

  const setPetMode = (mode: PetMode) => {
    setPetSpecificOpen(mode === "specific");
    setLocal((prev: any) => ({
      ...prev,
      // Mod değişince diğer alan HER ZAMAN temizleniyor; ikisi bir arada
      // dolu kalırsa backend `hasPets`i yok sayar ve UI yalan söylemiş olur.
      pets: mode === "specific" ? (prev?.pets ?? []) : [],
      hasPets: mode === "has" ? true : mode === "hasNot" ? false : null,
    }));
  };

  // Tür chip'leri: çoklu seçim, OR semantiği ("kedisi VEYA köpeği olan").
  // Sayı sınırı yok — backend listeyi olduğu gibi kabul ediyor.
  const togglePetType = (opt: any) => {
    setLocal((prev: any) => {
      const current: EnumValue[] = prev?.pets ?? [];
      return {
        ...prev,
        pets: isEnumSelected(current, opt)
          ? current.filter((v) => v !== opt.enumName && v !== opt.id)
          : [...current, opt.enumName],
      };
    });
  };

  // ─── Dil ("en az birini konuşsun") ────────────────────────────────────────
  // Diğer premium enum filtreleriyle aynı state şekli (EnumValue[]) ama seçim
  // pill ızgarasından değil aranabilir picker'dan geliyor: 34 seçenek modalı
  // gereksiz uzatıyordu ve kullanıcı kendi dillerini de aynı picker'dan seçti.
  const selectedLanguages: EnumValue[] = useMemo(
    () => local?.language ?? [],
    [local?.language],
  );

  // Picker enumName ile çalışıyor; local state int de taşıyabiliyor (bkz.
  // toEnumList), o yüzden seçili değerler option listesi üzerinden eşleniyor.
  // Referans sabitliği önemli: LanguagePickerModal bu diziyi effect
  // bağımlılığında okuyor, her render'da yenisi üretilirse açık picker'daki
  // seçim sıfırlanır.
  const selectedLanguageEnums: string[] = useMemo(
    () =>
      languageOptions
        .filter((opt: any) => isEnumSelected(selectedLanguages, opt))
        .map((opt: any) => opt.enumName),
    [languageOptions, selectedLanguages],
  );

  // Satırda gösterilen seçili dil pill'leri. Sayaç ham local listeden (option
  // listesi henüz gelmemişken de doğru sayıyı söylesin), pill'ler eşleşen
  // option'lardan geliyor.
  const selectedLanguageOptions = useMemo(
    () =>
      languageOptions.filter((opt: any) =>
        isEnumSelected(selectedLanguages, opt),
      ),
    [languageOptions, selectedLanguages],
  );

  // Overwrite semantiği: picker'ın döndürdüğü liste tercihin TAMAMI, boş dizi
  // de geçerli bir sonuç ("filtreyi kaldır").
  const onLanguageConfirm = (enumNames: string[]) => {
    setLanguagePickerVisible(false);
    setLocal((prev: any) => ({ ...prev, language: enumNames }));
  };

  // Boş dizi = "temizle" (overwrite semantiği), "değiştirme" değil — üç
  // üniversite listesi de aynı davranışta.
  const clearDomainList = (field: DomainField) => {
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
    if (!visible) return;
    const next = toLocalState(filters);
    setLocal(next);
    // Pet modu local state'ten TAM türetilemiyor (tür seçmeden "Belirli
    // türler"de durulabiliyor); server'dan gelen seçime göre sıfırlanıyor.
    setPetSpecificOpen((next?.pets?.length ?? 0) > 0);
    // `isPremium` bağımlılıkta: tier oturum içinde değişirse (satın alma) ekran
    // server state'iyle yeniden hizalansın. Mesafe sınırları artık ÖNCE
    // `filters`tan türüyor (minSelectableDistanceKm/maxSelectableDistanceKm) —
    // satın alma sonrası PurchaseModal filtre cache'ini invalidate ediyor, yeni
    // yanıtla tavan 75 → 150'ye çıkıyor ve burada yeniden clamp'leniyor.
    // `isPremium` yine de listede: alanları göndermeyen backend'de tier
    // fallback'i o bayrağa bakıyor.
    //
    // toLocalState bilerek listede YOK: her render'da yeniden yaratılan bir
    // fonksiyon, effect'i her render'da çalıştırıp kullanıcının kaydetmediği
    // seçimlerini silerdi. Okuduğu reaktif değerlerin (filters, ondan türeyen
    // sınırlar, isPremium) hepsi zaten listede.
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

  // Kaydetme payload'ı TEK yerde kuruluyor: hem "Uygula" hem "Sıfırla" buradan
  // geçiyor. State parametre olarak alınıyor çünkü sıfırlama setLocal'ın bir
  // sonraki render'ını bekleyemez — yeni state doğrudan veriliyor.
  const applyFilters = (state: any) => {
    Keyboard.dismiss();
    // `dealbreakers` spread'in DIŞINDA tutuluyor: local state onu taşıyor ve
    // koşulsuz yayılırsa free kullanıcıda boş dizi olarak gider — backend
    // semantiğinde bu "hepsini esnet" demek, yani kullanıcının kayıtlı
    // katılık ayarını habersiz sıfırlar. Aşağıda yalnızca premium'da,
    // kanonik adlara indirgenmiş halde ekleniyor.
    const { dealbreakers: dealbreakersFromState, ...sanitized } =
      sanitizeForTier(state) ?? {};
    // Tür listesi iki alanı birden belirliyor (dolu → legacy `hasPets`
    // null'a düşer), o yüzden payload'dan önce bir kez hesaplanıyor.
    const petTypesOut = toEnumList(sanitized?.pets);
    // Yaş filtresi UI'dan kaldırıldı — backend'e her zaman tüm yaşları
    // kapsayan default'u gönder.
    onSave({
      ...sanitized,
      // Alanı hiç göndermemek "değiştirme", dolu dizi ise "bu değere ayarla"
      // demek. Boş dizi gönderilmiyor — interestedInEmpty guard'ı Apply'ı
      // kilitliyor (bkz. yukarıdaki not: flags 0 = hesap görünmez olur).
      interestedIn: state.interestedIn || [],
      ageRangeMin: DEFAULT_AGE_RANGE.min,
      ageRangeMax: DEFAULT_AGE_RANGE.max,
      // Anahtar HER kaydetmede açıkça gidiyor (`sanitizeForTier` spread'ine
      // güvenilmiyor): alan düşerse backend "değiştirme" der ve kullanıcı
      // anahtarı kapattığını sanarken açık kalır. Free'de de gönderiliyor —
      // premium alanı DEĞİL, 403 üretmez.
      ignoreDistanceFilter: state.ignoreDistanceFilter === true,
      // Üniversite listeleri OVERWRITE semantiğiyle yazılıyor: backend her
      // UpdateFilters'ta premium alanların tamamını gönderilen state'e göre
      // yeniden kuruyor. Bu yüzden ekrandaki güncel state'in TAMAMI her
      // kaydetmede gitmeli — alanı atlamak listeyi silmekle aynı şey.
      // PUT adı `universityDomains`; eşleme useSaveFilters'ta (şehirle aynı).
      preferredUniversityDomains: toDomainList(
        sanitized?.preferredUniversityDomains,
      ),
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
        // Alkol tercihini BELİRTMEMİŞ adaylar filtre açıkken eleniyor
        // (sigarayla birebir aynı semantik) — bölüm açıklaması bunu söylüyor.
        [FILTER_FIELD.alcohol]: toEnumList(sanitized?.alcohol),
        // Tür bazlı seçim; boş dizi = tercihi temizle.
        [FILTER_FIELD.pets]: petTypesOut,
        // Legacy bool? — spesifik seçim varken KESİNLİKLE null gidiyor.
        // Backend zaten `pets` kazandırıp bunu düşürüyor; çelişkili çifti
        // hiç göndermemek, "gönderdim ama yok sayıldı" belirsizliğini de
        // ortadan kaldırıyor.
        [FILTER_FIELD.hasPets]:
          petTypesOut.length > 0 || typeof sanitized?.hasPets !== "boolean"
            ? null
            : sanitized.hasPets,
        // Yazarken int gidiyor (backend kabul ediyor); yanıtta enumName
        // döndüğü için OKUMA tarafı ayrı parse ediyor (bkz. toYearList).
        [FILTER_FIELD.yearOfStudy]: toIntList(sanitized?.yearOfStudy),
        // Dil (OR: en az biri) ve dini görüş — ikisi de hard filtre ve
        // OVERWRITE: boş dizi = tercihi temizle.
        [FILTER_FIELD.language]: toEnumList(sanitized?.language),
        [FILTER_FIELD.religion]: toEnumList(sanitized?.religion),
      },
      // `dealbreakers` semantiği DİĞER premium alanlardan FARKLI:
      //   yok/null → değiştirme, [] → hepsini esnet, [...] → tam liste.
      // Free kullanıcıda hiç gönderilmiyor (premium alan, 403 döner);
      // premium'da TAM liste gidiyor — kısmi güncelleme yok. Ekranda ne
      // görünüyorsa o kaydediliyor: boş filtrenin işareti okurken zaten
      // düşürüldü, burada kalan tek şey kullanıcının kendi tercihi.
      ...(isPremium
        ? { dealbreakers: toDealbreakerList(dealbreakersFromState) }
        : {}),
    });
  };

  // Header'ın solundaki "Sıfırla" — tüm keşif filtrelerini varsayılana döndürür
  // VE hemen kaydedip modalı kapatır (kapatma onSave başarılı olunca parent'ta
  // oluyor, hata durumunda modal açık kalıp uyarı gösteriliyor).
  // İki şeye bilerek dokunulmuyor:
  //  - interestedIn: boş dizi Apply'ı kilitliyor (bkz. interestedInEmpty) ve
  //    backend semantiğinde flags 0 = hesap görünmez.
  //  - Görünürlük listeleri: bunlar filtre değil gizlilik ayarı (kendi desteni
  //    değil karşı tarafınkini etkiliyor), sessizce kaldırılmamalı.
  const resetAllFilters = () => {
    Keyboard.dismiss();
    setPetSpecificOpen(false);
    const reset = {
      ...local,
      // Varsayılan = tier'ın TAVANI, tabanı değil. Mesafe artık katı filtre:
      // "sıfırla"nın kullanıcıyı en dar yarıçapa çekmesi desteyi boşaltırdı.
      maxDistance: tierMaxKm,
      // "Mesafe sınırı olmasın" VARSAYILAN KAPALI — sıfırlama da onu kapatıyor
      // (`toLocalState`teki varsayılanla aynı yön; ikisi ayrışırsa "sıfırla"
      // varsayılana değil başka bir yere döndürürdü). Havuzun daralması burada
      // kabul: sıfırlanan filtre yine tier tavanındaki yarıçapla çalışıyor ve
      // deste boşalırsa boş-durum ekranı zaten "Mesafe sınırını kaldır"
      // butonunu gösteriyor. Sınırsız isteyen anahtarı kendisi açar.
      ignoreDistanceFilter: false,
      preferredCity: null,
      preferredUniversityDomains: [],
      preferredHobbies: [],
      relationshipIntents: [],
      heightMin: null,
      heightMax: null,
      zodiac: [],
      smoking: [],
      alcohol: [],
      pets: [],
      hasPets: null,
      yearOfStudy: [],
      language: [],
      religion: [],
      // Değeri olmayan filtrenin katılık işareti de anlamsız kalır.
      dealbreakers: [],
    };
    setLocal(reset);
    // Kayıt sürerken ikinci istek atma; interestedIn boşken payload geçersiz
    // (Apply de o durumda kilitli) — o iki halde yalnızca local sıfırlama olur,
    // modal açık kalır.
    if (saving || (reset.interestedIn || []).length === 0) return;
    applyFilters(reset);
  };

  // "Mesafe sınırı olmasın" açık mı — dial'ı pasifleştiriyor ve tier tavanı
  // şeridini gizliyor. Anahtar açıkken `maxDistance` state'te DURUYOR
  // (gönderiliyor da): kapatınca kullanıcı kendi yarıçapına döner.
  const distanceLimitOff = local?.ignoreDistanceFilter === true;

  // Tier tavanı ("ücretsiz hesapta sınır X km") artık AYRI ŞERİT DEĞİL: bölüm
  // açıklamasının sonuna ekleniyor. Ayrı şerit olarak dururken anahtar açılınca
  // unmount oluyordu ve altındaki bölüm zıplıyordu; açıklamaya girince zaten
  // var olan bir satırın uzunluğu değişiyor, gizlenecek/kaydırılacak bir kutu
  // kalmıyor.
  // Cümle "mesafe sınırı olmasın" anahtarından BAĞIMSIZ: anahtara bağlıyken
  // her açma/kapamada açıklama uzayıp kısalıyor, altındaki dial zıplıyordu.
  // Tavan bilgisi anahtar açıkken de doğru (kapatınca yine geçerli olacak),
  // o yüzden sabit duruyor.
  // Sayılar sabitten DEĞİL, o an geçerli sınırlardan: free tavanı backend'in
  // söylediği değer, Lit Plus tavanı da halkaların çizildiği görsel tavan —
  // metin ile dial aynı şeyi söylesin.
  const maxDistanceDesc = !isPremium
    ? `${t('discover.filters.maxDistance.desc')} ${t(
        'discover.filters.maxDistance.freeCap',
        { km: tierMaxKm, premiumKm: visualMaxKm },
      )}`
    : t('discover.filters.maxDistance.desc');

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
          {/* Sayaç ve "temizle" satırı kaldırıldı: pill'e tekrar dokunmak
              seçimi zaten kaldırıyor, header'daki Sıfırla da hepsini siliyor. */}
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
                    {intentPillLabel(opt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );

  // Burç / Sigara / Alkol / Dini görüş — hepsi düz enum çoklu seçimi, aynı
  // pill grubundan geçiyor, o yüzden tek gövde. Ama tek bir `.map()` ile ARD
  // ARDA çizilmiyorlar: premium grubu önem sırasına dizili (burç hard
  // filtrelerin en altında), yani aralarına başka bölümler giriyor. Sıra
  // değişecekse çağrı yerlerini oynat, burayı değil. Evcil hayvan bu gruba DAHİL DEĞİL: tür listesi enum çoklu
  // seçimi ama önce legacy `hasPets` moduna karar verilmesi gerekiyor, o yüzden
  // kendi bölümünde (bkz. setPetMode).
  //
  // `extra.options` — backend listesinden bazı değerleri düşüren bölümler için
  // (dini görüşte PreferNotToSay). `extra.note` — pill'lerin ALTINDA, yalnız
  // seçim varken çıkan uyarı satırı (evcil hayvandaki orNote deseni): filtrenin
  // sonuç üzerindeki yan etkisini seçim yapıldığı anda söylüyor.
  const renderEnumFilter = (
    key: DealbreakerKey,
    query: any,
    titleKey: string,
    descKey: string,
    getIcon: (opt: any) => any,
    extra?: { options?: any[]; note?: string },
  ) => {
    const options = extra?.options ?? query.data ?? [];
    const selected: EnumValue[] = local?.[key] ?? [];
    return (
      <PremiumFilterSection
        title={t(titleKey)}
        description={t(descKey)}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={dealbreakerCapable(key)}
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
          <>
            <EnumPillGroup
              options={options}
              selected={selected}
              onToggle={(opt: any) => toggleEnumValue(key, opt)}
              getIcon={getIcon}
            />
            {extra?.note && selected.length > 0 ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 13,
                  fontWeight: "500",
                  marginTop: 10,
                }}
              >
                {extra.note}
              </Text>
            ) : null}
          </>
        )}
      </PremiumFilterSection>
    );
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('discover.filters.title')}
      // X yerine "Sıfırla" — sheet swipe-down ve backdrop ile kapanmaya devam
      // ediyor, kapatma yolu kaybolmuyor.
      leftLabel={t('discover.filters.reset')}
      onLeftPress={resetAllFilters}
      actionLabel={t('discover.filters.apply')}
      onAction={() => applyFilters(local)}
      actionDisabled={interestedInEmpty}
      actionLoading={saving}
      snapPoints={["90%"]}
      // Varsayılan paddingBottom 40'a ek bir tık daha — uzun içerik alt kenarda
      // sıkışmasın, sonraki section'lar nefes alsın.
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {/* Maksimum Mesafe — sınırlar backend'den (free 75 / premium 150).
          Bölüm KİLİTLİ DEĞİL: free kullanıcı da mesafe seçiyor, yalnız üst
          sınırı düşük. O yüzden başlıkta kilit ikonu yok; sınır dial'ın kendi
          cap'i (shake) + açıklamanın sonundaki cümleyle anlatılıyor. */}
      <FilterSection
        title={t('discover.filters.maxDistance.title')}
        description={maxDistanceDesc}
        marginTop={20}
      />
      <DistanceCircle
        value={clampKm(local.maxDistance, minSelectableKm, tierMaxKm)}
        userMaxKm={tierMaxKm}
        minKm={minSelectableKm}
        visualMaxKm={visualMaxKm}
        disabled={distanceLimitOff}
        onChange={(v: number) =>
          setLocal((p: any) => ({ ...p, maxDistance: v }))
        }
      />

      {/* "Mesafe sınırı olmasın" — dial'ın HEMEN ALTINDA, bilerek: aynı ayarın
          iki hali, ayrı bir bölüme/ekrana koymak keşfedilmez yapar.
          PREMIUM DEĞİL: şikâyet free kullanıcıdan geliyor, backend free'den de
          kabul ediyor — buraya kilit/paywall EKLENMEZ. */}
      <View
        style={{
          marginTop: 16,
          borderRadius: 24,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: colors.hairline,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
            {t("discover.filters.ignoreDistance.title")}
          </Text>
          {/* Alt metin TEK CÜMLE (bkz. i18n ignoreDistance.description):
              sıralamanın değişmediğini söyleyen ikinci cümle kaldırıldı. */}
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: "400",
            }}
          >
            {t("discover.filters.ignoreDistance.description")}
          </Text>
        </View>
        <Switch
          testID="ignore-distance-switch"
          value={distanceLimitOff}
          onValueChange={(next: boolean) =>
            setLocal((p: any) => ({ ...p, ignoreDistanceFilter: next }))
          }
          trackColor={{ false: colors.hairlineStrong, true: colors.errorStrong }}
          thumbColor={colors.text}
          ios_backgroundColor={colors.border}
        />
      </View>

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


      {/* Premium Filtreler — buradan aşağısı tamamen premium ve ÖNEM SIRASINA
          dizili: üniversite → ilişki niyeti → şehir → sınıf → boy → hobiler →
          dil → sigara → alkol → dini görüş → evcil hayvan → burç.
          Sıra kullanıcının eş seçerken en çok umursadığı alanlara göre; eleme
          yapan hard filtreler ile skor boost'u olan iki bölüm (ilişki niyeti,
          hobiler) bilinçli olarak İÇ İÇE — "kimi arıyorum" sorusuna en doğrudan
          cevap veren bölümler yukarıda dursun diye. Dini görüş yine
          sigara/alkolün devamında, çünkü aynı sınıfta (yaşam tarzı / değerler)
          ve aynı "belirtmemişleri eler" yan etkisini taşıyor.
          Toggle'lı olanlar hard filtre; ilişki niyeti ve hobiler toggle'sız
          çünkü onlar eleme yapmıyor — kendi açıklamaları bunu söylüyor.
          Görünürlük ise en sonda: metni "yukarıdaki filtrelerden farklı
          olarak" diyor, yani konumu kopyaya bağlı.
          Bölüm eklerken/oynatırken bu sırayı koru. */}
      <PremiumGroupHeader
        title={t("discover.filters.premiumFilters.title")}
        description={t("discover.filters.premiumFilters.description")}
      />

      {/* Premium bitmiş ama kayıtlı filtreler duruyor: aşağıdaki seçimler
          ekranda görünür (silinmediler, backend free kullanıcıda premium
          bloğunu yazmıyor) ama desteye UYGULANMIYOR. Şerit bunu söylüyor;
          dokunuş paywall'a gidiyor. */}
      {premiumFiltersPaused && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={openPremiumPaywall}
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 16,
            borderCurve: "continuous",
            backgroundColor: colors.surface,
            borderWidth: 0.5,
            borderColor: colors.hairline,
          }}
        >
          <SFIcon
            name="pause.circle"
            fallback={PauseCircle}
            size={18}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: "400",
            }}
          >
            {t("discover.filters.premiumFilters.paused")}
          </Text>
        </TouchableOpacity>
      )}

      {/* Üniversite ("ben kimi göreyim") — premium-only, ÇOKLU seçim (max 3),
          HER ZAMAN katı: aday tükense bile gevşemez, o yüzden dealbreaker
          toggle'ı yok. Aşağıdaki Görünürlük listeleriyle KARIŞTIRMA: onlar
          "beni kim görsün" ve karşı tarafın destesini etkiliyor.
          DİKKAT: GET'te `preferredUniversityDomains`, PUT'ta
          `universityDomains` — ad eşlemesi useSaveFilters'ta (şehirdeki
          preferredCity→city gibi). Tekil alan deprecated, gönderilmiyor. */}
      <PremiumGate locked={universityLocked} onLockedPress={openPremiumPaywall}>
        <View>
          <FilterSection
            title={t("discover.filters.university.title")}
            description={t("discover.filters.university.description")}
          />
          <VisibilityListLabel count={preferredUniversityDomains.length} />
          <SelectRow
            sfIcon={UNIVERSITY_ICON}
            lucideIcon={GraduationCap}
            value={summarizeDomains(preferredUniversityDomains)}
            placeholder={t("discover.filters.university.select")}
            disabled={!universityLocked && universityOptions.length === 0}
            onPress={openUniversityPicker}
            onClear={() => clearDomainList("preferredUniversityDomains")}
          />
        </View>
      </PremiumGate>

      {/* Kullanım amacı filtresi KALDIRILDI: alan üründen çıktı, endpoint boş
          liste dönüyor ve backend `usagePurposes` payload'ını yok sayıyor.
          Aynı soruyu soran "İlişki Niyeti" filtresi hemen aşağıda. */}

      {/* İlişki niyeti — hard filtre DEĞİL (skor boost'u) ama "kimi arıyorum"
          sorusunun en doğrudan cevabı, o yüzden üniversitenin hemen altında.
          Gövdesi yukarıda tanımlı (intentsSection); burada yalnızca konumu var. */}
      {intentsSection}

      {/* Şehir — premium-only, HER ZAMAN katı (aday tükense bile gevşemez,
          o yüzden dealbreaker toggle'ı yok). Grubun geri kalanıyla aynı kilit
          davranışı: dokunuş yutulmuyor, paywall'a gidiyor. */}
      <PremiumGate locked={!isPremium} onLockedPress={openPremiumPaywall}>
        <View>
          <FilterSection
            title={t('discover.filters.city.title')}
            description={t('discover.filters.city.description')}
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
              borderColor: colors.hairline,
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

      {/* Sınıf — int (0 = hazırlık, 1..6). Enum endpoint'i yok, kayıt
          ekranıyla (RegisterStep8) aynı aralık. Üniversite/şehirle aynı
          "kim, nerede" sorusunun devamı olduğu için boydan önce. */}
      <PremiumFilterSection
        title={t("discover.filters.yearOfStudy.title")}
        description={t("discover.filters.yearOfStudy.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={dealbreakerCapable("yearOfStudy")}
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

      {/* Boy — alt sınır. "Farketmez" ayrı bir durum: filtre hiç uygulanmaz. */}
      <PremiumFilterSection
        title={t("discover.filters.height.title")}
        description={t("discover.filters.height.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={dealbreakerCapable("height")}
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

      {/* Hobiler — ilişki niyeti gibi eleme YAPMAYAN bir bölüm (skor boost'u),
          ama kullanıcı açısından "kimi arıyorum"un bir parçası, o yüzden kalan
          hard filtrelerin ÜSTÜNDE. Gövdesi yukarıda (hobbiesSection). */}
      {hobbiesSection}

      {/* Dil — premium-only HARD filtre, OR semantiği: aday seçilenlerden EN AZ
          BİRİNİ konuşuyorsa geçer ("hepsini bilsin" DEĞİL). Dilini hiç
          belirtmemiş aday eleniyor, o yüzden uyarı seçim yapılır yapılmaz
          çıkıyor. Seçim 34 değerlik aranabilir picker'dan; ekranda kalan
          pill'ler tek dokunuşla kaldırılabiliyor. */}
      <PremiumFilterSection
        title={t("discover.filters.language.title")}
        description={t("discover.filters.language.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={dealbreakerCapable("language")}
        dealbreakerOn={dealbreakers.includes(DEALBREAKER_FIELDS.language)}
        onToggleDealbreaker={() => toggleDealbreaker("language")}
        testID={`dealbreaker-${DEALBREAKER_FIELDS.language}`}
      >
        <SelectRow
          sfIcon={LANGUAGE_ICON}
          lucideIcon={Languages}
          value={
            selectedLanguages.length > 0
              ? t("discover.filters.language.selected", {
                  // `count` DEĞİL: i18next'te çoğul çözümlemesini tetikler.
                  selected: selectedLanguages.length,
                })
              : null
          }
          placeholder={t("discover.filters.language.select")}
          disabled={languageOptions.length === 0}
          onPress={() => setLanguagePickerVisible(true)}
          onClear={() => setLocal((p: any) => ({ ...p, language: [] }))}
        />

        {selectedLanguageOptions.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <EnumPillGroup
              options={selectedLanguageOptions}
              selected={selectedLanguages}
              onToggle={(opt: any) => toggleEnumValue("language", opt)}
              getIcon={getLanguageIcon}
            />
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                fontWeight: "500",
                marginTop: 10,
              }}
            >
              {t("discover.filters.language.orNote")}
            </Text>
          </View>
        ) : null}
      </PremiumFilterSection>

      {/* Sigara — yaşam tarzı dealbreaker'ı, ölçülebilir alanlardan (boy/sınıf)
          sonra ama evcil hayvan/burç gibi daha yumuşak tercihlerden önce. */}
      {renderEnumFilter(
        "smoking",
        smokingQuery,
        "discover.filters.smoking.title",
        "discover.filters.smoking.description",
        getSmokingIcon,
      )}

      {/* Alkol — sigarayla aynı sınıf (yaşam tarzı) ve aynı semantik: filtre
          açıkken tercihini BELİRTMEMİŞ adaylar eleniyor. Alan profilde zorunlu
          olmadığı için deste beklenenden çok daralabilir; uyarı bölüm
          açıklamasında, o yüzden seçim yokken de görünüyor. */}
      {renderEnumFilter(
        "alcohol",
        alcoholQuery,
        "discover.filters.alcohol.title",
        "discover.filters.alcohol.description",
        getAlcoholIcon,
      )}

      {/* Dini görüş — alkol/sigarayla aynı sınıf ve aynı semantik: filtre
          açıkken tercihini BELİRTMEMİŞ adaylar eleniyor. Farkı, eleme oranının
          çok daha yüksek olabilmesi (alan profilde zorunlu değil ve
          "Belirtmek istemiyorum" seçenler de düşüyor) — o yüzden seçim
          yapıldığı anda pill'lerin altında ayrıca uyarı çıkıyor, dealbreaker
          anahtarının kapalı kalmasının ne işe yaradığını da söylüyor.
          Seçenek listesinden PreferNotToSay düşürülüyor
          (bkz. FILTER_HIDDEN_RELIGIOUS_VIEWS). */}
      {renderEnumFilter(
        "religion",
        religiousViewsQuery,
        "discover.filters.religion.title",
        "discover.filters.religion.description",
        getReligiousViewIcon,
        {
          options: religiousViewOptions,
          note: t("discover.filters.religion.hiddenNote"),
        },
      )}

      {/* Evcil hayvan — TEK seçim grubu, dört mod. İlk üçü legacy `hasPets:
          bool?` (farketmez/var/yok), dördüncüsü tür bazlı `pets` listesi.
          İkisi ayrı kontrol olarak yan yana durmuyor: backend spesifik seçim
          varken `hasPets`i yok saydığı için çelişkili bir çift sessizce yanlış
          sonuç verirdi (bkz. setPetMode). Tek dealbreaker anahtarı ikisini de
          yönetiyor — kullanıcı açısından ikisi de "evcil hayvan tercihi". */}
      <PremiumFilterSection
        title={t("discover.filters.pets.title")}
        description={t("discover.filters.pets.description")}
        locked={premiumFiltersLocked}
        onLockedPress={openPremiumPaywall}
        capable={dealbreakerCapable("pets")}
        dealbreakerOn={dealbreakers.includes(DEALBREAKER_FIELDS.pets)}
        onToggleDealbreaker={() => toggleDealbreaker("pets")}
        testID={`dealbreaker-${DEALBREAKER_FIELDS.pets}`}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {([
            { mode: "any", labelKey: "discover.filters.pets.any", icon: getHasPetsIcon(null) },
            { mode: "has", labelKey: "discover.filters.pets.has", icon: getHasPetsIcon(true) },
            { mode: "hasNot", labelKey: "discover.filters.pets.hasNot", icon: getHasPetsIcon(false) },
            // Tür ikonu (pawprint DEĞİL): "var" pill'i zaten pawprint kullanıyor,
            // aynı satırda iki özdeş sembol modları ayırt edilemez kılıyordu.
            { mode: "specific", labelKey: "discover.filters.pets.specific", icon: getPetIcon("Cat") },
          ] as const).map((opt) => {
            const selected = petMode === opt.mode;
            return (
              <TouchableOpacity
                key={opt.mode}
                activeOpacity={1}
                onPress={() => setPetMode(opt.mode)}
                style={{
                  ...PILL_STYLE,
                  backgroundColor: pillColors(selected).backgroundColor,
                  borderColor: pillColors(selected).borderColor,
                }}
              >
                <PillIcon icon={opt.icon} selected={selected} />
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

        {/* Tür chip'leri yalnızca "Belirli türler" modunda. None/Allergic/Other
            listede yok (bkz. FILTER_HIDDEN_PETS): "hayvanı olmayanlar" zaten
            yukarıdaki mod. */}
        {petMode === "specific" ? (
          <View style={{ marginTop: 14 }}>
            {petOptions.length === 0 ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "400",
                }}
              >
                {petsQuery.isLoading
                  ? t("discover.filters.enumLoading")
                  : t("discover.filters.enumUnavailable")}
              </Text>
            ) : (
              <>
                <EnumPillGroup
                  options={petOptions}
                  selected={petTypes}
                  onToggle={togglePetType}
                  getIcon={getPetIcon}
                />
                {/* OR semantiği: birden fazla tür seçmek şartı DEĞİL, ihtimali
                    çoğaltıyor. Yazmazsak kullanıcı "kedi+köpek seçtim ama
                    sadece kedisi olanlar geliyor" diye bug sanıyor. */}
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontWeight: "500",
                    marginTop: 10,
                  }}
                >
                  {t("discover.filters.pets.orNote")}
                </Text>
              </>
            )}
          </View>
        ) : null}
      </PremiumFilterSection>

      {/* Burç — hard filtrelerin en altı. Eleme gücü diğerleri kadar yüksek
          ama uyum sinyali en zayıf olan alan, o yüzden en sona bırakıldı.
          Diğer enum filtrelerinden farkı: sıra backend'den geldiği gibi
          bırakılmıyor, burç sırasına (Koç→Balık) diziliyor — kullanıcı kendi
          burcunu bilinen bir konumda arıyor. */}
      {renderEnumFilter(
        "zodiac",
        zodiacsQuery,
        "discover.filters.zodiac.title",
        "discover.filters.zodiac.description",
        getZodiacIcon,
        { options: zodiacOptions },
      )}

      {/* Görünürlük — premium-only, iki ayrı liste. Yukarıdaki filtrelerden
          KAVRAM OLARAK ayrı: onlar "ben kimi göreyim", bu "beni kim görsün".
          Değerler karşı kullanıcının destesini etkiliyor.
          pointerEvents kapatılmıyor (City'den farkı): free kullanıcı satıra
          dokununca paywall açılsın. */}
      <View style={{ opacity: visibilityLocked ? 0.4 : 1 }}>
        <FilterSection
          title={t('discover.filters.visibility.title')}
          description={t('discover.filters.visibility.description')}
        />

        <VisibilityListLabel
          label={t('discover.filters.visibility.visibleOnlyLabel')}
          count={visibleOnlyDomains.length}
        />
        <SelectRow
          sfIcon={VISIBLE_ONLY_ICON}
          lucideIcon={Eye}
          value={summarizeDomains(visibleOnlyDomains)}
          placeholder={t('discover.filters.visibility.selectUniversities')}
          disabled={!visibleOnlyLocked && universityOptions.length === 0}
          onPress={() => openVisibilityPicker("visibleOnly")}
          onClear={() => clearDomainList("visibleOnlyToUniversityDomains")}
        />

        <VisibilityListLabel
          label={t('discover.filters.visibility.hiddenFromLabel')}
          count={hiddenFromDomains.length}
          marginTop={18}
        />
        <SelectRow
          sfIcon={HIDDEN_FROM_ICON}
          lucideIcon={EyeOff}
          value={summarizeDomains(hiddenFromDomains)}
          placeholder={t('discover.filters.visibility.selectUniversities')}
          disabled={!hiddenFromLocked && universityOptions.length === 0}
          onPress={() => openVisibilityPicker("hiddenFrom")}
          onClear={() => clearDomainList("hiddenFromUniversityDomains")}
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

        {/* Backend bu kuralları premium bitince BİLİNÇLİ olarak devre dışı
            bırakıyor: engellenen üniversite kullanıcıyı tekrar görmeye başlar.
            Gizlilik beklentisi yaratan bir ayar, sessiz kalmıyoruz. Yalnız
            kural kurulmuşken gösteriliyor — boş listede uyarının konusu yok. */}
        {visibleOnlyDomains.length > 0 || hiddenFromDomains.length > 0 ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              fontWeight: "500",
              marginTop: 10,
            }}
          >
            {t('discover.filters.visibility.premiumExpiryNote')}
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

      {/* Dil picker'ı — profil düzenlemedekiyle AYNI bileşen (34 değerlik
          aranabilir liste), farkı başlığı: burada seçilen "karşımdakinin
          konuştuğu diller". Sayı sınırı yok; backend filtrede bir tavan
          uygulamıyor (profildeki 15 sınırı kullanıcının KENDİ dilleri için). */}
      <LanguagePickerModal
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
        title={t("discover.filters.language.pickerTitle")}
        items={languageOptions}
        initialSelectedValues={selectedLanguageEnums}
        onConfirm={onLanguageConfirm}
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
            ? preferredUniversityDomains
            : visibilityPicker === "hiddenFrom"
              ? hiddenFromDomains
              : visibleOnlyDomains
        }
        maxLimit={MAX_UNIVERSITY_DOMAINS}
        limitMsg={t('discover.universityPicker.limitMsg', {
          // `count` DEĞİL: i18next'te count çoğul çözümlemesini tetikler
          // (limitMsg_other arar) ve anahtar bulunamaz.
          max: MAX_UNIVERSITY_DOMAINS,
        })}
        onConfirm={onVisibilityConfirm}
      />
    </AppModal>
  );
}
