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
  patchPhotoInBothLists,
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

describe("patchPhotoInBothLists", () => {
  // Moderasyon kararı DOSYAYA ait (kütüphane modeli): aynı photoId iki
  // listede birden olabilir ve karar değiştiğinde İKİSİ de güncellenmeli —
  // tek listeyi yamalamak öbür modun kartında bayat rozet bırakır.
  const profile = () => ({
    photosList: [
      { photoId: "shared", status: "Pending" },
      { photoId: "d-only", status: "Approved" },
    ],
    friendsPhotosList: [
      { photoId: "shared", status: "Pending" },
      { photoId: "f-only", status: "Approved" },
    ],
  });

  it("aynı photoId iki listedeyken ikisi de yamalanır", () => {
    const next = patchPhotoInBothLists(profile(), "shared", (p) => ({
      ...p,
      status: "Approved",
    }));
    expect(next.photosList[0].status).toBe("Approved");
    expect(next.friendsPhotosList[0].status).toBe("Approved");
  });

  it("tek listedeyken öbür listeye dokunulmaz (referans korunur)", () => {
    const input = profile();
    const next = patchPhotoInBothLists(input, "d-only", (p) => ({
      ...p,
      status: "Rejected",
    }));
    expect(next.photosList[1].status).toBe("Rejected");
    expect(next.friendsPhotosList).toBe(input.friendsPhotosList);
  });

  it("isabet yoksa aynı referans döner", () => {
    const input = profile();
    expect(patchPhotoInBothLists(input, "yok", (p) => ({ ...p }))).toBe(input);
  });
});
