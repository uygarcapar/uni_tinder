import { glowFromPixels } from '@/features/campus/campusPhotoGlow';

/**
 * FOTOĞRAFIN GÖLGE RENGİ — saf kısım (Skia yalnız bayt üretiyor, karar burada).
 *
 * İstek: "arkadaki gölge temaya göre değil fotonun renklerine göre olsun."
 *
 * ⚠️🔴 ÇİVİLENEN ASIL ŞEY DÜZ ORTALAMA OLMADIĞI: bir fotoğrafın çoğu gri
 * (asfalt, duvar, gökyüzü) ve düz ortalama HER kartı aynı çamur griye
 * düşürür — yani özellik sessizce ölür, kimse "renk yanlış" demez çünkü
 * hepsi aynı tonda olur.
 */

/** `n` piksellik RGBA tamponu — hepsi aynı renk. */
const solid = (r: number, g: number, b: number, n = 16, a = 255): Uint8Array => {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** "#rrggbb" → hangi kanal baskın. */
const channels = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

describe('glowFromPixels', () => {
  it('düz kırmızı fotoğraf KIRMIZI hâle veriyor', () => {
    const { r, g, b } = channels(glowFromPixels(solid(220, 30, 30))!);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('⚠️ AZINLIKTAKİ DOYGUN RENK kazanıyor — gri çoğunluk bastırmıyor', () => {
    // 15 gri piksel + 1 doygun mavi: düz ortalama griyi verirdi.
    const mixed = concat(solid(130, 130, 130, 15), solid(20, 60, 230, 1));
    const { r, g, b } = channels(glowFromPixels(mixed)!);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it('ÇOK KOYU pikseller tonu belirlemiyor — gölge görünmez olmasın', () => {
    // Neredeyse siyah bir "kırmızı" + az sayıda parlak yeşil.
    const mixed = concat(solid(12, 0, 0, 15), solid(40, 220, 90, 1));
    const { r, g, b } = channels(glowFromPixels(mixed)!);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('SİYAH-BEYAZ fotoğrafta yedek düz ortalama — gölge yine var', () => {
    const grey = glowFromPixels(solid(150, 150, 150));
    expect(grey).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('koyu fotoğrafın hâlesi KARARMIYOR — parlaklık tabanı var', () => {
    const { r, g, b } = channels(glowFromPixels(solid(40, 10, 10))!);
    expect(Math.max(r, g, b)).toBeGreaterThan(150);
  });

  it('piksel yoksa / hepsi saydamsa `null` — çağıran yedeğine düşüyor', () => {
    expect(glowFromPixels(null)).toBeNull();
    expect(glowFromPixels(new Uint8Array([]))).toBeNull();
    expect(glowFromPixels(solid(200, 10, 10, 8, 0))).toBeNull();
  });
});
