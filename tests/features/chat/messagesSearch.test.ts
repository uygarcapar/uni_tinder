import { conversationMatchesQuery } from '@/features/chat/conversationSearch';

describe('conversationMatchesQuery', () => {
  it('Türkçe harf farkına bakmadan partner adıyla eşleşir', () => {
    const conv = { partnerDisplayName: 'İrem', lastMessagePreview: null };
    expect(conversationMatchesQuery(conv, 'irem')).toBe(true);
  });

  it('son mesaj önizlemesindeki kelimeyle eşleşir', () => {
    const conv = { partnerDisplayName: 'Ayşe', lastMessagePreview: 'yarın görüşürüz' };
    expect(conversationMatchesQuery(conv, 'goru')).toBe(true);
  });

  it('boş sorgu her sohbeti döndürür', () => {
    const conv = { partnerDisplayName: 'Ayşe', lastMessagePreview: null };
    expect(conversationMatchesQuery(conv, '')).toBe(true);
  });

  it('yalnız boşluk sorgusu her sohbeti döndürür', () => {
    const conv = { partnerDisplayName: 'Ayşe', lastMessagePreview: null };
    expect(conversationMatchesQuery(conv, '   ')).toBe(true);
  });

  it('ilgisiz sorguyla eşleşmez', () => {
    const conv = { partnerDisplayName: 'Ayşe', lastMessagePreview: 'merhaba' };
    expect(conversationMatchesQuery(conv, 'zeynep')).toBe(false);
  });

  /**
   * iOS'ta otomatik düzeltme ÖNERİSİNİ KABUL ETMEK sonuna bir boşluk koyuyor:
   * kullanıcı adı yazıp öneriye dokunuyor ve liste bomboş oluyordu. Eski kod
   * `searchQuery.trim().toLowerCase()` ile kırpıyordu; `foldTr` kırpmıyor ve
   * boşluk yalnız "boş sorgu" kısa devresinde kırpılıyordu, EŞLEŞMEDE ham
   * sorgu kullanılıyordu.
   */
  describe('baştaki/sondaki boşluk eşleşmeyi bozmuyor', () => {
    const conv = { partnerDisplayName: 'İrem', lastMessagePreview: null };

    it.each([
      ['sonda boşluk', 'irem '],
      ['başta boşluk', ' irem'],
      ['iki yanda boşluk', '  irem  '],
      ['sekme', '\tirem\t'],
      ['satır sonu', 'irem\n'],
    ])('%s', (_label, query) => {
      expect(conversationMatchesQuery(conv, query)).toBe(true);
    });

    it('kelime ARASINDAKİ boşluğa dokunmuyor', () => {
      const c = { partnerDisplayName: 'Elif İnci', lastMessagePreview: null };
      expect(conversationMatchesQuery(c, ' elif inci ')).toBe(true);
      expect(conversationMatchesQuery(c, 'elifinci')).toBe(false);
    });
  });
});
