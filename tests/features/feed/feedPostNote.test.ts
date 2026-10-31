/**
 * Akış satırındaki not butonunun kapısı.
 *
 * Test edilen iki şey var ve ikisi de "ölü buton" etrafında dönüyor:
 *
 *  1. KAPI BEYAZ LİSTE. Sunucu `state`e yeni bir değer eklediğinde istemci
 *     "çizme" tarafında kalmalı. Kara liste yazılırsa (bilinmeyen değer →
 *     çiz) o gün buton sunucunun reddettiği bir yere basar.
 *  2. SIRA. Yazarı/modu olmayan bir satırda bakiye kapısı ÇALIŞMAMALI:
 *     kullanıcıya, notu hiç gönderemeyeceği bir satırda paywall göstermek
 *     para isteyip karşılığını verememek olur.
 */

import {
  canNotePost,
  postNoteButtonVisible,
  postNoteMode,
  postNoteRequest,
} from "@/features/feed/feedPostNote";
import type { FeedPostDto } from "@/features/feed/feedTypes";

const post = (over: Partial<FeedPostDto> = {}): FeedPostDto =>
  ({
    id: "p1",
    body: "Yarın kütüphane kaçta açılıyor?",
    createdAt: "2026-10-01T09:00:00Z",
    expiresAt: "2026-10-16T09:00:00Z",
    isAnonymous: false,
    authorCategory: null,
    author: {
      userId: "u1",
      name: "Esra",
      age: 21,
      mainPhotoUrl: null,
      universityDisplay: "İTÜ",
    },
    likeCount: 0,
    likedByMe: false,
    isMine: false,
    status: "Published",
    replyCount: null,
    reply: { state: "Ok", conversationId: null },
    note: { state: "Ok", availableModes: ["Dating"] },
    ...over,
  }) as FeedPostDto;

describe("canNotePost", () => {
  it("yalnız Ok hâlinde true", () => {
    expect(canNotePost({ state: "Ok" })).toBe(true);
  });

  it("kapalı hâllerin hepsinde false", () => {
    for (const state of [
      "AlreadySent",
      "AlreadySwiped",
      "NoMode",
      "LikedMe",
      "Matched",
      "OwnPost",
      "Anonymous",
      "Restricted",
    ]) {
      expect(canNotePost({ state })).toBe(false);
    }
  });

  it("bilinmeyen state çizdirmiyor (beyaz liste)", () => {
    expect(canNotePost({ state: "SomethingNew" })).toBe(false);
  });

  it("alan hiç gelmezse çizdirmiyor", () => {
    expect(canNotePost(undefined)).toBe(false);
    expect(canNotePost(null)).toBe(false);
  });
});

describe("postNoteMode", () => {
  it("seçili mod uygunsa onu, değilse listedeki ilk modu veriyor", () => {
    expect(
      postNoteMode({ state: "Ok", availableModes: ["Dating", "Friends"] }, "Friends"),
    ).toBe("Friends");
    expect(postNoteMode({ state: "Ok", availableModes: ["Friends"] }, "Dating")).toBe(
      "Friends",
    );
  });

  it("liste boş ya da eksikse null", () => {
    expect(postNoteMode({ state: "Ok", availableModes: [] }, "Dating")).toBeNull();
    expect(postNoteMode({ state: "Ok" }, "Dating")).toBeNull();
  });

  it("state Ok değilse mod da yok", () => {
    expect(
      postNoteMode({ state: "AlreadySent", availableModes: ["Dating"] }, "Dating"),
    ).toBeNull();
  });
});

describe("postNoteRequest", () => {
  it("bakiye varken gönderime izin veriyor", () => {
    expect(postNoteRequest(post(), 3, "Dating")).toEqual({
      action: "send",
      userId: "u1",
      mode: "Dating",
      paywallReason: null,
    });
  });

  it("bakiye bitmişken paywall", () => {
    expect(postNoteRequest(post(), 0, "Dating")).toMatchObject({
      action: "paywall",
      paywallReason: "empty_balance",
    });
  });

  it("bakiye hiç gelmemişken de paywall, ama sebebi farklı", () => {
    expect(postNoteRequest(post(), null, "Dating")).toMatchObject({
      action: "paywall",
      paywallReason: "unknown_balance",
    });
  });

  it("kapı kapalıyken hiçbir şey yapmıyor", () => {
    expect(
      postNoteRequest(post({ note: { state: "AlreadySent" } }), 3, "Dating"),
    ).toMatchObject({ action: "none" });
  });

  it("yazar yoksa gönderim denenmiyor", () => {
    expect(postNoteRequest(post({ author: null }), 3, "Dating")).toMatchObject({
      action: "none",
    });
  });

  it("uygun mod yoksa gönderim denenmiyor", () => {
    expect(
      postNoteRequest(post({ note: { state: "Ok", availableModes: [] } }), 3, "Dating"),
    ).toMatchObject({ action: "none" });
  });

  it("yazarı/modu olmayan satırda BAKİYE KAPISI ÇALIŞMIYOR — paywall değil none", () => {
    // Sıra değişmezi: notu hiç gönderemeyeceği bir satırda kullanıcıdan para
    // istemek, karşılığını veremeyeceğimiz bir teklif olur.
    expect(postNoteRequest(post({ author: null }), 0, "Dating")).toMatchObject({
      action: "none",
      paywallReason: null,
    });
    expect(
      postNoteRequest(post({ note: { state: "Ok", availableModes: [] } }), null, "Dating"),
    ).toMatchObject({ action: "none", paywallReason: null });
  });
});

/**
 * Butonun ÇİZİLME kapısı, gönderim kapısıyla aynı şeyi söylemek zorunda.
 *
 * ⚠️ Bulgu (dalın kendi gözden geçirmesi): `state: "Ok"` gelirken `author`
 * null olan bir satırda buton çiziliyordu ama `postNoteRequest` "none"
 * döndüğü için basmak HİÇBİR ŞEY yapmıyordu — ölü buton. Sunucu anonim
 * gönderide `Anonymous` döndürmeli, ama bayat satır / eski sürüm o hâli
 * üretebiliyor ve kapı istemcide de tutmalı.
 */
describe("postNoteButtonVisible", () => {
  it("state Ok + yazar varken çiziliyor", () => {
    expect(postNoteButtonVisible(post())).toBe(true);
  });

  it("yazar yoksa ÇİZİLMİYOR — basınca hiçbir şey yapmayan buton olmaz", () => {
    expect(postNoteButtonVisible(post({ author: null }))).toBe(false);
  });

  it("kapı kapalıyken çizilmiyor", () => {
    expect(postNoteButtonVisible(post({ note: { state: "Matched" } }))).toBe(false);
    expect(postNoteButtonVisible(post({ note: undefined }))).toBe(false);
  });
});
