/**
 * Friends havuz sorusunun metin sözleşmesi.
 *
 * Soru üç ayrı yüzeyde soruluyor (kayıt adımı, mod kurulum sheet'i, mevcut
 * kullanıcılar için tek seferlik sheet) ve üçü de AYNI anahtarları okuyor.
 * Bir dilde anahtar eksikse i18next ham anahtarı basar — kullanıcı
 * "discover.mode.friendsPoolTitle" görür.
 *
 * Ayrıca filtredeki başlık: `interestedIn.title` "İlgi Alanı" idi ve
 * kullanıcıya HOBİ bölümü gibi okunuyordu (filtrede ayrıca gerçek bir
 * "Hobiler" bölümü var). Kanonik dil ModeSetupSheet'in sorusu.
 */

import tr from '@/shared/i18n/translations/tr';
import en from '@/shared/i18n/translations/en';

const POOL_KEYS = [
  'friendsPoolTitle',
  'friendsPoolDescription',
  'friendsPoolRequired',
] as const;

describe('Friends havuz sorusu metinleri', () => {
  it.each(POOL_KEYS)('%s iki dilde de dolu', (key) => {
    expect((tr.discover.mode as any)[key]).toBeTruthy();
    expect((en.discover.mode as any)[key]).toBeTruthy();
  });

  it('havuz sorusu bir soru cümlesi (kayıt adımıyla aynı ton)', () => {
    expect(tr.discover.mode.friendsPoolTitle).toMatch(/\?$/);
    expect(en.discover.mode.friendsPoolTitle).toMatch(/\?$/);
  });
});

describe('filtre başlığı', () => {
  it('artık hobiyle karışan "İlgi Alanı" değil', () => {
    expect(tr.discover.filters.interestedIn.title).not.toBe('İlgi Alanı');
  });

  it('hobi bölümünün başlığıyla karışmıyor', () => {
    // `/i` bayrağı burada İŞE YARAMIYOR: JS'in varsayılan case-folding'i
    // Türkçe noktalı İ'yi 'i'ye indirmiyor ('i' + birleşen nokta oluyor), yani
    // /ilgi alan/i 'İlgi Alanı' ile EŞLEŞMİYOR ve test her durumda geçerdi.
    // Karşılaştırma Türkçe yerelle yapılıyor.
    const trTitle = tr.discover.filters.interestedIn.title.toLocaleLowerCase('tr');
    expect(trTitle).not.toContain('alan');
    expect(en.discover.filters.interestedIn.title.toLowerCase()).not.toBe(
      'interests',
    );
  });

  it('seçenek etiketleri iki dilde de duruyor', () => {
    for (const k of ['men', 'women', 'nonBinary'] as const) {
      expect(tr.discover.filters.interestedIn[k]).toBeTruthy();
      expect(en.discover.filters.interestedIn[k]).toBeTruthy();
    }
  });
});
