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
      shouldStopRound({ pagesThisRound: 30, offline: false, remaining: 1000 }),
    ).toBe(true);
  });

  it('offline olunca duruyor', () => {
    expect(
      shouldStopRound({ pagesThisRound: 0, offline: true, remaining: 1000 }),
    ).toBe(true);
  });

  it('kalan kota rezervin ALTINDA olunca duruyor', () => {
    expect(
      shouldStopRound({
        pagesThisRound: 1,
        offline: false,
        remaining: RATE_LIMIT_RESERVE - 1,
      }),
    ).toBe(true);
  });

  it('kalan kota rezervin TAM ÜSTÜNDE olunca durmuyor', () => {
    expect(
      shouldStopRound({
        pagesThisRound: 1,
        offline: false,
        remaining: RATE_LIMIT_RESERVE + 1,
      }),
    ).toBe(false);
  });

  it('kalan kota BİLİNMİYORSA (null) ve hiç sayfa çekilmemişse DURMUYOR — prob dalı', () => {
    // Kota hiç bilinmiyorken (cold start) ilk sayfaya (prob) izin verilmeli;
    // yoksa backfill soğuk açılışta hiç başlamaz (bkz. shouldStopRound yorumu).
    expect(
      shouldStopRound({ pagesThisRound: 0, offline: false, remaining: null }),
    ).toBe(false);
  });

  it('kalan kota BİLİNMİYORSA ve bir sayfa zaten çekildiyse duruyor', () => {
    // Prob sayfası (ilk sayfa) bütçeyi doldurması gereken sayfaydı; hâlâ
    // bilinmiyorsa (başlık hiç gelmedi) ikinci sayfaya geçmek kör harcama
    // olurdu — tur burada kapanır.
    expect(
      shouldStopRound({ pagesThisRound: 1, offline: false, remaining: null }),
    ).toBe(true);
  });

  it('hasMore false olan sayfa sohbeti TAMAM sayıyor', () => {
    expect(isConversationComplete({ hasMore: false, nextCursor: 'abc' })).toBe(true);
  });

  it('nextCursor null olan sayfa da TAMAM sayıyor (hasMore true gelse bile)', () => {
    expect(isConversationComplete({ hasMore: true, nextCursor: null })).toBe(true);
  });
});
