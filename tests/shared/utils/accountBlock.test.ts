import {
  ACCOUNT_BLOCK_CODES,
  extractAccountBlock,
  isAccountBlockBody,
  isAccountBlockReason,
  setOnAccountBlocked,
  emitAccountBlocked,
  resetAccountBlockLatch,
  isAccountBlockLatched,
  type AccountBlockPayload,
} from '@/shared/utils/accountBlock';

const blockError = (body: any, status = 403) => ({ response: { status, data: body } });

const BANNED_BODY = {
  isSuccess: false,
  errorCode: ACCOUNT_BLOCK_CODES.BANNED,
  reason: 'banned',
  message: 'Hesabın kapatıldı. Sebep: Spam',
  action: "Destek'e Yaz",
  expiresAt: null,
};

beforeEach(() => {
  resetAccountBlockLatch();
  setOnAccountBlocked(() => {});
});

describe('extractAccountBlock', () => {
  it('parses a 403 sanction body into a normalized payload', () => {
    expect(extractAccountBlock(blockError(BANNED_BODY))).toEqual({
      errorCode: 'UT-1007',
      reason: 'banned',
      message: 'Hesabın kapatıldı. Sebep: Spam',
      action: "Destek'e Yaz",
      expiresAt: null,
    });
  });

  it('carries expiresAt through for suspensions', () => {
    const payload = extractAccountBlock(
      blockError({
        errorCode: ACCOUNT_BLOCK_CODES.SUSPENDED,
        reason: 'suspended',
        message: 'Askıya alındı.',
        expiresAt: '2026-08-18T12:00:00Z',
      }),
    );
    expect(payload?.reason).toBe('suspended');
    expect(payload?.expiresAt).toBe('2026-08-18T12:00:00Z');
    // action gövdede yoksa null — ekran i18n fallback'ini kullanır.
    expect(payload?.action).toBeNull();
  });

  // Karar errorCode'a bağlı; reason yalnızca gösterim için ve koddan türetilir.
  // Aksi halde gövdede reason eksik/yanlışsa ekran başlığı çözümsüz kalırdı.
  it('derives reason from errorCode even when the body omits or contradicts it', () => {
    expect(
      extractAccountBlock(blockError({ errorCode: ACCOUNT_BLOCK_CODES.PENDING_DELETION }))?.reason,
    ).toBe('account_deleted');
    expect(
      extractAccountBlock(
        blockError({ errorCode: ACCOUNT_BLOCK_CODES.SUSPENDED, reason: 'whatever' }),
      )?.reason,
    ).toBe('suspended');
  });

  it('ignores non-403 responses even with a sanction code', () => {
    expect(extractAccountBlock(blockError(BANNED_BODY, 401))).toBeNull();
  });

  it('ignores other 403s (plain authorization failures)', () => {
    expect(extractAccountBlock(blockError({ errorCode: 'UT-6005', message: 'nope' }))).toBeNull();
    expect(extractAccountBlock(blockError('<html>Forbidden</html>'))).toBeNull();
    expect(extractAccountBlock(blockError(undefined))).toBeNull();
    expect(extractAccountBlock({ message: 'Network Error' })).toBeNull();
  });
});

describe('isAccountBlockBody / isAccountBlockReason', () => {
  it('recognises the three sanction codes only', () => {
    expect(isAccountBlockBody({ errorCode: 'UT-1007' })).toBe(true);
    expect(isAccountBlockBody({ errorCode: 'UT-1008' })).toBe(true);
    expect(isAccountBlockBody({ errorCode: 'UT-1009' })).toBe(true);
    expect(isAccountBlockBody({ errorCode: 'UT-1006' })).toBe(false);
    expect(isAccountBlockBody(null)).toBe(false);
  });

  // SignalR ForceLogout `reason` ayrımı: yaptırım mı, normal oturum kapanışı mı.
  it('separates sanction reasons from ordinary force-logout reasons', () => {
    expect(isAccountBlockReason('banned')).toBe(true);
    expect(isAccountBlockReason('suspended')).toBe(true);
    expect(isAccountBlockReason('account_deleted')).toBe(true);
    expect(isAccountBlockReason('new_login_elsewhere')).toBe(false);
    expect(isAccountBlockReason('email_reverify_required')).toBe(false);
    expect(isAccountBlockReason('moderation_action')).toBe(false);
    expect(isAccountBlockReason(undefined)).toBe(false);
  });
});

describe('emitAccountBlocked latch', () => {
  const payload = extractAccountBlock(blockError(BANNED_BODY)) as AccountBlockPayload;

  // Açılışta paralel 5-6 istek birden 403 alır; latch olmadan aynı geçiş
  // defalarca tetiklenir ve oturum düşürme akışı üst üste biner.
  it('notifies once for a burst of parallel 403s', () => {
    const handler = jest.fn();
    setOnAccountBlocked(handler);

    expect(emitAccountBlocked(payload)).toBe(true);
    expect(emitAccountBlocked(payload)).toBe(false);
    expect(emitAccountBlocked(payload)).toBe(false);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
    expect(isAccountBlockLatched()).toBe(true);
  });

  // Askı ekranından "giriş ekranına dön" → latch açılmazsa aynı kullanıcının
  // ikinci giriş denemesindeki 403 yutulur ve ekran hiç görünmez.
  it('re-arms after the screen is dismissed', () => {
    const handler = jest.fn();
    setOnAccountBlocked(handler);

    emitAccountBlocked(payload);
    resetAccountBlockLatch();
    expect(emitAccountBlocked(payload)).toBe(true);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  // Boot yarışı: handler register olmadan gelen 403 kaybolursa kullanıcı
  // token'ı silinmiş ama ekransız bir limbo'da kalır.
  it('buffers a block that arrives before a handler is registered', () => {
    // Handler'ı hiç register edilmemiş taze modül örneği ile temsil et.
    jest.resetModules();
    const fresh = require('@/shared/utils/accountBlock');
    const handler = jest.fn();

    expect(fresh.emitAccountBlocked(payload)).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    fresh.setOnAccountBlocked(handler);
    expect(handler).toHaveBeenCalledWith(payload);
  });
});
