jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: any) =>
        React.createElement(View, { style }, children),
    },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any) => v,
    Easing: { out: () => (x: any) => x, cubic: (x: any) => x },
  };
});

jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-masked-view/masked-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
  };
});
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Path: View };
});

import * as Clipboard from 'expo-clipboard';
import { fireEvent, render } from '@testing-library/react-native';
import MessageActionSheet from '@/features/chat/components/MessageActionSheet';

const recent = new Date().toISOString();
const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const baseProps = {
  visible: true,
  layout: { x: 50, y: 200, width: 200, height: 50 },
  onClose: jest.fn(),
  onPickReaction: jest.fn(),
  onReply: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('MessageActionSheet — render guards', () => {
  it('renders null when no message is provided', () => {
    const { toJSON } = render(
      <MessageActionSheet {...baseProps} message={null} isOwn={false} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders all six reaction emojis', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    ['❤️', '😂', '😮', '😢', '🔥', '👍'].forEach((e) =>
      expect(tree.getByText(e)).toBeTruthy()
    );
  });
});

describe('MessageActionSheet — action visibility', () => {
  it('shows Yanıtla and Kopyala for any text message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    expect(tree.getByText('Yanıtla')).toBeTruthy();
    expect(tree.getByText('Kopyala')).toBeTruthy();
  });

  it('hides Kopyala when message has no text content', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ contentType: 1, sentAt: recent }}
        isOwn={false}
      />
    );
    expect(tree.queryByText('Kopyala')).toBeNull();
  });

  it('shows Düzenle only when own + recent text message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn
      />
    );
    expect(tree.getByText('Düzenle')).toBeTruthy();
  });

  it('hides Düzenle when message is older than the edit window', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: old }}
        isOwn
      />
    );
    expect(tree.queryByText('Düzenle')).toBeNull();
  });

  it('hides Düzenle for non-text content types', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ contentType: 1, sentAt: recent }}
        isOwn
      />
    );
    expect(tree.queryByText('Düzenle')).toBeNull();
  });

  it('shows both delete options when own message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn
      />
    );
    expect(tree.getByText('Sadece benden sil')).toBeTruthy();
    expect(tree.getByText('Herkes için sil')).toBeTruthy();
  });

  it('hides delete options for someone else’s message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    expect(tree.queryByText('Sadece benden sil')).toBeNull();
    expect(tree.queryByText('Herkes için sil')).toBeNull();
  });
});

describe('MessageActionSheet — callbacks', () => {
  it('calls onPickReaction(emoji) then onClose on emoji tap', () => {
    const onPickReaction = jest.fn();
    const onClose = jest.fn();
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        onPickReaction={onPickReaction}
        onClose={onClose}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    fireEvent.press(tree.getByText('🔥'));
    expect(onPickReaction).toHaveBeenCalledWith('🔥');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onReply then onClose on Yanıtla', () => {
    const onReply = jest.fn();
    const onClose = jest.fn();
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        onReply={onReply}
        onClose={onClose}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    fireEvent.press(tree.getByText('Yanıtla'));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete(false) for "Sadece benden sil"', () => {
    const onDelete = jest.fn();
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        onDelete={onDelete}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn
      />
    );
    fireEvent.press(tree.getByText('Sadece benden sil'));
    expect(onDelete).toHaveBeenCalledWith(false);
  });

  it('calls onDelete(true) for "Herkes için sil"', () => {
    const onDelete = jest.fn();
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        onDelete={onDelete}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn
      />
    );
    fireEvent.press(tree.getByText('Herkes için sil'));
    expect(onDelete).toHaveBeenCalledWith(true);
  });

  it('copies content to clipboard and closes on Kopyala', async () => {
    const onClose = jest.fn();
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        onClose={onClose}
        message={{ content: 'hello world', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    fireEvent.press(tree.getByText('Kopyala'));
    // handleCopy is async — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('hello world');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
