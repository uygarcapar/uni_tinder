import {
  MAX_AGE_MS,
  MAX_ATTEMPTS,
  backoffDelayMs,
  classifySendError,
  isEligible,
  messageToDescriptor,
  selectFailedOutbox,
  type AttemptEntry,
} from '@/features/chat/outboxPolicy';
import { VoiceTooLargeError } from '@/features/chat/voiceSend';

const axiosErr = (status: number, data?: any) => ({ response: { status, data } });

describe('classifySendError', () => {
  it('kotayı her şeyin önüne alır — kullanıcıya gösterilecek şey paywall, hata metni değil', () => {
    const fc = classifySendError(axiosErr(402), 'text');
    expect(fc.reason).toBe('quota');
    expect(fc.retryable).toBe(false);
    expect(fc.toast).toBe(false);
  });

  it('paywallType gövdeden gelirse status 402 olmasa da kota sayılır', () => {
    const fc = classifySendError(
      axiosErr(400, { result: { paywallType: 'CHAT_QUOTA_EXHAUSTED' } }),
      'text',
    );
    expect(fc.reason).toBe('quota');
  });

  // Sözleşmenin en önemli maddesi: kod geldiyse STATUS'a bakılmaz — aynı hata
  // uca göre 400/404 dönebiliyordu.
  it('UT kodu varsa status yok sayılır (UT-6740 → sohbet kapandı)', () => {
    const fc = classifySendError(axiosErr(400, { code: 'UT-6740' }), 'text');
    expect(fc.reason).toBe('conversationGone');
    expect(fc.retryable).toBe(false);
    expect(fc.deactivateConversation).toBe(true);
    expect(fc.refetchConversations).toBe(true);
    expect(fc.chatCode).toBe('UT-6740');
  });

  it('UT-6710 (boş içerik) girdi hatası — yeniden denemek aynı cevabı verir', () => {
    const fc = classifySendError(axiosErr(400, { code: 'UT-6710' }), 'text');
    expect(fc.reason).toBe('inputInvalid');
    expect(fc.retryable).toBe(false);
    expect(fc.deactivateConversation).toBe(false);
  });

  it.each([
    ['UT-6601', 'chat.voice.badFormat'],
    ['UT-6602', 'chat.voice.tooLarge'],
    ['UT-6603', 'chat.voice.maxDuration'],
  ])('%s → kalıcı ses hatası, kendi metniyle', (code, key) => {
    const fc = classifySendError(axiosErr(400, { code }), 'voice');
    expect(fc.reason).toBe('voiceInvalid');
    expect(fc.retryable).toBe(false);
    expect(fc.i18nKey).toBe(key);
    expect(fc.voiceCode).toBe(code);
  });

  it('VoiceTooLargeError ağa hiç çıkmadan UT-6602 sayılır', () => {
    const fc = classifySendError(new VoiceTooLargeError(), 'voice');
    expect(fc.reason).toBe('voiceInvalid');
    expect(fc.voiceCode).toBe('UT-6602');
    expect(fc.i18nKey).toBe('chat.voice.tooLarge');
  });

  it.each(['voice-file-missing', 'voice-file-empty'])(
    '%s → dosya geri gelmeyecek, kalıcı',
    (message) => {
      const fc = classifySendError(new Error(message), 'voice');
      expect(fc.reason).toBe('voiceFileGone');
      expect(fc.retryable).toBe(false);
    },
  );

  it.each([403, 404])('kodsuz %i → sohbet gitmiş', (status) => {
    const fc = classifySendError(axiosErr(status), 'text');
    expect(fc.reason).toBe('conversationGone');
    expect(fc.retryable).toBe(false);
    expect(fc.deactivateConversation).toBe(true);
  });

  it('kodsuz 400 → listeyi doğrulat ama sohbeti kapatma', () => {
    const fc = classifySendError(axiosErr(400), 'text');
    expect(fc.reason).toBe('inputInvalid');
    expect(fc.deactivateConversation).toBe(false);
    expect(fc.refetchConversations).toBe(true);
  });

  it.each([500, 503, 429])('%i geçici — yeniden denenir', (status) => {
    expect(classifySendError(axiosErr(status), 'text').retryable).toBe(true);
  });

  it('ağ hatası (status yok) geçici', () => {
    const fc = classifySendError(new Error('Network Error'), 'text');
    expect(fc.reason).toBe('transient');
    expect(fc.retryable).toBe(true);
  });

  it('kuyruk zaman aşımı geçici', () => {
    expect(classifySendError(new Error('send-timeout'), 'voice').retryable).toBe(true);
  });

  // Toast kuralı iki yolda FARKLI ve bu bilinçli: metin balonun kırmızıya
  // dönmesiyle yetiniyor, ses her hatada metin gösteriyor.
  it('kodsuz geçici hatada metin yolu toast göstermez, ses yolu gösterir', () => {
    expect(classifySendError(new Error('Network Error'), 'text').toast).toBe(false);
    expect(classifySendError(new Error('Network Error'), 'voice').toast).toBe(true);
  });

  it('TANINMAYAN bir UT-67xx kodunda metin yolu da toast gösterir', () => {
    const fc = classifySendError(axiosErr(500, { code: 'UT-6799' }), 'text');
    expect(fc.chatCode).toBe('UT-6799');
    expect(fc.toast).toBe(true);
    expect(fc.retryable).toBe(true);
  });
});

describe('messageToDescriptor', () => {
  it('metin mesajını yanıt hedefiyle birlikte çevirir', () => {
    const d = messageToDescriptor({
      conversationId: 'c1',
      clientMessageId: 'cm1',
      content: 'selam',
      contentType: 0,
      replyTo: { id: 'm9' },
    });
    expect(d).toEqual({
      kind: 'text',
      conversationId: 'c1',
      clientMessageId: 'cm1',
      content: 'selam',
      replyToMessageId: 'm9',
    });
  });

  it('boş/boşluk metni gönderilemez (sunucu UT-6710 verirdi)', () => {
    expect(
      messageToDescriptor({ conversationId: 'c1', clientMessageId: 'cm1', content: '   ' }),
    ).toBeNull();
  });

  it('sesli mesajı yerel dosyasıyla çevirir', () => {
    const d = messageToDescriptor({
      conversationId: 'c1',
      clientMessageId: 'cm2',
      contentType: 2,
      durationMs: 3200,
      waveformPeaks: '1,2,3',
      _localUri: 'file:///a.m4a',
      replyTo: null,
    });
    expect(d).toMatchObject({ kind: 'voice', localUri: 'file:///a.m4a', durationMs: 3200 });
  });

  // Asıl korunan şey: _localUri düşmüş ses mesajı eskiden metin yoluna düşüp
  // content:"" gönderiyordu ve balon bir daha asla düzelmiyordu.
  it('_localUri yoksa sesli mesaj METİN yoluna DÜŞMEZ, null döner', () => {
    expect(
      messageToDescriptor({
        conversationId: 'c1',
        clientMessageId: 'cm3',
        contentType: 2,
        content: '',
        durationMs: 3200,
      }),
    ).toBeNull();
  });

  it('contentType "Voice" (string enum) de ses sayılır', () => {
    const d = messageToDescriptor({
      conversationId: 'c1',
      clientMessageId: 'cm4',
      contentType: 'Voice',
      _localUri: 'file:///b.m4a',
      durationMs: 1000,
    });
    expect(d?.kind).toBe('voice');
  });

  it('clientMessageId yoksa çevrilemez', () => {
    expect(messageToDescriptor({ conversationId: 'c1', content: 'x' })).toBeNull();
  });
});

describe('selectFailedOutbox', () => {
  const state = {
    chat: {
      messagesByConv: {
        // Bucket'lar en yeniden eskiye dizili — fonksiyon bunu düzleştirip
        // GLOBAL sentAt sırasına sokmalı.
        c1: {
          messages: [
            { clientMessageId: 'b', sentAt: '2026-09-16T10:00:03Z', _failed: true },
            { clientMessageId: 'ok', sentAt: '2026-09-16T10:00:02Z' },
          ],
        },
        c2: {
          messages: [
            { clientMessageId: 'c', sentAt: '2026-09-16T10:00:05Z', _failed: true },
            { clientMessageId: 'a', sentAt: '2026-09-16T10:00:01Z', _failed: true },
            { clientMessageId: 'pending', sentAt: '2026-09-16T10:00:04Z', _pending: true },
          ],
        },
        c3: { messages: [] },
      },
    },
  };

  it('tüm sohbetlerden başarısızları toplar, eskiden yeniye sıralar', () => {
    expect(selectFailedOutbox(state).map((m) => m.clientMessageId)).toEqual(['a', 'b', 'c']);
  });

  it('bekleyen ve gönderilmiş mesajlara dokunmaz', () => {
    const ids = selectFailedOutbox(state).map((m) => m.clientMessageId);
    expect(ids).not.toContain('pending');
    expect(ids).not.toContain('ok');
  });

  it('boş/bozuk state güvenli', () => {
    expect(selectFailedOutbox(undefined)).toEqual([]);
    expect(selectFailedOutbox({ chat: {} })).toEqual([]);
    expect(selectFailedOutbox({ chat: { messagesByConv: { c1: {} } } })).toEqual([]);
  });
});

describe('backoffDelayMs', () => {
  it('4 → 8 → 16 → 32 saniye', () => {
    expect(backoffDelayMs(1)).toBe(4_000);
    expect(backoffDelayMs(2)).toBe(8_000);
    expect(backoffDelayMs(3)).toBe(16_000);
    expect(backoffDelayMs(4)).toBe(32_000);
  });

  it('60 saniyede tavan yapar', () => {
    expect(backoffDelayMs(5)).toBe(60_000);
    expect(backoffDelayMs(99)).toBe(60_000);
  });
});

describe('isEligible', () => {
  const NOW = 1_000_000;
  const entry = (over: Partial<AttemptEntry> = {}): AttemptEntry => ({
    attempts: 1,
    firstSeenAt: NOW,
    nextEligibleAt: NOW,
    origin: 'throw',
    permanent: false,
    quotaCharged: false,
    ...over,
  });

  it('kaydı olmayan mesaj hemen denenir', () => {
    expect(isEligible(undefined, NOW, 'silent')).toBe(true);
  });

  it('backoff penceresi dolmadan denenmez', () => {
    expect(isEligible(entry({ nextEligibleAt: NOW + 5_000 }), NOW, 'silent')).toBe(false);
    expect(isEligible(entry({ nextEligibleAt: NOW + 5_000 }), NOW + 5_000, 'silent')).toBe(true);
  });

  it('kalıcı hata ve tavan sessiz denemeyi durdurur', () => {
    expect(isEligible(entry({ permanent: true }), NOW, 'silent')).toBe(false);
    expect(isEligible(entry({ attempts: MAX_ATTEMPTS }), NOW, 'silent')).toBe(false);
  });

  it('yaş sınırını geçen mesaj sessizce denenmez', () => {
    expect(isEligible(entry(), NOW + MAX_AGE_MS + 1, 'silent')).toBe(false);
  });

  // Mükerrer mesaj koruması: ack gelmemesi "gitmedi" demek değil.
  it('ackTimeout kaynaklı hata SESSİZ denenmez ama elle denenebilir', () => {
    const e = entry({ origin: 'ackTimeout' });
    expect(isEligible(e, NOW, 'silent')).toBe(false);
    expect(isEligible(e, NOW, 'interactive')).toBe(true);
  });

  it('kullanıcı tetiklediğinde hiçbir kapı bağlamaz', () => {
    const dead = entry({ permanent: true, attempts: 99, nextEligibleAt: NOW + 60_000 });
    expect(isEligible(dead, NOW, 'interactive')).toBe(true);
  });
});
