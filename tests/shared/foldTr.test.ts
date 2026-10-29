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
    // BÜYÜK aksanlı sesliler: harf haritası yalnız küçüklerini (â/î/û)
    // taşıyordu, büyüğü haritadan geçmeyip `toLowerCase()`tan aksanıyla
    // çıkıyordu — yani `Âdem` → `âdem` ve `adem` sorgusu kaçırıyordu. Aksan
    // sınıfının tamamını birleşen-işaret süzgeci kapatıyor (bkz. foldTr).
    ['Âdem', 'adem'],
    ['ÂDEM', 'adem'],
    ['Îlker', 'ilker'],
    ['Ûmit', 'umit'],
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
