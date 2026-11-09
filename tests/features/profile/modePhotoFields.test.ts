/**
 * Mod başına foto alan adlarının TEK çözücüsü (modePhotoFields.ts).
 *
 * Alan adları backend kardeş-alan sözleşmesinden (mod başına fotoğraf,
 * 2026-11-06): okuma `photosList`/`friendsPhotosList`, yazma
 * `NewPhotos`/`FriendsNewPhotos` vb. Adlar iki yerde yazılırsa yüzeyler
 * sessizce ayrışır — tek kaynak bu modül.
 */

import {
  modeAwaitingReviewOf,
  modeMainPhotoOf,
  modePhotoFields,
  modePhotosOf,
  modeVisibilityOf,
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

describe("modeMainPhotoOf", () => {
  // AKTİF modun ana fotosu — tab bar avatarı ve profil hero'su gibi "kimlik"
  // yüzeyleri bunu okumalı: mod başına fotoğrafta aktif modun yüzü başka,
  // sabit `photosList` okuyan eski yol Arkadaş'ta Flört'ün yüzünü gösteriyordu.
  const profile = {
    modes: { dating: true, friends: true },
    photosList: [
      { photoId: "d1", order: 1 },
      { photoId: "d2", order: 2, isMainPhoto: true },
    ],
    friendsPhotosList: [{ photoId: "f1", order: 1, isMainPhoto: true }],
  };

  it("aktif modun isMainPhoto karesini döner", () => {
    expect(modeMainPhotoOf(profile, "Dating")?.photoId).toBe("d2");
    expect(modeMainPhotoOf(profile, "Friends")?.photoId).toBe("f1");
  });

  it("ana işaretli kare yoksa ilk kareye düşer", () => {
    const p = { ...profile, friendsPhotosList: [{ photoId: "f9", order: 1 }] };
    expect(modeMainPhotoOf(p, "Friends")?.photoId).toBe("f9");
  });

  it("aktif mod KAPALIYSA açık modun anasına düşer (resolveEditMode kuralı)", () => {
    const p = { ...profile, modes: { dating: true, friends: false } };
    expect(modeMainPhotoOf(p, "Friends")?.photoId).toBe("d2");
  });

  it("modun listesi boşsa ve profil de boşsa null", () => {
    expect(modeMainPhotoOf({ modes: { dating: true, friends: true } }, "Friends")).toBeNull();
    expect(modeMainPhotoOf(null, "Dating")).toBeNull();
  });

  it("aktif modun listesi boşsa öbür modun anasına düşer (yüz hiç boş kalmasın)", () => {
    const p = { ...profile, friendsPhotosList: [] };
    expect(modeMainPhotoOf(p, "Friends")?.photoId).toBe("d2");
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

describe("modeVisibilityOf / modeAwaitingReviewOf", () => {
  // Prod vakası (2026-11-09): Flört hiç açılmamış, Arkadaş'ta 2 onaylı foto.
  const friendsOnly = {
    profileVisibility: {
      state: "ModeNotOpened",
      visiblePhotoCount: 0,
      requiredPhotoCount: 2,
      reasonCode: "mode_not_opened",
    },
    friendsProfileVisibility: {
      state: "Visible",
      visiblePhotoCount: 2,
      requiredPhotoCount: 2,
      reasonCode: null,
    },
    photosList: [],
    friendsPhotosList: [
      { photoId: 1, moderationStatus: "Approved" },
      { photoId: 2, moderationStatus: "Pending" },
    ],
  };

  it("aktif modun bloğunu okur", () => {
    expect(modeVisibilityOf(friendsOnly, "Friends")!.state).toBe("Visible");
    expect(modeVisibilityOf(friendsOnly, "Dating")!.state).toBe("ModeNotOpened");
  });

  it("bekleyen fotoğrafı aktif modun listesinden sayar", () => {
    expect(modeAwaitingReviewOf(friendsOnly, "Friends")).toBe(true);
    expect(modeAwaitingReviewOf(friendsOnly, "Dating")).toBe(false);
  });

  it("kaynak ya da alan yoksa null — BİLİNMİYOR", () => {
    expect(modeVisibilityOf(null, "Dating")).toBeNull();
    expect(modeVisibilityOf({}, "Friends")).toBeNull();
    expect(modeAwaitingReviewOf({}, "Friends")).toBeNull();
  });
});
