/**
 * tr ↔ en anahtar paritesi.
 *
 * NEDEN VAR: `en.ts` `tr.ts`'e TİP OLARAK BAĞLI DEĞİL — ikisi bağımsız
 * `as const` literal ve aralarında ne `satisfies` ne ortak bir `Translations`
 * tipi var. Yani bir namespace'i yalnız tr'ye eklemek DERLENİYOR, lint de
 * susuyor; eksik anahtar ancak İngilizce kullanan birinde ham anahtar metni
 * ("feed.tabFeed") olarak ortaya çıkıyor.
 *
 * Kapsam BİLİNÇLİ OLARAK `feed` + yeni `likes` anahtarı: sözlüğün tamamında
 * tarihsel kayma var (bkz. aşağıdaki serbest rapor testi) ve onu bu değişiklikte
 * kapatmak kapsam dışı. Yeni yazılan yüzey ise ilk günden kilitli.
 */

import tr from '@/shared/i18n/translations/tr';
import en from '@/shared/i18n/translations/en';

/** İç içe sözlüğü "a.b.c" düz anahtar listesine indir. */
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatKeys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('feed namespace — tr/en paritesi', () => {
  const trKeys = flatKeys((tr as any).feed, 'feed.').sort();
  const enKeys = flatKeys((en as any).feed, 'feed.').sort();

  it('iki dilde de feed namespace\'i var', () => {
    expect((tr as any).feed).toBeDefined();
    expect((en as any).feed).toBeDefined();
  });

  it('en\'de eksik anahtar YOK', () => {
    expect(enKeys.filter((k) => !trKeys.includes(k))).toEqual([]);
    expect(trKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it('tüm hata kodları iki dilde de var (+ generic)', () => {
    // Kod aileleri kaymasın: feedCodeI18nKey bu anahtarlara işaret ediyor,
    // biri eksikse kullanıcı ham "feed.codes.UT-73xx" görür.
    //
    // ⚠️ SAYI SABİT YAZILMIYOR ARTIK. Eskiden 28'e kilitliydi ve her yeni kod
    // bu testi "kırıyordu" — oysa yeni kod eklemek bir hata değil. Asıl kural
    // İKİ DİLİN EŞİT olması; tek taraflı eklenen kod hâlâ yakalanıyor.
    // (Üstteki "eksik anahtar YOK" testi de aynı kuralı genel olarak kuruyor;
    // bu test kod ailesine özel, çünkü oradaki eksik ham kod gösteriyor.)
    const codeKeys = (keys: string[]) =>
      keys.filter((k) => k.startsWith('feed.codes.')).length;
    expect(codeKeys(trKeys)).toBe(codeKeys(enKeys));
    // Alt sınır: aile hiç boşalmasın (ör. blok yanlışlıkla silinirse).
    expect(codeKeys(trKeys)).toBeGreaterThanOrEqual(28);
  });

  it('hiçbir değer boş string değil', () => {
    const empties: string[] = [];
    const walk = (obj: any, p: string) => {
      Object.entries(obj).forEach(([k, v]) => {
        if (v && typeof v === 'object') walk(v, `${p}${k}.`);
        else if (typeof v === 'string' && v.trim() === '') empties.push(`${p}${k}`);
      });
    };
    walk((tr as any).feed, 'feed.');
    walk((en as any).feed, 'feed.');
    expect(empties).toEqual([]);
  });

  it('interpolasyon yer tutucuları iki dilde AYNI', () => {
    // "{{count}} yanıt" ↔ "{{count}} replies": biri yer tutucuyu düşürürse
    // o dilde sayı hiç görünmez ve hata sessiz olur.
    const placeholders = (s: string) =>
      (s.match(/\{\{(\w+)\}\}/g) ?? []).sort().join(',');
    const collect = (obj: any, p: string, out: Record<string, string>) => {
      Object.entries(obj).forEach(([k, v]) => {
        if (v && typeof v === 'object') collect(v, `${p}${k}.`, out);
        else if (typeof v === 'string') out[`${p}${k}`] = placeholders(v);
      });
      return out;
    };
    const trPh = collect((tr as any).feed, 'feed.', {});
    const enPh = collect((en as any).feed, 'feed.', {});
    const mismatched = Object.keys(trPh).filter((k) => trPh[k] !== enPh[k]);
    expect(mismatched).toEqual([]);
  });
});

/**
 * `likes.tabFeedReplies` SİLİNDİ (iki modlu yapı): Beğeniler'deki akış
 * yanıtları sekmesi üründen çıktı. Testi kaldırmak yerine TERSİNİ doğruluyoruz
 * — anahtar geri sızarsa (ör. eski bir branch merge edilirse) sekme de geri
 * gelmiş olur ve bunu fark etmek isteriz.
 */
describe('kaldırılan akış yanıtı anahtarları', () => {
  it('likes.tabFeedReplies iki dilde de YOK', () => {
    expect((tr as any).likes.tabFeedReplies).toBeUndefined();
    expect((en as any).likes.tabFeedReplies).toBeUndefined();
  });

  it('feed.reply / feed.received blokları iki dilde de YOK', () => {
    expect((tr as any).feed.reply).toBeUndefined();
    expect((en as any).feed.reply).toBeUndefined();
    expect((tr as any).feed.received).toBeUndefined();
    expect((en as any).feed.received).toBeUndefined();
  });
});
