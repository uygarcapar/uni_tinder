import { render, fireEvent } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/shared/components/AppBottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'app-bottom-sheet' }, children) : null,
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetScrollView: ({ children }: any) => React.createElement(View, null, children),
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import WelcomeScreen from '@/features/auth/screens/WelcomeScreen';

const nav: any = { navigate: jest.fn() };

const renderScreen = () => render(<WelcomeScreen navigation={nav} route={{} as any} />);

it('sözleşme metni açılışta kapalı', () => {
  const { queryByTestId } = renderScreen();
  expect(queryByTestId('app-bottom-sheet')).toBeNull();
});

it('Kullanım Koşulları linki sheet\'i koşullar metniyle açıyor', () => {
  const { getByText, getByTestId } = renderScreen();

  fireEvent.press(getByText('auth.welcome.termsLink'));

  expect(getByTestId('app-bottom-sheet')).toBeTruthy();
  expect(getByText('auth.legal.terms.title')).toBeTruthy();
  expect(getByText('auth.legal.terms.sectionTitle1')).toBeTruthy();
  expect(getByText('auth.legal.terms.section8Content')).toBeTruthy();
});

it('Gizlilik Politikası linki KVKK bölümlerini gösteriyor', () => {
  const { getByText } = renderScreen();

  fireEvent.press(getByText('auth.welcome.privacyLink'));

  expect(getByText('auth.legal.privacy.title')).toBeTruthy();
  // Gizlilik metni KVKK onay ekranıyla aynı kaynaktan gelmeli.
  expect(getByText('auth.kvkkConsent.section1Content')).toBeTruthy();
  expect(getByText('auth.kvkkConsent.section6Content')).toBeTruthy();
});

it('kapat butonu sheet\'i kapatıyor', () => {
  const { getByText, getByLabelText, queryByTestId } = renderScreen();

  fireEvent.press(getByText('auth.welcome.termsLink'));
  fireEvent.press(getByLabelText('common.close'));

  expect(queryByTestId('app-bottom-sheet')).toBeNull();
});
