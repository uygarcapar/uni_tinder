import {
  BURN_CONTOUR_POINTS,
  BURN_FLICKER_FRAMES,
  BURN_PAD_RATIO,
  buildBurnContour,
  burnDisplacement,
  burnPolygon,
} from "@/features/discover/components/flameBurn";
import { FLAME_GLYPH } from "@/shared/components/icons/FlameGlyph";

/**
 * Gerçek glyph yerine ONUN KUTUSU kadar bir elips: testler pencere/sapma
 * mantığını ölçüyor, alevin bezier'ini değil. Elips hem analitik (her nokta
 * nerede, biliniyor) hem de dış bükey — normallerin dışarı bakması gözle
 * doğrulanabiliyor.
 */
function ellipseRing(n = BURN_CONTOUR_POINTS) {
  const rx = FLAME_GLYPH.width / 2;
  const ry = FLAME_GLYPH.height / 2;
  const cy = FLAME_GLYPH.bottom - ry;
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    // Saat yönünde: ekran koordinatlarında (y aşağı) SVG glyph'lerinin dış
    // halkasıyla aynı sarım.
    const a = (i / n) * Math.PI * 2;
    ring.push([FLAME_GLYPH.cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return ring;
}

const PHASES = Array.from({ length: 40 }, (_, i) => i / 40);
/** Yay uzunluğu ekseninde ince tarama — pencerenin sınırlarını yakalamak için. */
const ARCS = Array.from({ length: 200 }, (_, i) => i / 200);

describe("buildBurnContour", () => {
  const c = buildBurnContour(ellipseRing());

  it("normaller DIŞARI bakıyor ve birim uzunlukta", () => {
    // Ters bakan normalde sapma da tersine döner: dalga dışarı değil içeri
    // çalışır ve ikon sessizce kendi içine göçer.
    const cy = FLAME_GLYPH.bottom - FLAME_GLYPH.height / 2;
    for (let i = 0; i < c.n; i++) {
      expect(Math.hypot(c.nx[i], c.ny[i])).toBeCloseTo(1, 6);
      const vx = c.x[i] - FLAME_GLYPH.cx;
      const vy = c.y[i] - cy;
      expect(c.nx[i] * vx + c.ny[i] * vy).toBeGreaterThan(0);
    }
  });

  it("sarım ters çevrilince de dışarı bakıyor", () => {
    const flipped = buildBurnContour([...ellipseRing()].reverse());
    const cy = FLAME_GLYPH.bottom - FLAME_GLYPH.height / 2;
    for (let i = 0; i < flipped.n; i++) {
      const vx = flipped.x[i] - FLAME_GLYPH.cx;
      const vy = flipped.y[i] - cy;
      expect(flipped.nx[i] * vx + flipped.ny[i] * vy).toBeGreaterThan(0);
    }
  });

  it("yay uzunluğu 0..1 arası ve eşit aralıklı", () => {
    // Pencere yay uzunluğuyla tanımlı (bkz. WAVE_CENTER/WAVE_HALF); örnekleme
    // eşit aralıklı değilse pencere şeklin başka bir yerine denk gelir.
    expect(c.s[0]).toBe(0);
    expect(c.s[c.n - 1]).toBeCloseTo(1 - 1 / c.n, 9);
    for (let i = 1; i < c.n; i++) {
      expect(c.s[i] - c.s[i - 1]).toBeCloseTo(1 / c.n, 9);
    }
  });

  it("boş halkayla çökmüyor", () => {
    // Glyph ayrıştırılamazsa canvas boş bir konturla kalıyor (bkz.
    // FireBurnCanvas); o yol bir istisna fırlatırsa kart komple düşer.
    const blank = buildBurnContour([]);
    expect(blank.n).toBe(0);
    expect(burnPolygon(blank, 0.4, 1)).toEqual([]);
  });
});

describe("burnDisplacement", () => {
  it("ısı 0'da hiçbir yerde sapma yok — silüet ikonun kendisi", () => {
    // Dinlenen kartın ikonu markanın ta kendisi olmak zorunda.
    for (const phase of PHASES) {
      for (const s of ARCS) {
        expect(burnDisplacement(s, phase, 0)).toBe(0);
      }
    }
  });

  it("TABAN hiç kıpırdamıyor — ikon köşe boşluğunda kaymıyor", () => {
    // Ateş oturduğu yerden yanmaz. Taban oynarsa ikon köşe boşluğunun içinde
    // kayıyor ve cam ikizinin merkeziyle ayrışıyor (bkz. FIRE_INSET).
    // Alevin dibi yay uzunluğunun %40–%68'i (düğüm 9–13, `--nodes` çıktısı).
    for (const phase of PHASES) {
      for (const s of ARCS) {
        if (s >= 0.4 && s <= 0.68) {
          expect(burnDisplacement(s, phase, 1)).toBe(0);
        }
      }
    }
  });

  it("oynayan bölge dış hattın TAMAMI değil", () => {
    // İkona bir şey EKLENMİYOR, ikonun kendi kıvrımları oynuyor. Pencereler
    // bütün kontura yayılırsa "kıvrımlar dalgalanıyor" değil "ikon deforme
    // oluyor" olur.
    const moving = new Set<number>();
    for (const phase of PHASES) {
      ARCS.forEach((s, i) => {
        if (Math.abs(burnDisplacement(s, phase, 1)) > 1e-9) moving.add(i);
      });
    }
    expect(moving.size).toBeGreaterThan(0);
    expect(moving.size / ARCS.length).toBeLessThan(0.7);
  });

  it("sapma kontur boyunca SÜREKLİ — pencere kenarında dirsek yok", () => {
    // Pencereler sert kesilseydi her kıvrımın iki ucunda her karede bir köşe
    // belirirdi. Yükseltilmiş kosinüs uçlarda sıfıra indiği için komşu
    // örnekler arasındaki fark küçük kalmalı.
    const fine = Array.from({ length: 2000 }, (_, i) => i / 2000);
    for (const phase of PHASES) {
      let prev = burnDisplacement(fine[fine.length - 1], phase, 1);
      for (const s of fine) {
        const d = burnDisplacement(s, phase, 1);
        expect(Math.abs(d - prev)).toBeLessThan(0.05);
        prev = d;
      }
    }
  });

  it("dalgalar UCA doğru akıyor — iki kenar birbirine ters akmıyor", () => {
    // Yol ucun sağından başlayıp saat yönünde dönüyor: yay uzunluğu SAĞ kenarda
    // aşağı, SOL kenarda yukarı ilerliyor. Hızın işareti tek bırakılırsa bir
    // kenar yukarı diğeri aşağı akar ve hareket "yukarı yalama" değil salınım
    // gibi okunur — alev yerine tomurcuk (bkz. flameBurn > hız işareti notu).
    //
    // Ölçüm: uca YAKIN nokta, uca UZAK noktanın yaptığını GECİKMELİ tekrar
    // etmeli. En iyi eşleşen gecikmenin işareti akış yönünü veriyor.
    //
    // İKİ NOKTA BİRBİRİNE YAKIN OLMAK ZORUNDA. Gezen bir dalga uzayda da
    // periyodik: aralarındaki mesafe dalga boyunun yarısını geçerse gecikme
    // sarıyor ve ters yön okunuyor (ilk yazımda ±0.04'lük aralık tam da buna
    // düştü). ±0.015 ile gecikme her iki pencerede de yarım periyodun altında.
    const series = (arc: number) =>
      PHASES.map((phase) => burnDisplacement(arc, phase, 1));
    const bestLag = (far: number, near: number) => {
      const a = series(far);
      const b = series(near);
      let best = 0;
      let bestScore = -Infinity;
      // Gecikme KARE cinsinden; faz periyodik olduğu için dizi sarılıyor.
      for (let lag = -15; lag <= 15; lag++) {
        let score = 0;
        for (let i = 0; i < a.length; i++) {
          score += a[i] * b[(i + lag + a.length * 2) % a.length];
        }
        if (score > bestScore) {
          bestScore = score;
          best = lag;
        }
      }
      return best;
    };

    // Sağ çentik (merkez 0.29): uca doğru = yay uzunluğu AZALAN yön.
    expect(bestLag(0.305, 0.275)).toBeGreaterThan(0);
    // Sol yanak (merkez 0.77): uca doğru = yay uzunluğu ARTAN yön.
    expect(bestLag(0.755, 0.785)).toBeGreaterThan(0);
  });

  it("sapma İKİ YÖNLÜ — dalga, tek yönlü bir şişme değil", () => {
    let min = Infinity;
    let max = -Infinity;
    for (const phase of PHASES) {
      for (const s of ARCS) {
        const d = burnDisplacement(s, phase, 1);
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
    }
    expect(min).toBeLessThan(-0.5);
    expect(max).toBeGreaterThan(0.5);
  });

  it("ısıyla doğru orantılı ve aralık dışı kırpılıyor", () => {
    const full = burnDisplacement(0.02, 0.3, 1);
    expect(full).not.toBe(0);
    expect(burnDisplacement(0.02, 0.3, 0.5)).toBeCloseTo(full / 2, 9);
    expect(burnDisplacement(0.02, 0.3, 4)).toBeCloseTo(full, 9);
    expect(burnDisplacement(0.02, 0.3, -2)).toBe(0);
  });

  it("faz 1'de diksiz sarıyor — bütün harmonikler tam sayı", () => {
    // Saat `% 1` ile sarılıyor (bkz. SwipeCard). Kesirli bir harmonik eklenirse
    // sarma noktasında silüet sıçrar ve bunu ancak cihazda fark ederiz.
    for (const s of ARCS) {
      expect(burnDisplacement(s, 1, 0.8)).toBeCloseTo(
        burnDisplacement(s, 0, 0.8),
        9,
      );
    }
  });
});

describe("burnPolygon", () => {
  const c = buildBurnContour(ellipseRing());

  it("ısı 0'da nokta nokta dış hattın kendisi", () => {
    for (const phase of PHASES) {
      const poly = burnPolygon(c, phase, 0);
      expect(poly).toHaveLength(c.n);
      poly.forEach((p, i) => {
        expect(p.x).toBeCloseTo(c.x[i], 9);
        expect(p.y).toBeCloseTo(c.y[i], 9);
      });
    }
  });

  it("taban çizgisi kaçmıyor — ikon yerinde duruyor", () => {
    // Büyüme tabandan pivotlu ve yükselme yok: ikon çekme sırasında köşe
    // boşluğunun içinde kaymamalı, yoksa cam ikizinin merkeziyle ayrışıyor.
    const cold = Math.max(...burnPolygon(c, 0, 0).map((p) => p.y));
    for (const phase of PHASES) {
      const hot = Math.max(...burnPolygon(c, phase, 1, 1).map((p) => p.y));
      expect(hot).toBeLessThanOrEqual(cold + 1e-6);
    }
  });

  it("kademeler silüeti gerçekten değiştiriyor", () => {
    // Faz çağıran tarafta BURN_FLICKER_FRAMES adımına yuvarlanıyor; iki komşu
    // adım aynı şekli veriyorsa dalgalanma diye bir şey yok demektir.
    for (let i = 0; i < BURN_FLICKER_FRAMES; i++) {
      const a = burnPolygon(c, i / BURN_FLICKER_FRAMES, 1);
      const b = burnPolygon(c, (i + 1) / BURN_FLICKER_FRAMES, 1);
      const moved = a.reduce(
        (max, p, k) => Math.max(max, Math.hypot(p.x - b[k].x, p.y - b[k].y)),
        0,
      );
      expect(moved).toBeGreaterThan(0.15);
    }
  });

  it("ÜÇ AYRI kıvrım oynuyor — tek bir uzun kenar esmiyor", () => {
    // Bir dönem yalnız kıvrık uç oynuyordu ve "az" bulundu. Pencereler üst üste
    // binerse de bu kez tersi olur: iki komşu kıvrım birlikte esip tek bir uzun
    // kenara dönüşür (bkz. flameBurn > pencere boşluğu notu).
    const hot = new Set<number>();
    for (const phase of PHASES) {
      ARCS.forEach((s, i) => {
        if (Math.abs(burnDisplacement(s, phase, 1)) > 0.05) hot.add(i);
      });
    }
    // Ayrık küme sayısı: sıralı indekslerde boşluk saymak yeterli (halka
    // olduğu için başla son bitişikse tek küme sayılıyor).
    const idx = [...hot].sort((a, b) => a - b);
    let clusters = 0;
    for (let k = 0; k < idx.length; k++) {
      if (k === 0 || idx[k] !== idx[k - 1] + 1) clusters++;
    }
    if (idx.length > 1 && idx[0] === 0 && idx[idx.length - 1] === ARCS.length - 1) {
      clusters--;
    }
    expect(clusters).toBeGreaterThanOrEqual(3);
  });

  it("taşma payı ölçülen tavanın üstünde", () => {
    // BURN_PAD_RATIO canvas'ın kutusunu belirliyor; dar kalırsa dalganın tepesi
    // kırpılır. Gerçek glyph'le ölçen ve ışımayı da ekleyen sürümü
    // scripts/preview-flame-burn.js'te.
    let worst = 0;
    for (const phase of PHASES) {
      // Kutu en BÜYÜK hâli almalı: tam ısı VE tam büyüme.
      for (const p of burnPolygon(c, phase, 1, 1)) {
        worst = Math.max(worst, -p.x, p.x - 24, -p.y, p.y - 24);
      }
    }
    expect(worst / 24).toBeLessThan(BURN_PAD_RATIO);
  });
});
