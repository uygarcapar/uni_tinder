/**
 * E2E SEÇİCİ KAPSAMA ÇİTİ.
 *
 * Yakaladığı hata gerçek ve sinsi: e2e bir `~seçici`ye atıfta bulunuyor ama
 * ürün tarafında o `testID` yok (hiç eklenmemiş ya da yeniden adlandırılmış).
 * O durumda Appium elemanı bulamıyor, maymun `noop` döndürüyor ve koşu
 * **yeşil kalıyor** — yani test hiçbir şey yapmadan "geçiyor".
 *
 * Bu kontrol jest'te koşuyor: Linux'ta, simülatörsüz, saniyeler içinde.
 * Gerçek e2e koşusu macOS runner'da 10× faturalanıyor; aynı hatayı orada
 * keşfetmek pahalı ve geç.
 *
 * ⚠️ Bu test KAYNAK METNİ okuyor, uygulamayı render etmiyor. Dinamik
 * seçiciler (`testID={`msgs-row-${id}`}`) ÖNEK olarak eşleşiyor.
 *
 * ⚠️ SINIRI: yalnız seçicisi DÜZ METİN olarak yazılmış çağrıları görüyor.
 * `tapIfPresent(cond ? 'a' : 'b')` gibi hesaplanmış argümanlar taramadan
 * kaçıyor — nitekim `likes.quickDecide` böyle yazılmıştı ve yanlış bir ön eki
 * aylarca sessizce taşıyabilirdi. Kural: e2e'de seçici argümanı HER ZAMAN
 * düz metin olsun, dallanma çağrının DIŞINDA yapılsın.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');

/** Blok ve satır yorumlarını siler — seçici taraması koda baksın, prose'a değil. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (ext.test(name)) out.push(full);
  }
  return out;
}

/** e2e'nin ATIFTA BULUNDUĞU seçiciler. */
function usedSelectors(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const add = (sel: string, file: string): void => {
    const list = used.get(sel) ?? [];
    if (!list.includes(file)) list.push(file);
    used.set(sel, list);
  };

  for (const file of walk(join(ROOT, 'e2e'), /\.ts$/)) {
    const rel = file.slice(ROOT.length + 1);
    // ⚠️ YORUMLAR AYIKLANIYOR ve BACKTICK seçici tırnağı SAYILMIYOR.
    // İkisi de yanlış pozitif kaynağıydı: dokümantasyonda `~id` diye geçen
    // prose, "üründe ~id yok" hatası üretiyordu. Gerçek şablon seçiciler
    // zaten `~${...}` biçiminde, yani düz metin olarak eşleşmezler.
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/['"]~([a-z][a-z0-9-]*)['"]/g)) add(m[1]!, rel);
    for (const m of source.matchAll(
      /(?:idOf|tapIfPresent|this\.tap|this\.el)\(\s*['"`]([a-z][a-z0-9-]*)['"`]/g
    )) {
      add(m[1]!, rel);
    }
    for (const m of source.matchAll(
      /(?:idsWithPrefix|tapRandomWithPrefix)\(\s*['"`]([a-z][a-z0-9-]*-?)['"`]/g
    )) {
      add(m[1]!, rel);
    }
  }
  return used;
}

/** Üründe TANIMLI testID'ler: sabitler + şablon önekleri. */
function definedSelectors(): { exact: Set<string>; prefixes: Set<string> } {
  const exact = new Set<string>();
  const prefixes = new Set<string>();

  for (const file of walk(join(ROOT, 'src'), /\.tsx?$/)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/testID=["']([a-z][a-z0-9-]*)["']/g)) exact.add(m[1]!);
    for (const m of source.matchAll(/testID:\s*["']([a-z][a-z0-9-]*)["']/g)) exact.add(m[1]!);
    // SwiftUI cam butonlar: modifier zinciri üzerinden.
    for (const m of source.matchAll(/a11yIdentifier\(["']([a-z][a-z0-9-]*)["']\)/g)) {
      exact.add(m[1]!);
    }
    // Dinamik: testID={`msgs-row-${...}`} → önek.
    for (const m of source.matchAll(/testID=\{`([a-z][a-z0-9-]*-)\$\{/g)) prefixes.add(m[1]!);
  }
  return { exact, prefixes };
}

describe('e2e seçici kapsaması', () => {
  const used = usedSelectors();
  const { exact, prefixes } = definedSelectors();

  const isCovered = (sel: string): boolean => {
    if (exact.has(sel)) return true;
    // Önek atfı: `idsWithPrefix('msgs-row-')` ↔ testID={`msgs-row-${id}`}
    if (prefixes.has(sel)) return true;
    // Tam seçici bir şablondan geliyor olabilir: `feed-card-like-3` ← `feed-card-like-`
    if ([...prefixes].some((p) => sel.startsWith(p))) return true;
    // Kullanılan önek, tanımlı önekten KISA olabilir:
    // `plan-` ↔ testID={`plan-card-${period}`}
    if (sel.endsWith('-') && [...prefixes].some((p) => p.startsWith(sel))) return true;
    if (sel.endsWith('-') && [...exact].some((e) => e.startsWith(sel))) return true;
    return false;
  };

  it('e2e en az 20 seçiciye atıfta bulunuyor (kontrolün kendisi çalışıyor mu)', () => {
    // Regex'ler bozulursa `used` boşalır ve test sessizce "her şey kapsanmış"
    // derdi. Bu iddia o yanlış yeşili engelliyor.
    expect(used.size).toBeGreaterThanOrEqual(20);
    expect(exact.size).toBeGreaterThanOrEqual(50);
  });

  it('e2e\'nin kullandığı her seçicinin üründe karşılığı var', () => {
    const missing = [...used.entries()]
      .filter(([sel]) => !isCovered(sel))
      .map(([sel, files]) => `  ✖ ~${sel}  ←  ${files.join(', ')}`);

    expect(
      missing.length === 0
        ? ''
        : `e2e şu seçicilere atıfta bulunuyor ama üründe yoklar:\n${missing.join('\n')}\n\n` +
          'Appium bunları bulamaz: eylem sessizce atlanır ve koşu YEŞİL kalır.\n' +
          'Ya ürün tarafına testID ekle ya da e2e seçicisini düzelt.'
    ).toBe('');
  });
});
