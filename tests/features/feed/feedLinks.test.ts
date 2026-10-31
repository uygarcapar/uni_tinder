/**
 * Akış post gövdesinde link tespiti — saf parse.
 *
 * Test edilen asıl şey YANLIŞ POZİTİFLERİN YOKLUĞU. Politika gereği yalnız
 * şemalı (`http://`, `https://`) ve `www.` ile başlayan adresler link sayılıyor;
 * çıplak alan adı (`ornek.com`) BİLEREK dışarıda. Gerekçe: Türkçe metinde
 * çıplak alan adı regex'i "saat 3.30da", "bkz.Vikipedi" gibi şeyleri yakalıyor
 * ve en çok yanlış pozitif üreten şey, phishing'i en çok doğallaştıran şeydir —
 * kullanıcı mavi altı çizili yazıyı "uygulamanın onayladığı" sanmaya başlar.
 *
 * İkinci kritik nokta: GÖSTERİLEN metinle DOKUNULAN hedefin ayrılması.
 * `feedLinkDisplay` adresi kısaltıyor (taşma + alan adını kuyruğa gömen URL),
 * ama `url` her zaman tam hâliyle duruyor — açılan şey kısaltılmış metin olursa
 * kullanıcı başka bir yere gider.
 */

import {
  FEED_LINK_DISPLAY_MAX,
  feedLinkDisplay,
  parseFeedLinks,
} from '@/features/feed/feedLinks';

/** Testlerin okunurluğu için: segmentleri "tip:metin" dizisine indir. */
const shape = (body: string) =>
  parseFeedLinks(body).map((s) =>
    s.type === 'link' ? `link:${s.url}` : `text:${s.text}`,
  );

describe('parseFeedLinks — link sayılan şey', () => {
  it('https şemalı adresi yakalar', () => {
    expect(shape('bak https://ornek.com')).toEqual([
      'text:bak ',
      'link:https://ornek.com',
    ]);
  });

  it('http şemasını https\'e YÜKSELTMEZ', () => {
    // Zorla yükseltmek, http-only bir adrese dokunanı sessizce hataya götürür.
    expect(shape('http://ornek.com')).toEqual(['link:http://ornek.com']);
  });

  it('www. ile başlayana https ekler', () => {
    expect(shape('www.ornek.com')).toEqual(['link:https://www.ornek.com']);
  });

  it('büyük harfli şema ve host\'u küçük harfe indirir', () => {
    // Şema ve host büyük/küçük harfe DUYARSIZ, yol duyarlı. İkisini normalize
    // etmek `Linking.openURL`in büyük harfli şemayı kabul edip etmediğine dair
    // bir varsayımı ortadan kaldırıyor.
    expect(shape('HTTPS://ORNEK.COM')).toEqual(['link:https://ornek.com']);
  });

  it('metnin tamamı linkse tek segment döner', () => {
    expect(parseFeedLinks('https://ornek.com')).toHaveLength(1);
  });

  it('bir satırda iki linki ayrı ayrı yakalar', () => {
    expect(shape('https://a.com ve https://b.com')).toEqual([
      'link:https://a.com',
      'text: ve ',
      'link:https://b.com',
    ]);
  });

  it('satır sonlarını KORUR', () => {
    // Sunucu en fazla 2 boş satıra normalize ediyor, gövde olduğu gibi basılıyor.
    expect(shape('bir\n\nhttps://ornek.com\niki')).toEqual([
      'text:bir\n\n',
      'link:https://ornek.com',
      'text:\niki',
    ]);
  });
});

describe('parseFeedLinks — link SAYILMAYAN şeyler', () => {
  it('çıplak alan adını linklemez', () => {
    expect(shape('ornek.com adresine bak')).toEqual([
      'text:ornek.com adresine bak',
    ]);
  });

  it('ondalıklı sayıyı linklemez', () => {
    expect(shape('saat 3.30da buluşalım')).toEqual([
      'text:saat 3.30da buluşalım',
    ]);
  });

  it('noktadan sonra boşluksuz devam eden kelimeyi linklemez', () => {
    expect(shape('bkz.Vikipedi')).toEqual(['text:bkz.Vikipedi']);
  });

  it('javascript: şemasını linklemez', () => {
    expect(shape('javascript:alert(1)')).toEqual(['text:javascript:alert(1)']);
  });

  it('file: şemasını linklemez', () => {
    expect(shape('file:///etc/passwd')).toEqual(['text:file:///etc/passwd']);
  });

  it('noktasız host\'u linklemez', () => {
    // http://localhost:3000 — gerçek bir kullanıcı metninde yeri yok ve
    // noktasız host kuralı homograf/iç ağ adreslerini de kapıda tutuyor.
    expect(shape('http://localhost:3000')).toEqual([
      'text:http://localhost:3000',
    ]);
  });

  it('şemasız 300 karakterlik tek kelimeyi düz metin bırakır', () => {
    const token = 'a'.repeat(300);
    expect(shape(token)).toEqual([`text:${token}`]);
  });

  it('boş gövdede boş dizi döner', () => {
    expect(parseFeedLinks('')).toEqual([]);
  });
});

describe('parseFeedLinks — sondaki noktalama', () => {
  it('cümle sonundaki noktayı linkin dışında bırakır', () => {
    expect(shape('bak https://ornek.com.')).toEqual([
      'text:bak ',
      'link:https://ornek.com',
      'text:.',
    ]);
  });

  it('virgülü linkin dışında bırakır', () => {
    expect(shape('https://ornek.com, sonra')).toEqual([
      'link:https://ornek.com',
      'text:, sonra',
    ]);
  });

  it('üç noktayı linkin dışında bırakır', () => {
    expect(shape('https://ornek.com…')).toEqual([
      'link:https://ornek.com',
      'text:…',
    ]);
  });

  it('dengeli parantezi linkin İÇİNDE tutar', () => {
    // Vikipedi bağlantıları: .../Ay_(uydu) — kapanan parantez adresin parçası.
    expect(shape('https://tr.wikipedia.org/wiki/Ay_(uydu)')).toEqual([
      'link:https://tr.wikipedia.org/wiki/Ay_(uydu)',
    ]);
  });

  it('dengesiz kapanan parantezi dışarıda bırakır', () => {
    expect(shape('(https://ornek.com)')).toEqual([
      'text:(',
      'link:https://ornek.com',
      'text:)',
    ]);
  });

  it('yalnız noktalamadan oluşan bir adresi link saymaz', () => {
    expect(shape('https://...')).toEqual(['text:https://...']);
  });
});

describe('parseFeedLinks — host', () => {
  it('host\'u küçük harfe indirir', () => {
    expect(parseFeedLinks('HTTPS://ORNEK.COM/Yol')[0]).toMatchObject({
      host: 'ornek.com',
    });
  });

  it('host\'tan baştaki www.\'yi atar', () => {
    // Onay diyaloğunda gösterilen şey bu: "www." bir bilgi taşımıyor, alan
    // adını kısaltmak onu okunur tutuyor.
    expect(parseFeedLinks('www.ornek.com')[0]).toMatchObject({
      host: 'ornek.com',
    });
  });

  it('port ve yolu host\'a katmaz', () => {
    expect(parseFeedLinks('https://ornek.com:8443/a/b?x=1')[0]).toMatchObject({
      host: 'ornek.com',
    });
  });

  it('alt alan adını KORUR', () => {
    // "giris.ornek.com" ile "ornek.com" farklı yerler; diyalogda birini
    // diğeriymiş gibi göstermek tam olarak gizlemek istediğimiz şey.
    expect(parseFeedLinks('https://giris.ornek.com')[0]).toMatchObject({
      host: 'giris.ornek.com',
    });
  });
});

describe('parseFeedLinks — url bozulmazlığı', () => {
  it('yoldaki büyük/küçük harfi korur', () => {
    // Yol büyük/küçük harfe DUYARLI; host gibi normalize edilemez.
    expect(parseFeedLinks('https://ornek.com/Yol/Abc')[0]).toMatchObject({
      url: 'https://ornek.com/Yol/Abc',
    });
  });

  it('sorgu dizesini korur', () => {
    expect(parseFeedLinks('https://ornek.com/a?x=1&y=2')[0]).toMatchObject({
      url: 'https://ornek.com/a?x=1&y=2',
    });
  });

  it('emojiden sonra gelen linki bozmaz', () => {
    expect(shape('😀 https://ornek.com')).toEqual([
      'text:😀 ',
      'link:https://ornek.com',
    ]);
  });
});

describe('feedLinkDisplay', () => {
  it('şemayı atar', () => {
    expect(feedLinkDisplay('https://ornek.com')).toBe('ornek.com');
  });

  it('baştaki www.\'yi atar', () => {
    expect(feedLinkDisplay('https://www.ornek.com')).toBe('ornek.com');
  });

  it('sondaki tek eğik çizgiyi atar', () => {
    expect(feedLinkDisplay('https://ornek.com/')).toBe('ornek.com');
  });

  it('kısa adresi olduğu gibi gösterir', () => {
    expect(feedLinkDisplay('https://ornek.com/a/b')).toBe('ornek.com/a/b');
  });

  it('uzun adresi tavanda kısaltır', () => {
    const display = feedLinkDisplay(
      `https://ornek.com/${'yol/'.repeat(40)}son`,
    );
    expect([...display]).toHaveLength(FEED_LINK_DISPLAY_MAX);
    expect(display.endsWith('…')).toBe(true);
    // Alan adı BAŞTA kalıyor — kısaltmanın tek amacı bu.
    expect(display.startsWith('ornek.com/')).toBe(true);
  });

  it('kısaltmayı code point üzerinden yapar (emojiyi yarmaz)', () => {
    // `.slice` UTF-16 birimi keser ve astral bir karakteri ortadan bölüp bozuk
    // glif bırakır — clampFeedText'teki aynı gerekçe.
    const display = feedLinkDisplay(`https://ornek.com/${'😀'.repeat(40)}`);
    expect([...display]).toHaveLength(FEED_LINK_DISPLAY_MAX);
    expect(display).not.toContain('\uD83D\uD83D');
  });
});
