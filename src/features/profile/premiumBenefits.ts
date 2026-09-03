/**
 * Premium'un AÇTIĞI ŞEYLERİN tek listesi.
 *
 * İki yerde çiziliyor ve ikisi de aynı karşılaştırma tablosu tasarımını
 * kullanıyor (özellik adı · Free ✗ · plus ✓):
 *  - ProfileScreen upsell kartı → yalnız `UPSELL_BENEFIT_KEYS` (ilk dördü),
 *    kalanı "+N özellik daha" satırına iniyor.
 *  - PurchaseModal → listenin TAMAMI.
 * Liste burada duruyor ki ikisi ayrışmasın: upsell'de vaat edilip paywall'da
 * bulunmayan bir madde, satın almanın hemen öncesinde güven kıran şeydir.
 *
 * SIRA = ÖNEM SIRASI. İlk dört madde upsell kartında görünen dörttür; sırayı
 * değiştirmek upsell'i de değiştirir.
 *
 * Metinler `discover.premium.benefits.<key>` altında. Maddeler premium tarafının
 * vaadi olarak yazılıyor ("Sınırsız beğeni"), çünkü tabloda free sütunu ✗
 * çiziyor — "30 beğeni" gibi bir başlık o ✗ ile birlikte YALAN olurdu.
 *
 * ⚠️ Metinlerde SAYI YOK. Kotaların tamamı sunucu config'inden geliyor
 * (`SwipeLimits`, `Discovery:*MaxDistanceKm`) ve FE güncellemesi olmadan
 * değişebiliyor — mesafe tavanı zaten 50/100'den 75/150'ye taşındı. Süper
 * Beğeni'de ayrıca döngü tier'a bağlı (haftalık/aylık/yıllık), o yüzden
 * "haftalık 5" değil "yenilenen" deniyor: free'de hak TEK SEFERLİK, premium'da
 * döngüyle yenileniyor — gerçek fark bu.
 *
 * Kaynak: backend premium akışı dokümanı §6 gating tablosu.
 * Kasıtlı olarak YOK:
 *  - "Reklamsız deneyim" — uygulamada reklam yok, satılacak bir şey değil.
 *  - "Beni kim beğendi listesi" backend'de free'ye de açık; premium farkı
 *    listenin BLURSUZ görünmesi (bkz. LikesScreen), madde de onu söylüyor.
 */
// ⚠️ Yeni bir anahtar eklerken simgesini de ekle: her maddenin açıklama
// sheet'inin tepesinde büyük bir ikon var (bkz. components/PremiumBenefitIcon).
// Eşlemesi Record<PremiumBenefitKey, …> olduğu için eksik bırakırsan tsc
// söyler — ama gliflerini elle seçen iki madde (superLikes / premiumBadge)
// oradan dışlanmış durumda.
export const PREMIUM_BENEFIT_KEYS = [
  "unlimitedLikes",
  "seeLikes",
  "unlimitedMessages",
  "unlimitedUndo",
  "superLikes",
  "advancedFilters",
  "widerDistance",
  "missedMatchRecovery",
  "discoveryPriority",
  "premiumBadge",
] as const;

export type PremiumBenefitKey = (typeof PREMIUM_BENEFIT_KEYS)[number];

/** Upsell kartına sığan madde sayısı — gerisi "daha fazlası" satırı. */
export const UPSELL_BENEFIT_COUNT = 4;

export const UPSELL_BENEFIT_KEYS = PREMIUM_BENEFIT_KEYS.slice(
  0,
  UPSELL_BENEFIT_COUNT,
);

/** "+N özellik daha" satırındaki N. */
export const UPSELL_HIDDEN_BENEFIT_COUNT =
  PREMIUM_BENEFIT_KEYS.length - UPSELL_BENEFIT_COUNT;

/** i18n anahtarı — `t()` çağrısı bileşenlerde. */
export const premiumBenefitLabelKey = (key: PremiumBenefitKey) =>
  `discover.premium.benefits.${key}`;

/**
 * Maddenin "bu ne işe yarıyor" açıklaması — paywall'daki info sheet'i bunu
 * gösteriyor (bkz. PremiumBenefitInfoSheet).
 *
 * Başlıklar tabloya sığsın diye üç kelime; kullanıcının "sınırsız geri alma
 * da ne" sorusunun cevabı burada. Açıklamalarda da SAYI YOK, aynı gerekçe:
 * kotalar sunucu config'inden geliyor. Ücretsiz tarafın kısıtı niteliksel
 * anlatılıyor ("sınırlıdır", "kendiliğinden yenilenmez").
 */
export const premiumBenefitDetailKey = (key: PremiumBenefitKey) =>
  `discover.premium.benefitDetails.${key}`;
