jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
  seekTo: jest.fn(),
  addListener: jest.fn(),
  playing: false,
};

const mockCreateAudioPlayer = jest.fn((..._args: any[]) => mockPlayer);
const mockSetAudioModeAsync = jest.fn((..._args: any[]) => Promise.resolve());

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: any[]) => mockCreateAudioPlayer(...args),
  setAudioModeAsync: (...args: any[]) => mockSetAudioModeAsync(...args),
}));

import { ActivityIndicator, TouchableOpacity } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import VoicePlayer from '@/features/chat/components/VoicePlayer';

beforeEach(() => {
  mockCreateAudioPlayer.mockClear();
  mockSetAudioModeAsync.mockClear();
  mockPlayer.play.mockClear();
  mockPlayer.pause.mockClear();
  mockPlayer.remove.mockClear();
  mockPlayer.seekTo.mockClear();
  mockPlayer.addListener.mockClear();
  mockPlayer.playing = false;
});

describe('VoicePlayer — initial render', () => {
  it('renders the initial 0:00 duration display', () => {
    const tree = render(
      <VoicePlayer uri="https://x/audio.mp3" isOwn={false} />
    );
    expect(tree.getByText('0:00')).toBeTruthy();
  });

  it('does not create an audio player until pressed', () => {
    render(<VoicePlayer uri="https://x/audio.mp3" isOwn={false} />);
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });
});

describe('VoicePlayer — first press loads and plays', () => {
  it('creates an audio player with the given uri and starts playback', async () => {
    const tree = render(
      <VoicePlayer uri="https://x/audio.mp3" isOwn={false} />
    );

    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
    });
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith({
      uri: 'https://x/audio.mp3',
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('shows an ActivityIndicator while loading on first press', async () => {
    // setAudioModeAsync ı bekleyen bir promise yap → loading state'i gözle.
    let resolveLoad: any;
    mockSetAudioModeAsync.mockReturnValue(
      new Promise((res) => {
        resolveLoad = res;
      })
    );

    const tree = render(
      <VoicePlayer uri="https://x/audio.mp3" isOwn={false} />
    );

    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });

    expect(tree.UNSAFE_queryAllByType(ActivityIndicator).length).toBe(1);

    await act(async () => {
      resolveLoad();
    });
  });
});

describe('VoicePlayer — toggle play/pause', () => {
  it('pauses the player when pressed during playback', async () => {
    const tree = render(<VoicePlayer uri="https://x/a.mp3" isOwn />);
    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    mockPlayer.playing = true;

    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('resumes the player when pressed while paused', async () => {
    const tree = render(<VoicePlayer uri="https://x/a.mp3" isOwn />);
    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    mockPlayer.playing = false;
    mockPlayer.play.mockClear();

    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('does nothing when uri is missing', async () => {
    const tree = render(<VoicePlayer uri={null} isOwn={false} />);
    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });
});

describe('VoicePlayer — cleanup', () => {
  it('removes the player on unmount', async () => {
    const tree = render(<VoicePlayer uri="https://x/a.mp3" isOwn />);
    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    tree.unmount();
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
  });
});

describe('VoicePlayer — playback status updates', () => {
  it('updates remaining-time display from playbackStatusUpdate events', async () => {
    const tree = render(<VoicePlayer uri="https://x/a.mp3" isOwn={false} />);
    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });

    const [event, cb] = mockPlayer.addListener.mock.calls[0];
    expect(event).toBe('playbackStatusUpdate');

    await act(async () => {
      cb({ isLoaded: true, currentTime: 12, duration: 60, playing: true });
    });
    // 60-12 = 48s → 0:48
    expect(tree.getByText('0:48')).toBeTruthy();
  });

  it('resets position when playback finishes', async () => {
    const tree = render(<VoicePlayer uri="https://x/a.mp3" isOwn={false} />);
    await act(async () => {
      fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    });
    const cb = mockPlayer.addListener.mock.calls[0][1];

    await act(async () => {
      cb({
        isLoaded: true,
        currentTime: 60,
        duration: 60,
        playing: false,
        didJustFinish: true,
      });
    });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  });
});
