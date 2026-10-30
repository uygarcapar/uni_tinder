/**
 * `xcrun simctl` sarmalayıcısı — cihaz durumunun TEK yönetim yolu.
 *
 * Neden Appium capability'leri değil:
 *   • `appium:permissions` simülatörde `applesimutils` (brew) istiyor;
 *     Xcode 26'nın yerleşik `simctl privacy`si aynı işi bağımlılıksız yapıyor
 *     ve CI'dan bir brew adımı eksiliyor.
 *   • `mobile: setSimulatedLocation` Xcode 15+ ve `idb` gerektiriyor;
 *     `simctl location set` doğrudan çalışıyor.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUNDLE_ID, DEVICE_UDID, E2E_LAT, E2E_LON, FIXTURES, artifact } from './env';

function sh(args: string[], { quiet = false } = {}): string {
  try {
    return execFileSync('xcrun', ['simctl', ...args], {
      stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`simctl ${args.join(' ')} başarısız: ${e.stderr ?? e.message ?? err}`);
  }
}

// ── Cihaz yaşam döngüsü ────────────────────────────────────────────────────

export function deviceState(): string {
  const out = sh(['list', 'devices', '-j']);
  const parsed = JSON.parse(out) as {
    devices: Record<string, Array<{ udid: string; state: string }>>;
  };
  for (const list of Object.values(parsed.devices)) {
    const hit = list.find((d) => d.udid === DEVICE_UDID);
    if (hit) return hit.state;
  }
  throw new Error(`E2E_UDID bulunamadı: ${DEVICE_UDID}\n` + `  xcrun simctl list devices available`);
}

/**
 * Cihazı açar ve GERÇEKTEN hazır olmasını bekler.
 *
 * `bootstatus -b` kritik: `boot` komutu hemen dönüyor ama SpringBoard
 * ayakta değilken `privacy`/`location` sessizce etkisiz kalıyor.
 */
export function bootDevice(): void {
  if (deviceState() !== 'Booted') sh(['boot', DEVICE_UDID]);
  execFileSync('xcrun', ['simctl', 'bootstatus', DEVICE_UDID, '-b'], { stdio: 'inherit' });
}

export function shutdownDevice(): void {
  if (deviceState() === 'Booted') sh(['shutdown', DEVICE_UDID]);
}

/** Nightly tam temizlik — Keychain DAHİL. ~45 sn + boot. */
export function eraseDevice(): void {
  shutdownDevice();
  sh(['erase', DEVICE_UDID]);
  bootDevice();
}

// ── İzinler ────────────────────────────────────────────────────────────────

/**
 * `virgin`  → tüm izinler sıfırlanır, iOS diyaloğu ÇIKAR (izin akışını test
 *             eden spec'ler: kayıt Step9, LocationAccessGate, mikrofon).
 * `granted` → diyalog gürültüsü sıfır, asıl akışa odak (geri kalan her şey).
 * `denied`  → izin reddedilmiş; kapının kalıcılığını test eden spec'ler.
 */
export type PermissionProfile = 'virgin' | 'granted' | 'denied';

/**
 * Bildirim izni bu listede YOK ve gerek de yok: pushService.ts:91
 * `if (!Device.isDevice) return null` ile simülatörde hiç sormuyor.
 * Bu, kaydedilmiş bir kapsam boşluğu (gerçek cihaz nightly'sine ait).
 */
const SERVICES = ['location', 'location-always', 'photos', 'photos-add', 'microphone', 'motion'];

/**
 * ⚠️ `simctl privacy` ÇALIŞAN UYGULAMAYI ÖLDÜRÜYOR ("Some permission changes
 * will terminate the application if running"). Bu yüzden yalnız
 * `onPrepare`/`beforeSession`'da çağrılabilir, oturum İÇİNDE asla.
 */
export function preparePrivacy(profile: PermissionProfile = 'granted'): void {
  sh(['privacy', DEVICE_UDID, 'reset', 'all', BUNDLE_ID], { quiet: true });
  if (profile === 'virgin') return;
  const action = profile === 'granted' ? 'grant' : 'revoke';
  for (const service of SERVICES) {
    sh(['privacy', DEVICE_UDID, action, service, BUNDLE_ID], { quiet: true });
  }
}

// ── Konum ──────────────────────────────────────────────────────────────────

/**
 * ZORUNLU, opsiyonel değil.
 *
 * `readCurrentPosition` (locationHeartbeat.ts:51) `getCurrentPositionAsync`i
 * TIMEOUT'SUZ çağırıyor. Konumu ayarlanmamış bir simülatörde o promise HİÇ
 * çözülmüyor → kayıt Step9'un `autoChecking` spinner'ı sonsuza dönüyor →
 * kayıt testi 10 dakikalık mocha timeout'una kadar bekliyor.
 */
export function setLocation(lat: number = E2E_LAT, lon: number = E2E_LON): void {
  sh(['location', DEVICE_UDID, 'set', `${lat},${lon}`]);
}

export function clearLocation(): void {
  sh(['location', DEVICE_UDID, 'clear']);
}

/** Kampüse yürüme — geofence/presence spec'i için. */
export function walkTo(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  speedMetersPerSec = 8
): void {
  sh([
    'location',
    DEVICE_UDID,
    'start',
    `--speed=${speedMetersPerSec}`,
    '--interval=1',
    `${from.lat},${from.lon}`,
    `${to.lat},${to.lon}`,
  ]);
}

// ── Galeri ─────────────────────────────────────────────────────────────────

/**
 * Fotoğraf kütüphanesini tohumlar. Kayıt Step15 min 2 foto istiyor ve
 * `pickAndCropPhotos` PHPicker kullanıyor — yani fotoğraflar GERÇEKTEN UI'dan
 * seçiliyor, mock yok.
 */
export function seedPhotoLibrary(): number {
  if (!existsSync(FIXTURES)) return 0;
  const files = readdirSync(FIXTURES)
    .filter((f) => /^photo-\d+\.(jpe?g|png)$/i.test(f))
    .sort()
    .map((f) => resolve(FIXTURES, f));
  if (files.length === 0) return 0;
  sh(['addmedia', DEVICE_UDID, ...files]);
  return files.length;
}

// ── Uygulama ───────────────────────────────────────────────────────────────

/**
 * Koşular arası durum sıfırlamanın TEK güvenli yolu.
 *
 * MMKV dosyalarını elle silmek YASAK — tokenStorage.ts:40-47: "anahtarsız
 * açmayı denemek de içeriği ATTIRIYOR (deneme yıkıcı)". `ENC_MARKER` düz
 * `app-prefs`te, şifreleme anahtarı Keychain'de, veri `auth-tokens`ta.
 *
 * Uninstall güvenli çünkü marker DA konteynerde: tehlikeli yön (marker
 * "şifreli" der ama anahtar yok) oluşamıyor. Keychain anahtarı sağ kalırsa
 * yeni/boş MMKV dosyası o anahtarla sorunsuz açılıyor.
 */
export function uninstallApp(): void {
  try {
    sh(['uninstall', DEVICE_UDID, BUNDLE_ID], { quiet: true });
  } catch {
    // Kurulu değilse sorun yok.
  }
}

export function isAppInstalled(): boolean {
  try {
    sh(['get_app_container', DEVICE_UDID, BUNDLE_ID], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

// ── Video ──────────────────────────────────────────────────────────────────

let recorder: ChildProcess | null = null;
let recordingPath: string | null = null;

/**
 * `simctl io recordVideo` — Appium'un `startRecordingScreen`i DEĞİL.
 * Appium'un yolu mjpeg/ffmpeg üzerinden gidiyor ve bu ekranlarda (sürekli
 * koşan Reanimated döngüleri + alev overlay'i) kare düşürüyor, bellek yiyor.
 */
export function startVideo(name: string): void {
  stopVideo();
  recordingPath = artifact('video', `${sanitize(name)}.mp4`);
  if (existsSync(recordingPath)) unlinkSync(recordingPath);
  recorder = spawn(
    'xcrun',
    ['simctl', 'io', DEVICE_UDID, 'recordVideo', '--codec', 'h264', '--force', recordingPath],
    { stdio: 'ignore' }
  );
}

/** Kaydı durdurur ve dosya yolunu döndürür (yoksa null). */
export function stopVideo(): string | null {
  if (!recorder) return null;
  // SIGINT şart: recordVideo dosyayı ancak nazik kapanışta sonlandırıyor,
  // SIGKILL bozuk/0 bayt mp4 bırakıyor.
  recorder.kill('SIGINT');
  recorder = null;
  const path = recordingPath;
  recordingPath = null;
  return path;
}

/** Başarılı spec'in videosunu siler — nightly'de 25 × 40 MB tutmak anlamsız. */
export function discardVideo(path: string | null): void {
  if (path && existsSync(path)) unlinkSync(path);
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}
