/**
 * Metro'yu e2e ortamıyla başlatır ve İLK BUNDLE'I ÖN-ISITIR.
 * `npm run e2e:metro` (arka planda bırakılacak).
 *
 * İki şey kritik:
 *
 * 1. `--clear` ZORUNLU. `EXPO_PUBLIC_*` değerleri babel ile bundle'a GÖMÜLÜYOR
 *    ve Metro bunu cache'liyor. Temizlemezsen `.env.e2e`de API URL'ini
 *    değiştirsen bile eski backend'e karşı test edersin.
 *
 * 2. İlk bundle (~60-90 sn) TESTİN İÇİNDE değil BURADA ödeniyor. Aksi halde
 *    ilk spec'in `waitUntilOpen`ı bundle süresini bekler ve zaman aşımı
 *    hatasını animasyon/seçici hatasıyla karıştırırsın.
 *
 * Not: top-level await YOK — kök package.json'da `"type": "module"` olmadığı
 * için tsx bu dosyayı CJS'e derliyor.
 */
import { spawn } from 'node:child_process';
import { API_BASE_URL, METRO_URL, REPO_ROOT } from './env';

const PORT = new URL(METRO_URL).port || '8081';

async function reachable(url: string, timeoutMs = 2_000): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntil(fn: () => Promise<boolean>, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`${what} ${ms} ms içinde hazır olmadı`);
}

async function main(): Promise<void> {
  if (await reachable(`${METRO_URL}/status`)) {
    console.log(`[metro] ${METRO_URL} zaten ayakta.`);
    console.log(
      '[metro] ⚠️ Bu Metro .env.e2e ile başlatılmamış olabilir; bundle içindeki' +
        " EXPO_PUBLIC_API_BASE_URL yanlışsa testler yanlış backend'e gider."
    );
    console.log('[metro] Şüphede kal: o process\'i kapat, bu betiği tekrar çalıştır.');
    return;
  }

  console.log(`[metro] başlatılıyor — api=${API_BASE_URL}`);

  const child = spawn('npx', ['expo', 'start', '--dev-client', '--clear', '--port', PORT], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    // env.ts `loadDotenv({ override: true })` ile process.env'i e2e
    // değerleriyle doldurdu; Expo CLI set edilmiş env'i EZMİYOR → bundle e2e
    // ortamını alıyor.
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));

  await waitUntil(() => reachable(`${METRO_URL}/status`), 120_000, 'Metro');
  console.log('[metro] ayakta — ilk bundle ısıtılıyor (60-90 sn sürebilir)…');

  const t0 = Date.now();
  const res = await fetch(`${METRO_URL}/index.bundle?platform=ios&dev=true&minify=false`);
  if (!res.ok) throw new Error(`Bundle ısıtma başarısız: HTTP ${res.status}`);
  const bytes = (await res.arrayBuffer()).byteLength;
  console.log(
    `[metro] bundle hazır: ${(bytes / 1_048_576).toFixed(1)} MB,` +
      ` ${((Date.now() - t0) / 1000).toFixed(0)} sn`
  );
  console.log("[metro] açık bırak — testler bu process'e bağlı.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
