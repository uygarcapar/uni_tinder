import { colors, gradients, type Gradient } from "@/shared/theme/colors";

/**
 * Uygulama modu (Dating / Friends) — tip, sabitler ve MOD-FARKINDALI tema
 * getter'ları. Keşif'in iki modlu yapısının temel modülü: "hangi moddayız"
 * sorusunun TİPİ burada, "o modda hangi renk/ad" sorusunun CEVABI burada.
 *
 * ── Wire sözleşmesi ─────────────────────────────────────────────────────────
 * Değerler PascalCase STRING ("Dating" | "Friends") — API'nin enum kuralıyla
 * birebir (enum'lar PascalCase string, bkz. api wire format). Sunucuya giden
 * `mode` parametresi ve sunucudan gelen `availableModes` / `MatchNotification
 * .mode` alanları bu değerleri taşır; istemci kendi küçük-harf kopyasını
 * ÜRETMEZ (feedTypes'taki sort/kind istisnasının aksine — orada query param
 * case-insensitive'di, burada tek tip tutmak iki haritayı birden siler).
 *
 * ── Mutable palet kuralı ────────────────────────────────────────────────────
 * Getter'ların HEPSİ fonksiyon ve colors/gradients'ı ÇAĞRI ANINDA okuyor —
 * modül seviyesinde çözülen bir renk koyu değerde donar (tema değişimi kökü
 * remount ediyor, modül scope'u etmiyor; bkz. colors.ts başlığı ve
 * FireGlassButton > fireTint'in aynı gerekçesi).
 *
 * ── Tüketiciler (FE3'te bağlanır) ───────────────────────────────────────────
 * FireGlassButton (tint) · FireFlameCanvas (dalga dolgusu + kontur) ·
 * FireBurnCanvas · FireHeart · SwipeCard kenarlıkları · MatchModal perdesi ·
 * Keşif CTA'ları. Perde rengi HER ZAMAN bildirim payload'ının modundan
 * çözülür, ekrandaki seçili moddan DEĞİL (eşleşme diğer moddayken ya da
 * arka plandayken gelebilir).
 */

export type AppMode = "Dating" | "Friends";

export const APP_MODES: readonly AppMode[] = ["Dating", "Friends"];

/**
 * Varsayılan mod. Eski istemci sözleşmesinin istemci-içi aynası: sunucu
 * `mode` görmediğinde Dating sayıyor, istemci de bilmediğinde Dating'e düşer
 * (modPrefs'te kayıt yoksa, payload'da alan yoksa).
 */
export const DEFAULT_APP_MODE: AppMode = "Dating";

/** Bilinmeyen diske/payload'a karşı tip koruması (modePrefs + bildirimler). */
export function isAppMode(value: unknown): value is AppMode {
  return value === "Dating" || value === "Friends";
}

/**
 * Modun vurgu rengi — Dating'de litPlus kırmızısı, Friends'te friendsAccent
 * yeşili. Keşif'teki dolgulu CTA'lar (beğeni butonu, boş deste aksiyonu)
 * `colors.litPlus`u DOĞRUDAN okumayı bırakıp bunu okur.
 */
export function modeAccent(mode: AppMode): string {
  return mode === "Friends" ? colors.friendsAccent : colors.litPlus;
}

/**
 * Fire/Spark kalbinin dolgu gradyanı — buton, kart yanması, alev dalgası ve
 * MatchModal perdesi AYNI gradyandan okur (swipeHeart'ın "tek ateş" kuralı
 * moda taşındı).
 */
export function modeFireGradient(mode: AppMode): Gradient {
  return mode === "Friends" ? gradients.friendsHeart : gradients.swipeHeart;
}

/**
 * Fire/Spark butonunun düz tint'i = gradyanın İLK durağı.
 * FireGlassButton > fireTint'in mod-farkındalı hâli; o fonksiyon FE3'te buna
 * devrediliyor.
 */
export function modeFireTint(mode: AppMode): string {
  return modeFireGradient(mode)[0];
}

/** Kalbin kenarlık/soluk tonu — SwipeCard:1249/1278 ailesinin karşılığı. */
export function modeHeartBorder(mode: AppMode): string {
  return mode === "Friends" ? colors.friendsHeartBorder : colors.swipeHeartBorder;
}

/**
 * Alev dalgasının kontur rengi (FireFlameCanvas > OUTLINE'ın mod-farkındalı
 * kaynağı — o dosyadaki sabit FE3'te buraya devrediliyor).
 *
 * İkisi de MEDYA rengi: perde/dalga her temada aynı çizilir, o yüzden palet
 * token'ı değil sabit. Dating'in sıcak kremi ↔ Friends'in soluk nanesi —
 * rol aynı (dolguyla düşük kontrastlı, "ısınan kenar" okunuşu).
 */
export const FLAME_OUTLINE_DATING = "#FFD79E";
export const FLAME_OUTLINE_FRIENDS = "#B9F5D0";

export function modeFlameOutline(mode: AppMode): string {
  return mode === "Friends" ? FLAME_OUTLINE_FRIENDS : FLAME_OUTLINE_DATING;
}

/**
 * Ürünün mod içindeki GÖRÜNEN adı: Dating'de "Fire", Friends'te "Spark".
 * i18n anahtarı döner (çevrilmiş metin değil) — çağıran t() ile çözer, böylece
 * dil değişimi render'da kendiliğinden akar. Ad her iki dilde de çevrilmeden
 * kalır ("Fire" kuralının aynısı) ama yine de i18n'den geçer: tek kaynak.
 */
export function modeFireNameKey(mode: AppMode): string {
  return `discover.mode.fireName.${mode}`;
}

/** Keşif başlığındaki mod adının i18n anahtarı ("Flört" / "Arkadaş"). */
export function modeTitleKey(mode: AppMode): string {
  return `discover.mode.title.${mode}`;
}
