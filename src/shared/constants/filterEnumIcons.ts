// Keşif filtresindeki premium enum pill'lerinin ikonları.
//
// relationshipIntent.ts ile aynı sözleşme: anahtar DAİMA enumName (PascalCase).
// `name`/`display` backend'de Accept-Language'e göre değişiyor — onunla
// anahtarlamak eşleşmeyi dile bağlar.
//
// Semboller RegisterStep14Screen ve EditProfileForm'daki haritalarla BİREBİR
// aynı: aynı burcu üç ekranda da aynı ikonla görüyorsun. Buradaki bir
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
  Cat,
  Bird,
  Rabbit,
  Rat,
  Turtle,
  Dog,
  Wine,
  Ban,
  HandHeart,
  Languages,
  Globe,
  type LucideIcon,
} from "lucide-react-native";

export type PillIconSpec = {
  sf: SFSymbol;
  lucide: LucideIcon;
  /** SFIcon'a aynen geçir — bkz. SFIcon.forceFallback. */
  forceFallback?: boolean;
};

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

// Burçların KANONİK sırası (Koç → Balık) — ZODIAC_ICONS zaten bu sırada
// yazıldığı için anahtarlarından türetiliyor.
//
// Burç ızgaraları bu sırayı KORUMAK ZORUNDA: kullanıcı kendi burcunu bilinen
// bir konumda arıyor. Genişliğe göre paketleyen PillFlow(fillWidth) bir yana,
// fillWidth'siz PillFlow bile satıra sığmayan pili atlayıp arkadakini öne
// çektiği için burçlarda KULLANILMAZ — düz flexWrap kullan.
const ZODIAC_ORDER = Object.keys(ZODIAC_ICONS);

/**
 * Burç seçeneklerini burç sırasına dizer (backend hangi sırada dönerse
 * dönsün). Haritada olmayan enumName'ler — backend yeni bir değer eklerse —
 * listenin SONUNA, geldikleri sırayla eklenir.
 */
export function sortZodiacOptions<T>(
  options: readonly T[],
  enumNameOf: (option: T) => string | null | undefined = (o: any) =>
    o?.enumName,
): T[] {
  const rank = (option: T) => {
    const at = ZODIAC_ORDER.indexOf(enumNameOf(option) ?? "");
    return at === -1 ? ZODIAC_ORDER.length : at;
  };
  // Array#sort kararlı → aynı rank'teki (tanınmayan) değerler özgün sırada.
  return [...options].sort((a, b) => rank(a) - rank(b));
}

// ─── Sigara (SmokingStatusType) ─────────────────────────────────────────────
// Register/EditProfileForm üç seçenekte de tek sembol (CIGARETTE_ICON)
// kullanıyor; ayırt eden şey pill metni. Aynı davranış burada da korunuyor.
//
// forceFallback: SF Symbols'ta cigarette YOK — tek yakın aday `smoke.fill` ve
// o bir duman bulutu, sigarayı okutmuyor. iOS'ta da lucide Cigarette
// çiziliyor. `sf` yine duruyor ki SF sembolü eklerse bayrağı silmek yetsin.
const CIGARETTE_ICON: PillIconSpec = {
  sf: "smoke.fill",
  lucide: Cigarette,
  forceFallback: true,
};

export const getZodiacIcon = (
  enumName: string | null | undefined,
): PillIconSpec => (enumName && ZODIAC_ICONS[enumName]) || STAR_ICON;

export const getSmokingIcon = (): PillIconSpec => CIGARETTE_ICON;

// ─── Evcil hayvan: legacy mod seçimi (hasPets: bool?) ───────────────────────
// Enum değil, 3 durumlu bool — anahtar değerin kendisi. "Var"/"Yok" sembolleri
// EditProfileForm'un PET_ICON_MAP'iyle hizalı (varsayılan pawprint, None → xmark);
// "farketmez" orada karşılığı olmayan, yalnız filtreye özgü üçüncü durum.
export const getHasPetsIcon = (value: boolean | null): PillIconSpec => {
  if (value === true) return { sf: "pawprint.fill", lucide: PawPrint };
  if (value === false) return { sf: "xmark", lucide: X };
  return { sf: "circle.dashed", lucide: Circle };
};

// ─── Evcil hayvan: tür bazlı seçim (PetType) ────────────────────────────────
// EditProfileForm'un PET_ICON_MAP'inin birebir aynısı — aynı hayvanı profil
// düzenleme ve filtre ekranında aynı ikonla görüyorsun. None/Allergic/Other
// filtre listesinde GÖSTERİLMİYOR (bkz. FILTER_HIDDEN_PETS), o yüzden buraya
// da alınmadı; tanımadığı ada pawprint'e düşer.
const PAWPRINT_ICON: PillIconSpec = { sf: "pawprint.fill", lucide: PawPrint };

const PET_ICONS: Record<string, PillIconSpec> = {
  Dog: { sf: "dog.fill", lucide: Dog },
  Cat: { sf: "cat.fill", lucide: Cat },
  Bird: { sf: "bird.fill", lucide: Bird },
  Fish: { sf: "fish.fill", lucide: Fish },
  Rabbit: { sf: "hare.fill", lucide: Rabbit },
  // Hamster/rat'ın SF karşılığı yok; PillIconSpec sf'i zorunlu tuttuğu için
  // iOS'ta pawprint'e düşüyor (Android'de EditProfileForm'daki Rat aynen).
  Hamster: { sf: "pawprint.fill", lucide: Rat },
  Reptile: { sf: "tortoise.fill", lucide: Turtle },
  Horse: PAWPRINT_ICON,
  Exotic: { sf: "sparkles", lucide: Sparkles },
};

export const getPetIcon = (
  enumName: string | null | undefined,
): PillIconSpec => (enumName && PET_ICONS[enumName]) || PAWPRINT_ICON;

// ─── Alkol (AlcoholUsageType) ───────────────────────────────────────────────
// Sigaradaki desen: TEK sembol, ayırt eden şey pill metni. "Kullanmıyorum"
// bir dönem yasak sembolüyle (nosign) çiziliyordu; satırı komşularından
// koparıyordu — üç seçenek de artık kadeh taşıyor, hangi seçenek olduğunu
// metin söylüyor.
const WINE_ICON: PillIconSpec = { sf: "wineglass.fill", lucide: Wine };

export const getAlcoholIcon = (): PillIconSpec => WINE_ICON;

// ─── Dini görüş (ReligiousViewType) ─────────────────────────────────────────
// Sigaradaki desen: TEK sembol, ayırt eden şey pill metni. Enum başına ikon
// (hilal/haç/Davud yıldızı) hem SF Symbols'ta karşılıksız hem de bir inancı
// sembolleştirip diğerini jenerik bırakma riski taşıyor. EditProfileForm'un
// RELIGIOUS_VIEW_ICON'uyla birebir aynı.
const RELIGIOUS_VIEW_ICON: PillIconSpec = {
  sf: "hands.and.sparkles.fill",
  lucide: HandHeart,
};

export const getReligiousViewIcon = (): PillIconSpec => RELIGIOUS_VIEW_ICON;

// ─── Dil (LanguageType) ─────────────────────────────────────────────────────
// EditProfileForm'un getLanguageIcon'uyla birebir aynı: "Diğer" globe, kalanlar
// konuşma balonu. 34 değerin her birine bayrak koymak (a) SF'te yok, (b) dil ≠
// ülke olduğu için yanlış eşleme üretirdi.
const LANGUAGES_ICON: PillIconSpec = {
  sf: "character.bubble",
  lucide: Languages,
};
const GLOBE_ICON: PillIconSpec = { sf: "globe", lucide: Globe };

export const getLanguageIcon = (
  enumName: string | null | undefined,
): PillIconSpec => (enumName === "Other" ? GLOBE_ICON : LANGUAGES_ICON);

// ─── Sınıf (ClassYearType) ──────────────────────────────────────────────────
// Değer int (0 = hazırlık, 1..6 = sınıf); sınıf numarası pill metninde zaten
// yazıyor, ikon yalnızca hazırlığı ayırıyor. RegisterStep8'in sınıf pill'lerinde
// ikon yok — bu eşleme filtreye özgü.
export const getYearOfStudyIcon = (year: number): PillIconSpec =>
  year === 0
    ? { sf: "book.fill", lucide: BookOpen }
    : { sf: "graduationcap.fill", lucide: GraduationCap };
