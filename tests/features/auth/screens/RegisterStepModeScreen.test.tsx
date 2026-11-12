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

// Cinsiyet kataloğu — ekran "Arkadaş'ta havuz sorusu sorulacak mı" kararını
// buradan veriyor. `Transgender` GERÇEK katalogdaki gibi hem Erkek hem Kadın
// altında: o belirsizlik kararı etkilememeli.
let mockGenderCategories: any = [
  {
    categoryEnumName: 'Male',
    subGenders: [{ enumName: 'Male' }, { enumName: 'Transgender' }],
  },
  {
    categoryEnumName: 'Female',
    subGenders: [{ enumName: 'Female' }, { enumName: 'Transgender' }],
  },
  {
    categoryEnumName: 'NonBinary',
    subGenders: [{ enumName: 'NonBinary' }, { enumName: 'Agender' }],
  },
];
jest.mock('@/shared/queries/commonQueries', () => ({
  useGenders: () => ({ data: mockGenderCategories }),
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
  // Katalog her testte dolu başlıyor — "yüklenmedi" hâlini sınayan test onu
  // kendisi boşaltıyor.
  mockGenderCategories = [
    {
      categoryEnumName: 'Male',
      subGenders: [{ enumName: 'Male' }, { enumName: 'Transgender' }],
    },
    {
      categoryEnumName: 'Female',
      subGenders: [{ enumName: 'Female' }, { enumName: 'Transgender' }],
    },
    {
      categoryEnumName: 'NonBinary',
      subGenders: [{ enumName: 'NonBinary' }, { enumName: 'Agender' }],
    },
  ];
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

// Bu build'de yalnız Arkadaş seçilebilir (modeTheme > APP_MODES): ekran tek
// kart çiziyor, Flört kartı hiç yok. (Kayıt akışı bu adımı zaten atlıyor —
// bkz. registrationFlow — ekran yalnız rotada kayıtlı.)
it("karta basmak modu store'a yazıyor", () => {
  const { getByTestId } = setup();
  fireEvent.press(getByTestId('reg-mode-Friends'));
  expect(mockDispatch).toHaveBeenCalledWith({
    type: 'auth/updateRegistrationField',
    payload: { field: 'mode', value: 'Friends' },
  });
});

it('Flört kartı çizilmiyor', () => {
  const { queryByTestId } = setup();
  expect(queryByTestId('reg-mode-Dating')).toBeNull();
});

it("store'da mode varken ekran tikli açılıyor", () => {
  mockAuthState = { registrationForm: { mode: 'Friends' } };
  const { getAllByText, getByTestId } = setup();
  expect(getAllByText('sficon:checkmark')).toHaveLength(1);
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
  mockAuthState = { registrationForm: { mode: 'Friends', gender: 'Male' } };
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

/**
 * HAVUZ SORUSU DALI — Arkadaş'ta InterestedIn adımı artık koşullu.
 *
 * İkili kategorideki kullanıcıda değeri sunucu kendi cinsiyetinden türetip
 * kilitlediği için soru anlamsız; Non-Binary kullanıcıda ise "yalnız kendi
 * kategorin" kuralı kampüs ölçeğinde boş deste demek, o yüzden havuzu
 * soruyoruz ve adım akışta kalıyor.
 *
 * Karar redux'a da YAZILIYOR: ilerleme çubuğu paydayı oradan okuyor. Yazılmazsa
 * Arkadaş + Non-Binary kullanıcının barı kısalmış paydayla çizilir ve son adımda
 * %100'ü aşar.
 */
describe('Arkadaş + Non-Binary havuz sorusu', () => {
  const lastPoolDispatch = () =>
    mockDispatch.mock.calls
      .map((c: any[]) => c[0])
      .filter((a: any) => a?.payload?.field === 'asksFriendsPool')
      .pop();

  it('Non-Binary cinsiyette adım akışta kalıyor', () => {
    mockAuthState = { registrationForm: { mode: 'Friends', gender: 'Agender' } };
    const { getByTestId } = setup();

    fireEvent.press(getByTestId('reg-btn-next'));

    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep10');
    expect(lastPoolDispatch()?.payload.value).toBe(true);
  });

  it('ikili kategoride adım atlanıyor', () => {
    mockAuthState = { registrationForm: { mode: 'Friends', gender: 'Female' } };
    const { getByTestId } = setup();

    fireEvent.press(getByTestId('reg-btn-next'));

    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep13');
    expect(lastPoolDispatch()?.payload.value).toBe(false);
  });

  it('iki kategoride birden görünen cinsiyette SORMUYOR', () => {
    // `Transgender` hem Erkek hem Kadın altında — belirsizlikte sunucunun
    // türetmesine bırakılıyor.
    mockAuthState = {
      registrationForm: { mode: 'Friends', gender: 'Transgender' },
    };
    const { getByTestId } = setup();

    fireEvent.press(getByTestId('reg-btn-next'));

    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep13');
  });

  it('katalog henüz yüklenmemişken SORMUYOR', () => {
    mockGenderCategories = undefined;
    mockAuthState = { registrationForm: { mode: 'Friends', gender: 'Agender' } };
    const { getByTestId } = setup();

    fireEvent.press(getByTestId('reg-btn-next'));

    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep13');
  });

  it('Dating Non-Binary kullanıcıda da kendi sorusunu soruyor', () => {
    mockAuthState = { registrationForm: { mode: 'Dating', gender: 'Agender' } };
    const { getByTestId } = setup();

    fireEvent.press(getByTestId('reg-btn-next'));

    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep10');
    // Dating'de havuz sorusu YOK — bayrak false kalmalı, yoksa Arkadaş'a
    // geçildiğinde bayat bir `true` barın paydasını bozar.
    expect(lastPoolDispatch()?.payload.value).toBe(false);
  });
});
