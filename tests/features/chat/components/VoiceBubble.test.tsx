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

import { act, fireEvent, render } from '@testing-library/react-native';
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

    // Ama KİLİTLİ DEĞİL: dokunuş hâlâ etkin, bir sonraki dokunuş yeniden
    // dener (bkz. voicePlayback.ts recoverable tasarımı).
    //
    // Bunu GERÇEK bir basışla doğruluyoruz (review Önemli 5). Eski hâli
    // `accessibilityState?.disabled`ın falsy olmasına bakıyordu — Pressable'a
    // `disabled` prop'u HİÇ verilmiyor, yani o assertion her zaman geçiyordu.
    // Tıklanabilirliği kuran şey `onToggle`daki `if (!canPlay) return`; tam
    // olarak VoiceBubble.tsx:366-371'in uyardığı regresyon (`playbackFailed`i
    // `canPlay`e eklemek) eski assertion'ı KIRMIYORDU.
    ensureCachedMediaMock.mockResolvedValue('file:///cache/msg-err.m4a');
    await act(async () => {
      fireEvent.press(button);
    });
    expect(ensureCachedMediaMock).toHaveBeenCalledTimes(2);
  });
});
