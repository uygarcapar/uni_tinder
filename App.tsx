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
// TEMA: paleti ve native görünüm stilini İLK RENDER'DAN ÖNCE bastırır. Modül
// gövdesi MMKV'yi senkron okuyor — bu satır aşağı kayarsa açık modda soğuk
// açılışta bir kare koyu flash eder.
import { useThemeMode } from "./src/shared/theme/themeMode";
import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import EmptyState from "./src/shared/components/EmptyState";
import { colors } from "./src/shared/theme/colors";
import RenderHudOverlay from "./src/shared/debug/RenderHudOverlay";
import PinchZoomOverlay from "./src/shared/components/PinchZoomOverlay";
import CropperOverlay from "./src/shared/components/cropper/CropperOverlay";
import { PERF_HUD } from "./src/shared/debug/flags";
import { StatusBar } from "expo-status-bar";
import { Provider, useSelector, useDispatch } from "react-redux";
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
import { setLanguage } from "./src/shared/store/settingsSlice";
import { bustStaticCache } from "./src/shared/services/staticCache";
import { swipeKeys } from "./src/features/discover/swipeKeys";

// Modul-level — Fast Refresh ile module re-execute olduğunda yeni değer alır.
// Production'da modul yalnız bir kez evaluate edildiği için sabit kalır.
// BottomSheetModalProvider'a `key` olarak verildiğinde reload sonrası provider'ı
// fresh remount eder; reanimated UI thread + gorhom queue + portal state
// reload'dan kalan corrupt referansları temizlenir.
const __MODAL_PROVIDER_SESSION = `${Date.now()}-${Math.random()}`;

function LanguageSyncer() {
  const dispatch = useDispatch();
  const language = useSelector((s: any) => s.settings?.language);
  const languagePreference = useSelector(
    (s: any) => s.settings?.languagePreference,
  );

  // Persist edilen `language` ÇÖZÜLMÜŞ değer; "system" tercihinde cihaz dili
  // değişmişse (iOS dil değişiminde uygulamayı yeniden başlatıyor) diskteki
  // çözüm bayat kalır. Rehydrate'ten sonra bir kez yeniden çözüyoruz.
  useEffect(() => {
    if (languagePreference === "system") dispatch(setLanguage("system"));
  }, [languagePreference, dispatch]);

  useEffect(() => {
    if (!language) return;
    const changed = i18n.language !== language;
    if (changed) i18n.changeLanguage(language);
    // Header ÖNCE güncellenmeli: aşağıdaki invalidate'in tetiklediği refetch'ler
    // yeni dille çıksın.
    setCurrentLanguage(language);
    if (!changed) return;
    // Statik referans listeleri (şehir/hobi/burç adları) Accept-Language'a göre
    // lokalize geliyor → dil değişince oturum cache'ini boşalt, yeni dilde çekilsin.
    bustStaticCache();
    // Sunucudan lokalize gelen her şeyi tazele. Kartın metinlerinin BÜYÜK KISMI
    // (`*Display`, `hobbies[].name`, `promptDisplay`) çekildiği andaki dile göre
    // sunucuda çözülmüş sabit string; `t()` metinleri anında dönerken bunlar
    // cache'te eski dilde kalıyor ve kart yarı Türkçe yarı İngilizce görünüyor.
    // Deste anahtarında dil yok + `refetchOnMount:false` olduğu için kendiliğinden
    // düzelmiyordu — busting'i dil değişiminin KENDİSİNE bağlıyoruz, Ayarlar'daki
    // profil-güncelle/token-yenile zincirinin başarısına değil.
    queryClient.invalidateQueries({ queryKey: ["common"] });
    queryClient.invalidateQueries({ queryKey: swipeKeys.matches });
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

/**
 * Tema değişince ağacı BİR KEZ remount eder.
 *
 * NEDEN REMOUNT: palet yerinde mutasyona uğruyor (bkz. theme/colors.ts), yani
 * inline style'lar bir sonraki render'da doğru rengi okuyor — ama React.memo'lu
 * ağaçlar (chat balonları, LegendList satırları, SwipeCard) prop'ları
 * değişmediği için hiç render olmuyor ve eski renkte kalıyorlardı. `key` ile
 * tek seferlik taze mount bunu bir hamlede çözüyor; alternatifi 73 dosyayı
 * context aboneliğine çevirmekti ki bu chat'in render dengesini bozup kayıtlı
 * commit-storm sorununu geri getirebilirdi.
 *
 * Navigasyon durumu KORUNUR: remount'tan önce mevcut nav state snapshot'lanıp
 * NavigationContainer'a initialState olarak geri veriliyor (bkz. AppNavigator
 * captureNavStateForThemeSwap). Aksi halde Ayarlar'dan tema değiştiren
 * kullanıcı Discover'a düşerdi.
 */
function App() {
  // Duckie-regular RUNTIME'DA YÜKLENMEZ: expo-font config plugin'i (app.json)
  // fontu build sırasında binary'e gömüyor, yani ilk frame'de hazır. Önceki
  // `useFonts` + `if (!fontsLoaded) return null` yolu splash kalktıktan sonra
  // TÜM ağacı bir tick bloke ediyordu — cold start zincirinin (bkz. bootPhase)
  // en başında bedava kaybedilen zamandı.

  // Abonelik EN TEPEDE: kök zemin ve status bar da tema değişiminde güncellensin.
  const mode = useThemeMode();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
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
                      {/*
                        key={mode} → tema değişince ağaç BİR KEZ taze mount olur.
                        Palet yerinde mutasyona uğruyor (bkz. theme/colors.ts), yani
                        inline style'lar bir sonraki render'da doğru rengi okuyor —
                        ama React.memo'lu ağaçlar (chat balonları, LegendList
                        satırları, SwipeCard) prop'ları değişmediği için hiç render
                        olmuyor ve eski renkte kalıyorlardı. Alternatifi 73 dosyayı
                        context aboneliğine çevirmekti; bu da chat'in render
                        dengesini bozup kayıtlı commit-storm sorununu geri
                        getirebilirdi.

                        Navigasyon durumu KAYBOLMAZ: AppNavigator remount'ta
                        snapshot'ladığı state'i initialState olarak geri veriyor.
                      */}
                      <AppNavigator key={mode} />
                    </Sentry.ErrorBoundary>
                    {/* Pinch ile büyütülen fotoğrafın katmanı — navigator'ın
                        ÜSTÜNDE ve `key={mode}` remount'unun DIŞINDA. Kaynağın
                        kendi ağacında çizilemiyor: kart frame'i, bölüm kutuları
                        ve ScrollView kırpıyor. Aktif değilken null döner. */}
                    <PinchZoomOverlay />
                    <StatusBar style={mode === "light" ? "dark" : "light"} />
                    {PERF_HUD && <RenderHudOverlay />}
                  </NotifierWrapper>
                </BottomSheetModalProvider>
                {/* Kırpma ekranı — BottomSheetModalProvider'ın DIŞINDA olmak
                    ZORUNDA: @gorhom/portal host'unu children'dan sonra render
                    ediyor, yani her bottom sheet provider'ın içindeki her şeyin
                    üstüne boyanıyor. Profil düzenleme modalı (AppModal) da bir
                    sheet olduğu için, cropper içeride kalsaydı modalın ALTINDA
                    açılırdı. `key={mode}` remount'unun da dışında: tema değişimi
                    kırpma ortasında promise'i düşürmemeli. */}
                <CropperOverlay />
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
