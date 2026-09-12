import {
  createTypingExpiry,
  TYPING_EXPIRE_MS,
} from '@/features/chat/typingExpiry';

/**
 * "Yazıyor..." asılı kalıyor (Eylül 2026): alıcı göstergeyi kapatmak için
 * yalnız `UserStoppedTyping`e güveniyordu; o kaçınca sonsuza kadar kalıyordu.
 * Kilitlenen sözleşme: her Start sayacı sıfırdan kurar, TTL dolunca kendi
 * kendine kapanır, Stop sayacı iptal eder.
 */
const P = { conversationId: 'c1', userId: 'u1' };

describe('typingExpiry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('Stop hiç gelmezse TTL dolunca kendisi düşürür', () => {
    const onExpire = jest.fn();
    const exp = createTypingExpiry({ onExpire });
    exp.started(P);
    jest.advanceTimersByTime(TYPING_EXPIRE_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledWith(P);
    expect(exp.pendingCount()).toBe(0);
  });

  it('heartbeat sayacı sıfırdan kurar — yazma sürerken gösterge titremez', () => {
    const onExpire = jest.fn();
    const exp = createTypingExpiry({ onExpire });
    exp.started(P);
    jest.advanceTimersByTime(4000);
    exp.started(P); // heartbeat
    jest.advanceTimersByTime(4000); // ilk start'tan 8 sn geçti
    expect(onExpire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('Stop gelirse sayaç iptal olur, TTL dolsa da tekrar kapatma gitmez', () => {
    const onExpire = jest.fn();
    const exp = createTypingExpiry({ onExpire });
    exp.started(P);
    exp.stopped(P);
    jest.advanceTimersByTime(TYPING_EXPIRE_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('sayaçlar sohbet+kullanıcı bazında ayrı; clearAll hepsini iptal eder', () => {
    const onExpire = jest.fn();
    const exp = createTypingExpiry({ onExpire });
    exp.started(P);
    exp.started({ conversationId: 'c1', userId: 'u2' });
    exp.started({ conversationId: 'c2', userId: 'u1' });
    expect(exp.pendingCount()).toBe(3);
    exp.stopped(P);
    expect(exp.pendingCount()).toBe(2);
    exp.clearAll();
    expect(exp.pendingCount()).toBe(0);
    jest.advanceTimersByTime(TYPING_EXPIRE_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('eksik payload sayaç kurmaz', () => {
    const exp = createTypingExpiry({ onExpire: jest.fn() });
    exp.started({ conversationId: '', userId: 'u1' });
    exp.started({ conversationId: 'c1', userId: '' } as any);
    expect(exp.pendingCount()).toBe(0);
  });
});
