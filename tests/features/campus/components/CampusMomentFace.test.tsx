import { render } from '@testing-library/react-native';
import CampusMomentFace, {
  CAMPUS_FACE_CAPTION,
} from '@/features/campus/components/CampusMomentFace';
import { campusBoxMetrics } from '@/features/campus/components/CampusInfoBox';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

/**
 * KARTIN YÜZÜ — iki yüzey (şeritteki kart + BÜYÜYEN kart) tek uygulamayı
 * paylaşıyor ve aralarındaki TEK fark, ölçeklenen bir görünümün içinde
 * yaşamanın getirdiği iki kısıt. Bu dosya o iki kısıtı çiviliyor; ikisi de
 * cihazda GÖRÜLEN hatalardan geldi.
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

const mount = (props?: { scale?: number; caption?: boolean }) =>
  render(
    <CampusMomentFace
      moment={moment()}
      width={167}
      height={222}
      {...campusBoxMetrics(222)}
      nowMs={Date.now()}
      {...props}
    />,
  );

/** Ağaçta verilen tipte bir düğüm var mı (mock'lar string bileşen). */
const hasNode = (tree: any, type: string): boolean => {
  let found = false;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === type) {
      found = true;
      return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return found;
};

/**
 * ⚠️🔴 YAZI KUTUNUN DIŞINDA, ALTINDA (istek) — RAMPA TAMAMEN KALKTI.
 *
 * Ad ve saat fotoğrafın dibinde duruyordu ve okunurluğu maskeli bir
 * progressive blur bandı taşıyordu. Yazı dışarı çıkınca perdeye gerek
 * kalmadı — ve blur'un kendisi zaten bu yüzeyde sorunluydu: ÖLÇEKLENEN bir
 * `BlurView` (UIVisualEffectView) bulanıklığı hesaplayamayıp düz koyu bir
 * dikdörtgen çiziyor ("büyürken kartın en altı siyah oluyor").
 *
 * Bu test geri gelmesini engelliyor: yüzde blur da maske de OLMAMALI.
 */
describe('fotoğrafın üstünde perde YOK', () => {
  it('blur ve maske HİÇBİR hâlde çizilmiyor', () => {
    const tree = mount().toJSON();
    expect(hasNode(tree, 'BlurView')).toBe(false);
    expect(hasNode(tree, 'MaskedView')).toBe(false);
  });
});

/**
 * ⚠️ YAZI KARTLA AYNI ORANDA BÜYÜYOR (istek: "isim, yaş ve saat kartla beraber
 * aynı oranda büyüyüp küçülsün" + "çok solda kalıyor kart büyüyünce").
 *
 * Büyüyen kart hedef ölçüsünde doğup şeritteki karesine iniyor, yani yüzün
 * içindeki sayılar `target/start` kadar büyük yazılmak zorunda: p=0'da şeritle
 * birebir, p=1'de kartla aynı oranda. Çarpan yalnız puntoyu değil PAYLARI da
 * taşımalı — taban payı büyük kartta yazıyı kenara yapıştırıyordu.
 *
 * Bir tur bunun TERSİ yapıldı (yazı sabit, kartın ölçeği geri alınıyor) ve
 * istek üzerine geri alındı; gerekçe yüzün başındaki blokta.
 */
const styleOf = (tree: any, predicate: (s: any) => boolean): any => {
  let hit: any = null;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || hit) return;
    const style = node.props?.style;
    const flat = Array.isArray(style) ? style.flat(9) : [style];
    for (const s of flat) if (s && typeof s === 'object' && predicate(s)) hit = s;
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return hit;
};

/**
 * ⚠️🔴 AD SATIRI ÇARPANDAN MUAF — iki uçta da aynı punto.
 *
 * Çarpan fotoğrafın İÇİNDEKİ şeyleri taşıyor (gösterge çizgisi, rozet). Satır
 * ise büyüyen kartta bu ağaçta HİÇ çizilmiyor: orada tek kopya, kartın
 * kardeşi ve şeritteki yerinden hedefine KENDİSİ gidiyor (istek). Punto iki
 * uçta da aynı olduğu için hareket saf öteleme — ölçeklenseydi yazı yolda
 * yeniden örneklenirdi.
 */
it('çarpan AD SATIRINI büyütmüyor', () => {
  const base = styleOf(mount().toJSON(), (s) => s.fontWeight === '700');
  const big = styleOf(mount({ scale: 2 }).toJSON(), (s) => s.fontWeight === '700');
  expect(big.fontSize).toBe(base.fontSize);
});

it('`caption={false}` ile ad satırı HİÇ çizilmiyor — büyüyen kartın dalı', () => {
  const tree: any = mount({ caption: false }).toJSON();
  const hasName = JSON.stringify(tree).includes('Ada');
  expect(hasName).toBe(false);
});

/**
 * ⚠️🔴 YAZI BLOĞUNUN BOYU DIŞA AÇIK VE ÜÇ YER OKUYOR: şerit kutu başına yer
 * ayırıyor (`campusStripHeight`), büyüyen kartın hedef karesi ondan türüyor
 * (`campusExpandGeometry > captionHeight`) ve kartın dokunma hedefi/natif
 * menü ölçüsü de (`CampusMomentCard > itemHeight`). Sayı burada değişirse
 * üçü birden takip etmek zorunda — bu test onu çivileyen tek yer.
 */
it('yazı bloğunun boyu = ara + TEK satır (ad)', () => {
  // ⚠️ İKİ SATIRDI (ad + saat) ve saat KALKTI: yerine ömür halkası geldi,
  // halka da fotoğrafın sol üstüne taşındı — blok tek satır.
  expect(CAMPUS_FACE_CAPTION).toBe(8 + 26);
});

/**
 * YAZI KUTUNUN DIŞINDA: kutu `height` prop'u kadar, yazı ONUN ALTINDA — yani
 * yüzün toplam boyu `height + CAMPUS_FACE_CAPTION * scale`. Kutunun boyu
 * yazıyla birlikte kısalsaydı fotoğraf sessizce küçülürdü (3:4 oranı da
 * bozulurdu).
 */
it('fotoğraf kutusu verilen BOYDA kalıyor — yazı onu kısaltmıyor', () => {
  const box = styleOf(
    mount().toJSON(),
    (s) => s.height === 222 && s.width === 167,
  );
  expect(box).not.toBeNull();
});


/**
 * GEÇEN SÜRE — ADIN SAĞINDA, YAZI OLARAK (istek: "x saat önce").
 *
 * ⚠️ DÖRDÜNCÜ TUR: süre fotoğrafın dibinde saat ("14:32") → köşede halka →
 * kartın kenarını saran renkli şerit → KALAN süre yazısı ("18 sa") → şimdi
 * GEÇEN süre ("3 saat önce"). Son iki hâl aynı bilgiyi iki yönden söylüyor;
 * fark okunuşta: biri sayaç, öteki zaman damgası (akış/sohbet diliyle aynı).
 *
 * ⚠️ RENKLİ ŞERİT GERİ GELMEMELİ (istek: "sadece fotoğraf olsun"): fotoğrafın
 * üstünde SVG bir çizim kalmadı.
 */
describe('geçen süre etiketi', () => {
  const faceWith = (over: Partial<CampusMomentDto>, nowMs = Date.now()) =>
    render(
      <CampusMomentFace
        moment={moment(over)}
        width={167}
        height={222}
        {...campusBoxMetrics(222)}
        nowMs={nowMs}
      />,
    );

  it('adın YANINDA ve addan KÜÇÜK puntoda', () => {
    const tree = faceWith({
      createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    });
    const label = tree.getByText(/önce/);
    const name = tree.getByText(/ada/);
    const sizeOf = (n: any) => {
      const st = Array.isArray(n.props.style) ? n.props.style.flat(9) : [n.props.style];
      return st.find((x: any) => x && x.fontSize)?.fontSize;
    };
    expect(sizeOf(label)).toBeLessThan(sizeOf(name));
  });

  it('bir dakikanın altında "az önce" — negatif/sıfır süre yazmıyor', () => {
    expect(faceWith({ createdAt: new Date().toISOString() }).getByText(/az önce/)).toBeTruthy();
  });

  it('çözülemeyen tarihte etiket HİÇ çizilmiyor', () => {
    expect(faceWith({ createdAt: 'bozuk' }).queryByText(/önce/)).toBeNull();
  });

  /**
   * ⚠️🔴 ADIN BAŞ HARFİ KÜÇÜK (istek) ve dönüşüm TÜRKÇE yerelinde: `toLowerCase`
   * İngilizce kurallarla "İ" → "i̇" (birleşik nokta) veriyor, Türkçe'de doğru
   * karşılık "i". Ad kullanıcı girdisi ve Türkçe isimler bu harfle dolu.
   */
  it('adın baş harfi küçülüyor — Türkçe İ de dâhil', () => {
    expect(faceWith({ displayName: 'Ada' }).getByText(/^ada/)).toBeTruthy();
    expect(faceWith({ displayName: 'İnci' }).getByText(/^inci/)).toBeTruthy();
    // Geri kalanına dokunulmuyor.
    expect(faceWith({ displayName: 'AyŞe' }).getByText(/^ayŞe/)).toBeTruthy();
  });

  it('fotoğrafın üstünde ÇİZİM yok — renkli şerit kalktı', () => {
    const tree: any = mount().toJSON();
    expect(hasNode(tree, 'RNSVGPath')).toBe(false);
    expect(hasNode(tree, 'RNSVGSvgView')).toBe(false);
  });
});
