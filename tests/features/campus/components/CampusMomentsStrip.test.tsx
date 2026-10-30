import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeMutable } from 'react-native-reanimated';
import CampusMomentsStrip from '@/features/campus/components/CampusMomentsStrip';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

/**
 * ŞERİDİN DOKUNUŞ SÖZLEŞMESİ.
 *
 * Şerit karar vermiyor, yalnız dokunuşu yukarı veriyor — ve dokunuş artık
 * profil değil BÜYÜYEN KARTI açıyor. Burada çivilenen iki şey:
 *   • kartın ölçülen karesi de yukarı geçiyor (hareket oradan başlıyor),
 *   • KENDİ anım dokunulamaz (UT-7422) — kart erişilebilirlik ağacında buton
 *     bile değil.
 */

const moment = (over?: Partial<CampusMomentDto>): CampusMomentDto => ({
  id: '1',
  userId: 'u1',
  displayName: 'Ada',
  age: 21,
  photoUrl: 'https://cdn.test/1.jpg',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  mode: 'Dating',
  isMine: false,
  ...over,
});

const frameMetrics = { x: 0, y: 0, width: 393, height: 852 };
const insets = { top: 59, left: 0, right: 0, bottom: 34 };

const mount = (
  over: Partial<React.ComponentProps<typeof CampusMomentsStrip>> = {},
) => {
  const onOpenCard = jest.fn();
  const tree = render(
    <SafeAreaProvider initialMetrics={{ frame: frameMetrics, insets }}>
      <CampusMomentsStrip
        progress={makeMutable(1)}
        moments={[moment()]}
        campusLabel="Test"
        loading={false}
        canShare
        isInsideCampus
        onOpenCard={onOpenCard}
        onRemove={jest.fn()}
        onReport={jest.fn()}
        {...over}
      />
    </SafeAreaProvider>,
  );
  return { tree, onOpenCard };
};

it('karta basınca onOpenCard an ve kareyle çağrılıyor', async () => {
  const { tree, onOpenCard } = mount();
  fireEvent.press(tree.getByLabelText(/Ada/));
  // Çağrı asenkron: kart önce kendi penceresini ölçüyor (CampusMomentCard).
  await waitFor(() => expect(onOpenCard).toHaveBeenCalledTimes(1));
  expect(onOpenCard.mock.calls[0][0].id).toBe('1');
});

/**
 * ⚠️ KENDİ ANIM DA BÜYÜYOR (istek) — kapı ARTIK ŞERİTTE DEĞİL.
 *
 * Eskiden `isMine` kartta `onPress`i hiç vermiyordu, yani kendi anına dokunmak
 * HİÇBİR ŞEY yapmıyordu ve yüzey bozuk gibi okunuyordu. Gerekçe "kendine karar
 * veremezsin"di (UT-7422) ama dokunuş artık bir karar değil, büyütüp bakma.
 * Kural yer değiştirdi: büyüme herkese açık, KARAR BUTONU kendi anımda
 * çizilmiyor (bkz. overlay testi).
 */
/**
 * ⚠️ UÇAN KARTIN ASLI ŞERİTTE GİZLENİYOR — "kopya" hissini kıran tek şey.
 *
 * Büyüyen kart teknik olarak ayrı bir görünüm (RN'de bir görünümü ağaçtan
 * ağaca TAŞIMAK mümkün değil). Kullanıcının "taşındı" görmesi, aslının o
 * sırada yerinde durmamasına bağlı: ikisi bir arada görünürse hareket
 * "kopyalandı" diye okunuyor.
 *
 * ⚠️ GİZLEME `opacity` İLE DEĞİL, KART HİÇ ÇİZİLMİYOR (yerinde aynı ölçüde
 * boş bir kutu kalıyor). Kart bir SwiftUI `ContextMenu` host'u taşıyor ve
 * opaklığı 1'in altına inen bir atanın altındaki SwiftUI yüzeyi SESSİZCE
 * çizilmiyor, üstelik sonradan DÜZELMİYOR — kart geri geldiğinde menüsü ölü
 * olurdu. Sökülüp yeniden kurulmak o tuzağa girmiyor.
 */
it('AÇIK olan kart şeritte çizilmiyor — yerinde boşluk kalıyor', () => {
  const { tree } = mount({ openMomentId: '1' });
  expect(tree.queryByLabelText(/Ada/)).toBeNull();
});

it('KENDİ anım da büyüyor — kapı tikte, dokunuşta değil', async () => {
  const { tree, onOpenCard } = mount({ moments: [moment({ isMine: true })] });
  fireEvent.press(tree.getByLabelText(/Ada/));
  await waitFor(() => expect(onOpenCard).toHaveBeenCalledTimes(1));
});
