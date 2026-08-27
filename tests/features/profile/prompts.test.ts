/**
 * Prompt sözleşmesinin istemci tarafı — sunucuyla ayrışması en pahalı olan
 * üç nokta:
 *   1. multipart indeksleri (boşluk kalırsa binder sessizce eleman düşürür)
 *   2. karakter sayımı (code point vs UTF-16 → sayaç "148/150" derken 400)
 *   3. hata gövdesi (slot dizisi + liste geneli ihlalde boş dizi; özet mesaj
 *      dizinin ilkinden değil EN AĞIR koddan üretilmeli)
 */

import {
  countPromptAnswer,
  normalizePromptAnswer,
  MAX_PROFILE_PROMPTS,
} from '@/shared/constants/limits';
import { appendPrompts, sanitizePrompts } from '@/features/profile/promptPayload';
import {
  extractPromptErrors,
  promptSummaryCode,
  shouldRefreshPromptCatalog,
} from '@/features/profile/promptErrors';

// FormData yerine append çağrılarını toplayan sahte — RN'in FormData'sı
// jest ortamında `_parts` üzerinden okunabiliyor ama bağımlı olmak istemiyoruz.
const makeForm = () => {
  const parts: Array<[string, string]> = [];
  return {
    parts,
    formData: { append: (k: string, v: string) => parts.push([k, v]) } as unknown as FormData,
  };
};

describe('countPromptAnswer — backend ile aynı birim (code point)', () => {
  it('ASCII metinde UTF-16 uzunluğuyla aynı', () => {
    expect(countPromptAnswer('selam')).toBe(5);
  });

  it('astral emoji CODE POINT sayılır, 2 UTF-16 birimi olarak DEĞİL', () => {
    // '😀'.length === 2 (surrogate pair). Backend EnumerateRunes() ile 1 sayıyor;
    // UTF-16 sayarsak kullanıcı hakkının yarısını kullanamaz.
    expect('😀'.length).toBe(2);
    expect(countPromptAnswer('😀')).toBe(1);
    expect(countPromptAnswer('😀😀😀')).toBe(3);
  });

  it('150 astral emoji tam 150 sayılır — sınır emojide kaymamalı', () => {
    expect(countPromptAnswer('😀'.repeat(150))).toBe(150);
  });
});

describe('normalizePromptAnswer — sunucudaki NormalizeWhitespace karşılığı', () => {
  it('baştaki/sondaki boşluğu atar, ardışık boşluğu teke indirir', () => {
    expect(normalizePromptAnswer('  sabaha   karşı  ')).toBe('sabaha karşı');
  });

  it('satır sonlarını boşluğa çevirir', () => {
    expect(normalizePromptAnswer('bir\n\niki')).toBe('bir iki');
  });

  it('büyük/küçük harfe ve noktalamaya DOKUNMAZ', () => {
    // Cevap kullanıcının cümlesi — normalize edilecek tek şey boşluk.
    expect(normalizePromptAnswer('Selam! Ben Uygar...')).toBe('Selam! Ben Uygar...');
  });
});

describe('sanitizePrompts', () => {
  it('cevabı boş olan slotu eler', () => {
    expect(
      sanitizePrompts([
        { promptKey: 'A', answer: 'dolu' },
        { promptKey: 'B', answer: '   ' },
      ]),
    ).toEqual([{ promptKey: 'A', answer: 'dolu' }]);
  });

  it('soru seçilmemiş slotu eler', () => {
    expect(sanitizePrompts([{ promptKey: '', answer: 'cevap' }])).toEqual([]);
  });

  it('tekrar eden anahtarın İLKİNİ tutar (backend UT-2203 ile reddederdi)', () => {
    expect(
      sanitizePrompts([
        { promptKey: 'A', answer: 'ilk' },
        { promptKey: 'A', answer: 'ikinci' },
      ]),
    ).toEqual([{ promptKey: 'A', answer: 'ilk' }]);
  });

  it('tavanı aşan slotları kırpar', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      promptKey: `P${i}`,
      answer: 'cevap',
    }));
    expect(sanitizePrompts(many)).toHaveLength(MAX_PROFILE_PROMPTS);
  });

  it('cevabı normalize eder', () => {
    expect(sanitizePrompts([{ promptKey: 'A', answer: ' iki   kelime ' }])).toEqual([
      { promptKey: 'A', answer: 'iki kelime' },
    ]);
  });
});

describe('appendPrompts — indeksli multipart', () => {
  it('backend PhotoOrders desenini kullanır', () => {
    const { parts, formData } = makeForm();
    appendPrompts(formData, [
      { promptKey: 'MostEnjoyInLife', answer: 'yürümek' },
      { promptKey: 'MyIdealSunday', answer: 'kahve' },
    ]);
    expect(parts).toEqual([
      ['Prompts[0].PromptKey', 'MostEnjoyInLife'],
      ['Prompts[0].Answer', 'yürümek'],
      ['Prompts[1].PromptKey', 'MyIdealSunday'],
      ['Prompts[1].Answer', 'kahve'],
    ]);
  });

  it('🔴 boş slot atlandığında indeksler YENİDEN numaralanır — boşluk kalmaz', () => {
    // ASP.NET model binder ilk boşlukta durur: Prompts[0] + Prompts[2]
    // gönderilirse sunucu YALNIZCA ilkini görür ve kullanıcı iki cevap
    // yazdığını sanarken biri sessizce kaybolur.
    const { parts, formData } = makeForm();
    appendPrompts(formData, [
      { promptKey: 'A', answer: 'ilk' },
      { promptKey: 'B', answer: '' }, // elenecek
      { promptKey: 'C', answer: 'üçüncü' },
    ]);
    expect(parts.map(([k]) => k)).toEqual([
      'Prompts[0].PromptKey',
      'Prompts[0].Answer',
      'Prompts[1].PromptKey',
      'Prompts[1].Answer',
    ]);
    expect(parts[3][1]).toBe('üçüncü');
  });

  it('boş liste hiçbir alan yazmaz — "gönderilmedi" ile aynı, replace tetiklenmez', () => {
    const { parts, formData } = makeForm();
    appendPrompts(formData, []);
    appendPrompts(formData, null);
    appendPrompts(formData, undefined);
    expect(parts).toEqual([]);
  });
});

describe('extractPromptErrors', () => {
  it('dizi şekli (istenen): her slot ayrı', () => {
    expect(
      extractPromptErrors({
        code: 'UT-2205',
        result: {
          prompts: [
            { index: 0, code: 'UT-2205' },
            { index: 2, code: 'UT-2206' },
          ],
        },
      }),
    ).toEqual([
      { index: 0, code: 'UT-2205' },
      { index: 2, code: 'UT-2206' },
    ]);
  });

  it('liste geneli ihlalde prompts BOŞ gelir — bilgi üst seviye koddadır', () => {
    // UT-2201 (adet) ve UT-2203 (tekrar) slot'a değil isteğin tamamına ait.
    // Boş dizi "hata yok" DEĞİL; üst seviye koda düşülmeli.
    expect(extractPromptErrors({ code: 'UT-2201', result: { prompts: [] } })).toEqual([
      { index: null, code: 'UT-2201' },
    ]);
    expect(extractPromptErrors({ code: 'UT-2203' })).toEqual([
      { index: null, code: 'UT-2203' },
    ]);
  });

  it('dizi elemanında kod yoksa üst seviye koda düşer', () => {
    expect(
      extractPromptErrors({ code: 'UT-2204', result: { prompts: [{ index: 1 }] } }),
    ).toEqual([{ index: 1, code: 'UT-2204' }]);
  });

  it('prompt ailesinden olmayan kodu yok sayar', () => {
    // Foto moderasyonu / doğrulama hatası buraya düşmemeli.
    expect(extractPromptErrors({ code: 'UT-6001' })).toEqual([]);
    expect(extractPromptErrors({ message: 'Bir hata oluştu.' })).toEqual([]);
    expect(extractPromptErrors(null)).toEqual([]);
  });
});

describe('shouldRefreshPromptCatalog', () => {
  it('UT-2202 katalogun bayat olduğunu gösterir → tazele', () => {
    // staticGet katalogu oturum boyu tutuyor (TTL yok): backend bir prompt'u
    // pasife alınca kullanıcı onu hâlâ listede görüp seçebiliyor.
    expect(shouldRefreshPromptCatalog([{ index: 0, code: 'UT-2202' }])).toBe(true);
  });

  it('diğer kodlarda katalog tazelenmez', () => {
    expect(shouldRefreshPromptCatalog([{ index: 0, code: 'UT-2205' }])).toBe(false);
    expect(shouldRefreshPromptCatalog([])).toBe(false);
  });
});

describe('promptSummaryCode — özet mesaj EN AĞIR hatadan', () => {
  it('üst seviye kodu tercih eder, dizinin ilk elemanını değil', () => {
    // Backend üst seviyeyi UT-2201 > UT-2203 > UT-2202 > UT-2206 > UT-2205 >
    // UT-2204 sırasıyla seçiyor. Dizinin ilk elemanı ise yalnızca EN KÜÇÜK
    // index — slot 0'daki "cevabın uzun", slot 2'deki moderasyon reddinin
    // önüne geçmemeli.
    const body = {
      code: 'UT-2206',
      result: {
        prompts: [
          { index: 0, code: 'UT-2205' },
          { index: 2, code: 'UT-2206' },
        ],
      },
    };
    const errors = extractPromptErrors(body);
    expect(errors[0].code).toBe('UT-2205');
    expect(promptSummaryCode(body, errors)).toBe('UT-2206');
  });

  it('üst seviye kod prompt ailesinden değilse dizinin ilkine düşer', () => {
    const errors = [{ index: 1, code: 'UT-2204' }];
    expect(promptSummaryCode({ message: 'Bir hata oluştu.' }, errors)).toBe('UT-2204');
  });

  it('hiç hata yoksa null', () => {
    expect(promptSummaryCode({}, [])).toBeNull();
  });
});
