import { render, fireEvent } from '@testing-library/react-native';

const mockDispatch = jest.fn();
let mockAuthState: any = { registrationForm: { mode: '' } };

jest.mock('@/shared/hooks/redux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: any) => fn({ auth: mockAuthState }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/features/auth/authSlice', () => ({
  updateRegistrationField: (p: any) => ({ type: 'auth/updateRegistrationField', payload: p }),
}));

jest.mock('@/features/auth/components/RegisterProgressBar', () => 'RegisterProgressBar');
jest.mock('@/features/auth/components/RegisterBackButton', () => 'RegisterBackButton');

const mockShowInfoToast = jest.fn();
jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: (...args: any[]) => mockShowInfoToast(...args),
}));

// Kart mock'ları — ModeChoiceCard.test.tsx'tekiyle aynı kalıp.
jest.mock('@/shared/components/SFIcon', () => {
  const { Text } = require('react-native');
  return ({ name }: { name: string }) => <Text>{`sficon:${name}`}</Text>;
});
jest.mock('@/shared/components/SkeletonBox', () => {
  const { Text } = require('react-native');
  return () => <Text>Skeleton</Text>;
});
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

import RegisterStepModeScreen from '@/features/auth/screens/RegisterStepModeScreen';

const nav: any = { navigate: jest.fn(), goBack: jest.fn() };

const setup = () => render(<RegisterStepModeScreen navigation={nav} route={{} as any} />);

beforeEach(() => {
  mockAuthState = { registrationForm: { mode: '' } };
  nav.navigate.mockReset();
  mockShowInfoToast.mockReset();
  mockDispatch.mockReset();
  // Store'a giden aksiyon state'e yansısın — rerender sonrası seçimin
  // göründüğünü simüle etmek için.
  mockDispatch.mockImplementation((action: any) => {
    if (action?.type === 'auth/updateRegistrationField') {
      mockAuthState = {
        registrationForm: {
          ...mockAuthState.registrationForm,
          [action.payload.field]: action.payload.value,
        },
      };
    }
  });
});

it("karta basmak modu store'a yazıyor", () => {
  const { getByTestId } = setup();
  fireEvent.press(getByTestId('reg-mode-Dating'));
  expect(mockDispatch).toHaveBeenCalledWith({
    type: 'auth/updateRegistrationField',
    payload: { field: 'mode', value: 'Dating' },
  });
});

it('ikinci karta basınca seçim el değiştiriyor — tek tik', () => {
  const screen = setup();
  fireEvent.press(screen.getByTestId('reg-mode-Dating'));
  fireEvent.press(screen.getByTestId('reg-mode-Friends'));
  expect(mockAuthState.registrationForm.mode).toBe('Friends');

  screen.rerender(<RegisterStepModeScreen navigation={nav} route={{} as any} />);
  expect(screen.queryAllByText('sficon:checkmark')).toHaveLength(1);
});

it("store'da mode varken ekran tikli açılıyor", () => {
  mockAuthState = { registrationForm: { mode: 'Friends' } };
  const { getAllByText, getByTestId } = setup();
  expect(getAllByText('sficon:checkmark')).toHaveLength(1);
  // Checkbox YUVASI iki kartta da çizili — eski satır kartında bu yuva yoktu,
  // ekranın gerçekten fotoğraflı ModeChoiceCard'a geçtiğini bu ayırt ediyor.
  expect(getByTestId('mode-card-Dating-checkbox')).toBeTruthy();
  expect(getByTestId('mode-card-Friends-checkbox')).toBeTruthy();
});

it('seçimsiz Devam → toast, navigate yok', () => {
  const { getByTestId } = setup();
  fireEvent.press(getByTestId('reg-btn-next'));
  expect(mockShowInfoToast).toHaveBeenCalled();
  expect(nav.navigate).not.toHaveBeenCalled();
});

it('içerik kaydırılabilir — iki 3:4 olmayan dev kart küçük ekranda footer altında kalmasın', () => {
  // Sabit kolonda iki 3:2 kart SE sınıfında ~180pt taşıyor (review bulgusu):
  // başlık+kartlar+bilgi satırı bir ScrollView içinde, Devam footer'ı dışında.
  const { getByTestId } = setup();
  const scroll = getByTestId('reg-stepmode-scroll');
  expect(scroll).toBeTruthy();
  const inTree = (node: any): boolean => {
    if (!node || typeof node === 'string') return false;
    if (node.props?.testID === 'reg-mode-Friends') return true;
    return (node.children ?? []).some(inTree);
  };
  expect(inTree(scroll)).toBe(true);
});

it('Friends → RegisterStep13, Dating → RegisterStep10', () => {
  mockAuthState = { registrationForm: { mode: 'Friends' } };
  const friends = setup();
  fireEvent.press(friends.getByTestId('reg-btn-next'));
  expect(nav.navigate).toHaveBeenCalledWith('RegisterStep13');
  friends.unmount();

  nav.navigate.mockReset();
  mockAuthState = { registrationForm: { mode: 'Dating' } };
  const dating = setup();
  fireEvent.press(dating.getByTestId('reg-btn-next'));
  expect(nav.navigate).toHaveBeenCalledWith('RegisterStep10');
});
