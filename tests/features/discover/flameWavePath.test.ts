/**
 * Alev dalgasının ÖRTME ANI — kart değişiminin tek saati.
 *
 * Geometri Skia'sız bir modülde duruyor (bkz. flameWavePath'in başlığı) ve iki
 * taraf da onu okuyor: canvas bu sayılarla çiziyor, deste bu sayılarla
 * ilerliyor. Buradaki testler şekli DEĞİL o sözleşmeyi koruyor — `coverMs`
 * değişirse kart değişimi dalganın altından sırıtır.
 */
import {
  COVER_HOLD_LIMIT_MS,
  FLAME_WAVE_MS,
  HOLD_BREATHE_MS,
  flameWaveGeometry,
} from '@/features/discover/components/flameWavePath';

/** Elde bulunan telefon/tablet oranları + iki patolojik uç. */
const SCREENS: Array<[string, number, number]> = [
  ['iPhone SE', 375, 667],
  ['iPhone 15', 393, 852],
  ['iPhone 15 Pro Max', 430, 932],
  ['iPad split', 507, 1024],
  ['iPad tam', 834, 1194],
  ['aşırı uzun', 320, 1600],
  ['aşırı geniş', 1024, 400],
];

describe('flameWaveGeometry · örtme anı', () => {
  it.each(SCREENS)('%s: örtme anı dalganın İÇİNDE', (_name, w, h) => {
    const { coverMs } = flameWaveGeometry(w, h);
    // Dışına taşsa deste hiç ilerlemezdi (canvas o anda çoktan sökülmüş olur).
    expect(coverMs).toBeGreaterThan(0);
    expect(coverMs).toBeLessThanOrEqual(FLAME_WAVE_MS);
  });

  it.each(SCREENS)('%s: park noktası örtme anıyla AYNI', (_name, w, h) => {
    // Süpürme doğrusal (`Easing.linear`), yani ilerlemedeki park noktası
    // doğrudan zamandan geliyor. Canvas bu oranı geometriden okuyor; ikisi
    // ayrışırsa dalga, deste ilerlemeden ÖNCE ya da SONRA park ederdi.
    const { coverMs, coverProgress } = flameWaveGeometry(w, h);
    expect(coverProgress).toBeCloseTo(coverMs / FLAME_WAVE_MS, 10);
    expect(coverProgress).toBeGreaterThan(0);
    expect(coverProgress).toBeLessThanOrEqual(1);
  });

  it.each(SCREENS)(
    '%s: PARKIN NEFESİ KAPLAMANIN DIŞINA TAŞMIYOR',
    (_name, w, h) => {
      // Parkın tek değişmezi bu. Nefes `coverProgress` ile `holdCeilProgress`
      // arasında gidip geliyor; üst uç `uncoverProgress`i geçerse şeridin alt
      // kenarı ekranın dibinden ayrılır ve kart, beklediğimiz anın TAM
      // ORTASINDA açığa çıkar — yani düzeltmeye çalıştığımız bug, üstüne bir de
      // periyodik olarak.
      const { coverProgress, holdCeilProgress, uncoverProgress } =
        flameWaveGeometry(w, h);
      expect(holdCeilProgress).toBeGreaterThanOrEqual(coverProgress);
      expect(holdCeilProgress).toBeLessThanOrEqual(uncoverProgress);
      // Alt uç da kaplamanın içinde: park oradan başlıyor.
      expect(coverProgress).toBeLessThanOrEqual(uncoverProgress);
    },
  );

  it('normal telefonda park GERÇEKTEN nefes alıyor', () => {
    // Üst uç alt uca eşitlenirse park sabit kalır — donuk bir alev, tam da JS
    // tıkandığı anda (bkz. FlameWaveLayer'daki duraklatma notu). Dejenere
    // ekranlarda bu kabul; elde bulunan bir telefonda DEĞİL.
    const { coverProgress, holdCeilProgress } = flameWaveGeometry(393, 852);
    expect(holdCeilProgress).toBeGreaterThan(coverProgress);
  });

  it('örtme anı dalganın İLK yarısında — değişime pay kalıyor', () => {
    // Pencere, kesintisiz şeridin üst kenarının ekranın tepesini geçtiği anda
    // açılıyor; şerit ekrandan ~1.35 kat kalın olduğu için o an yolun başlarına
    // düşüyor. Yarıyı geçse park etmeden değişime kalan süre erir.
    const { coverMs } = flameWaveGeometry(393, 852);
    expect(coverMs).toBeLessThan(FLAME_WAVE_MS / 2);
  });

  it('uzun ekran: pencere daralsa bile örtme anı EN KAPALI yere nişan alıyor', () => {
    // Aşırı uzun ekranda şerit ekranı ya hiç tam kapatamıyor ya da göz açıp
    // kapayıncaya kadar kapatıyor; o dalda sabit pay yerine pencerenin ORTASI
    // seçiliyor. Ölçtüğümüz şey dalın hâlâ makul bir an üretmesi.
    const { coverMs } = flameWaveGeometry(320, 2400);
    expect(coverMs).toBeGreaterThan(0);
    expect(coverMs).toBeLessThan(FLAME_WAVE_MS);
  });

  it('emniyet valfi TAVAN DEĞİL — normal yolun kat kat üstünde', () => {
    // Park artık tavansız (istek): "her şey render olana kadar beklesin".
    // Bu sayı bir ürün kararı değil, ekranı sonsuza kadar kaplı bırakmamanın
    // son durağı — yani normal beklemeden (iki kare + bir decode turu) belirgin
    // biçimde UZUN olmak zorunda. Dalganın kendi süresinden kısa olması, valfi
    // fiilen tavana çevirirdi.
    expect(COVER_HOLD_LIMIT_MS).toBeGreaterThan(FLAME_WAVE_MS);
  });

  it('nefes periyodu parkı dolduracak kadar kısa', () => {
    // Nefes `withRepeat(..., -1, true)` ile sonsuz dönüyor, yani periyot parkın
    // uzunluğunu sınırlamıyor — ama bir tur valfin yanında uzun kalırsa
    // kullanıcı "duran bir alev" görür, canlılık kaybolur.
    expect(HOLD_BREATHE_MS).toBeGreaterThan(0);
    expect(HOLD_BREATHE_MS).toBeLessThan(COVER_HOLD_LIMIT_MS / 4);
  });
});
