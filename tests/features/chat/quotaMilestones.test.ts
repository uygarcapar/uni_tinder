import {
  quotaMilestones,
  takeCrossedMilestone,
} from '@/features/chat/quotaMilestones';

describe('quotaMilestones', () => {
  it('30 limit → 20, 10 ve son çağrı 5 (0 eşik değil)', () => {
    expect(quotaMilestones(30)).toEqual([20, 10, 5]);
  });
  it('limit adıma tam bölünmüyorsa altındaki katlar + son çağrı', () => {
    expect(quotaMilestones(25)).toEqual([20, 10, 5]);
    expect(quotaMilestones(50)).toEqual([40, 30, 20, 10, 5]);
  });
  it('limit adımdan küçükse yalnız son çağrı; 5 ve altı/boş → eşik yok', () => {
    expect(quotaMilestones(10)).toEqual([5]);
    expect(quotaMilestones(5)).toEqual([]);
    expect(quotaMilestones(0)).toEqual([]);
    expect(quotaMilestones(null)).toEqual([]);
  });
});

describe('takeCrossedMilestone', () => {
  it('kalan eşiğe inince bir kez döner, tekrar sormak boş döner', () => {
    const shown = new Set<number>();
    const ms = quotaMilestones(30);
    expect(takeCrossedMilestone(25, ms, shown)).toBeNull();
    expect(takeCrossedMilestone(20, ms, shown)).toBe(20);
    expect(takeCrossedMilestone(19, ms, shown)).toBeNull();
    expect(takeCrossedMilestone(10, ms, shown)).toBe(10);
    expect(takeCrossedMilestone(9, ms, shown)).toBeNull();
    expect(takeCrossedMilestone(5, ms, shown)).toBe(5);
    expect(takeCrossedMilestone(4, ms, shown)).toBeNull();
  });

  it('birden fazla eşik aynı anda geçilirse tek sonuç, hepsi tüketilir', () => {
    const shown = new Set<number>();
    expect(takeCrossedMilestone(7, quotaMilestones(30), shown)).toBe(20);
    expect(shown).toEqual(new Set([20, 10]));
    // 5 henüz geçilmedi — sonra ayrıca çıkar.
    expect(takeCrossedMilestone(5, quotaMilestones(30), shown)).toBe(5);
  });

  it('0 ve null eşik değil', () => {
    const shown = new Set<number>();
    expect(takeCrossedMilestone(0, quotaMilestones(30), shown)).toBeNull();
    expect(takeCrossedMilestone(null, quotaMilestones(30), shown)).toBeNull();
    expect(shown.size).toBe(0);
  });
});
