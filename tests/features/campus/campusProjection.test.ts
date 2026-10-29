import {
  boundsCenter,
  boundsScreenSize,
  campusBlurHolePath,
  campusAreaGeometry,
  coverScale,
  fitZoom,
  geometryBounds,
  lonLatToWorld,
  projectCampusGeometry,
  projectOffset,
  ringPerimeter,
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

/**
 * BLUR DELİĞİ — akışta zemin bulanık, kampüsün içi net.
 *
 * Maske tek bir path ve delik yalnız `evenodd` sarılma sayısından doğuyor;
 * yani yapı bozulduğunda belirti sessiz ve iki uçtan biri oluyor:
 *   • dikdörtgen düşerse blur HİÇ çizilmiyor (zemin bir anda netleşiyor),
 *   • halkalar düşerse delik kapanıyor (kampüs de bulanık).
 * İkisi de ekranı çalışır hâlde bırakıyor, o yüzden burada çivili.
 */
describe('campusBlurHolePath', () => {
  const square: [number, number][] = [
    [29.045, 41.08],
    [29.062, 41.08],
    [29.062, 41.089],
    [29.045, 41.089],
    [29.045, 41.08],
  ];
  const hole: [number, number][] = [
    [29.05, 41.083],
    [29.052, 41.083],
    [29.052, 41.085],
    [29.05, 41.085],
    [29.05, 41.083],
  ];

  it('KUTUNUN TAMAMI dolu — blur delik dışında her yerde', () => {
    const geo: CampusGeometry = { type: 'Polygon', coordinates: [square] };
    expect(campusBlurHolePath(geo, ARGS).startsWith('M0,0H393V1064H0Z')).toBe(
      true,
    );
  });

  it('dış halka AYRI bir alt yol — delik buradan açılıyor', () => {
    const geo: CampusGeometry = { type: 'Polygon', coordinates: [square] };
    const d = campusBlurHolePath(geo, ARGS);
    // dikdörtgen + dış halka = 2 alt yol.
    expect(d.match(/M/g)).toHaveLength(2);

    // Noktalar poligon çiziminin KENDİSİYLE aynı — ayrışırsa delik kayar.
    const ring = projectCampusGeometry(geo, ARGS, 393 / 2, 1064 / 2)[0].outer;
    expect(d).toContain(`M${ring.split(' ').join('L')}Z`);
  });

  it('avlu ÜÇÜNCÜ alt yol — içi yine bulanık (evenodd)', () => {
    const geo: CampusGeometry = {
      type: 'Polygon',
      coordinates: [square, hole],
    };
    expect(campusBlurHolePath(geo, ARGS).match(/M/g)).toHaveLength(3);
  });

  it('MultiPolygon: her yerleşke kendi deliğini açıyor', () => {
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
    expect(campusBlurHolePath(geo, ARGS).match(/M/g)).toHaveLength(3);
  });

  it('BOZUK GEOMETRİDE deliksiz dikdörtgen — maske boş kalmıyor', () => {
    // İki noktalı halka alan oluşturmuyor; path yine de kutuyu kaplamalı,
    // yoksa blur'un tamamı yok olurdu.
    const geo: CampusGeometry = {
      type: 'Polygon',
      coordinates: [[square[0], square[1]]],
    };
    expect(campusBlurHolePath(geo, ARGS)).toBe('M0,0H393V1064H0Z');
  });
});

/**
 * POLİGONU OLMAYAN KAMPÜSÜN ŞEKLİ — hafifçe bozulmuş bir kare.
 *
 * İstenen his iki kuralın arasında: şekil KARE olarak okunmalı ama DÜZGÜN
 * kare olmamalı. İkisi birbirini kolayca yiyor — bozulma büyürse dörtgenlik
 * gider, küçülürse ekranda arayüz kutusu gibi durur — o yüzden ikisi de
 * burada çivili. Bir de determinizm: şekil her render'da yeniden üretiliyor,
 * rastgele olsa kampüs her açılışta başka bir parsel olurdu.
 */
describe('campusAreaGeometry — poligonsuz kampüsün kaba parseli', () => {
  const CIRCLE = { lat: 41.08448, lon: 29.05359, radiusMeters: 820 };

  /** Noktaları merkeze göre metrik (x doğu, y kuzey) düzleme indiriyor. */
  const toMeters = (
    ring: ReadonlyArray<readonly [number, number]>,
    circle = CIRCLE,
  ) => {
    const R = 6371008.8;
    const cos = Math.cos((circle.lat * Math.PI) / 180);
    return ring.map(([lon, lat]) => ({
      x: ((lon - circle.lon) * Math.PI * R * cos) / 180,
      y: ((lat - circle.lat) * Math.PI * R) / 180,
    }));
  };

  it('halka KAPALI, tek dış halka ve KÖŞELİ (daire değil)', () => {
    const g = campusAreaGeometry(CIRCLE);
    expect(g.type).toBe('Polygon');
    expect(g.coordinates).toHaveLength(1);
    const ring = g.coordinates[0];
    // 4 köşe + 4 kenar ortası + kapanış. Daireye dönerse bu sayı büyür ve
    // şekil yuvarlaklaşır — istek bunun TERSİ.
    expect(ring).toHaveLength(9);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it('AYNI KAMPÜS AYNI ŞEKİL — bozulma rastgele değil tohumlu', () => {
    expect(campusAreaGeometry(CIRCLE)).toEqual(campusAreaGeometry(CIRCLE));
  });

  it('FARKLI KAMPÜS FARKLI ŞEKİL — tek bir kalıp tekrarlanmıyor', () => {
    const other = { lat: 39.89, lon: 32.78, radiusMeters: 820 };
    const a = toMeters(campusAreaGeometry(CIRCLE).coordinates[0] as any);
    const b = toMeters(campusAreaGeometry(other).coordinates[0] as any, other);
    // Merkeze göre metrik köşeler birebir aynı olmamalı.
    const same = a.every(
      (p, i) => Math.abs(p.x - b[i].x) < 1 && Math.abs(p.y - b[i].y) < 1,
    );
    expect(same).toBe(false);
  });

  /**
   * ⚠️ İKİ YANLI ÇİVİ: şekil ne düzgün kare ne de amip.
   *
   * Köşe uzaklıkları (merkezden) eşitse kare "tam düzgün"; aralarındaki fark
   * yarıçapın yarısına çıkarsa dörtgen olarak okunmuyor. İstenen aralık
   * ikisinin arası — `CORNER_JITTER` buradan ayarlanır.
   */
  it('köşeler EŞİT DEĞİL ama dörtgenliği de bozmuyor', () => {
    const pts = toMeters(campusAreaGeometry(CIRCLE).coordinates[0] as any);
    // Çift index = köşe (bkz. SQUARE_OUTLINE), son eleman kapanış.
    const corners = pts.slice(0, 8).filter((_, i) => i % 2 === 0);
    const d = corners.map((p) => Math.hypot(p.x, p.y));
    const spread = (Math.max(...d) - Math.min(...d)) / CIRCLE.radiusMeters;
    expect(spread).toBeGreaterThan(0.02);
    expect(spread).toBeLessThan(0.3);
  });

  it('eksenlerden DÖNÜK — haritanın ızgarasıyla hizalı durmuyor', () => {
    const pts = toMeters(campusAreaGeometry(CIRCLE).coordinates[0] as any);
    // İlk kenar ortası (index 1) bozulmamış karede tam kuzeyde olurdu;
    // dönüklük onu doğuya/batıya kaydırıyor.
    const tilt = Math.abs(Math.atan2(pts[1].x, pts[1].y));
    expect(tilt).toBeGreaterThan(0.01);
  });

  /**
   * ⚠️ Boylam derecesi enlemle birlikte daralıyor (41°'de bir enlem
   * derecesinin ~%75'i). `/ cos φ` atlanırsa kare kuzey-güney basık bir
   * dikdörtgen olur ve hata "şekil yamuk" diye görünür, sebebi görünmez.
   * Ölçüm ekran uzayında — projeksiyondan GEÇTİKTEN sonra.
   */
  it('projeksiyondan sonra genişlik ≈ yükseklik (basık dikdörtgen değil)', () => {
    const b = geometryBounds(campusAreaGeometry(CIRCLE))!;
    const size = boundsScreenSize(b, 15, 1);
    // Bozulma payı var, o yüzden tam 1 değil — ama %20'den fazla sapma
    // `cos φ` hatasıdır, bozulma değil.
    expect(size.width / size.height).toBeGreaterThan(0.8);
    expect(size.width / size.height).toBeLessThan(1.2);
  });

  it('yarıçap metre cinsinden doğru ölçekliyor — iki katı iki kat şekil', () => {
    const a = boundsScreenSize(
      geometryBounds(campusAreaGeometry(CIRCLE))!,
      15,
      1,
    );
    const c = boundsScreenSize(
      geometryBounds(campusAreaGeometry({ ...CIRCLE, radiusMeters: 1640 }))!,
      15,
      1,
    );
    // ⚠️ Yarıçap tohumun GİRDİSİ DEĞİL (tohum yalnız koordinattan), yani iki
    // şeklin bozulması birebir aynı ve oran tam 2 çıkıyor.
    expect(c.width / a.width).toBeCloseTo(2, 2);
    // 820m yarıçap = 1640m kenar. Zoom 15'te dünya 512·2^15 = 16.78M piksel,
    // yani 41°'de bir piksel ≈ 40.075.017·cos41 / 16.777.216 ≈ 1.80m → kenar
    // ≈910px (ölçek 1'de, yani harita pikseli cinsinden). Sayı kabaca doğru
    // büyüklükte olmak zorunda: kat kat şaşarsa şekil bantta nokta ya da
    // ekranı aşan bir kutu olur. ⚠️ 512'lik karo varsayımına bağlı — 256
    // varsayılsa iki katı çıkar (bkz. TILE_SIZE testi).
    expect(a.width).toBeGreaterThan(800);
    expect(a.width).toBeLessThan(1100);
  });

  it('çizilebilir bir path üretiyor (kontur yolu boş kalmıyor)', () => {
    const path = campusBlurHolePath(campusAreaGeometry(CIRCLE), ARGS);
    expect(path.startsWith('M0,0H393V1064H0Z')).toBe(true);
    // Dikdörtgen + halka = 2 alt yol; halka düşerse blur deliği kapanır.
    expect(path.match(/M/g)).toHaveLength(2);
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

/**
 * HALKANIN ÇEVRESİ — konturun kenar boyunca silinmesinin ÖLÇÜSÜ.
 *
 * `strokeDasharray` bir uzunluk istiyor ve o uzunluk şeklin kendi çevresi olmak
 * zorunda: kısa gelirse çizgi şeklin ortasında bitiyor, uzun gelirse kaydırma
 * tükendiğinde kontur hâlâ ekranda kalıyor. Hata ikisinde de sessiz.
 */
describe('ringPerimeter', () => {
  it('KAPANIŞ SEGMENTİNİ SAYIYOR — `ringToSubpath` yolu `Z` ile kapatıyor', () => {
    // İlk noktayı SONDA TEKRAR ETMEYEN bir kare: 4 kenar = 40.
    expect(ringPerimeter('0,0 10,0 10,10 0,10')).toBeCloseTo(40, 6);
  });

  it('GeoJSON gibi ilk noktayı tekrar eden halkada da aynı sonuç', () => {
    // Tekrarlanan nokta sıfır uzunlukta bir segment ekliyor, toplam değişmiyor.
    expect(ringPerimeter('0,0 10,0 10,10 0,10 0,0')).toBeCloseTo(40, 6);
  });

  it('`ringToSubpath` ile AYNI EŞİK: üç noktadan azı alan değil → 0', () => {
    expect(ringPerimeter('')).toBe(0);
    expect(ringPerimeter('0,0')).toBe(0);
    expect(ringPerimeter('0,0 10,0')).toBe(0);
  });

  it('gerçek bir halkada pozitif ve kutunun çevresinden küçük', () => {
    const geometry: CampusGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [29.045, 41.08],
          [29.062, 41.08],
          [29.062, 41.09],
          [29.045, 41.09],
          [29.045, 41.08],
        ],
      ],
    };
    const [polygon] = projectCampusGeometry(
      geometry,
      ARGS,
      ARGS.boxWidth / 2,
      ARGS.boxHeight / 2,
    );
    const p = ringPerimeter(polygon.outer);
    expect(p).toBeGreaterThan(0);
    // Şekil kutunun içine sığdırıldığı için çevresi kutunun çevresini aşamaz.
    expect(p).toBeLessThan(4 * (ARGS.boxWidth + ARGS.boxHeight));
  });
});
