import {
  campusCardHeight,
  campusStripHeight,
  campusStripScrimHeight,
} from '@/features/campus/components/CampusMomentsStrip';
import {
  CAMPUS_MAP_CHROME_ROW,
  CAMPUS_MAP_CHROME_TOP,
  campusMapTopScrimHeight,
} from '@/features/campus/components/CampusMapScrim';
import { campusTransitionVector } from '@/features/feed/components/CampusMapTransition';

/**
 * ŞERİT YERLEŞİMİ — haritanın dibindeki kutu şeridi.
 *
 * Buradaki sayılar iki ayrı dosyayı bağlıyor: şerit kendi yüksekliğini
 * kuruyor, harita katmanı da kampüs noktasını şeridin ÜSTÜNDE kalan alanın
 * ortasına getirmek için AYNI yüksekliği okuyor (`FeedMapStrip >
 * expandedBottomInset`). İkisi ayrışırsa okul şeridin arkasına kayar ve bu
 * sessiz bir hata olur — ekran çalışmaya devam eder, yalnız yanlış yeri
 * gösterir.
 *
 * ⚠️ Burada bir zamanlar "iki detent" ve "boş durumun ortalanması" testleri
 * vardı: yüzey gorhom `BottomSheetModal`ıydı. Modal kaldırıldı (bazen hiç
 * açılmıyordu, gerekçe CampusMomentsStrip'in başında), onunla birlikte ikinci
 * detent ve klasik boş durum da gitti — şeridin tek yüksekliği var ve boşluğun
 * yerini dolgu kutuları aldı.
 */

describe('kutu ve şerit ölçüleri', () => {
  it('kutu ekran boyuyla büyüyor ama sınırlar içinde kalıyor', () => {
    // ⚠️ ÖLÇÜ YÜKSEKLİKTEN türüyor: genişlikten türediği dönemde 3:4 oranı
    // kutuyu ~440pt yapıyor ve şerit 580'e çıkıyordu — haritadan geriye bir
    // şerit kalıyordu.
    //
    // ⚠️ Sayılar KARE kutuya geçerken düştü (0.30 → 0.26): şerit artık sekme
    // şeridinin de üstünde duruyor ve eski ölçülerle SE'de ekranın yarısını
    // aşıyordu. Kare kutu aynı yükseklikte daha GENİŞ, yani küçülme hissi yok.
    expect(campusCardHeight(667)).toBe(200); // SE — alt sınır
    expect(campusCardHeight(852)).toBe(222); // 15 Pro
    expect(campusCardHeight(1400)).toBe(300); // tablet — üst sınır
  });

  it('şerit ekranın yarısını AŞMIYOR', () => {
    for (const [height, bottom] of [
      [667, 0],
      [852, 34],
      [932, 34],
    ] as const) {
      const strip = campusStripHeight(height, bottom);
      expect(strip).toBeLessThan(height * 0.5);
      // Harita için anlamlı bir alan kalmalı: yüzeyin tamamı "kampüsüm
      // nerede" sorusu üzerine kurulu.
      expect(height - strip).toBeGreaterThan(height * 0.5);
    }
  });

  it('güvenli alan dibi şeride ekleniyor', () => {
    const withInset = campusStripHeight(852, 34);
    const without = campusStripHeight(852, 0);
    expect(withInset - without).toBe(34);
  });

  it('şerit kutudan DAHA UZUN — başlık ve alt pay içinde', () => {
    // Kutunun kendisi kadar bir şerit başlığı ekranın dışında bırakırdı.
    const strip = campusStripHeight(852, 0);
    expect(strip).toBeGreaterThan(campusCardHeight(852));
  });

  it('ALT PERDE BAŞLIĞIN ORTASINDA bitiyor', () => {
    /**
     * Bu sayı üç kez ters yöne gitti, sırası önemli:
     *   1. Perde şeridin tamamıydı (+40) → "blur çok fazla", ekranın alt
     *      yarısı bulanık bir levha.
     *   2. Kutuların ALTINA indirildi → kutular opak, arkalarına perde
     *      gerekmiyordu.
     *   3. BAŞLIK ŞERİDİN TEPESİNE TAŞINDI → perdenin yine yukarı çıkması
     *      gerekti, yoksa başlık çıplak haritanın üstünde kalıyordu.
     *   4. Şimdi başlığın TEPESİNİ DE AŞMIYOR (istek: "başlığın ortasına
     *      kadar gelsin") — yarım satır geri çekildi.
     *
     * Sönümün nereye düştüğü ayrı bir ayar (`CAMPUS_STRIP_SCRIM_FADE`):
     * geometri bandın BİTTİĞİ yeri, o da son 32pt'nin şeffaflaşmasını
     * söylüyor.
     */
    for (const [height, bottom] of [
      [667, 0],
      [852, 34],
      [932, 34],
    ] as const) {
      const strip = campusStripHeight(height, bottom);
      const scrim = campusStripScrimHeight(height, bottom);
      // Yarım başlık satırı kadar KISA: 27/2 = 13.5 → 14.
      expect(strip - scrim).toBe(14);
      // Yine de kutuların üstüne geçiyor: başlık orada.
      expect(scrim).toBeGreaterThan(campusCardHeight(height));
    }
  });

  it('alt perde güvenli alanla büyüyor — sekme şeridinin üstünü de kapsıyor', () => {
    expect(
      campusStripScrimHeight(852, 34) - campusStripScrimHeight(852, 0),
    ).toBe(34);
  });
});

/**
 * ÜST PERDE — Keşif kartının başlık şeridinin formülü.
 *
 * İstek birebir şuydu: "SwipeCard'ın scroll ederken çıkan header blur'unun
 * aynısı". Malzeme (maske durakları, perde rampası, blur gücü) zaten oradan
 * kopyalıydı; eksik olan GEOMETRİYDİ. `CardStickyHeader`da bant
 * `rowTop + rowHeight + CHROME_BAND_TAIL` ve ekranın 0'ından başlıyor — satır
 * bandın içinde, altında 16pt sönme kuyruğu var.
 *
 * Burada başlık da (CampusMapTitle) o satırın içinde, cam X ile aynı
 * merkezde. Bant kısalırsa yazı çıplak haritanın üstünde kalır.
 */
describe('üst perde', () => {
  it('bant SATIRIN TAMAMINI örtüyor + kuyruk', () => {
    for (const topInset of [0, 47, 59]) {
      const band = campusMapTopScrimHeight(topInset);
      const rowBottom = topInset + CAMPUS_MAP_CHROME_TOP + CAMPUS_MAP_CHROME_ROW;
      expect(band).toBeGreaterThan(rowBottom);
      // Kuyruk 16 — `CHROME_BAND_TAIL` ile aynı sayı (kartın şeridi).
      expect(band - rowBottom).toBe(16);
    }
  });

  it('satır Keşif\'in cam buton çapında — iki öğe tek hizada', () => {
    // Başlık bu kutuya dikey ortalanıyor; iki ayrı sayı yazılsaydı üst
    // şeritte iki farklı hizada iki öğe olurdu.
    expect(CAMPUS_MAP_CHROME_ROW).toBe(48);
  });

  it('bant güvenli alanla büyüyor — durum çubuğunun arkası da örtülü', () => {
    expect(campusMapTopScrimHeight(59) - campusMapTopScrimHeight(0)).toBe(59);
  });
});

describe('kampüs değişimi geçişi', () => {
  it('doğudaki kampüse geçerken yön +x', () => {
    const v = campusTransitionVector(
      { lat: 41.0, lon: 29.0 },
      { lat: 41.0, lon: 29.2 },
      393,
    )!;
    expect(v.dx).toBeCloseTo(1, 3);
    expect(Math.abs(v.dy)).toBeLessThan(0.01);
  });

  it('kuzeydeki kampüse geçerken yön −y (ekran yukarı)', () => {
    const v = campusTransitionVector(
      { lat: 41.0, lon: 29.0 },
      { lat: 41.3, lon: 29.0 },
      393,
    )!;
    expect(v.dy).toBeLessThan(-0.9);
  });

  it('vektör BİRİM — mesafe ayrı taşınıyor', () => {
    const v = campusTransitionVector(
      { lat: 39.9, lon: 32.8 },
      { lat: 41.0, lon: 29.0 },
      393,
    )!;
    expect(Math.hypot(v.dx, v.dy)).toBeCloseTo(1, 6);
  });

  it('süzülme payı GERÇEK MESAFEYE bağlı DEĞİL', () => {
    // Aynı şehirdeki iki kampüs ile şehirlerarası geçiş aynı payda süzülüyor:
    // gerçek mesafeyle ölçeklenseydi biri hiç kıpırdamaz, öbürü ekranı
    // onlarca kez geçerdi. Harita statik, aradaki coğrafyayı çizemiyoruz.
    const near = campusTransitionVector(
      { lat: 41.08, lon: 29.05 },
      { lat: 41.1, lon: 29.02 },
      393,
    )!;
    const far = campusTransitionVector(
      { lat: 41.08, lon: 29.05 },
      { lat: 39.9, lon: 32.85 },
      393,
    )!;
    expect(near.distance).toBe(far.distance);
  });

  it('aynı nokta ya da eksik koordinatta yön YOK (yalnız çapraz geçiş)', () => {
    const same = { lat: 41.0, lon: 29.0 };
    expect(campusTransitionVector(same, same, 393)).toBeNull();
    expect(campusTransitionVector(null, same, 393)).toBeNull();
    expect(campusTransitionVector(same, undefined, 393)).toBeNull();
  });
});
