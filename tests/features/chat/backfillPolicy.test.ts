import {
  BACKFILL_MAX_FAILURES,
  RATE_LIMIT_RESERVE,
  isConversationComplete,
  isConversationFault,
  isConversationShelved,
  selectBackfillTargets,
  shouldStopRound,
} from '@/features/chat/backfillPolicy';
import type { BackfillTarget } from '@/features/chat/chatRepository';

const target = (
  conversationId: string,
  cursor: string | null = null,
  failures = 0,
): BackfillTarget => ({
  conversationId,
  cursor,
  failures,
});

describe('selectBackfillTargets', () => {
  it('aktif sohbeti listeden eliyor, diğerlerinin sırasını koruyor', () => {
    const targets = [target('a'), target('b'), target('c')];
    expect(selectBackfillTargets(targets, 'b')).toEqual([target('a'), target('c')]);
  });

  it('aktif sohbet yoksa listeyi aynen döndürüyor', () => {
    const targets = [target('a'), target('b')];
    expect(selectBackfillTargets(targets, null)).toEqual(targets);
  });

  it('rafa kalkmış (üst üste BACKFILL_MAX_FAILURES hatalı) sohbeti de eliyor', () => {
    const targets = [target('a'), target('bozuk', null, BACKFILL_MAX_FAILURES), target('c')];
    expect(selectBackfillTargets(targets, null)).toEqual([target('a'), target('c')]);
  });
});

describe('shouldStopRound', () => {
  it('tur tavanı dolunca duruyor', () => {
    expect(
      shouldStopRound({ attemptsThisRound: 30, offline: false, remaining: 1000 }),
    ).toBe(true);
  });

  it('offline olunca duruyor', () => {
    expect(
      shouldStopRound({ attemptsThisRound: 0, offline: true, remaining: 1000 }),
    ).toBe(true);
  });

  it('kalan kota rezervin ALTINDA olunca duruyor', () => {
    expect(
      shouldStopRound({
        attemptsThisRound: 1,
        offline: false,
        remaining: RATE_LIMIT_RESERVE - 1,
      }),
    ).toBe(true);
  });

  it('kalan kota rezervin TAM ÜSTÜNDE olunca durmuyor', () => {
    expect(
      shouldStopRound({
        attemptsThisRound: 1,
        offline: false,
        remaining: RATE_LIMIT_RESERVE + 1,
      }),
    ).toBe(false);
  });

  it('kalan kota rezerve TAM EŞİTKEN durmuyor (sınır katı `<`, `<=` değil)', () => {
    expect(
      shouldStopRound({
        attemptsThisRound: 1,
        offline: false,
        remaining: RATE_LIMIT_RESERVE,
      }),
    ).toBe(false);
  });

  it('kalan kota BİLİNMİYORSA (null) ve hiç DENEME yapılmamışsa DURMUYOR — prob dalı', () => {
    // Kota hiç bilinmiyorken (cold start) ilk denemeye (prob) izin verilmeli;
    // yoksa backfill soğuk açılışta hiç başlamaz (bkz. shouldStopRound yorumu).
    expect(
      shouldStopRound({ attemptsThisRound: 0, offline: false, remaining: null }),
    ).toBe(false);
  });

  it('kalan kota BİLİNMİYORSA ve bir deneme zaten yapıldıysa duruyor — BAŞARISIZ denemede de', () => {
    // `attemptsThisRound` DENEME sayar, BAŞARI saymaz: prob isteği 5xx/ağ
    // hatasıyla patlamış olsa bile (hiç header gelmedi, kota hâlâ null) bu
    // dal yine tetiklenir. Kasıtlı: başarısız bir prob bütçe hakkında hiçbir
    // şey öğretmedi, bu yüzden ikinci bir kör deneme de izin VERİLMEZ —
    // "prob başarısız olursa tekrar dene" burada bilerek YOK.
    expect(
      shouldStopRound({ attemptsThisRound: 1, offline: false, remaining: null }),
    ).toBe(true);
  });

  it('hasMore false olan sayfa sohbeti TAMAM sayıyor', () => {
    expect(isConversationComplete({ hasMore: false, nextCursor: 'abc' })).toBe(true);
  });

  it('nextCursor null olan sayfa da TAMAM sayıyor (hasMore true gelse bile)', () => {
    expect(isConversationComplete({ hasMore: true, nextCursor: null })).toBe(true);
  });

  it('hasMore true ve nextCursor doluysa TAMAM sayılmıyor', () => {
    expect(isConversationComplete({ hasMore: true, nextCursor: 'abc' })).toBe(false);
  });
});

describe('isConversationShelved', () => {
  it('üst üste BACKFILL_MAX_FAILURES hata alan sohbet seçilmiyor', () => {
    expect(isConversationShelved(BACKFILL_MAX_FAILURES - 1)).toBe(false);
    expect(isConversationShelved(BACKFILL_MAX_FAILURES)).toBe(true);
  });
});

/**
 * Review turu 4, Kritik — sayacın adı "kalıcı"ydı ama kapsamı "429 dışında
 * HER ŞEY"di: bir 5xx fırtınası ya da on dakikalık bağlantı kopması üç turda
 * TÜM sohbetleri rafa kaldırıyor, arşivi kalıcı olarak yarım bırakıyor ve
 * arama "o mesaj yok" diyordu.
 */
describe('isConversationFault', () => {
  it('429 OLMAYAN 4xx bu sohbete özgü arıza SAYILIYOR', () => {
    expect(isConversationFault(404)).toBe(true); // sohbet sunucuda yok
    expect(isConversationFault(403)).toBe(true); // erişim yok
    expect(isConversationFault(400)).toBe(true); // cursor kabul edilmiyor
    expect(isConversationFault(499)).toBe(true);
  });

  it('5xx SAYILMIYOR — sunucu hakkında, bu sohbet hakkında değil', () => {
    expect(isConversationFault(500)).toBe(false);
    expect(isConversationFault(502)).toBe(false);
    expect(isConversationFault(503)).toBe(false);
  });

  it('durum kodu OLMAYAN hata (ağ kopması/timeout) SAYILMIYOR', () => {
    expect(isConversationFault(null)).toBe(false);
  });

  it('429 SAYILMIYOR — kova paylaşımlı, kodu kullanıcının kendi trafiği üretebilir', () => {
    expect(isConversationFault(429)).toBe(false);
  });

  it('2xx/3xx SAYILMIYOR — hata dalına düşen bir yanıt bile olsa sohbet suçlu değil', () => {
    expect(isConversationFault(200)).toBe(false);
    expect(isConversationFault(304)).toBe(false);
  });
});
