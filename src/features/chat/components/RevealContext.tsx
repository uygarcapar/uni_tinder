import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/**
 * Instagram-DM tarzı "sağdan-sola çekince saat/okundu göster" özelliği için tek
 * bir UI-thread shared value. Tüm balonlar bunu context'ten worklet içinde okur →
 * jest her frame'de React re-render TETİKLEMEZ (ShadowTree commit churn'e karşı
 * kritik). 0 = kapalı, REVEAL_MAX = tam açık.
 */
export const RevealContext = createContext<SharedValue<number> | null>(null);

export const useRevealX = () => useContext(RevealContext);

// Sola çekince açılan saat/okundu kolonunun tam-açık genişliği. MessageBubble'daki
// reveal kolonu genişliği ile jest clamp'i BUNU paylaşır — kolon tam yerine otursun.
export const REVEAL_MAX = 64;
