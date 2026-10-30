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

it('tike basınca onLike', () => {
  const onLike = jest.fn();
  const tree = mount({ onLike });
  settle();
  fireEvent.press(tree.getByLabelText('Beğen'));
  expect(onLike).toHaveBeenCalledTimes(1);
});

/**
 * ⚠️ KAPANIŞ DA BİR HAREKET — anında sökülmüyor.
 *
 * Perdeye basınca yüzey hemen kaldırılırsa kart "pat diye yok oluyor"; oysa
 * açılışın tersi beklenir: kart şeritteki yerine küçülerek dönsün. Bu yüzden
 * `onClose` ÇIKIŞ ANİMASYONUNDAN SONRA çağrılıyor — yüzeyi söken çağıran, ve
 * sökmesi gereken an küçülme bittiğinde.
 */
it('perdeye basınca kart önce KÜÇÜLÜYOR, sonra kapanıyor', () => {
  const onClose = jest.fn();
  const tree = mount({ onClose });
  settle();
  fireEvent.press(tree.getByLabelText('Kapat'));
  // Henüz değil: kart yerine dönüyor.
  expect(onClose).not.toHaveBeenCalled();
  // Cam da aynı anda sökülüyor — giden kartın üstünde buton kalmıyor.
  expect(tree.queryByLabelText('Beğen')).toBeNull();
  act(() => {
    jest.advanceTimersByTime(EXPAND_MS);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

/**
 * ⚠️🔴 KAPANIŞTAN SONRA YÜZEY AĞAÇTA KALMAMALI.
 *
 * Cihazda görülen hata buydu: perdeye basınca kart küçülüyor, çağıran anı
 * null'lıyor ama overlay EKRANDA KALIYORDU — perdesiz, camsız, donmuş bir
 * kart haritanın üstünde duruyordu.
 *
 * Sebep küçülme sırasında anı DONDURAN dal: `moment` null olduğunda gösterilen
 * şey son bilinen an oluyor ve o dondurma bitmiyordu, çünkü bayrağı sıfırlayan
 * tek yer YENİ bir an gelmesiydi. Kapanış, dondurmayı da bitirmek zorunda.
 */
it('kapanış bitince an null gelince yüzey SÖKÜLÜYOR', () => {
  const onClose = jest.fn();
  const tree = mount({ onClose });
  settle();
  fireEvent.press(tree.getByLabelText('Kapat'));
  act(() => {
    jest.advanceTimersByTime(EXPAND_MS);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  // Çağıran anı kaldırdı:
  tree.rerender(
    <SafeAreaProvider initialMetrics={{ frame: frameMetrics, insets }}>
      <CampusMomentExpandOverlay {...base} moment={null} />
    </SafeAreaProvider>,
  );
  expect(tree.queryByLabelText('Kapat')).toBeNull();
});

it('kapanış İKİ KEZ tetiklenmiyor — perdeye üst üste basılsa da', () => {
  const onClose = jest.fn();
  const tree = mount({ onClose });
  settle();
  fireEvent.press(tree.getByLabelText('Kapat'));
  fireEvent.press(tree.getByLabelText('Kapat'));
  act(() => {
    jest.advanceTimersByTime(EXPAND_MS * 2);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

/**
 * ÇİFT TİK — ikinci basış yutulmalı.
 *
 * Beğeni geri alınamıyor (free kullanıcının günlük tek kampüs kararı) ve iki
 * istek iki kota demek. Kapı `busy`: ekran isteği uçarken bayrağı kaldırıyor.
 */
/**
 * KENDİ ANIMDA KARAR BUTONU YOK — kendine beğeni gönderemezsin (UT-7422).
 *
 * Büyüme herkese açık (kendi fotoğrafına da büyük bakabilmelisin), kapı
 * yalnız tikte. Ölü bir buton çizmek yerine hiç çizilmiyor — kabuğun kendi
 * kuralı.
 */
it('KENDİ anımda cam tik ÇİZİLMİYOR', () => {
  const tree = mount({ moment: { ...base.moment, isMine: true } });
  settle();
  expect(tree.queryByLabelText('Beğen')).toBeNull();
  // Kapatma yolu duruyor: yüzeyden çıkılabiliyor.
  expect(tree.queryByLabelText('Kapat')).not.toBeNull();
});

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
