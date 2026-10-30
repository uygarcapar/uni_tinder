// ⚠️ İLK SATIR — başka hiçbir import'tan önce.
// `@/shared/constants/api` import ANINDA EXPO_PUBLIC_API_BASE_URL yoksa throw
// ediyor (api.ts:3-7) ve e2e uç listesini o modülden alıyor.
import './support/env';

import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import {
  API_BASE_URL,
  APP_PATH,
  ARTIFACTS,
  BUNDLE_ID,
  DEVICE_NAME,
  DEVICE_UDID,
  E2E_ROOT,
  LANG,
  PLATFORM_VERSION,
  RUN_ID,
  SEED,
  artifact,
  ensureArtifactDirs,
} from './support/env';
import {
  bootDevice,
  discardVideo,
  preparePrivacy,
  seedPhotoLibrary,
  setLocation,
  startVideo,
  stopVideo,
  type PermissionProfile,
} from './support/simctl';
import { assertNoFatals, startLogStream, stopLogStream } from './support/logstream';

const spec = (...parts: string[]) => resolve(E2E_ROOT, ...parts);

const SUITES = {
  smoke: [spec('specs/smoke/**/*.e2e.ts')],
  auth: [spec('specs/smoke/01-cold-boot.e2e.ts'), spec('specs/auth/**/*.e2e.ts')],
  core: [spec('specs/core/**/*.e2e.ts')],
  monkey: [spec('specs/chaos/**/*.e2e.ts')],
  full: [spec('specs/**/*.e2e.ts')],
} as const;

type SuiteName = keyof typeof SUITES;
const SUITE = (process.env.E2E_SUITE ?? 'smoke') as SuiteName;
if (!(SUITE in SUITES)) {
  throw new Error(`Bilinmeyen E2E_SUITE: ${SUITE} (${Object.keys(SUITES).join(' | ')})`);
}

/**
 * İzin profili suite'e göre:
 *   `virgin`  — izin diyaloğunu TEST EDEN spec'ler (kayıt, konum kapısı, mikrofon)
 *   `granted` — geri kalan her şey; diyalog gürültüsü sıfır
 *
 * ⚠️ `simctl privacy` çalışan uygulamayı öldürüyor → profil yalnız burada,
 * oturum İÇİNDE asla değişmiyor.
 */
const PERMISSION_PROFILE: PermissionProfile =
  (process.env.E2E_PERMISSIONS as PermissionProfile | undefined) ??
  (SUITE === 'auth' ? 'virgin' : 'granted');

let currentVideo: string | null = null;
const runStartedAt = Date.now();

/**
 * WebDriverAgent daha önce bu derivedDataPath'e derlendi mi?
 *
 * `E2E_PREBUILT_WDA=0` ile zorla kapatılabilir (WDA bozulduysa ya da Xcode
 * sürümü değiştiyse: eski runner açılır ama ilk komutta kopar).
 */
function hasPrebuiltWda(): boolean {
  if (process.env.E2E_PREBUILT_WDA === '0') return false;
  return existsSync(
    artifact('wda-dd', 'Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app')
  );
}

/**
 * iOS capability'leri.
 *
 * `as unknown as WebdriverIO.Capabilities` tek ve bilinçli bir cast:
 * `@wdio/types` XCUITest'in bütün `appium:` anahtarlarını tanımıyor
 * (`snapshotMaxDepth`, `customSnapshotTimeout`, `simpleIsVisibleCheck`,
 * `animationCoolOffTimeout` tipte yok ama driver tarafında geçerli ve
 * BELİRLEYİCİ). Anahtar adlarını tip sistemi doğrulamadığı için yazım
 * hatalarına karşı tek savunma, bu bloğun gözden geçirilmesi.
 */
const IOS_CAPABILITIES = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': DEVICE_NAME,
  'appium:platformVersion': PLATFORM_VERSION,
  'appium:udid': DEVICE_UDID,
  'appium:app': APP_PATH,
  'appium:bundleId': BUNDLE_ID,

  // ── İZİN DİYALOGLARI: oto-kabul KAPALI ────────────────────────────────────
  // Gerekçe support/alerts.ts başında: XCUITest'in alert monitörü SİSTEM
  // diyaloğunu uygulamanın Alert.alert'inden ayırt etmiyor ve bu kod tabanında
  // 40+ Alert.alert var (tek başına SettingsScreen'de 20'den fazla).
  'appium:autoAcceptAlerts': false,
  'appium:autoDismissAlerts': false,

  // ── Durum: sıfırlamayı BİZ yönetiyoruz (simctl uninstall) ─────────────────
  'appium:noReset': true,
  'appium:fullReset': false,
  'appium:shouldTerminateApp': true,
  'appium:forceAppLaunch': true,

  // ── ANİMASYON GERÇEKLİĞİ — planın en yüksek etkili kararı ─────────────────
  // Alev tam kapalıyken TAVANSIZ park ediyor (8 sn valf) ve canlılığı UI
  // thread'inde nefes alıyor; Reanimated döngüleri hiç durmuyor. Bu üç ayar
  // olmadan WDA her komutta "animasyon bitsin" diye bekler ve HER etkileşim
  // zaman aşımına oturur.
  'appium:waitForQuiescence': false,
  'appium:waitForIdleTimeout': 0,
  'appium:animationCoolOffTimeout': 0,

  // ── Ağaç / performans ─────────────────────────────────────────────────────
  // 60 yetmezse 00-tree-dump gerçek derinliği raporluyor (maliyet: her sorgu
  // yavaşlar).
  'appium:snapshotMaxDepth': 60,
  'appium:customSnapshotTimeout': 15,
  'appium:simpleIsVisibleCheck': true,
  // Çok yüksek olursa onChangeText zinciri kare düşürüyor.
  'appium:maxTypingFrequency': 20,

  // ── WDA ───────────────────────────────────────────────────────────────────
  // `usePrebuiltWDA` "derlemeyi ATLA, hazırını çalıştır" demek. Koşulsuz açmak
  // İLK koşuyu kesin olarak öldürüyor: derivedDataPath boşken xcodebuild
  // "Cannot launch simulated executable: no file found at
  // …/WebDriverAgentRunner-Runner.app" ile 65 veriyor. Bu yüzden karar
  // VARLIĞA bakıyor: runner derlenmişse atla (~4 dk kazanç), değilse derle.
  'appium:usePrebuiltWDA': hasPrebuiltWda(),
  'appium:derivedDataPath': artifact('wda-dd'),
  'appium:showXcodeLog': true,
  'appium:wdaLaunchTimeout': 300_000,
  'appium:wdaConnectionTimeout': 300_000,
  'appium:newCommandTimeout': 300,
  'appium:clearSystemFiles': false,
} as unknown as WebdriverIO.Capabilities;

// `Options.Testrunner` capabilities ALANINI TAŞIMIYOR (v9'da ayrıştı);
// capabilities dahil tam şekil `WebdriverIO.Config`.
export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: [...SUITES[SUITE]],
  exclude: [],

  /**
   * TEK instance.
   *   • `simctl location`/`privacy` cihaz bazlı — paralelde profil çatışması.
   *   • Tek backend'e paralel akışlar `api.ts`in 429 retry yolunu tetikliyor.
   *   • macOS runner'da 2'den fazla eşzamanlı WDA derlemesi I/O'ya oturuyor.
   * Süre kısaltmak gerekirse paralellik RUNNER seviyesinde (matrix ile suite
   * bölme), process seviyesinde değil.
   */
  maxInstances: 1,

  logLevel: (process.env.E2E_LOG_LEVEL as WebdriverIO.Config['logLevel']) ?? 'info',
  outputDir: artifact('wdio'),
  bail: 0,
  waitforTimeout: 15_000,
  waitforInterval: 300,
  // WDA'nın ilk derlemesi ~4 dk sürebiliyor.
  connectionRetryTimeout: 300_000,
  connectionRetryCount: 2,

  services: [
    [
      'appium',
      {
        args: {
          address: '127.0.0.1',
          port: 4723,
          relaxedSecurity: true,
          allowInsecure: ['simulator_video_recording'],
        },
        logPath: artifact('appium'),
      },
    ],
  ],

  reporters: [
    'spec',
    ['allure', { outputDir: artifact('allure'), disableWebdriverStepsReporting: false }],
    ['junit', { outputDir: artifact('junit') }],
  ],

  mochaOpts: {
    ui: 'bdd',
    // Kayıt akışı spec'i tek başına ~4 dk; @fresh uninstall + boot payı var.
    timeout: 600_000,
  },

  capabilities: [IOS_CAPABILITIES],

  // ── Kancalar ────────────────────────────────────────────────────────────

  onPrepare: async () => {
    ensureArtifactDirs();

    // SEED PROTOKOLÜ: koşunun İLK satırı tekrar üretme bilgisini taşımak
    // zorunda. Başarısızlıkta kullanıcı buraya bakıp birebir aynı koşuyu
    // tekrar üretebiliyor.
    const banner =
      `\n[e2e] suite=${SUITE} seed=${SEED} runId=${RUN_ID} lang=${LANG}\n` +
      `[e2e] api=${API_BASE_URL}\n` +
      `[e2e] device=${DEVICE_NAME} ${PLATFORM_VERSION} (${DEVICE_UDID})\n` +
      `[e2e] izin profili=${PERMISSION_PROFILE}\n` +
      `[e2e] tekrar: E2E_SEED=${SEED} E2E_RUN_ID=${RUN_ID} E2E_SUITE=${SUITE} npm run e2e\n`;
    process.stdout.write(banner);
    writeFileSync(artifact('run.json'), JSON.stringify({ suite: SUITE, seed: SEED, runId: RUN_ID, api: API_BASE_URL, startedAt: runStartedAt }, null, 2));

    // SIRA KRİTİK: boot → bootstatus → privacy → location → addmedia.
    // `privacy` ve `location` SpringBoard ayakta değilken sessizce etkisiz.
    bootDevice();
    preparePrivacy(PERMISSION_PROFILE);
    // Konum ZORUNLU: getCurrentPositionAsync timeout'suz, konumsuz simülatörde
    // kayıt Step9 sonsuza asılıyor.
    setLocation();
    const photos = seedPhotoLibrary();
    process.stdout.write(`[e2e] galeri tohumu: ${photos} fotoğraf\n`);
  },

  beforeSession: (_cfg, _caps, specs) => {
    const file = specs[0] ?? 'session';
    startLogStream(file);
    startVideo(file);
    currentVideo = null;
  },

  afterTest: async (test, _ctx, result) => {
    if (result.passed) return;
    const name = `${test.parent} ${test.title}`.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    await browser.saveScreenshot(artifact('shots', `${name}.png`)).catch(() => {});
  },

  afterSession: (_cfg, _caps, specs) => {
    const path = stopVideo();
    stopLogStream();
    // Başarılı spec'in videosu silinir — nightly'de 25 × 40 MB tutmak anlamsız.
    // `currentVideo` null bırakılırsa (yani hiç hata işaretlenmediyse) atılıyor.
    if (path && !currentVideo) discardVideo(path);
    void specs;
  },

  afterHook: (_test, _ctx, result) => {
    if (!result.passed) currentVideo = 'keep';
  },

  // Bir test düşerse videoyu TUT.
  after: () => {
    assertNoFatals();
  },

  onComplete: () => {
    process.stdout.write(`\n[e2e] artefaktlar: ${ARTIFACTS}\n`);
  },
};

/** Test düşünce videoyu saklamak için spec'lerin çağırabileceği kanca. */
export function keepVideo(): void {
  currentVideo = 'keep';
}
