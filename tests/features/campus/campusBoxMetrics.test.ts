import { campusBoxMetrics } from '@/features/campus/components/CampusInfoBox';

/**
 * ÇERÇEVE REÇETESİNİN ÖLÇEKLENMESİ.
 *
 * Reçeteyi şeridin kutuları okuyor (anı kartı + poster karesi, 200–300pt) ve
 * oran tek yerde duruyor: iki sayı elle ayarlanırsa kaçınılmaz olarak ayrışır
 * ve yan yana duran kutular "aynı kart değil" gibi okunur.
 *
 * Çivilenen iki şey:
 *  1. REFERANS BOYDA KANONİK SAYILAR (3/2/28). Çizgi ve boşluk bir tur 7/4'tü
 *     ve istek üzerine inceltildi (gerekçe `RING_WIDTH`te); ölçekleme onları
 *     bozarsa şeritteki kutu sessizce değişir.
 *  2. ÇİZGİ BOŞLUKTAN KALIN. İnceltmeden sonra oran zaten tabana yakın, yani
 *     bu kuralı ayakta tutan şey `gap + 1` tabanı — o olmasa küçük ölçekte iki
 *     sayı eşitlenip hiyerarşi kayboluyor (çerçeve yine "kutunun kendi
 *     kenarı" gibi).
 */
describe('campusBoxMetrics', () => {
  it('referans boyda KANONİK sayılar — şeridin kutusu değişmiyor', () => {
    expect(campusBoxMetrics(222)).toEqual({ ring: 3, gap: 2, radius: 28 });
  });

  it('çizgi HER ÖLÇEKTE boşluktan kalın', () => {
    for (const size of [48, 64, 68, 84, 120, 200, 222, 300]) {
      const m = campusBoxMetrics(size);
      expect(m.ring).toBeGreaterThan(m.gap);
    }
  });

  it('tabanlar var — çerçeve render artefaktına inmiyor', () => {
    const tiny = campusBoxMetrics(24);
    expect(tiny.gap).toBeGreaterThanOrEqual(2);
    expect(tiny.ring).toBeGreaterThanOrEqual(2);
  });

  it('iç yarıçap POZİTİF kalıyor — iç blok dış kenarla kesişmiyor', () => {
    for (const size of [48, 68, 84, 222, 300]) {
      const m = campusBoxMetrics(size);
      expect(m.radius - (m.ring + m.gap)).toBeGreaterThan(0);
    }
  });
});
