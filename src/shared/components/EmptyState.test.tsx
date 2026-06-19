import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import EmptyState from '@/shared/components/EmptyState';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

describe('EmptyState', () => {
  it('renders the main text', () => {
    const { getByText } = render(<EmptyState text="Henüz kimse yok" />);
    expect(getByText('Henüz kimse yok')).toBeTruthy();
  });

  it('renders the Icon component when provided', () => {
    const Icon = jest.fn(() => <Text>icon</Text>);
    render(<EmptyState text="x" Icon={Icon} />);
    expect(Icon).toHaveBeenCalled();
  });

  it('does not render an Icon when none is provided', () => {
    const { queryByText } = render(<EmptyState text="x" />);
    expect(queryByText('icon')).toBeNull();
  });

  it('forwards iconSize/iconColor/iconStrokeWidth to the Icon', () => {
    const Icon = jest.fn(() => null);
    render(
      <EmptyState
        text="x"
        Icon={Icon}
        iconSize={42}
        iconColor="#ff0000"
        iconStrokeWidth={2.5}
      />
    );
    expect(Icon.mock.calls[0][0]).toMatchObject({
      size: 42,
      color: '#ff0000',
      strokeWidth: 2.5,
    });
  });
});
