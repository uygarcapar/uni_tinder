import { render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// SFIcon hangi glifi çizdiğini metin olarak bassın — chevron/tik varlığı
// metinden okunuyor.
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

// Harita testler arasında değişebilsin diye getter'la dışarı alındı
// ("boş haritada iskelet yok" testi haritayı boşaltıyor).
let mockModeCardArt: Record<string, unknown> = {};
jest.mock('@/features/auth/modeCardArt', () => ({
  get MODE_CARD_ART() {
    return mockModeCardArt;
  },
}));

import ModeChoiceCard from '@/features/discover/components/ModeChoiceCard';

beforeEach(() => {
  mockModeCardArt = { Dating: 1, Friends: 2 };
});

describe('select varyantı', () => {
  it('chevron ve "moduna geç" satırı hiç çizilmiyor — open=true, active=false olsa bile', () => {
    const { queryByText, getByText } = render(
      <ModeChoiceCard mode="Dating" active={false} open variant="select" onPress={jest.fn()} />,
    );
    expect(queryByText('sficon:chevron.right')).toBeNull();
    expect(queryByText('discover.mode.switchTo.Dating')).toBeNull();
    expect(getByText('discover.mode.description.Dating')).toBeTruthy();
  });

  it('checkbox yuvası hep çizili, tik yalnız active iken', () => {
    const idle = render(
      <ModeChoiceCard mode="Dating" active={false} variant="select" onPress={jest.fn()} />,
    );
    expect(idle.getByTestId('mode-card-Dating-checkbox')).toBeTruthy();
    expect(idle.queryByText('sficon:checkmark')).toBeNull();

    const picked = render(
      <ModeChoiceCard mode="Dating" active variant="select" onPress={jest.fn()} />,
    );
    expect(picked.getByTestId('mode-card-Dating-checkbox')).toBeTruthy();
    expect(picked.getByText('sficon:checkmark')).toBeTruthy();
  });
});

describe('switch varyantı (regresyon)', () => {
  it('open ve !active → "moduna geç" + chevron, checkbox yok', () => {
    const { getByText, queryByTestId } = render(
      <ModeChoiceCard mode="Dating" active={false} open onPress={jest.fn()} />,
    );
    expect(getByText('discover.mode.switchTo.Dating')).toBeTruthy();
    expect(getByText('sficon:chevron.right')).toBeTruthy();
    expect(queryByTestId('mode-card-Dating-checkbox')).toBeNull();
  });
});

it('MODE_CARD_ART boşken iskelet hiç çizilmiyor', () => {
  mockModeCardArt = {};
  const { queryByText } = render(
    <ModeChoiceCard mode="Dating" active={false} variant="select" onPress={jest.fn()} />,
  );
  expect(queryByText('Skeleton')).toBeNull();
});
