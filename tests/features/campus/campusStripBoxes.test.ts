import {
  MIN_STRIP_BOXES,
  buildStripBoxes,
  orderInfoKeys,
} from '@/features/campus/campusStripBoxes';

/**
 * ŞERİDİN DİZİLİMİ — üç durumun kesişimi.
 *
 * Şerit modalın yerini aldı ve onunla birlikte klasik boş durum da kalktı:
 * boşluğun yerinde artık ikonlu/gradyanlı DOLGU kutuları duruyor. Yani "hiç an
 * yok" artık bir ekran değil, bir dizilim — ve dizilim üç girdiye bağlı
 * (yükleniyor mu, kaç an var, hangi bilgi kutusu başta).
 *
 * ⚠️ DÖRDÜNCÜ GİRDİ (`canShare`) BU HESAPTAN ÇIKTI: şeridin başındaki tam boy
 * paylaşma kutusu kaldırıldı ve aksiyon BAŞLIK SATIRINA taşındı (gerekçe
 * campusStripBoxes'ın başında). Artı kutusu testleri de onunla birlikte
 * düştü — şerit artık yalnız gösterilecek içerikten oluşuyor.
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
    loading: false,
    infoKeys: KEYS,
    ...args,
  });

describe('şeridin dizilimi', () => {
  it('gerçek anlar EN BAŞTA, verildikleri sırada', () => {
    const boxes = build({ moments: [M('x'), M('y')] });
    expect(boxes.map((b) => b.moment?.id ?? b.key)).toEqual(['x', 'y']);
  });

  it('hiç an yokken şerit DOLGUYLA doluyor — boş durum YOK', () => {
    const boxes = build();
    expect(boxes).toHaveLength(MIN_STRIP_BOXES);
    expect(boxes.every((b) => b.infoKey !== null)).toBe(true);
    // Dolgu havuzun SIRASINI takip ediyor: sabitlenen bilgi ilk kutuda
    // görünmek zorunda (bkz. orderInfoKeys).
    expect(boxes[0].infoKey).toBe('a');
  });

  /**
   * ⚠️ TEK AN BİLE DOLGUYU TAMAMEN KAPATIYOR (istek: "bir an varsa bizim 3
   * default empty state kartları gözükmesin").
   *
   * Eskiden dolgu TAVANA KADAR tamamlıyordu (1 an + 2 dolgu) ve kural
   * anlatan kutular gerçek anların yanında içeriğin devamı gibi okunuyordu.
   * Tavan testi o yüzden bu ikisiyle değişti: kutu sayısı artık an sayısı.
   */
  it('TEK an varken dolgu YOK — şerit yalnız o an', () => {
    const boxes = build({ moments: [M('x')] });
    expect(boxes).toHaveLength(1);
    expect(boxes.some((b) => b.infoKey)).toBe(false);
  });

  it('tavanın ÜSTÜNDE de dolgu yok — kutu sayısı an sayısı', () => {
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

  it('anahtarlar türler arasında ÇAKIŞMIYOR', () => {
    const boxes = build({ moments: [M('info-a')] });
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
