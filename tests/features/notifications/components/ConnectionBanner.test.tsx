import { act, render } from '@testing-library/react-native';
import ConnectionBanner from '@/features/notifications/components/ConnectionBanner';

let mockStateHandler: ((s: string) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@/features/chat/realtimeService', () => ({
  __esModule: true,
  default: {
    on: (event: string, cb: (s: string) => void) => {
      if (event === '__connectionStateChanged') mockStateHandler = cb;
      return mockUnsubscribe;
    },
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockStateHandler = null;
  mockUnsubscribe.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ConnectionBanner', () => {
  it('renders nothing while connected', () => {
    const { queryByText, toJSON } = render(<ConnectionBanner />);
    expect(queryByText('Bağlantı koptu')).toBeNull();
    expect(toJSON()).toBeNull();
  });

  it('shows the disconnected banner text when state becomes "disconnected"', () => {
    const tree = render(<ConnectionBanner />);
    act(() => {
      mockStateHandler?.('disconnected');
    });
    expect(tree.getByText('Bağlantı koptu')).toBeTruthy();
  });

  it('renders a thin bar (no text) when reconnecting', () => {
    const tree = render(<ConnectionBanner />);
    act(() => {
      mockStateHandler?.('reconnecting');
    });
    expect(tree.queryByText('Bağlantı koptu')).toBeNull();
  });

  it('hides the banner ~1.5s after returning to connected', () => {
    const tree = render(<ConnectionBanner />);
    act(() => {
      mockStateHandler?.('disconnected');
    });
    expect(tree.getByText('Bağlantı koptu')).toBeTruthy();

    act(() => {
      mockStateHandler?.('connected');
      jest.advanceTimersByTime(1500);
    });
    expect(tree.queryByText('Bağlantı koptu')).toBeNull();
  });

  it('unsubscribes from realtimeService on unmount', () => {
    const tree = render(<ConnectionBanner />);
    tree.unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
