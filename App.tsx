// @ts-nocheck
import "./src/shared/debug/wdyr";
import "./global.css";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { store, persistor } from "./src/shared/store";
import { queryClient } from "./src/shared/queries/queryClient";
import AppNavigator from "./src/navigation/AppNavigator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { NotifierWrapper } from "react-native-notifier";
import { useFonts } from "expo-font";

// Modul-level — Fast Refresh ile module re-execute olduğunda yeni değer alır.
// Production'da modul yalnız bir kez evaluate edildiği için sabit kalır.
// BottomSheetModalProvider'a `key` olarak verildiğinde reload sonrası provider'ı
// fresh remount eder; reanimated UI thread + gorhom queue + portal state
// reload'dan kalan corrupt referansları temizlenir.
const __MODAL_PROVIDER_SESSION = `${Date.now()}-${Math.random()}`;

export default function App() {
  const [fontsLoaded] = useFonts({
    "Duckie-regular": require("./assets/fonts/Duckie-regular.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#121212" }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <BottomSheetModalProvider key={__MODAL_PROVIDER_SESSION}>
                <NotifierWrapper>
                  <AppNavigator />
                  <StatusBar style="light" />
                </NotifierWrapper>
              </BottomSheetModalProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </PersistGate>
      </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
