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
 * Kartta HANGİ AKSİYONLAR çizilecek — moda, "yazar beni beğenmiş mi"ye VE
 * "zaten eşleştik mi"ye göre, saf fonksiyonda. Dört hâl var:
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
 * • EŞLEŞMİŞ (istek): hiçbiri — Fire de not da çizilmez. Eşleşmiş biriyle
 *   zaten sohbet kanalı açık; ona akıştan "beğeni sinyali" yollamak ne bir şey
 *   açıyor ne de bir yere düşüyor, yalnız Fire/not bakiyesini yakıyor. Kabul/
 *   reddet de yok: ortada bekleyen bir karar YOK.
 * • MOD YOK (`resolveCardMode` null döndü): hiçbiri. Bu kapı EN BAŞTA ve
 *   `hasLikedMe`'yi EZER — sunucu "beni beğenmiş" derken yazarın açık modu
 *   olmayabilir; beğenilmiş hâli modsuzluğu ezerse sunucunun reddedeceği bir
 *   kabul butonu çizilir.
 *
 * ⚠️ EŞLEŞME KAPISI `hasLikedMe`'DEN ÖNCE. `authorLikedMe` eşleşmeyi zaten
 * dışlıyor (orada gerekçesi var) ama burada ikinci kez, bu fonksiyonun KENDİ
 * değişmezi olarak duruyor: çağıran taraf bayrağı başka bir kaynaktan
 * besleseydi (ör. yalnız yerel liker kümesi) eşleşmiş bir yazarda kabul/reddet
 * çizilirdi. Sıra tersine çevrilmemeli.
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
  isMatched: boolean,
): FeedCardActions {
  const none = { like: false, pass: false, fire: false, note: false };
  if (mode == null) return none;
  // Eşleşme kapısı beğenilmişliği EZİYOR — gerekçesi yukarıda.
  if (isMatched) return none;
  if (hasLikedMe) return { like: true, pass: true, fire: false, note: false };
  return { like: false, pass: false, fire: true, note: true };
}

/**
 * Yazarla ZATEN EŞLEŞMİŞ miyiz — kartın aksiyonsuz doğmasını belirleyen tespit
 * (bkz. `feedCardActions`). Bayrak `ProfileCardDto > isMatched`, uç `?mode=`
 * kapsamlı olduğu için eşleşme de MOD KAPSAMLI: Flört'te eşleştiğin biri
 * Arkadaş modunda açılan kartta hâlâ Fire/not alabilir — doğru taraf bu,
 * sohbet kanalı da mod başına ayrı.
 *
 * ⚠️ Karşılaştırma KATI (`=== true`): bilinmiyorsa normal kart. Gevşetilirse
 * ("Boolean(...)") sunucudan gelen "false" string'i aksiyonları sessizce
 * yutardı — bu yönde hata kullanıcının elinden Fire/not'u alır.
 *
 * ⚠️ PREMIUM KAPISI YOK ve olmamalı: bu bir gizleme, bir hak değil. Tier'a
 * bağlanırsa free kullanıcı eşleştiği birine Fire yakmaya devam eder.
 */
export function authorIsMatched(profile: unknown): boolean {
  if (profile == null || typeof profile !== "object") return false;
  return (profile as { isMatched?: unknown }).isMatched === true;
}

/**
 * Yazarın BEKLEYEN bir beğenisi var mı — kartın "BEĞENİLMİŞ" hâlinde doğup
 * doğmayacağını belirleyen tespit (bkz. `feedCardActions`).
 *
 * İki kaynağın OR'u (bkz. DiscoverScreen'deki aynı kalıp): sunucunun profil
 * bayrağı VEYA yerel "beni beğenenler" kümesi.
 *
 * ── Sunucu kolu (2026-10-30'dan beri CANLI) ─────────────────────────────────
 * Bir dönem ÖLÜYDÜ: `api.ts > FEED_POST_AUTHOR_PROFILE` "beğeniye özel alanlar
 * — hasLikedMe, note — burada dolu GELMEZ" diyordu ve bu dal hiçbir isteği true
 * yapmıyordu. Backend alanı doldurdu (`FeedReplyQueryService` →
 * `GetSwipeActionAsync(authorId, userId, mode)`); artık asıl kapsama bu koldan
 * geliyor. `api.ts`'teki sözleşme notu da güncellendi — `note` orada hâlâ boş.
 *
 * Bayrak MOD KAPSAMLI: istekteki `?mode=` için hesaplanıyor, yani "bu kişi beni
 * BU MODDA beğenmiş mi". Çapraz mod üretmiyor.
 *
 * ── Yerel kol (hâlâ yedek, hâlâ EKSİK) ──────────────────────────────────────
 * Yalnız SEÇİLİ MODUN likerlarının ilk sayfasını tutuyor
 * (`getWhoLikedMe(1,10,10,mode)`, bkz. `swipeSlice > applyWhoLikedMe`). Sunucu
 * kolu canlandığı için artık asıl taşıyıcı değil ama duruyor: liste ucu free'de
 * de tam geliyor ve canlı `IncomingLike` kümeye anında yazıyor, yani sunucu
 * yanıtı bayatken bile doğru cevabı verebiliyor.
 *
 * ⚠️ Bu kol SEÇİLİ moda bağlı olduğu için ÇAĞIRAN TARAFTA `cardMode ===
 * selectedMode` kapısıyla sarılıyor (bkz. FeedScreen). Buraya taşımaya kalkma:
 * fonksiyon modu bilmiyor ve bilmemeli.
 *
 * ── Üç dışlama ──────────────────────────────────────────────────────────────
 * Soru "beni beğendi mi" DEĞİL, "BEKLEYEN bir kararı var mı". Üçü de
 * bekleyenliği öldürüyor:
 *
 * 1. `userId` boşsa (yok/null/"") bayrak true olsa BİLE false. Aksi halde
 *    kabul/reddet çizilir ama `LikerSwipeModal > handleSwipe` userId'siz yalnız
 *    kartı kapatıyor — basılınca hiçbir şey yapmayan iki buton.
 * 2. `isMatched === true` → ZATEN EŞLEŞTİK. Backend'in uyarısı: karşılıklı
 *    beğenide `hasLikedMe` YİNE true dönüyor. Bu dışlama olmazsa eşleştiğin
 *    birinin gönderisine girince kart "kabul et / reddet" ile açılır ve olmayan
 *    bir bekleyen karar ima eder.
 * 3. `myLikeDate` dolu → BEN ONU ZATEN BEĞENDİM. Kabul edilecek bir şey yok;
 *    beğenim sunucuda duruyor, karşı taraf beğenmediyse eşleşme de yok.
 *
 * Yüklem (`likedLocally`) olarak alınıyor, doğrudan store'a bağlanmıyor:
 * fonksiyon SAF kalsın, Redux'u da hangi store şekli kullandığını da bilmesin.
 *
 * ⚠️ Karşılaştırmalar KATI (`=== true`, `typeof ... === "string"`). Gevşetilirse
 * ("Boolean(...)") sunucudan gelen "false" string'i de true sayılır. Katılığın
 * güvenli tarafı: bilinmiyorsa normal kart.
 *
 * ⚠️ PREMIUM KAPISI BURADA DEĞİL. Bu fonksiyon bir OLGU döndürüyor ("bekleyen
 * beğeni var mı"), İZİN değil. Tier kararı çağıranda (bkz. FeedScreen >
 * `authorHasLikedMe`) çünkü premium'un tek kaynağı bir hook
 * (`usePremiumTier`) ve saf fonksiyon ona bağlanamaz.
 *
 * ⚠️ `likedMeAt` ve `isSuperLike` de bu uçta artık dolu geliyor ama BURADA
 * OKUNMUYOR: ikisi de "ne zaman / nasıl beğendi" bilgisi, bekleyenliği
 * değiştirmiyor. `isSuperLike` ileride kartta "Fire'la beğendi" ayrımını
 * mümkün kılar — bilinçli olarak kapsam dışı.
 */
export function authorLikedMe(
  profile: unknown,
  likedLocally: (userId: string) => boolean,
): boolean {
  if (profile == null || typeof profile !== "object") return false;
  const { userId, hasLikedMe, isMatched, myLikeDate } = profile as {
    userId?: unknown;
    hasLikedMe?: unknown;
    isMatched?: unknown;
    myLikeDate?: unknown;
  };
  if (typeof userId !== "string" || userId === "") return false;
  // Bekleyenliği öldüren iki durum — gerekçeleri yukarıda (2) ve (3).
  if (isMatched === true) return false;
  if (typeof myLikeDate === "string" && myLikeDate !== "") return false;
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
