import React from 'react';
import { Image, Modal, TouchableOpacity } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ImageViewer from '@/features/profile/components/ImageViewer';

jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);

describe('ImageViewer', () => {
  it('renders a Modal with visible=false when not visible', () => {
    const tree = render(
      <ImageViewer visible={false} uri="https://x/y.jpg" onClose={jest.fn()} />
    );
    expect(tree.UNSAFE_getByType(Modal).props.visible).toBe(false);
  });

  it('renders the Image when a uri is provided', () => {
    const tree = render(
      <ImageViewer visible uri="https://x/y.jpg" onClose={jest.fn()} />
    );
    const image = tree.UNSAFE_getByType(Image);
    expect(image.props.source).toEqual({ uri: 'https://x/y.jpg' });
  });

  it('does not render an Image when uri is empty', () => {
    const tree = render(<ImageViewer visible uri="" onClose={jest.fn()} />);
    expect(tree.UNSAFE_queryAllByType(Image).length).toBe(0);
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    const tree = render(
      <ImageViewer visible uri="https://x/y.jpg" onClose={onClose} />
    );
    fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Modal onRequestClose (Android back button)', () => {
    const onClose = jest.fn();
    const tree = render(
      <ImageViewer visible uri="https://x/y.jpg" onClose={onClose} />
    );
    tree.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
