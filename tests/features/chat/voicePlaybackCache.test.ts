jest.mock('@/features/chat/mediaCache', () => ({
  ensureCachedMedia: jest.fn(),
}));
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getMediaUrl: jest.fn() },
}));
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));

import { createAudioPlayer } from 'expo-audio';
import { ensureCachedMedia } from '@/features/chat/mediaCache';
import chatService from '@/features/chat/chatService';
import { showInfoToast } from '@/shared/services/toaster';
import {
  getVoicePlaybackState,
  stopVoicePlayback,
  toggleVoicePlayback,
} from '@/features/chat/voicePlayback';

const ensureCachedMediaMock = ensureCachedMedia as jest.Mock;
const getMediaUrlMock = (chatService as any).getMediaUrl as jest.Mock;
const createAudioPlayerMock = createAudioPlayer as jest.Mock;
const showInfoToastMock = showInfoToast as jest.Mock;

/**
 * `jest.setup.ts`teki ortak expo-audio mock'u `isLoaded: false, duration: 0`
 * döndürüyor (kayıt tarafı için yeterli) — bu suite oynatmanın HAZIR olup
 * `beginPlayback`in hemen tetiklendiği senaryoyu kurmak zorunda, o yüzden
 * her testte `createAudioPlayer`in dönüşünü burada özelleştiriyoruz.
 */
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

beforeEach(() => {
  jest.clearAllMocks();
  stopVoicePlayback();
  createAudioPlayerMock.mockImplementation(() => mockPlayer());
});

describe('toggleVoicePlayback — kaynak çözümü', () => {
  it('kendi kaydımız varsa önbelleğe HİÇ sorulmuyor', async () => {
    await toggleVoicePlayback('msg-own', { localUri: 'file:///rec.m4a', durationMs: 3000 });

    expect(ensureCachedMediaMock).not.toHaveBeenCalled();
    expect(getMediaUrlMock).not.toHaveBeenCalled();
    expect(createAudioPlayerMock).toHaveBeenCalledWith(
      'file:///rec.m4a',
      expect.objectContaining({ downloadFirst: false }),
    );
    expect(getVoicePlaybackState().error).toBe(false);
  });

  it('ikinci oynatma ağa DOĞRUDAN çıkmıyor', async () => {
    ensureCachedMediaMock.mockResolvedValue('file:///cache/msg-a.m4a');

    await toggleVoicePlayback('msg-a');
    stopVoicePlayback();
    await toggleVoicePlayback('msg-a');

    // Eski kod doğrudan chatService.getMediaUrl çağırıyordu — artık BÜTÜN
    // kaynak çözümü ensureCachedMedia üzerinden geçiyor, voicePlayback bir
    // daha hiç ağa dokunmuyor (ikinci oynatmada da, birincide de).
    expect(getMediaUrlMock).not.toHaveBeenCalled();
    expect(ensureCachedMediaMock).toHaveBeenCalledTimes(2);
    expect(ensureCachedMediaMock).toHaveBeenNthCalledWith(1, 'msg-a');
    expect(ensureCachedMediaMock).toHaveBeenNthCalledWith(2, 'msg-a');
    // Önbellekten dönen yol da YEREL bir dosya — downloadFirst'ün uzak
    // kaynak varsayımına düşmediğini doğrular (bkz. :365-375 yorumu).
    expect(createAudioPlayerMock).toHaveBeenLastCalledWith(
      'file:///cache/msg-a.m4a',
      expect.objectContaining({ downloadFirst: false }),
    );
  });

  it('kopya yoksa ve offline ise oynatıcı HATA hâline geçiyor, loading’de kalmıyor', async () => {
    ensureCachedMediaMock.mockResolvedValue(null);

    await toggleVoicePlayback('msg-offline');

    const state = getVoicePlaybackState();
    expect(state.error).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.playing).toBe(false);
    expect(createAudioPlayerMock).not.toHaveBeenCalled();
    expect(showInfoToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error' }),
    );
  });

  it('hata hâlinden sonra tekrar dokunmak yeniden deniyor', async () => {
    ensureCachedMediaMock.mockResolvedValueOnce(null);
    await toggleVoicePlayback('msg-retry');
    expect(getVoicePlaybackState().error).toBe(true);

    ensureCachedMediaMock.mockResolvedValueOnce('file:///cache/msg-retry.m4a');
    await toggleVoicePlayback('msg-retry');

    expect(ensureCachedMediaMock).toHaveBeenCalledTimes(2);
    const state = getVoicePlaybackState();
    expect(state.error).toBe(false);
    expect(createAudioPlayerMock).toHaveBeenCalledWith(
      'file:///cache/msg-retry.m4a',
      expect.objectContaining({ downloadFirst: false }),
    );
  });
});
