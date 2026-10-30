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

/**
 * ÇEKİM İSTEĞİ — çağıranın kameraya söyleyebildiği tek şey.
 *
 * `facing`: ekran hangi kamerayla AÇILSIN. Kullanıcı yine çevirebiliyor; bu
 * yalnız başlangıç. Kampüs anları "ön kamerayla açılsın" diyor (istek): orada
 * paylaşılan şey kişinin kendisi, yani her seferinde çevirmek zorunda kalmak
 * fazladan bir dokunuş. Profil/kayıt akışları varsayılanda (arka) kalıyor —
 * oraya bir kıyafet/ortam fotoğrafı da girebiliyor.
 */
export type CameraRequest = {
  facing?: "front" | "back";
  /**
   * ── YERİNDE ONAY (istek: "çektiğim ekranda foto static kalsın, oradan
   * gönder'e basınca göndereyim, ekstra modal filan açma") ──────────────────
   *
   * Verilirse ekran deklanşörden sonra KAPANMIYOR: kare pencerenin içinde
   * donuyor ve altta bir gönder düğmesi çıkıyor. Düğmeye basılınca iş BURADA
   * yapılıyor — `commit` çözülene kadar ekran açık, düğmede dönen bir gösterge
   * var ve dönen metin satır içinde hata olarak basılıyor.
   *
   * Dönüş sözleşmesi: `null` = başarılı (ekran kapanır), string = HATA METNİ
   * (ekran açık kalır, kullanıcı yeniden çekebilir ya da tekrar deneyebilir).
   *
   * ⚠️ NEDEN ÇAĞIRANIN FONKSİYONU, bir `onCaptured` callback'i DEĞİL: gönderme
   * işi (ölçekleme + S3 + kayıt) saniyeler sürüyor ve o sürenin görünür olduğu
   * yer bu ekran olmak zorunda. Ekran kapanıp iş arkada koşsaydı kullanıcı
   * "oldu mu olmadı mı" sorusuyla haritaya dönerdi — kaldırılan onay sheet'i de
   * tam bu yüzden `sharing` boyunca kapanmıyordu.
   *
   * Verilmezse davranış ESKİSİ GİBİ: kare çekilir, ekran kapanır, `captured`
   * sonucu çağırana döner (profil/kayıt akışları bu dalda — orada çekimden
   * sonra kırpıcı açılıyor).
   */
  commit?: (shot: CameraShot) => Promise<string | null>;
  /** Gönder düğmesinin metni — yoksa ortak "Kaydet". */
  commitLabel?: string;
};

export type CameraOutcome =
  /** Kullanıcı deklanşöre bastı, kare diskte. */
  | { status: "captured"; shot: CameraShot }
  /** Yerinde onay yolu: `commit` başarıyla koştu, iş BİTTİ (bkz. `commit`). */
  | { status: "committed" }
  /** Kullanıcı vazgeçti (✕). */
  | { status: "cancelled" }
  /** Kamera ekranı yok/söküldü — çağıran ImagePicker yoluna düşmeli. */
  | { status: "unavailable" }
  /** Çekim teknik olarak başarısız (native hata, boş kare). */
  | { status: "failed"; error: unknown };

type Settle = (outcome: CameraOutcome) => void;
type Presenter = (request: CameraRequest, settle: Settle) => void;

let presenter: Presenter | null = null;

type QueueEntry = { request: CameraRequest; resolve: Settle };
const queue: QueueEntry[] = [];
let inFlight: QueueEntry | null = null;

const drain = () => {
  if (inFlight || !presenter) return;
  const next = queue.shift();
  if (!next) return;
  inFlight = next;
  presenter(next.request, (outcome) => {
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
export function presentCameraCapture(
  request: CameraRequest = {},
): Promise<CameraOutcome> {
  if (!presenter) {
    devLog("📸 [camera] host bağlı değil, sistem kamerasına düşülüyor");
    return Promise.resolve({ status: "unavailable" });
  }
  return new Promise<CameraOutcome>((resolve) => {
    // ⚠️ İstek KUYRUKTA taşınıyor, modül seviyesinde bir "son istek"
    // değişkeninde DEĞİL: iki çağrı üst üste gelirse (kırpıcıdaki ✕ ile
    // kameraya dönüş) ikincisinin ayarı birincinin oturumuna sızardı.
    queue.push({ request, resolve });
    drain();
  });
}
