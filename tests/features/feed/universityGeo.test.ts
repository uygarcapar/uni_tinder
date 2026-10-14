/**
 * Üniversite koordinatının çözümü.
 *
 * ⚠️ TEST EDİLEN ŞEY YANLIŞ YERE PIN: koordinat bulunamadığında `null` dönmek
 * zorunda, çünkü çağıran şeridi O ZAMAN HİÇ ÇİZMİYOR. Bir "makul varsayılan"
 * (ör. Ankara) döndürülse kullanıcı başka bir şehri kendi kampüsü sanırdı.
 */

import { resolveUniversityCoordinate } from '@/features/feed/universityGeo';

describe('resolveUniversityCoordinate', () => {
  it('sunucunun lat/lon alanlarını kullanıyor (sözleşmedeki adlar)', () => {
    const coord = resolveUniversityCoordinate('itu.edu.tr', {
      domain: 'itu.edu.tr',
      name: 'İTÜ',
      lat: 41.1,
      lon: 29.02,
    } as any);
    expect(coord).toEqual({
      latitude: 41.1,
      longitude: 29.02,
      isApproximate: false,
    });
  });

  it('latitude/longitude adlandırması da okunuyor', () => {
    // Aynı bilgi kart DTO'larında bu adlarla geliyor; iki adlandırma arasında
    // kalmak bir alan adı hatasını sessiz boş haritaya çevirir.
    const coord = resolveUniversityCoordinate('x.edu.tr', {
      domain: 'x.edu.tr',
      name: 'X',
      latitude: 38.4,
      longitude: 27.1,
    } as any);
    expect(coord?.latitude).toBe(38.4);
    expect(coord?.longitude).toBe(27.1);
  });

  it('isApproximate taşınıyor — alan yoksa KESİN varsayılıyor', () => {
    // Sunucu yalnız YAKLAŞIK olanları işaretliyor, tersi değil.
    const approx = resolveUniversityCoordinate('x.edu.tr', {
      domain: 'x.edu.tr',
      name: 'X',
      lat: 39.9,
      lon: 32.8,
      isApproximate: true,
    } as any);
    expect(approx?.isApproximate).toBe(true);

    const exact = resolveUniversityCoordinate('y.edu.tr', {
      domain: 'y.edu.tr',
      name: 'Y',
      lat: 39.9,
      lon: 32.8,
    } as any);
    expect(exact?.isApproximate).toBe(false);
  });

  it('koordinat yoksa sunucunun ŞEHRİ il merkezine çözülüyor (yaklaşık)', () => {
    const coord = resolveUniversityCoordinate('x.edu.tr', {
      domain: 'x.edu.tr',
      name: 'X',
      city: 'İzmir',
    } as any);
    expect(coord).not.toBeNull();
    expect(coord!.isApproximate).toBe(true);
    expect(coord!.latitude).toBeGreaterThan(38);
    expect(coord!.latitude).toBeLessThan(39);
  });

  /**
   * ⚠️ EN ÖNEMLİ DAL — İSTEMCİ YEDEĞİ YOK.
   *
   * Bir tur elle yazılmış domain→şehir tablosu vardı; sunucu sözleşmesi
   * kesinleşince silindi (205 üniversitenin hepsinde koordinat var). Sunucu
   * hiçbir şey vermiyorsa harita ÇİZİLMİYOR.
   */
  it.each([
    [null, null],
    [undefined, undefined],
    ['', null],
    ['metu.edu.tr', null],
    ['bilinmeyen.edu.tr', { domain: 'bilinmeyen.edu.tr', name: 'X' }],
  ])('koordinat yok (%p) → null, harita çizilmiyor', (domain, option) => {
    expect(resolveUniversityCoordinate(domain as any, option as any)).toBeNull();
  });
});
