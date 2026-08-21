const mockPost = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => mockPost(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

import chatService from '@/features/chat/chatService';

/**
 * Rematch kapısının servis sözleşmesi.
 *
 * Ret gerekçesi (`reason`) UI'da farklı metinlere ayrılıyor (too_old → açıklama,
 * no_history → butonu hiç gösterme) — bu yüzden reddin HTTP 200 + isSuccess:false
 * ya da 4xx olarak gelmesi ARASINDAKİ FARK çağıranı ilgilendirmemeli.
 *
 * Unmatch tarafında sözleşme: `restorableUntil` yoksa null'a düşer — çağıran
 * "geri alabilirsin" demeden önce bu alana bakar.
 */

beforeEach(() => {
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe('revealHistory', () => {
  it('başarıda revealedAt döner', async () => {
    mockPost.mockResolvedValue({
      isSuccess: true,
      result: { revealedAt: '2026-08-15T12:00:00Z' },
    });

    await expect(chatService.revealHistory('c1')).resolves.toEqual({
      isSuccess: true,
      revealedAt: '2026-08-15T12:00:00Z',
      reason: null,
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/messages/conversations/c1/reveal-history',
    );
  });

  it('Z\'siz revealedAt damgasını UTC\'ye normalize eder', async () => {
    mockPost.mockResolvedValue({
      isSuccess: true,
      result: { revealedAt: '2026-08-15T12:00:00' },
    });

    const res = await chatService.revealHistory('c1');

    expect(res.revealedAt).toBe('2026-08-15T12:00:00Z');
  });

  it('200 + isSuccess:false gelen reddi gerekçesiyle döner', async () => {
    mockPost.mockResolvedValue({ isSuccess: false, reason: 'too_old' });

    await expect(chatService.revealHistory('c1')).resolves.toEqual({
      isSuccess: false,
      revealedAt: null,
      reason: 'too_old',
    });
  });

  it('4xx gövdesindeki gerekçeyi de aynı şekilde döner (throw ETMEZ)', async () => {
    mockPost.mockRejectedValue({
      response: { status: 400, data: { isSuccess: false, reason: 'no_history' } },
    });

    await expect(chatService.revealHistory('c1')).resolves.toEqual({
      isSuccess: false,
      revealedAt: null,
      reason: 'no_history',
    });
  });

  it('gövdesiz ağ hatasını yutmaz (offline sessizce "açılamadı" olmasın)', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));

    await expect(chatService.revealHistory('c1')).rejects.toThrow('Network Error');
  });
});

describe('deactivateConversation', () => {
  it('geri alma penceresini yanıttan taşır', async () => {
    mockDelete.mockResolvedValue({
      isSuccess: true,
      result: { restorableUntil: '2026-08-16T12:00:00Z' },
    });

    const res = await chatService.deactivateConversation('c1');

    expect(res.restorableUntil).toBe('2026-08-16T12:00:00Z');
  });

  it('pencere yoksa null döner (limit dolmuş / engellenmiş)', async () => {
    mockDelete.mockResolvedValue({
      isSuccess: true,
      message: 'Eşleşme kaldırıldı.',
      result: {},
    });

    const res = await chatService.deactivateConversation('c1');

    expect(res.restorableUntil).toBeNull();
    expect(res.message).toBe('Eşleşme kaldırıldı.');
  });

  it('result hiç gelmezse de patlamaz', async () => {
    mockDelete.mockResolvedValue({ isSuccess: true });

    await expect(chatService.deactivateConversation('c1')).resolves.toEqual({
      restorableUntil: null,
      message: null,
    });
  });
});
