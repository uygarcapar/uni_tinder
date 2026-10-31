import { campusBoxMetrics } from '@/features/campus/components/CampusInfoBox';

/**
 * ÇERÇEVE REÇETESİNİN ÖLÇEKLENMESİ.
 *
 * Reçeteyi şeridin kutuları okuyor (anı kartı + poster karesi, 200–300pt) ve
 * oran tek yerde duruyor: iki sayı elle ayarlanırsa kaçınılmaz olarak ayrışır
 * ve yan yana duran kutular "aynı kart değil" gibi okunur.
 *
 * Çivilenen iki şey:
 *  1. KANONİK SAYILAR: çizgi 0.5, boşluk 0 (istek: "borderlarını 0.5px yap ve
 *     border ile foto arasındaki boşluğu kaldır"), köşe referans boyda 28.
 *     Tarihçe üç tur ters yöne gitti (2/14 → 7/4 → 3/2 → 0.5/0) ve her turda
 *     şeridin kutusu sessizce değişti; bu test o sayıları çiviliyor.
 *  2. ÇİZGİ ÖLÇEKLE KAYBOLMUYOR. Eski reçete çizgiyi oranla çarpıyordu ve
 *     küçük kutuda tabanlar onu 2pt'ye geri kalınlaştırıyordu. 0.5 ÖLÇEKTEN
 *     BAĞIMSIZ: oranla çarpılsa 42pt'lik kutuda 0.1pt'ye, yani hiçliğe inerdi.
 */
describe('campusBoxMetrics', () => {
  it('referans boyda KANONİK sayılar — şeridin kutusu değişmiyor', () => {
    expect(campusBoxMetrics(222)).toEqual({ ring: 0.5, gap: 0, radius: 28 });
  });

  it('çizgi HER ÖLÇEKTE 0.5 — kıl çizgi ölçekle erimiyor', () => {
    for (const size of [24, 48, 64, 68, 84, 120, 200, 222, 300, 600]) {
      expect(campusBoxMetrics(size).ring).toBe(0.5);
    }
  });

  /**
   * ⚠️🔴 BOŞLUK ÇİZGİNİN İŞİNE BAĞLI ve iki kez yön değiştirdi: çerçeveyken 0,
   * kenar bir ÖMÜR GÖSTERGESİ olunca 5 (yapışık gösterge fotonun kenarı gibi
   * okunuyordu), gösterge kalkıp kalan süre yine YAZIYA dönünce tekrar 0.
   * Kenarın tek işi yine fotoğrafı zeminden ayırmak.
   */
  it('BOŞLUK YOK — çizgi fotoğrafın kenarına oturuyor', () => {
    for (const size of [24, 84, 222, 300]) {
      expect(campusBoxMetrics(size).gap).toBe(0);
    }
  });

  it('köşe ölçekle büyüyor — ölçeklenen tek sayı o', () => {
    expect(campusBoxMetrics(111).radius).toBe(14);
    expect(campusBoxMetrics(444).radius).toBe(56);
  });

  it('iç yarıçap POZİTİF kalıyor — iç blok dış kenarla kesişmiyor', () => {
    for (const size of [48, 68, 84, 222, 300]) {
      const m = campusBoxMetrics(size);
      expect(m.radius - (m.ring + m.gap)).toBeGreaterThan(0);
    }
  });
});
