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
});
