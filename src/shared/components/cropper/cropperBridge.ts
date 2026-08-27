import { devLog } from "@/shared/utils/devLog";
import type { PickedPhoto } from "@/shared/utils/photoPicker";

/**
 * Kırpma ekranı ile onu ÇAĞIRAN kod arasındaki köprü.
 *
 * NEDEN MODÜL SEVİYESİNDE: `photoPicker.ts` bir component değil — bir promise
 * döndürüyor ve iki ekran onu `await` ediyor. Kırpma ekranı ise React ağacının
 * KÖKÜNDE yaşamak zorunda (bkz. CropperOverlay: gorhom portal'ları her şeyin
 * üstüne boyanıyor). İkisini bağlayan tek şey burası — `pinchZoom.ts`'teki
 * bindZoomOverlay deseninin bir resolver ile genişletilmiş hâli.
 *
 * uiBus KULLANILMIYOR: `emit` ateşle-unut, cevap kanalı yok.
 */

export type CropRequest = {
  uri: string;
  srcWidth: number;
  srcHeight: number;
  /** 1 tabanlı; başlıktaki "2 / 4" sayacı için. */
  index?: number;
  total?: number;
};

export type CropOutcome =
  /**
   * Kullanıcı kırptı ve onayladı.
   *
   * `adjusted`: çerçeveye GERÇEKTEN dokunuldu mu (yakınlaştırma/kaydırma).
   * Galeri akışı bunu umursamaz — ham fotoğrafın 3:4'e indirilmesi zaten
   * gerekiyor. Yeniden kırpmada ise kritik: dokunulmamış bir çıktıyı geri
   * yüklemek, ONAYLANMIŞ bir fotoğrafı sebepsiz yere yeniden moderasyona
   * sokardı.
   */
  | { status: "done"; photo: PickedPhoto; adjusted?: boolean }
  /** Bu fotoğrafı iptal etti — çağıran sıradakine geçmeli. */
  | { status: "skipped" }
  /** Kırpma ekranı yok/söküldü — çağıran döngüyü DURDURMALI. */
  | { status: "aborted" }
  /** Kırpma teknik olarak başarısız (decode, disk, izin). */
  | { status: "failed"; error: unknown };

type Settle = (outcome: CropOutcome) => void;
type Presenter = (request: CropRequest, settle: Settle) => void;

let presenter: Presenter | null = null;

type QueueEntry = { request: CropRequest; resolve: Settle };
const queue: QueueEntry[] = [];
let inFlight: QueueEntry | null = null;

const drain = () => {
  if (inFlight || !presenter) return;
  const next = queue.shift();
  if (!next) return;
  inFlight = next;
  presenter(next.request, (outcome) => {
    // Aynı istek iki kez sonuçlanamaz (ör. kullanıcı iptal ederken hata da
    // düşerse) — yoksa kuyruk bir adım kayar ve yanlış promise çözülür.
    if (inFlight !== next) return;
    inFlight = null;
    next.resolve(outcome);
    drain();
  });
};

/** Overlay mount olurken kendini bağlar, unmount'ta `null` verir. */
export function bindCropper(next: Presenter | null) {
  presenter = next;
  if (next) {
    drain();
    return;
  }
  // Host gitti: uçuştaki ve kuyruktaki her şeyi kapat. `aborted` çağıranın
  // döngüyü kırmasını söyler; hiçbir promise askıda kalmaz.
  const stranded = inFlight ? [inFlight, ...queue] : [...queue];
  inFlight = null;
  queue.length = 0;
  stranded.forEach((entry) => entry.resolve({ status: "aborted" }));
}

export function isCropperAvailable() {
  return presenter !== null;
}

/**
 * Kırpma ekranını sıraya alır ve sonucunu bekler.
 *
 * ASLA ASILI KALMAZ: host bağlı değilse (testler, teardown penceresi) anında
 * `aborted` çözülür. Kuyruk FIFO — ekle butonuna çift dokunma güvenli.
 */
export function presentCropper(request: CropRequest): Promise<CropOutcome> {
  if (!presenter) {
    devLog("✂️ [cropper] host bağlı değil, istek atlandı");
    return Promise.resolve({ status: "aborted" });
  }
  return new Promise<CropOutcome>((resolve) => {
    queue.push({ request, resolve });
    drain();
  });
}
