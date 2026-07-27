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
    // Kapanış callback'i senkron tetiklenir ki onClose akışları test edilebilsin.
    withTiming: (v: any, _cfg: any, cb?: (finished: boolean) => void) => {
      cb?.(true);
      return v;
    },
    interpolate: (v: any, input: any[], output: any[]) =>
      output[0] +
      ((output[1] - output[0]) * (v - input[0])) / (input[1] - input[0] || 1),
    runOnJS: (fn: any) => fn,
    Easing: {
      out: () => (x: any) => x,
      in: () => (x: any) => x,
      cubic: (x: any) => x,
    },
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

  it('renders all five reaction emojis', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    ['❤️', '😂', '😮', '😢', '👍'].forEach((e) =>
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
    expect(tree.getByText('chat.actions.reply')).toBeTruthy();
    expect(tree.getByText('chat.actions.copy')).toBeTruthy();
  });

  it('hides Kopyala when message has no text content', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ contentType: 1, sentAt: recent }}
        isOwn={false}
      />
    );
    expect(tree.queryByText('chat.actions.copy')).toBeNull();
  });

  it('shows Düzenle only when own + recent text message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn
      />
    );
    expect(tree.getByText('chat.actions.edit')).toBeTruthy();
  });

  it('hides Düzenle when message is older than the edit window', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: old }}
        isOwn
      />
    );
    expect(tree.queryByText('chat.actions.edit')).toBeNull();
  });

  it('hides Düzenle for non-text content types', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ contentType: 1, sentAt: recent }}
        isOwn
      />
    );
    expect(tree.queryByText('chat.actions.edit')).toBeNull();
  });

  it('shows both delete options when own message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn
      />
    );
    expect(tree.getByText('chat.actions.deleteForMe')).toBeTruthy();
    expect(tree.getByText('chat.actions.deleteForEveryone')).toBeTruthy();
  });

  it('hides delete options for someone else’s message', () => {
    const tree = render(
      <MessageActionSheet
        {...baseProps}
        message={{ content: 'hi', contentType: 0, sentAt: recent }}
        isOwn={false}
      />
    );
    expect(tree.queryByText('chat.actions.deleteForMe')).toBeNull();
    expect(tree.queryByText('chat.actions.deleteForEveryone')).toBeNull();
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
    fireEvent.press(tree.getByText('👍'));
    expect(onPickReaction).toHaveBeenCalledWith('👍');
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
    fireEvent.press(tree.getByText('chat.actions.reply'));
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
    fireEvent.press(tree.getByText('chat.actions.deleteForMe'));
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
    fireEvent.press(tree.getByText('chat.actions.deleteForEveryone'));
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
    fireEvent.press(tree.getByText('chat.actions.copy'));
    // handleCopy is async — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('hello world');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
