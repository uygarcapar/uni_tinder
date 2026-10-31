/**
 * KAMPÜS ANLARI hata kodları — UT-74xx.
 *
 * ── Neden bu aile ───────────────────────────────────────────────────────────
 * UT-62xx REZERVE/YASAK (kurtarma ürünü kaldırıldı, kodları iki kez çakışma
 * kazası yaşattı), UT-73xx akış ailesi dolu (7301–7341). UT-74xx boş.
 *
 * ── Neden AYRI dosya ve AYRI çözümleyici ────────────────────────────────────
 * `responseCodes.ts`teki global `resolveCode`/`CODE_ENTRIES` haritasına
 * EKLENMİYOR. O harita Keşif'in boş-deste ekranı için var ve oraya giren her
 * kod başka akışlarda da "kalıcı hata metni" olarak okunmaya başlıyor —
 * UT-62xx'te tam olarak bu kaza yaşandı (bkz. responseCodes.ts:694-702).
 * Buradaki metinler sheet'in İÇİNDE, satır içinde gösteriliyor.
 *
 * ── Metin önceliği ──────────────────────────────────────────────────────────
 * Sunucunun `message`'ı kullanıcının dilinde ve gösterime hazır geliyor →
 * `serverMessage ?? t(campusCodeI18nKey(code))`. Buradaki anahtarlar YEDEK.
 *
 * ⚠️ Dallanma HER ZAMAN `code` üzerinden, HTTP status üzerinden ASLA
 * (403 burada beş ayrı anlama geliyor).
 */
export const CAMPUS_CODES = {
  /** 403 — özellik kapalı (sunucu bayrağı). Yüzey hiç çizilmez. */
  DISABLED: "UT-7401",
  /** 403 — profil eksik. */
  PROFILE_INCOMPLETE: "UT-7402",
  /** 409 — bugün zaten paylaşıldı. Günde 1 foto, DEĞİŞTİRİLEMEZ. */
  ALREADY_POSTED_TODAY: "UT-7403",
  /**
   * 400 — moderasyon senkron reddi.
   *
   * ⚠️ UT-63xx AİLESİ DEĞİL ve o hat bağlanmamalı. UT-63xx profil fotoğrafı
   * ailesi ve içinde YÜZ kontrolleri var (UT-6301 birden fazla kişi, UT-6302
   * yüz görünmüyor). Kampüs anı bir manzara, bir kedi, bir kahve olabilir —
   * yüz kontrolü bağlansa her an reddedilirdi. Burada yalnız İÇERİK GÜVENLİĞİ
   * (Rekognition DetectModerationLabels) çalışıyor.
   *
   * `moderation` bloğunun ŞEKLİ yine de foto uçlarıyla aynı; farklı olan hangi
   * kontrollerin koştuğu.
   */
  PHOTO_REJECTED: "UT-7404",
  /** 400 — dosya çok büyük. */
  PHOTO_TOO_LARGE: "UT-7405",
  /** 400 — yükleme anahtarı geçersiz/bayat. */
  INVALID_UPLOAD_KEY: "UT-7406",
  /** 403 — kullanıcı kısıtlı. */
  RESTRICTED: "UT-7407",

  // ── Konum ailesi ────────────────────────────────────────────────────────
  // Dördü de "paylaşamazsın" diyor ama SEBEPLERİ farklı ve kullanıcının
  // yapabileceği şey farklı: biri "kampüse git", biri "açık alana çık",
  // biri "sahte konumu kapat". Tek metinle karşılamak yanlış.
  /** 403 — nokta kampüs poligonunun dışında. */
  OUT_OF_CAMPUS: "UT-7410",
  /** 400 — konum belirsizliği sınırı aşıyor, içeride olduğu kanıtlanamıyor. */
  LOW_ACCURACY: "UT-7411",
  /** 403 — sahte konum bayrağı (Android). */
  MOCKED_LOCATION: "UT-7412",
  /** 400 — okuma bayat (>60 sn). */
  STALE_FIX: "UT-7413",
  /** 404 — kampüs poligonu yok / koordinat il merkezi (`isApproximate`). */
  CAMPUS_UNAVAILABLE: "UT-7414",
  /**
   * 403 — son bilinen konumdan fiziksel olmayan hareket.
   *
   * ⚠️ Bu bir "yakaladık" kodu DEĞİL, bir hız tümseği. Sunucuda konum GEÇMİŞİ
   * yok (tek bir "son konum" sabiti var) ve o sabit de istemciden gelmiş,
   * doğrulanmamış bir iddia — yani kontrol iki doğrulanmamış iddiayı
   * karşılaştırıyor. Tembel sahteciliği kesiyor, kararlı olanı kesmiyor.
   * Asıl savunma rate limit + moderasyon + sonradan tespit.
   */
  IMPLAUSIBLE_MOVEMENT: "UT-7415",

  // ── Karar ───────────────────────────────────────────────────────────────
  /** 403 — günlük karar hakkı bitti. GERÇEK paywall (Plus'la kalkıyor). */
  DECISION_QUOTA: "UT-7420",
  /** 404 — an silinmiş ya da süresi dolmuş. */
  MOMENT_GONE: "UT-7421",
  /** 400 — kendi anına karar verilemez. */
  OWN_MOMENT_DECISION: "UT-7422",
  /**
   * 409 — hedefe BU MODDA zaten karar verilmiş (son 3 gün içinde beğeni).
   *
   * ⚠️🔴 ARTIK KARTI DÜŞÜRMÜYOR (2026-10-30). Liste bu anları SÜZÜYORDU ve kod
   * yalnız yarış penceresinde geliyordu (başka cihazdan/Keşif'ten verilen
   * karar), o yüzden kartı sessizce düşürmek doğruydu. Süzme kalktı: karar
   * verilmiş an listede `canLike: false` ile DÖNÜYOR (bkz.
   * backend_campus_decided_moments_2026-10-30, backend uyguladı) ve ürün kuralı
   * "kart kaybolmasın". Kartı düşürmek artık o kuralı tam da kullanıcının
   * dokunuşuyla bozardı — kod geldiğinde kart YERİNDE kalıyor, yalnız karar
   * verilmiş işaretlenip liste tazeleniyor (bkz. useCampusSurface > `like`).
   *
   * Kullanıcıya "zaten beğenmiştin" demiyoruz: tik zaten çizilmeyecek, mesaj
   * gereksiz bir ayrıntı.
   */
  ALREADY_DECIDED: "UT-7424",

  /**
   * 429 — çok sık istek (`campus_decision` politikası).
   *
   * Asıl sahibi GEÇME ucu: kota taşımayan bir yazma ucu döngü korumasız
   * kalamaz. Kullanıcıya gösterilen bir sınır DEĞİL — sessizce geri çekilip
   * tekrar denemek doğru davranış.
   */
  RATE_LIMITED: "UT-7430",
} as const;

export type CampusCode = (typeof CAMPUS_CODES)[keyof typeof CAMPUS_CODES];

/**
 * Kartın listeden DÜŞMESİ gereken kodlar.
 *
 * Ortak yanları: hedef artık karar verilebilir bir şey değil. Kartı geri koymak
 * kullanıcıyı aynı reddedilecek anla tekrar karşılaştırır (Keşif'teki
 * `MODE_DROP_CARD_CODES` ile aynı gerekçe).
 *
 * ⚠️ `DECISION_QUOTA` BU LİSTEDE YOK ve olmamalı: kota hatası kartla ilgili
 * değil, kullanıcıyla ilgili. Kart yerinde kalmalı ki kullanıcı Plus aldıktan
 * sonra aynı kişiye karar verebilsin.
 */
/**
 * ⚠️🔴 `ALREADY_DECIDED` BU LİSTEDEN ÇIKARILDI (2026-10-30) ve geri konmamalı:
 * karar verilmiş an artık listede duruyor (`canLike: false`), yani "karar
 * verilmiş" hâli kartın YOK olması değil TİKİN olmaması. Gerekçe kodun kendi
 * notunda; kalan iki kodda hedef gerçekten ortada yok.
 */
export const CAMPUS_DROP_CARD_CODES: readonly string[] = [
  CAMPUS_CODES.MOMENT_GONE,
  CAMPUS_CODES.OWN_MOMENT_DECISION,
];

/**
 * Konum reddi mi — "+" akışında composer'ı AÇIK tutup satır içi hata gösteren
 * dal bunlara bakıyor (kullanıcı bir sheet'in içinde bekliyor, kart uçmuş
 * değil; `useNoteMutation`'daki aynı gerekçe).
 */
export const CAMPUS_LOCATION_CODES: readonly string[] = [
  CAMPUS_CODES.OUT_OF_CAMPUS,
  CAMPUS_CODES.LOW_ACCURACY,
  CAMPUS_CODES.MOCKED_LOCATION,
  CAMPUS_CODES.STALE_FIX,
  CAMPUS_CODES.CAMPUS_UNAVAILABLE,
  CAMPUS_CODES.IMPLAUSIBLE_MOVEMENT,
];

const CAMPUS_I18N: Record<string, string> = {
  [CAMPUS_CODES.DISABLED]: "campus.codes.UT-7401",
  [CAMPUS_CODES.PROFILE_INCOMPLETE]: "campus.codes.UT-7402",
  [CAMPUS_CODES.ALREADY_POSTED_TODAY]: "campus.codes.UT-7403",
  [CAMPUS_CODES.PHOTO_REJECTED]: "campus.codes.UT-7404",
  [CAMPUS_CODES.PHOTO_TOO_LARGE]: "campus.codes.UT-7405",
  [CAMPUS_CODES.INVALID_UPLOAD_KEY]: "campus.codes.UT-7406",
  [CAMPUS_CODES.RESTRICTED]: "campus.codes.UT-7407",
  [CAMPUS_CODES.OUT_OF_CAMPUS]: "campus.codes.UT-7410",
  [CAMPUS_CODES.LOW_ACCURACY]: "campus.codes.UT-7411",
  [CAMPUS_CODES.MOCKED_LOCATION]: "campus.codes.UT-7412",
  [CAMPUS_CODES.STALE_FIX]: "campus.codes.UT-7413",
  [CAMPUS_CODES.CAMPUS_UNAVAILABLE]: "campus.codes.UT-7414",
  [CAMPUS_CODES.IMPLAUSIBLE_MOVEMENT]: "campus.codes.UT-7415",
  [CAMPUS_CODES.DECISION_QUOTA]: "campus.codes.UT-7420",
  [CAMPUS_CODES.MOMENT_GONE]: "campus.codes.UT-7421",
  [CAMPUS_CODES.OWN_MOMENT_DECISION]: "campus.codes.UT-7422",
  [CAMPUS_CODES.ALREADY_DECIDED]: "campus.codes.UT-7424",
  [CAMPUS_CODES.RATE_LIMITED]: "campus.codes.UT-7430",
};

/** Bilinmeyen kodda `null` → çağıran `campus.codes.generic`'e düşer. */
export function campusCodeI18nKey(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return CAMPUS_I18N[code] ?? null;
}

/** Kod bu aileye mi ait — zarf okurken önek kontrolü (chat ailesindeki kalıp). */
export function isCampusCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith("UT-74");
}
