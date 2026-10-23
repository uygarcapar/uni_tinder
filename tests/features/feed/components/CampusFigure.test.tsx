import { render } from '@testing-library/react-native';
import CampusFigure, {
  CAMPUS_FIGURE_ANCHOR,
  CAMPUS_FIGURE_ASPECT,
} from '@/features/feed/components/CampusFigure';

/**
 * İzometrik okul figürü — test edilen şey ÇİZİM DEĞİL, KADRAJ SÖZLEŞMESİ.
 *
 * Figürün bütün geometrisi modül seviyesinde hesaplanıyor (projeksiyon → sınır
 * kutusu → viewBox + çapa) ve çağıran bu sayılara göre figürü haritadaki
 * kampüs noktasına oturtuyor. Bir ölçü değiştiğinde sessizce bozulacak olan da
 * tam bu üç varsayım:
 *
 *  1. Yatay çapa TAM ORTA. FeedMapStrip yatayda `alignItems: "center"`
 *     kullanıyor, yani 0.5'ten sapma figürü noktanın sağına/soluna kaçırır.
 *     (Flamayı binanın sağ köşesini aşacak kadar uzatmak bunu bozar.)
 *  2. Dikey çapa DİBE YAKIN ama dipte DEĞİL: bina yukarı uzuyor, gölgesi
 *     çapanın biraz altında. 0.5'e düşerse bina noktanın yukarısında kalır.
 *  3. Oran ~1: bandın yüksekliğine göre verilen boy, ekran genişliğini
 *     taşırmayan bir genişliğe dönmeli.
 */
describe('CampusFigure', () => {
  it('yatayda tam ortadan çapalanıyor', () => {
    expect(CAMPUS_FIGURE_ANCHOR.x).toBeCloseTo(0.5, 2);
  });

  /**
   * Dikey çapa kutunun ORTASINDA OLMAMALI: figür yukarı uzuyor, oturduğu nokta
   * aşağıda. 0.5'e düşerse bina haritadaki kampüs noktasının yukarısında kalır.
   *
   * ⚠️ Üst sınır GENİŞ ve bilerek: oran sınır kutusuna bağlı, yani figüre
   * eklenen her şey onu oynatıyor. Diorama'ya parsel eklenince (bina artık
   * boşlukta değil, yuvarlak köşeli bir zeminin üstünde) kutu AŞAĞI doğru
   * büyüdü ve oran 0.70'ten 0.58'e indi — davranış doğru, sayı değişti.
   * Test sayıyı değil KURALI koruyor: çapa ortanın altında.
   */
  it('dikey çapa binanın OTURDUĞU yerde (ortanın altında)', () => {
    expect(CAMPUS_FIGURE_ANCHOR.y).toBeGreaterThan(0.52);
    expect(CAMPUS_FIGURE_ANCHOR.y).toBeLessThan(0.85);
  });

  it('en/boy oranı kareye yakın', () => {
    expect(CAMPUS_FIGURE_ASPECT).toBeGreaterThan(0.8);
    expect(CAMPUS_FIGURE_ASPECT).toBeLessThan(1.2);
  });

  it('çiziliyor', () => {
    const { toJSON } = render(<CampusFigure height={86} />);
    expect(toJSON()).toBeTruthy();
  });
});
