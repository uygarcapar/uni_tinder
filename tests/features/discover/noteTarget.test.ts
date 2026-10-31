/**
 * Not hedefinin gönderim sözleşmesi.
 *
 * Test edilen asıl şey HEDEFİN SESSİZCE KAYMASI: `noteTargetPayload` sunucuya
 * giden gövdeyi üretiyor ve ilgisiz alanlar AÇIKÇA null yazılmak zorunda
 * (sözleşme §2.1). Bir alan unutulursa sunucu notu başka bir içeriğin altına
 * yazar ve alıcı hiç bahsi geçmeyen bir şeye yorum yapılmış görür — geri
 * alınamaz, çünkü kredi harcanmış olur.
 */

import {
  noteTargetLabel,
  noteTargetPayload,
  photoNoteTarget,
  postNoteTarget,
  promptNoteTarget,
  isSameNoteTarget,
} from "@/features/discover/noteTarget";

describe("noteTargetPayload", () => {
  it("gönderi hedefinin payload'ı postId taşıyor, diğerleri açıkça null", () => {
    expect(noteTargetPayload(postNoteTarget("p1"))).toEqual({
      kind: "FeedPost",
      photoIndex: null,
      promptKey: null,
      postId: "p1",
    });
  });

  it("foto ve prompt hedeflerinde postId açıkça null", () => {
    expect(noteTargetPayload(photoNoteTarget(0)).postId).toBeNull();
    expect(noteTargetPayload(promptNoteTarget("Travel")).postId).toBeNull();
  });
});

describe("isSameNoteTarget", () => {
  it("aynı gönderi aynı hedef, farklı gönderi değil", () => {
    expect(isSameNoteTarget(postNoteTarget("p1"), postNoteTarget("p1"))).toBe(
      true,
    );
    expect(isSameNoteTarget(postNoteTarget("p1"), postNoteTarget("p2"))).toBe(
      false,
    );
    expect(isSameNoteTarget(postNoteTarget("p1"), photoNoteTarget(0))).toBe(
      false,
    );
  });
});

describe("noteTargetLabel", () => {
  it("gönderi hedefinin etiketi note.targetPost", () => {
    const t = jest.fn((k: string) => k);
    expect(noteTargetLabel(postNoteTarget("p1"), null, t)).toBe(
      "note.targetPost",
    );
  });
});
