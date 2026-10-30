import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CampusMomentCard from '@/features/campus/components/CampusMomentCard';
import { campusBoxMetrics } from '@/features/campus/components/CampusInfoBox';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

/**
 * KAMPÜS ANI KARTI — uzun basış menüsünün ve PROFİL KAPISININ sözleşmesi.
 *
 * Menünün kendisi natif (SwiftUI `.contextMenu`, testte mock'lu), yani burada
 * doğrulanabilecek şey menünün GÖRÜNÜŞÜ değil HANGİ SATIRIN kime çıktığı:
 *   • kendi anımda kaldır, başkasınınkinde şikayet — ASLA ters,
 *   • iOS'ta eski "Kaldır" pill'i YOK: aynı işi yapan ikinci yüzey kartı
 *     kalabalıklaştırıyordu ve istek açıkça uzun basıştı.
 *
 * ⚠️ KARAR ÇİFTİ ARTIK YOK (istek): fotoğrafın sağ altındaki cam tik/X satırı
 * kaldırıldı ve karar kişinin PROFİL KARTINA taşındı. Eski "kendi anımda karar
 * çifti yok" / "`actionsReady` ile geliyor" testlerinin yerini aşağıdaki iki
 * dokunma testi aldı: karta basmak profili açıyor, KENDİ anıma basmak
 * açmıyor (kendine karar veremezsin — UT-7422).
 *
 * ⚠️ Satırlar `accessibilityLabel`dan bulunuyor: natif menü satırı metin
 * ÇOCUĞU taşımıyor, yalnız `label` prop'u (bkz. jest.setup'taki mock).
 */

const moment = (over?: Partial<CampusMomentDto>): CampusMomentDto => ({
  id: '1',
  userId: 'u1',
  displayName: 'Ada',
  age: 21,
  photoUrl: 'https://cdn.test/1.jpg',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  mode: 'Dating',
  isMine: false,
  ...over,
});

const renderCard = (
  over?: Partial<React.ComponentProps<typeof CampusMomentCard>>,
) => {
  const onRemove = jest.fn();
  const onReport = jest.fn();
  const onPress = jest.fn();
  const tree = render(
    <CampusMomentCard
      moment={moment()}
      /* Şeridin verdiği ölçünün birebir aynısı: 3:4 kutu (222 boy → 167 en) ve
         çerçeve reçetenin o boydaki karşılığı — sayılar burada elle yazılsaydı
         reçete değiştiğinde test eski kutuyu doğrulamaya devam ederdi. */
      width={Math.round((222 * 3) / 4)}
      height={222}
      {...campusBoxMetrics(222)}
      nowMs={Date.now()}
      onPress={onPress}
      onRemove={onRemove}
      onReport={onReport}
      {...over}
    />,
  );
  return { tree, onRemove, onReport, onPress };
};

describe('CampusMomentCard — uzun basış menüsü', () => {
  it('KENDİ anımda menüde kaldır var, şikayet YOK', () => {
    const { tree, onRemove } = renderCard({ moment: moment({ isMine: true }) });
    expect(tree.queryByLabelText('Şikayet Et')).toBeNull();
    fireEvent.press(tree.getByLabelText('Kaldır'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('BAŞKASININ anında menüde şikayet var, kaldır YOK', () => {
    const { tree, onReport } = renderCard();
    expect(tree.queryByLabelText('Kaldır')).toBeNull();
    fireEvent.press(tree.getByLabelText('Şikayet Et'));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('`onReport` verilmezse şikayet satırı ÇİZİLMİYOR — ölü satır yok', () => {
    const { tree } = renderCard({ onReport: undefined });
    expect(tree.queryByLabelText('Şikayet Et')).toBeNull();
  });
});

describe('CampusMomentCard — profil kapısı', () => {
  /**
   * ⚠️ ÇAĞRI ASENKRON ve olması gereken bu: kart basıldığında önce kendi
   * penceresini ölçüyor (`measureInWindow`), ölçüm en iyi hâlde bir sonraki
   * kareye düşüyor. Eşzamanlı çağırmak ölçümü hiç kullanmamak demekti.
   */
  it('karta dokunmak ANI yukarı veriyor (kararın yolu büyüyen kart)', async () => {
    const { tree, onPress } = renderCard();
    fireEvent.press(tree.getByLabelText(/Ada/));
    await waitFor(() => expect(onPress).toHaveBeenCalled());
    // Çağrı anın KENDİSİYLE: ekran `momentId`yi karar gövdesine koyuyor.
    // ⚠️ YALNIZ İLK ARGÜMAN: ikincisi ölçülen kare ve `null` olabiliyor
    // (`expect.anything()` null'u EŞLEŞTİRMİYOR) — onun sözleşmesi aşağıdaki
    // ayrı testte.
    const [passed] = onPress.mock.calls[0];
    expect(passed).toEqual(expect.objectContaining({ id: '1', userId: 'u1' }));
  });

  /**
   * ⚠️ KARE `null` OLABİLİR VE BU BİR HATA DEĞİL.
   *
   * `measureInWindow` jest ortamında geri çağırmıyor; cihazda da kart o anda
   * sökülmüş olabilir. Kapı ölçüme BAĞLANMIYOR — ölçüm yoksa kart yine
   * açılıyor, yalnız uçma fazı düşüyor (bkz. campusExpandGeometry > `start`).
   */
  it('ölçüm alınamasa bile kart AÇILIYOR — kare `null` geçiyor', async () => {
    const { tree, onPress } = renderCard();
    fireEvent.press(tree.getByLabelText(/Ada/));
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
    const [, frame] = onPress.mock.calls[0];
    expect(frame === null || typeof frame.width === 'number').toBe(true);
  });

  it('KARAR ÇİFTİ YOK — tik/X kaldırıldı', () => {
    const { tree } = renderCard();
    expect(tree.queryByLabelText('Beğen')).toBeNull();
    expect(tree.queryByLabelText('Geç')).toBeNull();
  });

  it('`onPress` verilmezse kart dokunulabilir DEĞİL (kendi anım)', () => {
    const { tree } = renderCard({
      moment: moment({ isMine: true }),
      onPress: undefined,
    });
    expect(tree.queryByLabelText(/Ada/)).toBeNull();
  });
});
