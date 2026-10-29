/**
 * ⚠️ `fs` TİP TANIMI OLMADAN — projede `@types/node` yok (kardeş testlerle
 * aynı kaçış).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

/**
 * ÇEKME MESAFESİ: `progressViewOffset` ÇARKIN YERİ DEĞİL, EŞİĞİN DE YERİ.
 *
 * ── Ne olmuştu ─────────────────────────────────────────────────────────────
 * Şikâyet üç turdur aynı: "çok fazla aşağı çekmem gerekiyor". İki kez
 * `refreshOffset` prop'u suçlanıp kaldırıldı ama aynı tuzağın küçük sürümü
 * kaldı: `progressViewOffset={insets.top + SCREEN_HEADER_TITLE_HEIGHT}`
 * (çentikli bir iPhone'da ≈109).
 *
 * ── Kök neden (RN kaynağından, hafızadan değil) ────────────────────────────
 * `RCTRefreshControl.m > _applyProgressViewOffset`:
 *
 *     if (_progressViewOffset == 0.f) { return; }
 *     ...
 *     self.frame = CGRectOffset(self.frame, 0, converted.y);
 *
 * Yani sayı kontrolün FRAME'ini aşağı itiyor. `UIRefreshControl` tetikleme
 * eşiğini kendi frame'ine göre ölçtüğü için 109pt aşağı itilen kontrol 109pt
 * FAZLA çekme istiyor. RN'in kendi yorumu da uyarıyor: frame'i elle vermek
 * scroll view'ın contentInset entegrasyonunu BOZUYOR.
 *
 * Tek knob iki iş yapıyordu — çarkın yeri ve eşik. "Çark görünsün" demek
 * zorunlu olarak "daha çok çek" demekti.
 *
 * ── Kural ──────────────────────────────────────────────────────────────────
 * İki iş AYRILDI: eşik native'de (offset verilmiyor), çarkı KENDİMİZ
 * çiziyoruz — native çark şeffaf, görünen gösterge mutlak konumlu ve
 * başlığın altında.
 *
 * ── Neden KAYNAK kuralı olarak test ediliyor ───────────────────────────────
 * Eşik `UIRefreshControl`ün içinde; jest'te ne frame'i ne de jesti
 * üretebiliyoruz. Korunan şey davranış değil YAPI: "bu prop geri gelmeyecek".
 */
const SOURCE = readFileSync(
  'src/features/feed/components/FeedListPage.tsx',
  'utf8',
);

describe('akışta çekme mesafesi', () => {
  it('EŞİĞİ İTEN PROP YOK — `progressViewOffset` geri gelmeyecek', () => {
    // ⚠️ METİN DEĞİL KULLANIM: ad gerekçe yorumunda anılıyor, JSX'te geçmemeli.
    expect(SOURCE).not.toMatch(/^\s*progressViewOffset=/m);
    expect(SOURCE).not.toMatch(/^\s*refreshOffset=/m);
  });

  it('NATİVE ÇARK GÖRÜNMEZ — yerini kendi göstergemiz alıyor', () => {
    // Native çark offset'siz hâlde scroll view'ın tepesinde, yani durum
    // çubuğunun ALTINDA doğuyor; görünür bırakılırsa oradan yanıp sönüyor.
    expect(SOURCE).toContain('tintColor="transparent"');
    expect(SOURCE).toContain('colors={["transparent"]}');
  });

  it('KENDİ GÖSTERGEMİZ VAR — mutlak konumlu, çekerken de tepki veriyor', () => {
    expect(SOURCE).toContain('<FeedRefreshSpinner');
    // Çekme sırasında (henüz tetiklenmeden) görünür olmalı: opaklık
    // `scrollY`nin NEGATİF değerinden türüyor.
    expect(SOURCE).toContain('function FeedRefreshSpinner');
    expect(SOURCE).toMatch(/-scrollY\.value/);
  });
});
