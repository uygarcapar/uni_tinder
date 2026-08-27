import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDispatch = jest.fn();
// Katalog artık `useHobbies` → `staticGet` üzerinden geliyor (ham fetch değil).
const mockStaticGet = jest.fn();
jest.mock('@/shared/services/staticCache', () => ({
  staticGet: (...args: any[]) => mockStaticGet(...args),
  bustStaticCache: jest.fn(),
}));
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

// Tek client tüm mount'larda paylaşılıyor: gerçek akışta da katalog
// react-query desteşinde (staleTime: Infinity) duruyor, ekran remount olunca
// veri cache'ten geliyor.
let client: QueryClient;

beforeEach(() => {
  mockProfileState = { hobbies: [] };
  mockDispatch.mockReset();
  mockDispatch.mockImplementation((action: any) => {
    if (action?.type === 'profile/updateMultipleFields') {
      mockProfileState = { ...mockProfileState, ...action.payload };
    }
  });
  mockStaticGet.mockReset();
  mockStaticGet.mockResolvedValue(HOBBIES);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

const nav: any = { navigate: jest.fn(), goBack: jest.fn() };

const setup = () =>
  render(
    <QueryClientProvider client={client}>
      <RegisterStep13Screen navigation={nav} route={{} as any} />
    </QueryClientProvider>,
  );

it('seçimler "Devam"a basılmadan store\'a yazılıyor', async () => {
  const { getByText } = setup();
  await waitFor(() => getByText('Gym'));

  fireEvent.press(getByText('Gym'));
  fireEvent.press(getByText('Yoga'));
  fireEvent.press(getByText('Running'));

  expect(getByText('auth.step13.titleWithCount:3')).toBeTruthy();
  expect(mockProfileState.hobbies).toEqual(['Gym', 'Yoga', 'Running']);
});

it('geri dönüp ekrana tekrar girince tüm seçimler duruyor', async () => {
  const first = setup();
  await waitFor(() => first.getByText('Gym'));
  fireEvent.press(first.getByText('Gym'));
  fireEvent.press(first.getByText('Yoga'));
  fireEvent.press(first.getByText('Running'));
  first.unmount();

  // Ekran yeniden mount ediliyor (geri → tekrar ileri)
  const second = setup();
  await waitFor(() => second.getByText('Gym'));
  expect(second.getByText('auth.step13.titleWithCount:3')).toBeTruthy();
});

it('ikinci girişte katalog cache\'ten geliyor — yeni istek ve iskelet yok', async () => {
  const first = setup();
  await waitFor(() => first.getByText('Gym'));
  first.unmount();

  const second = setup();
  // waitFor YOK: piller ilk karede duruyor, yani iskelet turu hiç çıkmıyor.
  expect(second.getByText('Gym')).toBeTruthy();
  expect(mockStaticGet).toHaveBeenCalledTimes(1);
});

it('seçim kaldırma da store\'a yansıyor', async () => {
  const { getByText } = setup();
  await waitFor(() => getByText('Gym'));

  fireEvent.press(getByText('Gym'));
  fireEvent.press(getByText('Yoga'));
  fireEvent.press(getByText('Gym'));

  expect(getByText('auth.step13.titleWithCount:1')).toBeTruthy();
  expect(mockProfileState.hobbies).toEqual(['Yoga']);
});
