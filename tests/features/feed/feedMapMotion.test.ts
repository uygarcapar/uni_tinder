import {
  MAP_CHROME_FADE_MS,
  MAP_MOTION_MS,
  MAP_POLYGON_DRAW_MS,
  MAP_STRIP_ENTRY_MS,
} from '@/features/feed/components/feedMapMotion';

/**
 * TAM EKRANA GEÇİŞİN KADEMELERİ.
 *
 * ⚠️🔴 BU DOSYA İKİ KEZ BOŞALDI. Önce "bandın kaydırmayla süzülmesi"
 * (paralaks) buradaydı ve geri alındı; sonra "poligonun kaydırmayla silinmesi"
 * ve "anların karelerinin eşikleri" buradaydı — ikisi de bant kaldırılınca
 * (istek) dayanaksız kaldı: akışta ne bant var ne de orada çizilen bir poligon.
 * Kalan tek şey açılışın kademeleri.
 *
 * Sıra ekranda doğrudan okunuyor ve yanlış sıralama "her şey bir anda oldu"
 * hissi veriyor — o yüzden kademeler arası İLİŞKİ çivili, tek tek sayılar değil.
 */
describe('açılışın kademeleri', () => {
  it('harita en HIZLI kademe — geri kalanı onun üstüne biniyor', () => {
    expect(MAP_MOTION_MS).toBeLessThan(MAP_CHROME_FADE_MS);
    expect(MAP_MOTION_MS).toBeLessThan(MAP_STRIP_ENTRY_MS);
    expect(MAP_MOTION_MS).toBeLessThan(MAP_POLYGON_DRAW_MS);
  });

  it('şeridin girişi haritanın hareketinden bir TIK uzun', () => {
    // İki hareket arka arkaya okunsun, aynı hareketin devamı gibi görünmesin.
    expect(MAP_STRIP_ENTRY_MS).toBeGreaterThan(MAP_MOTION_MS);
    expect(MAP_STRIP_ENTRY_MS).toBeLessThan(MAP_MOTION_MS * 2);
  });

  /**
   * ⚠️ SINIRIN ÇİZİLMESİ EN YAVAŞ KADEME (istek: "çizgi animasyonla yavaşça
   * çizilsin"). Açılışa yakın bir süreye sıkıştırılırsa çizim hareketin içinde
   * kaybolur ve kullanıcı şeklin KURULDUĞUNU değil "zaten orada olduğunu"
   * görür.
   */
  it('sınırın çizilmesi BELİRGİN biçimde en yavaş', () => {
    expect(MAP_POLYGON_DRAW_MS).toBeGreaterThan(MAP_MOTION_MS * 3);
    expect(MAP_POLYGON_DRAW_MS).toBeGreaterThan(MAP_CHROME_FADE_MS);
    expect(MAP_POLYGON_DRAW_MS).toBeGreaterThan(MAP_STRIP_ENTRY_MS);
  });
});
