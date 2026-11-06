import type { AppMode } from "@/features/discover/modeTheme";

/**
 * Mod başına foto ALAN ADLARININ tek çözücüsü.
 *
 * Backend kardeş-alan sözleşmesi (mod başına fotoğraf, 2026-11-06): okuma
 * `photosList`/`friendsPhotosList` + `profileVisibility`/
 * `friendsProfileVisibility`; yazma `NewPhotos`/`FriendsNewPhotos`,
 * `PhotoOrders`/`FriendsPhotoOrders`, `NewMainPhotoId`/`FriendsNewMainPhotoId`,
 * `PhotoIdsToDelete`/`FriendsPhotoIdsToDelete`. "Gönderilmeyen alana
 * dokunulmaz" — yani yanlış anahtar sessizce ÖBÜR modun profiline yazar ve
 * kimse hata görmez. Adlar bu yüzden tek yerde; ikinci bir kopya açma.
 */
export type ModePhotoFields = {
  listKey: "photosList" | "friendsPhotosList";
  visibilityKey: "profileVisibility" | "friendsProfileVisibility";
  newPhotosKey: "NewPhotos" | "FriendsNewPhotos";
  photoOrdersKey: "PhotoOrders" | "FriendsPhotoOrders";
  newMainPhotoIdKey: "NewMainPhotoId" | "FriendsNewMainPhotoId";
  photoIdsToDeleteKey: "PhotoIdsToDelete" | "FriendsPhotoIdsToDelete";
};

const DATING_FIELDS: ModePhotoFields = {
  listKey: "photosList",
  visibilityKey: "profileVisibility",
  newPhotosKey: "NewPhotos",
  photoOrdersKey: "PhotoOrders",
  newMainPhotoIdKey: "NewMainPhotoId",
  photoIdsToDeleteKey: "PhotoIdsToDelete",
};

const FRIENDS_FIELDS: ModePhotoFields = {
  listKey: "friendsPhotosList",
  visibilityKey: "friendsProfileVisibility",
  newPhotosKey: "FriendsNewPhotos",
  photoOrdersKey: "FriendsPhotoOrders",
  newMainPhotoIdKey: "FriendsNewMainPhotoId",
  photoIdsToDeleteKey: "FriendsPhotoIdsToDelete",
};

export function modePhotoFields(mode: AppMode): ModePhotoFields {
  return mode === "Friends" ? FRIENDS_FIELDS : DATING_FIELDS;
}

/**
 * Modun foto listesi, `order`a göre SIRALI; profil/alan yoksa [].
 *
 * Sıralama kopyada yapılıyor — sunucu listesi mutate edilmez (aynı referans
 * başka okuyucularda duruyor olabilir).
 */
export function modePhotosOf(profile: unknown, mode: AppMode): any[] {
  if (profile == null || typeof profile !== "object") return [];
  const list = (profile as any)[modePhotoFields(mode).listKey];
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
}
