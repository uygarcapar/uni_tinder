/**
 * Akış metin sınırları — code point sayımı ve tavan çözümü.
 *
 * Test edilen asıl şey: sunucuyla İSTEMCİNİN AYNI ŞEYİ SAYMASI. Backend rune
 * sayıyor (sözleşme §0: "emoji 1 karakter sayılır — [...text].length"), JS'in
 * `.length`i UTF-16 birimi sayıyor. Astral bir emoji orada 2, sunucuda 1: iki
 * taraf farklı sayınca sayaç ya kullanıcıyı 200 karakterde kesiyor ya da
 * sunucunun saymadığı bir taşma gösteriyor.
 *
 * İkinci kritik nokta clamp'in surrogate pair'i YARMAMASI. TextInput'un
 * `maxLength`i UTF-16 sayar ve bir emojiyi ortadan bölüp bozuk karakter
 * bırakabilir — bu yüzden clamp code point üzerinden yapılıyor.
 */

import {
  FEED_POST_MAX_LENGTH,
  FEED_REPLY_MAX_LENGTH,
  clampFeedText,
  feedTextLength,
  formatExpiresIn,
  formatQuotaReset,
  resolveFeedPostMaxLength,
  resolveFeedReplyMaxLength,
} from '@/features/feed/feedText';

// i18n yerine anahtarı + sayıyı döndür: test metne değil HANGİ anahtarın
// seçildiğine ve interpolasyona bakıyor.
const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length > 0
    ? `${key}:${JSON.stringify(options)}`
    : key;

describe('feedTextLength — code point sayımı', () => {
  it('ASCII metinde .length ile aynı', () => {
    expect(feedTextLength('merhaba')).toBe(7);
  });

  it('astral emoji 1 sayılır (.length 2 derdi)', () => {
    expect('😀'.length).toBe(2);
    expect(feedTextLength('😀')).toBe(1);
  });

  it('Türkçe karakterler 1 sayılır', () => {
    expect(feedTextLength('ığüşöçİĞÜŞÖÇ')).toBe(12);
  });

  it('boş metin 0', () => {
    expect(feedTextLength('')).toBe(0);
  });

  it('satır sonları sayılır (gönderi gövdesinde korunuyorlar)', () => {
    expect(feedTextLength('a\n\nb')).toBe(4);
  });
});

describe('clampFeedText', () => {
  it('sınırın altındaki metne dokunmaz — AYNI referans döner', () => {
    const text = 'kısa';
    expect(clampFeedText(text, 10)).toBe(text);
  });

  it('tam sınırdaki metne dokunmaz', () => {
    expect(clampFeedText('abcde', 5)).toBe('abcde');
  });

  it('code point sınırına kırpar', () => {
    expect(clampFeedText('abcdef', 3)).toBe('abc');
  });

  it('surrogate pair\'i YARMAZ — bozuk karakter bırakmaz', () => {
    // '😀😀' UTF-16'da 4 birim. maxLength=3 olsaydı ikinci emojiyi ortadan
    // bölüp yarım surrogate bırakırdı.
    const clamped = clampFeedText('😀😀', 1);
    expect(clamped).toBe('😀');
    expect(feedTextLength(clamped)).toBe(1);
    expect(clamped.length).toBe(2); // tam pair korundu
  });

  it('emoji + harf karışımını doğru noktadan keser', () => {
    expect(clampFeedText('a😀b', 2)).toBe('a😀');
  });

  it('limit 0 ise boş metin döner', () => {
    expect(clampFeedText('abc', 0)).toBe('');
  });
});

describe('resolveFeedPostMaxLength / resolveFeedReplyMaxLength', () => {
  it('sunucu değeri yoksa istemci tavanı', () => {
    expect(resolveFeedPostMaxLength(undefined)).toBe(FEED_POST_MAX_LENGTH);
    expect(resolveFeedPostMaxLength(null)).toBe(FEED_POST_MAX_LENGTH);
    expect(resolveFeedReplyMaxLength(undefined)).toBe(FEED_REPLY_MAX_LENGTH);
  });

  it('sunucu daha KÜÇÜK gönderirse sunucu kazanır', () => {
    expect(resolveFeedPostMaxLength(280)).toBe(280);
    expect(resolveFeedReplyMaxLength(100)).toBe(100);
  });

  it('sunucu daha BÜYÜK gönderirse istemci tavanı kazanır', () => {
    // Aşağı çekmek güvenli (kullanıcı erken kesilir, 400 üretmez); yukarı
    // çıkmak yeni istemci sürümüyle birlikte yapılmalı.
    expect(resolveFeedPostMaxLength(1000)).toBe(FEED_POST_MAX_LENGTH);
    expect(resolveFeedReplyMaxLength(500)).toBe(FEED_REPLY_MAX_LENGTH);
  });

  it('0 ve negatif anlamsız → istemci tavanı', () => {
    expect(resolveFeedPostMaxLength(0)).toBe(FEED_POST_MAX_LENGTH);
    expect(resolveFeedPostMaxLength(-5)).toBe(FEED_POST_MAX_LENGTH);
    expect(resolveFeedReplyMaxLength(0)).toBe(FEED_REPLY_MAX_LENGTH);
  });

  it('gönderi ve yanıt tavanları birbirine karışmaz', () => {
    expect(FEED_POST_MAX_LENGTH).toBe(400);
    expect(FEED_REPLY_MAX_LENGTH).toBe(150);
    // Yanıt çözücüsüne 400 vermek yanıt tavanını yükseltmez.
    expect(resolveFeedReplyMaxLength(400)).toBe(150);
  });
});

describe('formatExpiresIn — İLERİ yön', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');

  it('3 günden fazla kalmışsa gün anahtarı', () => {
    expect(formatExpiresIn('2026-10-04T18:00:00Z', t, now)).toBe(
      'feed.mine.expiresInDays:{"count":3}',
    );
  });

  it('bir günden az kalmışsa saat anahtarı', () => {
    expect(formatExpiresIn('2026-10-01T17:30:00Z', t, now)).toBe(
      'feed.mine.expiresInHours:{"count":5}',
    );
  });

  it('bir saatten az kalmışsa dakika anahtarı', () => {
    expect(formatExpiresIn('2026-10-01T12:20:00Z', t, now)).toBe(
      'feed.mine.expiresInMinutes:{"count":20}',
    );
  });

  it('bir dakikanın altı için 1 dakika gösterir ("0 dakika" demez)', () => {
    expect(formatExpiresIn('2026-10-01T12:00:20Z', t, now)).toBe(
      'feed.mine.expiresInMinutes:{"count":1}',
    );
  });

  it('geçmiş tarih → süresi doldu', () => {
    expect(formatExpiresIn('2026-09-30T12:00:00Z', t, now)).toBe(
      'feed.mine.expired',
    );
  });

  it('tam şimdi → süresi doldu', () => {
    expect(formatExpiresIn('2026-10-01T12:00:00Z', t, now)).toBe(
      'feed.mine.expired',
    );
  });

  it('null / bozuk tarih → null (uydurma metin yok)', () => {
    expect(formatExpiresIn(null, t, now)).toBeNull();
    expect(formatExpiresIn(undefined, t, now)).toBeNull();
    expect(formatExpiresIn('bozuk', t, now)).toBeNull();
  });

  it('Z\'siz damga da UTC okunur (parseUtc) — 3 saat kaymaz', () => {
    // dateUtc katmanı: offset'siz ISO yerel saat sayılsaydı TR'de 3 saat kayardı.
    const withZ = formatExpiresIn('2026-10-04T18:00:00Z', t, now);
    const withoutZ = formatExpiresIn('2026-10-04T18:00:00', t, now);
    expect(withoutZ).toBe(withZ);
  });
});

describe('formatQuotaReset', () => {
  it('geçerli damgada saat interpolasyonlu anahtar döner', () => {
    const out = formatQuotaReset('2026-10-01T17:30:00Z', t);
    expect(out).toContain('feed.quota.reset');
    expect(out).toMatch(/"time":"\d{2}:\d{2}"/);
  });

  it('null / bozuk damgada null — "20:30" SABİT YAZILMAZ', () => {
    // Sunucu saati İstanbul'a göre hesaplıyor; uydurulmuş bir saat yanlış
    // bekleme yaratır.
    expect(formatQuotaReset(null, t)).toBeNull();
    expect(formatQuotaReset(undefined, t)).toBeNull();
    expect(formatQuotaReset('bozuk', t)).toBeNull();
  });
});
