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
  // ── SuperLike paketi redeem'i ────────────────────────────────────────────
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
// `UT-6301`/`UT-6302` (ana fotoğraf yüz kuralları) BURADA TANIMLI DEĞİL:
// backend'e göre hiçbir uçtan HTTP hata kodu olarak dönmüyorlar — ana foto
// kontrolü senkron hata değil, asenkron moderasyon sonucu ve `photos[]`
// içinde `reasonCode` olarak geliyor (bkz. photoModeration.moderationReasonText).
// Hiç tetiklenmeyen iki kodu tanımlamanın faydası yok.
export const PHOTO_MODERATION_CODES = {
  PHOTO_LIMIT_EXCEEDED: "UT-6303",
  BELOW_MIN_PHOTOS: "UT-6304",
  APPEAL_CONFLICT: "UT-6305",
  PROVIDER_UNAVAILABLE: "UT-6306",
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
  /** 403 — iki KVKK rızasından biri eksik. Rıza adımını aç. */
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
  SUPER_LIKE_LIMIT: "SUPER_LIKE_LIMIT",
  UNDO_LIMIT: "UNDO_LIMIT",
  MISSED_MATCH_RECOVERY_LIMIT: "MISSED_MATCH_RECOVERY_LIMIT",
  PREMIUM_FILTERS: "PREMIUM_FILTERS",
  CHAT_QUOTA_EXHAUSTED: "CHAT_QUOTA_EXHAUSTED",
  NOTE_BALANCE: "NOTE_BALANCE",
} as const satisfies Record<PaywallType, PaywallType>;
