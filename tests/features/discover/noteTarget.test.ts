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
  likerNoteTargetView,
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

/**
 * ALICININ gördüğü not — Beğeniler kartındaki kutunun üç sorusu: başlık ne
 * yazacak, alıntı bloğunda ne duracak, solda fotoğraf var mı.
 *
 * Karar burada saf olarak duruyor çünkü `LikeCard` (2200+ satır, FlatList
 * hücresi) testte render edilmiyor; kutunun kuralı orada gömülü kalsaydı
 * "gönderine not bıraktı" satırının hiç çizilmediği hâl sessizce geçerdi.
 */
describe("likerNoteTargetView", () => {
  const t = ((k: string) => k) as any;

  it("gönderi hedefi: başlık i18n yedeğinden, alıntı gönderinin anlık görüntüsünden", () => {
    expect(
      likerNoteTargetView(
        { kind: "FeedPost", postId: "p1", excerpt: "Yarın kütüphane kaçta?" },
        t,
      ),
    ).toEqual({
      label: "note.leftNoteOnPost",
      quote: "Yarın kütüphane kaçta?",
      photoUrl: null,
      removedNotice: null,
    });
  });

  it("sunucu hazır etiket gönderirse i18n yerine O basılıyor", () => {
    expect(
      likerNoteTargetView(
        { kind: "FeedPost", postId: "p1", excerpt: "x", label: "gönderine yanıt verdi" },
        t,
      ).label,
    ).toBe("gönderine yanıt verdi");
  });

  it("gönderi silinmişse not OKUNABİLİR kalıyor, altına bir satır düşüyor", () => {
    const view = likerNoteTargetView(
      { kind: "FeedPost", postId: "p1", excerpt: "x", postDeleted: true },
      t,
    );
    expect(view.quote).toBe("x");
    expect(view.removedNotice).toBe("note.postRemoved");
  });

  it("foto ve prompt hedefleri bugünkü davranışı koruyor", () => {
    expect(
      likerNoteTargetView({ kind: "Photo", photoUrl: "u" }, t),
    ).toMatchObject({ label: "note.leftNoteOnPhoto", photoUrl: "u", quote: null });
    expect(
      likerNoteTargetView({ kind: "Prompt", promptAnswer: "cevap" }, t),
    ).toMatchObject({ label: "note.leftNoteOnPrompt", quote: "cevap" });
  });

  it("hedefi olmayan notta hiçbir şey uydurulmuyor", () => {
    expect(likerNoteTargetView(null, t)).toEqual({
      label: null,
      quote: null,
      photoUrl: null,
      removedNotice: null,
    });
  });
});
