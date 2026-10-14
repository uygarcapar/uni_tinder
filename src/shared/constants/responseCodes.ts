// Frontend code → {metin, aksiyon, davranış} sözlüğü.
// Kaynak: ClickUp "Frontend: Discovery & Response" → "API Contract — Master" task'ı.
// Backend Errors.cs canonical katalog; bu dosya o kataloğun frontend ayna kopyası.
//
// Kural (Task 🔤): UI metni backend message'ına değil code'a bağlanır. message
// yalnızca bilinmeyen code geldiğinde fallback. Yeni kod eklendiğinde önce
// backend Errors.cs, sonra burası güncellenir.

import type {
  EmptyReason,
  PaywallType,
  ResponseCode,
} from "@/shared/types";

// Aksiyon tipleri — empty-state action butonu ya da paywall CTA'sının nereye
// gideceğini soyut bir intent olarak ifade eder. UI tarafı switch'le ele alır.
// Ekran-bağımsız tutuldu (DiscoverScreen, ChatScreen, ProfileScreen aynı code
// ile farklı navigasyon yapabilsin).
export type CodeAction =
  | { kind: "openFilters" }
  // Kalıcı "mesafe sınırı olmasın" anahtarını AÇAR (tek seferlik genişletme
  // değil — o akış 2026-08-22'de kaldırıldı). Filtre ekranına atmak yerine
  // doğrudan uygulanıyor: tek dokunuşla çözülen bir sorun için ekran
  // değiştirmek gereksiz sürtünme.
  | { kind: "removeDistanceLimit" }
  | { kind: "completeProfile" }
  | { kind: "openPaywall"; paywallType?: PaywallType }
  | { kind: "contactSupport" }
  | { kind: "retry" }
  | { kind: "dismiss" };

export interface CodeEntry {
  code: ResponseCode;
  emptyReason?: EmptyReason;
  // Kısa, kullanıcıya gösterilecek TR başlık. Backend
  // emptyReasonMessage daha uzun gelirse onu fallback olarak kullan.
  title: string;
  // Buton etiketi (TR). Backend emptyReasonAction varsa onu tercih et;
  // boşsa burası fallback.
  actionLabel: string;
  action: CodeAction;
  // PoolWarming gibi geçici durumlar için: empty-state polling
  // tetiklensin mi. Diğer kodlarda blind retry yapılmamalı.
  autoRetry?: boolean;
}

// Master tablosu — Task 📚 + 🗺️ birleştirilmiş hâli.
// Object literal yerine sıralı array: yeni kod sonuna eklenir, lookup map
// aşağıda türetilir.
const CODE_ENTRIES: CodeEntry[] = [
  // Mesafe 2026-08-21'den beri KATI filtre → bu kod artık çok daha sık
  // görülüyor (dar yarıçap seçen kullanıcı gerçekten boş deste alıyor).
  // Aksiyon kalıcı anahtarı açıyor; kod DEĞİŞMEDİ, yalnız metin ve davranış
  // değişti (2026-08-22). Anahtar zaten açıkken buton çizilmez — o durumda
  // yapılacak tek şey filtreleri gevşetmek (bkz. DiscoverScreen emptyCopy).
  {
    code: "UT-6001",
    emptyReason: "NoCandidatesInRadius",
    title: "Yakınında şu an gösterecek kimse yok",
    actionLabel: "Mesafe Sınırını Kaldır",
    action: { kind: "removeDistanceLimit" },
  },
  {
    code: "UT-6002",
    emptyReason: "AllCandidatesSeen",
    title: "Görebileceklerinin hepsini gördün, daha sonra tekrar gel",
    actionLabel: "Daha Sonra Bak",
    action: { kind: "dismiss" },
  },
  {
    code: "UT-6003",
    emptyReason: "FiltersTooStrict",
    title: "Filtrelerin çok dar",
    actionLabel: "Filtreleri Düzenle",
    action: { kind: "openFilters" },
  },
  {
    code: "UT-6004",
    emptyReason: "ProfileIncomplete",
    title: "Önce profilini tamamla",
    actionLabel: "Profili Tamamla",
    action: { kind: "completeProfile" },
  },
  {
    code: "UT-6005",
    emptyReason: "AccountRestricted",
    title: "Hesabın geçici olarak kısıtlı",
    actionLabel: "Destek",
    action: { kind: "contactSupport" },
  },
  {
    code: "UT-6006",
    emptyReason: "PoolWarming",
    title: "Aday havuzu hazırlanıyor",
    actionLabel: "Tekrar Dene",
    action: { kind: "retry" },
    autoRetry: true,
  },
  {
    code: "UT-3001",
    emptyReason: "SwipeLimitReached",
    title: "Günlük swipe limitin doldu",
    actionLabel: "Premium'u İncele",
    action: { kind: "openPaywall", paywallType: "SWIPE_LIMIT" },
  },
  // ── Fire paketi redeem'i ────────────────────────────────────────────
  // Bu üçü empty-state değil, satın alma sonucu. Buraya alınmalarının sebebi:
  // redeem'de karar HTTP status'tan değil `code`'dan verilmeli (backend
  // 2026-08-11'de "başka hesaba ait" durumunu 402'den 400'e taşıdı; status'a
  // bakan eski FE bunu webhook yarışı sanıp sonuçsuz retry döngüsüne giriyordu).
  {
    code: "UT-6101",
    title: "Satın alman doğrulanıyor",
    actionLabel: "Tamam",
    action: { kind: "dismiss" },
    autoRetry: true, // tek geçici durum — 3 sn sonra tekrar, sonra kuyruk
  },
  {
    code: "UT-6102",
    title: "Bu paket şu an tanımlı değil",
    actionLabel: "Destek'e Yaz",
    action: { kind: "contactSupport" },
  },
  {
    code: "UT-6103",
    title: "Bu satın alma bu hesaba ait değil",
    actionLabel: "Tamam",
    action: { kind: "dismiss" },
  },
  // ── Kurtarma paketi redeem'i: KALDIRILDI (UT-62xx) ───────────────────────
  // 2026-08-31'de kurtarma consumable'ı tamamen kaldırıldı (premium ayrıcalığı
  // oldu), `/Recovery/Redeem` ucu silindi ve UT-6201/6202/6203 emekliye ayrıldı.
  // Backend bu numaraları BAŞKA BİR AİLEYE VERMEYECEK (testle kilitli), o yüzden
  // burada boş bırakılıyorlar — bkz. aşağıdaki numaralandırma tarihçesi.
  // ── Not paketi redeem'i (UT-641x) ────────────────────────────────────────
  // UT-61xx/UT-62xx ile aynı üçlü, üçüncü aile. Numaralar UT-640x'ten (gönderim
  // hataları) sonra başlıyor: iki grup da UT-64xx içinde ama karışmıyorlar.
  {
    code: "UT-6411",
    title: "Satın alman doğrulanıyor",
    actionLabel: "Tamam",
    action: { kind: "dismiss" },
    autoRetry: true, // tek geçici durum — 3 sn sonra tekrar, sonra kuyruk
  },
  {
    code: "UT-6412",
    title: "Bu paket şu an tanımlı değil",
    actionLabel: "Destek'e Yaz",
    action: { kind: "contactSupport" },
  },
  {
    code: "UT-6413",
    title: "Bu satın alma bu hesaba ait değil",
    actionLabel: "Tamam",
    action: { kind: "dismiss" },
  },
];

/**
 * Redeem yanıtının `code` alanı → kalıcı mı, retry edilebilir mi.
 *
 * `null`/bilinmeyen kod geldiğinde HTTP status'a düşülür (eski backend
 * sürümleri `code` göndermiyor olabilir).
 */
export const REDEEM_CODES = {
  PENDING_WEBHOOK: "UT-6101",
  UNKNOWN_PRODUCT: "UT-6102",
  BELONGS_TO_ANOTHER_USER: "UT-6103",
} as const;

// `RECOVERY_REDEEM_CODES` (UT-6201/6202/6203) KALDIRILDI — bkz. yukarıdaki not.
// ⚠️ UT-62xx AİLESİ REZERVE: yeni bir akışa bu numaraları vermeyin. Sürüm
// geçişinde cihazda kalmış eski bir redeem kaydı yabancı bir uca flush edilirdi
// (kuyruğun kendisi temizleniyor — discover/recoveryQueuePurge.ts).

/**
 * Not paketinin aynı üçlüsü. Sıra (webhook → ürün → hesap) DEĞİŞMEMELİ: motor
 * kodları `{PENDING_WEBHOOK, UNKNOWN_PRODUCT, BELONGS_TO_ANOTHER_USER}` şeklinde
 * config'ten okuyor, sıra bozulursa kalıcı bir hata "geçici" sayılır ve her
 * açılışta tekrarlanan sonuçsuz bir retry döngüsü doğar.
 */
export const NOTE_REDEEM_CODES = {
  PENDING_WEBHOOK: "UT-6411",
  UNKNOWN_PRODUCT: "UT-6412",
  BELONGS_TO_ANOTHER_USER: "UT-6413",
} as const;

/** Bir redeem akışının üç kodu — engine bunu config olarak alıyor. */
export type RedeemCodeSet = typeof REDEEM_CODES | typeof NOTE_REDEEM_CODES;

/**
 * Not GÖNDERİM hataları (UT-640x) — redeem ailesinden ayrı.
 *
 * `CODE_ENTRIES`e koyulmadılar: metinleri composer içinde inline gösteriliyor
 * (empty-state ya da satın alma başlığı değiller) ve `resolveCode`'un global
 * haritasına girerlerse redeem akışı kalıcı hata metnini buradan okumaya
 * başlar — UT-62xx'te tam olarak bu kaza yaşandı (bkz. aşağıdaki not).
 *
 * ÇAKIŞMA ÇÖZÜLDÜ (2026-08-26, backend commit `9874f4d`). Bu altılı önce
 * `UT-630x`ti; backend aynı gün `UT-63xx`'in tamamını FOTOĞRAF MODERASYONUNA
 * vermişti (`48a6f52`) ve iki tablo birebir çakışıyordu. Taşınan taraf not
 * oldu — foto kodları canlıda dönüyor, not ürünü hiçbir yerde yayında değildi.
 * Geçiş penceresi YOK: eski `UT-630x` numaraları not için hiç dönmedi, o yüzden
 * foto tarafındaki gibi geriye dönük eşleme satırı da yok.
 *
 * ⚠️ İki sözlük yine de AYRI kalmalı (`PHOTO_MODERATION_CODES` ile
 * birleştirmeyin): numaralar artık ayrışsa da tek tabloya girmeleri
 * `resolveCode`'u yeniden çakışmaya açık hale getirir.
 */
export const NOTE_SEND_CODES = {
  NO_BALANCE: "UT-6401",
  INVALID_COMMENT: "UT-6402",
  INVALID_TARGET: "UT-6403",
  ALREADY_SWIPED: "UT-6404",
  TARGET_UNAVAILABLE: "UT-6405",
  COMMENT_REJECTED: "UT-6406",
  // Suistimal freni (429): saatlik cap ya da arka arkaya moderasyon reddi.
  // Backend'in eklediği kod — öneri dokümanında yoktu. Kredi harcanmaz.
  RATE_LIMITED: "UT-6407",
} as const;

export type NoteSendCode =
  (typeof NOTE_SEND_CODES)[keyof typeof NOTE_SEND_CODES];

/** code → i18n anahtarı. Bilinmeyen kodda çağıran jenerik metnine düşer. */
const NOTE_SEND_I18N: Record<NoteSendCode, string> = {
  [NOTE_SEND_CODES.NO_BALANCE]: "note.codes.UT-6401",
  [NOTE_SEND_CODES.INVALID_COMMENT]: "note.codes.UT-6402",
  [NOTE_SEND_CODES.INVALID_TARGET]: "note.codes.UT-6403",
  [NOTE_SEND_CODES.ALREADY_SWIPED]: "note.codes.UT-6404",
  [NOTE_SEND_CODES.TARGET_UNAVAILABLE]: "note.codes.UT-6405",
  [NOTE_SEND_CODES.COMMENT_REJECTED]: "note.codes.UT-6406",
  [NOTE_SEND_CODES.RATE_LIMITED]: "note.codes.UT-6407",
};

export function noteSendCodeI18nKey(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return NOTE_SEND_I18N[code as NoteSendCode] ?? null;
}

/**
 * Kalıcı mı? Yalnız "ürün tanımsız" ve "başka hesaba ait" retry ile çözülmez;
 * bekleyen webhook (402) çözülür.
 *
 * `codes` verilmezse İKİ aile birden kontrol edilir. Çağıranın hangi ürünü
 * redeem ettiğini bilmediği yerler için (ör. jenerik hata gösterimi) doğru
 * davranış bu: yanlış ailenin kodunu "geçici" sayıp sonsuz retry üretmektense
 * kalıcı saymak.
 */
export function isPermanentRedeemCode(
  code: string | null | undefined,
  codes?: RedeemCodeSet,
): boolean {
  const families = codes ? [codes] : [REDEEM_CODES, NOTE_REDEEM_CODES];
  return families.some(
    (f) =>
      code === f.UNKNOWN_PRODUCT || code === f.BELONGS_TO_ANOTHER_USER,
  );
}

// ── Fotoğraf moderasyonu (UT-63xx) ──────────────────────────────────────────
//
// Numaralandırma tarihçesi (iki kez çakıştı, ikisi de aynı sebepten):
//
//   1. Foto moderasyonu 2026-08-24'te `UT-62xx` ile geldi ("boştu" denerek).
//      Değildi: `RECOVERY_REDEEM_CODES` orada canlıydı. Recovery kodları
//      `Errors.cs`te değil `SwipeCommands.cs` içinde `const string` durduğu
//      için katalog taramasına görünmemişti. Backend foto ailesini
//      `UT-63xx`'e taşıdı (`48a6f52`); recovery `UT-62xx`'te KALDI.
//      2026-08-31'de recovery consumable'ı tümden kaldırıldı ve UT-62xx emekli
//      oldu — ama foto ailesi `UT-63xx`'te KALIYOR, geri taşınmıyor: numaralar
//      canlıda dönüyor. UT-62xx de yeniden kullanılmayacak (backend testle
//      kilitledi), yani bu blok kalıcı olarak boş.
//
//   2. `UT-6301`–`UT-6306` bu istemcide zaten doluydu: `NOTE_SEND_CODES`.
//      Aynı kazanın üçüncü tekrarıydı. 2026-08-26'da backend NOT ailesini
//      `UT-64xx`'e taşıdı (`9874f4d`); foto `UT-63xx`'te KALDI — foto kodları
//      canlıda dönüyor, not ürünü henüz hiçbir yerde yayında değildi.
//      Aşağıdaki tablo bu yüzden dokunulmadan duruyor.
//
// İki sözlük BİRLEŞTİRİLMEMELİ (backend de bunu doğruladı): foto kodları
// yalnız foto/profil akışlarından, not kodları yalnız composer'dan okunuyor.
// Aynı `resolveCode` tablosuna girselerdi not gönderen kullanıcı "Fotoğraf
// tavanı aşıldı" görürdü. `CODE_ENTRIES`e bu yüzden hiçbiri konmuyor.
//
// `UT-6301`/`UT-6302` ARTIK SENKRON HTTP YANITI OLARAK DA DÖNÜYOR (2026-09-07,
// backend `Errors.cs:88`). Bu blok eskiden "hiç tetiklenmiyorlar, tanımlamanın
// faydası yok" diyordu; o doğruydu ama artık değil: var olan bir fotoğrafı ANA
// YAPMA yolu (sürükle-bırak sıralama ya da "Ana Yap") 400 + `code` ile
// reddediliyor. Kodu okumayan çağıran jenerik "doğrulama hatası" gösteriyor ve
// kullanıcı NEDEN reddedildiğini bilmeden aynı kaydete basıp duruyordu.
//
// `UT-6307` (silme reddi) aynı ailenin üçüncü üyesi: ana fotoğrafı silmek
// sıradaki uygun olmayan fotoğrafı ana yapacaksa istek reddediliyor.
//
// Asenkron moderasyon yolu DEĞİŞMEDİ — `photos[]` içindeki `reasonCode` hâlâ
// photoModeration.moderationReasonText'ten okunuyor. İki yol aynı numaraları
// kullanıyor, kaynakları farklı.
export const PHOTO_MODERATION_CODES = {
  MAIN_PHOTO_MULTIPLE_FACES: "UT-6301",
  MAIN_PHOTO_NO_FACE: "UT-6302",
  PHOTO_LIMIT_EXCEEDED: "UT-6303",
  BELOW_MIN_PHOTOS: "UT-6304",
  APPEAL_CONFLICT: "UT-6305",
  PROVIDER_UNAVAILABLE: "UT-6306",
  NEXT_MAIN_PHOTO_NOT_ELIGIBLE: "UT-6307",
} as const;

export type PhotoModerationCode =
  (typeof PHOTO_MODERATION_CODES)[keyof typeof PHOTO_MODERATION_CODES];

// code → i18n anahtarı.
//
// GEÇİŞ PENCERESİ: foto ailesinin eski `UT-62xx` numaraları da AYNI metne bağlı.
// Backend deploy'u FE'yi bekliyor, yani bu sürüm bir süre eski kodları döndüren
// sunucuyla konuşacak. Eşleme yalnız BU sözlükte kalmalı: global tabloya
// girselerdi `resolveCode` yeniden çakışmaya açılırdı. (Recovery'nin UT-62xx
// ailesi 2026-08-31'de emekliye ayrıldı, yani numaralar artık yalnız bu geçiş
// penceresinin işi.) Backend deploy edildikten bir sürüm sonra silinecekler.
const PHOTO_CODE_I18N: Record<string, string> = {
  // Ana fotoğraf yüz kuralları — senkron 400 yanıtından geliyorlar.
  // 🔴 `UT-62xx` geçiş eşlemesi BUNLARA YAZILMADI: eski numaralar foto
  // ailesinin 6303-6306 üyeleri için verilmişti, 6301/6302/6307 o pencerede
  // hiç dönmedi. Uydurma bir eşleme burada yanlış metin gösterirdi.
  [PHOTO_MODERATION_CODES.MAIN_PHOTO_MULTIPLE_FACES]: "profile.photoCodes.UT-6301",
  [PHOTO_MODERATION_CODES.MAIN_PHOTO_NO_FACE]: "profile.photoCodes.UT-6302",
  [PHOTO_MODERATION_CODES.NEXT_MAIN_PHOTO_NOT_ELIGIBLE]: "profile.photoCodes.UT-6307",
  [PHOTO_MODERATION_CODES.PHOTO_LIMIT_EXCEEDED]: "profile.photoCodes.UT-6303",
  [PHOTO_MODERATION_CODES.BELOW_MIN_PHOTOS]: "profile.photoCodes.UT-6304",
  [PHOTO_MODERATION_CODES.APPEAL_CONFLICT]: "profile.photoCodes.UT-6305",
  [PHOTO_MODERATION_CODES.PROVIDER_UNAVAILABLE]: "profile.photoCodes.UT-6306",
  "UT-6203": "profile.photoCodes.UT-6303",
  "UT-6204": "profile.photoCodes.UT-6304",
  "UT-6205": "profile.photoCodes.UT-6305",
  "UT-6206": "profile.photoCodes.UT-6306",
};

/**
 * Foto/profil akışlarına ÖZEL çözücü. Bilinmeyen kodda `null` döner; çağıran
 * taraf backend `message`'ına ya da kendi jenerik metnine düşer (B5).
 */
export function photoModerationCodeKey(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return PHOTO_CODE_I18N[code] ?? null;
}

/**
 * İtiraz çakışması (409) mı — yeni `UT-6305` ya da geçiş penceresindeki eski
 * `UT-6205`. Yalnız itiraz yanıtından çağrılır.
 */
export function isPhotoAppealConflict(code: string | null | undefined): boolean {
  return code === PHOTO_MODERATION_CODES.APPEAL_CONFLICT || code === "UT-6205";
}

/**
 * Moderasyon sağlayıcısı geçici olarak erişilemez mi (yeni `UT-6306` ya da
 * geçiş penceresindeki eski `UT-6206`). Ailenin TEK GEÇİCİ hatası: kullanıcının
 * düzeltebileceği bir şey yok, doğru aksiyon tekrar denemek. Diğer kodlar
 * kalıcı — onlarda "tekrar dene" göstermek kullanıcıyı aynı duvara sürer.
 */
export function isPhotoProviderUnavailable(
  code: string | null | undefined,
): boolean {
  return (
    code === PHOTO_MODERATION_CODES.PROVIDER_UNAVAILABLE || code === "UT-6206"
  );
}

// ── Selfie doğrulama (UT-65xx) ───────────────────────────────────────────────
// Foto moderasyonu (UT-63xx) ve not (UT-64xx) ile aynı gerekçeyle AYRI sözlük:
// `CODE_ENTRIES`e girseler tek `resolveCode` tablosu bir akışın metnini
// diğerine sızdırır (bkz. yukarıdaki numaralandırma tarihçesi).
//
// Ailenin iki kodu diğerlerinden farklı davranıyor:
//   FEATURE_OFF (404) → hata DEĞİL, "bu sürümde yok" demek; giriş noktası
//                       gizlenir, kullanıcıya hiçbir şey gösterilmez.
//   BAD_FRAMES  (400) → İSTEMCİ BUG'I (kare sayısı/boyutu); kullanıcıya
//                       jenerik metin, ayrıntı devLog'a.
export const SELFIE_CODES = {
  /**
   * 403 — iki KVKK rızasından biri eksik (biyometrik işleme / yurt dışına
   * aktarım). Rıza kayıt sırasında aydınlatma metniyle alınıyor, akışın içinde
   * DEĞİL: kullanıcı Ayarlar > Gizlilik'e yönlendirilir.
   */
  CONSENT_REQUIRED: "UT-6501",
  /** 400 — onaylanmış ana fotoğraf yok. Profil düzenlemeye yönlendir. */
  NO_MAIN_PHOTO: "UT-6502",
  /** 409 — zaten doğrulanmış. Profili tazele, girişi gizle. */
  ALREADY_VERIFIED: "UT-6503",
  /** 429 — kota (5/saat, 20/gün, 10 ardışık redde 24 sa). Kalan süre VERİLMİYOR → geri sayım gösterme. */
  RATE_LIMITED: "UT-6504",
  /** 404 — özellik bayrağı kapalı. Giriş noktasını gizle. */
  FEATURE_OFF: "UT-6505",
  /** 400 — attempt geçersiz/kullanılmış. Aynı attemptId ile tekrar DENEME, yeni /start al. */
  INVALID_ATTEMPT: "UT-6506",
  /** 400 — kare sayısı/boyutu hatalı. İstemci bug'ı, logla. */
  BAD_FRAMES: "UT-6507",
} as const;

export type SelfieCode = (typeof SELFIE_CODES)[keyof typeof SELFIE_CODES];

const SELFIE_CODE_I18N: Record<SelfieCode, string> = {
  [SELFIE_CODES.CONSENT_REQUIRED]: "profile.selfie.codes.UT-6501",
  [SELFIE_CODES.NO_MAIN_PHOTO]: "profile.selfie.codes.UT-6502",
  [SELFIE_CODES.ALREADY_VERIFIED]: "profile.selfie.codes.UT-6503",
  [SELFIE_CODES.RATE_LIMITED]: "profile.selfie.codes.UT-6504",
  [SELFIE_CODES.FEATURE_OFF]: "profile.selfie.codes.UT-6505",
  [SELFIE_CODES.INVALID_ATTEMPT]: "profile.selfie.codes.UT-6506",
  [SELFIE_CODES.BAD_FRAMES]: "profile.selfie.codes.UT-6507",
};

/**
 * Selfie akışına ÖZEL çözücü. Bilinmeyen kodda `null` — çağıran taraf backend
 * `message`'ına ya da kendi jenerik metnine düşer.
 */
export function selfieCodeI18nKey(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return SELFIE_CODE_I18N[code as SelfieCode] ?? null;
}

// ── Sohbet (UT-67xx) + moderasyon (UT-68xx) ─────────────────────────────────
//
// 2026-09-03'e kadar bu iki akışın hataları `code: null` ile geliyordu ve
// ayırt etmenin tek yolu TÜRKÇE METNİ karşılaştırmaktı — açık dil desteğiyle
// birlikte o yol zaten kırıktı. Backend artık yapılandırılmış kod döndürüyor.
//
// ⚠️ STATUS DEĞİŞTİ (kırılma riski burada): aynı hata uca göre farklı status
// dönüyordu, düzeltildi. UT-6720 ve UT-6713 artık HER YERDE 404 (eskiden bazı
// uçlarda 400), UT-6803 400 → 404. Bu yüzden karar status'tan değil KODDAN
// veriliyor; status yalnız kod GELMEDİĞİNDE (eski sunucu) yedek dal.
//
// Ayrıca 11 uç eskiden BOŞ GÖVDELİ 403 dönüyordu (`Forbid()`); artık gövde var.
// Ek alan, kırıcı değil — ama sebebi gösterebiliyoruz.
//
// Diğer ailelerle aynı gerekçeyle AYRI sözlük (`CODE_ENTRIES`e girmiyorlar):
// tek `resolveCode` tablosu bir akışın metnini diğerine sızdırırdı.
export const CHAT_ERROR_CODES = {
  // 403 — erişim / yetki
  NO_ACCESS: "UT-6701",
  CANNOT_SEND: "UT-6702",
  EDIT_NOT_OWNER: "UT-6703",
  DELETE_NOT_OWNER: "UT-6704",
  /** Geri alma yalnız UNMATCH EDEN tarafa açık. */
  RESTORE_NOT_OWNER: "UT-6743",
  // 404 — bulunamadı
  CONVERSATION_NOT_FOUND: "UT-6713",
  MESSAGE_NOT_FOUND: "UT-6720",
  // 400 — gönderim
  EMPTY_CONTENT: "UT-6710",
  TOO_LONG: "UT-6711",
  REPLY_TARGET_INVALID: "UT-6712",
  // 400 — düzenleme / silme
  EDIT_SYSTEM: "UT-6721",
  EDIT_DELETED: "UT-6722",
  EDIT_WINDOW_CLOSED: "UT-6723",
  EDIT_NON_TEXT: "UT-6724",
  DELETE_SYSTEM: "UT-6725",
  // 400 — reaction
  REACTION_BAD_EMOJI: "UT-6730",
  REACTION_ON_SYSTEM: "UT-6731",
  // 400 — sohbet durumu / arama
  CONVERSATION_CLOSED: "UT-6740",
  INVALID_CURSOR: "UT-6741",
  SEARCH_TOO_SHORT: "UT-6742",
  /**
   * Delta-sync watermark'ı sunucunun değişiklik günlüğünden düşmüş. Cursor'un
   * aksine bu GERÇEKTEN eskiyebilir. Telafisi: watermark'ı at, tam senkrona dön.
   */
  INVALID_WATERMARK: "UT-6744",
} as const;

export const MODERATION_CODES = {
  BLOCK_SELF: "UT-6801",
  REPORT_SELF: "UT-6802",
  /** 404 (eskiden 400) — şikayet edilecek kullanıcı yok. */
  REPORT_TARGET_MISSING: "UT-6803",
  /** Aynı kişi 24 saat içinde ikinci kez şikayet edildi. */
  REPORT_DUPLICATE: "UT-6804",
  /** İSTEMCİ BUG'I — kullanıcıya gösterilmez, loglanır. */
  EMPTY_USER_ID: "UT-6805",
} as const;

export type ChatErrorCode =
  (typeof CHAT_ERROR_CODES)[keyof typeof CHAT_ERROR_CODES];
export type ModerationCode =
  (typeof MODERATION_CODES)[keyof typeof MODERATION_CODES];

// Düzenleme kodları (UT-672x) ve arama kodu (UT-6742) bu istemcide HENÜZ
// tetiklenmiyor — mesaj düzenleme yalnız hub'dan ALINIYOR, arama istemci
// tarafında yapılıyor. Yine de tabloda duruyorlar: aile eksiksiz olmadan
// backend kataloğuyla karşılaştırılamıyor ve o akışlar açıldığında metin
// hazır olsun.
const CHAT_CODE_I18N: Record<ChatErrorCode, string> = {
  [CHAT_ERROR_CODES.NO_ACCESS]: "chat.codes.UT-6701",
  [CHAT_ERROR_CODES.CANNOT_SEND]: "chat.codes.UT-6702",
  [CHAT_ERROR_CODES.EDIT_NOT_OWNER]: "chat.codes.UT-6703",
  [CHAT_ERROR_CODES.DELETE_NOT_OWNER]: "chat.codes.UT-6704",
  [CHAT_ERROR_CODES.RESTORE_NOT_OWNER]: "chat.codes.UT-6743",
  [CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND]: "chat.codes.UT-6713",
  [CHAT_ERROR_CODES.MESSAGE_NOT_FOUND]: "chat.codes.UT-6720",
  [CHAT_ERROR_CODES.EMPTY_CONTENT]: "chat.codes.UT-6710",
  [CHAT_ERROR_CODES.TOO_LONG]: "chat.codes.UT-6711",
  [CHAT_ERROR_CODES.REPLY_TARGET_INVALID]: "chat.codes.UT-6712",
  [CHAT_ERROR_CODES.EDIT_SYSTEM]: "chat.codes.UT-6721",
  [CHAT_ERROR_CODES.EDIT_DELETED]: "chat.codes.UT-6722",
  [CHAT_ERROR_CODES.EDIT_WINDOW_CLOSED]: "chat.codes.UT-6723",
  [CHAT_ERROR_CODES.EDIT_NON_TEXT]: "chat.codes.UT-6724",
  [CHAT_ERROR_CODES.DELETE_SYSTEM]: "chat.codes.UT-6725",
  [CHAT_ERROR_CODES.REACTION_BAD_EMOJI]: "chat.codes.UT-6730",
  [CHAT_ERROR_CODES.REACTION_ON_SYSTEM]: "chat.codes.UT-6731",
  [CHAT_ERROR_CODES.CONVERSATION_CLOSED]: "chat.codes.UT-6740",
  [CHAT_ERROR_CODES.INVALID_CURSOR]: "chat.codes.UT-6741",
  [CHAT_ERROR_CODES.SEARCH_TOO_SHORT]: "chat.codes.UT-6742",
  // UT-6744 normalde kullanıcıya HİÇ gösterilmiyor: watermark eskimesi tamamen
  // sessiz telafi ediliyor (atılır, tam senkrona dönülür). Metin yalnız
  // beklenmedik bir yolda ekrana düşerse diye var — UT-6741 ile aynı his.
  [CHAT_ERROR_CODES.INVALID_WATERMARK]: "chat.codes.UT-6744",
};

// UT-6804 mevcut anahtarı kullanıyor: metin birebir aynı ve ReportModal onu
// zaten 409 dalında gösteriyor — ikiye bölmenin faydası yok.
// UT-6805 BİLEREK YOK: istemci bug'ı, kullanıcıya jenerik metin gösterilir.
const MODERATION_CODE_I18N: Record<string, string> = {
  [MODERATION_CODES.BLOCK_SELF]: "moderation.codes.UT-6801",
  [MODERATION_CODES.REPORT_SELF]: "moderation.codes.UT-6802",
  [MODERATION_CODES.REPORT_TARGET_MISSING]: "moderation.codes.UT-6803",
  [MODERATION_CODES.REPORT_DUPLICATE]: "moderation.report.alreadyReported",
};

/**
 * Hatanın UI'da ne yapılması gerektiği — kod ailesinin davranış eksenine
 * indirgenmiş hâli. Ekran-bağımsız (ChatScreen ile MessagesScreen aynı kodla
 * farklı navigasyon yapabilsin), tıpkı `CodeAction` gibi.
 *
 *   conversationGone → sohbet artık kullanılamaz: yerel `isActive` bayrağını
 *                      çevir + listeyi sunucudan doğrulat.
 *   messageGone      → hedef mesaj sunucuda yok: geçmişi tazele.
 *   actionRejected   → aksiyon reddedildi ama veri yerinde: metni göster, geri al.
 *   inputInvalid     → kullanıcı düzeltebilir: GİRDİYİ KORU, temizleme.
 *   staleCursor      → sayfalamayı baştan kur (sessiz).
 *   staleWatermark   → delta watermark'ını at, tam senkrona dön (sessiz).
 *   clientBug        → kullanıcıya jenerik metin, ayrıntı log'a.
 */
export type ChatErrorEffect =
  | "conversationGone"
  | "messageGone"
  | "actionRejected"
  | "inputInvalid"
  | "staleCursor"
  | "staleWatermark"
  | "clientBug";

const CHAT_CODE_EFFECT: Record<string, ChatErrorEffect> = {
  [CHAT_ERROR_CODES.NO_ACCESS]: "conversationGone",
  [CHAT_ERROR_CODES.CANNOT_SEND]: "conversationGone",
  [CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND]: "conversationGone",
  [CHAT_ERROR_CODES.CONVERSATION_CLOSED]: "conversationGone",
  [CHAT_ERROR_CODES.MESSAGE_NOT_FOUND]: "messageGone",
  [CHAT_ERROR_CODES.EDIT_NOT_OWNER]: "actionRejected",
  [CHAT_ERROR_CODES.DELETE_NOT_OWNER]: "actionRejected",
  [CHAT_ERROR_CODES.RESTORE_NOT_OWNER]: "actionRejected",
  [CHAT_ERROR_CODES.EDIT_SYSTEM]: "actionRejected",
  [CHAT_ERROR_CODES.EDIT_DELETED]: "actionRejected",
  [CHAT_ERROR_CODES.EDIT_WINDOW_CLOSED]: "actionRejected",
  [CHAT_ERROR_CODES.EDIT_NON_TEXT]: "actionRejected",
  [CHAT_ERROR_CODES.DELETE_SYSTEM]: "actionRejected",
  [CHAT_ERROR_CODES.REACTION_ON_SYSTEM]: "actionRejected",
  [CHAT_ERROR_CODES.EMPTY_CONTENT]: "inputInvalid",
  [CHAT_ERROR_CODES.TOO_LONG]: "inputInvalid",
  [CHAT_ERROR_CODES.REPLY_TARGET_INVALID]: "inputInvalid",
  [CHAT_ERROR_CODES.REACTION_BAD_EMOJI]: "inputInvalid",
  [CHAT_ERROR_CODES.SEARCH_TOO_SHORT]: "inputInvalid",
  [CHAT_ERROR_CODES.INVALID_CURSOR]: "staleCursor",
  [CHAT_ERROR_CODES.INVALID_WATERMARK]: "staleWatermark",
  [MODERATION_CODES.EMPTY_USER_ID]: "clientBug",
};

/**
 * Gövdedeki sohbet/moderasyon kodu. İKİ ŞEKLİ de okur:
 *   • axios hatası  → `err.response.data.code`
 *   • hub payload'ı → `err.code` (MatchHub "Error" event'i aynı kodları taşıyor)
 *
 * Önek kontrolü ŞART: axios'un kendi `code`'u (`ECONNABORTED`) ve hub'ın eski
 * string kodları (`CHAT_QUOTA_EXHAUSTED`, `RATE_LIMITED`, `JOIN_FAILED`…) aynı
 * alandan geliyor. Onlar KALDIRILMADI — bu fonksiyon null döndürünce çağıran
 * mevcut mantığına düşer.
 */
export function chatErrorCodeOf(err: any): string | null {
  const data = err?.response?.data ?? err;
  for (const raw of [data?.code, data?.errorCode, data?.result?.code]) {
    if (typeof raw === "string" && (raw.startsWith("UT-67") || raw.startsWith("UT-68"))) {
      return raw;
    }
  }
  return null;
}

/** Bilinmeyen/yabancı kodda null — çağıran kendi jenerik davranışına düşer. */
export function chatErrorEffect(
  code: string | null | undefined,
): ChatErrorEffect | null {
  if (!code) return null;
  return CHAT_CODE_EFFECT[code] ?? null;
}

/**
 * Hata → kullanıcıya gösterilecek metin. Sıra:
 *   1. kod → i18n anahtarı (kanonik yol; metin bizim, dil cihazın)
 *   2. backend `message` (yeni sözleşmede zaten kullanıcının dilinde) —
 *      yalnız BİLİNMEYEN kod için, yani sunucu bizden yeniyse
 *   3. çağıranın jenerik metni
 *
 * ⚠️ TR metin karşılaştırmasına ASLA düşülmez (eski yöntemin tamamı buydu).
 *
 * `t` parametre olarak geçer: bu modül constants katmanında, i18n init
 * sırasına bağlanmamalı.
 */
export function chatErrorText(
  err: any,
  t: (key: string) => string,
  fallbackKey: string,
): string {
  const code = chatErrorCodeOf(err);
  const key = code
    ? (CHAT_CODE_I18N[code as ChatErrorCode] ?? MODERATION_CODE_I18N[code])
    : null;
  if (key) return t(key);
  // Bilinmeyen kod ya da kodsuz gövde: backend metni varsa o, yoksa jenerik.
  //
  // Metin YALNIZ API GÖVDESİNDEN alınır (REST'te `response.data`, hub'da kod
  // taşıyan payload'ın kendisi). `err.message`e düşmek axios'un teknik metnini
  // ("Network Error", "timeout of 30000ms exceeded") kullanıcıya gösterirdi.
  const body = err?.response?.data ?? (typeof err?.code === "string" ? err : null);
  const message = body?.message;
  return typeof message === "string" && message.trim()
    ? message
    : t(fallbackKey);
}

const CODE_MAP: Record<string, CodeEntry> = Object.fromEntries(
  CODE_ENTRIES.map((e) => [e.code, e]),
);

// emptyReason enum → entry (UT-xxxx kodu null gelirse fallback).
const EMPTY_REASON_MAP: Partial<Record<EmptyReason, CodeEntry>> =
  Object.fromEntries(
    CODE_ENTRIES.filter((e) => e.emptyReason).map((e) => [e.emptyReason!, e]),
  );

// Resolver — code önce, emptyReason fallback. İkisi de yoksa null.
// Bilinmeyen code geldiğinde de null döner; çağıran taraf backend message'ını
// fallback olarak göstermeli (Task 🔤 kabul kriteri).
export function resolveCode(
  code: string | null | undefined,
  emptyReason?: EmptyReason | null,
): CodeEntry | null {
  if (code && CODE_MAP[code]) return CODE_MAP[code];
  if (emptyReason && emptyReason !== "None" && EMPTY_REASON_MAP[emptyReason]) {
    return EMPTY_REASON_MAP[emptyReason]!;
  }
  return null;
}

// Paywall tip sabitleri (Task 💳). Backend bu string'leri döner; frontend
// switch yaparken `as const` literal'larla kontrol eder.
//
// NOTE_BALANCE diğerlerinden AYRI davranıyor: abonelik paywall'ı değil,
// consumable paket sheet'ini açıyor (bkz. useNoteMutation → uiBus "notePaywall").
export const PAYWALL_TYPES = {
  SWIPE_LIMIT: "SWIPE_LIMIT",
  FIRE_LIMIT: "FIRE_LIMIT",
  UNDO_LIMIT: "UNDO_LIMIT",
  MISSED_MATCH_RECOVERY_LIMIT: "MISSED_MATCH_RECOVERY_LIMIT",
  PREMIUM_FILTERS: "PREMIUM_FILTERS",
  CHAT_QUOTA_EXHAUSTED: "CHAT_QUOTA_EXHAUSTED",
  NOTE_BALANCE: "NOTE_BALANCE",
  FEED_ANONYMOUS: "FEED_ANONYMOUS",
  FEED_UNIVERSITY: "FEED_UNIVERSITY",
  FEED_KIND_FILTER: "FEED_KIND_FILTER",
  // ⚠️ Bu ikisi paywall AÇMAZ, kota sheet'i açar — hak satın alınamıyor.
  FEED_POST_LIMIT: "FEED_POST_LIMIT",
  FEED_REPLY_LIMIT: "FEED_REPLY_LIMIT",
} as const satisfies Record<PaywallType, PaywallType>;

/**
 * Lit Akışı hataları (UT-73xx).
 *
 * `CODE_ENTRIES`e KOYULMADILAR ve koyulmamalı — NOTE_SEND_CODES ile aynı gerekçe
 * (bkz. :191-208): bu metinler composer/kart içinde inline gösteriliyor,
 * `resolveCode`'un global haritasına girerlerse başka akışlar kalıcı hata
 * metnini buradan okumaya başlar. UT-62xx'te tam olarak bu kaza yaşandı.
 *
 * Backend `message`'ı KULLANICININ DİLİNDE ve gösterime hazır yolluyor; buradaki
 * i18n anahtarları sunucu mesajı boş geldiğinde devreye giren yedek.
 * Switch HER ZAMAN `code` üzerinden yapılır, HTTP status üzerinden ASLA
 * (403 hem UT-7301 hem UT-7308 hem UT-7315 olabiliyor).
 */
/**
 * İKİ MODLU YAPI — UT-23xx ailesi (`/api/profile/modes/*` ve mod-bazlı swipe).
 *
 * ⚠️ İKİ KODU AYRI ELE ALIN, ikisi de "Friends yok" demiyor:
 *   • MODE_DISABLED (2302) = ÖZELLİK kapalı (sunucu bayrağı). Kullanıcının
 *     yapabileceği bir şey yok → sekmeyi/segmenti gizle, "çok yakında".
 *   • MODE_NOT_OPENED (2304) = KULLANICI o modun profilini açmamış. Yapabileceği
 *     bir şey VAR → "Profili Oluştur" CTA'sı, mini kurulum akışına götür.
 * İkisini aynı mesajla karşılamak, açabileceği bir modu "kapalı" diye
 * göstermek olurdu.
 *
 * ⚠️ TARGET_MODE_INACTIVE (2305) ve MODE_GENDER_RULE (2309) BİLEREK NÖTR:
 * karşı tarafın hangi modları kullandığı ya da cinsiyeti BİLGİ SIZINTISIDIR.
 * Mesajı ifşa edici hale getirmeyin — "bu kişi arkadaş modunu kapatmış"
 * demek, kimin hangi havuzda olduğunu söyler.
 */
export const MODE_CODES = {
  /** 400 — prompt o modda seçilemez. Seçici `modes` ile filtrelenirse hiç düşmez. */
  PROMPT_MODE_MISMATCH: "UT-2207",
  /** 400 — tanınmayan mod değeri. "Uygulamayı güncelle". */
  UNKNOWN_MODE: "UT-2301",
  /** 403 — `modes.friends.enabled` kapalı. Sekmeyi GİZLE. */
  MODE_DISABLED: "UT-2302",
  /** 409 — bu modun profili zaten açık. Düzenleme ekranına yönlendir. */
  MODE_ALREADY_OPEN: "UT-2303",
  /** 403 — KULLANICI modu açmamış. "Profili Oluştur" CTA'sı. */
  MODE_NOT_OPENED: "UT-2304",
  /** 403 — HEDEF o modda aktif değil. Nötr mesaj, kartı düşür. */
  TARGET_MODE_INACTIVE: "UT-2305",
  /** 400 — Friends niyeti seçilmedi. Niyet adımına dön. */
  FRIENDSHIP_INTENTS_REQUIRED: "UT-2306",
  /** 400 — geçersiz niyet değeri. "Uygulamayı güncelle". */
  INVALID_FRIENDSHIP_INTENT: "UT-2307",
  /** 400 — Dating'te `interestedIn` seçilmedi. Tercih adımına dön. */
  INTERESTED_IN_REQUIRED: "UT-2308",
  /** 403 — mod cinsiyet kuralı (Friends = aynı cinsiyet). Nötr mesaj. */
  MODE_GENDER_RULE: "UT-2309",
  /** 403 — Friends alanı gönderildi ama profil kapalı. "Önce modu aç". */
  MODE_FIELD_WITHOUT_PROFILE: "UT-2310",
} as const;

/**
 * Kartın DESTEDEN DÜŞMESİ gereken kodlar.
 *
 * Bu dörtlüde hedef gerçekten uygun değil (silinmiş/pasif, engel, modu kapalı,
 * cinsiyet kuralı) — kartı geri koymak kullanıcıyı aynı reddedilecek kişiyle
 * tekrar karşılaştırır. Backend notu: "bilinmeyen kodu jenerik hata olarak
 * çizin ve kartı desteden düşürün".
 */
export const MODE_DROP_CARD_CODES: readonly string[] = [
  MODE_CODES.TARGET_MODE_INACTIVE,
  MODE_CODES.MODE_GENDER_RULE,
];

export const FEED_CODES = {
  /** 403 — akış bayrağı kapalı. Sekme hiç çizilmez. */
  DISABLED: "UT-7301",
  /** 400 — gönderi boş. */
  POST_EMPTY: "UT-7302",
  /** 400 — gönderi çok uzun. result.maxLength dolu. */
  POST_TOO_LONG: "UT-7303",
  /** 429 — günlük gönderi hakkı bitti. result: nextResetAt + paywallType. */
  POST_QUOTA: "UT-7304",
  /** 402 — anonim paylaşım Plus gerektiriyor. */
  ANONYMOUS_REQUIRES_PLUS: "UT-7305",
  /**
   * 400 — geçersiz akış konusu. "Uygulamayı güncelle".
   *
   * ⚠️ Sunucu tanınmayan konuyu SESSİZCE `General`a DÜŞÜRMÜYOR: wire'daki
   * `General` varsayılanı yalnız eski istemciler için ve o istemciler konu
   * alanını hiç göndermiyor. Yeni istemci geçersiz bir anahtar gönderirse
   * bu bir hata, görmezden gelinmemeli.
   */
  INVALID_TOPIC: "UT-7307",
  /**
   * 410 — yanıt sistemi kapatıldı (`feed.replies.enabled` kill switch).
   *
   * Bu sürüm yanıt uçlarını HİÇ ÇAĞIRMIYOR (sistem söküldü), yani kod
   * pratikte düşmüyor. Katalogda duruyor çünkü sahadaki eski sürümler
   * çağırmaya devam ediyor ve kodun ne olduğunu bilmek gerekiyor.
   */
  REPLIES_DISABLED: "UT-7329",
  /**
   * 422 — içerik kurallara uymuyor. result.category dolu.
   * ⚠️ HAK DÜŞMEZ → kota azaltılmaz, sheet açık kalır, metin korunur.
   * ⚠️ Kullanıcıya KATEGORİYE ÖZEL metin yazılmaz; sunucunun `message`'ı aynen
   * gösterilir (kurallar 2026-09-30'da değişti, istemci kopyası bayatlar).
   */
  CONTENT_REJECTED: "UT-7306",
  /** 403 — akış erişimi kısıtlı. result: until (null = süresiz) + isPermanent. */
  FEED_RESTRICTED: "UT-7308",
  /** 403 — anonim paylaşım kısıtlı. */
  ANONYMOUS_RESTRICTED: "UT-7309",
  /** 402 — başka kampüsü görmek Plus gerektiriyor. */
  UNIVERSITY_REQUIRES_PLUS: "UT-7310",
  /** 402 — tip (anonim/normal) filtresi Plus gerektiriyor. */
  KIND_FILTER_REQUIRES_PLUS: "UT-7311",
  /** 410 — gönderi yok / kaldırıldı / süresi doldu. Satırı listeden kaldır. */
  POST_GONE: "UT-7312",
  /** 400 — geçersiz üniversite domain'i. Kendi kampüsüne dön. */
  INVALID_UNIVERSITY: "UT-7313",
  /** 400 — cursor çürüdü. Cursor'ı at, listeyi BAŞTAN yükle (bir kez). */
  INVALID_CURSOR: "UT-7314",
  /**
   * 403 — profil tamamlanmamış / hesap pasif.
   * ⚠️ UT-7301 ile KARIŞTIRILMAMALI: ikisi de 403 ama bu "özellik kapalı"
   * demiyor; bayrak latch'ine YAZILMAZ, profil tamamlamaya yönlendirilir.
   */
  PROFILE_INCOMPLETE: "UT-7315",
  /** 429 — saatlik suistimal freni (sık reddedilen denemeler). Hak düşmez. */
  RATE_LIMITED: "UT-7316",
  /** 400 — yanıt boş. */
  REPLY_EMPTY: "UT-7320",
  /** 400 — yanıt çok uzun. result.maxLength dolu. */
  REPLY_TOO_LONG: "UT-7321",
  /** 429 — günlük yanıt hakkı bitti. result: nextResetAt + paywallType. */
  REPLY_QUOTA: "UT-7322",
  /** 409 — bu gönderiye zaten yanıt verdin. Butonu "Yanıtladın" yap. */
  ALREADY_REPLIED: "UT-7323",
  /** 403 — tercihler uyuşmuyor. Butonu gizle. */
  PREFERENCE_MISMATCH: "UT-7324",
  /** 400 — kendi gönderine yanıt. */
  OWN_POST_REPLY: "UT-7325",
  /** 402 — başka kampüse yanıt Plus gerektiriyor. */
  REPLY_UNIVERSITY_REQUIRES_PLUS: "UT-7326",
  /** 409 — zaten eşleştiniz. result.conversationId ile sohbete yönlendir. */
  ALREADY_MATCHED: "UT-7327",
  /** 409 — yanıt işlenmiş / süresi dolmuş / geçersiz. Listeyi yenile. */
  REPLY_STALE: "UT-7328",
  /** 400 — kendi gönderini beğenemezsin. */
  OWN_POST_LIKE: "UT-7330",
  /** 409 — bu içeriği zaten şikayet ettin. */
  ALREADY_REPORTED: "UT-7340",
  /** 400 — kendi içeriğini şikayet edemezsin. */
  OWN_CONTENT_REPORT: "UT-7341",
} as const;

export type FeedCode = (typeof FEED_CODES)[keyof typeof FEED_CODES];

/**
 * code → i18n anahtarı. YEDEK metin: sunucunun `message`'ı varsa o kazanır
 * (`t(key, { defaultValue: serverMessage })` DEĞİL — tersi:
 * `serverMessage ?? t(key)`), çünkü backend mesajı kurallarla birlikte
 * güncelleniyor, istemci kopyası bayatlıyor.
 */
const FEED_I18N: Record<FeedCode, string> = {
  [FEED_CODES.DISABLED]: "feed.codes.UT-7301",
  [FEED_CODES.POST_EMPTY]: "feed.codes.UT-7302",
  [FEED_CODES.POST_TOO_LONG]: "feed.codes.UT-7303",
  [FEED_CODES.POST_QUOTA]: "feed.codes.UT-7304",
  [FEED_CODES.ANONYMOUS_REQUIRES_PLUS]: "feed.codes.UT-7305",
  [FEED_CODES.CONTENT_REJECTED]: "feed.codes.UT-7306",
  [FEED_CODES.INVALID_TOPIC]: "feed.codes.UT-7307",
  [FEED_CODES.REPLIES_DISABLED]: "feed.codes.UT-7329",
  [FEED_CODES.FEED_RESTRICTED]: "feed.codes.UT-7308",
  [FEED_CODES.ANONYMOUS_RESTRICTED]: "feed.codes.UT-7309",
  [FEED_CODES.UNIVERSITY_REQUIRES_PLUS]: "feed.codes.UT-7310",
  [FEED_CODES.KIND_FILTER_REQUIRES_PLUS]: "feed.codes.UT-7311",
  [FEED_CODES.POST_GONE]: "feed.codes.UT-7312",
  [FEED_CODES.INVALID_UNIVERSITY]: "feed.codes.UT-7313",
  [FEED_CODES.INVALID_CURSOR]: "feed.codes.UT-7314",
  [FEED_CODES.PROFILE_INCOMPLETE]: "feed.codes.UT-7315",
  [FEED_CODES.RATE_LIMITED]: "feed.codes.UT-7316",
  [FEED_CODES.REPLY_EMPTY]: "feed.codes.UT-7320",
  [FEED_CODES.REPLY_TOO_LONG]: "feed.codes.UT-7321",
  [FEED_CODES.REPLY_QUOTA]: "feed.codes.UT-7322",
  [FEED_CODES.ALREADY_REPLIED]: "feed.codes.UT-7323",
  [FEED_CODES.PREFERENCE_MISMATCH]: "feed.codes.UT-7324",
  [FEED_CODES.OWN_POST_REPLY]: "feed.codes.UT-7325",
  [FEED_CODES.REPLY_UNIVERSITY_REQUIRES_PLUS]: "feed.codes.UT-7326",
  [FEED_CODES.ALREADY_MATCHED]: "feed.codes.UT-7327",
  [FEED_CODES.REPLY_STALE]: "feed.codes.UT-7328",
  [FEED_CODES.OWN_POST_LIKE]: "feed.codes.UT-7330",
  [FEED_CODES.ALREADY_REPORTED]: "feed.codes.UT-7340",
  [FEED_CODES.OWN_CONTENT_REPORT]: "feed.codes.UT-7341",
};

/** Bilinmeyen kodda null → çağıran `feed.codes.generic`'e düşer. */
export function feedCodeI18nKey(code: string | null | undefined): string | null {
  if (!code) return null;
  return FEED_I18N[code as FeedCode] ?? null;
}
