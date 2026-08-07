// Keşif filtresindeki premium enum pill'lerinin ikonları.
//
// relationshipIntent.ts ile aynı sözleşme: anahtar DAİMA enumName (PascalCase).
// `name`/`display` backend'de Accept-Language'e göre değişiyor — onunla
// anahtarlamak eşleşmeyi dile bağlar.
//
// Semboller RegisterStep14Screen ve EditProfileForm'daki haritalarla BİREBİR
// aynı: aynı burcu/amacı üç ekranda da aynı ikonla görüyorsun. Buradaki bir
// sembolü değiştirirsen o iki ekranı da güncelle (o haritalar legacy TR display
// anahtarlarını da taşıdığı için henüz tek dosyaya indirilmedi).
import type { SFSymbol } from "@/shared/components/SFIcon";
import {
  Flame,
  Leaf,
  Wind,
  Moon,
  Sun,
  Scale,
  Zap,
  Navigation,
  Mountain,
  Droplets,
  Fish,
  Star,
  Cigarette,
  PawPrint,
  X,
  Circle,
  GraduationCap,
  BookOpen,
  Sparkles,
  Users,
  Briefcase,
  type LucideIcon,
} from "lucide-react-native";

export type PillIconSpec = { sf: SFSymbol; lucide: LucideIcon };

// ─── Burç (ZodiacType) ──────────────────────────────────────────────────────
// Burcun kendi sembolü (♈♉♊) yerine elementel karşılığı kullanılıyor: SF
// Symbols'ta burç glifi yok ve emoji, monokrom ikon setinin içinde yamalı
// duruyordu. Kaynak: RegisterStep14Screen ZODIAC_MAP / EditProfileForm
// ZODIAC_ICON_MAP.
const ZODIAC_ICONS: Record<string, PillIconSpec> = {
  Aries: { sf: "flame.fill", lucide: Flame },
  Taurus: { sf: "leaf.fill", lucide: Leaf },
  Gemini: { sf: "wind", lucide: Wind },
  Cancer: { sf: "moon.fill", lucide: Moon },
  Leo: { sf: "sun.max.fill", lucide: Sun },
  Virgo: { sf: "leaf.fill", lucide: Leaf },
  Libra: { sf: "scalemass.fill", lucide: Scale },
  Scorpio: { sf: "bolt.fill", lucide: Zap },
  Sagittarius: { sf: "location.fill", lucide: Navigation },
  Capricorn: { sf: "mountain.2.fill", lucide: Mountain },
  Aquarius: { sf: "drop.fill", lucide: Droplets },
  Pisces: { sf: "fish.fill", lucide: Fish },
};

const STAR_ICON: PillIconSpec = { sf: "star.fill", lucide: Star };

// ─── Sigara (SmokingStatusType) ─────────────────────────────────────────────
// Register/EditProfileForm üç seçenekte de tek sembol (CIGARETTE_ICON)
// kullanıyor; ayırt eden şey pill metni. Aynı davranış burada da korunuyor.
const CIGARETTE_ICON: PillIconSpec = { sf: "smoke.fill", lucide: Cigarette };

// ─── Kullanım amacı (AppUsagePurposeType) ───────────────────────────────────
const USAGE_PURPOSE_ICONS: Record<string, PillIconSpec> = {
  Dating: { sf: "sparkles", lucide: Sparkles },
  Friendship: { sf: "person.2.fill", lucide: Users },
  Networking: { sf: "briefcase.fill", lucide: Briefcase },
  JustLooking: { sf: "wind", lucide: Wind },
};

export const getZodiacIcon = (
  enumName: string | null | undefined,
): PillIconSpec => (enumName && ZODIAC_ICONS[enumName]) || STAR_ICON;

export const getSmokingIcon = (): PillIconSpec => CIGARETTE_ICON;

export const getUsagePurposeIcon = (
  enumName: string | null | undefined,
): PillIconSpec => (enumName && USAGE_PURPOSE_ICONS[enumName]) || STAR_ICON;

// ─── Evcil hayvan (hasPets: bool?) ──────────────────────────────────────────
// Enum değil, 3 durumlu bool — anahtar değerin kendisi. "Var"/"Yok" sembolleri
// EditProfileForm'un PET_ICON_MAP'iyle hizalı (varsayılan pawprint, None → xmark);
// "farketmez" orada karşılığı olmayan, yalnız filtreye özgü üçüncü durum.
export const getHasPetsIcon = (value: boolean | null): PillIconSpec => {
  if (value === true) return { sf: "pawprint.fill", lucide: PawPrint };
  if (value === false) return { sf: "xmark", lucide: X };
  return { sf: "circle.dashed", lucide: Circle };
};

// ─── Sınıf (ClassYearType) ──────────────────────────────────────────────────
// Değer int (0 = hazırlık, 1..6 = sınıf); sınıf numarası pill metninde zaten
// yazıyor, ikon yalnızca hazırlığı ayırıyor. RegisterStep8'in sınıf pill'lerinde
// ikon yok — bu eşleme filtreye özgü.
export const getYearOfStudyIcon = (year: number): PillIconSpec =>
  year === 0
    ? { sf: "book.fill", lucide: BookOpen }
    : { sf: "graduationcap.fill", lucide: GraduationCap };
