/**
 * Akış kartının aksiyon modu kararı.
 *
 * Test edilen şey SESSİZ YANLIŞ MOD: kullanıcı arkadaş olmak isterken flört
 * beğenisi gitmiş olursa (ya da tersi) karar geri alınamaz. Üç girdili bir
 * seçim ve yanlış dalın hiçbir görünür belirtisi yok.
 */

import {
  feedCardActions,
  authorLikedMe,
  resolveCardMode,
  normalizeModes,
} from "@/features/feed/feedCardMode";

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

/**
 * Kartta hangi aksiyonların çizildiği.
 *
 * Test edilen şey SESSİZ GERİLEME: Flört'te düz beğeni geri gelirse akış bir
 * tek dokunuşla bedelsiz beğeni dağıtan yüzeye dönüyor ve kural yalnız burada
 * yazılı (sunucu düz beğeniyi iki modda da kabul ediyor — bkz. fonksiyonun
 * notu). Ters yönde de aynı: Arkadaş'ta beğeni kapanırsa kullanıcının elinde
 * yalnız bedelli iki yol kalıyor.
 */
describe("feedCardActions", () => {
  it("NORMAL (Flört): yalnız Fire ve not — X ve tik YOK", () => {
    expect(feedCardActions("Dating", false)).toEqual({
      like: false, pass: false, fire: true, note: true,
    });
  });

  it("NORMAL (Arkadaş): Flört'le AYNI küme — fark yalnız butonun adında", () => {
    expect(feedCardActions("Friends", false)).toEqual({
      like: false, pass: false, fire: true, note: true,
    });
  });

  it("BEĞENİLMİŞ: kabul + reddet — Fire ve not YOK (iki modda da)", () => {
    const expected = { like: true, pass: true, fire: false, note: false };
    expect(feedCardActions("Dating", true)).toEqual(expected);
    expect(feedCardActions("Friends", true)).toEqual(expected);
  });

  it("mod yoksa hiçbiri — beğenilmiş olsa BİLE kart salt okunur", () => {
    // Review Focus #1: sunucu "beni beğenmiş" derken yazarın açık modu
    // olmayabilir. Beğenilmiş hâli modsuzluğu EZMEMELİ, yoksa sunucunun
    // reddedeceği bir kabul butonu çizilir.
    const none = { like: false, pass: false, fire: false, note: false };
    expect(feedCardActions(null, false)).toEqual(none);
    expect(feedCardActions(null, true)).toEqual(none);
  });

  it("like ve pass her hâlde BİRLİKTE — tek başına X'e dönüş yolu kapalı", () => {
    // Bu işin düzelttiği hata tam olarak tek başına duran bir X'ti.
    for (const mode of ["Dating", "Friends", null] as const) {
      for (const liked of [true, false]) {
        const a = feedCardActions(mode, liked);
        expect(a.like).toBe(a.pass);
      }
    }
  });
});

/**
 * "Yazar beni beğenmiş mi" — kartın HANGİ HÂLDE doğacağını belirleyen tespit.
 *
 * İki kaynağın OR'u (bkz. DiscoverScreen'deki aynı kalıp): sunucunun bayrağı
 * VEYA yerel "beni beğenenler" kümesi. Yanlış pozitif, zaten bekleyen birine
 * Fire yakılmasını önlerken; yanlış negatif, kullanıcıya hiçbir şey yapmayan
 * iki buton gösteriyor.
 */
describe("authorLikedMe", () => {
  const noneLocal = () => false;
  const allLocal = () => true;

  it("sunucu bayrağı true ise beğenilmiş", () => {
    expect(authorLikedMe({ userId: "u1", hasLikedMe: true }, noneLocal)).toBe(true);
  });

  it("bayrak yoksa yerel kümeye düşüyor", () => {
    expect(authorLikedMe({ userId: "u1" }, allLocal)).toBe(true);
    expect(authorLikedMe({ userId: "u1" }, noneLocal)).toBe(false);
  });

  it("yüklem YALNIZ profilin userId'si ile çağrılıyor", () => {
    const spy = jest.fn(() => false);
    authorLikedMe({ userId: "u1" }, spy);
    expect(spy).toHaveBeenCalledWith("u1");
  });

  /**
   * Review Focus #2: `userId` YOKSA tespit kapalı. Aksi halde kabul/reddet
   * çizilir ama `LikerSwipeModal > handleSwipe` userId'siz yalnız kartı
   * kapatıyor — basılınca hiçbir şey yapmayan iki buton.
   */
  it.each([undefined, null, ""])("userId yoksa (%p) false — bayrak true OLSA BİLE", (userId) => {
    expect(authorLikedMe({ userId, hasLikedMe: true }, allLocal)).toBe(false);
  });

  /**
   * Review Focus #3: bayrak KATI `=== true`. Gevşetilirse ("Boolean(...)")
   * sunucudan gelen "false" string'i true olur ve kullanıcıya yanlış hâl
   * gösterilir. Katı karşılaştırmanın güvenli tarafı: bilinmiyorsa normal kart.
   */
  it.each(["true", "false", 1, 0, {}])(
    "bayrak boolean değilse (%p) yok sayılıyor",
    (hasLikedMe) => {
      expect(authorLikedMe({ userId: "u1", hasLikedMe }, noneLocal)).toBe(false);
    },
  );

  it("profil yoksa false — kart henüz yüklenmemiş", () => {
    expect(authorLikedMe(null, allLocal)).toBe(false);
    expect(authorLikedMe(undefined, allLocal)).toBe(false);
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
