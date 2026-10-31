jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
// Bu suite'in konusu mediaCache'in İÇİ değil, oynatma yolunun ORAYA VARIP
// VARMADIĞI — runner mock'lanıyor, projeksiyon ve repo GERÇEK.
jest.mock('@/features/chat/mediaCache', () => ({
  ensureCachedMedia: jest.fn(),
}));
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));

import * as SQLite from 'expo-sqlite';
import { createAudioPlayer } from 'expo-audio';
import { ensureCachedMedia } from '@/features/chat/mediaCache';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { readWindow, saveMessage, setMediaCache } from '@/features/chat/chatRepository';
import { clear as clearMessageCache, projectWindow } from '@/features/chat/messageCache';
import { stopVoicePlayback, toggleVoicePlayback } from '@/features/chat/voicePlayback';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const ensureCachedMediaMock = ensureCachedMedia as jest.Mock;
const createAudioPlayerMock = createAudioPlayer as jest.Mock;

const CONV = 'conv-1';

const incoming = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: '',
    contentType: 2, // voice
    sentAt: '2026-10-31T10:00:00.000Z',
    ...over,
  }) as MessageDto;

/** jest.setup'ın ortak expo-audio mock'u `isLoaded:false` döndürüyor. */
function mockPlayer() {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setPlaybackRate: jest.fn(),
    shouldCorrectPitch: true,
    playbackRate: 1,
    duration: 5,
    isLoaded: true,
  };
}

/**
 * "Bir sonraki açılış": messageCache'in identity map'i process ile ölüyor, yani
 * projeksiyon satırı SIFIRDAN kuruyor. `setMediaCache` `row_version`'ı bilerek
 * artırmadığı için indirmeyi YAPAN oturumda ekran hâlâ indirme ÖNCESİ nesneyi
 * görüyordu — Kritik 1'in oturum içinde MASKELENMESİNİN sebebi tam bu. Hatanın
 * gözlenebildiği tek yer taze projeksiyon.
 */
function relaunch(): MessageDto[] {
  clearMessageCache();
  return projectWindow(CONV, readWindow(CONV));
}

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  jest.clearAllMocks();
  stopVoicePlayback();
  createAudioPlayerMock.mockImplementation(() => mockPlayer());
});

describe('projeksiyon → oynatma (Faz 5 review, Kritik 1)', () => {
  it('ÖNBELLEĞE ALINMIŞ GELEN mesaj taze projeksiyonda _localUri TAŞIMIYOR', () => {
    saveMessage(incoming('m1'), CONV);
    setMediaCache('m1', 'file:///documents/chat-media-cache/m1.m4a', 4096, 1000);

    const [dto] = relaunch();

    // Düzeltmeden ÖNCE burası önbellek yolunu döndürüyordu: `_localUri` DTO'ya
    // çıkınca VoiceBubble onu `toggleVoicePlayback`e veriyor ve oynatma
    // `ensureCachedMedia`yı TAMAMEN atlıyordu.
    expect(dto._localUri).toBeNull();
  });

  it('o mesajın oynatılması ensureCachedMedia’ya VARIYOR (var-mı kontrolü + LRU touch)', async () => {
    saveMessage(incoming('m1'), CONV);
    setMediaCache('m1', 'file:///documents/chat-media-cache/m1.m4a', 4096, 1000);
    ensureCachedMediaMock.mockResolvedValue('file:///documents/chat-media-cache/m1.m4a');

    const [dto] = relaunch();
    // VoiceBubble.tsx:484 / MessageBubble.tsx:484 ile AYNI geçiş.
    await toggleVoicePlayback(dto.id, { localUri: dto._localUri, durationMs: dto.durationMs });

    // Düzeltmeden ÖNCE: 0 çağrı. Dosya gitmişse (yeniden kurulum, konteyner
    // taşıması, tahliye) oynatıcı ÖLÜ yolu alıyor ve her yeniden deneme AYNI
    // ölü yola gidiyordu — mesaj KALICI olarak çalınamaz oluyordu. Bu çağrı
    // aynı zamanda `touchMediaCache`in (LRU'nun "recently used" yarısı) tek
    // tetikleyicisi.
    expect(ensureCachedMediaMock).toHaveBeenCalledTimes(1);
    expect(ensureCachedMediaMock).toHaveBeenCalledWith('m1');
  });

  it('KENDİ kaydımız (cmid var, damga yok) _localUri taşımaya DEVAM ediyor', async () => {
    saveMessage(
      incoming('temp-cmid-1', {
        senderId: 'me',
        clientMessageId: 'cmid-1',
        _localUri: 'file:///caches/rec.m4a',
      }),
      CONV,
      'pending',
    );

    const [dto] = relaunch();

    // Daraltma outbox'ın/optimistic balonun yolunu KESMEMELİ — bu alanın
    // bütün eski tüketicileri (outboxPolicy, messageEquality, VoiceBubble)
    // tam olarak bu satırın üstünde duruyor.
    expect(dto._localUri).toBe('file:///caches/rec.m4a');

    await toggleVoicePlayback(dto.id, { localUri: dto._localUri });
    expect(ensureCachedMediaMock).not.toHaveBeenCalled();
  });

  it('kendi kaydımız yeniden İNDİRİLMİŞSE (cmid VE damga) artık _localUri taşımıyor', () => {
    // Kendi dosyamız kaybolup `ensureCachedMedia` indirmeye düştüğünde satırda
    // İKİSİ birden bulunuyor. Kapı yalnız `client_message_id`ye baksaydı bu
    // satır önbellek yolunu ekrana sızdırır ve Kritik 1 kendi mesajlarımız
    // için geri gelirdi.
    saveMessage(
      incoming('m2', { senderId: 'me', clientMessageId: 'cmid-2' }),
      CONV,
      'sent',
    );
    setMediaCache('m2', 'file:///documents/chat-media-cache/m2.m4a', 4096, 1000);

    const [dto] = relaunch();

    expect(dto._localUri).toBeNull();
  });
});
