import React from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import EditModal from '@/features/profile/components/EditModal';

jest.mock('@/shared/components/AppModal');
jest.mock('lucide-react-native');

const base = {
  visible: true,
  title: 'Profili Düzenle',
  onClose: jest.fn(),
  onSave: jest.fn(),
  saving: false,
  children: null,
};

const mk = (overrides = {}) =>
  render(<EditModal {...base} {...overrides} />);

beforeEach(() => jest.clearAllMocks());

describe('render', () => {
  it('shows title when visible', () => {
    expect(mk({ title: 'Test Başlık' }).getByText('Test Başlık')).toBeTruthy();
  });

  it('shows Kaydet button when not saving', () => {
    expect(mk().getByText('Kaydet')).toBeTruthy();
  });

  it('renders nothing when visible=false', () => {
    expect(mk({ visible: false }).queryByText('Profili Düzenle')).toBeNull();
  });

  it('renders children inside the scroll area', () => {
    const { getByTestId } = render(
      <EditModal {...base}>
        <View testID="child-element" />
      </EditModal>
    );
    expect(getByTestId('child-element')).toBeTruthy();
  });
});

describe('callbacks', () => {
  it('calls onClose when X button is pressed', () => {
    const onClose = jest.fn();
    const { UNSAFE_getAllByType } = mk({ onClose });
    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when Kaydet is pressed', () => {
    const onSave = jest.fn();
    fireEvent.press(mk({ onSave }).getByText('Kaydet'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('saving state', () => {
  it('shows ActivityIndicator when saving=true', () => {
    expect(mk({ saving: true }).UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('hides Kaydet text when saving=true', () => {
    expect(mk({ saving: true }).queryByText('Kaydet')).toBeNull();
  });

  it('disables save button when saving=true', () => {
    const { UNSAFE_getAllByType } = mk({ saving: true });
    const saveBtn = UNSAFE_getAllByType(TouchableOpacity)[1];
    expect(saveBtn.props.disabled).toBe(true);
  });

  it('enables save button when saving=false', () => {
    const { UNSAFE_getAllByType } = mk({ saving: false });
    const saveBtn = UNSAFE_getAllByType(TouchableOpacity)[1];
    expect(saveBtn.props.disabled).toBe(false);
  });
});
