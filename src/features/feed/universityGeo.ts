import {
  lookupCityCoordinate,
  type CityCoordinate,
} from "@/shared/constants/cityCoordinates";
import type { UniversityOption } from "@/shared/queries/commonQueries";

/**
 * Üniversitenin haritadaki konumu — SUNUCUDAN.
 *
 * `GET /api/common/universities?distinct=true` her kayıt için `lat`/`lon`
 * döndürüyor (205 üniversite: 74'ü elle girilmiş kampüs koordinatı, 131'i il
 * merkezi — `isApproximate` hangisi olduğunu söylüyor).
 *
 * ── Neden istemci yedeği YOK ────────────────────────────────────────────────
 * Bir tur elle yazılmış domain→şehir tablosu vardı; sunucu sözleşmesi
 * kesinleşince SİLİNDİ. 205 üniversiteyi istemciye gömmek hem ölü yük hem
 * bakım borcuydu (üniversite açılıyor/kapanıyor, ad değişiyor) ve sunucu
 * zaten hepsini kapsıyor. Tek fallback `city` → il merkezi: sunucu şehri
 * biliyor ama koordinatı vermiyorsa (sözleşme dışı bir durum) harita yine
 * çizilebilsin.
 *
 * ⚠️ KOORDİNAT YOKSA `null` ve çağıran haritayı HİÇ ÇİZMİYOR. Yanlış yere pin
 * koymak kullanıcıya başka bir şehri kendi kampüsü sandırırdı.
 *
 * ⚠️ `isApproximate: true` olan koordinat PIN İÇİN yeterli ama MESAFE HESABI
 * İÇİN KULLANILMAZ (backend sözleşmesi bunu açıkça söylüyor): eşleşme mesafesi
 * her zaman kullanıcının kendi konumundan hesaplanıyor.
 */

/** Koordinat + ne kadar kesin olduğu. */
export interface UniversityCoordinate extends CityCoordinate {
  /** `true` = il merkezi (kampüs koordinatı değil). Yalnız pin için. */
  isApproximate: boolean;
}

export function resolveUniversityCoordinate(
  domain: string | null | undefined,
  option?: UniversityOption | null,
): UniversityCoordinate | null {
  // 1) Sunucunun koordinatı — kanonik.
  //    `lat`/`lon` sözleşmedeki adlar; `latitude`/`longitude` de okunuyor
  //    çünkü aynı bilgi kart DTO'larında o adlarla geliyor ve iki adlandırma
  //    arasında kalmak bir alan adı hatasını sessiz boş haritaya çevirir.
  const lat = (option as any)?.lat ?? (option as any)?.latitude;
  const lon = (option as any)?.lon ?? (option as any)?.longitude;
  if (typeof lat === "number" && typeof lon === "number") {
    return {
      latitude: lat,
      longitude: lon,
      // Alan yoksa KESİN varsayılıyor: sunucu yalnız yaklaşık olanları
      // işaretliyor, tersi değil.
      isApproximate: (option as any)?.isApproximate === true,
    };
  }

  // 2) Sunucunun şehri → il merkezi. Sözleşme dışı bir durum ama haritayı
  //    tamamen kaybetmekten iyi.
  const serverCity = (option as any)?.city;
  if (typeof serverCity === "string" && serverCity) {
    const fromCity = lookupCityCoordinate(serverCity);
    if (fromCity) return { ...fromCity, isApproximate: true };
  }

  // 3) Hiçbiri yok → harita çizilmiyor. `domain` imzada duruyor çünkü
  //    çağıranlar onu zaten elinde tutuyor ve ileride sunucu-dışı bir
  //    çözüm gerekirse imza değişmeden eklenebilir.
  void domain;
  return null;
}
