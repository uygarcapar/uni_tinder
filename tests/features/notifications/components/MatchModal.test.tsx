jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

import { Image } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import MatchModal from '@/features/notifications/components/MatchModal';

const baseMatch = {
  conversationId: 'conv-1',
  matchedUserName: 'Ada',
  matchedUserPhoto: 'https://x/ada.jpg',
};

describe('MatchModal', () => {
  it('renders nothing when match is null', () => {
    const { toJSON } = render(
      <MatchModal match={null} onClose={jest.fn()} onSendMessage={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the match heading and partner name', () => {
    const tree = render(
      <MatchModal
        match={baseMatch}
        myPhoto="https://x/me.jpg"
        onClose={jest.fn()}
        onSendMessage={jest.fn()}
      />
    );
    expect(tree.getByText("It's Lit!")).toBeTruthy();
    expect(
      tree.getByText('Ada ile eşleştin. İlk mesajı sen at.')
    ).toBeTruthy();
  });

  it('renders my photo and partner photo when provided', () => {
    const tree = render(
      <MatchModal
        match={baseMatch}
        myPhoto="https://x/me.jpg"
        onClose={jest.fn()}
        onSendMessage={jest.fn()}
      />
    );
    const images = tree.UNSAFE_getAllByType(Image);
    const sources = images.map((i) => i.props.source.uri);
    expect(sources).toContain('https://x/me.jpg');
    expect(sources).toContain('https://x/ada.jpg');
  });

  it('omits my Image when myPhoto is missing', () => {
    const tree = render(
      <MatchModal
        match={baseMatch}
        onClose={jest.fn()}
        onSendMessage={jest.fn()}
      />
    );
    const sources = tree
      .UNSAFE_getAllByType(Image)
      .map((i) => i.props.source.uri);
    expect(sources).not.toContain('https://x/me.jpg');
    expect(sources).toContain('https://x/ada.jpg');
  });

  it('calls onSendMessage with the conversationId when "Mesaj Gönder" is pressed', () => {
    const onSendMessage = jest.fn();
    const tree = render(
      <MatchModal
        match={baseMatch}
        onClose={jest.fn()}
        onSendMessage={onSendMessage}
      />
    );
    fireEvent.press(tree.getByText('Mesaj Gönder'));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('conv-1');
  });

  it('calls onClose when "Geri Dön" is pressed', () => {
    const onClose = jest.fn();
    const tree = render(
      <MatchModal
        match={baseMatch}
        onClose={onClose}
        onSendMessage={jest.fn()}
      />
    );
    fireEvent.press(tree.getByText('Geri Dön'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
