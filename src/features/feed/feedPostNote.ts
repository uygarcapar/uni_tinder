import type { AppMode } from "@/features/discover/modeTheme";
import { resolveCardMode } from "./feedCardMode";
import type { FeedPostDto, FeedPostNoteGate } from "./feedTypes";

/**
 * Akış satırındaki not butonunun kapısı — saf fonksiyonlar.
 *
 * ── Kapı neden SUNUCUDA ───────────────────────────────────────────────────────
 * Karar istemcide TÜRETİLEMİYOR, üç ayrı sebeple:
 *  • `FeedPostDto` yazarın karşılıklı uygun modlarını taşımıyor; o bilgi ancak
 *    kart açılınca `author-profile` ucundan geliyor ve listedeki her satır için
 *    o ucu çağırmak mümkün değil.
 *  • Yazarın izleyiciyi beğenmiş olup olmadığı istemcide TAM değil:
 *    `whoLikedMeIds` yalnız ilk sayfayı tutuyor (bkz. swipeSlice).
 *  • Not KİŞİ BAŞINA tek gidiyor (`UT-6404 ALREADY_SWIPED`), yani "bu yazara
 *    daha önce beğeni/not gitti mi" de kapının parçası — ve o bilgi hiç yok.
 * Üçünden biri yanlış tahmin edilirse ortaya sunucunun reddettiği bir buton
 * çıkıyor; bu dosyanın tek işi o butonu hiç çizmemek.
 *
 * ⚠️ BEYAZ LİSTE, kara liste DEĞİL. Sunucu `state`e yeni bir kapalı hâl
 * eklediğinde eski istemci onu tanımaz; kara liste yazılsaydı o gün buton
 * reddedilecek bir yere basardı.
 */
export function canNotePost(
  note: FeedPostNoteGate | null | undefined,
): boolean {
  return note?.state === "Ok";
}

/**
 * Satırda buton ÇİZİLSİN Mİ — sunucunun kapısı + notun gönderilebilmesi için
 * gereken asgari veri.
 *
 * ⚠️ `author` kontrolü `canNotePost`un İÇİNDE DEĞİL, burada: o fonksiyon
 * sunucunun kararını okuyor, bu fonksiyon ekranda bir buton çizmeye yetip
 * yetmediğini söylüyor. Yazarsız bir satırda (anonim gönderi, bayat kayıt,
 * sunucu `Ok` derken `author: null` yolladı) not gönderilemez — buton
 * çizilirse basınca HİÇBİR ŞEY olmaz, yani tam olarak kaçındığımız ölü buton.
 *
 * ⚠️ Gönderim kapısı (`postNoteRequest`) ile AYNI veriyi okuyor. İkisi
 * ayrışırsa ya ölü buton (çizip göndermemek) ya da sessiz kayıp (çizmeyip
 * gönderilebilir bir satırı saklamak) doğuyor.
 */
export function postNoteButtonVisible(post: FeedPostDto): boolean {
  return canNotePost(post.note) && !!post.author?.userId;
}

/**
 * Not hangi modda gidecek. Kapı kapalıysa mod da yok: `null` dönmesi
 * "gönderim denenmesin" demek.
 *
 * ⚠️ Mod kararı `resolveCardMode` ile ORTAK — akış kartının modunu seçen aynı
 * fonksiyon. İkinci bir kural yazılsaydı aynı yazar, aynı listede, karta
 * dokunulduğunda bir modda ve not butonuna dokunulduğunda başka bir modda
 * beğenilebilirdi.
 */
export function postNoteMode(
  note: FeedPostNoteGate | null | undefined,
  selectedMode: AppMode,
): AppMode | null {
  if (!canNotePost(note)) return null;
  return resolveCardMode(note?.availableModes, selectedMode);
}

/**
 * Not butonuna dokunulduğunda NE OLACAĞI — tek karar noktası.
 *
 * ⚠️ DÜZ KAYIT, ayrık birleşim DEĞİL (`{ action: "send"; userId: string } | …`
 * yazılmadı): bu projede TS'in ayrık birleşim daraltması çalışmıyor ve çağıran
 * tarafta `userId`nin string'e daralmadığı hatalar çıkıyor (bkz. kalıbın
 * gerekçesi: campusDecision). Alanlar ilgisiz dalda null.
 *
 * ⚠️ SIRA DEĞİŞMEZİ: yazar/mod kapısı BAKİYE kapısından ÖNCE. Tersi olsa,
 * notun hiç gönderilemeyeceği bir satırda (anonim yazar, bayat satır, uygun mod
 * yok) kullanıcıya paywall açılırdı — karşılığını veremeyeceğimiz bir teklif.
 */
export function postNoteRequest(
  post: FeedPostDto,
  notesRemaining: number | null | undefined,
  selectedMode: AppMode,
): {
  action: "send" | "paywall" | "none";
  userId: string | null;
  mode: AppMode | null;
  paywallReason: "empty_balance" | "unknown_balance" | null;
} {
  const none = {
    action: "none" as const,
    userId: null,
    mode: null,
    paywallReason: null,
  };

  const userId = post.author?.userId ?? null;
  if (!userId) return none;

  const mode = postNoteMode(post.note, selectedMode);
  if (!mode) return none;

  // Bakiye kapısı: gönderilemeyecek bir metni yazdırıp sonra reddetmek
  // kullanıcıyı iki kez kaybettirir (DiscoverScreen'deki aynı gerekçe).
  if (typeof notesRemaining !== "number") {
    return {
      action: "paywall",
      userId,
      mode,
      paywallReason: "unknown_balance",
    };
  }
  if (notesRemaining <= 0) {
    return { action: "paywall", userId, mode, paywallReason: "empty_balance" };
  }

  return { action: "send", userId, mode, paywallReason: null };
}
