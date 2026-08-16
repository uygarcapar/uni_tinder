/**
 * Profil fotoğrafı URL'lerinin cache anahtarını fotoğraf KAYDINA bağlar.
 *
 * NEDEN: expo-image cache'i (memory + DISK) yalnızca URL ile anahtarlanır.
 * Backend yeni yüklenen fotoğrafı kullanıcının slot yoluna yazdığı için
 * silinip yeniden eklenen bir fotoğraf öncekiyle AYNI URL'e düşebiliyor →
 * yeni foto eski byte'larla çiziliyor. Disk cache reload'ları da aştığından
 * "edit modalda yeni foto eski gibi görünüyor, kapatıp açınca da düzelmiyor"
 * hatası kalıcı oluyordu. photoId her kayıt için benzersiz; URL'e sürüm
 * parametresi olarak eklenince yeni fotoğraf ZORUNLU olarak cache miss olur
 * (aradaki CDN varsa o da tam query string ile anahtarlar).
 */

type PhotoLike = {
  photoId?: string | number | null;
  photoImageUrl?: string | null;
  isMainPhoto?: boolean | null;
  // Backend aynı kaydın dosyasını yerinde değiştiriyorsa photoId sürüm olarak
  // yetmez; payload'da varsa zaman damgası da anahtara girer. Yoksa yok sayılır.
  updatedAt?: string | number | null;
  uploadedAt?: string | number | null;
  createdAt?: string | number | null;
} | null | undefined;

/**
 * `url`e sürüm parametresi ekler. Yalnız http(s) adreslerine dokunur —
 * `file://`, `content://` ve `data:` URI'lerinde query eklemek yüklemeyi
 * bozar (kayıt akışındaki yerel crop çıktıları bu sınıfa girer).
 */
export const withPhotoVersion = (
  url: string | null | undefined,
  version: string | number | null | undefined,
): string | undefined => {
  if (!url) return undefined;
  if (version === null || version === undefined || version === '') return url;
  if (!/^https?:\/\//i.test(url)) return url;

  const param = `v=${encodeURIComponent(String(version))}`;
  if (url.includes(`?${param}`) || url.includes(`&${param}`)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${param}`;
};

/** Fotoğraf kaydının kimliği + (varsa) zaman damgasından sürüm token'ı. */
const versionOf = (photo: PhotoLike): string | undefined => {
  const stamp = photo?.updatedAt ?? photo?.uploadedAt ?? photo?.createdAt;
  const parts = [photo?.photoId, stamp].filter(
    (v) => v !== null && v !== undefined && v !== '',
  );
  return parts.length ? parts.join('-') : undefined;
};

/** photosList elemanını doğrudan <Image source> için hazır URI'ye çevirir. */
export const resolvePhotoUri = (photo: PhotoLike): string | undefined =>
  withPhotoVersion(photo?.photoImageUrl, versionOf(photo));

/**
 * Profilin ana fotoğrafı: isMainPhoto → ilk foto → profileImageUrl fallback'i.
 * ProfileScreen header'ı, AppNavigator avatar'ı ve preview aynı sırayı
 * kullanıyordu; sürümleme de tek yerde kalsın diye buraya alındı.
 */
export const resolveMainPhotoUri = (
  profile: { photosList?: PhotoLike[]; profileImageUrl?: string | null } | null | undefined,
): string | undefined => {
  const list = profile?.photosList;
  const main = list?.find((p) => p?.isMainPhoto) ?? list?.[0];
  return resolvePhotoUri(main) ?? profile?.profileImageUrl ?? undefined;
};
