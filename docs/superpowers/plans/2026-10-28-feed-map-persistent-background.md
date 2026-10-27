# Akışta kalıcı harita zemini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kampüs haritası, Akış ve Gönderilerim sekmelerinin ortak ve sabit zemini olsun; sayfalar onun üstünden kaysın.

**Architecture:** `mapHero` pager'ın içinden çıkıp kök `View`in ilk çocuğu olur (katman sırası `harita < pager < şerit < perdeler < köşe butonları`). Pager ve iki sayfa kabı açıkça şeffaf zemin alır, yoksa `AnimatedPagerView`in native sayfa denetleyicisi haritayı örter. Tam ekran harita akışı ve `listSlideStyle`ın Akış'a özel kalması değişmez.

**Tech Stack:** React Native, react-native-pager-view, Reanimated, Jest (kaynak-okuyan yapısal testler).

**Spec:** [docs/superpowers/specs/2026-10-28-feed-map-persistent-background-design.md](../specs/2026-10-28-feed-map-persistent-background-design.md)

## Global Constraints

- Haritanın yeni kabı **transformsuz ve tam opak** olmalı — ata zincirinde `opacity < 1` ya da kimliksel olmayan transform gören SwiftUI camı (köşe butonları) sessizce hiç render edilmiyor.
- Haritaya ya da kök görünümün çocuklarına **`zIndex` verilmez** — kardeş sırası z-sırasını belirliyor (proje notu: zIndex sızıntısı).
- Sayfa kapları `collapsable={false}` kalır — stili yalnız `flex: 1` olan `View` native ağaçta düzleşiyor.
- Gönderilerim'de harita **Akış'takiyle birebir aynı** görünür: sekmeye özel soluklaştırma, ikinci kadraj ya da ayrı görünüm yok.
- Jest **node@24** ister (better-sqlite3 ABI); node 20'de çıktısız SIGSEGV verir.

## Review Focus

- **Pager'ın native zemini** (iOS/Android): şeffaflık verilmezse harita hiç görünmez — Task 1 pager ve iki sayfa kabı için `backgroundColor: "transparent"` pinler.
- **Cam köşe butonlarının kaybolması:** harita animasyonlu/opaklığı değişen bir kaba sarılırsa butonlar sessizce çizilmez — Task 1 haritanın kök `View`in doğrudan çocuğu olduğunu ve `Animated.View`e sarılmadığını pinler.
- **Harita örneğinin ikizlenmesi:** koşul kaldırılırken `mapHero` iki yere düşerse iki Mapbox+Skia katmanı doğar — Task 1 kaynakta tam bir kullanım olduğunu pinler.
- **Tam ekran haritada Gönderilerim'in listesi:** `listSlideStyle` yanlışlıkla iki sayfaya verilirse Gönderilerim ekran dışına ötelenir — Task 1 kapının Akış'a özel kaldığını pinler.
- **Haritanın altındaki taban:** kök `colors.bg` düşerse harita yüklenene kadar ekran saydam/siyah kalır — Task 1 kökün zeminini pinler.

---

### Task 1: Haritayı pager'ın arkasına taşı

**Files:**
- Create: `tests/features/feed/feedMapBackdrop.test.ts`
- Modify: `src/features/feed/screens/FeedScreen.tsx:2391-2441`

**Interfaces:**
- Consumes: `mapHero` (aynı dosyada tanımlı JSX değişkeni, `<FeedMapStrip …/>`; kökü `StyleSheet.absoluteFill`, sarmalayıcı istemiyor), `listSlideStyle`, `PAGES`.
- Produces: yok — ekran-içi yapısal değişiklik.

- [ ] **Step 1: Write the failing test**

`tests/features/feed/feedMapBackdrop.test.ts`. Dosyanın başında, kardeşi `feedMapExpandState.test.ts`teki gibi `require('fs')` ile kaynağı oku:

```ts
const SOURCE = readFileSync('src/features/feed/screens/FeedScreen.tsx', 'utf8');

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
    expect(flat).toContain(
      '<View key={key} style={{ flex: 1, backgroundColor: "transparent" }} collapsable={false}>',
    );
  });

  it('HARİTA ÇIPLAK KARDEŞ — animasyonlu kap yok, zIndex yok', () => {
    const root = SOURCE.indexOf('<View style={{ flex: 1, backgroundColor: colors.bg }}>');
    expect(root).toBeGreaterThan(-1);
    expect(root).toBeLessThan(SOURCE.indexOf('{mapHero}'));
    const between = SOURCE.slice(root, SOURCE.indexOf('{mapHero}'));
    expect(between).not.toContain('<Animated.View');
    expect(between).not.toContain('zIndex');
  });

  it('LİSTENİN ÖTELEMESİ HÂLÂ AKIŞA ÖZEL', () => {
    expect(SOURCE).toContain('key === "feed" ? listSlideStyle : null');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/feed/feedMapBackdrop.test.ts`
Expected: FAIL — "PAGER`IN ARKASINDA" ve "PAGER VE SAYFALAR ŞEFFAF" kırmızı (harita hâlâ sayfanın içinde, zeminler şeffaf değil).

- [ ] **Step 3: Taşı ve şeffaflaştır (`FeedScreen.tsx:2391-2441`)**

- `{key === "feed" ? mapHero : null}` satırını sayfa kabından sil; `{mapHero}` kök `View`in **ilk** çocuğu olsun, `<AnimatedPagerView`ten hemen önce.
- `AnimatedPagerView`in `style`ı → `{ flex: 1, backgroundColor: "transparent" }`.
- Sayfa kabı → `style={{ flex: 1, backgroundColor: "transparent" }}`, `collapsable={false}` durur.
- `listSlideStyle` sarmalayıcısı aynen kalır.

- [ ] **Step 4: Yorumları güncelle**

- Sayfa kabındaki eski "⚠️ PAGER'IN DIŞINA DEĞİL, SAYFANIN İÇİNE konuyor" notu **silinir** — artık tersi geçerli ve bırakılırsa bir sonraki okuyan değişikliği geri alır. Yerine haritanın yeni konumunda, reddin neden kalktığını (iki sekmenin ortak zemini) ve şeffaf zeminin neyi taşıdığını (pager'ın native zemini haritayı örter) yazan bir not.
- `mapHero`nun tanımındaki "Yalnız AKIŞ sekmesinde: Gönderilerim kampüs filtresi taşımıyor, harita da bir kampüs göstergesi." cümlesi de **düşer** — kullanıcı kararı bunun tersi.

- [ ] **Step 5: Run tests + type check**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/feed && npm run type-check`
Expected: yeni dosya PASS, `feedMapExpandState.test.ts` dahil mevcut akış testleri PASS, tsc temiz.

- [ ] **Step 6: Commit**

```bash
git add tests/features/feed/feedMapBackdrop.test.ts src/features/feed/screens/FeedScreen.tsx docs/superpowers/specs/2026-10-28-feed-map-persistent-background-design.md docs/superpowers/plans/2026-10-28-feed-map-persistent-background.md
git commit -m "feat(feed): harita iki sekmenin ortak zemini"
```

- [ ] **Step 7: Cihaz doğrulaması (manuel — testlerin ulaşamadığı yer)**

Akış ↔ Gönderilerim arasında **yavaş** kaydır ve şunları gör: harita hiç kıpırdamıyor; Gönderilerim'de harita Akış'takiyle aynı; köşe cam butonları ve sekme şeridi iki sekmede de çiziliyor; tam ekran harita açılıp kapanıyor. Biri tutmazsa düzeltmeden tamamlandı deme.
