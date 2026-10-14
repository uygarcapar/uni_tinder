/**
 * Mod teması + mod kalıcılığı.
 *
 * Test edilen asıl şey İKİ TUZAK:
 *  1. Getter'lar paleti ÇAĞRI ANINDA okumak zorunda. Modül seviyesinde
 *     çözülmüş bir renk tema değişiminde donar (palet mutable, bkz. colors.ts)
 *     — bu dosyanın tarihçesi o hatayla dolu.
 *  2. Diskten/payload'dan gelen bilinmeyen değer sorgu parametresine
 *     SIZMAMALI: sunucu tanımadığı `mode`a 400 döner.
 */

import { appPrefs } from "@/shared/utils/appPrefs";
import { applyPalette, colors, gradients } from "@/shared/theme/colors";
import {
  APP_MODES,
  DEFAULT_APP_MODE,
  FLAME_OUTLINE_DATING,
  FLAME_OUTLINE_FRIENDS,
  isAppMode,
  modeAccent,
  modeFireGradient,
  modeFireNameKey,
  modeFireTint,
  modeFlameOutline,
  modeHeartBorder,
  modeTitleKey,
  type AppMode,
} from "@/features/discover/modeTheme";
import { loadAppMode, saveAppMode } from "@/features/discover/modePrefs";

const USER = "user-1";

afterEach(() => {
  appPrefs.clearAll?.();
  applyPalette("dark");
});

describe("modeTheme — mod farkındalı getter'lar", () => {
  it("iki modu tanır, varsayılan Dating", () => {
    expect(APP_MODES).toEqual(["Dating", "Friends"]);
    expect(DEFAULT_APP_MODE).toBe("Dating");
  });

  it("vurgu rengi moda göre ayrışıyor", () => {
    expect(modeAccent("Dating")).toBe(colors.litPlus);
    expect(modeAccent("Friends")).toBe(colors.friendsAccent);
    expect(modeAccent("Dating")).not.toBe(modeAccent("Friends"));
  });

  it("Friends vurgusu success yeşiliyle AYNI DEĞİL", () => {
    // Mod kimliği durum semantiğine bağlanmamalı: ikisi bağımsız
    // ayarlanabilir kalmak zorunda (gerekçe colors.ts > friendsAccent).
    expect(colors.friendsAccent).not.toBe(colors.success);
  });

  it("fire gradyanı ve tint'i aynı ateşten okunuyor", () => {
    expect(modeFireGradient("Dating")).toBe(gradients.swipeHeart);
    expect(modeFireGradient("Friends")).toBe(gradients.friendsHeart);
    // Buton tint'i = gradyanın ilk durağı (buton/dalga/perde tek ton).
    expect(modeFireTint("Friends")).toBe(gradients.friendsHeart[0]);
    expect(modeFireTint("Dating")).toBe(gradients.swipeHeart[0]);
  });

  it("kalp kenarlığı ve alev konturu moda göre", () => {
    expect(modeHeartBorder("Dating")).toBe(colors.swipeHeartBorder);
    expect(modeHeartBorder("Friends")).toBe(colors.friendsHeartBorder);
    expect(modeFlameOutline("Dating")).toBe(FLAME_OUTLINE_DATING);
    expect(modeFlameOutline("Friends")).toBe(FLAME_OUTLINE_FRIENDS);
  });

  it("i18n anahtarları enum değerine göre kuruluyor", () => {
    expect(modeFireNameKey("Friends")).toBe("discover.mode.fireName.Friends");
    expect(modeTitleKey("Dating")).toBe("discover.mode.title.Dating");
  });

  /**
   * ⚠️ EN KRİTİK TEST. Palet `applyPalette` ile YERİNDE değişiyor; getter
   * modül seviyesinde bir değer yakalarsa açık modda koyu değeri döndürür.
   * Mod-bağımsız (`friendsAccent` iki modda aynı) bir token seçilemez — o
   * yüzden modla DÖNEN bir token üzerinden ölçülüyor.
   */
  it("paleti çağrı anında okuyor (tema değişiminde donmuyor)", () => {
    applyPalette("dark");
    const darkText = colors.text;
    applyPalette("light");
    expect(colors.text).not.toBe(darkText);
    // Getter yeni paletten okuyor: aynı referansı değil, güncel değeri verir.
    expect(modeAccent("Friends")).toBe(colors.friendsAccent);
    expect(modeAccent("Dating")).toBe(colors.litPlus);
  });

  describe("isAppMode — bilinmeyen değer kapısı", () => {
    it.each([
      ["Dating", true],
      ["Friends", true],
      ["dating", false],
      ["StudyPartner", false],
      ["", false],
      [null, false],
      [undefined, false],
      [2, false],
      [{}, false],
    ])("%p → %p", (value, expected) => {
      expect(isAppMode(value)).toBe(expected);
    });
  });
});

/**
 * Tema iplikleme sözleşmesi: Fire ailesinin TÜM yüzeyleri aynı moddan okumak
 * zorunda. Biri atlanırsa Arkadaş modunda yeşil bir buton kırmızı bir alev
 * açar — kullanıcıya iki ayrı ürün gibi görünür.
 */
describe("Fire/Spark yüzeyleri tek moddan okuyor", () => {
  it("buton tint'i, dalga dolgusu ve kontur aynı modu izliyor", () => {
    const friendsTint = modeFireTint("Friends");
    const friendsGradient = modeFireGradient("Friends");
    const datingTint = modeFireTint("Dating");

    // Buton = gradyanın ilk durağı (tek ateş kuralı).
    expect(friendsTint).toBe(friendsGradient[0]);
    expect(friendsTint).not.toBe(datingTint);
    // Kontur da ayrışıyor — dolgu değişip kontur sabit kalsa kenar yabancı durur.
    expect(modeFlameOutline("Friends")).not.toBe(modeFlameOutline("Dating"));
    expect(modeHeartBorder("Friends")).not.toBe(modeHeartBorder("Dating"));
  });

  it("gradyanlar aynı 3-durak şeklinde", () => {
    // Shader ve LinearGradient durak sayısına göre interpolasyon yapıyor;
    // şekil ayrışırsa Arkadaş alevi farklı bir ritimde geçiş yapar.
    expect(modeFireGradient("Dating")).toHaveLength(3);
    expect(modeFireGradient("Friends")).toHaveLength(3);
  });

  it("Spark adı i18n anahtarından geliyor, sabit yazılmıyor", () => {
    expect(modeFireNameKey("Friends")).toBe("discover.mode.fireName.Friends");
    expect(modeFireNameKey("Dating")).toBe("discover.mode.fireName.Dating");
  });
});

describe("modePrefs — kalıcılık", () => {
  it("yazılmamışken varsayılana düşer", () => {
    expect(loadAppMode(USER)).toBe("Dating");
  });

  it("userId yoksa ne okur ne yazar", () => {
    saveAppMode(null, "Friends");
    expect(loadAppMode(null)).toBe("Dating");
    expect(loadAppMode(undefined)).toBe("Dating");
  });

  it("gidiş-dönüş", () => {
    saveAppMode(USER, "Friends");
    expect(loadAppMode(USER)).toBe("Friends");
    saveAppMode(USER, "Dating");
    expect(loadAppMode(USER)).toBe("Dating");
  });

  it("kullanıcı başına ayrı", () => {
    saveAppMode(USER, "Friends");
    saveAppMode("user-2", "Dating");
    expect(loadAppMode(USER)).toBe("Friends");
    expect(loadAppMode("user-2")).toBe("Dating");
  });

  it("bozuk JSON varsayılana düşer", () => {
    appPrefs.set(`appMode:${USER}`, "{not json");
    expect(loadAppMode(USER)).toBe("Dating");
  });

  it("eski şema sürümü varsayılana düşer", () => {
    appPrefs.set(`appMode:${USER}`, JSON.stringify({ v: 0, mode: "Friends" }));
    expect(loadAppMode(USER)).toBe("Dating");
  });

  it("kurcalanmış mod değeri varsayılana düşer", () => {
    // Eski üç-modlu taslaktan kalma bir değer diskte bulunabilir.
    appPrefs.set(
      `appMode:${USER}`,
      JSON.stringify({ v: 1, mode: "StudyPartner" as AppMode }),
    );
    expect(loadAppMode(USER)).toBe("Dating");
  });
});
