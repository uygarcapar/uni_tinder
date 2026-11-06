/**
 * Akış listesinin BLOKE boş durumu kararı (feedListBlock.ts).
 *
 * İki terminal kod var ve ikisi de "liste boş" değil "liste HİÇ YOK" demek:
 *   • UT-7301 — özellik kapalı (sunucu bayrağı). Yapılacak şey yok.
 *   • UT-2304 — kullanıcı Arkadaş profilini açmamış (BE 2026-11-06: akış
 *     Arkadaş'a özel, GET /api/feed/posts artık 403 dönüyor). Yapılacak şey
 *     VAR: "Profili aç" CTA'sı.
 * İkisini tek "disabled" ekranında eritmek, açabileceği bir modu "kapalı"
 * diye göstermek olurdu (MODE_CODES'taki uyarının aynısı).
 */

import { feedListBlock } from "@/features/feed/feedListBlock";

describe("feedListBlock", () => {
  it("kod yoksa blok yok", () => {
    expect(feedListBlock([null, null, null])).toBeNull();
  });

  it("UT-7301 → 'disabled'", () => {
    expect(feedListBlock([null, "UT-7301", null])).toBe("disabled");
  });

  it("UT-2304 → 'modeNotOpened' (Arkadaş profili açılmamış)", () => {
    expect(feedListBlock(["UT-2304", null, null])).toBe("modeNotOpened");
  });

  it("ikisi birden geldiyse 'disabled' kazanır — özellik kapısı mod kapısından güçlü", () => {
    expect(feedListBlock(["UT-2304", "UT-7301"])).toBe("disabled");
  });

  it("tanınmayan kodlar blok üretmez (normal hata/boş durum yolu)", () => {
    expect(feedListBlock(["UT-9999", "ERR_NETWORK"])).toBeNull();
  });
});
