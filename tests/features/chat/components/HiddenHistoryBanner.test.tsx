jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import HiddenHistoryBanner, {
  HIDDEN_HISTORY_ROW_ID,
} from '@/features/chat/components/HiddenHistoryBanner';

/**
 * Rematch kapısı: eski mesajlar OTOMATİK AÇILMAZ. Kapı ürün kararının görünen
 * yüzü — açma eylemi tek basışta bir kez gitmeli (geçmiş çift için açılıyor,
 * çift istek atmanın anlamı yok) ve istek uçarken buton ölü olmalı.
 */

describe('HiddenHistoryBanner', () => {
  it('kapı metnini ve aksiyonu gösterir', () => {
    const tree = render(<HiddenHistoryBanner onReveal={jest.fn()} />);

    expect(tree.getByText('Daha önce eşleşmiştiniz')).toBeTruthy();
    expect(tree.getByText('Eski sohbeti göster')).toBeTruthy();
  });

  it('basışta onReveal çağırır', async () => {
    const onReveal = jest.fn().mockResolvedValue(undefined);
    const tree = render(<HiddenHistoryBanner onReveal={onReveal} />);

    await act(async () => {
      fireEvent.press(tree.getByText('Eski sohbeti göster'));
    });

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('istek uçarken ikinci basışı yutar', async () => {
    let release: () => void = () => {};
    const onReveal = jest.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const tree = render(<HiddenHistoryBanner onReveal={onReveal} />);

    fireEvent.press(tree.getByText('Eski sohbeti göster'));
    // Buton yerini spinner'a bıraktı — etiket artık yok.
    await waitFor(() => expect(tree.queryByText('Eski sohbeti göster')).toBeNull());

    await act(async () => {
      release();
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('satır kimliği sabittir (MVCP çapası sayfalar arasında korunsun)', () => {
    expect(HIDDEN_HISTORY_ROW_ID).toBe('__hidden_history__');
  });
});
