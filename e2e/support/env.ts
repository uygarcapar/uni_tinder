/**
 * ORTAM — her şeyden ÖNCE import edilmek zorunda.
 *
 * `@/shared/constants/api` modülü, import ANINDA `EXPO_PUBLIC_API_BASE_URL`
 * yoksa throw ediyor (src/shared/constants/api.ts:3-7). e2e tarafı uç
 * listesini (API_ENDPOINTS) o modülden aldığı için, dotenv bu import'tan önce
 * yüklenmiş olmak zorunda. Bu yüzden `wdio.conf.ts`in İLK satırı
 * `import './support/env'`.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Repo kökü `process.cwd()`den geliyor, `import.meta.url`den DEĞİL.
 *
 * Sebep: kök package.json'da `"type": "module"` yok, yani tsx bu .ts
 * dosyalarını CJS'e derliyor ve CJS çıktısında `import.meta` boş bir nesneye
 * düşüyor (esbuild uyarı verip geçiyor) — yol sessizce `/` olurdu.
 * Bütün e2e komutları npm script olarak kökten koşuyor; cwd güvenilir, ama
 * yine de doğrulanıyor.
 */
export const REPO_ROOT = process.cwd();
export const E2E_ROOT = resolve(REPO_ROOT, 'e2e');

{
  const pkg = resolve(REPO_ROOT, 'package.json');
  const looksRight =
    existsSync(pkg) &&
    (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name === 'uni_tinder';
  if (!looksRight) {
    throw new Error(
      `e2e komutları repo kökünden koşmak zorunda (şu an: ${REPO_ROOT}).\n` +
        `  cd ${resolve(REPO_ROOT)} && npm run e2e:…`
    );
  }
}

const ENV_FILE = resolve(E2E_ROOT, '.env.e2e');

if (!existsSync(ENV_FILE)) {
  throw new Error(
    `e2e/.env.e2e bulunamadı.\n` +
      `  cp e2e/.env.e2e.example e2e/.env.e2e\n` +
      `ve EXPO_PUBLIC_API_BASE_URL + E2E_UDID değerlerini doldur.`
  );
}

// `override: true` BİLEREK: kabuğunda kök .env'den kalmış bir
// EXPO_PUBLIC_API_BASE_URL varsa e2e onu EZMEK zorunda, yoksa testler sessizce
// yanlış backend'e gider.
loadDotenv({ path: ENV_FILE, override: true, quiet: true });

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} e2e/.env.e2e içinde tanımlı değil.`);
  return v;
}

function optional(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

export const API_BASE_URL = required('EXPO_PUBLIC_API_BASE_URL').replace(/\/+$/, '');

export const BUNDLE_ID = optional('E2E_BUNDLE_ID', 'com.uygarcapar.lit');
export const DEVICE_NAME = optional('E2E_DEVICE', 'iPhone 17 Pro');
export const PLATFORM_VERSION = optional('E2E_IOS', '26.1');
export const DEVICE_UDID = required('E2E_UDID');

/** Kayıt/şifre/e-posta kodu akışlarının DEV bypass'ı. Koda GÖMÜLMÜYOR. */
export const DEV_OTP = optional('E2E_DEV_OTP', '080539');
export const EMAIL_DOMAIN = optional('E2E_EMAIL_DOMAIN', 'bilgiedu.net');

/**
 * Simülatörün ve botların PAYLAŞTIĞI koordinat.
 *
 * Mesafe filtresi katı ve yeni hesap free yarıçapla başlıyor: botlar uzakta
 * olursa deste boş gelir ve bütün Keşif spec'leri anlamsızca kırılır. Tek bir
 * nokta iki tarafa da gidiyor.
 */
export const E2E_LAT = Number(optional('E2E_LAT', '41.0082'));
export const E2E_LON = Number(optional('E2E_LON', '28.9784'));

export const LANG: 'tr' | 'en' = optional('E2E_LANG', 'tr') === 'en' ? 'en' : 'tr';
export const BOT_COUNT = Number(optional('E2E_BOT_COUNT', '6'));

/** Maymun katmanının seed'i. Boşsa üretilir ve HER koşunun ilk satırına basılır. */
export const SEED = Number(optional('E2E_SEED', String(Date.now() & 0x7fffffff)));

export const RUN_ID = optional(
  'E2E_RUN_ID',
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : String(Date.now())
);

export const ARTIFACTS = resolve(E2E_ROOT, '.artifacts');
export const FIXTURES = resolve(E2E_ROOT, 'fixtures');

export const APP_PATH = optional(
  'E2E_APP_PATH',
  resolve(ARTIFACTS, 'build/Build/Products/Debug-iphonesimulator/Lit.app')
);

export const METRO_URL = optional('E2E_METRO_URL', 'http://127.0.0.1:8081');

/** Artefakt alt dizinleri — her koşuda var olduğu garanti edilir. */
export function ensureArtifactDirs(): void {
  for (const d of ['shots', 'logs', 'appium', 'trees', 'video', 'monkey', 'allure', 'junit']) {
    mkdirSync(resolve(ARTIFACTS, d), { recursive: true });
  }
}

export const artifact = (...parts: string[]): string => resolve(ARTIFACTS, ...parts);

/**
 * Akış (feed) sekmesi bu oturumda çizilecek mi?
 *
 * Kaynağı ürünün kendi DEV kancası: features/feed/feedDevFlag.ts içindeki
 * DEV_FORCE_FEED_TAB. Debug build'de koşuyoruz, yani `__DEV__` true ve o sabit
 * açıkken sekme çiziliyor. Buradan türetilen tek şey tab bar'ın İNDEKS haritası
 * (Nav.tabIndex) ve akış spec'lerinin skip kararı — e2e sabiti DEĞİŞTİRMİYOR.
 *
 * `E2E_FEED_TAB` ile elle ezilebilir (backend bayrağı kapalıyken sekme çizili
 * olsa bile veri gelmiyorsa bu bayrağı 0 yapmak spec'leri atlatır).
 */
export function feedExpectedInSession(): boolean {
  const override = process.env.E2E_FEED_TAB;
  if (override === '0' || override === 'false') return false;
  if (override === '1' || override === 'true') return true;
  return true;
}
