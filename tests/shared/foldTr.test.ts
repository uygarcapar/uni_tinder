import { foldTr } from '@/shared/utils/foldTr';

describe('foldTr', () => {
  it.each([
    ['İrem', 'irem'],
    ['Işıl', 'ışıl'],
    ['Işıl', 'isil'],
    ['Özge', 'ozge'],
    ['Şule', 'sule'],
    ['ELIF', 'elif'],
    ['Elif İnci', 'inci'],
    ['Çağla', 'cagla'],
    ['ÜMİT', 'umit'],
    ['Gülşah', 'gulsah'],
  ])('%s içinde "%s" bulunuyor', (name, query) => {
    expect(foldTr(name).includes(foldTr(query))).toBe(true);
  });

  it('ilgisiz adı eşleştirmiyor', () => {
    expect(foldTr('Ayşe').includes(foldTr('ali'))).toBe(false);
  });

  it('null/undefined için boş string', () => {
    expect(foldTr(null)).toBe('');
    expect(foldTr(undefined)).toBe('');
  });
});
