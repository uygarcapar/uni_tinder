jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
// Özellik satırının info sheet'i AppModal üzerinden `@expo/ui/swift-ui`ye
// zincirleniyor; o modül jest ortamında native EventEmitter arıyor. Davranışı
// bu suite'in konusu değil (satırın açtığı sheet, satın alma akışı değil).
jest.mock('@/features/discover/components/PremiumBenefitInfoSheet', () => {
  const React = require('react');
  return { __esModule: true, default: () => React.createElement('View') };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const { FlatList } = require('react-native');
  return { FlatList };
});

const mockDispatch = jest.fn();
let mockIsPremium = false;
// Abonelik durum makinesinin (features/profile/subscriptionView) okuduğu alanlar:
// kartın alt satırı — "Yenileme <tarih>" ya da sorunlu durumda eylem butonu —
// buradan besleniyor.
let mockSubscription: any = {};
jest.mock('@/shared/hooks/redux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      subscription: { isPremium: mockIsPremium, ...mockSubscription },
    }),
}));

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockCheckIntroEligibility = jest.fn();
// Satın almanın önündeki RC kimlik kapısı — anonim kimlikte satın alma HİÇ
// başlatılmıyor (bkz. subscriptionService.isPurchaseIdentityReady).
const mockIdentityReady = jest.fn();
jest.mock('@/features/profile/subscriptionService', () => ({
  getOfferings: (...a: any[]) => mockGetOfferings(...a),
  purchasePackage: (...a: any[]) => mockPurchasePackage(...a),
  restorePurchases: (...a: any[]) => mockRestorePurchases(...a),
  checkIntroEligibility: (...a: any[]) => mockCheckIntroEligibility(...a),
  isPurchaseIdentityReady: (...a: any[]) => mockIdentityReady(...a),
}));

jest.mock('@/features/profile/subscriptionSlice', () => ({
  fetchSubscriptionStatus: jest.fn(() => ({ type: 'sub/fetch' })),
  setPremium: jest.fn((p: any) => ({ type: 'sub/setPremium', payload: p })),
  markPremiumPurchasePending: jest.fn((p: any) => ({
    type: 'sub/markPending',
    payload: p,
  })),
  syncSubscriptionWithRetry: jest.fn((p: any) => ({
    type: 'sub/syncRetry',
    payload: p,
  })),
  selectIsPremium: (state: any) => !!state?.subscription?.isPremium,
  // Plan kartındaki "Aboneliği Yönet" rozeti abonelik durum makinesinden
  // besleniyor (features/profile/subscriptionView) ve o da bu seçiciyi okuyor.
  selectSyncPending: (state: any) => !!state?.subscription?.syncPending,
}));

const mockApi = { get: jest.fn() };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...a: any[]) => mockApi.get(...a) },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: { SUBSCRIPTION_PLANS: '/subscription/plans' },
}));

const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));
jest.mock('@/features/discover/swipeQueries', () => ({
  swipeKeys: {
    stats: ['swipe', 'stats'],
    filters: ['swipe', 'filters'],
    matches: ['swipe', 'matches'],
  },
}));

import { ActivityIndicator, Alert, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PlusPage from '@/features/profile/components/PlusPage';
import i18n from '@/shared/i18n';
import {
  PREMIUM_BENEFIT_KEYS,
  premiumBenefitLabelKey,
} from '@/features/profile/premiumBenefits';

const monthlyOffering = {
  monthly: {
    product: {
      identifier: 'monthly_sub',
      priceString: '₺49.99',
      price: 49.99,
      currencyCode: 'TRY',
      // Trial CTA'sı yalnızca RC introPrice tanımlıysa gösterilir (fallback yok).
      introPrice: { periodNumberOfUnits: 3, periodUnit: 'DAY', price: 0 },
    },
  },
};

// Şerit en az iki planla çiziliyor.
const twoPlanOffering = {
  ...monthlyOffering,
  weekly: {
    product: {
      identifier: 'weekly_sub',
      priceString: '₺19.99',
      price: 19.99,
      currencyCode: 'TRY',
    },
  },
};

// Sayfa `scrollY`yi bir shared value gibi yazıyor; testte düz bir kutu yeterli.
const scrollY = { value: 0 } as any;

// Abonedeki "Aboneliği Yönet" dokunuşunun hedefi mağazanın abonelik ekranı.
const mockOpenURL = jest.fn(() => Promise.resolve(true));

const setup = (overrides: any = {}) =>
  render(
    <PlusPage active scrollY={scrollY} onSuccess={jest.fn()} {...overrides} />
  );

beforeEach(() => {
  mockDispatch.mockReset();
  // syncSubscriptionWithRetry dispatch'i thunk gibi .unwrap() edilir.
  mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ synced: false }) });
  mockIsPremium = false;
  mockSubscription = {};
  mockGetOfferings.mockReset();
  mockPurchasePackage.mockReset();
  mockRestorePurchases.mockReset();
  mockIdentityReady.mockReset();
  mockIdentityReady.mockResolvedValue(true);
  // Varsayılan: kullanıcı denemeye hak kazanıyor. Deneme metni artık ürünün
  // introPrice'ına DEĞİL, bu sorguya bağlı.
  mockCheckIntroEligibility.mockReset();
  mockCheckIntroEligibility.mockResolvedValue({ monthly_sub: true });
  mockApi.get.mockReset();
  mockSetQueryData.mockClear();
  mockInvalidateQueries.mockClear();
  mockApi.get.mockResolvedValue({ result: { plans: [] } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockOpenURL.mockClear();
  jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
  (Linking.openURL as jest.Mock).mockRestore();
});

describe('PlusPage — render & loading', () => {
  // Sabit footer kalktı: yükleniyor hâlinin tek göstergesi plan kartlarının
  // yerindeki İSKELET. (Spinner değil — katalog gelince kart iskeletle aynı
  // hatta oturuyor, dönen bir gösterge o zıplamayı gizleyemiyordu.)
  it('renders the plan skeleton in place of the plan cards while offering loads', async () => {
    mockGetOfferings.mockReturnValue(new Promise(() => {}));
    const tree = setup();
    await act(async () => {});
    expect(tree.getByTestId('plan-carousel-skeleton')).toBeTruthy();
    expect(tree.queryByTestId('plan-card-monthly')).toBeNull();
  });

  // Ayrı bir "abone ol" butonu YOK — satın alma kartın kendisine dokununca
  // başlıyor, fiyat da kartın üstünde yazıyor.
  it('shows the plan card with its price after offering loads', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => {
      expect(tree.getByTestId('plan-card-monthly')).toBeTruthy();
    });
    expect(tree.getByText('₺49.99')).toBeTruthy();
    // Ayrı, tam genişlikte bir CTA butonu YOK. "Abone Ol" yalnız kartın sağ
    // altındaki küçük eylem rozetinde geçiyor (purchase.cta.subscribe) —
    // dokunuşun ne yapacağını söylüyor, kartın kendisi buton. Tek örnek
    // olması bunun kanıtı: ikinci bir örnek geri gelen CTA demek olurdu.
    expect(tree.getAllByText('Abone Ol')).toHaveLength(1);
  });

  // Regresyon: özellik satırları başlıksız çıkmıştı. Liste tek kaynaktan
  // (`PREMIUM_BENEFIT_KEYS`) geliyor ve paywall TAMAMINI göstermeli — upsell
  // kartı ilk dördünü gösterip "daha fazlası" dediği için burada eksik madde
  // doğrudan karşılanmayan bir vaat demek.
  it('lists every premium benefit by name', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));
    for (const key of PREMIUM_BENEFIT_KEYS) {
      const label = i18n.t(premiumBenefitLabelKey(key));
      expect(label).not.toContain('premium.benefits');
      expect(tree.getByText(label)).toBeTruthy();
    }
  });

  it('renders the standard headline and restore link', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));
    expect(tree.getByText('Satın alımları geri yükle')).toBeTruthy();
    // Marka başlığı KALDIRILDI (sekme + zemin zaten söylüyor) — tepede yalnız
    // tek cümlelik vaat duruyor.
    expect(tree.getByText(/Lit Plus ile eşleşmelerini hızlandır/)).toBeTruthy();
  });

  // Katalog YALNIZ sayfa bir kez görüldüğünde çekiliyor: sekmeye hiç
  // geçilmediyse RC/`/plans` isteği atılmamalı.
  it('does not fetch the catalog before the page is visited', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup({ active: false });
    await act(async () => {});

    expect(mockGetOfferings).not.toHaveBeenCalled();
    expect(tree.queryByTestId('plan-card-monthly')).toBeNull();
  });

  // Regresyon: fetch bitmeden sayfa terk edilirse eskiden sonuç atılıyor,
  // loading true'da kilitleniyor ve tek-atışlık latch yüzünden bir daha hiç
  // denenmiyordu → o mount boyunca sonsuz spinner.
  it('stays usable when the first fetch resolves after the page went inactive', async () => {
    let resolveOffering: (v: any) => void = () => {};
    mockGetOfferings.mockReturnValueOnce(
      new Promise((res) => {
        resolveOffering = res;
      })
    );
    const tree = setup();
    await act(async () => {});

    tree.rerender(<PlusPage active={false} scrollY={scrollY} />);
    await act(async () => {
      resolveOffering(monthlyOffering);
    });

    tree.rerender(<PlusPage active scrollY={scrollY} />);
    await waitFor(() => {
      expect(tree.getByTestId('plan-card-monthly')).toBeTruthy();
    });
  });

  // Regresyon: `introPrice` ÜRÜNE ait statik alan — App Store Connect'te deneme
  // tanımlıysa denemesini yakmış kullanıcıda da dolu geliyor. Eskiden paywall
  // yalnız ona bakıyordu ve herkese "3 Gün Ücretsiz Dene" vaat ediyordu; Apple
  // ise ineligible kullanıcıdan ilk gün tam ücreti çekiyor.
  it('drops the trial line on the card when the user is not trial-eligible', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockCheckIntroEligibility.mockResolvedValue({ monthly_sub: false });
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));
    expect(mockCheckIntroEligibility).toHaveBeenCalledWith(['monthly_sub']);
    // Deneme vaadi yalnızca kartın kendi cümlesinde duruyor.
    expect(tree.queryByText(/gün ücretsiz kullanabilirsin/)).toBeNull();
  });

  // Eligibility cevabı gelmeden deneme metni GÖSTERİLMEZ: aksi halde ineligible
  // kullanıcıda bir kare "ücretsiz" yanıp sönerdi.
  it('does not promise a trial while eligibility is still pending', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockCheckIntroEligibility.mockReturnValue(new Promise(() => {}));
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));
    expect(tree.queryByText(/gün ücretsiz kullanabilirsin/)).toBeNull();
  });

  // Olağan abonelikte kart bir SATIŞ yüzeyi değil: alt satırında yalnız
  // yenileme tarihi var. Eskiden orada "Aboneliği Yönet" yazıyor ve dokunuş
  // mağazanın abonelik ekranını açıyordu — yapacak bir iş yokken sayfanın
  // ödeyen kullanıcıya önerdiği tek şey uygulamadan çıkmaktı.
  it('shows only the renewal date — no manage CTA, no store redirect — while premium', async () => {
    mockIsPremium = true;
    mockSubscription = { expiresAt: '2026-09-12T10:00:00Z' };
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => {
      expect(tree.getByTestId('plan-card-renewal-monthly')).toBeTruthy();
    });
    // Etiket + tarih TEK metin düğümü: satır tek parça yazılıyor.
    expect(tree.getByText(/^Yenileme 12 Eyl/)).toBeTruthy();
    expect(tree.queryByText('Aboneliği Yönet')).toBeNull();
    expect(tree.queryByText('Abone Ol')).toBeNull();

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });
    // Kart ölü: ne satın alma, ne mağaza.
    expect(mockPurchasePackage).not.toHaveBeenCalled();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  // Denemede tarih bir YENİLEME değil bitiş: ilk ödemenin alınacağı gün.
  it('labels the trial end date instead of a renewal', async () => {
    mockIsPremium = true;
    mockSubscription = {
      isTrial: true,
      trialEndsAt: '2026-09-07T10:00:00Z',
      expiresAt: '2026-09-07T10:00:00Z',
    };
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-renewal-monthly'));
    expect(tree.getByText(/^Bitiş 07 Eyl/)).toBeTruthy();
    expect(tree.queryByText(/Yenileme/)).toBeNull();
  });

  // Mağaza linki YALNIZ yapılacak bir iş varken: ödeme sorunu uygulama içinden
  // düzeltilemiyor ve üyelik kartı silindiğinden beri bu kart oraya açılan tek
  // kapı.
  it('keeps the store link when the subscription has a billing issue', async () => {
    mockIsPremium = true;
    mockSubscription = { status: 'BillingIssue' };
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => {
      expect(tree.getByText('Ödeme Yöntemini Güncelle')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(mockPurchasePackage).not.toHaveBeenCalled();
    expect(mockOpenURL).toHaveBeenCalledWith(
      'https://apps.apple.com/account/subscriptions'
    );
  });

  // Şerit bir SATIN ALMA kumandası: abonede seçilecek bir şey yok, kartta
  // periyoda bağlı bilgi de kalmadı (fiyat ve plan cümlesi çizilmiyor).
  it('hides the period strip while premium', async () => {
    mockIsPremium = true;
    mockGetOfferings.mockResolvedValue(twoPlanOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-weekly'));

    expect(tree.queryByTestId('plan-pill-weekly')).toBeNull();
    expect(tree.queryByTestId('plan-pill-monthly')).toBeNull();
    // Kartın gövdesi satın alma metinlerinden TEMİZ: ne fiyat, ne satın alma
    // için yazılmış plan cümlesi.
    expect(tree.queryByText('₺19.99')).toBeNull();
    expect(tree.queryByText(/Kısa denemek için ideal/)).toBeNull();
  });

  // Ad satırındaki rozet aboneliğin DURUMUNU söylüyor; kartın gövdesi de o
  // durumun ne anlama geldiğini — ikisi aynı kelimeyi tekrarlamıyor.
  it('badges the card as active and explains the state in the body', async () => {
    mockIsPremium = true;
    mockSubscription = { expiresAt: '2026-09-12T10:00:00Z' };
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-status'));

    expect(tree.getByText('Aktif')).toBeTruthy();
    expect(tree.getByText(/Bütün plus özellikleri hesabında açık/)).toBeTruthy();
  });

  // İptalde alt satırın yerini mağaza butonu alıyor → erişimin ne zaman
  // biteceğini yazan tek yer gövde cümlesi.
  it('names the state and the end date when the subscription is cancelled', async () => {
    mockIsPremium = true;
    mockSubscription = {
      status: 'Cancelled',
      expiresAt: '2026-09-12T10:00:00Z',
    };
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-status'));

    expect(tree.getByText('İptal edildi')).toBeTruthy();
    expect(
      tree.getByText(/^12 Eyl tarihine kadar her şey açık kalır/)
    ).toBeTruthy();
  });

  // Satın alınabilir kartta ad satırının yanı BOŞ: söylenecek bir durum yok.
  it('draws no status pill while the card is purchasable', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    expect(tree.queryByTestId('plan-card-status')).toBeNull();
  });
});

describe('PlusPage — purchase flow', () => {
  it('renders no purchasable card when the catalog is empty', async () => {
    // Boş offering → plans=[] → basılacak kart yok, satın alma da yok.
    mockGetOfferings.mockResolvedValue({});
    const tree = setup();
    await waitFor(() =>
      tree.getByText(/Lit Plus ile eşleşmelerini hızlandır/)
    );

    expect(tree.queryByTestId('plan-card-monthly')).toBeNull();
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });

  // Periyodun TEK kumandası şerit: kart yok, kartLAR yok — deste
  // sürüklenmiyor. Pill'e basınca ekranda duran tek kartın içeriği (fiyat,
  // periyot) yeni plana geçiyor.
  // Katalogda tek plan varsa şerit hiç çizilmiyor (seçilecek bir şey yok).
  it('switches the single card content from the period strip', async () => {
    mockGetOfferings.mockResolvedValue(twoPlanOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-pill-weekly'));
    expect(tree.getByTestId('plan-pill-monthly')).toBeTruthy();

    // Varsayılan haftalık (bkz. resolveDefaultPeriod) — ve o an ekranda BAŞKA
    // plan kartı yok.
    expect(tree.getByTestId('plan-card-weekly')).toBeTruthy();
    expect(tree.queryByTestId('plan-card-monthly')).toBeNull();
    expect(tree.getByText('₺19.99')).toBeTruthy();

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-pill-monthly'));
    });

    expect(tree.getByTestId('plan-card-monthly')).toBeTruthy();
    expect(tree.queryByTestId('plan-card-weekly')).toBeNull();
    expect(tree.getByText('₺49.99')).toBeTruthy();
    // Seçim değişti ama satın alma TETİKLENMEDİ: pill yalnız seçici.
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });

  // Rozetin tabanı HAFTALIK plan: haftalık maliyeti en düşük periyot
  // işaretleniyor (taban aylık olsaydı aylık kendini işaretleyemezdi).
  // ₺19.99/hafta → 4.345 haftalık karşılığı ₺86.86; ₺49.99'luk aylık daha ucuz.
  // Rozet artık hesaplanmış yüzde DEĞİL, sabit "En iyi" etiketi — şeritteki
  // kapsül dar, iki haneli yüzde etiketi periyot adını taşırıyordu.
  it('badges the cheapest-per-week period as best value', async () => {
    mockGetOfferings.mockResolvedValue(twoPlanOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-pill-monthly'));

    expect(tree.getByTestId('plan-pill-best-monthly')).toBeTruthy();
    expect(tree.getByText('En iyi')).toBeTruthy();
    // Taban planın kendisinde rozet YOK.
    expect(tree.queryByTestId('plan-pill-best-weekly')).toBeNull();
  });

  it('hides the period strip when the catalog has a single plan', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));
    expect(tree.queryByTestId('plan-pill-monthly')).toBeNull();
  });

  it('runs the success flow: purchase → setPremium → onSuccess → syncRetry', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: true });
    // Sync başarılı → premium-scoped query'ler invalidate edilir.
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ synced: true }) });
    const onSuccess = jest.fn();
    const tree = setup({ onSuccess });
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/syncRetry' })
    );
    expect(mockSetQueryData).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['swipe', 'stats'],
      });
    });
    // Kapanacak bir kap YOK: sayfa yerinde kalıyor, satın alma sonrası
    // premium'a dönen içerik (rozet metni, CTA) kendini gösteriyor.
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate premium-scoped queries while sync is still pending', async () => {
    // synced:false → optimistic patch korunur; invalidate hemen ÇALIŞMAZ
    // (refetch free stats çekip patch'i ezerdi — bkz. refetchPremiumScoped).
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: true });
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(mockSetQueryData).toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it('completes the flow even when the entitlement has not propagated yet', async () => {
    // RC satın almayı kabul etti ama `customerInfo` entitlement'ı henüz
    // taşımıyor (sandbox'ta olağan). Para ALINDI: akış eskiden burada sessizce
    // ölüyordu — ne sync, ne uyarı, ne kurtarma kaydı. Artık normal başarı
    // yolundan devam ediyor, doğruluk kaynağı backend `/sync`.
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: false });
    const onSuccess = jest.fn();
    const tree = setup({ onSuccess });
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/syncRetry' })
    );
    // Kapanacak bir kap YOK: sayfa yerinde kalıyor, satın alma sonrası
    // premium'a dönen içerik (rozet metni, CTA) kendini gösteriyor.
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('writes the persistent recovery record before syncing', async () => {
    // Kayıt sync'ten ÖNCE yazılmalı: app arada öldürülürse satın alma yalnızca
    // bu kayıtla kurtarılabiliyor (reload optimistic bayrağı siliyor).
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: true });
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    const types = mockDispatch.mock.calls.map((c: any[]) => c[0]?.type);
    expect(types).toContain('sub/markPending');
    expect(types.indexOf('sub/markPending')).toBeLessThan(
      types.indexOf('sub/syncRetry')
    );
  });

  it('Alerts on purchase error', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockRejectedValue({ message: 'IAP fail' });
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Satın Alma Hatası', 'IAP fail');
  });

  it('does NOT start the purchase while the RevenueCat identity is anonymous', async () => {
    // Anonim kimliğe (`$RCAnonymousID:…`) yazılan makbuz webhook'ta hiçbir
    // profile eşleşmiyor: para alınır, premium kimseye uygulanmaz. Bu yüzden
    // satın alma HİÇ başlatılmamalı; kullanıcı bir uyarı görmeli.
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockIdentityReady.mockResolvedValue(false);
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(mockPurchasePackage).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Satın alma başlatılamadı',
      expect.any(String)
    );
  });

  it('does NOT Alert when the user cancels the purchase', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockRejectedValue({ userCancelled: true });
    const tree = setup();
    await waitFor(() => tree.getByTestId('plan-card-monthly'));

    await act(async () => {
      fireEvent.press(tree.getByTestId('plan-card-monthly'));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('PlusPage — restore flow', () => {
  it('promotes to premium when restore returns true', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockRestorePurchases.mockResolvedValue(true);
    const onSuccess = jest.fn();
    const tree = setup({ onSuccess });
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    // Restore da webhook gecikmesine karşı retry'lı sync kullanır (düz fetch değil).
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/syncRetry' })
    );
    // Kapanacak bir kap YOK: sayfa yerinde kalıyor, satın alma sonrası
    // premium'a dönen içerik (rozet metni, CTA) kendini gösteriyor.
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows "Bulunamadı" Alert when restore reports no active subscription', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockRestorePurchases.mockResolvedValue(false);
    const tree = setup();
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Bulunamadı',
      'Aktif bir abonelik bulunamadı.'
    );
  });

  it('does NOT restore while the RevenueCat identity is anonymous', async () => {
    // Anonim kimlikte yapılan restore makbuzu gene anonim kimliğe bağlıyor —
    // sahadaki 41 günlük gecikmenin kaynağı bu.
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockIdentityReady.mockResolvedValue(false);
    const tree = setup();
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(mockRestorePurchases).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Satın alma başlatılamadı',
      expect.any(String)
    );
  });

  it('shows "Hata" Alert when restore throws', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockRestorePurchases.mockRejectedValue({ message: 'Sunucu' });
    const tree = setup();
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Sunucu');
  });
});
