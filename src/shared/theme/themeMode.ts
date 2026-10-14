import { useSyncExternalStore } from "react";
import { Appearance, Platform, Settings } from "react-native";
import { appPrefs } from "@/shared/utils/appPrefs";
import { applyPalette, type ThemeMode } from "./colors";

/**
 * Tema tercihi — Sistem/Açık/Koyu. Kullanıcı ne seçtiyse KALICIDIR; "system"
 * seçiliyken cihaz görünümü canlı takip edilir (uygulama açıkken iOS koyuya
 * geçerse ağaç anında koyuya döner).
 *
 * Tercih (`ThemePreference`) ile çözülen mod (`ThemeMode`) AYRI: palet, status
 * bar ve remount anahtarı hep ÇÖZÜLEN modu kullanır, Ayarlar'daki seçili chip
 * ise tercihi. "system" iken ikisi ayrışır.
 *
 * ── Neden Redux değil ──────────────────────────────────────────────────────
 * Değer İLK FRAME'DEN ÖNCE lazım. PersistGate rehydrate'i bir tick sonra
 * geliyor; redux'a bağlansaydı açık modda her soğuk açılışta koyu bir kare
 * flash ederdi. MMKV senkron okunuyor, aşağıdaki modül gövdesi ilk render'dan
 * önce çalışıyor ve flash penceresi hiç oluşmuyor.
 *
 * appPrefs instance'ı bilinçli: logout'ta silinmiyor (bkz. appPrefs.ts), yani
 * çıkış yapan kullanıcı temasını kaybetmiyor. settingsSlice'a eklemek ayrıca
 * iki sorun doğururdu — persist'te whitelist olmadığı için mevcut kullanıcılar
 * rehydrate'te initialState'i kaybedip `undefined` alırdı, ve SettingsModal
 * testleri slice'ı mock'ladığı için yeni export'ta kırılırlardı.
 */

export type ThemePreference = "system" | ThemeMode;

const KEY = "theme.mode";

function readPersisted(): ThemePreference {
  // Varsayılan AÇIK: hiç seçim yapmamış (ve yeni kuran) kullanıcı light açılır.
  // Anahtar eskisiyle aynı, eski "light"/"dark" değerleri olduğu gibi okunuyor —
  // yani daha önce Koyu seçmiş kullanıcı seçimini korur, yalnız hiç seçmemiş
  // olanlar koyudan açığa geçer.
  const raw = appPrefs.getString(KEY);
  if (raw === "dark") return "dark";
  if (raw === "system") return "system";
  return "light";
}

// DİKKAT: buradaki varsayılan (AÇIK) native tarafta da elle tekrarlanıyor —
// plugins/withSplashAppearance.js, NSUserDefaults anahtarı henüz yazılmamışken
// .light basıyor. Varsayılanı burada değiştiren orayı da değiştirmek zorunda,
// yoksa taze kurulumun ilk açılışı yine ters temada splash gösterir.

/**
 * Cihazın GERÇEK görünümü.
 *
 * İLK okuma override basılmadan ÖNCE yapılmak zorunda: iOS'ta
 * `Appearance.setColorScheme("light"|"dark")` pencerelere
 * `overrideUserInterfaceStyle` yazıyor ve ondan sonra `getColorScheme()` sistemi
 * DEĞİL bizim bastığımız override'ı döndürüyor (RCTAppearance.mm →
 * RCTColorSchemePreference trait collection'dan okuyor). Bu yüzden aşağıdaki
 * satır applyEverywhere()'den önce duruyor.
 *
 * AMA ARTIK BU OKUMA BAYAT DOĞABİLİR: splash'in temasını düzeltmek için
 * AppDelegate aynı override'ı JS hiç çalışmadan basıyor (bkz.
 * mirrorToNativeDefaults + plugins/withSplashAppearance.js), yani Açık/Koyu
 * tercihinde buradaki değer sistemi değil tercihi yansıtır. ZARARSIZ, çünkü
 * `systemScheme` yalnız preference === "system" iken tüketiliyor ve o
 * tercihte AppDelegate `.unspecified` basıyor (override yok → okuma gerçek).
 * Açık/Koyu'dan Sistem'e geçişte değer zaten setThemePreference içinde
 * override kaldırılıp taze okunuyor.
 */
let systemScheme: ThemeMode =
  Appearance.getColorScheme() === "dark" ? "dark" : "light";

let preference: ThemePreference = readPersisted();
let mode: ThemeMode = preference === "system" ? systemScheme : preference;

const listeners = new Set<() => void>();

/**
 * Native chrome'u da (klavye görünümü, Alert, action sheet, BlurView'ın
 * "default" tint'i) seçilen moda zorlar. Bu, 30+ TextInput'a elle
 * keyboardAppearance eklemeye gerek bırakmıyor.
 *
 * "system" tercihinde "unspecified" basılıyor: bu override'ı KALDIRIR, pencere
 * görünümü sistemden miras alır ve `Appearance` olayları yeniden gerçek sistem
 * değerini taşımaya başlar.
 *
 * ÖNKOŞUL: app.json userInterfaceStyle "automatic" VE ios/Lit/Info.plist'te
 * UIUserInterfaceStyle=Dark girdisi kaldırılmış olmalı. Aksi halde native
 * taraf koyuda kilitli kalır ve bu çağrı sessizce etkisiz olur.
 */
function applyEverywhere(): void {
  applyPalette(mode);
  Appearance.setColorScheme(preference === "system" ? "unspecified" : mode);
  mirrorToNativeDefaults();
}

/**
 * NSUserDefaults AYNASI — native açılış ekranının teması için.
 *
 * Splash storyboard'ı açık/koyu varyantlarını asset catalog'un `luminosity`
 * trait'inden çözüyor, trait ise pencerenin görünümü. JS boot'tan önce orada
 * hiçbir override yok, yani çözüm SİSTEM görünümüne göre yapılıyordu: cihazı
 * koyu olup "Açık" seçmiş kullanıcı splash'i koyu görüp sonra açığa atlıyordu
 * ("Sistem"/"Koyu" tercihlerinde zıplama yoktu — zaten aynı tema).
 *
 * AppDelegate bu anahtarı RN başlamadan okuyup pencereye
 * `overrideUserInterfaceStyle` basıyor (bkz. plugins/withSplashAppearance.js) →
 * storyboard'ın RN kökündeki kopyası ilk frame'inden itibaren doğru temada.
 *
 * MOD DEĞİL TERCİH yazılıyor: "system" native tarafta `.unspecified`'a, yani
 * override'ın kaldırılmasına karşılık geliyor — koyu cihazda sistemi takip eden
 * kullanıcıya koyu splash doğru cevap.
 *
 * `Settings` iOS-only (Android'de yalnız console.warn eden fallback) ve
 * RCTSettingsManager üzerinden standardUserDefaults'a senkron yazıyor. Yazma
 * modül gövdesinden de geliyor: mevcut kullanıcıların tercihi şimdiye kadar
 * sadece MMKV'de duruyordu, ilk açılışta buraya bir kez geri dolduruluyor.
 */
const NATIVE_DEFAULTS_KEY = "litThemeMode";

function mirrorToNativeDefaults(): void {
  if (Platform.OS !== "ios") return;
  try {
    if (Settings.get(NATIVE_DEFAULTS_KEY) === preference) return;
    Settings.set({ [NATIVE_DEFAULTS_KEY]: preference });
  } catch {
    // Ayna yazılamazsa tek bedel splash flash'inin geri gelmesi — boot'u
    // düşürmeye değmez.
  }
}

// Modül gövdesi = ilk render'dan önce. İçe aktarma sırası önemli: App.tsx bunu
// ağacın herhangi bir parçası render olmadan önce import ediyor.
applyEverywhere();

const beforeSwap = new Set<() => void>();

/**
 * Tema değişiminden HEMEN ÖNCE, ağaç remount edilmeden çalışır. AppNavigator
 * burada navigasyon yığınını snapshot'lıyor — aksi halde tema değiştiren
 * kullanıcı Ayarlar'dan Discover'a düşerdi.
 */
export function onBeforeThemeSwap(fn: () => void): () => void {
  beforeSwap.add(fn);
  return () => {
    beforeSwap.delete(fn);
  };
}

/** Çözülmüş mod — palet, status bar ve remount anahtarı bunu kullanır. */
export const getThemeMode = (): ThemeMode => mode;

/** Kullanıcının seçtiği tercih — Ayarlar'daki seçili chip bunu gösterir. */
export const getThemePreference = (): ThemePreference => preference;

/**
 * Çözülen mod değişimini uygular. `beforeSwap` yalnız BURADA tetikleniyor:
 * ağaç sadece mod değiştiğinde remount oluyor, tercih değişip mod aynı kaldığında
 * (Koyu → Sistem, sistem zaten koyuyken) navigasyon snapshot'ı boşuna alınmasın.
 */
function commit(nextMode: ThemeMode): void {
  if (nextMode !== mode) {
    beforeSwap.forEach((fn) => fn());
    mode = nextMode;
  }
  applyEverywhere();
  listeners.forEach((fn) => fn());
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  appPrefs.set(KEY, next);
  if (next === "system") {
    // `systemScheme` BAYAT olabilir: Açık/Koyu tercihindeyken gelen appearance
    // olayları yok sayılıyor (aşağıdaki dinleyici), yani uygulama açıkken cihaz
    // görünümü değişmişse önbellekteki değer açılıştaki değer olarak kalır.
    // Sistem'e geçerken cihazdan TAZE okumak zorundayız.
    //
    // Sıra kritik: override basılıyken getColorScheme() sistemi değil bizim
    // bastığımız değeri döndürüyor. Önce "unspecified" ile override'ı kaldır —
    // RN'in setColorScheme'i tam da bu durumda native getColorScheme()'i yeniden
    // okuyup JS önbelleğini tazeliyor — sonra oku.
    Appearance.setColorScheme("unspecified");
    systemScheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
  }
  commit(next === "system" ? systemScheme : next);
}

/**
 * Cihaz görünümü değişimi. Override aktifken (Açık/Koyu tercihi) gelen olay
 * sistemi değil BİZİM bastığımız değeri yansıtıyor — bu yüzden yalnız "system"
 * tercihinde dinleniyor, `systemScheme` de yalnız orada tazeleniyor.
 *
 * Sonucu: Koyu'dayken cihaz görünümü değişirse önbellek bayatlar. Bunu
 * setThemePreference("system") kendi içinde override'ı kaldırıp yeniden okuyarak
 * düzeltiyor — native tarafın override kalkınca fazladan bir appearanceChanged
 * yollamasına GÜVENİLMİYOR (RN'in setColorScheme'i JS'te 'change' emit etmiyor,
 * yalnız kendi önbelleğini tazeliyor).
 */
Appearance.addChangeListener(({ colorScheme }) => {
  if (preference !== "system") return;
  systemScheme = colorScheme === "dark" ? "dark" : "light";
  commit(systemScheme);
});

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tema değişince yeniden render olmak isteyen bileşenler için. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
}

/** Ayarlar'daki seçici için: "system" iken çözülen modu DEĞİL tercihi verir. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribeTheme,
    getThemePreference,
    getThemePreference,
  );
}
