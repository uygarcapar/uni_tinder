/**
 * Üniversite koordinatının çözümü.
 *
 * ⚠️ TEST EDİLEN ŞEY YANLIŞ YERE PIN: koordinat bulunamadığında `null` dönmek
 * zorunda, çünkü çağıran şeridi O ZAMAN HİÇ ÇİZMİYOR. Bir "makul varsayılan"
 * (ör. Ankara) döndürülse kullanıcı başka bir şehri kendi kampüsü sanırdı.
 */

import { resolveUniversityCoordinate } from '@/features/feed/universityGeo';

describe('resolveUniversityCoordinate', () => {
  it('SUNUCUNUN koordinatı her şeyi eziyor', () => {
    const coord = resolveUniversityCoordinate('itu.edu.tr', {
      domain: 'itu.edu.tr',
      name: 'İTÜ',
      lat: 41.1,
      lon: 29.02,
    } as any);
    expect(coord).toEqual({ latitude: 41.1, longitude: 29.02 });
  });

  it('latitude/longitude adlandırması da kabul ediliyor', () => {
    // Backend sözleşmesi henüz kesin değil; iki yaygın adlandırma da okunuyor.
    const coord = resolveUniversityCoordinate('x.edu.tr', {
      domain: 'x.edu.tr',
      name: 'X',
      latitude: 38.4,
      longitude: 27.1,
    } as any);
    expect(coord).toEqual({ latitude: 38.4, longitude: 27.1 });
  });

  it('koordinat yoksa sunucunun ŞEHRİ il merkezine çözülüyor', () => {
    const coord = resolveUniversityCoordinate('x.edu.tr', {
      domain: 'x.edu.tr',
      name: 'X',
      city: 'İzmir',
    } as any);
    expect(coord).not.toBeNull();
    // İzmir'in il merkezi — tam değer cityCoordinates'ten, burada yalnız
    // "çözülebildi" ölçülüyor.
    expect(coord!.latitude).toBeGreaterThan(38);
    expect(coord!.latitude).toBeLessThan(39);
  });

  it('sunucu hiçbir şey vermezse İSTEMCİ YEDEĞİ devrede', () => {
    const coord = resolveUniversityCoordinate('metu.edu.tr', null);
    expect(coord).not.toBeNull();
    // Ankara.
    expect(coord!.latitude).toBeGreaterThan(39);
    expect(coord!.latitude).toBeLessThan(40.5);
  });

  it('domain büyük harfli/boşluklu gelse de çözülüyor', () => {
    expect(resolveUniversityCoordinate('  ITU.EDU.TR  ', null)).not.toBeNull();
  });

  /** ⚠️ EN ÖNEMLİ DAL. */
  it.each([null, undefined, '', 'bilinmeyen.edu.tr'])(
    'çözülemeyen domain (%p) → null, harita ÇİZİLMİYOR',
    (domain) => {
      expect(resolveUniversityCoordinate(domain as any, null)).toBeNull();
    },
  );

  it('yedek tabloda olmayan üniversite için de null', () => {
    // Tablo KASITLI OLARAK EKSİK: 200+ üniversiteyi istemciye gömmek ölü yük
    // ve bakım borcu. Sunucu geo alanını gönderince tablo ölü koda dönüyor.
    expect(
      resolveUniversityCoordinate('kucukbirkampus.edu.tr', {
        domain: 'kucukbirkampus.edu.tr',
        name: 'Küçük Kampüs',
      } as any),
    ).toBeNull();
  });
});
