// Swipe/SuperLike/Undo tavanları artık backend'den geliyor —
// GET /api/swipe/Stats → dailySwipeLimit / weeklySuperLikeLimit / dailyUndoLimit.
// Burada kopyası TUTULMUYOR; SwipeLimitsOptions değişirse FE otomatik uyar.

// Backend "sınırsız" için bu sentinel'i dönüyor (0 değil). remainingSwipes /
// remainingUndos / dailySwipeLimit / dailyUndoLimit aynı konvansiyonu kullanır.
export const UNLIMITED = -1;

// Mesafe artık KATI BİR FİLTRE (backend sözleşmesi 2026-08-21). Öncesinde
// yalnızca bir SIRALAMA kriteriydi: 20 km seçen kullanıcıya deste bitince
// 200 km'den profil geliyor, yani filtre fiilen çalışmıyordu. Artık yarıçap
// dışındaki profiller HİÇ gösterilmiyor; aday kalmazsa deste boş döner.
// Otomatik + sessiz genişletme KALDIRILDI.
//
// Kaçış yolu (2026-08-22): filtrelerdeki KALICI `ignoreDistanceFilter` anahtarı
// elemeyi tamamen kapatıyor — free kullanıcıda da, paywall yok. Anahtar açıkken
// buradaki tavanlar seçilebilir aralık olarak kalmaya devam ediyor (değer
// saklanıyor, kapatınca geri yükleniyor) ama fiilen UYGULANMIYOR. Sıralama
// değişmiyor: yakındakiler yine destenin başında, kalkan yalnızca eleme.
// Tek seferlik "daha uzağı göster" akışı (canExpandRadius/useExpandRadius) bu
// anahtarla birlikte tamamen kaldırıldı.
//
// Bu aralık slider'ın GÖRSEL sınırları ve aynı zamanda backend'in validasyon
// aralığı: FilterUpdateDto.MaxDistance artık Range(5, 150) (eski Range(1, 100)).
// Seçilebilir tavan bundan AYRI ve tier'a bağlı — halkalar 150'ye kadar
// çizilir, tier tavanının üstündekiler soluk görünür.
export const DISTANCE_RANGE_KM = { min: 5, max: 150 };

// Tier tavanları — ARTIK YALNIZCA FALLBACK. Kanonik kaynak
// `GET /api/swipe/Filters` → `minSelectableDistanceKm` / `maxSelectableDistanceKm`;
// bunlar kullanıcının KENDİ tier'ına göre gelir (free 75 / premium 150) ve
// sunucu config'i (Discovery:FreeMaxDistanceKm / :PremiumMaxDistanceKm)
// değiştiğinde FE güncellemesi GEREKMEZ. Bu sabitler yalnız yanıt henüz
// inmemişken ya da alanları göndermeyen eski bir backend'de devreye girer —
// bkz. resolveDistanceBounds.
//
// Tavanın üstü gönderilirse backend hata değil SESSİZ CLAMP uyguluyor (eski
// istemciler filtre kaydedemez hale gelmesin diye). Yani sınırı FE zorlamazsa
// kullanıcı 150 km seçtiğini sanır, backend 75 yazar ve arayüz yalan söyler.
export const FREE_MAX_DISTANCE_KM = 75;
export const PREMIUM_MAX_DISTANCE_KM = 150;

export const maxDistanceKmForTier = (isPremium: boolean) =>
  isPremium ? PREMIUM_MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM;

/**
 * Slider'ın seçilebilir aralığı — ÖNCE backend, sonra tier sabitleri.
 *
 * `GET /api/swipe/Filters` yanıtı sınırları taşıyor; hard-code etmemek için
 * tek çözümleme noktası burası. Alanlar gelmezse (eski backend, yanıt henüz
 * inmemiş) tier sabitlerine düşülür.
 *
 * Taban/tavan tutarsız gelirse (config hatası, kısmi yanıt) `max` tabanın
 * altına DÜŞÜRÜLMEZ: aralık tersine dönerse slider hiçbir değeri kabul
 * edemez ve kullanıcı mesafesini hiç değiştiremez hale gelir.
 */
export function resolveDistanceBounds(
  filters: any,
  isPremium: boolean,
): { minKm: number; maxKm: number } {
  const rawMin = Number(filters?.minSelectableDistanceKm);
  const rawMax = Number(filters?.maxSelectableDistanceKm);
  const minKm = Number.isFinite(rawMin) && rawMin > 0
    ? rawMin
    : DISTANCE_RANGE_KM.min;
  const maxKm = Number.isFinite(rawMax) && rawMax > 0
    ? rawMax
    : maxDistanceKmForTier(isPremium);
  return { minKm, maxKm: Math.max(minKm, maxKm) };
}

// Yaş filtresi UI'dan kaldırıldı; UpdateFilters payload'ı tüm yaşları kapsayan
// bu aralığı gönderiyor. Tek kaynak — FilterModal ve useSaveFilters aynı değeri
// kullansın diye burada.
export const DEFAULT_AGE_RANGE = { min: 18, max: 65 };

// "Karşımda görmek istediğim hobiler" (FilterUpdateDto.PreferredHobbies) —
// backend 10'dan fazlasında 400 dönüyor. FilterModal seçimi bu sayıda durdurur,
// useSaveFilters payload'ı ikinci kez kırpar.
export const MAX_PREFERRED_HOBBIES = 10;

// Aday destesi tek istekte geliyor. Backend sayfalaması BELLEK İÇİ: her istek
// havuzun tamamını (Redis ZSET, TargetPoolSize = 50, TTL 15dk) çekip Skip/Take
// yapıyor — yani 2. sayfa 1. sayfayla aynı maliyette, küçük sayfa boyu saf FE
// külfeti. Controller tavanı da 50; DAHA BÜYÜĞÜ 50'ye kırpılmıyor, sessizce
// 10'a DÜŞÜRÜLÜYOR, o yüzden bu değer aşılmamalı.
export const MAX_SWIPE_PAGE_SIZE = 50;

// ÜÇ üniversite listesinin ortak tavanı: `universityDomains` (ben kimi göreyim),
// `visibleOnlyToUniversityDomains` ve `hiddenFromUniversityDomains`. Backend
// eskiden fazlasını sessizce kırpıyordu, artık 400 dönüyor ("en fazla 3
// üniversite seçebilirsiniz") — picker seçimi bu sayıda durdurur, useSaveFilters
// payload'ı ikinci kez kırpar.
export const MAX_UNIVERSITY_DOMAINS = 3;

// Profil fotoğrafı tavanı.
//
// 2026-08-24'e kadar `PUT /api/profile/UpdateProfile` bu sınırı DOĞRULAMIYORDU
// (yalnızca CompleteProfile'da vardı) ve tek savunma hattı FE'ydi. Artık
// backend de doğruluyor → `UT-6203`. FE kontrolü yine de duruyor: kullanıcıyı
// boş bir ağ turuna sokmadan uyarmak için.
export const MAX_PROFILE_PHOTOS = 6;

// ALT SINIR ARTIK SABİT DEĞİL: silme kapısının tabanı sunucudan geliyor
// (`profileVisibility.requiredPhotoCount`, bkz. resolveRequiredPhotoCount).
// Nihai söz backend'in `UT-6204`'ü.

// İsim (`UpdateProfile.DisplayName`) tavanı.
//
// DTO'daki sınır 100 ama doğru sınır 50: `DisplayName` gönderildiğinde backend
// `ApplicationUser.FirstName`i de AYNI değerle senkronluyor (kartta görünen ad
// ile mail/JWT'deki ad ayrışmasın diye) ve o kolon nvarchar(50). 50'yi aşan
// isimde HATA DÖNMEZ: profil adı tam kaydedilir, Identity tarafı sessizce
// kırpılır → kullanıcı kartta uzun adını görür, mailler kırpık adla gider.
// Tek savunma hattı FE, o yüzden MAX_PROFILE_PHOTOS ile aynı sınıfta.
export const DISPLAY_NAME_MAX_LENGTH = 50;

// ─── Profil prompt'ları ───────────────────────────────────────────────────────
// Bio'nun yerini alan "cümle başlangıcı + cevap" çiftleri.
// Sözleşme: `backend_profile_prompts_proposal.md` + backend cevabı (K1–K6).

/** Kullanıcı başına tavan. Backend `UT-2201` ile aynı sınırı doğruluyor. */
export const MAX_PROFILE_PROMPTS = 3;

/**
 * Kayıt akışında zorunlu minimum. `UpdateProfile`'da BU KURAL YOK: migration'dan
 * gelen kullanıcıların 0 prompt'u var ve boyunu değiştirebilmeleri gerekiyor
 * (öneri §4.6). Sadece "Prompts gönderiliyorsa" geçerli.
 */
export const MIN_PROFILE_PROMPTS = 1;

/**
 * Cevap tavanı — katalogda prompt başına `maxLength` geliyor, bu yalnızca o alan
 * gelmediğinde kullanılan varsayılan.
 *
 * ⚠️ BİRİM: **code point** (`[...s].length`), `s.length` DEĞİL. Backend
 * `EnumerateRunes().Count()` ile sayıyor (K5). UTF-16 uzunluğuyla sayarsak
 * emojili cevapta kullanıcı "148/150" görürken 400 yer — sayaç ve doğrulama
 * ikisi de `countGraphemesSafe` üzerinden geçmeli.
 */
export const PROMPT_ANSWER_MAX_LENGTH = 150;

/**
 * Cevap uzunluğunu backend'le AYNI birimde sayar (code point).
 *
 * `"👋 selam".length` → 8 (UTF-16), `countPromptAnswer` → 7. Backend 7 sayıyor.
 */
export const countPromptAnswer = (value: string): number => [...value].length;

/**
 * Backend'in `NormalizeWhitespace` karşılığı: trim + ardışık boşluk/satır sonu
 * tek boşluğa. Cevabın geri kalanına DOKUNULMAZ (büyük/küçük harf, noktalama).
 *
 * Sunucu bunu kaydetmeden önce uyguluyor; sayaç da aynı metni saymalı, yoksa
 * kullanıcı "150/150" görüp gönderdiğinde sunucuda 148 karakter kaydedilir.
 */
export const normalizePromptAnswer = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

// Sınıf (`UpdateProfile.YearOfStudy`) — ClassYearType ordinali.
// 0 = Hazırlık ve GEÇERLİ bir değerdir; "seçilmedi" ayrı bir durum (null).
//
// Backend artık `Range(0, 6)` doğruluyor. Eskiden `Range(0, 8)`ti ve 7/8
// gönderilince istek 200 dönüp değer DB'ye yazılıyor, ama enum'da tanımlı
// olmadığı için `yearOfStudyDisplay` null kalıyordu → kullanıcı "kaydedildi"
// görüp sınıfını hiçbir yerde göremiyordu. Aralık dışı değer artık 400 döner.
export const YEAR_OF_STUDY_VALUES = [0, 1, 2, 3, 4, 5, 6];
export const YEAR_OF_STUDY_RANGE = { min: 0, max: 6 };

/** Sınıf değeri backend'in kabul ettiği aralıkta mı (0 dahil). */
export const isValidYearOfStudy = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= YEAR_OF_STUDY_RANGE.min &&
  value <= YEAR_OF_STUDY_RANGE.max;
