/**
 * "Beni kimler görsün / görmesin" sheet'inin KAPISI.
 *
 * 🔴 Suite'in asıl konusu: kapı 2026-09-10'dan beri premium DEĞİL. Üç davetle
 * kazanılan 30 günlük hak da açıyor (`canUseUniversityVisibility`). Kilidi
 * premium'a geri bağlayan bir değişiklik, hakkı olan kullanıcıyı kendi
 * ayarından kilitler — üstelik backend kaydı KABUL ettiği için kilit sadece
 * istemcide bir yalan olur.
 */

jest.mock('@/shared/components/AppBottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children, footer }: any) =>
      visible ? React.createElement(View, null, children, footer) : null,
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const { ScrollView } = require('react-native');
  return { BottomSheetScrollView: ScrollView };
});
jest.mock('@/features/discover/components/UniversityPickerModal', () => 'UniversityPickerModal');
jest.mock('@/shared/queries/commonQueries', () => ({
  useUniversities: () => ({ data: [{ domain: 'bilgi.edu.tr', name: 'Bilgi' }] }),
  resolveLocalized: (v: any, _l: string, fallback: string) =>
    typeof v === 'string' ? v : fallback,
}));

import { fireEvent, render } from '@testing-library/react-native';
import UniversityVisibilitySheet from '@/features/profile/components/UniversityVisibilitySheet';
import uiBus from '@/shared/services/uiBus';
import tr from '@/shared/i18n/translations/tr';

const vis = tr.discover.filters.visibility;

const PROFILE = {
  visibleOnlyToUniversityDomains: [],
  hiddenFromUniversityDomains: [],
};

let emitSpy: jest.SpyInstance;

beforeEach(() => {
  emitSpy = jest.spyOn(uiBus, 'emit').mockImplementation(() => {});
});
afterEach(() => emitSpy.mockRestore());

const setup = (props: any = {}) =>
  render(
    <UniversityVisibilitySheet
      visible
      onClose={jest.fn()}
      profile={PROFILE}
      canUse={false}
      {...props}
    />,
  );

describe('davet ödülüyle açılmış hak (canUse=true, premium YOK)', () => {
  it('satıra dokunmak paywall AÇMIYOR', () => {
    const tree = setup({ canUse: true });
    fireEvent.press(tree.getByTestId('visibility-row-allow'));
    expect(emitSpy).not.toHaveBeenCalledWith('swipePaywall', expect.anything());
  });

  it('iki satır ayrı ayrı çiziliyor, "herkes" şıkkı yok', () => {
    const tree = setup({ canUse: true });
    expect(tree.getByText(vis.visibleOnlyLabel)).toBeTruthy();
    expect(tree.getByText(vis.hiddenFromLabel)).toBeTruthy();
    expect(tree.queryByText(vis.modeEveryone)).toBeNull();
  });

  it('sunucudan gelen block listesi yalnız kendi satırında görünüyor', () => {
    const tree = setup({
      canUse: true,
      profile: {
        visibleOnlyToUniversityDomains: [],
        hiddenFromUniversityDomains: ['bilgi.edu.tr'],
      },
    });
    // Block satırı dolu → üniversite adı yazıyor; allow satırı boş → placeholder.
    expect(tree.getByText('Bilgi')).toBeTruthy();
    expect(tree.getAllByText(vis.selectUniversities)).toHaveLength(1);
  });

  it('davet CTA\'sı gösterilmiyor — hakkı olana davet reklamı yapılmaz', () => {
    const tree = setup({ canUse: true });
    expect(tree.queryByTestId('visibility-invite-cta')).toBeNull();
  });

  it('kalan gün şeridini yazıyor', () => {
    const tree = setup({
      canUse: true,
      grantExpiresAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
    });
    expect(
      tree.getByText(vis.grantNote.replace('{{days}}', '12')),
    ).toBeTruthy();
  });

  it('süre bitmiş bir damgada şerit çizilmiyor', () => {
    const tree = setup({
      canUse: true,
      grantExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(tree.queryByText(/gün kaldı/)).toBeNull();
  });
});

describe('kilitli hâl (canUse=false)', () => {
  it('satıra dokunmak paywall açıyor', () => {
    const tree = setup();
    fireEvent.press(tree.getByTestId('visibility-row-block'));
    expect(emitSpy).toHaveBeenCalledWith(
      'swipePaywall',
      expect.objectContaining({ paywallType: 'PREMIUM_FILTERS' }),
    );
  });

  it('para istemeyen ikinci kapıyı da gösteriyor', () => {
    // Yalnız paywall gösterip davet yolunu saklamak, ödemek istemeyen
    // kullanıcıya "bu ayar sana kapalı" demek olurdu.
    const tree = setup();
    fireEvent.press(tree.getByTestId('visibility-invite-cta'));
    expect(emitSpy).toHaveBeenCalledWith('openReferral');
  });
});
