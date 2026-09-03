/**
 * TEK RENK KAYNAĞI. NativeWind renk katmanı (global.css --color-*, tailwind
 * theme.extend.colors) BİLEREK kaldırıldı: iki kaynak birbirinden kaymıştı
 * (--color-primary #F57656 vs colors.primary #ff4d3d) ve aynı "primary" iki
 * farklı kırmızı basıyordu. className yalnız layout/spacing/typography için.
 *
 * ── Mutasyon sözleşmesi ────────────────────────────────────────────────────
 * `colors` ve `gradients` MUTABLE. applyPalette() içeriği Object.assign ile
 * YERİNDE değiştirir, referans hiç değişmez — bu yüzden 73 dosyadaki ~600
 * `colors.x` çağrısı olduğu gibi çalışır ve inline style'lar bir sonraki
 * render'da yeni değeri okur.
 *
 * BUNUN KARŞILIĞINDA İKİ KURAL:
 *  1. Modül seviyesinde renk türetme. `const X = colors.surface2` bir kez
 *     değerlenir ve tema değişince bayat kalır — fonksiyona çevir.
 *  2. `as const` YOK ve olamaz; literal tipler mutasyonu engeller.
 *
 * Tema değişiminde kök ağaç remount edilir (App.tsx ThemeGate), böylece
 * memo'lu ağaçlar (chat balonları, LegendList, SwipeCard) da yeni paletle
 * bir kez taze mount olur.
 *
 * ── Token grupları ─────────────────────────────────────────────────────────
 *  • MOD İLE DÖNEN  — zemin/yüzey/metin/çizgi. darkPalette ↔ lightPalette.
 *  • SABİT          — marka + durum renkleri. İki modda da aynı.
 *  • MEDYA ÜSTÜ     — fotoğraf/gradyan üstündeki her şey (`onMedia*`,
 *                     `mediaScrim*`, `mediaChip*`). Fotoğraf açık modda da
 *                     fotoğraf: bunlar ASLA dönmez. SwipeCard, MatchModal ve
 *                     foto scrim'leri bu gruptan beslenir.
 */

type BlurTint = "dark" | "light";

interface Palette {
  // ── Marka (sabit) ────────────────────────────────────────────────────────
  primary: string;
  primaryWarm: string;
  primaryHot: string;
  messageOwn: string;
  litPlus: string;
  /** primary'nin düşük alfalı zemin tonu (seçili/vurgulu kart dolgusu). */
  primarySoft: string;

  // ── Durum (sabit) ────────────────────────────────────────────────────────
  success: string;
  error: string;
  errorStrong: string;
  warning: string;
  info: string;
  /**
   * Turuncu aksan — şu an yalnızca kırpma ekranının "Kaydet" cam butonu.
   * `warning` (#F59E0B, amber) DEĞİL: o uyarı semantiği taşıyor. Ton
   * gradients.premium'un orta durağıyla aynı, marka sıcaklığını koruyor.
   */
  accentOrange: string;
  likePink: string;
  /** SwipeCard super-like kalbi — buradan ayarla (gradient: gradients.swipeHeart). */
  swipeHeartBorder: string;
  errorLight: string;
  errorDeep: string;
  successIos: string;
  /** Yıkıcı/uyarı banner zemini (hesap silme bildirimi gibi). */
  dangerSurface: string;

  // ── Zemin & yüzey (mod ile döner) ────────────────────────────────────────
  bg: string;
  bgDeep: string;
  surface: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surface5: string;
  /**
   * Altındaki gradyan/fotoğraf tonunun sızmasına izin veren yarı saydam yüzey
   * (SwipeCard'ın açılmış detay bölümündeki kartlar). Zemin olarak `bg`'nin
   * saydam hâli — foto ÜSTÜNDEKİ rozetlerle karıştırma, onlar `mediaChipBg`.
   */
  surfaceTranslucent: string;
  /**
   * lit shop / SuperLike sheet'lerinin zemini (gradients.shopBackdrop'ın son
   * durağıyla eşleşir). MARKA DEĞİL, ZEMİN: bu iki sheet'in içeriği fotoğraf
   * değil normal chrome, o yüzden modla döner ve üstündeki her şey `text` /
   * `ink()` ile çizilir. Tek istisna litPlus dolgulu CTA — orası `onMedia`.
   */
  shopSurface: string;
  border: string;
  border2: string;

  // ── Metin (mod ile döner) ────────────────────────────────────────────────
  text: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textPlaceholder: string;

  /**
   * `success`in METİN tonu (SwipeCard'ın "çevrimiçi / bugün aktif" satırı).
   * Nokta/dolgu `success` ile çizilir ve sabittir, ama aynı yeşil AÇIK
   * zeminde okunmuyor (#34D399 üstü ~1.9:1) → bu token modla döner.
   * Fotoğrafın üstündeki metin bunu DEĞİL `success`i kullanır: orası medya.
   */
  successText: string;

  neutral100: string;
  neutral200: string;
  neutral500: string;
  neutral700: string;

  // ── Çizgiler (mod ile döner; POLARİTE çevirir) ───────────────────────────
  /**
   * Uygulamanın fiili kenarlık/ayraç rengi — pill border'ları, kart çerçeveleri,
   * input alt çizgileri. Koyuda beyaz-üstü-şeffaf, açıkta siyah-üstü-şeffaf.
   * Ara alfalar için ink() kullan.
   */
  hairline: string;
  hairlineSoft: string;
  hairlineStrong: string;
  hairlineMuted: string;
  /** Skeleton/shimmer parlama durağı. */
  shimmer: string;

  // ── Ters yüzey (mod ile döner; POLARİTE çevirir) ─────────────────────────
  /**
   * "Seçili" pill/buton dolgusu — koyuda beyaz, açıkta neredeyse siyah.
   * ÖNEMLİ: eskiden bu iş için `colors.text` kullanılıyordu; ikisi koyu modda
   * aynı değere denk geldiği için fark etmiyordu ama açık modda ayrışıyorlar.
   * Dolgu → inverseSurface, dolgunun ÜSTÜNDEKİ yazı → onInverseSurface.
   */
  inverseSurface: string;
  onInverseSurface: string;
  /**
   * inverseSurface'ın bir tık yumuşağı — hobi pilleri gibi ÇOK sayıda seçili
   * dolgunun aynı ekranda durduğu yerler için. Açık modda tam siyah bir pil
   * duvarı sert görünüyordu; bu ton biraz açık siyah.
   *
   * Koyu modda inverseSurface'in AYNISI (bilinçli): oradaki dolgu beyaz, beyazın
   * "daha açığı" yok — kırılsa yalnız kontrast düşerdi.
   */
  inverseSurfaceSoft: string;

  // ── Chrome (mod ile döner) ───────────────────────────────────────────────
  tabBarBg: string;
  tabBarInactive: string;
  /** Uygulama chrome'undaki BlurView'lar. Foto üstündekiler "dark" sabit kalır. */
  blurTint: BlurTint;

  // ── Sabit: gölge & modal perdesi ─────────────────────────────────────────
  /** Gölgeler açık modda da siyah — sadece daha görünür olurlar. */
  shadow: string;
  /** Modal/sheet arkasındaki karartma. Açık modda da koyu kalır. */
  scrim: string;

  // ── Sabit: MEDYA ÜSTÜ ────────────────────────────────────────────────────
  /**
   * SABİT renkli yüzeylerin üstündeki metin/ikonlar: fotoğraf, marka gradyanı
   * (litPlusCard, welcomeBackdrop), kendi mesaj balonu (messageOwn),
   * primary/litPlus/error dolgulu butonlar. Açık modda DA beyaz.
   *
   * shopBackdrop bu listede DEĞİL: lit shop sheet'leri modla dönüyor, oradaki
   * metin `text`/`ink()` ile çiziliyor (yalnız litPlus CTA'nın yazısı onMedia).
   */
  onMedia: string;
  onMediaMuted: string;
  onMediaFaint: string;
  /** Fotoğrafın altındaki okunabilirlik gradyanı. */
  mediaScrim: string;
  mediaScrimSoft: string;
  /** Foto üstündeki rozet/chip zeminleri. */
  mediaChipBg: string;
  mediaChipBgSoft: string;
  /** Foto üstündeki ince çerçeve — hairline'ın medya karşılığı, dönmez. */
  mediaHairline: string;
  /**
   * onMedia'nın tersi: SABİT AÇIK kalan yüzeylerin (marka gradyanı üstündeki
   * beyaz buton gibi) üstündeki koyu mürekkep. `text` DEĞİL — o açık modda
   * beyaza dönüp beyaz butonda kaybolurdu.
   */
  onMediaInverse: string;
}

const brand = {
  primary: "#ff4d3d",
  primaryWarm: "#ff4d3d",
  primaryHot: "#ff4d3d",
  messageOwn: "#ff3d3d",
  litPlus: "#ff3d3d",
  primarySoft: "rgba(255,77,61,0.1)",

  success: "#34D399",
  error: "#EF4444",
  errorStrong: "#fc213e",
  warning: "#F59E0B",
  info: "#3B82F6",
  accentOrange: "#FF8F17",
  // LikeToast'ın beğeni aksanı. Eskiden token #E0457B idi ama HİÇBİR YERDE
  // kullanılmıyordu; tek gerçek kullanım LikeToast'taki #ec4899 literaliydi —
  // token yaşayan değere hizalandı.
  likePink: "#ec4899",
  swipeHeartBorder: "#ff8e7a",
  errorLight: "#FCA5A5",
  errorDeep: "#ff2b2b",
  successIos: "#34C759",

  shadow: "#000000",
  scrim: "rgba(0,0,0,0.5)",

  onMedia: "#FFFFFF",
  onMediaMuted: "rgba(255,255,255,0.7)",
  onMediaFaint: "rgba(255,255,255,0.4)",
  mediaScrim: "rgba(0,0,0,0.99)",
  mediaScrimSoft: "rgba(0,0,0,0.45)",
  mediaChipBg: "rgba(18,18,18,0.8)",
  mediaChipBgSoft: "rgba(30,30,30,0.8)",
  mediaHairline: "rgba(255,255,255,0.1)",
  onMediaInverse: "#0B0B0C",
};

const darkPalette: Palette = {
  ...brand,

  bg: "#121212",
  bgDeep: "#0A0A0A",
  surface: "#1E1E1E",
  surface2: "#1F1F1F",
  surface3: "#262626",
  surface4: "#2A2A2A",
  surface5: "#1A1A1A",
  surfaceTranslucent: "rgba(18,18,18,0.8)",
  shopSurface: "#a83220",
  border: "#3A3A3A",
  border2: "#3E3E3E",

  text: "#FFFFFF",
  textSecondary: "#9CA3AF",
  textMuted: "#878787",
  textDisabled: "#4B5563",
  textPlaceholder: "#8B93A2",

  successText: "#34D399",

  neutral100: "#E5E7EB",
  neutral200: "#D1D5DB",
  neutral500: "#808080",
  neutral700: "#595959",
  dangerSurface: "#1a0608",

  hairline: "rgba(255,255,255,0.1)",
  hairlineSoft: "rgba(255,255,255,0.08)",
  hairlineStrong: "rgba(255,255,255,0.15)",
  hairlineMuted: "rgba(255,255,255,0.3)",
  shimmer: "rgba(255,255,255,0.07)",

  inverseSurface: "#FFFFFF",
  onInverseSurface: "#000000",
  inverseSurfaceSoft: "#FFFFFF",

  tabBarBg: "rgba(18,18,18,0.92)",
  tabBarInactive: "rgba(255,255,255,0.7)",
  blurTint: "dark",
};

const lightPalette: Palette = {
  ...brand,

  bg: "#FFFFFF",
  bgDeep: "#F2F2F7",
  // Koyuda yükseklik = açılmak, açıkta = koyulaşmak. Sıra korunur:
  // surface5 en hafif, surface4 en belirgin.
  surface: "#EFEFF2",
  surface2: "#EAEAEE",
  surface3: "#E4E4E8",
  surface4: "#DDDDE2",
  surface5: "#F5F5F7",
  surfaceTranslucent: "rgba(255,255,255,0.75)",
  // Koyudaki #a83220'nin açık karşılığı: aynı sıcak kırmızı ailesi, ama zemin
  // olacak kadar açık. Üstündeki metin `text` (#0B0B0C) ile okunuyor.
  shopSurface: "#FFD3C9",
  border: "#DCDCE0",
  border2: "#D2D2D8",

  text: "#0B0B0C",
  textSecondary: "#6B7280",
  textMuted: "#8E8E93",
  textDisabled: "#B0B4BB",
  textPlaceholder: "#9AA0AB",

  // Açık zeminde okunan yeşil: aynı aile, koyulaştırılmış (#34D399 → #0E9F6E).
  successText: "#0E9F6E",

  neutral100: "#1F2937",
  neutral200: "#374151",
  neutral500: "#9A9AA0",
  neutral700: "#B4B4B9",
  dangerSurface: "#FDECEC",

  hairline: "rgba(0,0,0,0.1)",
  hairlineSoft: "rgba(0,0,0,0.06)",
  hairlineStrong: "rgba(0,0,0,0.14)",
  hairlineMuted: "rgba(0,0,0,0.26)",
  shimmer: "rgba(0,0,0,0.05)",

  inverseSurface: "#0B0B0C",
  onInverseSurface: "#FFFFFF",
  inverseSurfaceSoft: "#26262A",

  tabBarBg: "rgba(255,255,255,0.92)",
  tabBarInactive: "rgba(0,0,0,0.55)",
  blurTint: "light",
};

/** expo-linear-gradient `colors` prop'u en az iki duraklı readonly tuple ister. */
export type Gradient = readonly [string, string, ...string[]];

interface GradientSet {
  swipeLike: Gradient;
  swipeNope: Gradient;
  premium: Gradient;
  premiumAlt: Gradient;
  /** Liste kenarlarındaki fade — zemine doğru erir, o yüzden modla döner. */
  neutralFade: Gradient;
  /**
   * PurchaseModal / SuperLikePurchaseModal: nötr gri → shopSurface.
   * locations={[0, 0.4, 1]}. MODLA DÖNER — sheet'in zemini chrome, foto değil.
   */
  shopBackdrop: Gradient;
  /** WelcomeScreen zemini: upsell kartının litPlus tonundan shopSurface koyusuna geçiş. */
  welcomeBackdrop: Gradient;
  /**
   * ProfileScreen premium kartları (aktif üyelik + upsell) ve plus sayfasındaki
   * plan kartları. Üçü de aynı gradyanı paylaşıyor — dolgu MEDYA, üstündeki
   * bütün mürekkep `onMedia*` ailesinden.
   */
  litPlusCard: Gradient;
  /** SwipeCard super-like kalbi dolgusu — buradan ayarla. */
  swipeHeart: Gradient;
  /**
   * ProfileScreen SuperLike kartı. Kartın dolgusu YOK — bu gradyan yalnız
   * 2px'lik çerçevede ve kalbin yuvarlak rozetinde görünür. Kart zemini
   * sayfanınkiyle aynı (colors.bg) olduğu için metin colors.text, rozetin
   * içindeki kalp ise colors.bg ile çizilir. Koyuda beyaz→gri çerçeve;
   * açıkta beyaz zeminde kaybolmasın diye koyu→gri'ye döner.
   */
  superLikeCard: Gradient;
  /**
   * SwipeCard "Burada ne arıyorum" bölümünün zemini. Diğer bölümler düz
   * surfaceTranslucent; bu bölüm gradyanla ayrışıyor. MODLA DÖNER — kart
   * chrome'unun üstünde duruyor, foto üstünde değil.
   *
   * Bu değer FALLBACK: enumName tanınmazsa (backend yeni bir niyet eklerse)
   * kullanılır. Bilinen niyetler `intentCards`ten kendi rengini alır.
   */
  intentCard: Gradient;
  /**
   * İlişki niyeti başına ayrı gradyan — kart aynı bölümde herkeste aynı
   * kırmızıyı göstermesin, niyet renkten de okunsun. Anahtar DAİMA enumName
   * (`display` Accept-Language'e göre değişir). `getIntentCardGradient` ile
   * oku, doğrudan indeksleme — bilinmeyen enum'da fallback kaybolur.
   */
  intentCards: Readonly<Record<string, Gradient>>;
}

/**
 * Niyet gradyanlarının ACCENT tonları (ikinci durak). Tek yerde duruyor ki
 * koyu/açık setler aynı hue'yu farklı alfayla kullansın — yeni niyet eklenince
 * burası + alttaki iki set değil, yalnız burası ve tint tablosu güncellenir.
 * `relationshipIntent.ts`teki ikon haritasıyla AYNI anahtarlar.
 */
const intentAccents = {
  LongTerm: "139,92,246", // mor — kalıcılık
  ShortTerm: "255,143,23", // turuncu — kısa/enerjik
  LongTermOpenToShort: "255,77,61", // primary kırmızı
  ShortTermOpenToLong: "236,72,153", // pembe
  StillFiguringOut: "37,99,235", // mavi — nötr/kararsız
} as const;

/**
 * Aynı accent'lerin %75 beyazla açılmış hâli — AÇIK modun İLK durağı. Beyazın
 * kendisi olamaz: kart komşularıyla (surfaceTranslucent) aynı görünüp gradyan
 * yalnız sağ alt köşede fark ediliyordu.
 */
const intentTintsLight = {
  LongTerm: "226,184,253",
  ShortTerm: "255,227,197",
  LongTermOpenToShort: "255,214,203",
  ShortTermOpenToLong: "250,209,230",
  StillFiguringOut: "201,216,250",
} as const;

const darkIntentCards = Object.fromEntries(
  Object.entries(intentAccents).map(([key, rgb]) => [
    key,
    ["rgba(18,18,18,0.8)", `rgba(${rgb},0.28)`] as Gradient,
  ]),
) as Record<string, Gradient>;

const lightIntentCards = Object.fromEntries(
  Object.entries(intentAccents).map(([key, rgb]) => [
    key,
    [
      `rgba(${intentTintsLight[key as keyof typeof intentTintsLight]},0.9)`,
      `rgba(${rgb},0.3)`,
    ] as Gradient,
  ]),
) as Record<string, Gradient>;

const fixedGradients = {
  swipeLike: ["#009DBD", "#57FAB6", "#046602"] as Gradient,
  swipeNope: ["#FC0341", "#FF4D4D", "#FFEF42"] as Gradient,
  premium: ["#FF3D3D", "#FF8F17", "#ff9a17"] as Gradient,
  premiumAlt: ["#FF173A", "#FF4D4D", "#FC803D"] as Gradient,
  welcomeBackdrop: ["#ff4d3d", "#ff5d3d", "#ff7e3d"] as Gradient,
  litPlusCard: ["#ff423d", "#ff5138"] as Gradient,
  // Son durak turuncudan bir tık kırmızıya çekildi (#ff5c33 → #ff452a): alev
  // perdesi (MatchModal) ekranın yarısını kaplıyor ve turuncu uç orada marka
  // kırmızısından kopuyordu. Buton/dalga/perde AYNI token — bkz. aşağıdaki not.
  swipeHeart: ["#fc1919", "#fc1e1e", "#ff452a"] as Gradient,
};

// SuperLike kutlaması artık renkli kalp konfetisi değil, tüm ekranı kaplayan
// prosedürel alev — renkleri shader'ın ısı rampasında (SuperLikeFlameCanvas),
// burada bir palet yok. Rampanın kırmızı durağı bilerek gradients.swipeHeart'ın
// ilk durağıyla (#fc1919) aynı: buton ve kutlama aynı ateşten okunsun.

const darkGradients: GradientSet = {
  ...fixedGradients,
  neutralFade: ["#FFFFFF", "#E5E7EB", "#9CA3AF"],
  superLikeCard: ["#fff", "#9c9c9c"],
  shopBackdrop: ["#2e2e2e", "#2e2e2e", "#a83220"],
  // surfaceTranslucent'ın koyusundan primary'nin sıcak tonuna. Son durak
  // düşük alfalı: metin (colors.text = beyaz) üstünde okunur kalsın.
  intentCard: ["rgba(18,18,18,0.8)", "rgba(255,77,61,0.28)"],
  intentCards: darkIntentCards,
};

const lightGradients: GradientSet = {
  ...fixedGradients,
  neutralFade: ["#0B0B0C", "#374151", "#6B7280"],
  superLikeCard: ["#3A3A3C", "#8E8E93"],
  shopBackdrop: ["#F2F2F7", "#F2F2F7", "#FFD3C9"],
  // Açıkta metin koyu → gradyan da açık kalmalı, ama sol üst durak BEYAZ
  // olmasın: primary'nin beyazla açılmış tonu (#FFD6CB) ile başlıyor, yoksa
  // kart komşularıyla (surfaceTranslucent) aynı görünüp gradyan yalnızca sağ
  // alt köşede fark ediliyordu. Bitiş durağı da orantılı koyulaştı — ilk durak
  // renklenince 0.16 alfa ile arada görünür bir geçiş kalmıyordu.
  intentCard: ["rgba(255,214,203,0.9)", "rgba(255,77,61,0.3)"],
  intentCards: lightIntentCards,
};

/**
 * Canlı palet. Referansı SABİT — applyPalette içeriği yerinde değiştirir.
 * Modül seviyesinde ondan sabit türetme (bkz. dosya başı sözleşme).
 */
export const colors: Palette = { ...darkPalette };
export const gradients: GradientSet = { ...darkGradients };

/**
 * KOYU paletin kendisi — `colors`ın aksine MUTASYONA UĞRAMAZ, hep koyu.
 *
 * Tek meşru kullanımı "açık modda da koyu mod mürekkebini isteyen" yüzeyler:
 * iOS 26 camının üstü. Cam zemini her iki modda da koyulaştırıyor ve açık
 * moddaki `colors.text` (#0B0B0C) orada yıkanıyor. Cam DIŞINDA her yerde doğru
 * olan `colors` — buradan okumadan önce yüzeyin gerçekten cam olduğunu
 * (`theme/glass > hasLiquidGlassSurface`) doğrula.
 */
export const darkColors: Palette = { ...darkPalette };

/**
 * İlişki niyetinin gradyanı. Render sırasında ÇAĞIR (modül seviyesinde sabite
 * alma) — `gradients` yerinde mutasyona uğruyor, erken okunan referans tema
 * değişince eskide kalır. Bilinmeyen/boş enumName → `intentCard` fallback'i.
 */
export function getIntentCardGradient(
  enumName: string | null | undefined,
): Gradient {
  return (
    (enumName && gradients.intentCards[enumName]) || gradients.intentCard
  );
}

export type ThemeMode = "light" | "dark";

let activeMode: ThemeMode = "dark";

/** themeMode.ts dışından ÇAĞIRMA — tema değişimi oradan yönetiliyor. */
export function applyPalette(mode: ThemeMode): void {
  activeMode = mode;
  Object.assign(colors, mode === "light" ? lightPalette : darkPalette);
  Object.assign(gradients, mode === "light" ? lightGradients : darkGradients);
}

/**
 * Moda göre polarite çeviren şeffaf mürekkep: koyuda beyaz-üstü, açıkta
 * siyah-üstü. hairline* token'larının karşılamadığı ara alfalar için.
 *
 * DİKKAT: fotoğraf/gradyan ÜSTÜNDEKİ beyaz şeffaflıklar için kullanma —
 * onlar açık modda da beyaz kalmalı, `onMedia*` / `mediaHairline` kullan.
 */
/**
 * "#RRGGBB" | "#RGB" → "rgba(r,g,b,a)". Zaten rgb/rgba ise olduğu gibi döner.
 * Bir TOKEN'ın saydam hâli gerektiğinde kullan — literal yazmak yerine:
 * `withAlpha(colors.surface2, 0.55)` tema değişince doğru rengi üretir.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;

  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body.slice(0, 6);
  if (full.length !== 6) return hex;

  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * SABİT siyah karartma: foto/gradyan üstündeki okunabilirlik scrim'i VE modal
 * arkası perdesi. Modla DÖNMEZ — fotoğraf açık modda da fotoğraf, modal perdesi
 * de her iki modda koyudur. Fonksiyon olması niyeti belgeliyor (ve sızıntı
 * taramasının bunları "unutulmuş literal" sanmasını engelliyor).
 *
 * DİKKAT: MaskedView'in `maskElement`'indeki rgba(0,0,0,a) değerleri RENK DEĞİL,
 * alfa kanalı matematiğidir — onlara DOKUNMA.
 */
export const scrimAt = (alpha: number): string => `rgba(0,0,0,${alpha})`;

/** Foto/gradyan üstündeki beyaz mürekkep. Modla DÖNMEZ. */
export const onMediaAt = (alpha: number): string =>
  `rgba(255,255,255,${alpha})`;

/** Aktif mod açık mı? Varlık/ikon seçimi gibi renk-dışı kararlar için. */
export const isLight = (): boolean => activeMode === "light";

/**
 * `ink()`in TERSİ — moda UYAN perde: koyuda siyah, açıkta beyaz.
 *
 * Fotoğrafın üstüne çekilen okunabilirlik perdesi bunu ister: koyu temada
 * fotoğrafı karartıp beyaz yazıyı taşır, açık temada fotoğrafı AÇARAK koyu
 * yazıyı taşır. `scrimAt()` her zaman siyah (modal perdesi), `ink()` ise
 * moda ZIT (ön plan mürekkebi) — üçünü karıştırma.
 *
 * DİKKAT: perdenin rengini çevirince ÜSTÜNDEKİ yazı da çevrilmeli, yoksa
 * beyaz perde üstünde beyaz yazı kalır.
 */
export function veil(alpha: number): string {
  return activeMode === "light"
    ? `rgba(255,255,255,${alpha})`
    : `rgba(0,0,0,${alpha})`;
}

/**
 * `veil()`in YÜZEY hali — perde değil, fotoğrafın üstüne oturan bir KUTU için.
 *
 * Fark yalnız koyu modda: perde tam siyah, bu ise bir tık açık (yüzeylerin
 * ailesinden, `surface` ~#1E1E1E civarı). Neredeyse opak büyük bir yüzey tam
 * siyah olduğunda fotoğrafta kesilmiş bir delik gibi duruyor; açık modda ikisi
 * de beyaz kaldığı için orada bir ayrım yok.
 *
 * Üstündeki yazı yine `colors.text` (koyuda beyaz, açıkta siyah).
 */
export function veilSurface(alpha: number): string {
  return activeMode === "light"
    ? `rgba(255,255,255,${alpha})`
    : `rgba(32,32,34,${alpha})`;
}

export function ink(alpha: number): string {
  return activeMode === "light"
    ? `rgba(0,0,0,${alpha})`
    : `rgba(255,255,255,${alpha})`;
}

export type ColorToken = keyof typeof colors;
