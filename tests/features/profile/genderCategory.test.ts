/**
 * "Havuz sorusunu kime soracağız?" kararının saf hâli.
 *
 * Friends modunda eşleşme kuralı aynı cinsiyet; ikili kategorilerde değeri
 * SUNUCU türetip kilitliyor, yalnız Non-Binary kullanıcıya havuzu soruyoruz.
 * Kayıt sırasında profil henüz sunucuda olmadığı için bu kararı istemci
 * kataloğdan vermek zorunda.
 *
 * Kritik kısıt: backend `Transgender`ı HEM Erkek HEM Kadın kategorisinde
 * döndürüyor ve profilde yalnız alt cinsiyetin enumName'i saklanıyor. Yani
 * "alt cinsiyet → kategori" tek anlamlı DEĞİL. Bu yüzden kural şu: belirsizse
 * SORMA, sunucunun türetmesine bırak. Yanlış tarafa düşmenin bedeli,
 * kullanıcıya ona ait olmayan bir soruyu sormak.
 */

import { isNonBinaryOnlyGender } from '@/features/profile/genderCategory';

const CATS = [
  {
    categoryEnumName: 'Male',
    subGenders: [{ enumName: 'Male' }, { enumName: 'Transgender' }],
  },
  {
    categoryEnumName: 'Female',
    subGenders: [{ enumName: 'Female' }, { enumName: 'Transgender' }],
  },
  {
    categoryEnumName: 'NonBinary',
    subGenders: [{ enumName: 'NonBinary' }, { enumName: 'Agender' }],
  },
] as any;

describe('isNonBinaryOnlyGender', () => {
  it('yalnız Non-Binary kategorisinde görünen alt cinsiyette true', () => {
    expect(isNonBinaryOnlyGender(CATS, 'Agender')).toBe(true);
    expect(isNonBinaryOnlyGender(CATS, 'NonBinary')).toBe(true);
  });

  it('ikili kategorideki alt cinsiyette false', () => {
    expect(isNonBinaryOnlyGender(CATS, 'Male')).toBe(false);
    expect(isNonBinaryOnlyGender(CATS, 'Female')).toBe(false);
  });

  it('iki ikili kategoride birden görünen alt cinsiyette false', () => {
    expect(isNonBinaryOnlyGender(CATS, 'Transgender')).toBe(false);
  });

  it('hem Non-Binary hem ikili kategoride görünen alt cinsiyette false', () => {
    const ambiguous = [
      ...CATS,
      { categoryEnumName: 'NonBinary', subGenders: [{ enumName: 'Male' }] },
    ] as any;
    expect(isNonBinaryOnlyGender(ambiguous, 'Male')).toBe(false);
  });

  it('katalog boşken false', () => {
    expect(isNonBinaryOnlyGender([], 'Agender')).toBe(false);
  });

  it('katalog gelmemişken false', () => {
    expect(isNonBinaryOnlyGender(undefined as any, 'Agender')).toBe(false);
  });

  it('cinsiyet yokken false', () => {
    expect(isNonBinaryOnlyGender(CATS, null)).toBe(false);
    expect(isNonBinaryOnlyGender(CATS, undefined)).toBe(false);
    expect(isNonBinaryOnlyGender(CATS, '')).toBe(false);
  });

  it('katalogda olmayan alt cinsiyette false', () => {
    expect(isNonBinaryOnlyGender(CATS, 'Bilinmeyen')).toBe(false);
  });

  it('subGenders alanı bozuk gelen kategoriyi atlıyor', () => {
    const broken = [
      { categoryEnumName: 'Male', subGenders: null },
      { categoryEnumName: 'NonBinary', subGenders: [{ enumName: 'Agender' }] },
    ] as any;
    expect(isNonBinaryOnlyGender(broken, 'Agender')).toBe(true);
  });
});
