/**
 * Editörün MODU — segment kalktı (2026-11-06), form aktif uygulama modunu
 * düzenliyor. Ama "aktif mod her zaman açık" varsayımı güvenli değil:
 * `useAppMode` Keşif'e hiç uğramadan (reconcile koşmadan) kapalı bir modu
 * döndürebilir (modePrefs'in kendi notu — yalnız Friends açarak kayıt olan
 * kullanıcı doğrudan Profil'e girerse varsayılan Dating gelir). Editör o
 * hâlde sessizce AÇIK moda düşer — kullanıcı asla var olmayan profili
 * düzenlemez.
 */

import { resolveEditMode } from "@/features/profile/editMode";

describe("resolveEditMode", () => {
  it("aktif mod açıksa o", () => {
    expect(resolveEditMode("Dating", true, true)).toBe("Dating");
    expect(resolveEditMode("Friends", true, true)).toBe("Friends");
  });

  it("aktif mod kapalıysa AÇIK olana düşer", () => {
    expect(resolveEditMode("Dating", false, true)).toBe("Friends");
    expect(resolveEditMode("Friends", true, false)).toBe("Dating");
  });

  it("ikisi de kapalı görünüyorsa (bilinmiyor sayılır) aktif mod", () => {
    // `modes` alanı hiç gelmediyse çağıran ikisini de açık sayıyor zaten;
    // ikisi birden kapalı ancak bozuk/yarım veridir — olmayan bir kısıt
    // uydurup kullanıcıyı kilitlemek yanlış taraf.
    expect(resolveEditMode("Friends", false, false)).toBe("Friends");
  });
});
