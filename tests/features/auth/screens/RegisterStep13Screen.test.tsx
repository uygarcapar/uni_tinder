import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockDispatch = jest.fn();
let mockProfileState: any = { hobbies: [] };

jest.mock('@/shared/hooks/redux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: any) => fn({ profile: mockProfileState }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: any) => (opts?.count !== undefined ? `${k}:${opts.count}` : k),
  }),
}));

// Store'a giden aksiyonu yakalayıp mockProfileState'i güncelliyoruz — remount
// sonrası defaultValues'ın ne göreceğini simüle etmek için.
jest.mock('@/features/profile/profileSlice', () => ({
  updateMultipleFields: (p: any) => ({ type: 'profile/updateMultipleFields', payload: p }),
}));

jest.mock('@/features/auth/components/RegisterProgressBar', () => 'RegisterProgressBar');
jest.mock('@/features/auth/components/RegisterBackButton', () => 'RegisterBackButton');

import RegisterStep13Screen from '@/features/auth/screens/RegisterStep13Screen';

const HOBBIES = {
  isSuccess: true,
  result: [
    {
      category: 'Spor',
      hobbies: [
        { id: 1, enumName: 'Gym', name: 'Gym' },
        { id: 2, enumName: 'Yoga', name: 'Yoga' },
        { id: 3, enumName: 'Running', name: 'Running' },
      ],
    },
  ],
};

beforeEach(() => {
  mockProfileState = { hobbies: [] };
  mockDispatch.mockReset();
  mockDispatch.mockImplementation((action: any) => {
    if (action?.type === 'profile/updateMultipleFields') {
      mockProfileState = { ...mockProfileState, ...action.payload };
    }
  });
  (global.fetch as jest.Mock).mockResolvedValue({ json: async () => HOBBIES });
});

const nav: any = { navigate: jest.fn(), goBack: jest.fn() };

it('seçimler "Devam"a basılmadan store\'a yazılıyor', async () => {
  const { getByText } = render(<RegisterStep13Screen navigation={nav} route={{} as any} />);
  await waitFor(() => getByText('Gym'));

  fireEvent.press(getByText('Gym'));
  fireEvent.press(getByText('Yoga'));
  fireEvent.press(getByText('Running'));

  expect(getByText('auth.step13.titleWithCount:3')).toBeTruthy();
  expect(mockProfileState.hobbies).toEqual(['Gym', 'Yoga', 'Running']);
});

it('geri dönüp ekrana tekrar girince tüm seçimler duruyor', async () => {
  const first = render(<RegisterStep13Screen navigation={nav} route={{} as any} />);
  await waitFor(() => first.getByText('Gym'));
  fireEvent.press(first.getByText('Gym'));
  fireEvent.press(first.getByText('Yoga'));
  fireEvent.press(first.getByText('Running'));
  first.unmount();

  // Ekran yeniden mount ediliyor (geri → tekrar ileri)
  const second = render(<RegisterStep13Screen navigation={nav} route={{} as any} />);
  await waitFor(() => second.getByText('Gym'));
  expect(second.getByText('auth.step13.titleWithCount:3')).toBeTruthy();
});

it('seçim kaldırma da store\'a yansıyor', async () => {
  const { getByText } = render(<RegisterStep13Screen navigation={nav} route={{} as any} />);
  await waitFor(() => getByText('Gym'));

  fireEvent.press(getByText('Gym'));
  fireEvent.press(getByText('Yoga'));
  fireEvent.press(getByText('Gym'));

  expect(getByText('auth.step13.titleWithCount:1')).toBeTruthy();
  expect(mockProfileState.hobbies).toEqual(['Yoga']);
});
