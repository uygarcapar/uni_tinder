import { registerRootComponent } from "expo";
import {
  getMessaging,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";

import App from "./App";

// Kampüs geofence görevi — TaskManager.defineTask modül YAN ETKİSİ ve BURADAN
// import edilmek zorunda. App.tsx yetmez: işletim sistemi bölge olayında
// uygulamayı headless başlatıyor, React ağacı hiç mount edilmiyor ve o dosya
// çalışmıyor; tanımsız bir görev de startGeofencingAsync'i patlatıyor.
import "./src/features/campus/campusGeofenceTask";

// FCM background/quit handler — component ağacının dışında, module top-level'de kayıtlı
// olmak zorunda. Headless context; UI navigasyonu buradan yapılmaz. Tap sonrası routing
// AppNavigator'daki subscribeBackgroundOpen ve getInitialNotificationData tarafından
// handle edilir.
setBackgroundMessageHandler(getMessaging(), async () => {
  // sessiz — OS bildirimi zaten notification bloğuyla otomatik gösterilir
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
