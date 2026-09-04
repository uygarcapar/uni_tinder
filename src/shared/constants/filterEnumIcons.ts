// Keşif filtresindeki premium enum pill'lerinin ikonları.
//
// relationshipIntent.ts ile aynı sözleşme: anahtar DAİMA enumName (PascalCase).
// `name`/`display` backend'de Accept-Language'e göre değişiyor — onunla
// anahtarlamak eşleşmeyi dile bağlar.
//
// Semboller EditProfileForm'daki haritayla BİREBİR aynı: aynı burcu üç ekranda
// da (kayıt, profil düzenleme, keşif filtresi) aynı ikonla görüyorsun. Buradaki
// bir sembolü değiştirirsen o haritayı da güncelle (legacy TR display
// anahtarlarını da taşıdığı için henüz tek dosyaya indirilmedi).
import type { SFSymbol } from "@/shared/components/SFIcon";
import { ZODIAC_GLYPH_ICONS } from "@/shared/components/ZodiacIcon";
import {
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
  Languages,
  Globe,
  type LucideIcon,
} from "@/shared/icons";

export type PillIconSpec = {
  sf: SFSymbol;
  lucide: LucideIcon;
  /** SFIcon'a aynen geçir — bkz. SFIcon.forceFallback. */
  forceFallback?: boolean;
};

// ─── Burç (ZodiacType) ──────────────────────────────────────────────────────
// Her burç KENDİ sembolüyle (♈–♓) çiziliyor. İki ara çözüm de elendi:
//   • Elementel karşılık (Koç → alev, Başak → yaprak) ikinci bir bilgi katmanı
//     istiyordu, üstelik Boğa ve Başak aynı yaprağa düşüp ayırt edilemiyordu.
//   • Unicode emojisi (♈️) renk almıyor — seçili/seçilmemiş ayrımı ikondan
//     düşüyor ve monokrom ikon setinin içinde yamalı duruyordu.
// Sembollerin kendisi elle çizilmiş SVG (bkz. components/icons/ZodiacGlyphs):
// SF Symbols'ta da lucide'da da burç yok.
//
// forceFallback: iOS'ta da bu glifler çiziliyor. `sf` yine duruyor — hem
// SFIcon'un imzası istiyor hem de SF ileride burç sembollerini eklerse
// bayrağı silmek yetsin diye elementel en yakın karşılık yazılı (sigara
// ikonundaki desenin aynısı, bkz. CIGARETTE_ICON).
const zodiacIcon = (sf: SFSymbol, enumName: string): PillIconSpec => ({
  sf,
  lucide: ZODIAC_GLYPH_ICONS[enumName],
  forceFallback: true,
});

const ZODIAC_ICONS: Record<string, PillIconSpec> = {
  Aries: zodiacIcon("flame.fill", "Aries"),
  Taurus: zodiacIcon("leaf.fill", "Taurus"),
  Gemini: zodiacIcon("wind", "Gemini"),
  Cancer: zodiacIcon("moon.fill", "Cancer"),
  Leo: zodiacIcon("sun.max.fill", "Leo"),
  Virgo: zodiacIcon("leaf.fill", "Virgo"),
  Libra: zodiacIcon("scalemass.fill", "Libra"),
  Scorpio: zodiacIcon("bolt.fill", "Scorpio"),
  Sagittarius: zodiacIcon("location.fill", "Sagittarius"),
  Capricorn: zodiacIcon("mountain.2.fill", "Capricorn"),
  Aquarius: zodiacIcon("drop.fill", "Aquarius"),
  Pisces: zodiacIcon("fish.fill", "Pisces"),
};

// Backend yeni bir değer eklerse yıldız — tanınmayan burcun karşılığı.
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
// İKON YOK — helper de yok, bilerek. Enum başına ikon (hilal/haç/Davud yıldızı)
// hem SF Symbols'ta karşılıksız hem de bir inancı sembolleştirip diğerini
// jenerik bırakma riski taşıyordu; tek jenerik sembol (hands.and.sparkles) ise
// her pilde AYNI tekrar edip hiçbir şey ayırt etmiyor, yalnız gürültü
// ekliyordu. Üç ekran da (kayıt, profil düzenleme, keşif filtresi) artık
// ikonsuz: ayırt eden tek şey metin.
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
