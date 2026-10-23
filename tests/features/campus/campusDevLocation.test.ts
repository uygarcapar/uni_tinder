/**
 * ⚠️ `fs` TİP TANIMI OLMADAN: projede `@types/node` yok (`tsconfig.types`
 * yalnız `["jest"]`). `require` jest ortamında çalışıyor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

import { appPrefs } from '@/shared/utils/appPrefs';
import {
  isConfidentlyInsideCampus,
  isInsideCampus,
  writeCachedBoundary,
} from '@/features/campus/campusBoundary';
import {
  campusSimulatedPoint,
  clearSimulatedCampusLocation,
  describeSimulateResult,
  isCampusLocationSimulated,
  simulateCampusLocation,
  simulatedCampusFix,
} from '@/features/campus/campusDevLocation';
import type {
  CampusBoundaryDto,
  GeoPolygon,
  GeoRing,
} from '@/features/campus/campusTypes';

/**
 * KAMPÜSTE OLMA SİMÜLASYONU (DEV aracı).
 *
 * ── Testin asıl işi ────────────────────────────────────────────────────────
 * Bu araç konum kapısını AÇIYOR, yani yanlış kurulursa prod'da kampüs dışından
 * an paylaşılmasına yol açar. Korunan iki şey:
 *   1. Varsayılan KAPALI ve açılması için diskte bir sınır olması şart.
 *   2. Her giriş `__DEV__` ile kapılı — release'de kod ölü. Bu bir KAYNAK
 *      kuralı olarak test ediliyor: jest'te `__DEV__` her zaman `true`, yani
 *      release davranışı çalıştırılarak doğrulanamıyor.
 *
 * ── İkincil ama kritik ─────────────────────────────────────────────────────
 * Simüle edilen şey bir BAYRAK değil, KONUM OKUMASININ KENDİSİ. Sunucu
 * gövdedeki koordinatı poligonla karşılaştırıyor (UT-7410); yalnız bayrak
 * olsaydı "+" çıkar, paylaşım sunucuda reddedilir ve sebebi anlaşılmazdı.
 */

const TR_DOMAIN = 'boun.edu.tr';
const CACHE_KEY = `campusBoundary:${TR_DOMAIN}`;
const FIX_KEY = 'campus.devFix';

/** Merkezi içine alan basit bir dikdörtgen kampüs. */
const OUTER_RING: GeoRing = [
  [29.045, 41.08],
  [29.062, 41.08],
  [29.062, 41.089],
  [29.045, 41.089],
  [29.045, 41.08],
];

const RECTANGLE: GeoPolygon = { type: 'Polygon', coordinates: [OUTER_RING] };

const boundary = (over: Partial<CampusBoundaryDto> = {}): CampusBoundaryDto => ({
  domain: TR_DOMAIN,
  isApproximate: false,
  circle: { lat: 41.08448, lon: 29.05359, radiusMeters: 600 },
  // ⚠️ POLİGON ŞART: nokta artık doğrulanıyor (`isInsideCampus`), poligonsuz
  // bir kampüste araç hiç açılmıyor — yüzey orada zaten kapalı.
  polygon: RECTANGLE,
  version: 'v1',
  // ⚠️ Yüzeyin açılıp açılmayacağı buradan DEĞİL `/campus/me`den okunuyor;
  // bu alan sunucunun ikinci emniyeti.
  enabled: true,
  ...over,
});

beforeEach(() => {
  appPrefs.remove(FIX_KEY);
  appPrefs.remove(CACHE_KEY);
});

afterAll(() => {
  appPrefs.remove(FIX_KEY);
  appPrefs.remove(CACHE_KEY);
});

describe('kampüs konum simülasyonu', () => {
  it('VARSAYILAN KAPALI', () => {
    expect(isCampusLocationSimulated()).toBe(false);
    expect(campusSimulatedPoint()).toBeNull();
    expect(simulatedCampusFix()).toBeNull();
  });

  it('sınır diskte YOKSA açılmıyor', () => {
    // Sınır yalnız tam ekran harita açıldığında çekiliyor; araç kullanıcıya
    // "önce haritaya bas" diyor.
    const res = simulateCampusLocation(TR_DOMAIN);
    expect(res.point).toBeNull();
    expect(res.failure).toBe('noBoundary');
    expect(isCampusLocationSimulated()).toBe(false);
  });

  it('il merkezi koordinatında açılmıyor', () => {
    // `isApproximate` yüzeyin ANA KAPISI: o kampüste özellik kapalı, simüle
    // etmenin hiçbir etkisi olmaz — araç bunu söyleyip duruyor.
    writeCachedBoundary(TR_DOMAIN, boundary({ isApproximate: true }));
    expect(simulateCampusLocation(TR_DOMAIN).failure).toBe('approximate');
    expect(isCampusLocationSimulated()).toBe(false);
  });

  it('poligon yoksa açılmıyor — içeride olduğu DOĞRULANMIŞ nokta üretilemiyor', () => {
    // Daire tek başına yetmiyor: o kampüste yüzey zaten kapalı
    // (`isInsideCampus` poligonsuz her zaman false) ve sunucu UT-7414 veriyor.
    writeCachedBoundary(TR_DOMAIN, boundary({ polygon: null }));
    expect(simulateCampusLocation(TR_DOMAIN).failure).toBe('noInsidePoint');
  });

  it('merkez poligonun İÇİNDEYSE o yazılıyor', () => {
    const b = boundary();
    writeCachedBoundary(TR_DOMAIN, b);

    const res = simulateCampusLocation(TR_DOMAIN);
    expect(res.failure).toBeNull();
    expect(res.point?.latitude).toBeCloseTo(b.circle!.lat, 6);
    expect(res.point?.longitude).toBeCloseTo(b.circle!.lon, 6);
    expect(res.point?.derived).toBe(false);
  });

  it('🔴 merkez poligonun DIŞINDAYSA nokta poligondan türetiliyor', () => {
    // Sunucunun ölçümü: özelliğin açık olduğu 162 kampüsün 6'sında merkez
    // sınırın 60–407 m dışında (merkez poligonun ORTALAMASI, çok parçalı
    // kampüste parçaların arasına düşüyor). Eski araç o merkezi yazıyordu:
    // "+" butonu çizilmiyor, elle gönderilse sunucu UT-7410 veriyordu.
    const b = boundary({
      circle: { lat: 41.0, lon: 29.0, radiusMeters: 600 }, // dikdörtgenin dışı
    });
    writeCachedBoundary(TR_DOMAIN, b);

    const res = simulateCampusLocation(TR_DOMAIN);
    expect(res.failure).toBeNull();
    expect(res.point?.derived).toBe(true);
    // Türetilen nokta GERÇEKTEN içeride olmak zorunda — aracın tek işi bu.
    expect(
      isInsideCampus(res.point!.latitude, res.point!.longitude, b),
    ).toBe(true);
    // Ve belirsizlik kapısından da geçmeli, yoksa "+" yine çizilmez.
    expect(
      isConfidentlyInsideCampus(
        res.point!.latitude,
        res.point!.longitude,
        simulatedCampusFix()!.accuracyMeters,
        b,
      ),
    ).toBe(true);
  });

  it('türetilen nokta DELİĞİN içine düşmüyor', () => {
    // Avlusu olan kampüs: tarama hattının ortası deliğe denk gelebiliyor ve
    // adaylar `isInsideCampus` ile doğrulanmazsa kullanıcı "kampüsün içindeki
    // boşlukta" sayılırdı.
    const hole: GeoPolygon = {
      type: 'Polygon',
      coordinates: [
        OUTER_RING,
        [
          [29.0485, 41.0825],
          [29.0585, 41.0825],
          [29.0585, 41.0865],
          [29.0485, 41.0865],
          [29.0485, 41.0825],
        ],
      ],
    };
    const b = boundary({
      circle: { lat: 41.0845, lon: 29.0535, radiusMeters: 600 }, // deliğin içi
      polygon: hole,
    });
    writeCachedBoundary(TR_DOMAIN, b);

    const res = simulateCampusLocation(TR_DOMAIN);
    expect(res.failure).toBeNull();
    expect(
      isInsideCampus(res.point!.latitude, res.point!.longitude, b),
    ).toBe(true);
  });

  it('çok parçalı kampüste de nokta üretiliyor', () => {
    // `MultiPolygon` yan yerleşkeli üniversitelerde geliyor (18 kayıt) ve
    // merkezin parçaların ARASINA düşmesi tam olarak orada oluyor.
    const b = boundary({
      circle: { lat: 41.1, lon: 29.1, radiusMeters: 600 },
      polygon: {
        type: 'MultiPolygon',
        coordinates: [
          [OUTER_RING],
          [
            [
              [29.2, 41.2],
              [29.21, 41.2],
              [29.21, 41.21],
              [29.2, 41.21],
              [29.2, 41.2],
            ],
          ],
        ],
      },
    });
    writeCachedBoundary(TR_DOMAIN, b);

    const res = simulateCampusLocation(TR_DOMAIN);
    expect(res.failure).toBeNull();
    expect(
      isInsideCampus(res.point!.latitude, res.point!.longitude, b),
    ).toBe(true);
  });

  it('açıkken okuma SİMÜLE EDİLİYOR — bayrak değil, konumun kendisi', () => {
    writeCachedBoundary(TR_DOMAIN, boundary());
    simulateCampusLocation(TR_DOMAIN);

    const fix = simulatedCampusFix()!;
    expect(fix.latitude).toBeCloseTo(41.08448, 6);
    expect(fix.longitude).toBeCloseTo(29.05359, 6);
    // ⚠️ Doğruluk KÜÇÜK olmak zorunda: `isConfidentlyInsideCampus` yarıçapı
    // sınıra olan mesafeyle karşılaştırıyor, büyük bir değer merkezde bile
    // "emin değilim" dedirtir.
    expect(fix.accuracyMeters).toBeLessThan(50);
    // ⚠️ `true` yazmak sunucuda UT-7412 (MOCKED_LOCATION) ile anında red
    // demekti, yani anahtar hiç çalışmazdı.
    expect(fix.isMocked).toBe(false);
  });

  it('domain verilmezse diskteki sınır bulunuyor', () => {
    // Ayarlar ekranının elinde kullanıcının domain'i yok.
    writeCachedBoundary(TR_DOMAIN, boundary());
    expect(simulateCampusLocation().point?.domain).toBe(TR_DOMAIN);
  });

  it('kapatınca gerçek GPS\'e dönüyor', () => {
    writeCachedBoundary(TR_DOMAIN, boundary());
    simulateCampusLocation(TR_DOMAIN);
    expect(isCampusLocationSimulated()).toBe(true);

    clearSimulatedCampusLocation();
    expect(isCampusLocationSimulated()).toBe(false);
    expect(simulatedCampusFix()).toBeNull();
  });

  it('bozuk kayıt sessizce yok sayılıyor', () => {
    appPrefs.set(FIX_KEY, '{ bu json değil');
    expect(isCampusLocationSimulated()).toBe(false);
    appPrefs.set(FIX_KEY, JSON.stringify({ latitude: 'x', longitude: 1 }));
    expect(isCampusLocationSimulated()).toBe(false);
  });

  it('her başarısızlık sebebi KENDİ mesajını veriyor', () => {
    const messages = (['noBoundary', 'approximate', 'noInsidePoint'] as const).map(
      (failure) => describeSimulateResult({ point: null, failure }).message,
    );
    expect(new Set(messages).size).toBe(3);
    // "noBoundary"in çaresi haritayı bir kez açmak — araç bunu söylemek
    // zorunda, yoksa kullanıcı anahtarın bozuk olduğunu sanıyor.
    expect(messages[0]).toContain('harita');
  });
});

// ── Kaynak kuralları: release'de ÖLÜ olmak ────────────────────────────────

describe('release güvenliği', () => {
  const SOURCE = readFileSync(
    'src/features/campus/campusDevLocation.ts',
    'utf8',
  );

  it('her dış giriş `__DEV__` ile kapılı', () => {
    // jest'te `__DEV__` her zaman `true`, yani bu davranış çalıştırılarak
    // doğrulanamıyor — kaynak kuralı olarak çiviliyoruz.
    for (const fn of [
      'isCampusLocationSimulated',
      'campusSimulatedPoint',
      'simulateCampusLocation',
      'simulatedCampusFix',
    ]) {
      const at = SOURCE.indexOf(`export function ${fn}`);
      expect(at).toBeGreaterThan(-1);
      // Gövdenin ilk satırlarında `__DEV__` kapısı olmalı.
      expect(SOURCE.slice(at, at + 400)).toContain('__DEV__');
    }
  });

  it('presence katmanı simülasyonu ÖNBELLEĞİN ve İZİN KAPISININ önünde okuyor', () => {
    const presence = readFileSync(
      'src/features/campus/campusPresence.ts',
      'utf8',
    );
    // ⚠️ TTL önbelleği simüle edilmiş okumayı dondurursa anahtar kapatıldıktan
    // sonra bir dakika boyunca "kampüsteyim" demeye devam eder.
    const read = presence.slice(presence.indexOf('export async function readCampusFix'));
    expect(read.indexOf('simulatedCampusFix()')).toBeLessThan(
      read.indexOf('freshFix('),
    );
    // İzin verilmemiş bir cihazda da yüzey denenebilmeli.
    const resolve = presence.slice(
      presence.indexOf('export async function resolveCampusPresence'),
    );
    expect(resolve.indexOf('simulatedCampusFix()')).toBeLessThan(
      resolve.indexOf('getForegroundPermissionsAsync'),
    );
  });

  it('araç native modülleri TEMBEL alıyor', () => {
    // `campusPresence` → expo-location, `campusService` → api → expo winter
    // fetch. Statik import ikisini de headless geofence bağlamına ve
    // SettingsScreen test süitine taşıyor (süit açılamıyor bile).
    expect(SOURCE).not.toMatch(/^import .*from "\.\/campusService"/m);
    expect(SOURCE).not.toMatch(/^import \{[^}]*readCampusFix/m);
    expect(SOURCE).toContain('require("./campusPresence")');
    expect(SOURCE).toContain('require("./campusService")');
  });
});
