/**
 * Tema tercihi motoru: varsayılan AÇIK, seçim kalıcı, "system" canlı takip.
 *
 * Modül GÖVDESİNDE iş yapıyor (paleti ilk frame'den önce basmak için), o yüzden
 * her senaryo jest.resetModules() ile taze yükleniyor — kalıcı kayıt ve cihaz
 * görünümü require'dan ÖNCE ayarlanmalı.
 */

type Scheme = "light" | "dark" | null;

const mockPrefs = new Map<string, string>();
const mockListeners: ((pref: { colorScheme: Scheme }) => void)[] = [];
const mockAppearance = {
  getColorScheme: jest.fn<Scheme, []>(() => "light"),
  setColorScheme: jest.fn(),
  addChangeListener: jest.fn((fn: (pref: { colorScheme: Scheme }) => void) => {
    mockListeners.push(fn);
    return { remove: () => {} };
  }),
};

jest.mock("react-native", () => ({ Appearance: mockAppearance }));
jest.mock("@/shared/utils/appPrefs", () => ({
  appPrefs: {
    getString: (key: string) => mockPrefs.get(key),
    set: (key: string, value: string) => {
      mockPrefs.set(key, value);
    },
  },
}));

function load(opts: { persisted?: string; system?: Scheme } = {}) {
  jest.resetModules();
  mockPrefs.clear();
  mockListeners.length = 0;
  mockAppearance.setColorScheme.mockClear();
  mockAppearance.getColorScheme.mockReturnValue(opts.system ?? "light");
  if (opts.persisted) mockPrefs.set("theme.mode", opts.persisted);

  // themeMode kendi içinde colors'ı require ediyor; sonradan require etmek
  // registry'deki AYNI örneği veriyor (palet mutasyonu görünür).
  const themeMode: typeof import("@/shared/theme/themeMode") = require("@/shared/theme/themeMode");
  const colors: typeof import("@/shared/theme/colors") = require("@/shared/theme/colors");
  return { themeMode, colors };
}

/** Cihaz görünümü değişimini native olay gibi tetikler. */
function emitSystemChange(colorScheme: Scheme) {
  mockAppearance.getColorScheme.mockReturnValue(colorScheme);
  mockListeners.forEach((fn) => fn({ colorScheme }));
}

describe("açılış tercihi", () => {
  it("hiç seçim yoksa AÇIK başlar", () => {
    const { themeMode, colors } = load({ system: "dark" });

    expect(themeMode.getThemePreference()).toBe("light");
    expect(themeMode.getThemeMode()).toBe("light");
    expect(colors.isLight()).toBe(true);
    // Native chrome da (klavye, Alert, blur tint) açığa kilitlenir.
    expect(mockAppearance.setColorScheme).toHaveBeenCalledWith("light");
  });

  it("daha önce seçilmiş 'dark' KORUNUR", () => {
    const { themeMode, colors } = load({ persisted: "dark", system: "light" });

    expect(themeMode.getThemePreference()).toBe("dark");
    expect(themeMode.getThemeMode()).toBe("dark");
    expect(colors.isLight()).toBe(false);
  });

  it("'system' kaydında cihaz görünümü uygulanır, native override KALDIRILIR", () => {
    const { themeMode, colors } = load({ persisted: "system", system: "dark" });

    expect(themeMode.getThemePreference()).toBe("system");
    expect(themeMode.getThemeMode()).toBe("dark");
    expect(colors.isLight()).toBe(false);
    expect(mockAppearance.setColorScheme).toHaveBeenCalledWith("unspecified");
  });
});

describe("tercih değişimi", () => {
  it("kalıcı yazılır ve aboneler uyarılır", () => {
    const { themeMode } = load();
    const seen: string[] = [];
    themeMode.subscribeTheme(() => seen.push(themeMode.getThemeMode()));

    themeMode.setThemePreference("dark");

    expect(mockPrefs.get("theme.mode")).toBe("dark");
    expect(themeMode.getThemeMode()).toBe("dark");
    expect(seen).toEqual(["dark"]);
  });

  it("çözülen mod değişmiyorsa ağaç remount edilmez", () => {
    // Koyu → Sistem, cihaz zaten koyu: palet aynı kalıyor, navigasyon
    // snapshot'ı (onBeforeThemeSwap) boşuna alınmamalı.
    const { themeMode } = load({ persisted: "dark", system: "dark" });
    const beforeSwap = jest.fn();
    themeMode.onBeforeThemeSwap(beforeSwap);

    themeMode.setThemePreference("system");
    expect(beforeSwap).not.toHaveBeenCalled();
    expect(themeMode.getThemeMode()).toBe("dark");

    themeMode.setThemePreference("light");
    expect(beforeSwap).toHaveBeenCalledTimes(1);
  });
});

describe("sistem takibi", () => {
  it("'system' iken cihaz görünümü anında uygulanır", () => {
    const { themeMode, colors } = load({ persisted: "system", system: "dark" });
    const seen: string[] = [];
    themeMode.subscribeTheme(() => seen.push(themeMode.getThemeMode()));

    emitSystemChange("light");

    expect(themeMode.getThemeMode()).toBe("light");
    expect(colors.isLight()).toBe(true);
    expect(seen).toEqual(["light"]);
  });

  it("Açık/Koyu tercihinde cihaz olayı YOK SAYILIR", () => {
    // Override aktifken gelen olay sistemi değil bizim bastığımız değeri
    // yansıtıyor (RCTAppearance trait collection'dan okuyor) — takip edilirse
    // kullanıcının seçimi kendi kendine bozulur.
    const { themeMode } = load({ persisted: "dark", system: "dark" });

    emitSystemChange("light");

    expect(themeMode.getThemeMode()).toBe("dark");
    expect(themeMode.getThemePreference()).toBe("dark");
  });
});
