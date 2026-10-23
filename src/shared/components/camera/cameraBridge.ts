import { devLog } from "@/shared/utils/devLog";

/**
 * Uygulama içi kamera ekranı ile onu ÇAĞIRAN kod arasındaki köprü.
 *
 * `cropperBridge`in birebir kardeşi ve aynı gerekçeyle var: `photoPicker.ts` bir
 * component değil, promise döndüren bir fonksiyon; kamera ekranı ise React
 * ağacının KÖKÜNDE yaşamak zorunda (bottom sheet portal'ları her şeyin üstüne
 * boyanıyor, bkz. CameraCaptureOverlay). İkisini bağlayan tek yer burası.
 *
 * NEDEN AYRI BİR KÖPRÜ: kamera ile kırpma AYNI oturumda sırayla açılıyor
 * (çek → kırp). Tek köprüye bindirmek, kırpma uçuştayken kameranın kuyruğa
 * girmesi demekti.
 */

export type CameraShot = {
  uri: string;
  /** Kırpma geometrisinin girdisi; `0` gelirse çağıran ölçüyü kendisi okur. */
  width: number;
  height: number;
};

export type CameraOutcome =
  /** Kullanıcı deklanşöre bastı, kare diskte. */
  | { status: "captured"; shot: CameraShot }
  /** Kullanıcı vazgeçti (✕). */
  | { status: "cancelled" }
  /** Kamera ekranı yok/söküldü — çağıran ImagePicker yoluna düşmeli. */
  | { status: "unavailable" }
  /** Çekim teknik olarak başarısız (native hata, boş kare). */
  | { status: "failed"; error: unknown };

type Settle = (outcome: CameraOutcome) => void;
type Presenter = (settle: Settle) => void;

let presenter: Presenter | null = null;

type QueueEntry = { resolve: Settle };
const queue: QueueEntry[] = [];
let inFlight: QueueEntry | null = null;

const drain = () => {
  if (inFlight || !presenter) return;
  const next = queue.shift();
  if (!next) return;
  inFlight = next;
  presenter((outcome) => {
    // Aynı istek iki kez sonuçlanamaz (iptal ile hata aynı karede düşerse) —
    // yoksa kuyruk bir adım kayar ve yanlış promise çözülür.
    if (inFlight !== next) return;
    inFlight = null;
    next.resolve(outcome);
    drain();
  });
};

/** Overlay mount olurken kendini bağlar, unmount'ta `null` verir. */
export function bindCamera(next: Presenter | null) {
  presenter = next;
  if (next) {
    drain();
    return;
  }
  // Host gitti: uçuştaki ve kuyruktaki her şey `unavailable`. Çağıran bunu
  // "sistem kamerasına düş" olarak okuyor; hiçbir promise askıda kalmaz.
  const stranded = inFlight ? [inFlight, ...queue] : [...queue];
  inFlight = null;
  queue.length = 0;
  stranded.forEach((entry) => entry.resolve({ status: "unavailable" }));
}

export function isCameraCaptureAvailable() {
  return presenter !== null;
}

/**
 * Kamera ekranını sıraya alır ve sonucunu bekler.
 *
 * ASLA ASILI KALMAZ: host bağlı değilse (testler, teardown penceresi) anında
 * `unavailable` çözülür.
 */
export function presentCameraCapture(): Promise<CameraOutcome> {
  if (!presenter) {
    devLog("📸 [camera] host bağlı değil, sistem kamerasına düşülüyor");
    return Promise.resolve({ status: "unavailable" });
  }
  return new Promise<CameraOutcome>((resolve) => {
    queue.push({ resolve });
    drain();
  });
}
