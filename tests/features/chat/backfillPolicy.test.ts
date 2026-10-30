import {
  RATE_LIMIT_RESERVE,
  isConversationComplete,
  selectBackfillTargets,
  shouldStopRound,
} from '@/features/chat/backfillPolicy';
import type { BackfillTarget } from '@/features/chat/chatRepository';

const target = (conversationId: string, cursor: string | null = null): BackfillTarget => ({
  conversationId,
  cursor,
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
