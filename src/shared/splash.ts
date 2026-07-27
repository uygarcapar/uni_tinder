import * as SplashScreen from "expo-splash-screen";

// Native splash'i biz gizleyene kadar açık tut. Bu modül App.tsx'in EN başında
// import edilir → native splash'in ilk-frame'de otomatik gizlenmesinden önce
// preventAutoHide devreye girer.
//
// Amaç: authed kullanıcıda splash, DiscoverScreen mount olup ilk etkileşim
// bitene kadar durur → cold-boot'un en kırılgan penceresinde (ağır mount +
// başlangıç fetch'leri) uygulama ETKİLEŞİME KAPALI kalır, "açılır açılmaz hızlı
// gezinme" crash-tetikleyicisi ortadan kalkar. Unauthed akışta splash beklemez
// (orada ağır mount/crash yok) — AppNavigator hemen hideSplash() çağırır.
SplashScreen.preventAutoHideAsync()
  .then((ok) => {
    if (__DEV__) console.log(`[splash] preventAutoHide → ${ok}`);
  })
  .catch((e) => {
    if (__DEV__) console.log(`[splash] preventAutoHide FAIL: ${e?.message ?? e}`);
  });

let hidden = false;

// İdempotent — birden fazla yerden (Discover mount, unauthed branch, safety
// timeout) çağrılabilir; ilk çağrı gizler, gerisi no-op.
export function hideSplash(source = "?") {
  if (hidden) return;
  hidden = true;
  if (__DEV__) console.log(`[splash] hideSplash ← ${source}`);
  SplashScreen.hideAsync().catch(() => {});
}
