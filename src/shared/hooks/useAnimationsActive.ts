import { useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { NavigationContext } from "@react-navigation/native";

/**
 * Süs amaçlı SONSUZ animasyonlar (parıltı, nabız, dolaşan ışık) şu an
 * oynamalı mı: bileşenin ekranı odakta VE uygulama ön planda.
 *
 * ── NEDEN (2026-11-06, Instruments) ─────────────────────────────────────────
 * Alt sekmeler arka planda MOUNT'LU kalıyor ve hepsi tek bir React ağacında.
 * Görünmeyen bir sekmede dönen `withRepeat(-1)` da her karede Reanimated'ın
 * güncelleme döngüsünü çalıştırıyordu; trace'te Keşif boştayken (hiçbir şeye
 * dokunulmazken) ana thread'in %72'si bu commit'lerdeydi. Görünmeyen şeyi
 * canlandırmanın faydası sıfır.
 *
 * NAVİGATÖR DIŞINDA DA GÜVENLİ: `useIsFocused` navigasyon bağlamı yokken
 * fırlatıyor (modal/portal içinde çizilen bileşenler). Burada bağlam yoksa
 * "odakta" sayılıyor — yalnız AppState kapısı kalıyor.
 */
export function useAnimationsActive(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(
    () => navigation?.isFocused() ?? true,
  );
  const [appActive, setAppActive] = useState(
    () => AppState.currentState === "active",
  );

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  return focused && appActive;
}
