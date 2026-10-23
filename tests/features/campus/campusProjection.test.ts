import {
  boundsCenter,
  coverScale,
  fitZoom,
  geometryBounds,
  lonLatToWorld,
  projectCampusGeometry,
  projectOffset,
  type CampusProjectionArgs,
} from '@/features/campus/campusProjection';
import type { CampusGeometry } from '@/features/campus/campusTypes';

/**
 * POLİGON HARİTAYLA AYNI YERE DÜŞMELİ.
 *
 * Statik harita bir resim; poligonu onun üstüne biz çiziyoruz. İkisinin
 * hizası tamamen bu dosyadaki matematiğe bağlı ve bozulduğunda belirti çok
 * sinsi: ekran çalışmaya devam ediyor, şekil "biraz kaymış" görünüyor ve
 * sebebi görünmüyor.
 *
 * Çivilenen dört şey:
 *  1. Karo boyu 512 (Mapbox stilleri). 256 varsayılırsa her şey iki kat kayar.
 *  2. Ölçek `cover` ile aynı hesap (max), `contain` (min) DEĞİL.
 *  3. Merkez koordinatı kutunun merkezine düşüyor — ofset tam sıfır.
 *  4. Yön: doğu +x, KUZEY −y (ekran y'si aşağı artıyor).
 */

const ARGS: CampusProjectionArgs = {
  centerLat: 41.08448,
  centerLon: 29.05359,
  zoom: 14,
  imageWidth: 440,
  imageHeight: 1200,
  boxWidth: 393,
  boxHeight: 1064,
};

describe('lonLatToWorld', () => {
  it('karo boyu 512 — dünya zoom 0da 512 piksel', () => {
    const left = lonLatToWorld(-180, 0, 0);
    const right = lonLatToWorld(180, 0, 0);
    expect(right.x - left.x).toBeCloseTo(512, 6);
  });

  it('ekvator dünyanın dikey ortası', () => {
    expect(lonLatToWorld(0, 0, 0).y).toBeCloseTo(256, 6);
  });

  it('kuzeye gidince y AZALIYOR (ekran yönü)', () => {
    const south = lonLatToWorld(29, 41.0, 14);
    const north = lonLatToWorld(29, 41.1, 14);
    expect(north.y).toBeLessThan(south.y);
  });

  it('kutup sınırı kırpılıyor — tan patlamıyor', () => {
    const extreme = lonLatToWorld(0, 89.9, 14);
    expect(Number.isFinite(extreme.y)).toBe(true);
  });
});

describe('coverScale', () => {
  it('iki orandan BÜYÜĞÜ (cover), küçüğü değil', () => {
    const scale = coverScale(ARGS);
    expect(scale).toBeCloseTo(
      Math.max(ARGS.boxWidth / ARGS.imageWidth, ARGS.boxHeight / ARGS.imageHeight),
      10,
    );
    // `contain` olsaydı daha küçük çıkardı — poligon haritadan küçük kalırdı.
    expect(scale).toBeGreaterThan(
      Math.min(ARGS.boxWidth / ARGS.imageWidth, ARGS.boxHeight / ARGS.imageHeight),
    );
  });
});

describe('projectOffset', () => {
  it('merkez koordinatı TAM ORTADA (ofset sıfır)', () => {
    const o = projectOffset(ARGS.centerLon, ARGS.centerLat, ARGS);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
  });

  it('doğu +x, kuzey −y', () => {
    const east = projectOffset(ARGS.centerLon + 0.01, ARGS.centerLat, ARGS);
    const north = projectOffset(ARGS.centerLon, ARGS.centerLat + 0.01, ARGS);
    expect(east.x).toBeGreaterThan(0);
    expect(north.y).toBeLessThan(0);
  });

  it('zoom 14te ~800 m kampüs ekranda makul bir boyda', () => {
    // 0.0096 derece boylam ≈ 800 m (enlem 41). Ekranda birkaç yüz pt olmalı:
    // kutuyu taşarsa zoom yanlış, birkaç pt kalırsa karo boyu yanlış.
    const o = projectOffset(ARGS.centerLon + 0.0096, ARGS.centerLat, ARGS);
    expect(o.x).toBeGreaterThan(120);
    expect(o.x).toBeLessThan(320);
  });
});

describe('projectCampusGeometry', () => {
  const square: [number, number][] = [
    [29.045, 41.08],
    [29.062, 41.08],
    [29.062, 41.089],
    [29.045, 41.089],
    [29.045, 41.08],
  ];

  it('Polygon: dış halka noktaya çevriliyor, delik yok', () => {
    const geo: CampusGeometry = { type: 'Polygon', coordinates: [square] };
    const out = projectCampusGeometry(geo, ARGS, 196, 532);
    expect(out).toHaveLength(1);
    expect(out[0].outer.split(' ')).toHaveLength(5);
    expect(out[0].holes).toEqual([]);
  });

  it('delikli Polygon: ikinci halka DELİK olarak ayrılıyor', () => {
    const hole: [number, number][] = [
      [29.05, 41.083],
      [29.052, 41.083],
      [29.052, 41.085],
      [29.05, 41.085],
      [29.05, 41.083],
    ];
    const geo: CampusGeometry = { type: 'Polygon', coordinates: [square, hole] };
    const out = projectCampusGeometry(geo, ARGS, 196, 532);
    expect(out[0].holes).toHaveLength(1);
  });

  it('MultiPolygon: her yerleşke ayrı çiziliyor', () => {
    const second: [number, number][] = [
      [29.12, 41.1],
      [29.13, 41.1],
      [29.13, 41.11],
      [29.12, 41.11],
      [29.12, 41.1],
    ];
    const geo: CampusGeometry = {
      type: 'MultiPolygon',
      coordinates: [[square], [second]],
    };
    const out = projectCampusGeometry(geo, ARGS, 196, 532);
    expect(out).toHaveLength(2);
  });

  it('origin ofseti noktalara ekleniyor', () => {
    const geo: CampusGeometry = { type: 'Polygon', coordinates: [square] };
    const a = projectCampusGeometry(geo, ARGS, 0, 0)[0].outer.split(' ')[0];
    const b = projectCampusGeometry(geo, ARGS, 100, 50)[0].outer.split(' ')[0];
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    expect(bx - ax).toBeCloseTo(100, 1);
    expect(by - ay).toBeCloseTo(50, 1);
  });
});

describe('kadraj: sınır kutusu ve fit zoom', () => {
  const square: [number, number][] = [
    [29.045, 41.08],
    [29.062, 41.08],
    [29.062, 41.089],
    [29.045, 41.089],
    [29.045, 41.08],
  ];

  it('sınır kutusu DELİKLERİ saymıyor — avlu sınırı büyütemez', () => {
    const hole: [number, number][] = [
      [29.05, 41.083],
      [29.052, 41.083],
      [29.052, 41.085],
      [29.05, 41.085],
      [29.05, 41.083],
    ];
    const withHole = geometryBounds({
      type: 'Polygon',
      coordinates: [square, hole],
    });
    const without = geometryBounds({ type: 'Polygon', coordinates: [square] });
    expect(withHole).toEqual(without);
  });

  it('MultiPolygon: kutu TÜM yerleşkeleri kapsıyor', () => {
    const far: [number, number][] = [
      [29.12, 41.1],
      [29.13, 41.1],
      [29.13, 41.11],
      [29.12, 41.11],
      [29.12, 41.1],
    ];
    const b = geometryBounds({
      type: 'MultiPolygon',
      coordinates: [[square], [far]],
    })!;
    expect(b.maxLon).toBeCloseTo(29.13, 6);
    expect(b.maxLat).toBeCloseTo(41.11, 6);
  });

  it('merkez MERCATOR ortası — derece ortalaması DEĞİL', () => {
    // Kuzey-güney uzayan bir kutuda ikisi ayrışıyor; derece ortalaması
    // alınsaydı şekil bantta bir miktar kayardı.
    const b = { minLon: 29, minLat: 40, maxLon: 29.1, maxLat: 42 };
    const c = boundsCenter(b);
    expect(c.lon).toBeCloseTo(29.05, 6);
    expect(c.lat).not.toBeCloseTo(41, 6);
    expect(c.lat).toBeGreaterThan(40);
    expect(c.lat).toBeLessThan(42);
  });

  const fitFor = (bounds: ReturnType<typeof geometryBounds>) =>
    fitZoom({
      bounds: bounds!,
      viewportWidth: 393,
      viewportHeight: 120,
      scale: 0.893,
      padding: 32,
      minZoom: 11,
      maxZoom: 16.5,
    });

  it('küçük kampüs YAKIN, büyük kampüs UZAK kadrajlanıyor', () => {
    const small = geometryBounds({
      type: 'Polygon',
      coordinates: [
        [
          [29.05, 41.084],
          [29.0514, 41.084],
          [29.0514, 41.085],
          [29.05, 41.085],
          [29.05, 41.084],
        ],
      ],
    });
    const large = geometryBounds({
      type: 'Polygon',
      coordinates: [
        [
          [32.75, 39.875],
          [32.81, 39.875],
          [32.81, 39.905],
          [32.75, 39.905],
          [32.75, 39.875],
        ],
      ],
    });
    expect(fitFor(small)).toBeGreaterThan(fitFor(large));
  });

  it('tek binada zoom TAVANDA duruyor — "hangi oda" ölçeğine çıkmıyor', () => {
    const tiny = geometryBounds({
      type: 'Polygon',
      coordinates: [
        [
          [29.05, 41.084],
          [29.0502, 41.084],
          [29.0502, 41.0841],
          [29.05, 41.0841],
          [29.05, 41.084],
        ],
      ],
    });
    expect(fitFor(tiny)).toBe(16.5);
  });

  it('devasa sınırda zoom TABANDA duruyor', () => {
    const huge = geometryBounds({
      type: 'Polygon',
      coordinates: [
        [
          [28, 39],
          [33, 39],
          [33, 42],
          [28, 42],
          [28, 39],
        ],
      ],
    });
    expect(fitFor(huge)).toBe(11);
  });

  it('seçilen zoomda şekil banda SIĞIYOR', () => {
    const bounds = geometryBounds({ type: 'Polygon', coordinates: [square] })!;
    const zoom = fitFor(bounds);
    const sw = lonLatToWorld(bounds.minLon, bounds.minLat, zoom);
    const ne = lonLatToWorld(bounds.maxLon, bounds.maxLat, zoom);
    const heightPt = Math.abs(sw.y - ne.y) * 0.893;
    const widthPt = Math.abs(ne.x - sw.x) * 0.893;
    expect(heightPt).toBeLessThanOrEqual(120 - 32 + 0.5);
    expect(widthPt).toBeLessThanOrEqual(393 - 32 + 0.5);
  });
});
