import "./src/shared/debug/crashLogger";
import "./src/shared/debug/wdyr";
// Sentry mümkün olduğunca erken init edilmeli ki boot hataları da yakalansın.
// EXPO_PUBLIC_SENTRY_DSN set değilse tamamen no-op.
import { initSentry, Sentry } from "./src/shared/services/sentry";
initSentry();
// EN ERKEN: native splash'i tut (auto-hide'dan önce). hideSplash authed'de
// Discover mount'unda, unauthed'de AppNavigator'da çağrılır.
import { hideSplash } from "./src/shared/splash";
import { mark } from "./src/shared/debug/startupTiming";
mark("js-boot");

// Güvenlik ağı: hiçbir koşulda splash'te takılı kalma (Discover mount edemezse,
// hata olursa vb.) — 4.5sn sonra zorla gizle.
setTimeout(() => hideSplash("safety-4500"), 4500);
import "./global.css";
import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import EmptyState from "./src/shared/components/EmptyState";
import { colors } from "./src/shared/theme/colors";
import RenderHudOverlay from "./src/shared/debug/RenderHudOverlay";
import { PERF_HUD } from "./src/shared/debug/flags";
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
import { I18nextProvider } from "react-i18next";
import i18n from "./src/shared/i18n";
import { setCurrentLanguage } from "./src/shared/services/api";
import { bustStaticCache } from "./src/shared/services/staticCache";

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
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
      // Statik referans listeleri (şehir/hobi/burç adları) Accept-Language'a göre
      // lokalize geliyor → dil değişince oturum cache'ini boşalt, yeni dilde çekilsin.
      bustStaticCache();
    }
    setCurrentLanguage(language);
  }, [language]);
  return null;
}

// JS render hatası beyaz ekran yerine bu fallback'e düşer (hata Sentry'ye
// raporlanır — DSN yoksa yalnız fallback görünür). resetError boundary'yi
// temizleyip ağacı yeniden dener.
function CrashFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", paddingBottom: 48 }}>
      <EmptyState
        Icon={TriangleAlert}
        iconStrokeWidth={1}
        topOffset={0}
        text={i18n.t("common.crashTitle")}
      />
      <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 28, paddingHorizontal: 32 }}>
        {i18n.t("common.crashMessage")}
      </Text>
      <Pressable
        onPress={resetError}
        style={{ backgroundColor: colors.primary, borderRadius: 24, paddingHorizontal: 32, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
          {i18n.t("common.crashRetry")}
        </Text>
      </Pressable>
    </View>
  );
}

function App() {
  // Duckie-regular RUNTIME'DA YÜKLENMEZ: expo-font config plugin'i (app.json)
  // fontu build sırasında binary'e gömüyor, yani ilk frame'de hazır. Önceki
  // `useFonts` + `if (!fontsLoaded) return null` yolu splash kalktıktan sonra
  // TÜM ağacı bir tick bloke ediyordu — cold start zincirinin (bkz. bootPhase)
  // en başında bedava kaybedilen zamandı.
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
                    <Sentry.ErrorBoundary fallback={({ resetError }) => <CrashFallback resetError={resetError} />}>
                      <AppNavigator />
                    </Sentry.ErrorBoundary>
                    <StatusBar style="light" />
                    {PERF_HUD && <RenderHudOverlay />}
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

export default Sentry.wrap(App);
