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

// ── SOLDAN SAĞA çekip bırakınca yanıtla (WhatsApp) ────────────────────────────
// İki jest ayrı eksende: SOLA çekiş listeyi kaydırıp saat kolonunu açar
// (yukarıdaki reveal), SAĞA çekiş DOKUNULAN BALONU sağa kaydırır ve eşiği
// geçince o mesaj yanıtlanır. Yön ayrımı sayesinde ikisi çakışmaz
// (reveal pan'i failOffsetX(15) ile sağ çekişi zaten bırakıyor).
//
// Balon parmağı 1:1 İZLEMEZ: baştan sona sürtünme var, eşikten sonra sürtünme
// katsayısı da giderek artar (üstel yaklaşma) — balon duvara dayanıyor hissi
// verir ve ekranın dışına taşacak kadar gitmez.
//   • raw ≤ REPLY_TRIGGER_X   → kayma = raw × REPLY_START_RESIST  (doğrusal, yavaş)
//   • raw > REPLY_TRIGGER_X   → kalan yol REPLY_MAX_X'e ÜSTEL yaklaşır; her px
//                               öncekinden daha az kaydırır, tavan asla aşılmaz.
export const REPLY_TRIGGER_X = 72;
// Kurulduktan sonra geri çekişte histerezis — eşiğin tam üstünde titreyen parmak
// haptic'i defalarca tetiklemesin.
export const REPLY_RELEASE_X = REPLY_TRIGGER_X - 14;
export const REPLY_START_RESIST = 0.55;
// Eşik anındaki kayma (39.6px) — kuyruk buradan başlar.
export const REPLY_TRIGGER_TRAVEL = REPLY_TRIGGER_X * REPLY_START_RESIST;
// Balonun gidebileceği en sağ nokta. TAVAN DÜŞÜK TUTULUYOR: kendi mesajlarımız
// sağa dayalı ve minWidth'i 48 — tavan büyürse kısa balon ekranın tamamen dışına
// çıkıyor. 50'de en dar balondan bile ~10px içeride kalır.
export const REPLY_MAX_X = 50;
// Kuyruğun sertliği: KÜÇÜLDÜKÇE tavana daha çabuk varır, yani eşikten sonra daha
// AZ direnç hissedilir. (48 → 34: eşiği geçtikten sonra bir tık daha rahat.)
export const REPLY_TAIL_K = 34;
// Ekranın SOL kenarından başlayan çekişler native swipe-back'e (edge pop) ait —
// bu bantta jest atıl kalır. AppNavigator'da fullScreenGestureEnabled:false,
// yani native tanıyıcı yalnız bu dar şeritte çalışıyor.
export const REPLY_EDGE_GUARD = 28;
