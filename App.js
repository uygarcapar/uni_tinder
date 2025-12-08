import "./global.css";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import { store } from "./src/store";
import AppNavigator from "./src/navigation/AppNavigator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// 1. Provider'ı import et
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        {/* 2. Uygulamanı bu Provider ile sarmala */}
        <BottomSheetModalProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </BottomSheetModalProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}
