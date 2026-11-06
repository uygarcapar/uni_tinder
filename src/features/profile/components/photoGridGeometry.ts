import { Dimensions } from "react-native";

/**
 * Profil fotoğraf ızgarasının GEOMETRİSİ — saf, test edilebilir tek kaynak.
 *
 * ⚠️ NEDEN AYRI DOSYA: ızgara bugün `EditProfileForm` içinde (3500 satır, sıfır
 * test) gömülü duruyor ve mod başına fotoğrafla birlikte İKİNCİ bir çağıran
 * daha gelecek (mod kurulum sheet'i — o modun ilk fotoğraflarını seçme adımı).
 * Aynı matematiğin iki yere kopyalanması, ikisinin ayrışması demek: sürükleme
 * bir yüzeyde doğru, diğerinde bir slot kaymış olurdu. `cropGeometry` ile aynı
 * gerekçe ve aynı kalıp — hesap saf modülde, node'da doğrulanıyor.
 *
 * ⚠️ `"worklet"` fonksiyonlar AYRI MODÜLDE ÇALIŞIR: reanimated babel eklentisi
 * direktifi nerede olursa olsun işliyor (emsal: cropGeometry'nin worklet'leri
 * de ayrı dosyada ve UI thread'inde koşuyor).
 */

/** Izgara SÜTUN SAYISI. Dört ayrı yerde kullanılıyor ve hepsinin aynı olması
 *  şart: konum (`%`/`/`), ters eşleme (`row * N + col`) ve boşluk hesabı. */
export const PHOTO_GRID_COLUMNS = 3;

/** Sayfanın yatay iç boşluğu. Izgara dışında da kullanılıyor (tam-genişlik
 *  bölümler kendini bu kadar negatif marjla taşırıyor). */
export const CONTAINER_PADDING = 20;

/** Satırlar arası dikey boşluk. */
export const ROW_GAP = 20;

/** Sürükleme yayı — taşınan karo, yerine oturan kardeşleri ve ölçek. */
export const SPRING_CONFIG = { damping: 22, stiffness: 140, mass: 1.4 };

const { width: WINDOW_WIDTH } = Dimensions.get("window");

export const AVAILABLE_WIDTH = WINDOW_WIDTH - CONTAINER_PADDING * 2;
export const ITEM_WIDTH = AVAILABLE_WIDTH * 0.31;
/** Sütun aralığı: kalan genişlik, aralık SAYISINA (sütun - 1) bölünüyor. */
export const GAP =
  (AVAILABLE_WIDTH - PHOTO_GRID_COLUMNS * ITEM_WIDTH) /
  (PHOTO_GRID_COLUMNS - 1);
/** Karo oranı 3:4 — kırpıcının çıktı oranıyla aynı (bkz. cropGeometry). */
export const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);

/**
 * Izgara kabının yüksekliği.
 *
 * ⚠️ EŞİK 2, SÜTUN SAYISI 3 OLMASINA RAĞMEN — ve bu bir hata değil: ızgarada
 * fotoğrafların yanı sıra bir de EKLE karosu var. 2 fotoğraf + ekle = 3 öğe,
 * yani tam bir satır. 3 fotoğraf + ekle = 4 öğe, yani ikinci satır açılıyor.
 * Tavandaki 6 fotoğrafta ekle karosu çizilmiyor (6 öğe = 2 satır), o yüzden
 * formül orada da doğru kalıyor.
 */
export const getContainerHeight = (photoCount: number): number =>
  photoCount <= 2 ? ITEM_HEIGHT : 2 * ITEM_HEIGHT + ROW_GAP;

/** Bir slotun ızgara içindeki sol-üst konumu. */
export function getPosition(index: number): { x: number; y: number } {
  "worklet";
  return {
    x: (index % PHOTO_GRID_COLUMNS) * (ITEM_WIDTH + GAP),
    y: Math.floor(index / PHOTO_GRID_COLUMNS) * (ITEM_HEIGHT + ROW_GAP),
  };
}

/**
 * `getPosition`in TERSİ — sürüklenen karonun bıraktığı ötelemeden hedef slotu
 * çözüyor.
 *
 * `Math.round`: parmağın yarı yoldan fazlasını geçtiği slota geçiliyor, yani
 * karo kendi hücresinin yarısını aştığında yer değiştiriyor.
 *
 * ⚠️ SONUÇ KENETLENİYOR (`0..maxIndex`): ızgaranın dışına sürüklenen parmak
 * olmayan bir slot indeksi üretirdi ve sıra dizisi delinirdi.
 */
export function getOrder(tx: number, ty: number, maxIndex: number): number {
  "worklet";
  const col = Math.round(tx / (ITEM_WIDTH + GAP));
  const row = Math.round(ty / (ITEM_HEIGHT + ROW_GAP));
  return Math.max(0, Math.min(row * PHOTO_GRID_COLUMNS + col, maxIndex));
}
