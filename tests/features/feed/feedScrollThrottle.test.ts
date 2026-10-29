/**
 * ⚠️ `fs` TİP TANIMI OLMADAN: projede `@types/node` yok (aynı kaçış
 * feedMapExpandState testinde de var).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

/**
 * AKIŞ LİSTESİNİN SCROLL OLAY HIZI — 16, VE 1'E ÇEKİLEMEZ.
 *
 * ── Ne olmuştu ─────────────────────────────────────────────────────────────
 * Kartların üst bantta yapışması scroll olayından türüyor ve 16 (≈60Hz)
 * ProMotion ekranda 120Hz kaydırmanın yarı frekansı. "Daha akıcı olsun" diye
 * uçuş yolunda 1 verildi; şikâyet şu oldu: "sayfa ilk açıldığında kaydırırken
 * header sürekli titriyor."
 *
 * Sebep listede değil BAŞLIKTA: `ScreenHeader`ın bandı kademeli bir blur
 * (MaskedView + BlurView) ve OPAKLIKLA söndürülüyor — `scrollY` [0, 60]
 * aralığında. Alfası değişen bir blur her güncellemede offscreen pass istiyor;
 * olay hızı ikiye katlanınca o pencerede titreme görünür hâle geliyor. Pencere
 * de tam olarak "tepedeyken kaydırmaya başlamak", yani kullanıcının tarifi.
 *
 * ── Neden KAYNAK kuralı olarak test ediliyor ───────────────────────────────
 * Belirti bir render çıktısı değil, cihazda GÖRÜLEN bir derleme yarışı; jest'te
 * üretilemez. Korunan şey de davranış değil YAPI: "bu sayı 16'nın altına
 * inmeyecek". Bir sonraki kişi yapışmayı akıcılaştırmak için buraya ilk
 * bakacak — not burada duruyor.
 */

const PAGE_SOURCE = readFileSync(
  'src/features/feed/components/FeedListPage.tsx',
  'utf8',
);

describe('akış listesinin scroll olay hızı', () => {
  it('16 — koşulsuz, uçuş yolunda bile', () => {
    expect(PAGE_SOURCE).toContain('scrollEventThrottle: 16');
    /**
     * ⚠️ KOŞULLU OLMAMALI: `flight ? 1 : 16` tam olarak geri alınan hâldi.
     * Sayı sayfaya göre ayrılırsa header yalnız bir sekmede titriyor ve sebebi
     * görünmez oluyor.
     */
    expect(PAGE_SOURCE).not.toMatch(/scrollEventThrottle:\s*flight/);
    expect(PAGE_SOURCE).not.toMatch(/scrollEventThrottle:\s*1\b/);
  });

  it('gerekçe DOSYADA duruyor — başlığın blur\'unu adıyla anıyor', () => {
    // Sayıyı değiştirmek isteyen kişi belirtiyi değil SEBEBİ okumalı.
    expect(PAGE_SOURCE).toContain('ScreenHeader');
    expect(PAGE_SOURCE).toContain('titreme');
  });

  /**
   * Başlığın alfayla sönen blur'u DURUYOR ve asıl kırılganlık o: bu test, bir
   * gün o mekanizma değişirse (ör. opaklık yerine ölçek ya da sabit bir zemin)
   * yukarıdaki kuralın gerekçesinin de yeniden okunması gerektiğini söylüyor.
   */
  it('başlığın bandı HÂLÂ opaklıkla sönüyor — kuralın dayanağı bu', () => {
    const HEADER_SOURCE = readFileSync(
      'src/shared/components/ScreenHeader.tsx',
      'utf8',
    );
    expect(HEADER_SOURCE).toContain('const headerBackgroundStyle');
    expect(HEADER_SOURCE).toContain('opacity,');
    expect(HEADER_SOURCE).toContain('<BlurView');
  });
});
