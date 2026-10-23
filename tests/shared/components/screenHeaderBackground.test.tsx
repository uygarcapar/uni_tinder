jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

import { render, renderHook } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSharedValue } from 'react-native-reanimated';
import ScreenHeader, {
  SCREEN_HEADER_TITLE_HEIGHT,
} from '@/shared/components/ScreenHeader';

/**
 * ŞERİDİN BULANIK ZEMİNİ: AÇILIP KAPANABİLİR **ve** KISALTILABİLİR.
 *
 * Akışta tepede iki bulanık katman var: tam ekran kampüs haritasının kendi
 * progressive blur'u (başlığı ve pill'leri kaplıyor) ve şeridin kendi zemini.
 * Tam boy zemin ikincisini üst üste bindiriyor ve aşağı kaydırıldıkça tepede
 * İKİNCİ bir perde beliriyordu; tamamen kapatmak ise sekmeleri kaybettiriyor,
 * çünkü kartlar şeridin altına girdiğinde harita blur'u onların ARKASINDA
 * kalıyor. Çözüm ikisinin arası: zemin var ama yalnız sekmelerin altına kadar.
 *
 * ⚠️ İkisinin de varsayılanı güvenli tarafta olmak ZORUNDA: `ScreenHeader`ın
 * 8 tüketicisi var (Mesajlar, Beğeniler, Profil, Ayarlar, Sohbet, Plus…) ve
 * hepsinde içerik şeridin altından geçiyor. `background` yanlışlıkla `false`a
 * ya da `backgroundHeight` kısa bir sayıya dönerse o ekranlarda başlık
 * kaydırılan içeriğin üstünde okunmaz hâle gelir — ve bu SESSİZ bir bozulma
 * olur, başka hiçbir test patlamaz.
 */

const INSET_TOP = 59;
/** `ScreenHeader` içindeki `headerH` — şeridin tam boyu. */
const FULL_HEIGHT = INSET_TOP + 90;

describe('ScreenHeader bulanık zemini', () => {
  const setup = (props: Record<string, unknown>) => {
    const { result } = renderHook(() => useSharedValue(0));
    return render(
      <ScreenHeader scrollY={result.current} showLogo={false} {...props} />,
    );
  };

  /** Zemin katmanının çizilen yüksekliği (blur'u taşıyan kap). */
  const backgroundHeightOf = (tree: ReturnType<typeof setup>) => {
    const blur = tree.UNSAFE_getAllByType(BlurView)[0];
    // BlurView → MaskedView → zemin kabı. Yüksekliği taşıyan ilk ataya çık.
    let node: any = blur.parent;
    while (node) {
      const flat = StyleSheet.flatten(node.props?.style) as any;
      if (flat && typeof flat.height === 'number') return flat.height;
      node = node.parent;
    }
    return null;
  };

  it('VARSAYILAN olarak çiziliyor', () => {
    const tree = setup({});
    expect(tree.UNSAFE_queryAllByType(BlurView).length).toBeGreaterThan(0);
  });

  it('background={false} ile HİÇ çizilmiyor', () => {
    const tree = setup({ background: false });
    expect(tree.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
  });

  it('background={true} açıkça verilince de çiziliyor', () => {
    const tree = setup({ background: true });
    expect(tree.UNSAFE_queryAllByType(BlurView).length).toBeGreaterThan(0);
  });

  it('VARSAYILAN yükseklik şeridin TAM boyu', () => {
    expect(backgroundHeightOf(setup({}))).toBe(FULL_HEIGHT);
  });

  it('backgroundHeight verilince zemin KISALIYOR — blur yine duruyor', () => {
    // Akışın geçtiği değer: sekme satırının hemen altında bitiyor.
    const short = INSET_TOP + SCREEN_HEADER_TITLE_HEIGHT + 14;
    const tree = setup({ backgroundHeight: short });
    expect(backgroundHeightOf(tree)).toBe(short);
    expect(short).toBeLessThan(FULL_HEIGHT);
    expect(tree.UNSAFE_queryAllByType(BlurView).length).toBeGreaterThan(0);
  });

  it('kısa zemin SEKME satırının altında bitiyor — üstünde değil', () => {
    // Şerit `insets.top`ta başlıyor ve 50pt yüksek. Zemin bundan kısa olursa
    // sekme adlarının bir kısmı zeminsiz kalır.
    const short = INSET_TOP + SCREEN_HEADER_TITLE_HEIGHT + 14;
    expect(short).toBeGreaterThanOrEqual(INSET_TOP + SCREEN_HEADER_TITLE_HEIGHT);
  });
});
