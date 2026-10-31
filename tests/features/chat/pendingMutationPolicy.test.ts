import {
  EDIT_MAX_LENGTH,
  MAX_OPS_PER_FLUSH,
  MUTATION_MAX_AGE_MS,
  MUTATION_MAX_ATTEMPTS,
  MUTATION_RATE_RESERVE,
  classifyMutationError,
  coalesceDelete,
  coalesceEdit,
  coalesceReaction,
  editRejectReason,
  isMutationExpired,
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

describe('coalesceEdit', () => {
  it('coalesceEdit son içeriği alıyor, base İLK emrinkini koruyor', () => {
    const a = coalesceEdit(null, 'ikinci', 'orijinal');
    const b = coalesceEdit(a, 'ucuncu', 'ikinci');
    expect(b).toEqual({ content: 'ucuncu', base: 'orijinal' });
  });
});

describe('editRejectReason', () => {
  // Review Focus 5
  it('editRejectReason: boş, yalnız boşluk, tavan üstü ve DEĞİŞMEMİŞ içeriği kesiyor', () => {
    expect(editRejectReason('', 'a')).toBe('empty');
    expect(editRejectReason('   ', 'a')).toBe('empty');
    expect(editRejectReason('x'.repeat(EDIT_MAX_LENGTH + 1), 'a')).toBe('tooLong');
    expect(editRejectReason('ayni', 'ayni')).toBe('unchanged');
    expect(editRejectReason('yeni', 'eski')).toBeNull();
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

  // İSİM DÜZELTİLDİ: eskiden "slot harcamadığı için ceza yok" diyordu, oysa
  // cezasız bir yol YOK — tur 429'da da `attempts`i artırıp backoff yazıyor,
  // 500'le birebir aynı. Bu test yalnız SINIFLANDIRMAYI pinliyor.
  it('429 retry olarak sınıflandırılıyor (5xx ile aynı dal)', () => {
    expect(classifyMutationError({ response: { status: 429, data: {} } }, 'reaction')).toBe('retry');
  });

  // Review Focus 1
  it('UT-6723 edit için rejected — pencere dolması MEŞRU ret', () => {
    expect(classifyMutationError({ response: { data: { errorCode: 'UT-6723' } } }, 'edit')).toBe('rejected');
  });

  it('edit için ağ hatası retry, kalıcı edit kodları rejected', () => {
    expect(classifyMutationError(new Error('Network Error'), 'edit')).toBe('retry');
    // UT-6722 (EDIT_DELETED) burada YOK — kendi ayrı testinde 'done' bekleniyor
    // (bkz. aşağıdaki test): rejected sayılırsa "Düzenleme başarısız." toast'ı
    // kullanıcının KENDİ silme emrinden sonra gürültü olarak geri döner.
    for (const code of ['UT-6721', 'UT-6724', 'UT-6703'])
      expect(classifyMutationError({ response: { data: { errorCode: code } } }, 'edit')).toBe('rejected');
  });

  // Review Minör-8 — aynı mesaja kuyrukta hem edit hem delete varken delete
  // sunucuya ÖNCE ulaşırsa edit UT-6722 (EDIT_DELETED) ile döner. Bu HATA
  // değil: kullanıcının SON niyeti (silme) zaten gerçekleşti — 'done' silmede
  // UT-6720'nin AYNI mantığı (yukarıdaki "silmede UT-6720 BAŞARI" testiyle
  // simetrik).
  it('edit için UT-6722 (EDIT_DELETED) done sayılıyor — kullanıcının kendi silmesi, hata değil', () => {
    const editDeleted = { response: { data: { errorCode: 'UT-6722' } } };
    expect(classifyMutationError(editDeleted, 'edit')).toBe('done');
    // Diğer kind'lar için bu kodun bir anlamı yok — etkilenmemeli (actionRejected).
    expect(classifyMutationError(editDeleted, 'reaction')).toBe('rejected');
  });
});

describe('nextEligibleAt', () => {
  it('üstel ve 5 dakikada tavanlanıyor', () => {
    expect(nextEligibleAt(0, 1_000)).toBe(3_000);
    expect(nextEligibleAt(10, 1_000)).toBe(301_000);
  });

  // Dokümantasyon düzeltmesinin (minör 11) pinlenmesi: turun çağrı sözleşmesi
  // ARTIRILMIŞ sayaç olduğu için pratikte GÖRÜLEN ilk bekleme 2sn DEĞİL 4sn.
  it('turun çağırdığı gibi (artırılmış attempts) ilk tekrar 4sn sonra', () => {
    const now = 1_000;
    expect(nextEligibleAt(0 + 1, now)).toBe(now + 4_000);
    expect(nextEligibleAt(1 + 1, now)).toBe(now + 8_000);
  });
});

describe('isMutationExpired', () => {
  it('deneme tavanına varan emir bitiyor, bir eksiği devam ediyor', () => {
    const now = 1_000_000;
    expect(isMutationExpired(MUTATION_MAX_ATTEMPTS - 1, now, now)).toBe(false);
    expect(isMutationExpired(MUTATION_MAX_ATTEMPTS, now, now)).toBe(true);
  });

  it('yaş tavanını dolduran emir bitiyor — ölçü ÖMÜRLÜK (first_seen_at_ms)', () => {
    const now = 1_000_000_000;
    expect(isMutationExpired(0, now - MUTATION_MAX_AGE_MS + 1, now)).toBe(false);
    expect(isMutationExpired(0, now - MUTATION_MAX_AGE_MS, now)).toBe(true);
  });

  it('uzun bir uçuş (saatler) yaş tavanını DOLDURMUYOR — fazın kanonik senaryosu', () => {
    const now = 1_000_000_000;
    expect(isMutationExpired(0, now - 8 * 60 * 60_000, now)).toBe(false);
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
