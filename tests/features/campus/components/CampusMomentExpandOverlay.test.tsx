import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CampusMomentExpandOverlay, {
  EXPAND_MS,
} from '@/features/campus/components/CampusMomentExpandOverlay';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

/**
 * BÜYÜYEN KARTIN YÜZEYİ — camın NE ZAMAN doğduğunun sözleşmesi.
 *
 * ⚠️🔴 ÇİVİLENEN ASIL ŞEY: cam buton kart yerine OTURMADAN mount edilmiyor.
 * Animasyonlu, kimliksel olmayan bir transform'un altında doğan `GlassView`
 * sessizce hiç render edilmiyor ve sonradan düzelmiyor (projenin en sert
 * tuzağı; eski `actionsReady` kapısı tam bunun içindi). Buton kartın kardeşi
 * ve kapı bir ZAMANLAYICI — `withTiming` callback'i DEĞİL, çünkü kesilen
 * animasyonun callback'i `finished:false` ile gelir ve bayrak hiç dönmez.
 */

const moment = (over?: Partial<CampusMomentDto>): CampusMomentDto => ({
  id: '1',
  userId: 'u1',
  displayName: 'Ada',
  age: 21,
  photoUrl: 'https://cdn.test/1.jpg',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  mode: 'Dating',
  isMine: false,
  ...over,
});

const base = {
  moment: moment(),
  frame: { x: 20, y: 600, width: 167, height: 222 },
  mode: 'Dating' as const,
  busy: false,
  onLike: () => {},
  onClose: () => {},
};

/** Güvenli alan sağlayıcısı — yüzey `useSafeAreaInsets` okuyor (ev kalıbı). */
const frameMetrics = { x: 0, y: 0, width: 393, height: 852 };
const insets = { top: 59, left: 0, right: 0, bottom: 34 };
const mount = (props: Partial<typeof base> = {}) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: frameMetrics, insets }}>
      <CampusMomentExpandOverlay {...base} {...props} />
    </SafeAreaProvider>,
  );

const settle = () => {
  act(() => {
    jest.advanceTimersByTime(EXPAND_MS);
  });
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('an yokken hiçbir şey çizmiyor', () => {
  const tree = mount({ moment: null });
  expect(tree.queryByLabelText('Kapat')).toBeNull();
});

it('CAM BUTON kart oturmadan YOK, oturunca VAR', () => {
  const tree = mount();
  expect(tree.queryByLabelText('Beğen')).toBeNull();
  settle();
  expect(tree.getByLabelText('Beğen')).toBeTruthy();
});

it('tike basınca onLike, perdeye basınca onClose', () => {
  const onLike = jest.fn();
  const onClose = jest.fn();
  const tree = mount({ onLike, onClose });
  settle();
  fireEvent.press(tree.getByLabelText('Beğen'));
  expect(onLike).toHaveBeenCalledTimes(1);
  fireEvent.press(tree.getByLabelText('Kapat'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

/**
 * ÇİFT TİK — ikinci basış yutulmalı.
 *
 * Beğeni geri alınamıyor (free kullanıcının günlük tek kampüs kararı) ve iki
 * istek iki kota demek. Kapı `busy`: ekran isteği uçarken bayrağı kaldırıyor.
 */
/**
 * ⚠️🔴 KARAR BİR KEZ — `busy` BU İŞİ GÖRMÜYOR.
 *
 * `busy` isteğin ÖMRÜ kadar (mutasyon `finally`de temizliyor), oysa buton
 * alev örtüsü kapanana kadar ekranda kalıyor. 120ms'lik bir RTT'de bayrak
 * t=120'de düşüyor ve t≈170'teki ikinci dokunuş İKİNCİ BİR BEĞENİ gönderiyor —
 * üstelik uçan alev dalgasını da iptal edip yeniden başlatıyor. Kilit kararın
 * kendisine ait: bir kez basıldıysa bir daha basılamaz.
 */
it('TİKE İKİ KEZ basılsa bile tek karar — `busy` düşse de', () => {
  const onLike = jest.fn();
  const tree = mount({ onLike });
  settle();
  fireEvent.press(tree.getByLabelText('Beğen'));
  fireEvent.press(tree.getByLabelText('Beğen'));
  expect(onLike).toHaveBeenCalledTimes(1);
});

/**
 * KÜÇÜLME SIRASINDA YÜZEY AYAKTA KALIYOR — an listeden düşse bile.
 *
 * ⚠️ BU BİR YARIŞ: beğeni başarılı olunca liste tazeleniyor ve karar verilmiş
 * an listeden DÜŞÜYOR; gösterilen an canlı listeden çözüldüğü için yüzey tam
 * küçülürken `moment: null` alabiliyor. O hâlde kart küçülmeden YOK oluyor ve
 * örtü açıldığında geriye hiçbir şey kalmıyor — "giden kartın görünmesi"
 * tuzağının aynadaki hâli.
 */
it('küçülürken an listeden düşse bile kart EKRANDA kalıyor', () => {
  const tree = mount();
  settle();
  tree.rerender(
    <SafeAreaProvider initialMetrics={{ frame: frameMetrics, insets }}>
      <CampusMomentExpandOverlay {...base} moment={null} collapsing />
    </SafeAreaProvider>,
  );
  expect(tree.queryByLabelText('Kapat')).not.toBeNull();
});

/**
 * KÜÇÜLME FAZI — alev örtüsü KAPALIYKEN koşuyor.
 *
 * ⚠️ CAM ÖNCE SÖKÜLÜYOR: küçülme bir transform ve cam onun altında kalırsa
 * zaten çizilmez; üstelik kart giderken basılabilir bir buton kalması
 * ikinci bir beğeni demekti.
 */
it('küçülürken cam buton SÖKÜLÜYOR', () => {
  const tree = mount();
  settle();
  expect(tree.getByLabelText('Beğen')).toBeTruthy();
  tree.rerender(
    <SafeAreaProvider initialMetrics={{ frame: frameMetrics, insets }}>
      <CampusMomentExpandOverlay {...base} collapsing />
    </SafeAreaProvider>,
  );
  expect(tree.queryByLabelText('Beğen')).toBeNull();
});

it('busy iken tik ikinci kez çağırmıyor', () => {
  const onLike = jest.fn();
  const tree = mount({ busy: true, onLike });
  settle();
  fireEvent.press(tree.getByLabelText('Beğen'));
  expect(onLike).not.toHaveBeenCalled();
});
