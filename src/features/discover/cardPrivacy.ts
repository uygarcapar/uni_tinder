/**
 * ProfileCardDto gizlilik alanlarının çözümü.
 *
 * Kart üreten dört backend yolu (Discover / Beğeniler / beğenen detayı /
 * kaçırılan eşleşmeler) aynı DTO'yu döndürüyor ve gizliliği sunucuda uyguluyor:
 * ham veri gerçekten siliniyor, proxy'den bakan da göremiyor. Ama `age` ve
 * `distance` DTO'da **non-nullable int** olduğu için "gizli" durumu `null` ile
 * değil **`0` ile** anlatılıyor. Doğrudan basıldığında kartta ", 0" / "0 km"
 * yazıyor — bu dosya o dönüşümü tek yerde yapıyor.
 *
 * Premium için bilerek bayrak YOK: `showPremiumBadge` diye bir alan gelmiyor,
 * çünkü bayrağın kendisi "bu kişi rozetini gizleyen bir premium" bilgisini
 * sızdırırdı. Rozetini gizleyen premium ile free kullanıcının kartı ayırt
 * edilemez olmalı — tek doğru davranış `isPremium`'a bakmak (bkz. SwipeCard).
 */

type AgeCarrier = {
  age?: number | string | null;
  showAge?: boolean | null;
};

/**
 * Kartta gösterilecek yaş, ya da gizli/geçersizse `null`.
 *
 * İki koşul da eleme yapıyor ve ikisi de gerekli:
 *   - `showAge === false` → kullanıcı kapatmış, sayıya hiç bakma.
 *   - `age <= 0` → bayrağı göndermeyen sürümlerde tek sinyal bu (ve kendi
 *     profil önizlemesi `null` geçiyor).
 *
 * `age` yalnız gerçekten `undefined`/`null` olduğunda değil, 0'da da gizli
 * sayılır; gerçek bir kullanıcı 0 yaşında olamayacağı için bu kayıpsız.
 */
export function resolveCardAge(profile: AgeCarrier | null | undefined): number | null {
  if (!profile) return null;
  if (profile.showAge === false) return null;
  const age = typeof profile.age === "string" ? Number(profile.age) : profile.age;
  if (typeof age !== "number" || !Number.isFinite(age) || age <= 0) return null;
  return age;
}
