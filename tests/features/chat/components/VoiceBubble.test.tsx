// voicePlayback artık ensureCachedMedia üzerinden çalıyor (bkz. mediaCache.ts,
// Task 4) — bu test o katmanın chatRepository/expo-sqlite zincirine hiç
// girmesin diye `ensureCachedMedia`yı doğrudan mock'luyor.
jest.mock('@/features/chat/mediaCache', () => ({
  ensureCachedMedia: jest.fn(),
}));
// Hata toast'ı react-native-notifier → react-native-gesture-handler
// zincirine giriyor (bkz. MessageActionSheet.test.tsx'teki aynı not) — bu
// testin konusu toast'ın İÇERİĞİ değil, balonun görünümü.
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));

import { act, render } from '@testing-library/react-native';
import { ensureCachedMedia } from '@/features/chat/mediaCache';
import {
  stopVoicePlayback,
  toggleVoicePlayback,
} from '@/features/chat/voicePlayback';
import VoiceBubble from '@/features/chat/components/VoiceBubble';

const ensureCachedMediaMock = ensureCachedMedia as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  stopVoicePlayback();
});

describe('VoiceBubble — oynatma hatası görünümü', () => {
  it('idle hâlde oynat düğmesi tam opak', () => {
    const { getByTestId } = render(
      <VoiceBubble messageId="msg-idle" isOwn={false} durationMs={5000} />,
    );
    const button = getByTestId('voice-play-msg-idle');
    const style = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style)
      : button.props.style;
    expect(style.opacity).toBe(1);
  });

  it('hatalı oynatma hâli balonu idle’dan FARKLI çiziyor (soluk) ama tıklanabilir kalıyor', async () => {
    ensureCachedMediaMock.mockResolvedValue(null);

    const { getByTestId } = render(
      <VoiceBubble messageId="msg-err" isOwn={false} durationMs={5000} />,
    );

    // Gerçek voicePlayback akışını tetikliyoruz: offline/kopyasız senaryo.
    await act(async () => {
      await toggleVoicePlayback('msg-err');
    });

    const button = getByTestId('voice-play-msg-err');
    const style = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style)
      : button.props.style;
    // Hata hâli `failed` (gönderim) ile AYNI soluk görünümü ödünç alıyor —
    // bu satır silinirse balon idle'dan ayırt edilemez hale gelirdi (reviewer
    // bulgusu: "invisible at the bubble").
    expect(style.opacity).toBe(0.5);
    // Ama KİLİTLİ DEĞİL: `failed` (gönderim hatası) aksine dokunuş hâlâ etkin
    // — bir sonraki dokunuş yeniden dener (bkz. voicePlayback.ts recoverable
    // tasarımı). `disabled` burada false kalmalı.
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
  });
});
