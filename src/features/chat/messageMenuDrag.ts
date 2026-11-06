import { makeMutable } from "react-native-reanimated";

/**
 * Uzun-bas menüsünde "parmağı kaldırmadan kaydırıp bırakarak seç" kanalı.
 *
 * NEDEN GLOBAL: menüyü açan dokunuş BALONDA başlıyor ve bitene kadar orada
 * kalıyor. UIKit bir dokunuşu başladığı görünüme bağlar; üstte Modal açılsa
 * bile hareketler balonun jestine gelmeye devam eder, Modal'ın içindeki
 * hiçbir şey bu dokunuşu görmez. Bu yüzden balonun jesti parmak konumunu
 * buraya YAZIYOR, MessageActionSheet buradan OKUYUP isabet testini kendi
 * yapıyor.
 *
 * COMMIT-STORM KURALI: listedeki balonlar bu değerleri YALNIZ yazar, hiçbir
 * balon stili bunları OKUMAZ. Okuyan tek yer menü (Modal). Balon başına bir
 * okuyucu eklemek, her parmak karesinde görünürdeki tüm satırları commit
 * ettirir (bkz. ReplySwipeRow başlığı).
 *
 * Aynı anda tek menü açılabildiği için tek kanal yeterli.
 */

/** Takip yok (menü kapalı ya da parmak zaten kalktı ve işlendi). */
export const DRAG_IDLE = 0;
/** Uzun basış tetiklendi, parmak hâlâ ekranda. */
export const DRAG_TRACKING = 1;
/** Parmak kalktı; menü bu geçişi görüp üzerindeki hedefi çalıştırır. */
export const DRAG_RELEASED = 2;

/** Pencere koordinatında parmak konumu (RNGH absoluteX/Y). */
export const menuDragX = makeMutable(0);
export const menuDragY = makeMutable(0);
export const menuDragPhase = makeMutable(DRAG_IDLE);

/** Menüyü açan basılı tutma süresi (eski Pressable delayLongPress ile aynı). */
export const MENU_LONG_PRESS_MS = 300;

/**
 * Menü AÇIKKEN yeni bir dokunuşla kaydırıp seçme — panellerin (emoji satırı,
 * aksiyon menüsü) kendi pan'i. Kısa mesafede aktifleşir: saf dokunuş altındaki
 * Pressable'a kalır, parmak kayınca pan devralır (RNGH aktifleşince JS
 * responder'ı iptal ediyor → altındaki satırın onPress'i ÇALIŞMAZ, çift
 * tetiklenme yok) ve aynı kanala yazar; seçimi yine menünün reaksiyonu yapar.
 *
 * Her panel KENDİ örneğini almalı: bir Gesture nesnesi tek detector'a bağlanır.
 */
export const MENU_PANEL_DRAG_MIN_DISTANCE = 6;
