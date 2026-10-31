import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CampusMomentExpandOverlay, {
  EXPAND_MS,
} from '@/features/campus/components/CampusMomentExpandOverlay';
import { campusBoxMetrics } from '@/features/campus/components/CampusInfoBox';
import { RADIUS_GROWTH } from '@/features/campus/components/CampusMomentExpandOverlay';
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
/**
 * ⚠️ TİP `base`TEN DEĞİL BİLEŞENİN KENDİ PROP'LARINDAN: `base` yalnız zorunlu
 * alanları taşıyor ve `Partial<typeof base>` opsiyonel prop'ları (ör.
 * `decided`, `collapsing`) tip dışı bırakıyordu — test koşuyor ama `tsc`
 * patlıyordu.
 */
const mount = (
  props: Partial<React.ComponentProps<typeof CampusMomentExpandOverlay>> = {},
) =>
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


/**
 * KARAR VERİLMİŞ (ya da KENDİ) KARTI SAĞDAN DA EKRANI KAPLIYOR.
 *
 * İstek: "karar verilmiş kartta kart sağdan da kaplasın ekranı ve soldan
 * olduğu kadar, oranı da aynı kalsın; kendi kartım büyüyünce de."
 *
 * Sağdaki 96pt'lik sütun CAM BUTON için ayrılıyor; buton çizilmeyen iki hâlde
 * (karar verilmiş · kendi anım) o sütun boş bir şerit olarak duruyor ve kart
 * sebepsiz sola yatık kalıyordu.
 *
 * ⚠️🔴 İKİNCİ TEST ASIL OLAN: bayrak hareketin ORTASINDA değişebiliyor (beğeni
 * gidince kart o anda "karar verilmiş" oluyor ve tam o sırada küçülme koşuyor).
 * Değer canlı okunsa hedef kare küçülmenin ortasında büyür, kart şeritteki
 * yerine değil başka bir yere doğru küçülürdü. Bu yüzden açılışta donuyor.
 */
const cardWidth = (tree: ReturnType<typeof mount>): number => {
  /**
   * Kartın kabuğu: `left` + `width` + `height` birlikte yazan tek düğüm.
   *
   * ⚠️ `height` ŞART: ad satırı artık kartın KARDEŞİ ve o da `left`/`width`
   * taşıyor (yüksekliği içeriğinden geliyor, yazılmıyor). Yalnız ikisine
   * bakan bir arama iki düğüm bulup testi belirsizleştiriyordu.
   */
  const found: number[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = node.props?.style;
    const flat = Array.isArray(style) ? style.flat(9) : [style];
    for (const s of flat) {
      if (
        s &&
        typeof s === 'object' &&
        typeof s.left === 'number' &&
        typeof s.width === 'number' &&
        typeof s.height === 'number'
      ) {
        found.push(s.width);
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree.toJSON());
  expect(found).toHaveLength(1);
  return found[0];
};

it('KARAR VERİLMİŞ kart daha GENİŞ — cam sütunu ayrılmıyor', () => {
  const normal = mount();
  settle();
  const decided = mount({ decided: true });
  settle();
  expect(cardWidth(decided)).toBeGreaterThan(cardWidth(normal));
});

it('KENDİ anım da geniş açılıyor — orada da tik yok', () => {
  const normal = mount();
  settle();
  const mine = mount({ moment: { ...base.moment, isMine: true } });
  settle();
  expect(cardWidth(mine)).toBeGreaterThan(cardWidth(normal));
});

it('⚠️ BAYRAK AÇILIŞTA DONUYOR — kart açıkken genişlik DEĞİŞMİYOR', () => {
  const tree = mount();
  settle();
  const before = cardWidth(tree);
  // Beğeni gitti: aynı an "karar verilmiş"e döndü ve küçülme başlıyor.
  tree.rerender(
    <SafeAreaProvider initialMetrics={{ frame: frameMetrics, insets }}>
      <CampusMomentExpandOverlay {...base} decided collapsing />
    </SafeAreaProvider>,
  );
  expect(cardWidth(tree)).toBe(before);
});


/**
 * ⚠️🔴 AD SATIRI TEK KOPYA VE KENDİSİ YOL ALIYOR (istek: "opasite azalmasın
 * direkt hiç; kendisi olması gereken yere yavaşça gitsin").
 *
 * Bir tur İKİ kopya birbirine geçiyordu (içeride sönen + dışarıda beliren).
 * İki kopya ekranda bir an için iki ad demek; üstelik istek opaklığa değil
 * HAREKETE işaret ediyordu. Bu test ikinci kopyanın geri gelmesini yakalar.
 */
it('ad satırı yüzeyde TAM BİR KEZ çiziliyor', () => {
  const tree = mount();
  settle();
  // ⚠️ KÜÇÜK HARF: ad satırı baş harfi küçültüyor (istek) — `/Ada/` arayan
  // bir test sessizce "bulunamadı"ya düşüyordu.
  expect(tree.getAllByText(/ada/)).toHaveLength(1);
});

/**
 * ⚠️🔴 KÖŞE ÇARPANDAN MUAF (istek: "foto büyürken rounded değişiyor,
 * değişmesin"). Çarpanla çizilseydi büyüyen kartın köşesi şeridinkinin iki
 * katı olurdu; şimdi iki DURAN hâl aynı köşeyi paylaşıyor.
 */
it('köşe ŞERİDİNKİNDEN bir tık yuvarlak — ama ÇARPANLA büyümüyor', () => {
  const tree = mount();
  settle();
  const radii: number[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = node.props?.style;
    const flat = Array.isArray(style) ? style.flat(9) : [style];
    for (const s of flat) {
      if (s && typeof s === 'object' && typeof s.borderWidth === 'number') {
        radii.push(s.borderRadius);
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree.toJSON());
  // `frame.height` = 222 → reçetenin o boydaki köşesi, bir tık yuvarlatılmış.
  expect(radii).toContain(campusBoxMetrics(222).radius * RADIUS_GROWTH);
});


/**
 * ⚠️🔴 KIL ÇİZGİ EKRANDA SABİT 0.5pt — "kırılma" hatasının çivisi.
 *
 * Cihaz şikâyeti: "border kırılma yapıyor, büyürken kendini korumuyor."
 * Sebebi kenarın kartla birlikte ÖLÇEKLENMESİ: 0.5pt'lik bir çizgi kartın
 * başlangıç ölçeğinde (≈0.24) ekranda 0.12pt'ye iniyor — yarım pikselin
 * altı, yani cihaz onu yer yer çiziyor yer yer atlıyor.
 *
 * Değişmez şu: ÇİZİLEN kalınlık × kartın o anki ölçeği = 0.5. Test
 * başlangıç karesinde (p=0) bunu ölçüyor; diğer uçta (p=1, ölçek 1) çizilen
 * değer zaten 0.5 olmak zorunda.
 */
it('kenar çizgisi EKRANDA 0.5pt — ölçekle kırılmıyor', () => {
  const tree = mount();
  settle();

  const borders: number[] = [];
  let targetWidth = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = node.props?.style;
    const flat = Array.isArray(style) ? style.flat(9) : [style];
    for (const s of flat) {
      if (!s || typeof s !== 'object') continue;
      if (typeof s.borderWidth === 'number') borders.push(s.borderWidth);
      // Hedef kare: `left` + `width` + `height` yazan tek düğüm (kartın
      // kabuğu, bkz. `cardWidth`).
      if (
        typeof s.left === 'number' &&
        typeof s.width === 'number' &&
        typeof s.height === 'number'
      ) {
        targetWidth = s.width;
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree.toJSON());

  // Animasyonlu kalınlık: 0.5 OLMAYAN (telafi edilmiş) değer.
  const drawn = borders.find((b) => b !== campusBoxMetrics(222).ring);
  expect(drawn).toBeDefined();
  expect(targetWidth).toBeGreaterThan(0);

  // p=0'daki kart ölçeği: şerit karesinin eni / hedefin eni.
  const cardScaleStart = base.frame.width / targetWidth;
  expect(drawn! * cardScaleStart).toBeCloseTo(campusBoxMetrics(222).ring, 6);
});
