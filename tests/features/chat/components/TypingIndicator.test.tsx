import React from 'react';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import TypingIndicator from '@/features/chat/components/TypingIndicator';

describe('TypingIndicator', () => {
  it('renders three animated dots', () => {
    const tree = render(<TypingIndicator />);
    expect(tree.UNSAFE_getAllByType(Animated.View).length).toBe(3);
  });

  it('applies the provided dot size to width/height/borderRadius', () => {
    const tree = render(<TypingIndicator size={10} />);
    const [dot] = tree.UNSAFE_getAllByType(Animated.View);
    const style = Array.isArray(dot.props.style)
      ? Object.assign({}, ...dot.props.style.filter(Boolean))
      : dot.props.style;
    expect(style.width).toBe(10);
    expect(style.height).toBe(10);
    expect(style.borderRadius).toBe(5);
  });

  it('applies the provided color to each dot', () => {
    const tree = render(<TypingIndicator color="#ff0000" />);
    tree.UNSAFE_getAllByType(Animated.View).forEach((dot) => {
      const style = Array.isArray(dot.props.style)
        ? Object.assign({}, ...dot.props.style.filter(Boolean))
        : dot.props.style;
      expect(style.backgroundColor).toBe('#ff0000');
    });
  });

  it('falls back to defaults when no props are given', () => {
    const tree = render(<TypingIndicator />);
    const [dot] = tree.UNSAFE_getAllByType(Animated.View);
    const style = Array.isArray(dot.props.style)
      ? Object.assign({}, ...dot.props.style.filter(Boolean))
      : dot.props.style;
    expect(style.width).toBe(6);
    expect(style.backgroundColor).toBe('#9CA3AF');
  });
});
