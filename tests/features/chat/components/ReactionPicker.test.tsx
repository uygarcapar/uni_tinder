import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ReactionPicker from '@/features/chat/components/ReactionPicker';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

const mk = (overrides: any = {}) =>
  render(
    <ReactionPicker
      visible
      onClose={jest.fn()}
      onPick={jest.fn()}
      {...overrides}
    />
  );

describe('ReactionPicker', () => {
  it('renders all six quick emojis when visible', () => {
    const tree = mk();
    EMOJIS.forEach((e) => expect(tree.getByText(e)).toBeTruthy());
  });

  it('does not render emojis when visible=false', () => {
    const tree = mk({ visible: false });
    EMOJIS.forEach((e) => expect(tree.queryByText(e)).toBeNull());
  });

  it('calls onPick with the tapped emoji and then onClose', () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    const tree = mk({ onPick, onClose });

    fireEvent.press(tree.getByText('🔥'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('🔥');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onPick with the correct emoji for each option', () => {
    const onPick = jest.fn();
    const tree = mk({ onPick });
    EMOJIS.forEach((e, i) => {
      fireEvent.press(tree.getByText(e));
      expect(onPick).toHaveBeenNthCalledWith(i + 1, e);
    });
  });
});
