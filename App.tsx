// @ts-nocheck
import "./src/shared/debug/wdyr";
import "./global.css";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Provider, useSelector } from "react-redux";
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
import { I18nextProvider } from "react-i18next";
import i18n from "./src/shared/i18n";
import { setCurrentLanguage } from "./src/shared/services/api";

// Modul-level — Fast Refresh ile module re-execute olduğunda yeni değer alır.
// Production'da modul yalnız bir kez evaluate edildiği için sabit kalır.
// BottomSheetModalProvider'a `key` olarak verildiğinde reload sonrası provider'ı
// fresh remount eder; reanimated UI thread + gorhom queue + portal state
// reload'dan kalan corrupt referansları temizlenir.
const __MODAL_PROVIDER_SESSION = `${Date.now()}-${Math.random()}`;

function LanguageSyncer() {
  const language = useSelector((s: any) => s.settings?.language);
  useEffect(() => {
    if (!language) return;
    if (i18n.language !== language) i18n.changeLanguage(language);
    setCurrentLanguage(language);
  }, [language]);
  return null;
}

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
          <I18nextProvider i18n={i18n}>
            <LanguageSyncer />
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
          </I18nextProvider>
        </PersistGate>
      </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
