import { makeMutable } from "react-native-reanimated";

/**
 * Fotoğrafa iki parmakla basılı tutup büyütme (Instagram tarzı) için PAYLAŞILAN
 * durum.
 *
 * NEDEN MODÜL SEVİYESİNDE: büyüyen görsel, kaynağının ağacında çizilemez —
 * kart frame'i, bölüm kutuları ve ScrollView'ın hepsi `overflow: hidden`.
 * Büyüyen kopya bu yüzden uygulama KÖKÜNDE tek bir katmanda (PinchZoomOverlay)
 * duruyor; jest ise fotoğrafın kendi ağacında (PinchZoomable). İkisini
 * birbirine bağlayan tek şey burası: React context'i değil, worklet'ten
 * doğrudan yazılabilen shared value'lar (jest UI thread'de yaşıyor, her
 * frame'de JS'e uğramamalı).
 */

/** Kaynak fotoğrafın ekrandaki dikdörtgeni — jest başında `measure()` ile. */
export const zoomRectX = makeMutable(0);
export const zoomRectY = makeMutable(0);
export const zoomRectW = makeMutable(0);
export const zoomRectH = makeMutable(0);
/** Kaynağın köşe yarıçapı — kopya aynı kesimle büyüsün. */
export const zoomRadius = makeMutable(0);

export const zoomScale = makeMutable(1);
export const zoomTranslateX = makeMutable(0);
export const zoomTranslateY = makeMutable(0);
/** 0→1: arkadaki karartmanın şiddeti (ölçekten türetiliyor). */
export const zoomProgress = makeMutable(0);

/**
 * Bir fotoğraf şu an pinch ile büyütülüyor mu?
 *
 * Kart destesi (SwipeWrapper) bunu okuyup swipe pan'lerini es geçiyor: iki
 * parmak birbirinden uzaklaşırken parmakların ORTAK hareketi tek parmaklı bir
 * sürüklemeden ayırt edilemiyor ve kart yanlışlıkla beğeni/geçme eşiğine
 * gidiyordu. Parmaklar kalktıktan sonra da geri-yaylanma bitene kadar 1
 * kalıyor — pan'in `onEnd`'i parmak kalkışında ateşleniyor ve bayrak o an
 * düşerse bayat `tx` ile swipe'ı tamamlıyordu.
 */
export const photoPinchActive = makeMutable(false);

type UriSetter = (uri: string | null) => void;

let activeSetter: UriSetter | null = null;

/** Overlay mount olurken kendi setter'ını buraya bağlar. */
export function bindZoomOverlay(setter: UriSetter | null) {
  activeSetter = setter;
}

/**
 * Büyütülecek fotoğrafı göster / kaldır. Worklet'ten `runOnJS` ile çağrılıyor;
 * overlay mount edilmemişse (ör. testler) sessizce hiçbir şey yapmaz.
 */
export function setZoomImage(uri: string | null) {
  activeSetter?.(uri);
}
