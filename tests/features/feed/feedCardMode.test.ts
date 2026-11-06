/**
 * Akış kartının aksiyon modu kararı.
 *
 * Test edilen şey SESSİZ YANLIŞ MOD: kullanıcı arkadaş olmak isterken flört
 * beğenisi gitmiş olursa (ya da tersi) karar geri alınamaz. Üç girdili bir
 * seçim ve yanlış dalın hiçbir görünür belirtisi yok.
 */

import {
  feedCardActions,
  authorAlreadyLiked,
  authorIsMatched,
  authorLikedMe,
  authorLikeVisible,
  resolveCardMode,
  normalizeModes,
} from "@/features/feed/feedCardMode";

/**
 * Bekleyen beğeni free kullanıcıya GÖSTERİLİR Mİ — tier kapısı.
 *
 * "Bu kişi beni beğenmiş" Plus+'ın sattığı bilgi, o yüzden varsayılan kapalı.
 * AMA Fire/NOT kuralın DIŞINDA: gönderen zaten karşı taraf kendisini görsün
 * diye ödedi ve Beğeniler ekranı o kişiyi free kullanıcıya blur'suz,
 * yanıtlanabilir gösteriyor (`isUnlockedLike`). Akış aynı kişide kabul/reddet
 * çizmezse satın alınan görünürlük bir ekranda teslim edilip öbüründe geri
 * alınmış olur — `isUnlockedLike`ın kendi doc'undaki "kuralı ÇATALLAMAYIN"
 * uyarısının tarif ettiği sızıntının aynası.
 */
describe("authorLikeVisible", () => {
  it("premium her hâlde görüyor", () => {
    expect(authorLikeVisible({}, true)).toBe(true);
    expect(authorLikeVisible(null, true)).toBe(true);
  });

  it("free kullanıcıda düz beğeni GİZLİ", () => {
    expect(authorLikeVisible({ hasLikedMe: true }, false)).toBe(false);
  });

  it("free kullanıcıda Fire GÖRÜNÜR — Beğeniler'deki kuralın aynısı", () => {
    expect(authorLikeVisible({ isSuperLike: true }, false)).toBe(true);
  });

  it("NOT da açıyor — bu uçta `note` bugün BOŞ geliyor ama kural hazır", () => {
    // Sunucu alanı doldurursa (api.ts > FEED_POST_AUTHOR_PROFILE: "yeri hazır
    // bırakıldı") ikinci bir değişiklik gerekmesin.
    expect(authorLikeVisible({ note: "selam" }, false)).toBe(true);
  });

  it("kapı yalnız GÖRÜNÜRLÜK — bekleyenliği kendi başına üretmiyor", () => {
    // `authorLikedMe` ile VE'leniyor (bkz. FeedScreen); Fire'lı ama eşleşmiş
    // bir yazarda kapı açık olsa bile kart aksiyonsuz doğuyor.
    expect(authorLikeVisible({ isSuperLike: true }, false)).toBe(true);
    expect(
      authorLikedMe({ userId: "u1", isSuperLike: true, isMatched: true }, () => false),
    ).toBe(false);
  });
});

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
 * Kartta hangi aksiyonların çizildiği — artık BEŞ hâlli karar.
 *
 * Test edilen SESSİZ GERİLEMELER:
 * -1. ZATEN BEĞENDİĞİM yazarda Fire/not ÇİZİLMESİ: beğenim sunucuda duruyor,
 *    ikinci gönderim ya UT-6404 yiyor ya bakiyeyi boşa yakıyor. `authorLikedMe`
 *    bu hâli yalnız "bekleyenlik" sorusundan DIŞLIYOR — dışlamak kartı NORMAL
 *    hâle düşürüyordu, aksiyonsuzluk ayrı bir girdi olmak zorunda.
 * 0. EŞLEŞMİŞ YAZARDA AKSİYON ÇİZİLMESİ: eşleştiğin kişiye akıştan Fire/not
 *    yollamak hiçbir kapı açmıyor, yalnız bakiyeyi yakıyor — ve geri alınamaz.
 * 1. MOD KAPISININ EZİLMESİ: `hasLikedMe` true'ya bakıp mod kontrolü atlanırsa
 *    (ya da dal sırası tersine çevrilirse) modsuz bir kartta sunucunun
 *    reddedeceği bir kabul/reddet çifti çizilir.
 * 2. like/pass'İN AYRIŞMASI: biri unutulup öbürü elden çıkarsa (ör. yalnız
 *    `like` güncellenip `pass` eski değerinde kalırsa) tam olarak bu işin
 *    düzelttiği hataya dönülür — tek başına duran bir X.
 * 3. MOD FARKININ NORMAL HÂLE SIZMASI: Arkadaş'ta normal hâlde düz beğeni geri
 *    açılırsa (ya da Flört'te kapanırsa) akış tek dokunuşla bedelsiz beğeni
 *    dağıtan yüzeye döner. Bu riskin ayrı bir Arkadaş testi gerektirmesinin
 *    sebebi somut: kural 2026-10-22'de açıldı, 2026-10-28'de bir kez kapatılıp
 *    aynı turda geri alındı — yani tam bu hat önceden salınmış, test o
 *    salınımı dondurmak için var.
 */
describe("feedCardActions", () => {
  const none = { like: false, pass: false, fire: false, note: false };

  it("NORMAL (Flört): yalnız Fire ve not — X ve tik YOK", () => {
    expect(feedCardActions("Dating", false, false, false)).toEqual({
      like: false, pass: false, fire: true, note: true,
    });
  });

  it("NORMAL (Arkadaş): Flört'le AYNI küme — fark yalnız butonun adında", () => {
    expect(feedCardActions("Friends", false, false, false)).toEqual({
      like: false, pass: false, fire: true, note: true,
    });
  });

  it("BEĞENİLMİŞ: kabul + reddet — Fire ve not YOK (iki modda da)", () => {
    const expected = { like: true, pass: true, fire: false, note: false };
    expect(feedCardActions("Dating", true, false, false)).toEqual(expected);
    expect(feedCardActions("Friends", true, false, false)).toEqual(expected);
  });

  /**
   * İSTEK: eşleştiğin birinin akış kartında Fire ve not HİÇ çizilmiyor —
   * kanal zaten açık, o butonlar yalnız bakiye yakıyor.
   */
  it("EŞLEŞMİŞ: hiçbir aksiyon — Fire ve not çizilmiyor (iki modda da)", () => {
    expect(feedCardActions("Dating", false, true, false)).toEqual(none);
    expect(feedCardActions("Friends", false, true, false)).toEqual(none);
  });

  it("EŞLEŞME beğenilmişliği EZİYOR — kabul/reddet de çizilmiyor", () => {
    // `authorLikedMe` eşleşmeyi zaten dışlıyor ama bu fonksiyonun KENDİ
    // değişmezi: bayrak başka bir koldan (ör. yerel liker kümesi) gelseydi
    // eşleşmiş yazarda olmayan bir bekleyen karar ima edilirdi.
    expect(feedCardActions("Dating", true, true, false)).toEqual(none);
    expect(feedCardActions("Friends", true, true, false)).toEqual(none);
  });

  /**
   * İSTEK (2026-11-04): yazarı ZATEN BEĞENDİYSEM kart aksiyonsuz doğuyor.
   * Beğenim sunucuda duruyor — ikinci Fire/not ya UT-6404 yiyor ya bakiye
   * yakıyor; kabul/reddet de anlamsız, bekleyen karar KARŞI TARAFTA.
   */
  it("ZATEN BEĞENDİM: hiçbir aksiyon (iki modda da)", () => {
    expect(feedCardActions("Dating", false, false, true)).toEqual(none);
    expect(feedCardActions("Friends", false, false, true)).toEqual(none);
  });

  it("ZATEN BEĞENDİM beğenilmişliği EZİYOR — kabul/reddet çizilmiyor", () => {
    // `authorLikedMe` kendi beğenimi zaten dışlıyor ama bu fonksiyonun KENDİ
    // değişmezi: iki bayrak birden true geldiyse ortada karşılıklı beğeni var
    // demektir — o eşleşme bölgesi, bana bekleyen bir karar sunulamaz.
    expect(feedCardActions("Dating", true, false, true)).toEqual(none);
    expect(feedCardActions("Friends", true, false, true)).toEqual(none);
  });

  it("mod yoksa hiçbiri — beğenilmiş olsa BİLE kart salt okunur", () => {
    // Review Focus #1: sunucu "beni beğenmiş" derken yazarın açık modu
    // olmayabilir. Beğenilmiş hâli modsuzluğu EZMEMELİ, yoksa sunucunun
    // reddedeceği bir kabul butonu çizilir.
    expect(feedCardActions(null, false, false, false)).toEqual(none);
    expect(feedCardActions(null, true, false, false)).toEqual(none);
    expect(feedCardActions(null, true, true, true)).toEqual(none);
  });

  it("like ve pass her hâlde BİRLİKTE — tek başına X'e dönüş yolu kapalı", () => {
    // Bu işin düzelttiği hata tam olarak tek başına duran bir X'ti.
    for (const mode of ["Dating", "Friends", null] as const) {
      for (const liked of [true, false]) {
        for (const matched of [true, false]) {
          for (const already of [true, false]) {
            const a = feedCardActions(mode, liked, matched, already);
            expect(a.like).toBe(a.pass);
          }
        }
      }
    }
  });

  it("fire ve note da her hâlde BİRLİKTE — ikisi bir ÇİFT", () => {
    for (const mode of ["Dating", "Friends", null] as const) {
      for (const liked of [true, false]) {
        for (const matched of [true, false]) {
          for (const already of [true, false]) {
            const a = feedCardActions(mode, liked, matched, already);
            expect(a.fire).toBe(a.note);
          }
        }
      }
    }
  });
});

/**
 * "Zaten eşleştik mi" — kartın AKSİYONSUZ doğup doğmayacağını belirleyen
 * tespit. Yanlış negatif eşleştiğin birine Fire yaktırır (geri alınamaz),
 * yanlış pozitif ise tanımadığın birine hiçbir şey yapamaz hâle getirir.
 */
describe("authorIsMatched", () => {
  it("bayrak true ise eşleşmiş", () => {
    expect(authorIsMatched({ userId: "u1", isMatched: true })).toBe(true);
  });

  it("bayrak yoksa ya da false ise eşleşmemiş — normal kart", () => {
    expect(authorIsMatched({ userId: "u1" })).toBe(false);
    expect(authorIsMatched({ userId: "u1", isMatched: false })).toBe(false);
  });

  /**
   * KATI `=== true`. Gevşetilirse ("Boolean(...)") sunucudan gelen "false"
   * string'i eşleşme sayılır ve kullanıcının elinden Fire/not sessizce alınır.
   */
  it.each(["true", "false", 1, 0, {}])(
    "bayrak boolean değilse (%p) yok sayılıyor",
    (isMatched) => {
      expect(authorIsMatched({ userId: "u1", isMatched })).toBe(false);
    },
  );

  it.each([null, undefined, "u1", 5])(
    "profil yoksa (%p) false — kart henüz yüklenmemiş",
    (profile) => {
      expect(authorIsMatched(profile)).toBe(false);
    },
  );
});

/**
 * "Ben onu ZATEN beğendim mi" — kartın aksiyonsuz doğmasını belirleyen ikinci
 * tespit (ilki eşleşme). Yanlış pozitif kullanıcının elinden Fire/not'u alır;
 * yanlış negatif zaten beğenilmiş birine ikinci gönderim denetir (UT-6404 ya
 * da boşa yanan bakiye).
 */
describe("authorAlreadyLiked", () => {
  it("myLikeDate dolu string ise beğenmişim", () => {
    expect(authorAlreadyLiked({ userId: "u1", myLikeDate: "2026-11-01T10:00:00Z" })).toBe(true);
  });

  /**
   * KATI tip kontrolü — `authorLikedMe`deki üçüncü dışlamanın aynısı. Boş
   * string, sayı, boolean "dolu tarih" sayılmaz: bilinmiyorsa normal kart
   * (güvenli taraf BURADA butonları göstermek — sunucu ikinci gönderimi
   * zaten reddediyor, ama butonsuz kart kullanıcının hakkını sessizce yer).
   */
  it.each(["", null, undefined, 0, 1, true, {}])(
    "myLikeDate %p ise beğenmemişim — normal kart",
    (myLikeDate) => {
      expect(authorAlreadyLiked({ userId: "u1", myLikeDate })).toBe(false);
    },
  );

  it.each([null, undefined, "u1", 5])(
    "profil yoksa (%p) false — kart henüz yüklenmemiş",
    (profile) => {
      expect(authorAlreadyLiked(profile)).toBe(false);
    },
  );
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

  // `typeof profile !== "object"` dalı: profil yokluğu yalnız null/undefined
  // DEĞİL, bir primitif de olabilir (ör. sorgu henüz çözülmemiş bir id string'i
  // döndürüyorsa) — ikisi de "yok" sayılmalı.
  it.each([null, undefined, "u1", 5])(
    "profil yoksa (%p) false — kart henüz yüklenmemiş",
    (profile) => {
      expect(authorLikedMe(profile, allLocal)).toBe(false);
    },
  );

  /**
   * ── BEKLEYENLİĞİ ÖLDÜREN DURUMLAR ────────────────────────────────────────
   * Soru "beni beğendi mi" DEĞİL, "bekleyen bir kararı var mı". Backend'in
   * açık uyarısı: karşılıklı beğenide `hasLikedMe` YİNE true dönüyor. Bu
   * dışlamalar olmazsa eşleştiğin birinin gönderisine girince kart
   * "kabul et / reddet" ile açılıp olmayan bir bekleyen karar ima ediyor.
   */
  it("ZATEN EŞLEŞTİYSEK false — hasLikedMe true olsa BİLE", () => {
    expect(
      authorLikedMe({ userId: "u1", hasLikedMe: true, isMatched: true }, noneLocal),
    ).toBe(false);
    // Yerel kol da aynı kapıya tabi: eşleşme kümedeki id'yi geçersiz kılıyor.
    expect(authorLikedMe({ userId: "u1", isMatched: true }, allLocal)).toBe(false);
  });

  it("BEN ONU ZATEN BEĞENDİYSEM false — kabul edilecek bir şey yok", () => {
    expect(
      authorLikedMe(
        { userId: "u1", hasLikedMe: true, myLikeDate: "2026-10-29T10:00:00Z" },
        noneLocal,
      ),
    ).toBe(false);
    expect(
      authorLikedMe({ userId: "u1", myLikeDate: "2026-10-29T10:00:00Z" }, allLocal),
    ).toBe(false);
  });

  /**
   * `myLikeDate` KATI string kontrolü: alan yoksa (`undefined`) ya da boş
   * string geldiyse "beğenmedim" demektir. Düz `!= null` yazımı boş string'i
   * "beğendim" sayıp özelliği sessizce kapatırdı.
   */
  it.each([undefined, null, ""])(
    "myLikeDate boşsa (%p) bekleyenlik DURUYOR",
    (myLikeDate) => {
      expect(
        authorLikedMe({ userId: "u1", hasLikedMe: true, myLikeDate }, noneLocal),
      ).toBe(true);
    },
  );

  /**
   * `isMatched` de KATI `=== true`: boolean olmayan bir değer (ör. sunucu
   * "false" string'i gönderirse) bekleyenliği öldürmemeli.
   */
  it.each(["true", "false", 1, 0, {}])(
    "isMatched boolean değilse (%p) yok sayılıyor",
    (isMatched) => {
      expect(
        authorLikedMe({ userId: "u1", hasLikedMe: true, isMatched }, noneLocal),
      ).toBe(true);
    },
  );
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
