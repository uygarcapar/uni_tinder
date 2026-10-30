import { BaseScreen } from '../base.screen';
import { centerOf, dragBy } from '../../support/driver';

/** `RegisterStep12Screen.tsx` ile AYNI sabitler — ikisi ayrışırsa sürükleme kayar. */
const MIN_CM = 140;
const MAX_CM = 220;
const RANGE = MAX_CM - MIN_CM;
/** Cetvelin yatay iç payı (`sliderWidth - 2 * INSET` kullanılabilir genişlik). */
const INSET = 20;

/**
 * Boy adımı — akıştaki tek SÜRÜKLEMELİ alan.
 *
 * NEDEN ÇÖZÜLEBİLİR: `onPanResponderMove` yalnız `gestureState.dx` okuyup
 * `deltaCm = round(dx / usable * RANGE)` yapıyor. Hız, ivme, momentum YOK —
 * yani istenen cm'ye karşılık gelen dx matematiksel olarak hesaplanabiliyor ve
 * W3C pointer dizisi bunu birebir karşılıyor.
 *
 * NEDEN BLOKAJ DEĞİL: `initialHeight = 170` ve şema onu geçerli sayıyor →
 * kayıt akışı için sürüklemek GEREKMİYOR, "İleri" yeterli. Sürükleme ayrı bir
 * spec'in konusu (15-register-height-ruler).
 */
export class HeightRulerScreen extends BaseScreen {
  readonly root = 'reg-step12-screen';
  readonly name = 'Kayıt · Boy';

  async currentValue(): Promise<number> {
    const text = (await this.el('reg-step12-value').getText()) ?? '';
    const n = parseInt(text.replace(/\D/g, ''), 10);
    if (Number.isNaN(n)) throw new Error(`Boy değeri okunamadı: "${text}"`);
    return n;
  }

  /** Varsayılanı (170) kabul edip ilerler — kayıt akışının meşru yolu. */
  async acceptDefault(): Promise<void> {
    await this.tap('reg-btn-next');
  }

  async next(): Promise<void> {
    await this.tap('reg-btn-next');
  }

  /**
   * Cetveli hedef cm'ye sürükler.
   *
   * ⚠️ KALİBRASYON: RN `onLayout` pt veriyor, WDA da logical koordinat (pt)
   * kullanıyor — eşleşmeleri gerekiyor. İlk gerçek koşuda sapma çıkarsa
   * `usable` buradan ayarlanır; o yüzden sonuç okunup hata mesajına yazılıyor.
   */
  async dragTo(targetCm: number): Promise<number> {
    if (targetCm < MIN_CM || targetCm > MAX_CM) {
      throw new Error(`Hedef boy aralık dışı: ${targetCm} (${MIN_CM}-${MAX_CM})`);
    }
    const ruler = this.el('reg-step12-ruler');
    await ruler.waitForDisplayed({ timeout: 15_000 });

    const { width } = await ruler.getSize();
    const usable = width - INSET * 2;
    const from = await this.currentValue();
    const dx = Math.round(((targetCm - from) / RANGE) * usable);

    await dragBy(await centerOf(ruler), { x: dx, y: 0 });

    const landed = await this.currentValue();
    if (landed !== targetCm) {
      throw new Error(
        `Cetvel hedefe oturmadı: istenen ${targetCm}, gerçekleşen ${landed}.\n` +
          `  genişlik=${width}pt usable=${usable}pt dx=${dx}pt başlangıç=${from}\n` +
          `  (onLayout pt ≟ WDA pt — sapma varsa INSET/usable kalibre edilmeli)`
      );
    }
    return landed;
  }
}

export const heightRuler = new HeightRulerScreen();
