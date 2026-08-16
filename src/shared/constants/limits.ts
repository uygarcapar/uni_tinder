// Swipe/SuperLike/Undo tavanları artık backend'den geliyor —
// GET /api/swipe/Stats → dailySwipeLimit / weeklySuperLikeLimit / dailyUndoLimit.
// Burada kopyası TUTULMUYOR; SwipeLimitsOptions değişirse FE otomatik uyar.

// Backend "sınırsız" için bu sentinel'i dönüyor (0 değil). remainingSwipes /
// remainingUndos / dailySwipeLimit / dailyUndoLimit aynı konvansiyonu kullanır.
export const UNLIMITED = -1;

// Mesafe filtresi artık tier'dan bağımsız — free ve premium aynı aralığı
// kullanır. Aşağıdaki değerler yalnız UI slider'ının görsel aralığı.
export const DISTANCE_RANGE_KM = { min: 5, max: 100 };

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
