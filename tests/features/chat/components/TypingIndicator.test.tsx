import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import TypingIndicator, {
  TYPING_BUBBLE_HEIGHT,
} from '@/features/chat/components/TypingIndicator';

// jest.setup i18n'i gerçek TR sözlüğüyle başlatıyor.
const TYPING_TEXT = 'yazıyor…';

describe('TypingIndicator', () => {
  it('renders the localized "typing" text instead of animated dots', () => {
    const tree = render(<TypingIndicator />);
    expect(tree.getByText(TYPING_TEXT)).toBeTruthy();
  });

  it('applies the provided color to the text', () => {
    const tree = render(<TypingIndicator color="#ff0000" />);
    const style = tree.getByText(TYPING_TEXT).props.style;
    const flat = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style;
    expect(flat.color).toBe('#ff0000');
  });

  it('keeps a fixed bubble height so the row geometry stays deterministic', () => {
    const tree = render(<TypingIndicator />);
    // Metin düğümünün sarmalayıcısı balonun kendisi.
    const [text] = tree.UNSAFE_getAllByType(Text);
    const bubble = text.parent;
    const style = Array.isArray(bubble?.props.style)
      ? Object.assign({}, ...bubble.props.style.filter(Boolean))
      : bubble?.props.style;
    expect(style.height).toBe(TYPING_BUBBLE_HEIGHT);
  });
});
