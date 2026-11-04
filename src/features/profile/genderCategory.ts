import type { GenderCategoryOption } from "@/shared/queries/commonQueries";

/**
 * Cinsiyet KATEGORİSİ çözümlemesi — Friends havuz sorusunun kapısı.
 *
 * Friends modunda eşleşme kuralı aynı cinsiyet. Değer ikili kategorilerde
 * SUNUCU tarafından türetilip kilitleniyor; havuz sorusu yalnız Non-Binary
 * kullanıcıya soruluyor (bkz. backend_friends_same_gender_2026-11.md §7).
 *
 * ⚠️ Bu modül YALNIZ KAYIT sırasında kullanılıyor — orada profil henüz
 * sunucuda yok, dolayısıyla kararı istemci kataloğdan vermek zorunda.
 * Kayıttan SONRA istemci kategori türetmez: `friendsInterestedInLocked`
 * bayrağını okur. İki yolun ayrı olmasının sebebi aşağıdaki belirsizlik.
 */

/**
 * `GET /api/common/genders` kataloğundaki Non-Binary kategorisinin enum adı.
 * Tek yerde duruyor ki backend adı değiştirirse tek satır düzelsin.
 */
const NON_BINARY_CATEGORY = "NonBinary";

/**
 * Verilen alt cinsiyet YALNIZ Non-Binary kategorisinde mi görünüyor?
 *
 * Belirsizlikte `false` — yani "sorma, sunucu türetsin". Belirsizlik gerçek
 * bir durum: backend `Transgender`ı hem Erkek hem Kadın kategorisinde
 * döndürüyor ve profilde yalnız alt cinsiyetin `enumName`i saklanıyor, yani
 * alt cinsiyet → kategori eşlemesi tek anlamlı değil. İstemcinin "listede
 * ilk hangi kategoride geçiyorsa o" tahmini sıraya bağlı ve bir kuralın
 * temeli olamaz (bkz. GenderCategoryPicker > categoryOfValue).
 *
 * Bugünkü katalogda ikizlenen değerler Erkek/Kadın altında, Non-Binary'de
 * ikizlenme yok — yani bu karar pratikte belirsizliğe hiç düşmüyor. Yine de
 * kural burada duruyor: katalog değişirse sessizce yanlış tarafa düşmek
 * yerine soruyu hiç sormayız.
 *
 * `false` döner: katalog yok/boş, cinsiyet yok, alt cinsiyet katalogda yok,
 * ya da alt cinsiyet birden fazla kategoride görünüyor.
 */
export function isNonBinaryOnlyGender(
  categories: GenderCategoryOption[] | null | undefined,
  genderEnumName: string | null | undefined,
): boolean {
  if (!genderEnumName) return false;
  if (!Array.isArray(categories) || categories.length === 0) return false;

  const owners = categories.filter((c) =>
    Array.isArray(c?.subGenders)
      ? c.subGenders.some((sg) => sg?.enumName === genderEnumName)
      : false,
  );

  // Tam olarak bir kategori: birden fazlaysa belirsiz, sıfırsa katalogda yok.
  if (owners.length !== 1) return false;
  return owners[0].categoryEnumName === NON_BINARY_CATEGORY;
}
