import React from 'react';
import { TouchableOpacity } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ReplyPreview from '@/features/chat/components/ReplyPreview';

jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);

describe('ReplyPreview', () => {
  it('returns null when reply is missing', () => {
    const { toJSON } = render(<ReplyPreview reply={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders sender display name and text preview', () => {
    const tree = render(
      <ReplyPreview
        reply={{
          senderDisplayName: 'Ada',
          contentPreview: 'Selam!',
          contentType: 0,
        }}
      />
    );
    expect(tree.getByText('Ada')).toBeTruthy();
    expect(tree.getByText('Selam!')).toBeTruthy();
  });

  it('falls back to "Kullanıcı" when senderDisplayName is missing', () => {
    const tree = render(
      <ReplyPreview reply={{ contentPreview: 'x', contentType: 0 }} />
    );
    expect(tree.getByText('Kullanıcı')).toBeTruthy();
  });

  it('shows "Silinmiş" sender and "Bu mesaj silindi" preview when isDeleted', () => {
    const tree = render(<ReplyPreview reply={{ isDeleted: true }} />);
    expect(tree.getByText('Silinmiş')).toBeTruthy();
    expect(tree.getByText('Bu mesaj silindi')).toBeTruthy();
  });

  it('shows the media label for image content', () => {
    const tree = render(
      <ReplyPreview reply={{ senderDisplayName: 'A', contentType: 1 }} />
    );
    expect(tree.getByText('📷 Fotoğraf')).toBeTruthy();
  });

  it('shows the media label for voice content', () => {
    const tree = render(
      <ReplyPreview reply={{ senderDisplayName: 'A', contentType: 2 }} />
    );
    expect(tree.getByText('🎙️ Sesli mesaj')).toBeTruthy();
  });

  it('shows the media label for video content', () => {
    const tree = render(
      <ReplyPreview reply={{ senderDisplayName: 'A', contentType: 3 }} />
    );
    expect(tree.getByText('🎬 Video')).toBeTruthy();
  });

  it('shows "..." when text preview is empty', () => {
    const tree = render(
      <ReplyPreview reply={{ senderDisplayName: 'A', contentType: 0 }} />
    );
    expect(tree.getByText('...')).toBeTruthy();
  });

  it('renders cancel TouchableOpacity only in composing mode', () => {
    const composing = render(
      <ReplyPreview
        reply={{ senderDisplayName: 'A', contentType: 0, contentPreview: 'hi' }}
        mode="composing"
        onCancel={jest.fn()}
      />
    );
    expect(composing.UNSAFE_queryAllByType(TouchableOpacity).length).toBe(1);

    const bubble = render(
      <ReplyPreview
        reply={{ senderDisplayName: 'A', contentType: 0, contentPreview: 'hi' }}
        mode="bubble"
      />
    );
    expect(bubble.UNSAFE_queryAllByType(TouchableOpacity).length).toBe(0);
  });

  it('calls onCancel when the X button is pressed in composing mode', () => {
    const onCancel = jest.fn();
    const tree = render(
      <ReplyPreview
        reply={{ senderDisplayName: 'A', contentType: 0, contentPreview: 'hi' }}
        mode="composing"
        onCancel={onCancel}
      />
    );
    fireEvent.press(tree.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
