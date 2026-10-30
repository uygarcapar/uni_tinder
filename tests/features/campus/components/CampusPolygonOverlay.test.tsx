import { render } from '@testing-library/react-native';
import { Path } from 'react-native-svg';
import CampusPolygonOverlay from '@/features/campus/components/CampusPolygonOverlay';
import { applyPalette } from '@/shared/theme/colors';
import {
  projectCampusGeometry,
  ringPerimeter,
} from '@/features/campus/campusProjection';
import type { CampusGeometry } from '@/features/campus/campusTypes';

/**
 * KAMPÜS POLİGONU — YALNIZ KENAR, TEMANIN MÜREKKEBİYLE.
 *
 * Dört şey çivileniyor, dördü de sessizce bozulabilir:
 *   • DOLGU YOK (istek: "sadece etrafı çizilsin, border gibi"). Dolgu dört tur
 *     denendi (mod gradyanı → düz mod tinti → alfa düşürme → perdelerin
 *     üstüne taşıma) ve her tur aynı şikâyette bitti: dolu bir yüzey kartlarla
 *     aynı ekranda leke olarak okunuyor.
 *   • KONTUR VAR ve kalınlığı sınırı söyleyen tek şey.
 *   • RENK TEMADAN (`ink`): koyuda beyaz, açıkta siyah. Altındaki harita da
 *     tema başına ayrı stil çiziyor, yani sabit bir renk birinde kaybolurdu.
 *   • DELİK GERÇEKTEN DELİK (`evenodd`) ve konturu avlulara da iniyor — avlu
 *     da kampüsün sınırı.
 */

const projection = {
  boxWidth: 300,
  boxHeight: 300,
  centerLat: 39.89,
  centerLon: 32.78,
  zoom: 14,
  imageWidth: 300,
  imageHeight: 300,
} as any;

/** Dış halka + içinde bir avlu. */
const withHole: CampusGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [32.77, 39.88],
      [32.79, 39.88],
      [32.79, 39.9],
      [32.77, 39.9],
      [32.77, 39.88],
    ],
    [
      [32.779, 39.889],
      [32.781, 39.889],
      [32.781, 39.891],
      [32.779, 39.891],
      [32.779, 39.889],
    ],
  ],
};

const renderOverlay = () =>
  render(<CampusPolygonOverlay geometry={withHole} projection={projection} />);

const path = () => renderOverlay().UNSAFE_getAllByType(Path)[0];

describe('CampusPolygonOverlay', () => {
  afterEach(() => applyPalette('dark'));

  it('DOLGU YOK — şekil bir yüzey değil, bir çizgi', () => {
    expect(path().props.fill).toBe('none');
    // Alfalı bir dolgunun geri dönüşü de burada yakalanıyor.
    expect(path().props.fillOpacity).toBeUndefined();
  });

  it('KONTUR VAR ve eski 2pt`den kalın', () => {
    // 2, 2026-10-22'de kaldırılan konturun kalınlığıydı; dolgu gidince çizgi
    // tek başına kaldı ve o ölçüde cılız duruyordu (istek: "bi tık
    // kalınlaştır").
    expect(path().props.strokeWidth).toBeGreaterThan(2);
    /**
     * ⚠️ `strokeLinejoin` ŞART: kampüs sınırları çok kırıklı poligonlar ve
     * keskin birleşimlerde SVG'nin varsayılan `miter`ı şeklin DIŞINA uzun
     * sivriler çıkarıyor — 2.5pt'de bunlar iğne gibi görünüyor.
     */
    expect(path().props.strokeLinejoin).toBe('round');
  });

  it('RENK TEMADAN — koyuda beyaz, açıkta siyah', () => {
    applyPalette('dark');
    expect(path().props.stroke).toBe('rgba(255,255,255,1)');
    applyPalette('light');
    expect(path().props.stroke).toBe('rgba(0,0,0,1)');
  });

  /**
   * ⚠️ MOD RENGİ (Flört kırmızısı / Arkadaş yeşili) VE `mode` PROP'U
   * KALDIRILDI — zincir üç dosyaydı (FeedScreen → FeedMapStrip → burası).
   * Gerekçe 2026-10-22'de yazılanın aynısı: sınır bir MOD bilgisi değil,
   * haritanın kendi dili. Geri gelirse prop zinciri de geri gelmek zorunda.
   */
  it('renk MODDAN GELMİYOR — mod-nötr bir çizim', () => {
    // Fire paletinin tonları (modeFireGradient) burada görünmemeli.
    expect(path().props.stroke).toMatch(/^rgba\((0|255),/);
  });

  it('TEK path — delik ayrı bir kapak değil', () => {
    expect(renderOverlay().UNSAFE_getAllByType(Path)).toHaveLength(1);
  });

  it('delik `evenodd` ile açılıyor — konturu avluya da iniyor', () => {
    expect(path().props.fillRule).toBe('evenodd');
    // İki alt yol = dış halka + avlu. Biri düşerse avlunun kenarı çizilmez.
    expect(path().props.d.match(/M/g)).toHaveLength(2);
  });

  it('gradyana dönülmedi — `url(#…)` referansı yok', () => {
    /**
     * ⚠️🔴 GRADYAN = PUSUN GERİ DÖNÜŞÜ. Alfası azalan bir gradyan şeklin kendi
     * kenarını eritiyordu; üstüne `<Defs>`in id'si örneğe özel olmak zorunda
     * (akışta geçiş sırasında bileşen aynı anda iki kez canlı ve sabit bir
     * id'de biri sökülünce diğerinin dolgusu kayboluyordu).
     */
    expect(path().props.fill).not.toMatch(/^url\(/);
    expect(path().props.stroke).not.toMatch(/^url\(/);
  });

  /**
   * ── KENAR BOYUNCA ÇİZİLME (istek) ────────────────────────────────────────
   *
   * Belirme SÖNME DEĞİL: çizginin ucu kenar boyunca ilerliyor. Mekanizma
   * `strokeDasharray` + animasyonlu `strokeDashoffset` ve İKİSİ BİRLİKTE
   * çalışıyor — desen olmadan offset'in hiçbir etkisi yok, yani eksik kalan
   * taraf hatayı SESSİZ yapıyor (şekil tam çizili kalıyor, ekran çalışır
   * görünüyor).
   *
   * ⚠️ YÖN BİR TUR TERSİYDİ (kaydırmaya bağlı silinme): akışta poligon artık
   * hiç çizilmiyor, aynı desen tam ekrana geçişte ÇİZMEK için kullanılıyor.
   */
  describe('reveal', () => {
    it('`reveal` VERİLMEZSE DESEN DE YOK — şekil tam çizili', () => {
      // Tam ekran harita ve kampüs yüzeyi bu yolda: sınır orada asıl bilgi.
      expect(path().props.strokeDasharray).toBeUndefined();
      expect(path().props.animatedProps).toBeUndefined();
    });

    it('`reveal` verilince desen ŞEKLİN ÇEVRESİ kadar', () => {
      const reveal = { value: 0 } as any;
      const tree = render(
        <CampusPolygonOverlay
          geometry={withHole}
          projection={projection}
          reveal={reveal}
        />,
      );
      const dash = tree.UNSAFE_getAllByType(Path)[0].props.strokeDasharray;
      // [çizgi, boşluk] ve ikisi EŞİT: tek bir çizgi + bir o kadar boşluk, yani
      // desen şekil boyunca bir kez tekrarlıyor.
      expect(Array.isArray(dash)).toBe(true);
      expect(dash).toHaveLength(2);
      expect(dash[0]).toBe(dash[1]);
      /**
       * ⚠️ UZUNLUK EN UZUN HALKADAN: desen SVG'de alt yol başına sıfırlanıyor,
       * yani tek bir sayı hem dış halkayı hem avluyu kapsamak zorunda. Toplam
       * alınsaydı en uzun halka bile yarı yolda kalırdı; avlununki alınsaydı
       * dış halka hiç bitmezdi.
       */
      const [outer] = projectCampusGeometry(
        withHole,
        projection,
        projection.boxWidth / 2,
        projection.boxHeight / 2,
      );
      expect(dash[0]).toBeCloseTo(
        Math.max(
          ringPerimeter(outer.outer),
          ...outer.holes.map(ringPerimeter),
        ),
        4,
      );
      // Dış halka avludan uzun: ölçünün gerçekten "en uzun" olduğunu çivile.
      expect(ringPerimeter(outer.outer)).toBeGreaterThan(
        ringPerimeter(outer.holes[0]),
      );
    });
  });

  it('çizilecek halka yoksa hiç render etmiyor', () => {
    const empty: CampusGeometry = { type: 'Polygon', coordinates: [] };
    const tree = render(
      <CampusPolygonOverlay geometry={empty} projection={projection} />,
    );
    expect(tree.toJSON()).toBeNull();
  });
});
