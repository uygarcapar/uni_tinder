/**
 * Akış kartının aksiyon modu kararı.
 *
 * Test edilen şey SESSİZ YANLIŞ MOD: kullanıcı arkadaş olmak isterken flört
 * beğenisi gitmiş olursa (ya da tersi) karar geri alınamaz. Üç girdili bir
 * seçim ve yanlış dalın hiçbir görünür belirtisi yok.
 */

import { resolveCardMode, normalizeModes } from "@/features/feed/feedCardMode";

describe("resolveCardMode", () => {
  it("seçili mod uygunsa ONU kullanıyor", () => {
    // Kullanıcı az önce Arkadaş'ı seçtiyse akışta da arkadaş aradığını
    // varsaymak doğru taraf.
    expect(resolveCardMode(["Dating", "Friends"], "Friends")).toBe("Friends");
    expect(resolveCardMode(["Dating", "Friends"], "Dating")).toBe("Dating");
  });

  it("seçili mod uygun değilse listedeki ilk uygun moda düşüyor", () => {
    expect(resolveCardMode(["Friends"], "Dating")).toBe("Friends");
    expect(resolveCardMode(["Dating"], "Friends")).toBe("Dating");
  });

  it("hiçbir mod uygun değilse null — kart SALT OKUNUR", () => {
    expect(resolveCardMode([], "Dating")).toBeNull();
  });

  /**
   * ⚠️ ALAN HİÇ GELMEZSE de salt okunur. Eski sunucu `availableModes`
   * göndermiyor; "varsayılan olarak Dating uygun" demek, kullanıcıya
   * reddedilecek bir buton göstermek olurdu.
   */
  it.each([undefined, null, "Dating", 0, {}])(
    "liste değil (%p) → null",
    (value) => {
      expect(resolveCardMode(value, "Dating")).toBeNull();
    },
  );

  it("bilinmeyen mod değerleri ELENİYOR", () => {
    // Tanınmayan bir mod sorgu parametresine girerse sunucu 400 döner; ayrıca
    // ileride eklenecek üçüncü bir mod, onu desteklemeyen bu sürümde sessizce
    // "uygun" sayılıp kart o modda açılırdı.
    expect(resolveCardMode(["StudyPartner"], "Dating")).toBeNull();
    expect(resolveCardMode(["StudyPartner", "Friends"], "Dating")).toBe("Friends");
    // Küçük harf de geçersiz: wire değerleri PascalCase.
    expect(resolveCardMode(["dating"], "Dating")).toBeNull();
  });
});

describe("normalizeModes", () => {
  it("geçerli değerleri sırasıyla koruyor", () => {
    expect(normalizeModes(["Friends", "Dating"])).toEqual(["Friends", "Dating"]);
  });

  it("mükerrerleri eliyor", () => {
    expect(normalizeModes(["Dating", "Dating", "Friends"])).toEqual([
      "Dating",
      "Friends",
    ]);
  });

  it("liste olmayan girdide boş dizi", () => {
    expect(normalizeModes(undefined)).toEqual([]);
    expect(normalizeModes("Dating")).toEqual([]);
  });
});
