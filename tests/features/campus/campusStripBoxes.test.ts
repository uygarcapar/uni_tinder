import {
  MIN_STRIP_BOXES,
  buildStripBoxes,
  orderInfoKeys,
} from '@/features/campus/campusStripBoxes';

/**
 * ŞERİDİN DİZİLİMİ — dört durumun kesişimi.
 *
 * Şerit modalın yerini aldı ve onunla birlikte klasik boş durum da kalktı:
 * boşluğun yerinde artık ikonlu/gradyanlı DOLGU kutuları duruyor. Yani "hiç an
 * yok" artık bir ekran değil, bir dizilim — ve dizilim dört girdiye bağlı
 * (paylaşabiliyor mu, yükleniyor mu, kaç an var, neden paylaşamıyor).
 *
 * Bu dallar bir `useMemo`nun içinde gözle doğrulanamıyordu; hesap saf modüle
 * taşındı, buradaki testler de sözleşmesi.
 */

const M = (id: string) => ({ id });
const KEYS = ['a', 'b', 'c', 'd', 'e'];

type TestMoment = { id: string };

const build = (args: Record<string, unknown> = {}) =>
  buildStripBoxes<TestMoment>({
    moments: [],
    idOf: (m) => m.id,
    canShare: false,
    loading: false,
    infoKeys: KEYS,
    ...args,
  });

describe('şeridin dizilimi', () => {
  it('artı kutusu ŞERİDİN BAŞINDA ve yalnız paylaşabiliyorken', () => {
    const withAdd = build({ canShare: true });
    expect(withAdd[0].add).toBe(true);

    // ⚠️ ÖLÜ KUTU ÇİZİLMİYOR: kampüs dışındaysa ya da bugün paylaşmışsa artı
    // HİÇ yok — basınca hata veren bir aksiyon kullanıcıyı kandırır.
    expect(build({ canShare: false }).some((b) => b.add)).toBe(false);
  });

  it('gerçek anlar artıdan SONRA, verildikleri sırada', () => {
    const boxes = build({ canShare: true, moments: [M('x'), M('y')] });
    expect(boxes.map((b) => b.moment?.id ?? b.key)).toEqual([
      'add',
      'x',
      'y',
      // Tek/iki an kalınca dolgu devreye giriyor (aşağıdaki test).
      expect.stringContaining('info-'),
    ]);
  });

  it('hiç an yokken şerit DOLGUYLA doluyor — boş durum YOK', () => {
    const boxes = build();
    expect(boxes).toHaveLength(MIN_STRIP_BOXES);
    expect(boxes.every((b) => b.infoKey !== null)).toBe(true);
    // Dolgu havuzun SIRASINI takip ediyor: sabitlenen bilgi ilk kutuda
    // görünmek zorunda (bkz. orderInfoKeys).
    expect(boxes[0].infoKey).toBe('a');
  });

  it('dolgu yalnız TAVANA KADAR — yeterince an varsa hiç eklenmiyor', () => {
    const boxes = build({ moments: [M('1'), M('2'), M('3'), M('4')] });
    expect(boxes).toHaveLength(4);
    expect(boxes.some((b) => b.infoKey)).toBe(false);
  });

  it('yükleme turunda İSKELET, dolgu DEĞİL', () => {
    // Dolgu "kampüste kimse paylaşmamış" demek; o anda daha bilmiyoruz.
    const boxes = build({ loading: true });
    expect(boxes).toHaveLength(MIN_STRIP_BOXES);
    expect(boxes.every((b) => b.skeleton)).toBe(true);
  });

  it('elinde veri varken İSKELET YOK — arka plan tazelemesi ekranı boşaltmıyor', () => {
    // `loading` tazeleme turlarında da true olabiliyor.
    const boxes = build({ loading: true, moments: [M('x')] });
    expect(boxes.some((b) => b.skeleton)).toBe(false);
    expect(boxes[0].moment?.id).toBe('x');
  });

  it('yükleme turunda da artı kutusu BAŞTA kalıyor', () => {
    const boxes = build({ loading: true, canShare: true });
    expect(boxes[0].add).toBe(true);
    expect(boxes.slice(1).every((b) => b.skeleton)).toBe(true);
  });

  it('anahtarlar türler arasında ÇAKIŞMIYOR', () => {
    const boxes = build({ canShare: true, moments: [M('info-a')] });
    const keys = boxes.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('havuz boşsa dolgu atlanıyor — sonsuz döngü yok', () => {
    const boxes = build({ infoKeys: [] });
    expect(boxes).toHaveLength(0);
  });
});

describe('bilgi sırası', () => {
  it('sabitlenen anahtar BAŞA alınıyor, kalanların sırası bozulmuyor', () => {
    expect(orderInfoKeys(KEYS, 'c')).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('sabitleme yoksa sıra olduğu gibi kalıyor', () => {
    expect(orderInfoKeys(KEYS, null)).toEqual(KEYS);
  });

  it('havuzda olmayan anahtar sırayı BOZMUYOR', () => {
    // Bir i18n anahtarı yeniden adlandırılırsa sıra sessizce eskisi gibi
    // kalıyor — kutuların kaybolması ya da boş kutu çizilmesi yok.
    expect(orderInfoKeys(KEYS, 'zzz')).toEqual(KEYS);
  });
});
