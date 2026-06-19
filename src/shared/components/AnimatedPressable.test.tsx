import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AnimatedPressable from '@/shared/components/AnimatedPressable';

describe('AnimatedPressable', () => {
  it('renders children inside the TouchableOpacity', () => {
    const { getByText } = render(
      <AnimatedPressable>
        <Text>tap me</Text>
      </AnimatedPressable>
    );
    expect(getByText('tap me')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    const tree = render(
      <AnimatedPressable onPress={onPress}>
        <Text>x</Text>
      </AnimatedPressable>
    );
    fireEvent.press(tree.UNSAFE_getByType(TouchableOpacity));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('forwards onPressIn and onPressOut callbacks', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <AnimatedPressable onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>x</Text>
      </AnimatedPressable>
    );
    const button = tree.UNSAFE_getByType(TouchableOpacity);
    fireEvent(button, 'pressIn');
    fireEvent(button, 'pressOut');
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('passes disabled through to the TouchableOpacity', () => {
    const tree = render(
      <AnimatedPressable disabled>
        <Text>x</Text>
      </AnimatedPressable>
    );
    expect(tree.UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
  });

  it('forwards activeOpacity to TouchableOpacity', () => {
    const tree = render(
      <AnimatedPressable activeOpacity={0.5}>
        <Text>x</Text>
      </AnimatedPressable>
    );
    expect(tree.UNSAFE_getByType(TouchableOpacity).props.activeOpacity).toBe(0.5);
  });
});
