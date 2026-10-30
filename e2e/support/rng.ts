/**
 * Tohumlu rastgelelik — mulberry32.
 *
 * `Math.random` YASAK: maymun koşusunun tekrar üretilebilir olması gerekiyor.
 * Başarısızlıkta hata mesajının ilk satırı tam olarak aynı diziyi üreten
 * komutu veriyor; bu ancak her rastgele kararın tek bir seed'den türemesiyle
 * mümkün.
 */
export interface Rng {
  /** [0,1) */
  next(): number;
  /** [0,n) tamsayı */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Standart normal (Box–Muller) — insan gecikme modeli için. */
  normal(): number;
  /** Ağırlıklı seçim; toplam ağırlık 0 ise null. */
  weighted<T>(items: ReadonlyArray<{ item: T; weight: number }>): T | null;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (n: number): number => Math.floor(next() * n);

  function pick<T>(items: readonly T[]): T {
    const item = items[int(items.length)];
    if (item === undefined) throw new Error('Boş listeden seçim yapılamaz');
    return item;
  }

  // Box–Muller; u=0 log(0)'a düşeceği için dışlanıyor.
  const normal = (): number => {
    let u = next();
    while (u === 0) u = next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  function weighted<T>(items: ReadonlyArray<{ item: T; weight: number }>): T | null {
    const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
    if (total <= 0) return null;
    let roll = next() * total;
    for (const entry of items) {
      roll -= Math.max(0, entry.weight);
      if (roll <= 0) return entry.item;
    }
    return items[items.length - 1]?.item ?? null;
  }

  return { next, int, pick, normal, weighted };
}
