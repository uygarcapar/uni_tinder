/**
 * Kilidin TEK kuralı — artık iki ekran birden kullanıyor.
 *
 * Kural eskiden `LikeCard.tsx`in içinde yaşıyordu ve yalnız Beğeniler onu
 * okuyabiliyordu (ağır bir bileşen modülü; saf bir akış modülü ona bağlanamaz).
 * Akış yazar kartı bu yüzden düz `isPremium &&` ile kapalıydı: sana Fire atan
 * biri Beğeniler'de blur'suz ve yanıtlanabilir dururken, AYNI kişinin akış
 * gönderisinde kabul/reddet çizilmiyordu — fonksiyonun kendi doc'undaki
 * "kuralı ÇATALLAMAYIN" uyarısının tam olarak tarif ettiği sızıntının aynası.
 *
 * Bu test kuralın tek kaldığını donduruyor.
 */

import { isUnlockedLike } from "@/features/discover/likeUnlock";

describe("isUnlockedLike", () => {
  it("Fire kilidi açıyor", () => {
    expect(isUnlockedLike({ isSuperLike: true })).toBe(true);
  });

  it("NOT kilidi açıyor — iki alan da (liste `note`, kart `isNote`)", () => {
    expect(isUnlockedLike({ note: "selam" })).toBe(true);
    expect(isUnlockedLike({ isNote: true })).toBe(true);
  });

  it("düz beğeni KİLİTLİ", () => {
    expect(isUnlockedLike({ isSuperLike: false })).toBe(false);
    expect(isUnlockedLike({})).toBe(false);
  });

  it("`hasLikedMe` kilit kararına GİRMİYOR", () => {
    // 2026-09-03'te kaldırıldı: beslendiği listeler tanımı gereği "seni
    // beğenenler", bayrak her kart için true geliyor ve kural totolojiye
    // düşüyordu (free kullanıcı listenin tamamını blur'suz görüyordu).
    expect(isUnlockedLike({ hasLikedMe: true })).toBe(false);
  });

  it("boş not kilidi AÇMIYOR — `!!` ile düşüyor", () => {
    expect(isUnlockedLike({ note: "" })).toBe(false);
  });

  it("veri yoksa kilitli", () => {
    expect(isUnlockedLike(null)).toBe(false);
    expect(isUnlockedLike(undefined)).toBe(false);
  });
});
