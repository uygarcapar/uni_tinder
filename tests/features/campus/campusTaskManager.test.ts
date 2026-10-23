/**
 * ⚠️ `fs`/`path` TİP TANIMI OLMADAN kullanılıyor: projede `@types/node` yok ve
 * `tsconfig.types` yalnız `["jest"]`. Node modülleri `require` ile alınıyor —
 * jest ortamında çalışıyor, tsc de şikâyet etmiyor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync, readdirSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
  readdirSync: (
    p: string,
    o: { withFileTypes: true },
  ) => { name: string; isDirectory: () => boolean }[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * `expo-task-manager` STATİK IMPORT EDİLMEMELİ — bu kural bir kez kırıldı ve
 * uygulamayı açılışta çökertti.
 *
 * ── Ne olmuştu ─────────────────────────────────────────────────────────────
 * `expo-task-manager/build/ExpoTaskManager.js` modül kapsamında
 * `requireNativeModule('ExpoTaskManager')` çağırıyor. Native modül binary'de
 * yoksa (paket package.json'a eklendi ama dev-client build'i hâlâ eski) hata
 * **import anında** oluşuyor — `defineTask` çevresindeki try/catch bunu
 * yakalayamıyor.
 *
 * `index.js` o modülü import ettiği için bundle değerlendirmesi patlıyor,
 * React Native yeniden yüklüyor ve o reload yarışı reanimated'ın
 * `installTurboModule`'ünü surface presenter hazır değilken yakalıyor:
 *
 *     react_native_assert(scheduler != nil && "_surfacePresenter.scheduler is nil")
 *     com.facebook.react.runtime.JavaScript: signal SIGABRT
 *
 * Belirti "reanimated çöküyor" gibi görünüyordu; suçlu tek bir import satırıydı.
 *
 * ── Neden mock'la değil KAYNAKLA test ediliyor ─────────────────────────────
 * Fırlatan bir `jest.mock` kurmak expo'nun winter runtime'ını (global `fetch`
 * kurucusu) tetikleyip test ortamını çökertiyor. Korunması gereken şey zaten
 * bir ÇALIŞMA ZAMANI davranışı değil, bir KAYNAK KURALI: erişim tembel olmalı.
 */

/** Repo kökü — `__dirname` tipli değil, `process.cwd()` jest'te repo kökü. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOT: string = (require('process') as { cwd: () => string }).cwd();
const CAMPUS_DIR = join(ROOT, 'src/features/campus');

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('expo-task-manager erişimi', () => {
  const files = collectSourceFiles(CAMPUS_DIR);

  it('kampüs klasöründe dosya bulundu (test boşa koşmasın)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('hiçbir dosya STATİK import etmiyor', () => {
    const offenders = files.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return /^\s*import[^\n]*['"]expo-task-manager['"]/m.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('erişim yalnız campusTaskManager içinden ve try/catch ile', () => {
    const users = files.filter((file) =>
      /require\(['"]expo-task-manager['"]\)/.test(readFileSync(file, 'utf8')),
    );
    expect(users.map((f) => f.split('/').pop())).toEqual([
      'campusTaskManager.ts',
    ]);

    const src = readFileSync(join(CAMPUS_DIR, 'campusTaskManager.ts'), 'utf8');
    // require try bloğunun İÇİNDE olmalı.
    const tryIndex = src.indexOf('try {');
    const requireIndex = src.indexOf('require("expo-task-manager")');
    const catchIndex = src.indexOf('} catch');
    expect(tryIndex).toBeGreaterThan(-1);
    expect(requireIndex).toBeGreaterThan(tryIndex);
    expect(catchIndex).toBeGreaterThan(requireIndex);
  });

  it('index.js kampüs görevini import ediyor (headless kaydı için şart)', () => {
    // Görev tanımı `App.tsx`te OLAMAZ: işletim sistemi bölge olayında
    // uygulamayı headless başlatıyor ve React ağacı hiç mount edilmiyor.
    const indexSrc = readFileSync(join(ROOT, 'index.js'), 'utf8');
    expect(indexSrc).toContain('campusGeofenceTask');
  });
});
