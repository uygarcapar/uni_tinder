import type { ImageSourcePropType } from "react-native";
import type { AppMode } from "@/features/discover/modeTheme";

/**
 * Mod kartlarının zemin fotoğrafları — "Burada ne arıyorsun?" adımı
 * (RegisterStepModeScreen > ModeCard). Kart oranı 3:2, görseller de o oranda
 * üretiliyor.
 *
 * ⚠️ HARİTA BOŞ OLABİLİR. Var olmayan bir yolu `require` etmek Metro'yu
 * bundle anında düşürür; görseller gelmeden kart modun gradyanıyla çiziliyor
 * (gradyan foto VARKEN DE duruyor — yüklenme anındaki boşluğu ve şeffaf PNG
 * kenarlarını o kapatıyor). Yani bu dosya bir yer tutucu değil, kartın iki
 * katmanından biri.
 *
 * Görselleri eklerken:
 *   1. Dosyayı `assets/mode/<mod>.jpg` olarak koy — 3:2, 1200×800. Kart en
 *      geniş cihazda ~342pt, yani @3x'te 1026px; 1200 tavanı o yüzden yeterli
 *      ve paket 300KB civarında kalıyor (2016px'lik ham kare 4MB'tı).
 *   2. Aşağıya satırını ekle.
 * Dosya adları ürün diline göre değil MOD ANAHTARINA göre: wire değerleri
 * "Dating"/"Friends", Flört/Arkadaş yalnız görünen ad (bkz. modeTheme).
 */
export const MODE_CARD_ART: Partial<Record<AppMode, ImageSourcePropType>> = {
  Dating: require("../../../assets/mode/dating.jpg"),
  Friends: require("../../../assets/mode/friends.jpg"),
};
