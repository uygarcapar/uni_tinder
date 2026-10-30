/**
 * Tek seferlik kurulum + ÖN KOŞUL DOĞRULAMASI. `npm run e2e:setup`.
 *
 * Felsefe: backend ön koşulları karşılanmıyorsa **SETUP kırılsın, testler
 * değil**. Aksi halde `INVALID_DOMAIN` ya da boş kampüs poligonu yüzünden
 * onlarca spec anlamsız biçimde kırmızıya düşer ve sebebi görünmez olur.
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  API_BASE_URL,
  EMAIL_DOMAIN,
  REPO_ROOT,
  artifact,
  ensureArtifactDirs,
} from './env';
import { API_ENDPOINTS } from '@/shared/constants/api';

/**
 * xcuitest driver DOĞRULAMASI — kurulum değil.
 *
 * Appium 2.x, `node_modules` içindeki driver'ları KENDİSİ keşfediyor; paket
 * `devDependencies`te olduğu sürece ayrı bir `appium driver install` adımı
 * GEREKMİYOR.
 *
 * ⚠️ Üstelik o adım AKTİF ZARARLI: `--source=npm appium-xcuitest-driver`
 * sürümsüz çağrıldığında npm'deki EN SON sürümü (appium 3 isteyen) çekmeye
 * çalışıp "server version it requires (^3.0.0-rc.2)" ile patlıyor. Burada
 * yapılacak tek doğru şey varlığı ve uyumluluğu doğrulamak.
 */
function verifyDriver(): void {
  const appiumBin = resolve(REPO_ROOT, 'node_modules/.bin/appium');
  if (!existsSync(appiumBin)) {
    throw new Error('appium kurulu değil. Önce: npm i -D appium appium-xcuitest-driver');
  }
  // ⚠️ `appium driver list` ilerleme ve sonucu STDERR'e yazıyor; yalnız
  // stdout okumak BOŞ string veriyor ve "driver yok" sanılıyor. İki akım da
  // birleştirilmek zorunda.
  const combined = execSync(`"${appiumBin}" driver list --installed 2>&1`, {
    encoding: 'utf8',
  });
  if (!/xcuitest/.test(combined)) {
    throw new Error(
      'xcuitest driver bulunamadı.\n' +
        '  Appium node_modules\'ı tarıyor — paketin kurulu olması yeterli:\n' +
        '    npm i -D appium-xcuitest-driver@^9\n' +
        `  Mevcut çıktı: ${combined.trim()}`
    );
  }
  // ANSI renk kodları ayıklanıyor: `appium driver list` çıktısı renkli ve
  // sürüm sayısı kaçış dizilerinin arasında kalıyor. (Kontrol karakteri
  // regex'i yerine kod noktasıyla kurulan sınıf — ESLint no-control-regex.)
  const plain = combined.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
  const version = /xcuitest@([\d.]+)/.exec(plain)?.[1];
  console.log(`[setup] xcuitest driver hazır${version ? ` (${version})` : ''}`);
}

/** `/api/common/*` ve `/api/campus/boundary` ANONİM — token gerekmiyor. */
async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} → HTTP ${res.status}`);
  }
  return res.json();
}

/** ResponseDto sarmalı: bazı uçlar `{result:[…]}`, bazıları doğrudan dizi. */
function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const r = (payload as { result?: unknown })?.result;
  if (Array.isArray(r)) return r;
  if (Array.isArray((r as { items?: unknown })?.items)) {
    return (r as { items: unknown[] }).items;
  }
  return [];
}

async function verifyEmailDomain(): Promise<void> {
  const list = unwrapList(await getJson(API_ENDPOINTS.GET_UNIVERSITIES));
  const blob = JSON.stringify(list).toLowerCase();
  if (!blob.includes(EMAIL_DOMAIN.toLowerCase())) {
    throw new Error(
      `ÖN KOŞUL: "${EMAIL_DOMAIN}" desteklenen üniversite alan adları arasında yok.\n` +
        `  Kayıt Step1 bu alan adına INVALID_DOMAIN / UNSUPPORTED_UNIVERSITY döner ve\n` +
        `  bütün kayıt akışı spec'leri anlamsız biçimde kırılır.\n` +
        `  ${list.length} üniversite döndü — E2E_EMAIL_DOMAIN'i düzelt ya da backend'e ekle.`
    );
  }
  console.log(`[setup] e-posta alan adı destekli: ${EMAIL_DOMAIN}`);
}

/**
 * Kampüs poligonunun merkezini çeker ve diske yazar.
 *
 * Hem `simctl location set` hem botların `Latitude/Longitude`'u BU noktayı
 * kullanmak zorunda: aksi halde moment POST'u UT-7410 (kampüs dışı) alır ve
 * mesafe filtresi katı olduğu için keşif destesi de boş gelir.
 *
 * `polygon: null` bir HATA DEĞİL — "bu kampüste henüz yok" demek (kapsam
 * kademeli toplanıyor). O durumda kampüs spec'leri atlanıyor.
 */
/**
 * Kampüs poligonunun merkezi.
 *
 * ⚠️ `/api/campus/boundary` ANONİM DEĞİL — 401 dönüyor (2026-10-29 ölçüldü;
 * istemcideki not onu diğer `/api/common/*` uçları gibi varsayıyordu).
 * Bu yüzden nokta burada DEĞİL, tohumlayıcıda bir bot token'ıyla çözülüyor
 * (`seed/interactions.ts > resolveCampusFix`). Burada yalnız durum raporlanıyor
 * ki "kampüs sabiti neden yok" sorusu setup çıktısında cevaplı kalsın.
 */
async function probeCampusBoundary(): Promise<void> {
  try {
    const payload = await getJson(API_ENDPOINTS.CAMPUS_BOUNDARY(EMAIL_DOMAIN));
    const result = (payload as { result?: Record<string, unknown> })?.result ?? {};
    const polygon = result.polygon as unknown[] | null;
    if (!polygon || polygon.length < 3) {
      console.log(
        `[setup] ⚠️ ${EMAIL_DOMAIN} için poligon yok — kampüs senaryoları atlanacak ` +
          '(kapsam kademeli, hata değil).'
      );
      writeFileSync(
        artifact('campus-fix.json'),
        JSON.stringify({ enabled: false, reason: 'no-polygon' }, null, 2)
      );
      return;
    }
    const pts = polygon as Array<{ latitude: number; longitude: number }>;
    const lat = pts.reduce((s, q) => s + q.latitude, 0) / pts.length;
    const lon = pts.reduce((s, q) => s + q.longitude, 0) / pts.length;
    writeFileSync(
      artifact('campus-fix.json'),
      JSON.stringify({ enabled: true, lat, lon, vertices: pts.length }, null, 2)
    );
    console.log(`[setup] kampüs sabiti: ${lat.toFixed(6)},${lon.toFixed(6)}`);
  } catch (err) {
    const unauthorized = String(err).includes('401');
    console.log(
      unauthorized
        ? '[setup] kampüs sınırı token istiyor (401) — nokta tohumlama sırasında çözülecek.'
        : `[setup] ⚠️ kampüs sınırı alınamadı (${String(err)}) — kampüs senaryoları atlanacak.`
    );
    writeFileSync(
      artifact('campus-fix.json'),
      JSON.stringify(
        { enabled: false, reason: unauthorized ? 'needs-token' : 'unreachable' },
        null,
        2
      )
    );
  }
}

async function main(): Promise<void> {
  ensureArtifactDirs();
  verifyDriver();
  console.log(`[setup] backend: ${API_BASE_URL}`);
  await verifyEmailDomain();
  await probeCampusBoundary();
  console.log('[setup] tamam.');
}

void main().catch((err) => {
  console.error(`\n[setup] BAŞARISIZ\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
