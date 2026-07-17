import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";

import App from "./App";

// FCM background/quit handler — component ağacının dışında, module top-level'de kayıtlı
// olmak zorunda. Headless context; UI navigasyonu buradan yapılmaz. Tap sonrası routing
// AppNavigator'daki subscribeBackgroundOpen ve getInitialNotificationData tarafından
// handle edilir.
messaging().setBackgroundMessageHandler(async () => {
  // sessiz — OS bildirimi zaten notification bloğuyla otomatik gösterilir
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
