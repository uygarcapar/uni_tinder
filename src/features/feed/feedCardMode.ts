import { isAppMode, type AppMode } from "@/features/discover/modeTheme";

/**
 * Akış kartının HANGİ MODDA açılacağının kararı — saf fonksiyon.
 *
 * Ekrandan ayrı dosyada çünkü üç girdili bir seçim ve yanlış dalı sessizce
 * yanlış modda beğeni atıyor: kullanıcı arkadaş olmak isterken flört beğenisi
 * gitmiş olur (ya da tersi) ve geri alınamaz.
 *
 * ── Kural ───────────────────────────────────────────────────────────────────
 * 1. Keşif'te seçili mod uygunsa O. Kullanıcı az önce "Arkadaş"ı seçtiyse
 *    akışta da arkadaş aradığını varsaymak doğru taraf.
 * 2. Değilse listedeki İLK uygun mod. Tek mod uygunsa kart o modda açılıyor
 *    ve kullanıcı ne yaptığını kartın renginden/etiketinden görüyor.
 * 3. Hiçbiri uygun değilse `null` → kart SALT OKUNUR.
 *
 * ⚠️ Liste SUNUCUDAN. İstemci karşı tarafın tercihlerini ve açık modlarını
 * bilmiyor (bilmemeli de), o yüzden burada bir "uygunluk hesabı" YOK — yalnız
 * sunucunun verdiği listeden seçim var.
 *
 * ⚠️ TOCTOU: liste kart ÇEKİLDİĞİNDE hesaplanıyor; hedef o arada modunu
 * kapatabilir. Sunucu aksiyon anında yeniden doğruluyor ve reddediyor —
 * istemci o hatayı zarif bir toast'a çevirip kartı salt okunura düşürüyor,
 * retry döngüsüne GİRMİYOR.
 */
export function resolveCardMode(
  availableModes: unknown,
  selectedMode: AppMode,
): AppMode | null {
  const modes = normalizeModes(availableModes);
  if (modes.length === 0) return null;
  if (modes.includes(selectedMode)) return selectedMode;
  return modes[0];
}

/**
 * Kartta HANGİ AKSİYONLAR çizilecek — moda VE "yazar beni beğenmiş mi"ye
 * göre, saf fonksiyonda. Üç hâl var:
 *
 * ── Kural (istek) ───────────────────────────────────────────────────────────
 * • NORMAL (henüz beğenilmemiş): yalnız Fire/Spark + not, X ve tik YOK. Akışta
 *   kart karşı taraftan gelen bir sinyale cevap DEĞİL — sen kendi isteğinle
 *   profile giriyorsun, reddedilecek bir şey yok (X'in anlamsızlığı). Tik de
 *   yok: bedelsiz düz beğeni akışı tek dokunuşla dağıtılan gürültüye çevirir
 *   (2026-10-22 kararı). İki mod da AYNI kümeyi alır — fark yalnız butonun
 *   adında ve renginde (`modeFireNameKey` · `modeFireTint`), Arkadaş'ta bile
 *   düz beğeni açılmaz.
 * • BEĞENİLMİŞ: kabul (tik) + reddet (X). Fire ve not YOK — karşı taraf seni
 *   zaten beğenmiş, üstüne yükseltecek bir sinyal yok (`LikerSwipeModal >
 *   allowFire` varsayılanının gerekçesiyle aynı). Bu hâl iki modda da aynı.
 * • MOD YOK (`resolveCardMode` null döndü): hiçbiri. Bu kapı EN BAŞTA ve
 *   `hasLikedMe`'yi EZER — sunucu "beni beğenmiş" derken yazarın açık modu
 *   olmayabilir; beğenilmiş hâli modsuzluğu ezerse sunucunun reddedeceği bir
 *   kabul butonu çizilir.
 *
 * ⚠️ `like`/`pass` bir ÇİFT, ayrı ayrı açılabilen iki bayrak değil: tek başına
 * duran bir X zaten bu işin düzelttiği hataydı. Aynı şekilde `fire`/`note` de
 * birlikte açılıp kapanıyor.
 *
 * ⚠️ Arkadaş'ta düz beğeninin tarihçesi salındı: 2026-10-22'de normal hâlde
 * açıldı, 2026-10-28'de bir kez kapatılıp aynı turda geri alındı, sonunda
 * "yalnız beğenilmiş hâlinde" olarak yerine oturdu. Bu testin işi o salınımı
 * dondurmak.
 *
 * ⚠️ Karar `cardMode` ile veriliyor, Keşif'te SEÇİLİ modla değil: aksiyon hangi
 * modda GİDİYORSA kuralı o mod koyuyor. Yazar yalnız Flört'te açıkken kullanıcı
 * Arkadaş sekmesinde olsa bile gidecek şey bir flört beğenisidir.
 *
 * ⚠️ Bu yalnız İSTEMCİ KAPISI. Sunucu düz beğeniyi Flört'te de kabul ediyor
 * (Keşif'teki deste aynı ucu kullanıyor) — buradaki iş butonu hiç çizmemek,
 * "gönder ama reddedilsin" değil.
 */
export type FeedCardActions = {
  /** Düz beğeni (tik butonu) çizilsin mi — `pass` ile birlikte açılır. */
  like: boolean;
  /** X (reddet) çizilsin mi — `like` ile birlikte açılır. */
  pass: boolean;
  /** Fire/Spark butonu çizilsin mi. */
  fire: boolean;
  /** Fotoğraf/prompt altındaki not kutuları çizilsin mi. */
  note: boolean;
};

export function feedCardActions(
  mode: AppMode | null,
  hasLikedMe: boolean,
): FeedCardActions {
  if (mode == null) return { like: false, pass: false, fire: false, note: false };
  if (hasLikedMe) return { like: true, pass: true, fire: false, note: false };
  return { like: false, pass: false, fire: true, note: true };
}

/**
 * Yazar beni daha önce beğenmiş mi — kartın HANGİ HÂLDE doğacağını belirleyen
 * tespit (bkz. `feedCardActions`'ın "BEĞENİLMİŞ" hâli).
 *
 * İki kaynağın OR'u (bkz. DiscoverScreen'deki aynı kalıp): sunucunun profil
 * bayrağı VEYA yerel "beni beğenenler" kümesi.
 *
 * ⚠️ Bayrak tarafı BUGÜN CANLI KAPSAMA DEĞİL: `api.ts > FEED_POST_AUTHOR_PROFILE`
 * açıkça yazıyor — gövde `GET /api/swipe/LikerProfile/{id}` ile birebir aynı
 * `ProfileCardDto`, "beğeniye özel alanlar — hasLikedMe, note — burada dolu
 * GELMEZ". Yani `hasLikedMe === true` dalı bugün için İLERİYE DÖNÜK kablolama;
 * sunucu bir gün bu uçta da alanı doldurursa kod zaten doğru tarafta olsun
 * diyedir, şu an pratikte hiçbir isteği true yapmaz. Gerçek kapsama tamamen
 * yerel kümeden geliyor ve o küme de TAM değil — yalnız seçili modun
 * likerlarının ilk sayfasını tutuyor (`getWhoLikedMe(1,10,10,mode)`, bkz.
 * `swipeSlice > applyWhoLikedMe`). Yanlış pozitif zaten bekleyen birine Fire
 * yakılmasını önlerken; yanlış negatif kullanıcıya hiçbir şey yapmayan iki
 * buton (Fire/not) gösteriyor.
 *
 * Yüklem (`likedLocally`) olarak alınıyor, doğrudan store'a bağlanmıyor:
 * fonksiyon SAF kalsın, Redux'u da hangi store şekli kullandığını da bilmesin.
 *
 * ⚠️ `userId` kapısı ÖNCE: boşsa (yok/null/"") bayrak true olsa BİLE false
 * dönüyor. Aksi halde kabul/reddet çizilir ama `LikerSwipeModal >
 * handleSwipe` userId'siz yalnız kartı kapatıyor — basılınca hiçbir şey
 * yapmayan iki buton.
 *
 * ⚠️ Bayrak karşılaştırması KATI `=== true`. Gevşetilirse ("Boolean(...)")
 * sunucudan gelen "false" string'i de true sayılır ve kullanıcıya yanlış hâl
 * gösterilir. Katı karşılaştırmanın güvenli tarafı: bilinmiyorsa normal kart.
 */
export function authorLikedMe(
  profile: unknown,
  likedLocally: (userId: string) => boolean,
): boolean {
  if (profile == null || typeof profile !== "object") return false;
  const { userId, hasLikedMe } = profile as {
    userId?: unknown;
    hasLikedMe?: unknown;
  };
  if (typeof userId !== "string" || userId === "") return false;
  if (hasLikedMe === true) return true;
  return likedLocally(userId);
}

/**
 * Sunucudan gelen listeyi temizler: bilinmeyen değerler ELENİYOR.
 *
 * Tanınmayan bir mod sorgu parametresine girerse sunucu 400 döner; ayrıca
 * ileride eklenecek üçüncü bir mod, onu desteklemeyen bu sürümde sessizce
 * "uygun" sayılıp kart o modda açılırdı.
 */
export function normalizeModes(value: unknown): AppMode[] {
  if (!Array.isArray(value)) return [];
  const out: AppMode[] = [];
  for (const raw of value) {
    if (isAppMode(raw) && !out.includes(raw)) out.push(raw);
  }
  return out;
}
