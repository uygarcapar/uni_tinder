import type { AppMode } from "@/features/discover/modeTheme";
import { resolveEditMode } from "./editMode";

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

/**
 * AKTİF modun ANA fotoğrafı — "kimlik" yüzeylerinin (tab bar avatarı, profil
 * hero'su) tek okuma yolu. Sabit `photosList` okuyan eski yol mod başına
 * fotoğrafla yalan söylemeye başladı: Arkadaş modunda Flört'ün yüzü çiziliyor
 * ve mod değişince görünüm "eskisinde kalıyor"du.
 *
 * Düşüş zinciri, kullanıcının yüzü hiç boş kalmasın diye:
 *   aktif modun anası → aktif modun ilk karesi → (aktif mod kapalı ya da
 *   listesi boşsa) resolveEditMode'un seçtiği/öbür modun aynı zinciri → null.
 */
export function modeMainPhotoOf(profile: unknown, active: AppMode): any | null {
  if (profile == null || typeof profile !== "object") return null;
  const p = profile as any;
  const friendsOpen = p?.modes?.friends !== false;
  const datingOpen = p?.modes?.dating !== false;
  const resolved = resolveEditMode(active, datingOpen, friendsOpen);
  const other: AppMode = resolved === "Friends" ? "Dating" : "Friends";
  for (const mode of [resolved, other]) {
    const list = modePhotosOf(p, mode);
    const main = list.find((photo) => photo?.isMainPhoto) ?? list[0];
    if (main) return main;
  }
  return null;
}

/**
 * `photoId` eşleşen kaydı HER İKİ listede yamalar; isabet olmayan liste (ve
 * isabet hiç yoksa profilin kendisi) AYNI referansla döner.
 *
 * Moderasyon kararı DOSYAYA ait (kütüphane modeli): aynı `photoId` iki modda
 * birden slot taşıyabilir ve karar değişince ikisi de güncellenmeli — tek
 * listeyi yamalamak öbür modun yüzeylerinde bayat rozet/karartma bırakır.
 * Referans korunumu gereksiz re-render'ı önlüyor (feedQueries >
 * patchPostInCaches'teki aynı gerekçe).
 */
export function patchPhotoInBothLists(
  profile: any,
  photoId: string,
  patch: (photo: any) => any,
): any {
  if (profile == null || typeof profile !== "object") return profile;
  let changed = false;
  const next = { ...profile };
  for (const key of ["photosList", "friendsPhotosList"] as const) {
    const list = profile[key];
    if (!Array.isArray(list)) continue;
    let hit = false;
    const patched = list.map((p) => {
      if (String(p?.photoId) !== photoId) return p;
      hit = true;
      return patch(p);
    });
    if (hit) {
      next[key] = patched;
      changed = true;
    }
  }
  return changed ? next : profile;
}
