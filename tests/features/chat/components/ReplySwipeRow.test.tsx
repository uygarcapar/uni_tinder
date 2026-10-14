/**
 * Yanıt jesti ile ekranın geri (swipe-back) jesti AYNI hareketi paylaşıyor:
 * soldan sağa. Band sahipliği bu yüzden kod sözleşmesi — bozulduğunda kullanıcı
 * "ikisi karışıyor, biri bir süre çalışmıyor" diyor (gerekçe: ReplySwipeRow'un
 * başlık yorumu) ve hiçbir test kırılmıyordu.
 *
 * Burada ASSERT EDİLEN ŞEY jestin DUYARLI ALANI: geri şeridinde dokunuş akışını
 * hiç almaması gerekiyor. `inert` bayrağı yeterli DEĞİL — o yalnız etkiyi
 * susturur, jest yine aktifleşir ve native tanıyıcıyla yarışa girer.
 */
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { BACK_SWIPE_BAND } from '@/features/chat/components/RevealContext';

const captured: any[] = [];

jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');
  return {
    ...actual,
    GestureDetector: ({ gesture, children }: any) => {
      captured.push(gesture);
      return children;
    },
  };
});

import ReplySwipeRow from '@/features/chat/components/ReplySwipeRow';

function mount(messageId = 'm1') {
  captured.length = 0;
  render(
    <ReplySwipeRow messageId={messageId} onReply={jest.fn()}>
      <Text>balon</Text>
    </ReplySwipeRow>,
  );
  return captured[0]?.config ?? {};
}

describe('ReplySwipeRow jest sözleşmesi', () => {
  it('geri şeridi jestin duyarlı alanının DIŞINDA', () => {
    // Negatif değer: alan sol kenardan içeri çekilir (RNGH
    // RNGHHitSlopInsetRect → origin.x -= left, width += left).
    expect(mount().hitSlop).toEqual({ left: -BACK_SWIPE_BAND });
  });

  it('yalnız SAĞ çekişi sahiplenir; sol liste reveal\'ine, dikey scroll\'a kalır', () => {
    const config = mount();
    // RNGH yönlü eşikleri ayrı anahtarlara açıyor: activeOffsetX(20) → …XEnd.
    expect(config.activeOffsetXEnd).toBe(20);
    expect(config.failOffsetXStart).toBe(-15);
    expect(config.failOffsetYStart).toBe(-12);
    expect(config.failOffsetYEnd).toBe(12);
  });

  it('yanıtlanamaz satırda da jest KURULUR (atıllık çekiş anında kararlaşır)', () => {
    // messageId "" → jest var ama onBegin'de inert; alan sözleşmesi değişmiyor.
    expect(mount('').hitSlop).toEqual({ left: -BACK_SWIPE_BAND });
  });
});
