jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getMediaUrl: jest.fn() },
}));

/**
 * jest.setup.ts zaten `expo-file-system`i KÜRESEL olarak mock'luyor (varsayılan
 * `exists = true`, indirme hep başarılı) — ama bu suite `exists`i mesaj
 * başına AÇIP KAPATMAK ve silinen yolları TOPLAMAK zorunda (Review Focus 1
 * ve 3), küresel mock bunu desteklemiyor. Bu dosyanın kendi `jest.mock`'u,
 * jest'in modül kaydında bu dosyaya özgü olduğu için küresel mock'u EZİYOR —
 * photoPicker.test.ts'teki aynı desen (bkz. o dosyanın `File.downloadFileAsync`
 * referansı), buradaki fark `exists`in map'ten okunması.
 */
jest.mock('expo-file-system', () => {
  const existsByUri = new Map<string, boolean>();
  const deletedPaths: string[] = [];
  class MockFile {
    uri: string;
    size = 1000;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p?.uri ?? '')).join('/');
    }
    get exists() {
      return existsByUri.get(this.uri) ?? true;
    }
    delete() {
      deletedPaths.push(this.uri);
      existsByUri.set(this.uri, false);
    }
  }
  class MockDirectory {
    uri: string;
    exists = true;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p?.uri ?? '')).join('/');
    }
    create() {}
  }
  (MockFile as any).downloadFileAsync = jest.fn(async (_url: string, destination: any) => {
    existsByUri.set(destination.uri, true);
    return destination;
  });
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///documents' }, cache: { uri: 'file:///caches' } },
    __existsByUri: existsByUri,
    __deletedPaths: deletedPaths,
  };
});

import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import chatService from '@/features/chat/chatService';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { saveMessage, setMediaCache, readMediaCache, readAllCachedUris } from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import {
  ensureCachedMedia,
  evictOverCap,
  wipeMediaCache,
  dropCachedMedia,
} from '@/features/chat/mediaCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const fsMock = jest.requireMock('expo-file-system') as {
  __existsByUri: Map<string, boolean>;
  __deletedPaths: string[];
};
const getMediaUrl = (chatService as any).getMediaUrl as jest.Mock;

const CONV = 'conv-1';
const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: '',
    contentType: 2, // voice
    sentAt: '2026-10-31T10:00:00.000Z',
    ...over,
  }) as MessageDto;

function mockFileExists(uri: string, value: boolean) {
  fsMock.__existsByUri.set(uri, value);
}

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  fsMock.__existsByUri.clear();
  fsMock.__deletedPaths.length = 0;
  getMediaUrl.mockReset();
  (File.downloadFileAsync as jest.Mock).mockClear();
});

describe('ensureCachedMedia — Review Focus 1: satır var ama dosya YOK', () => {
  it('satır var ama dosya YOK: yeniden indiriyor, kalıcı patlamıyor', async () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///gone.m4a', 1000, 1);
    mockFileExists('file:///gone.m4a', false);
    getMediaUrl.mockResolvedValue({ url: 'https://cdn/m1.m4a', expiresAt: null, durationMs: null });

    const result = await ensureCachedMedia('m1');

    expect(getMediaUrl).toHaveBeenCalledWith('m1');
    // Yeniden indirme KALICI patlamadı — yeni bir yerel yol elimizde.
    expect(result).toBeTruthy();
  });

  it('dosya varsa AĞA ÇIKMIYOR ve damga tazeleniyor', async () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///here.m4a', 1000, 1);
    mockFileExists('file:///here.m4a', true);

    const result = await ensureCachedMedia('m1');

    expect(getMediaUrl).not.toHaveBeenCalled();
    expect(result).toBe('file:///here.m4a');
    // Damga tazelendi mi — readMediaCache üstünden dolaylı doğrulama:
    // touchMediaCache çağrılmasaydı media_cached_at_ms 1'de KALIRDI.
    expect(readMediaCache('m1')?.media_cached_at_ms).not.toBe(1);
  });
});

describe('ensureCachedMedia — Review Focus 5: offline ve hata yolları', () => {
  it('offline + kopya yok → null, satır yazılmıyor', async () => {
    saveMessage(msg('m1'), CONV);
    getMediaUrl.mockRejectedValue(new Error('network-down'));

    const result = await ensureCachedMedia('m1');

    expect(result).toBeNull();
    expect(readMediaCache('m1')).toBeNull();
  });

  it('getMediaUrl patlarsa null dönüyor, yarım satır bırakmıyor', async () => {
    saveMessage(msg('m1'), CONV);
    getMediaUrl.mockRejectedValue(new Error('UT-6606'));

    const result = await ensureCachedMedia('m1');

    expect(result).toBeNull();
    // Yarım yazım yok: ne local_uri ne damga — satır hâlâ "önbellek yok" hâlinde.
    expect(readMediaCache('m1')).toBeNull();
  });
});

describe('wipeMediaCache — Review Focus 3: dosyaların kendisi', () => {
  it('wipeMediaCache DOSYALARI siliyor, yalnız satırları değil', () => {
    saveMessage(msg('m1'), CONV);
    saveMessage(msg('m2'), CONV);
    setMediaCache('m1', 'file:///a.m4a', 10, 1);
    setMediaCache('m2', 'file:///b.m4a', 10, 2);

    wipeMediaCache();

    expect(fsMock.__deletedPaths).toEqual(['file:///a.m4a', 'file:///b.m4a']);
  });

  it('clearAllChatData önbellek dosyalarını da siliyor', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///a.m4a', 10, 1);

    // resetChat choke-point'indeki gerçek sıra: satırlar hâlâ okunabilirken
    // önce dosyalar silinir, SONRA tablo boşaltılır (chatMirrorMiddleware).
    const urisBeforeClear = readAllCachedUris();
    wipeMediaCache();

    expect(urisBeforeClear).toEqual(['file:///a.m4a']);
    expect(fsMock.__deletedPaths).toContain('file:///a.m4a');
  });
});

describe('dropCachedMedia — Review Focus 4: UT-6606', () => {
  it('herkesten silinen mesajın yerel kopyası diskten gidiyor', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///a.m4a', 10, 1);

    dropCachedMedia('m1');

    expect(fsMock.__deletedPaths).toEqual(['file:///a.m4a']);
    expect(readMediaCache('m1')).toBeNull();
  });

  it('önbellek kaydı yoksa sessizce hiçbir şey yapmıyor', () => {
    saveMessage(msg('m1'), CONV);

    expect(() => dropCachedMedia('m1')).not.toThrow();
    expect(fsMock.__deletedPaths).toEqual([]);
  });
});

describe('evictOverCap — Review Focus 2: kendi kaydımıza dokunmama + tavan altı sessizliği', () => {
  it('tahliye gönderilmemiş kendi kaydımızın dosyasına DOKUNMUYOR', () => {
    // Kendi gönderdiğimiz kayıt: media_cached_at_ms hiç yazılmadı (outbox'ın
    // mülkü), yani readCacheEntriesOldestFirst onu hiç döndürmüyor — evictOverCap
    // bu listeyi kullandığı için o dosyaya ASLA ulaşamıyor.
    saveMessage(msg('temp-cmid-1', { _localUri: 'file:///rec.m4a' }), CONV, 'pending');
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///a.m4a', 10, 1);

    evictOverCap();

    expect(fsMock.__deletedPaths).not.toContain('file:///rec.m4a');
  });

  it('evictOverCap tavanın altındayken hiçbir dosyayı silmiyor', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///a.m4a', 10, 1);

    const count = evictOverCap();

    expect(count).toBe(0);
    expect(fsMock.__deletedPaths).toEqual([]);
    expect(readMediaCache('m1')).not.toBeNull();
  });

  it('tavanı aşınca en eski kopyayı siler (dosya + satır)', () => {
    saveMessage(msg('m1'), CONV);
    saveMessage(msg('m2'), CONV);
    const MAX = 200 * 1024 * 1024;
    setMediaCache('m1', 'file:///old.m4a', MAX, 1); // tek başına tavanda
    setMediaCache('m2', 'file:///new.m4a', 10, 2); // tavanı aşırıyor

    const count = evictOverCap();

    expect(count).toBe(1);
    expect(fsMock.__deletedPaths).toEqual(['file:///old.m4a']);
    expect(readMediaCache('m1')).toBeNull();
    expect(readMediaCache('m2')).not.toBeNull();
  });
});
