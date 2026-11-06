/**
 * Mod başına foto alan adlarının TEK çözücüsü (modePhotoFields.ts).
 *
 * Alan adları backend kardeş-alan sözleşmesinden (mod başına fotoğraf,
 * 2026-11-06): okuma `photosList`/`friendsPhotosList`, yazma
 * `NewPhotos`/`FriendsNewPhotos` vb. Adlar iki yerde yazılırsa yüzeyler
 * sessizce ayrışır — tek kaynak bu modül.
 */

import {
  modePhotoFields,
  modePhotosOf,
} from "@/features/profile/modePhotoFields";

describe("modePhotoFields", () => {
  it("Dating → düz alan adları", () => {
    expect(modePhotoFields("Dating")).toEqual({
      listKey: "photosList",
      visibilityKey: "profileVisibility",
      newPhotosKey: "NewPhotos",
      photoOrdersKey: "PhotoOrders",
      newMainPhotoIdKey: "NewMainPhotoId",
      photoIdsToDeleteKey: "PhotoIdsToDelete",
    });
  });

  it("Friends → kardeş alan adları", () => {
    expect(modePhotoFields("Friends")).toEqual({
      listKey: "friendsPhotosList",
      visibilityKey: "friendsProfileVisibility",
      newPhotosKey: "FriendsNewPhotos",
      photoOrdersKey: "FriendsPhotoOrders",
      newMainPhotoIdKey: "FriendsNewMainPhotoId",
      photoIdsToDeleteKey: "FriendsPhotoIdsToDelete",
    });
  });
});

describe("modePhotosOf", () => {
  const profile = {
    photosList: [
      { photoId: "d2", order: 2 },
      { photoId: "d1", order: 1 },
    ],
    friendsPhotosList: [{ photoId: "f1", order: 1 }],
  };

  it("modun listesini order'a göre SIRALI döner", () => {
    expect(modePhotosOf(profile, "Dating").map((p) => p.photoId)).toEqual([
      "d1",
      "d2",
    ]);
  });

  it("Friends isteğinde friendsPhotosList okur", () => {
    expect(modePhotosOf(profile, "Friends").map((p) => p.photoId)).toEqual([
      "f1",
    ]);
  });

  it("profil null ya da alan yoksa []", () => {
    expect(modePhotosOf(null, "Dating")).toEqual([]);
    expect(modePhotosOf({}, "Friends")).toEqual([]);
  });

  it("order alanı eksikse 0 sayılır, sıralama yine deterministik", () => {
    const p = { photosList: [{ photoId: "b", order: 1 }, { photoId: "a" }] };
    expect(modePhotosOf(p, "Dating").map((x) => x.photoId)).toEqual(["a", "b"]);
  });
});
