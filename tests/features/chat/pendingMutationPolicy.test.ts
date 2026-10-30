import {
  MAX_OPS_PER_FLUSH,
  MUTATION_RATE_RESERVE,
  classifyMutationError,
  coalesceDelete,
  coalesceReaction,
  nextEligibleAt,
  shouldStopFlush,
} from '@/features/chat/pendingMutationPolicy';

describe('coalesceReaction', () => {
  it('üst üste tepki değişimi: desired son değer, base İLK emrin gördüğü sunucu değeri', () => {
    const a = coalesceReaction(null, '😀', '❤️'); // sunucuda ❤️ varken 😀 seçildi
    const b = coalesceReaction(a, '👍', '😀'); // ikinci dokunuş; "sunucu" artık optimistik 😀 görüyor
    expect(b).toEqual({ desired: '👍', base: '❤️' }); // base ARA DEĞERE kaymadı
  });

  it('tepkiyi kaldırma emri desired:null olarak birleşiyor, base korunuyor', () => {
    expect(coalesceReaction({ desired: '😀', base: '❤️' }, null, '😀')).toEqual({
      desired: null,
      base: '❤️',
    });
  });

  it('ilk emirde base sunucudan geleni alıyor', () => {
    expect(coalesceReaction(null, '😀', null)).toEqual({ desired: '😀', base: null });
  });
});

describe('coalesceDelete', () => {
  it('silme yalnız tırmanıyor: true geldiyse sonraki false onu DÜŞÜRMÜYOR', () => {
    expect(coalesceDelete({ forEveryone: true }, false)).toEqual({ forEveryone: true });
    expect(coalesceDelete({ forEveryone: false }, true)).toEqual({ forEveryone: true });
  });
});

describe('classifyMutationError', () => {
  it('silmede UT-6720 BAŞARI, tepkide ret', () => {
    const gone = { response: { data: { errorCode: 'UT-6720' } } };
    expect(classifyMutationError(gone, 'delete')).toBe('done');
    expect(classifyMutationError(gone, 'reaction')).toBe('rejected');
  });

  it('kalıcı sınıflar rejected: sistem mesajına tepki, geçersiz emoji, kapalı sohbet, erişim yok', () => {
    // UT-6731 REACTION_ON_SYSTEM, UT-6730 REACTION_BAD_EMOJI (ikisi de
    // actionRejected/inputInvalid), UT-6740 CONVERSATION_CLOSED, UT-6713
    // CONVERSATION_NOT_FOUND (conversationGone).
    for (const code of ['UT-6731', 'UT-6730', 'UT-6740', 'UT-6713'])
      expect(classifyMutationError({ response: { data: { errorCode: code } } }, 'reaction')).toBe(
        'rejected',
      );
  });

  it('silmede DELETE_SYSTEM (UT-6725) ve DELETE_NOT_OWNER rejected', () => {
    for (const code of ['UT-6725', 'UT-6704'])
      expect(classifyMutationError({ response: { data: { errorCode: code } } }, 'delete')).toBe(
        'rejected',
      );
  });

  it('ağ hatası ve 5xx retry — kodsuz gövde kalıcı SAYILMIYOR', () => {
    expect(classifyMutationError(new Error('Network Error'), 'reaction')).toBe('retry');
    expect(classifyMutationError({ response: { status: 503, data: {} } }, 'delete')).toBe('retry');
  });

  it('429 retry — slot harcamadığı için ceza yok', () => {
    expect(classifyMutationError({ response: { status: 429, data: {} } }, 'reaction')).toBe('retry');
  });
});

describe('nextEligibleAt', () => {
  it('üstel ve 5 dakikada tavanlanıyor', () => {
    expect(nextEligibleAt(0, 1_000)).toBe(3_000);
    expect(nextEligibleAt(10, 1_000)).toBe(301_000);
  });
});

describe('shouldStopFlush', () => {
  // Review Focus: bilinmeyen bütçe turu ÖLDÜRMEMELİ (Faz 3'te bu hatayı yaptık).
  it('remaining null iken DEVAM, rezervin altında DUR', () => {
    expect(shouldStopFlush(null, 0)).toBe(false);
    expect(shouldStopFlush(MUTATION_RATE_RESERVE - 1, 0)).toBe(true);
    expect(shouldStopFlush(500, MAX_OPS_PER_FLUSH)).toBe(true);
  });
});
