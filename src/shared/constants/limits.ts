// Swipe/SuperLike/Undo tavanları artık backend'den geliyor —
// GET /api/swipe/Stats → dailySwipeLimit / weeklySuperLikeLimit / dailyUndoLimit.
// Burada kopyası TUTULMUYOR; SwipeLimitsOptions değişirse FE otomatik uyar.

// Backend "sınırsız" için bu sentinel'i dönüyor (0 değil). remainingSwipes /
// remainingUndos / dailySwipeLimit / dailyUndoLimit aynı konvansiyonu kullanır.
export const UNLIMITED = -1;

// Mesafe filtresi yeniden TIER'A BAĞLI (backend sözleşmesi 2026-08-17):
// free 50 km, premium 100 km. Eski "sınırsız" semantiği (maxDistance: 0)
// KALDIRILDI — 0 gönderilirse backend tavanı uygular.
//
// Bu aralık slider'ın GÖRSEL sınırları ve aynı zamanda backend'in validasyon
// aralığı: FilterUpdateDto.MaxDistance artık Range(1, 100), 100'ün üstü 400
// döner (eski Range(0, 20000) kaldırıldı). Seçilebilir tavan bundan AYRI —
// bkz. maxDistanceKmForTier: halkalar 100'e kadar çizilir, tier tavanının
// üstündekiler soluk görünür.
export const DISTANCE_RANGE_KM = { min: 1, max: 100 };

// Tier tavanları sunucu config'inden geliyor (Discovery:FreeMaxDistanceKm /
// Discovery:PremiumMaxDistanceKm) ve şu an hiçbir uçtan DÖNMÜYOR — backend
// değerleri değiştirirse burası elle güncellenmeli.
//
// Tavanın üstü gönderilirse backend hata değil SESSİZ CLAMP uyguluyor (eski
// istemciler filtre kaydedemez hale gelmesin diye). Yani sınırı FE zorlamazsa
// kullanıcı 100 km seçtiğini sanır, backend 50 yazar ve arayüz yalan söyler.
export const FREE_MAX_DISTANCE_KM = 50;
export const PREMIUM_MAX_DISTANCE_KM = 100;

export const maxDistanceKmForTier = (isPremium: boolean) =>
  isPremium ? PREMIUM_MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM;

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

// Profil fotoğrafı tavanı/tabanı.
//
// ÜST SINIR (6) `PUT /api/profile/UpdateProfile`'da backend'de DOĞRULANMIYOR —
// yalnızca CompleteProfile'da var. Sınırı FE zorlamazsa 7+ fotoğraflı profil
// oluşuyor ve `PhotoOrders.NewOrder` alanının Range(1,6) doğrulamasıyla
// çelişiyor (sıralama artık kaydedilemiyor). Yani bu, kozmetik bir UI kuralı
// değil; tek savunma hattı burası.
export const MAX_PROFILE_PHOTOS = 6;

// ALT SINIR: silme sonrası en az 2 fotoğraf kalmalı — bunu backend doğruluyor
// (400 + "En az 2 fotoğrafınız olmalı..."). FE önden kesiyor ki kullanıcı
// jenerik "silinemedi" hatası yerine sebebi görsün.
export const MIN_PROFILE_PHOTOS = 2;
