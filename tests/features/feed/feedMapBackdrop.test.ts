/**
 * ⚠️ `fs` TİP TANIMI OLMADAN: projede `@types/node` yok ve `tsconfig.types`
 * yalnız `["jest"]`. `require` jest ortamında çalışıyor (aynı kalıp:
 * feedMapExpandState.test.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

/**
 * HARİTA İKİ SEKMENİN ORTAK ZEMİNİ — pager'ın ARKASINDA.
 *
 * ── Ne olmuştu ─────────────────────────────────────────────────────────────
 * Harita pager'ın İÇİNDE, yalnız Akış sayfasında çiziliyordu. Gönderilerim'e
 * yatay kaydırınca sayfayla birlikte yana gidiyor ve arkada düz `colors.bg`
 * kalıyordu — yani harita ekranın zemini değil, bir sayfanın parçası gibi
 * okunuyordu.
 *
 * ── Kural ──────────────────────────────────────────────────────────────────
 * Harita kök görünümün İLK çocuğu: katman sırası `harita < pager < şerit <
 * perdeler < köşe butonları`. Sayfalar onun üstünden kayıyor, harita yerinde
 * kalıyor ve Gönderilerim'de Akış'takiyle BİREBİR aynı görünüyor.
 *
 * ── Neden KAYNAK kuralı olarak test ediliyor ───────────────────────────────
 * Korunan şey bir render çıktısı değil YAPI: kardeş sırası (z-sırası),
 * zeminlerin şeffaflığı ve haritanın kabının çıplaklığı. Üçü de kaynakta
 * kesin okunuyor; jest'te `PagerView`in native zeminini üretmek mümkün değil.
 */
const SOURCE = readFileSync(
  'src/features/feed/screens/FeedScreen.tsx',
  'utf8',
);

describe('harita iki sekmenin ortak zemini', () => {
  it('PAGER`IN ARKASINDA — sayfanın içinde değil', () => {
    const map = SOURCE.indexOf('{mapHero}');
    const pager = SOURCE.indexOf('<AnimatedPagerView');
    expect(map).toBeGreaterThan(-1);
    expect(map).toBeLessThan(pager);
    expect(SOURCE).not.toContain('key === "feed" ? mapHero : null');
    // ⚠️ `{mapHero}` kalıbı — çıplak "mapHero" gerekçe yorumlarında da geçiyor.
    expect(SOURCE.match(/\{mapHero\}/g)).toHaveLength(1);
  });

  it('PAGER VE SAYFALAR ŞEFFAF — native zemin haritayı örtmesin', () => {
    // ⚠️ Boşluklar normalize ediliyor: iddia prettier'ın satır kırmasına değil
    // prop'ların kendisine bağlı olmalı.
    const flat = SOURCE.replace(/\s+/g, ' ');
    expect(
      flat.match(/style=\{\{ flex: 1, backgroundColor: "transparent" \}\}/g),
    ).toHaveLength(2); // pager + sayfa kabı
    // ⚠️ KAPANIŞ `>`İ İDDİAYA DAHİL DEĞİL: prettier prop'lar satıra sığmayınca
    // onu kendi satırına alıyor ve normalize edilmiş metinde araya boşluk
    // giriyor. İddia prop'ların kendisinde.
    expect(flat).toContain(
      '<View key={key} style={{ flex: 1, backgroundColor: "transparent" }} collapsable={false}',
    );
  });

  it('HARİTA ÇIPLAK KARDEŞ — animasyonlu kap yok, zIndex yok', () => {
    const root = SOURCE.indexOf(
      '<View style={{ flex: 1, backgroundColor: colors.bg }}>',
    );
    expect(root).toBeGreaterThan(-1);
    expect(root).toBeLessThan(SOURCE.indexOf('{mapHero}'));
    // ⚠️ YORUMLAR AYIKLANIYOR: kural KOD hakkında ve haritanın başındaki
    // gerekçe notu iki yasağı da adıyla anıyor ("zIndex sızıntısı").
    // Ayıklanmasa test, kendisini açıklayan yorumu ihlal sayardı.
    const between = SOURCE.slice(root, SOURCE.indexOf('{mapHero}')).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(between).not.toContain('<Animated.View');
    expect(between).not.toContain('zIndex');
  });

  it('LİSTENİN ÖTELEMESİ HÂLÂ AKIŞA ÖZEL', () => {
    expect(SOURCE).toContain('key === "feed" ? listSlideStyle : null');
  });
});
