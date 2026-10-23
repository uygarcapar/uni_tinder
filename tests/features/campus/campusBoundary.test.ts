/**
 * KAMPÜS SINIRI — "kampüste miyim?" kararının tamamı.
 *
 * Bu dosyanın koruduğu asıl şey ÖZELLİĞİN ANA KAPISI: `isApproximate` olan ya da
 * poligonu olmayan bir kampüste cevap HER ZAMAN `false` olmalı. Canlıda 4
 * üniversitenin koordinatı hâlâ il merkezi; oralarda poligon "il sınırı" gelirse
 * paylaşım kapısı bütün şehre açılır. Kapı burada tek satırla kırılabilir, o
 * yüzden testle çivileniyor.
 *
 * İkinci konu BELİRSİZLİK: içeride olmak yetmiyor. GPS'in kendi hata payı
 * sınıra olan uzaklıktan büyükse nokta dışarıda da olabilir — kampüsün
 * ortasındaki 100 m sorun değil, kapısındaki 100 m sorun.
 *
 * ⚠️ Buradaki hiçbir şey GÜVENLİK kontrolü değil; istemci kapısı yalnız "+"
 * butonunu çizip çizmemek için. Paylaşımın geçerliliğine sunucu karar veriyor.
 */

import { appPrefs } from '@/shared/utils/appPrefs';
import {
  campusGeofenceRegion,
  distanceToCampusEdgeMeters,
  isBoundaryStale,
  isConfidentlyInsideCampus,
  isInsideCampus,
  normalizeCampusBoundary,
  readCachedBoundary,
  writeCachedBoundary,
} from '@/features/campus/campusBoundary';
import type { CampusBoundaryDto } from '@/features/campus/campusTypes';

/** Boğaziçi Güney Kampüs civarında bir kare — köşeler [boylam, enlem]. */
const SQUARE: [number, number][] = [
  [29.045, 41.08],
  [29.055, 41.08],
  [29.055, 41.089],
  [29.045, 41.089],
  [29.045, 41.08],
];

const CENTER = { lat: 41.0845, lon: 29.05 };

const boundary = (over: Partial<CampusBoundaryDto> = {}): CampusBoundaryDto => ({
  domain: 'boun.edu.tr',
  isApproximate: false,
  circle: { lat: CENTER.lat, lon: CENTER.lon, radiusMeters: 820 },
  polygon: { type: 'Polygon', coordinates: [SQUARE] },
  version: '2026-10-21T00:00:00Z',
  enabled: true,
  ...over,
});

describe('isInsideCampus', () => {
  it('kampüsün içindeki nokta içeride', () => {
    expect(isInsideCampus(CENTER.lat, CENTER.lon, boundary())).toBe(true);
  });

  it('kampüsün dışındaki nokta dışarıda', () => {
    // Doğuya 0.01 derece ≈ 840 m — karenin dışı.
    expect(isInsideCampus(CENTER.lat, 29.06, boundary())).toBe(false);
  });

  it('sınırın 1 m içi/dışı doğru ayrışıyor', () => {
    // Karenin batı kenarı 29.045; ~1 m ≈ 0.000012 derece boylam.
    expect(isInsideCampus(CENTER.lat, 29.045012, boundary())).toBe(true);
    expect(isInsideCampus(CENTER.lat, 29.044988, boundary())).toBe(false);
  });

  it('DELİĞİN içi kampüs sayılmıyor', () => {
    const hole: [number, number][] = [
      [29.049, 41.084],
      [29.051, 41.084],
      [29.051, 41.085],
      [29.049, 41.085],
      [29.049, 41.084],
    ];
    const withHole = boundary({
      polygon: { type: 'Polygon', coordinates: [SQUARE, hole] },
    });
    // Deliğin ortası — dış halkanın içinde ama kampüs değil.
    expect(isInsideCampus(41.0845, 29.05, withHole)).toBe(false);
    // Deliğin dışı, kampüsün içi.
    expect(isInsideCampus(41.0870, 29.05, withHole)).toBe(true);
  });

  it('MultiPolygon: ikinci yerleşke de kampüs', () => {
    const second: [number, number][] = [
      [29.12, 41.1],
      [29.13, 41.1],
      [29.13, 41.11],
      [29.12, 41.11],
      [29.12, 41.1],
    ];
    const multi = boundary({
      polygon: { type: 'MultiPolygon', coordinates: [[SQUARE], [second]] },
    });
    expect(isInsideCampus(CENTER.lat, CENTER.lon, multi)).toBe(true);
    expect(isInsideCampus(41.105, 29.125, multi)).toBe(true);
    expect(isInsideCampus(41.2, 29.3, multi)).toBe(false);
  });

  // ── ANA KAPI ──────────────────────────────────────────────────────────────
  it('isApproximate ise poligon dolu olsa bile HER ZAMAN false', () => {
    const approx = boundary({ isApproximate: true });
    expect(isInsideCampus(CENTER.lat, CENTER.lon, approx)).toBe(false);
  });

  it('poligon yoksa false — daire TEK BAŞINA karar vermiyor', () => {
    const circleOnly = boundary({ polygon: null });
    expect(isInsideCampus(CENTER.lat, CENTER.lon, circleOnly)).toBe(false);
  });

  it('sınır yoksa false', () => {
    expect(isInsideCampus(CENTER.lat, CENTER.lon, null)).toBe(false);
    expect(isInsideCampus(CENTER.lat, CENTER.lon, undefined)).toBe(false);
  });

  it('geçersiz koordinatta false', () => {
    expect(isInsideCampus(NaN, CENTER.lon, boundary())).toBe(false);
  });
});

/**
 * KOORDİNAT SIRASI — GeoJSON `[lon, lat]`.
 *
 * Backend rehberinin açıkça uyardığı hata sınıfı: Türkiye'de `lon ≈ 26–45`,
 * `lat ≈ 36–42`. İlk sayı 36–42 aralığındaysa takas edilmiş demektir. Sunucu
 * tarafında da bunu yakalayan bir test var; ikisi birbirini tutuyor.
 */
describe('koordinat sırası', () => {
  it('[lon, lat] okunuyor — takas edilmiş poligon kampüsü KAPSAMIYOR', () => {
    // Doğru sıra: nokta içeride.
    expect(isInsideCampus(CENTER.lat, CENTER.lon, boundary())).toBe(true);

    // Aynı kare [lat, lon] yazılsaydı (yaygın hata) — kampüs Türkiye'nin
    // dışına, Hint Okyanusu'na düşerdi ve hiçbir nokta içeride olmazdı.
    const swapped: [number, number][] = SQUARE.map(([lon, lat]) => [lat, lon]);
    const bad = boundary({
      polygon: { type: 'Polygon', coordinates: [swapped] },
    });
    expect(isInsideCampus(CENTER.lat, CENTER.lon, bad)).toBe(false);
  });

  it('Türkiye sınır kutusu: boylam 26-45, enlem 36-42', () => {
    // Testteki karenin kendisi de doğru yarım kürede olmalı — bu dosya
    // bozulursa diğer bütün beklentiler anlamsızlaşır.
    for (const [lon, lat] of SQUARE) {
      expect(lon).toBeGreaterThan(26);
      expect(lon).toBeLessThan(45);
      expect(lat).toBeGreaterThan(36);
      expect(lat).toBeLessThan(42);
    }
  });
});

describe('normalizeCampusBoundary', () => {
  it('isApproximate ALANI YOKSA yaklaşık sayılıyor', () => {
    // Bilinmeyen bir koordinata kampüs muamelesi yapmak yanlış tarafa hata.
    const n = normalizeCampusBoundary({
      domain: 'x.edu.tr',
      polygon: { type: 'Polygon', coordinates: [SQUARE] },
    });
    expect(n?.isApproximate).toBe(true);
    expect(isInsideCampus(CENTER.lat, CENTER.lon, n)).toBe(false);
  });

  it('bozuk halka (3 nokta) poligonu düşürüyor', () => {
    const n = normalizeCampusBoundary({
      domain: 'x.edu.tr',
      isApproximate: false,
      polygon: { type: 'Polygon', coordinates: [[[29, 41], [29.1, 41], [29, 41]]] },
    });
    expect(n?.polygon).toBeNull();
  });

  it('yarıçapı [150, 5000] aralığına kırpıyor — sunucuya güvenmiyor', () => {
    const small = normalizeCampusBoundary({
      domain: 'x.edu.tr',
      isApproximate: false,
      circle: { lat: 41, lon: 29, radiusMeters: 50 },
    });
    const huge = normalizeCampusBoundary({
      domain: 'x.edu.tr',
      isApproximate: false,
      circle: { lat: 41, lon: 29, radiusMeters: 90000 },
    });
    expect(small?.circle?.radiusMeters).toBe(150);
    expect(huge?.circle?.radiusMeters).toBe(5000);
  });

  it('enabled alanı okunuyor; yoksa null ("bilinmiyor")', () => {
    // ⚠️ Alan yoksa `false` DEĞİL `null`: yüzeyin kapısı /campus/me'de ve
    // burada yanlışlıkla kapatmak eski sunucuda özelliği tamamen öldürürdü.
    const on = normalizeCampusBoundary({
      domain: 'x.edu.tr',
      isApproximate: false,
      enabled: true,
    });
    const missing = normalizeCampusBoundary({
      domain: 'x.edu.tr',
      isApproximate: false,
    });
    expect(on?.enabled).toBe(true);
    expect(missing?.enabled).toBeNull();
  });

  it('domain yoksa null', () => {
    expect(normalizeCampusBoundary({ isApproximate: false })).toBeNull();
    expect(normalizeCampusBoundary(null)).toBeNull();
  });
});

describe('belirsizlik (accuracy)', () => {
  it('sınıra uzaklık doğru ölçülüyor', () => {
    // Merkezden en yakın kenar batı/doğu: 0.005 derece boylam ≈ 420 m.
    const d = distanceToCampusEdgeMeters(CENTER.lat, CENTER.lon, boundary());
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(440);
  });

  it('belirsizlik sınıra uzaklıktan küçükse içeride sayılıyor', () => {
    expect(
      isConfidentlyInsideCampus(CENTER.lat, CENTER.lon, 100, boundary()),
    ).toBe(true);
  });

  it('belirsizlik sınırı aşıyorsa İÇERİDE SAYILMIYOR', () => {
    // Nokta poligonun içinde ama 600 m hata payıyla dışarıda da olabilir.
    expect(isInsideCampus(CENTER.lat, CENTER.lon, boundary())).toBe(true);
    expect(
      isConfidentlyInsideCampus(CENTER.lat, CENTER.lon, 600, boundary()),
    ).toBe(false);
  });

  /**
   * Mutlak tavan: kampüsün göbeğinde bile 100 m'den kötü bir okuma kabul
   * edilmiyor. Sunucu da aynı tavanı uyguluyor (UT-7411) — istemci daha gevşek
   * olsaydı "+" çıkar, kullanıcı fotoğrafı seçip kırpar ve ancak gönderirken
   * reddedilirdi.
   */
  it('100 m üstü belirsizlik KOŞULSUZ red (kampüsün ortasında bile)', () => {
    // Merkezin sınıra uzaklığı ~420 m, yani göreli kural TEK BAŞINA geçerdi.
    expect(distanceToCampusEdgeMeters(CENTER.lat, CENTER.lon, boundary())).toBeGreaterThan(150);
    expect(
      isConfidentlyInsideCampus(CENTER.lat, CENTER.lon, 150, boundary()),
    ).toBe(false);
  });

  it('accuracy bilinmiyorsa belirsizlik kontrolü yapılmıyor (sunucu doğruluyor)', () => {
    expect(
      isConfidentlyInsideCampus(CENTER.lat, CENTER.lon, null, boundary()),
    ).toBe(true);
  });
});

describe('campusGeofenceRegion', () => {
  it('kapalı kampüste bölge kurulmuyor', () => {
    expect(campusGeofenceRegion(boundary({ isApproximate: true }))).toBeNull();
    expect(campusGeofenceRegion(boundary({ polygon: null }))).toBeNull();
    expect(campusGeofenceRegion(boundary({ circle: null }))).toBeNull();
  });

  it('açık kampüste daireyi veriyor', () => {
    expect(campusGeofenceRegion(boundary())).toEqual({
      latitude: CENTER.lat,
      longitude: CENTER.lon,
      radius: 820,
    });
  });
});

describe('disk önbelleği', () => {
  beforeEach(() => {
    appPrefs.remove('campusBoundary:boun.edu.tr');
    appPrefs.remove('campusBoundary:bogazici.edu.tr');
  });

  it('yazılan okunuyor', () => {
    writeCachedBoundary('boun.edu.tr', boundary());
    const read = readCachedBoundary('boun.edu.tr');
    expect(read?.domain).toBe('boun.edu.tr');
    expect(isInsideCampus(CENTER.lat, CENTER.lon, read)).toBe(true);
  });

  /**
   * ⚠️ ALIAS TUZAĞI. Sunucu her zaman KANONİK domain'i döndürüyor:
   * `bogazici.edu.tr` sorana yanıtta `boun.edu.tr` geliyor. Anahtar yanıttan
   * alınsaydı alias domain'li kullanıcı yazdığını bir daha bulamaz, önbellek
   * her açılışta ıskalardı — ve bu sessiz bir hata olurdu (özellik çalışır,
   * sadece her seferinde ağdan çeker).
   */
  it('alias domain ile yazılıp alias domain ile okunuyor', () => {
    // Kullanıcının e-posta domain'i alias, yanıttaki domain kanonik.
    writeCachedBoundary('bogazici.edu.tr', boundary({ domain: 'boun.edu.tr' }));
    const read = readCachedBoundary('bogazici.edu.tr');
    expect(read).not.toBeNull();
    expect(read?.domain).toBe('boun.edu.tr');
    // Kanonik anahtara YAZILMADI — okuma istenen domain üzerinden.
    expect(readCachedBoundary('boun.edu.tr')).toBeNull();
  });

  it('kayıt yoksa null', () => {
    expect(readCachedBoundary('yok.edu.tr')).toBeNull();
  });

  it('bozuk kayıt çökmüyor, null dönüyor', () => {
    appPrefs.set('campusBoundary:boun.edu.tr', '{bozuk');
    expect(readCachedBoundary('boun.edu.tr')).toBeNull();
  });

  it('sürüm farkı bayatlık demek; sürüm bilinmiyorsa da bayat', () => {
    const cached = boundary();
    expect(isBoundaryStale(cached, '2026-10-21T00:00:00Z')).toBe(false);
    expect(isBoundaryStale(cached, '2026-11-01T00:00:00Z')).toBe(true);
    expect(isBoundaryStale(cached, null)).toBe(true);
    expect(isBoundaryStale(null, '2026-10-21T00:00:00Z')).toBe(true);
  });
});
