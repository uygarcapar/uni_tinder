// SVG path yardımcıları — glyph boru hattının ortak parçası.
// Kullananlar: scripts/bake-glyph.js (1024 → 24 bakeleme),
//              scripts/gen-tab-icons.js (24 grid → tab bar PNG'leri).
//
// Neden ayrı modül: iki script de aynı parser'a ihtiyaç duyuyor ama
// gen-tab-icons'ın içindeki eski sürüm YALNIZ mutlak M/C/Z anlıyordu ve
// bütün alt-path'leri tek bir halkaya eziyordu. İkincisi delikli glyph'lerde
// (balon + oyulmuş kalp) sessizce yanlış sonuç veriyor: delik dolu çiziliyor.
// Buradaki sürüm alt-path'leri AYRI tutar.
//
// Her şey mutlak kübik bezier'e normalize edilir (M + C + Z). Sebep: üretilen
// glyph dosyaları da tam olarak bu biçimde — mevcut FlameGlyph/HeartGlyph ile
// aynı görünsün diye. Yay (A/a) komutu bilerek DESTEKLENMİYOR; ikon
// üreticileri yay basmıyor ve sessizce bozmaktansa yüksek sesle patlamak daha
// iyi.

/**
 * SVG `d` verisini mutlak kübik alt-path'lere çevirir.
 * @returns {Array<{ start: [number,number], cubics: Array<[[number,number],[number,number],[number,number],[number,number]]>, closed: boolean }>}
 */
function parsePath(d) {
  // Komut harfi | sayı (bilimsel gösterim dahil: 1e-5, .5, -3.2e+2)
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) throw new Error("path verisi boş ya da okunamadı");

  const subpaths = [];
  let sub = null;
  let cur = [0, 0]; // geçerli nokta
  let startPt = [0, 0]; // geçerli alt-path'in başlangıcı
  let prevCubicC2 = null; // S/s için yansıtılacak kontrol noktası
  let prevQuadC = null; // T/t için yansıtılacak kontrol noktası
  let cmd = null;
  let i = 0;

  const num = () => {
    const v = tokens[i++];
    if (v === undefined || /[a-zA-Z]/.test(v)) {
      throw new Error(`'${cmd}' komutu için eksik sayı (token ${i})`);
    }
    return +v;
  };
  const openSub = () => {
    sub = { start: [...cur], cubics: [], closed: false };
    subpaths.push(sub);
  };
  const line = (to) => {
    if (!sub) openSub();
    // Doğruyu kübiğe yükselt — üçte bir noktalarında kontrol: tam eşdeğer.
    const p0 = cur;
    sub.cubics.push([
      p0,
      [p0[0] + (to[0] - p0[0]) / 3, p0[1] + (to[1] - p0[1]) / 3],
      [p0[0] + (2 * (to[0] - p0[0])) / 3, p0[1] + (2 * (to[1] - p0[1])) / 3],
      to,
    ]);
    cur = to;
  };
  const cubic = (c1, c2, to) => {
    if (!sub) openSub();
    sub.cubics.push([cur, c1, c2, to]);
    cur = to;
    prevCubicC2 = c2;
  };
  const quad = (c, to) => {
    // Dereceyi yükselt: kuadratik → kübik (tam eşdeğer).
    const p0 = cur;
    cubic(
      [p0[0] + (2 / 3) * (c[0] - p0[0]), p0[1] + (2 / 3) * (c[1] - p0[1])],
      [to[0] + (2 / 3) * (c[0] - to[0]), to[1] + (2 / 3) * (c[1] - to[1])],
      to,
    );
    prevQuadC = c;
  };
  const reflect = (ctrl) =>
    ctrl ? [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]] : [...cur];

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
    } else if (cmd === "M") {
      cmd = "L"; // örtük devam: M'den sonraki fazladan çiftler L'dir
    } else if (cmd === "m") {
      cmd = "l";
    } else if (!cmd) {
      throw new Error("path komutla başlamıyor");
    }

    const rel = cmd === cmd.toLowerCase();
    const rx = rel ? cur[0] : 0;
    const ry = rel ? cur[1] : 0;
    const upper = cmd.toUpperCase();

    // S/T yansıması yalnız aynı aileden bir komut ardışıksa geçerli.
    if (upper !== "C" && upper !== "S") prevCubicC2 = null;
    if (upper !== "Q" && upper !== "T") prevQuadC = null;

    switch (upper) {
      case "M": {
        cur = [rx + num(), ry + num()];
        startPt = [...cur];
        openSub();
        break;
      }
      case "L":
        line([rx + num(), ry + num()]);
        break;
      case "H":
        line([rx + num(), cur[1]]);
        break;
      case "V":
        line([cur[0], ry + num()]);
        break;
      case "C": {
        const c1 = [rx + num(), ry + num()];
        const c2 = [rx + num(), ry + num()];
        cubic(c1, c2, [rx + num(), ry + num()]);
        break;
      }
      case "S": {
        const c1 = reflect(prevCubicC2);
        const c2 = [rx + num(), ry + num()];
        cubic(c1, c2, [rx + num(), ry + num()]);
        break;
      }
      case "Q": {
        const c = [rx + num(), ry + num()];
        quad(c, [rx + num(), ry + num()]);
        break;
      }
      case "T":
        quad(reflect(prevQuadC), [rx + num(), ry + num()]);
        break;
      case "Z":
        if (sub) {
          // Kapanış kenarını açıkça ekle — dolgu/winding hesabı için gerekli.
          if (cur[0] !== startPt[0] || cur[1] !== startPt[1]) line(startPt);
          sub.closed = true;
        }
        cur = [...startPt];
        sub = null;
        break;
      case "A":
        throw new Error(
          "yay (A/a) komutu desteklenmiyor — ikonu yay içermeyecek şekilde " +
            "yeniden üret ya da vektör editöründe yayları bezier'e çevir",
        );
      default:
        throw new Error(`bilinmeyen path komutu: '${cmd}'`);
    }
  }

  return subpaths.filter((s) => s.cubics.length > 0);
}

/** Tek boyutta kübik bezier'in [min,max] aralığı — analitik, örnekleme yok. */
function cubicExtent(p0, p1, p2, p3) {
  let lo = Math.min(p0, p3);
  let hi = Math.max(p0, p3);
  // B'(t) = 3[a t² + b t + c]
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const at = (t) => {
    if (!(t > 0 && t < 1)) return;
    const u = 1 - t;
    const v =
      u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  };
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) at(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      at((-b + r) / (2 * a));
      at((-b - r) / (2 * a));
    }
  }
  return [lo, hi];
}

/**
 * Gerçek bezier bbox'ı — kontrol noktalarının bbox'ı DEĞİL.
 * Kontrol noktası bbox'ı her zaman daha büyüktür; onu kullanmak glyph'i
 * olduğundan küçük ölçekler ve optik payı bozar.
 */
function pathBBox(subpaths) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const sp of subpaths) {
    for (const [p0, p1, p2, p3] of sp.cubics) {
      const [xa, xb] = cubicExtent(p0[0], p1[0], p2[0], p3[0]);
      const [ya, yb] = cubicExtent(p0[1], p1[1], p2[1], p3[1]);
      x0 = Math.min(x0, xa);
      x1 = Math.max(x1, xb);
      y0 = Math.min(y0, ya);
      y1 = Math.max(y1, yb);
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Alt-path'leri poligon halkalarına düzleştirir (her halka ayrı dizi). */
function flatten(subpaths, steps = 48) {
  return subpaths.map((sp) => {
    const ring = [];
    for (const [p0, p1, p2, p3] of sp.cubics) {
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = 1 - t;
        ring.push([
          u * u * u * p0[0] +
            3 * u * u * t * p1[0] +
            3 * u * t * t * p2[0] +
            t * t * t * p3[0],
          u * u * u * p0[1] +
            3 * u * u * t * p1[1] +
            3 * u * t * t * p2[1] +
            t * t * t * p3[1],
        ]);
      }
    }
    return ring;
  });
}

/** Kapalı halkanın işaretli alanı — işaret sarım yönünü verir. */
function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Alt-path'leri hedef grid'e ölçekleyip öteler ve path verisi olarak basar.
 * Dönüşüm path'in İÇİNE gömülür — `transform` attribute'u kullanılmaz, çünkü
 * glyph dosyaları ham `d` string'i olarak tüketiliyor.
 *
 * @param subpaths parsePath çıktısı
 * @param grid     hedef viewBox kenarı (24)
 * @param long     glyph'in uzun kenarının grid içindeki uzunluğu (20)
 * @param decimals ondalık basamak (mevcut glyph dosyaları 3 kullanıyor)
 */
function bake(subpaths, { grid = 24, long = 20, decimals = 3 } = {}) {
  const bb = pathBBox(subpaths);
  const s = long / Math.max(bb.w, bb.h);
  const ox = (grid - bb.w * s) / 2 - bb.x0 * s;
  const oy = (grid - bb.h * s) / 2 - bb.y0 * s;

  const n = (v) => {
    const r = +v.toFixed(decimals);
    // "-0" ve "1.000" gibi gürültüyü temizle
    return Object.is(r, -0) ? "0" : String(r);
  };
  const tx = (p) => `${n(p[0] * s + ox)} ${n(p[1] * s + oy)}`;

  const out = subpaths
    .map((sp) => {
      const parts = [`M${tx(sp.cubics[0][0])}`];
      for (const [, c1, c2, p3] of sp.cubics) {
        parts.push(`C${tx(c1)} ${tx(c2)} ${tx(p3)}`);
      }
      parts.push("Z");
      return parts.join("");
    })
    .join("");

  return {
    d: out,
    scale: s,
    width: bb.w * s,
    height: bb.h * s,
    x: (grid - bb.w * s) / 2,
    y: (grid - bb.h * s) / 2,
    source: bb,
  };
}

module.exports = {
  parsePath,
  pathBBox,
  cubicExtent,
  flatten,
  signedArea,
  bake,
};
