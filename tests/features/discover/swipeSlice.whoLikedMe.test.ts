/**
 * "Beni beğenen birini geçtim ama rozet düşmedi, ancak kapat-aç ile düzeldi."
 *
 * Rozet artık optimistik: liker handle edilir edilmez (pass / like / match)
 * sayaç aynı karede düşüyor. Buradaki testler o sözleşmeyi ve iki tuzağını
 * koruyor: (1) sayaç YÜKLENEN sayfanın boyutuna eşitlenmemeli — toplam daha
 * büyük olabilir, (2) aynı liker iki kez düşürülmemeli (pass + MatchNotification
 * gibi iki kaynak aynı kişiyi bildirebiliyor).
 */

jest.mock('@/shared/services/api', () => ({ __esModule: true, default: {} }));

import reducer, {
  setWhoLikedMe,
  addWhoLikedMe,
  removeWhoLikedMe,
  hasLikedMe,
} from '@/features/discover/swipeSlice';

const seed = (count: number, ids: string[]) =>
  reducer(undefined, setWhoLikedMe({ count, ids }));

describe('whoLikedMe — rozet ve liker kümesi', () => {
  it('sayacı TOPLAM\'dan, kümeyi yüklenen sayfadan kurar', () => {
    // 25 kişi beğenmiş, sayfada 2'si var: sayaç 25 kalmalı.
    const state = seed(25, ['A-1', 'B-2']);
    expect(state.whoLikedMeCount).toBe(25);
    expect(state.whoLikedMeIds).toEqual(['a-1', 'b-2']);
  });

  it('bilinen bir liker handle edilince sayaç anında düşer', () => {
    const state = reducer(seed(25, ['A-1', 'B-2']), removeWhoLikedMe('A-1'));
    expect(state.whoLikedMeCount).toBe(24);
    expect(state.whoLikedMeIds).toEqual(['b-2']);
  });

  it('GUID case farkı eşleşmeyi bozmaz', () => {
    const state = reducer(seed(2, ['AbC-1', 'B-2']), removeWhoLikedMe('abc-1'));
    expect(state.whoLikedMeCount).toBe(1);
    expect(hasLikedMe({ swipe: state }, 'ABC-1')).toBe(false);
    expect(hasLikedMe({ swipe: state }, 'b-2')).toBe(true);
  });

  it('aynı liker iki kaynaktan bildirilse de sayaç bir kez düşer', () => {
    // pass → removeWhoLikedMe, ardından MatchNotification/likerHandled tekrarı.
    let state = reducer(seed(3, ['A-1', 'B-2']), removeWhoLikedMe('A-1'));
    state = reducer(state, removeWhoLikedMe('A-1'));
    expect(state.whoLikedMeCount).toBe(2);
  });

  it('kümede olmayan id sayaca dokunmaz', () => {
    // Sayfalanmamış toplamı kaynağı bilinmeyen bir düşüşle bozmayalım.
    const state = reducer(seed(25, ['A-1']), removeWhoLikedMe('Z-9'));
    expect(state.whoLikedMeCount).toBe(25);
  });

  it('canlı IncomingLike sayacı artırır, tekrarı yutar', () => {
    let state = reducer(seed(1, ['A-1']), addWhoLikedMe('C-3'));
    expect(state.whoLikedMeCount).toBe(2);
    state = reducer(state, addWhoLikedMe('c-3'));
    expect(state.whoLikedMeCount).toBe(2);
    expect(state.whoLikedMeIds).toEqual(['a-1', 'c-3']);
  });

  it('sayaç negatife düşmez', () => {
    const state = reducer(seed(0, ['A-1']), removeWhoLikedMe('A-1'));
    expect(state.whoLikedMeCount).toBe(0);
  });
});
