import "./global.css";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "./src/store";
import AppNavigator from "./src/navigation/AppNavigator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ActivityIndicator, View } from "react-native";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <PersistGate
          loading={
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#f57656" />
            </View>
          }
          persistor={persistor}
        >
          <KeyboardProvider>
            <BottomSheetModalProvider>
              <AppNavigator />
              <StatusBar style="light" />
            </BottomSheetModalProvider>
          </KeyboardProvider>
        </PersistGate>
      </Provider>
    </GestureHandlerRootView>
  );
}
