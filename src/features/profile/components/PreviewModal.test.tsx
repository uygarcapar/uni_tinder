import { ActivityIndicator } from 'react-native';
import { render } from '@testing-library/react-native';
import PreviewModal from '@/features/profile/components/PreviewModal';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetScrollView: ({ children }: any) =>
      React.createElement(View, null, children),
  };
});
jest.mock('@/shared/components/AppBottomSheet');
jest.mock('@/features/discover/components/SwipeCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ profile }: any) =>
      React.createElement(Text, { testID: 'swipe-card' }, profile?.id),
  };
});

describe('PreviewModal', () => {
  it('renders nothing when visible=false', () => {
    const { queryByTestId } = render(
      <PreviewModal visible={false} onClose={jest.fn()} profile={{ id: '1' }} />
    );
    expect(queryByTestId('app-bottom-sheet')).toBeNull();
  });

  it('renders the AppBottomSheet wrapper when visible', () => {
    const { getByTestId } = render(
      <PreviewModal visible onClose={jest.fn()} profile={{ id: '1' }} />
    );
    expect(getByTestId('app-bottom-sheet')).toBeTruthy();
  });

  it('renders the SwipeCard preview when a profile is provided', () => {
    const { getByTestId, getByText } = render(
      <PreviewModal visible onClose={jest.fn()} profile={{ id: '42' }} />
    );
    expect(getByTestId('swipe-card')).toBeTruthy();
    expect(getByText('42')).toBeTruthy();
  });

  it('renders an ActivityIndicator when profile is missing', () => {
    const tree = render(
      <PreviewModal visible onClose={jest.fn()} profile={null} />
    );
    expect(tree.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(tree.queryByTestId('swipe-card')).toBeNull();
  });
});
