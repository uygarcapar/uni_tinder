/**
 * Beğeniler rozetine akış yanıtlarının eklenmesi (2026-09-29 sözleşmesi §10.1).
 *
 * Test edilen asıl şey: İKİ SAYACIN BİRBİRİNE KARIŞMAMASI.
 * `whoLikedMeCount` id KÜMESİNDEN türüyor — `addWhoLikedMe`/`removeWhoLikedMe`
 * sayacı yalnız id kümedeyse oynatıyor. `pendingFeedReplyCount` oraya
 * yazılsaydı bir beğeniyi işlemek (pass/like/match → removeWhoLikedMe) akış
 * yanıtı sayısını da sessizce düşürürdü ve rozet, hiç dokunulmamış yanıtları
 * kaybederdi. Bu yüzden ayrı alan + okuma yerinde toplama (TabNavigator).
 */

import reducer, {
  addWhoLikedMe,
  decrementPendingFeedReply,
  fetchWhoLikedMe,
  incrementPendingFeedReply,
  removeWhoLikedMe,
  setPendingFeedReplyCount,
  setWhoLikedMe,
} from '@/features/discover/swipeSlice';
import type { SwipeState } from '@/shared/types';

const initial = (): SwipeState =>
  reducer(undefined, { type: '@@INIT' } as any);

describe('başlangıç durumu', () => {
  it('pendingFeedReplyCount 0 başlar', () => {
    expect(initial().pendingFeedReplyCount).toBe(0);
  });
});

describe('iki sayaç birbirine karışmıyor', () => {
  it('removeWhoLikedMe akış yanıtı sayacına DOKUNMAZ', () => {
    let state = reducer(
      initial(),
      setWhoLikedMe({ count: 3, ids: ['AAA', 'bbb'] }),
    );
    state = reducer(state, setPendingFeedReplyCount(5));

    state = reducer(state, removeWhoLikedMe('aaa'));

    expect(state.whoLikedMeCount).toBe(2);
    expect(state.pendingFeedReplyCount).toBe(5); // ← regresyon kilidi
  });

  it('addWhoLikedMe akış yanıtı sayacına DOKUNMAZ', () => {
    let state = reducer(initial(), setPendingFeedReplyCount(2));
    state = reducer(state, addWhoLikedMe('ccc'));

    expect(state.whoLikedMeCount).toBe(1);
    expect(state.pendingFeedReplyCount).toBe(2);
  });

  it('akış yanıtı sayacı beğeni sayacına DOKUNMAZ', () => {
    let state = reducer(initial(), setWhoLikedMe({ count: 4, ids: [] }));
    state = reducer(state, incrementPendingFeedReply());
    state = reducer(state, decrementPendingFeedReply());

    expect(state.whoLikedMeCount).toBe(4);
  });
});

describe('pendingFeedReplyCount reducer\'ları', () => {
  it('setPendingFeedReplyCount otoriter yazar', () => {
    const state = reducer(initial(), setPendingFeedReplyCount(7));
    expect(state.pendingFeedReplyCount).toBe(7);
  });

  it('negatif / bozuk değer 0\'a sabitlenir', () => {
    expect(reducer(initial(), setPendingFeedReplyCount(-3)).pendingFeedReplyCount).toBe(0);
    expect(
      reducer(initial(), setPendingFeedReplyCount(undefined as any)).pendingFeedReplyCount,
    ).toBe(0);
  });

  it('increment canlı FeedReplyReceived için artırır', () => {
    let state = reducer(initial(), incrementPendingFeedReply());
    state = reducer(state, incrementPendingFeedReply());
    expect(state.pendingFeedReplyCount).toBe(2);
  });

  it('decrement 0\'da TABANLANIR (eksiye düşmez)', () => {
    let state = reducer(initial(), decrementPendingFeedReply());
    expect(state.pendingFeedReplyCount).toBe(0);

    state = reducer(state, setPendingFeedReplyCount(1));
    state = reducer(state, decrementPendingFeedReply());
    state = reducer(state, decrementPendingFeedReply());
    expect(state.pendingFeedReplyCount).toBe(0);
  });
});

describe('fetchWhoLikedMe.fulfilled — iki sayacı da yazar', () => {
  const fulfilled = (payload: any) => ({
    type: fetchWhoLikedMe.fulfilled.type,
    payload,
  });

  it('WhoLikedMe yanıtındaki pendingFeedReplyCount state\'e geçer', () => {
    const state = reducer(
      initial(),
      fulfilled({ count: 2, ids: ['a'], pendingFeedReplyCount: 3 }),
    );
    expect(state.whoLikedMeCount).toBe(2);
    expect(state.pendingFeedReplyCount).toBe(3);
  });

  it('alan gelmezse ESKİ değer korunur (rozet sıfırlanmaz)', () => {
    // Eski backend sürümü alanı göndermiyor; canlı event'le artmış sayacı
    // bir fetch turunun silmesi rozeti yanlışlıkla boşaltırdı.
    let state = reducer(initial(), setPendingFeedReplyCount(4));
    state = reducer(state, fulfilled({ count: 1, ids: ['a'] }));
    expect(state.pendingFeedReplyCount).toBe(4);
  });

  it('setWhoLikedMe reducer\'ı da aynı payload şeklini kabul eder', () => {
    const state = reducer(
      initial(),
      setWhoLikedMe({ count: 1, ids: ['a'], pendingFeedReplyCount: 9 } as any),
    );
    expect(state.pendingFeedReplyCount).toBe(9);
  });
});

describe('rozet toplamı (TabNavigator okuma yeri)', () => {
  it('rozet = beğeniler + bekleyen akış yanıtları', () => {
    let state = reducer(initial(), setWhoLikedMe({ count: 3, ids: [] }));
    state = reducer(state, setPendingFeedReplyCount(2));
    expect(state.whoLikedMeCount + state.pendingFeedReplyCount).toBe(5);
  });

  it('ikisi de 0 ise rozet çizilmez', () => {
    const state = initial();
    expect(state.whoLikedMeCount + state.pendingFeedReplyCount).toBe(0);
  });
});
