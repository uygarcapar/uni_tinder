/**
 * ⚠️ `fs`/`path` TİP TANIMI OLMADAN: projede `@types/node` yok ve
 * `tsconfig.types` yalnız `["jest"]`. `require` jest ortamında çalışıyor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

/**
 * TAM EKRAN HARİTANIN MANTIKSAL DURUMU ANİMASYON CALLBACK'İNE BAĞLANAMAZ.
 *
 * ── Ne olmuştu ─────────────────────────────────────────────────────────────
 * `mapExpanded` tek bir state'ti ve kapanışta YALNIZ animasyon tamamlanırsa
 * `false` oluyordu:
 *
 *     mapProgress.value = withTiming(0, …, (finished) => {
 *       if (finished) runOnJS(setMapExpanded)(false);
 *     });
 *
 * Reanimated bir animasyonun ÜZERİNE yazıldığında eskisinin callback'ini
 * `finished: false` ile çağırıyor. Yani kapanış kesilirse — X'e iki kez
 * basmak, kapanırken banda dokunmak — bayrak `true` KİLİTLENİYOR. O bayrak üç
 * şeyi birden sürüyordu: anlar sheet'inin görünürlüğü, pager'ın yatay jest
 * kilidi ve FAB'ın gizlenmesi. Sonuç: harita kapalı ama modal ekranda, sayfa
 * kaydırması kilitli ve paylaş butonu yok.
 *
 * Kullanıcının tarifi birebir buydu: "bazen basınca map expanded olmuyor ama
 * modal geliyor".
 *
 * ── Kural ──────────────────────────────────────────────────────────────────
 * Mantıksal durum (`mapExpanded`) animasyondan BAĞIMSIZ, anında dönüyor.
 * Animasyona bağlı olan tek şey cam butonların (X ve "+") geciken unmount'u
 * (`mapChromeMounted`) — o kaybolursa bedeli bir butonun fazladan durması,
 * kilitlenmiş bir ekran değil.
 *
 * ── Neden KAYNAK kuralı olarak test ediliyor ───────────────────────────────
 * Hata bir render çıktısı değil, bir ZAMANLAMA yarışı: `withTiming`in
 * kesilmesini jest'te üretmek Reanimated'ın gerçek UI runtime'ını ister.
 * Korunması gereken şey de davranış değil YAPI — "bu setState o callback'in
 * içinde olmayacak". Kaynak okumak bunu kesin söylüyor.
 */

import {
  MAP_MOTION_MS,
  MAP_POLYGON_DRAW_MS,
} from '@/features/feed/components/feedMapMotion';

const SOURCE = readFileSync(
  'src/features/feed/screens/FeedScreen.tsx',
  'utf8',
);
const STRIP_SOURCE = readFileSync(
  'src/features/campus/components/CampusMomentsStrip.tsx',
  'utf8',
);
const CARD_SOURCE = readFileSync(
  'src/features/campus/components/CampusMomentCard.tsx',
  'utf8',
);
const OVERLAY_SOURCE = readFileSync(
  'src/features/campus/components/CampusMomentExpandOverlay.tsx',
  'utf8',
);
/**
 * ⚠️ `STRIP_SOURCE` TAM EKRANIN ŞERİDİ (CampusMomentsStrip). Haritanın kendi
 * katmanı ve bandın uçuşan kareleri AYRI dosyalar — ikisi de aşağıda ayrı
 * sabitlerde. Yanlış sabite bakan bir `toContain` sessizce geçmez, ama
 * sessizce YANLIŞ ŞEYİ çiviler.
 */
const MAP_SOURCE = readFileSync(
  'src/features/feed/components/FeedMapStrip.tsx',
  'utf8',
);
/**
 * ⚠️ `BAND_SOURCE` KALDIRILDI: bandın sağ yarısındaki süzülen kareler
 * (`FeedBandMoments`) dosyasıyla birlikte silindi (istek). Yerine gelen üçlü
 * deste `PEEK_SOURCE`ta.
 */
const PEEK_SOURCE = readFileSync(
  'src/features/feed/components/FeedMomentsPeek.tsx',
  'utf8',
);

/** `collapseMap` gövdesi — tanımından bir sonraki `useCallback`a kadar. */
const collapseBody = (() => {
  const start = SOURCE.indexOf('const collapseMap = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('useAnimatedStyle', start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
})();

describe('tam ekran harita durumu', () => {
  it('kapanış mantıksal durumu ANINDA düşürüyor', () => {
    expect(collapseBody).toContain('setMapExpanded(false)');
    // ⚠️ withTiming'DEN ÖNCE: callback'in içinde olsaydı kesilen animasyonda
    // hiç çalışmazdı.
    expect(collapseBody.indexOf('setMapExpanded(false)')).toBeLessThan(
      collapseBody.indexOf('withTiming('),
    );
  });

  it('`if (finished)` dalı mantıksal duruma DOKUNMUYOR', () => {
    const branch = collapseBody.slice(collapseBody.indexOf('if (finished)'));
    expect(branch).not.toContain('setMapExpanded');
    // Yalnız cam butonların geciken unmount'u burada.
    expect(branch).toContain('finishMapCollapse');
  });

  it('geciken unmount KUŞAK numarasıyla korunuyor', () => {
    // Bayat bir callback yeni açılışın butonlarını sökmesin: kapanış biterken
    // bant zaten görünür oluyor ve kullanıcı oraya tekrar dokunabiliyor.
    expect(collapseBody).toContain('mapGenRef.current += 1');
    const guard = SOURCE.slice(SOURCE.indexOf('const finishMapCollapse'));
    expect(guard).toContain('if (gen !== mapGenRef.current) return;');
  });

  it('açılış da kuşağı ilerletiyor — bekleyen kapanış callback\'i yutuluyor', () => {
    const expandBody = SOURCE.slice(
      SOURCE.indexOf('const expandMap = useCallback('),
      SOURCE.indexOf('expandMapRef.current = expandMap'),
    );
    expect(expandBody).toContain('mapGenRef.current += 1');
    expect(expandBody).toContain('setMapExpanded(true)');
    expect(expandBody).toContain('setMapChromeMounted(true)');
  });

  // ── Hangi tüketici hangi bayrağı okuyor ─────────────────────────────────

  it('anlar ŞERİDİ GECİKEN kapıyı okuyor', () => {
    // ⚠️ MANTIKSAL durumu okumuyor, bilerek: o kapanışın BAŞINDA düşüyor ve
    // şerit o anda sökülse kapanış animasyonu boyunca ekranda olmayan bir
    // yerden kaymış gibi görünürdü. Modal döneminde tersi doğruydu (asılı
    // kalan bir sheet riski) — yüzey artık haritanın kardeşi.
    expect(SOURCE).toContain('{mapChromeMounted && campus.available ? (');
  });

  it('pager kilidi MANTIKSAL durumu okuyor', () => {
    // Kilit bir animasyon callback'ine bağlanamaz — kalıcı kilitlenme riski.
    expect(SOURCE).toContain('scrollEnabled={!mapExpanded}');
  });

  it('cam butonlar HİÇ SÖKÜLMÜYOR — köşeler mount kapısı okumuyor', () => {
    /**
     * ⚠️🔴 BU KAPI TAMAMEN KALKTI (istek: "butonlar değişsin, şu anda yok olup
     * baştan çiziliyor").
     *
     * Tarihçe: akışın filtre/kalem ikilisi `ScreenHeader`ın içindeydi ve
     * `!mapChromeMounted` kapısıyla harita açılırken SÖKÜLÜYORDU (şerit
     * ötelendiği için cam ata transformu kimliksizdi); haritanın X/artı
     * ikilisi ise `mapChromeReady` ile AÇILIŞ BİTTİKTEN SONRA sıfırdan mount
     * ediliyordu (`Host` kurulumu geçişin karesine düşüp parmak altında
     * takılma yapmasın diye). İkisi birlikte köşeleri ~280ms boşaltıyordu.
     *
     * Artık tek ve KALICI bir satır var; değişen yalnız sembol ve aksiyon.
     * Geçişin karesinde kurulan `Host` olmadığı için geciken kapıya da gerek
     * kalmadı — bayrak koduyla birlikte silindi.
     */
    // ⚠️ METİN DEĞİL KULLANIM: bayrağın adı iki notta anılmaya devam ediyor
    // (projenin kuralı — kaldırmanın gerekçesi orada yazılı), o yüzden
    // TERS TIRNAK İÇİNDE OLMAYAN bir geçiş aranıyor.
    expect(SOURCE).not.toMatch(/[^`]mapChromeReady/);
    // Satır bir kapının ARDINDA DEĞİL: `mapExpanded` yalnız sembolü seçiyor.
    expect(SOURCE).toContain(
      'systemName={mapExpanded ? "xmark" : "slider.horizontal.3"}',
    );
    expect(SOURCE).toContain('onPress={mapExpanded ? collapseMap : openFilter}');
    // Cam kuralı yapısal: kap transformsuz ve opaklığı animasyonlanmıyor.
    const row = SOURCE.slice(SOURCE.indexOf('── ÜST KÖŞE BUTONLARI'));
    const rowBlock = row.slice(0, row.indexOf('KAMPÜS ANLARI ŞERİDİ'));
    expect(rowBlock).not.toContain('<Animated.View\n        style={[\n          {');
    expect(rowBlock).not.toContain('translateY');
  });

  it('sembol DEVREDİLİYOR — native çapraz sönüm anahtarı veriliyor', () => {
    /**
     * Glif native bir SwiftUI `Image` ve sembol adı bir PROP — Reanimated'in
     * dokunabileceği bir yüzey yok. Devri SwiftUI'ın kendi
     * `.animation(_:value:)`i sürüyor ve o modifier yalnız number/boolean
     * alıyor, yani sembol adı anahtar olarak geçemiyor → `symbolPhase`.
     *
     * ⚠️ İKİ BUTON DA anahtarı vermek zorunda: biri verilmezse o köşe
     * sembolünü anında takas eder ve iki köşe farklı anlarda değişir.
     */
    expect(SOURCE).toMatch(/symbolPhase=\{mapExpanded \? 1 : 0\}[\s\S]*symbolPhase=\{mapExpanded \? 1 : 0\}/);
    const BUTTON_SOURCE = readFileSync(
      'src/features/discover/components/DiscoverHeaderGlassButton.tsx',
      'utf8',
    );
    // Sembolün geçişi `contentTransition`dan, süresi `animation`dan.
    expect(BUTTON_SOURCE).toContain('contentTransition("opacity")');
    expect(BUTTON_SOURCE).toContain('animKey');
    // ⚠️ SIRA: `contentTransition` animasyondan ÖNCE (SwiftUI'da daha içte),
    // yoksa değişen içerik animasyonun kapsamına girmeden takas edilir.
    expect(BUTTON_SOURCE.indexOf('contentTransition("opacity")')).toBeLessThan(
      BUTTON_SOURCE.indexOf('animation(\n                  Animation.easeOut('),
    );
  });

  it('başlık KALICI SATIRIN ortasında ve sekmelerin hizasında', () => {
    /**
     * ⚠️ SATIRIN KONUMU ARTIK `ScreenHeader`IN BUTON YUVASINDAN: `insets.top`
     * + 50'lik satır. Eskiden haritanın kendi satırı 5pt aşağıdaydı
     * (`CAMPUS_MAP_CHROME_TOP`) ve o sayı yalnız PERDENİN boyunu besliyor —
     * butonlar sekme şeridiyle aynı merkezde durmak zorunda, çünkü biri
     * diğerinin yerine geçiyor.
     */
    expect(SOURCE).toContain('top: insets.top,');
    expect(SOURCE).toContain('height: SCREEN_HEADER_TITLE_HEIGHT,');
    expect(SOURCE).not.toMatch(/CAMPUS_MAP_CHROME_(TOP|ROW)[,\n ]*$/m);
    expect(SOURCE).toContain('<CampusMapTitle');
    // ⚠️ MUTLAK ORTALAMA: etiket satırın AKIŞINA girerse butonların genişliği
    // onu merkezden kaydırır (Keşif başlığındaki aynı kalıp).
    const titleBlock = SOURCE.slice(
      SOURCE.indexOf('{campus.available ? ('),
      SOURCE.indexOf('<CampusMapTitle'),
    );
    expect(titleBlock).toContain('position: "absolute"');
    expect(titleBlock).toContain('alignItems: "center"');
    // ⚠️ Kap `box-none`: tam genişlikte bir satır haritanın üstündeki her
    // dokunuşu yutardı, kontroller ise dokunuşu almaya devam etmeli.
    expect(SOURCE).toContain('pointerEvents="box-none"');
    // Perde kendi formülünden — bant kısalırsa yazı çıplak haritada kalır.
    expect(SOURCE).toContain('campusMapTopScrimHeight(insets.top)');
  });

  it('sağ köşe TEK ELEMAN, iki aksiyon — ölü buton çizilmiyor', () => {
    /**
     * ⚠️ PROPS ÖNCEDEN HESAPLANIYOR (`rightCorner`), iki JSX dalı DEĞİL: iki
     * ayrı dal kolayca iki ayrı JSX konumuna kayıyor ve React o anda butonu
     * unmount edip yeniden mount ediyor — cam bir `Host`u geçişin ortasında
     * yeniden kurmak tam olarak kaçınılan şey.
     *
     * ⚠️ TEK İSTİSNA `canShare`: haritada paylaşım hakkı yoksa köşe BOŞ
     * (kampüs dışındasın / bugün paylaştın / özellik kapalı). Basınca
     * sunucunun reddettiği bir artı kullanıcıyı her seferinde kandırırdı.
     */
    expect(SOURCE).toContain('const rightCorner = mapExpanded');
    expect(SOURCE).toContain('? campus.canShare');
    expect(SOURCE).toContain('systemName: "plus" as const');
    expect(SOURCE).toContain('systemName: "square.and.pencil" as const');
    // ⚠️ KAYNAK SHEET'İ DEĞİL, DOĞRUDAN KAMERA (istek): "galeri filan
    // sunmasın". Ekranda `PhotoSourceSheet` artık hiç mount edilmiyor.
    expect(SOURCE).toContain('onPress: campus.captureMoment');
    expect(SOURCE).not.toMatch(/<PhotoSourceSheet/);
    const row = SOURCE.slice(SOURCE.indexOf('── ÜST KÖŞE BUTONLARI'));
    const rowBlock = row.slice(0, row.indexOf('KAMPÜS ANLARI ŞERİDİ'));
    // Pill'in kendisi bu satırdan gitti: "Daha fazla paylaş" hâlâ var ama
    // chrome'un kendi aksiyon yuvasında (akıştaki Plus upsell'i), köşede değil.
    expect(rowBlock).not.toContain('t("feed.header.plusAction")');
    // `DiscoverHeaderGlassButton` satırda İKİ kez — daha fazlası dallanmaya
    // (ve unmount'a) dönmüş olduğunun işareti.
    expect(rowBlock.match(/<DiscoverHeaderGlassButton/g)).toHaveLength(2);
  });

  it('alt perdenin SÖNÜMÜ ÖLÇÜDEN türüyor — dipten yukarı azalıyor', () => {
    /**
     * ⚠️ SABİT SAYI DEĞİL (istek: "progressive olsun, gittikçe azalsın").
     * İki sabit denendi: bandın yarısı başlığı çıplak bırakıyordu, 32pt ise
     * perdeyi başlığın tepesine kadar tam güçte getirip orada kesiyordu.
     * Sönüm artık başlık satırı + kutuların üst yarısı kadar ve kutu boyu
     * ekranla büyüdüğü için ölçüye bağlı olmak zorunda.
     */
    expect(SOURCE).toContain('fadePx={campusStripScrimFade(windowHeight)}');
    expect(SOURCE).not.toContain('CAMPUS_STRIP_SCRIM_FADE');
  });

  it('BAŞLIĞIN CAM BUTONLARI GECİKEN kapıyı okuyor', () => {
    /**
     * ⚠️ BU TEST FAB'DAN DEVRALDI: sağ alttaki yuvarlak paylaş butonu
     * kaldırıldı (composer'ın girişi başlığın sağ üstündeki kalem oldu) ama
     * kuralın kendisi aynı kapıya taşındı — ve orada DAHA SERT bir gerekçesi
     * var: butonlar SwiftUI camı ve ata zincirinde kimliksel olmayan bir
     * transform gören cam sessizce hiç render edilmiyor. Başlık tam ekran
     * haritada ÖTELENİYOR, yani geçiş boyunca ata transformu kimliksiz.
     *
     * Mantıksal durum (`mapExpanded`) kapanışın BAŞINDA düşüyor; butonlar onu
     * okusa öteleme hâlâ kimliksizken doğarlardı.
     */
    // ⚠️ KAPI KALKTI, SATIR ŞERİTTEN ÇIKTI: butonlar artık `ScreenHeader`ın
    // yuvalarında DEĞİL (şerit ötelendiği için cam orada yaşayamıyor) —
    // ötelenmeyen kardeş bir satırda duruyorlar ve sökülmüyorlar. Gerekçenin
    // tamamı "cam butonlar HİÇ SÖKÜLMÜYOR" testinde.
    expect(SOURCE).not.toMatch(/leftButton=\{/);
    expect(SOURCE).not.toMatch(/rightButton=\{/);
    // Kalem composer'ı, slider filtre sheet'ini açıyor — ikisi de MEVCUT yol.
    expect(SOURCE).toContain('onPress: openComposer');
    expect(SOURCE).toContain('const openFilter = useCallback(() => setFilterVisible(true), []);');
    // Şerit ORTADA (Profil'in düzeni), sola hizalı inset gitti.
    expect(SOURCE).toContain('centered\n            />');
    // FAB tamamen gitti: ikinci bir composer girişi kalmadı.
    // ⚠️ METİN DEĞİL KULLANIM: ölçüleri geri koyacak olan için adı iki notta
    // anılmaya devam ediyor (projenin kuralı).
    expect(SOURCE).not.toMatch(/width: FAB_SIZE/);
    expect(SOURCE).not.toMatch(/const FAB_SIZE =/);
  });
});

/**
 * HARİTA VE ANLAR ŞERİDİ — EŞZAMANLILIK ARTIK YAPISAL.
 *
 * Şerit bir zamanlar gorhom `BottomSheetModal`ıydı ve iki ayrı kütüphane iki
 * ayrı animasyon sürüyordu; hizalamak için gorhom'un yayını timing'e çevirmek,
 * yön başına config vermek, `present()` ertelemesini sıfırlamak ve kapı
 * sorgusunu ısıtmak gerekti. Modal kaldırıldı (bazen HİÇ AÇILMIYORDU) ve şerit
 * doğrudan `mapProgress`i okuyor: tek değer, tek animasyon, ayrışma imkânsız.
 */
describe('harita + şerit eşzamanlılığı', () => {
  it('şerit EKRANIN sürdüğü bir değeri okuyor — kendi zamanlaması YOK', () => {
    /**
     * ⚠️ ARTIK `mapStripEntry` (istek): kutular ne çekmeye ne haritanın
     * hareketine bağlı — harita tam ekrana oturduktan SONRA kendi eğrisiyle
     * aşağıdan geliyorlar. Değer yine EKRANDA sürülüyor, yani şeridin içinde
     * ikinci bir zamanlama kaynağı yok.
     */
    expect(SOURCE).toContain('progress={mapStripEntry}');
    // Şeridin içinde ikinci bir zamanlama kaynağı olmamalı: `withTiming`/
    // `withSpring` görünürse eşzamanlılık yine ayara dönmüş olur.
    expect(STRIP_SOURCE).not.toMatch(/withTiming|withSpring/);
    expect(STRIP_SOURCE).toContain('(1 - progress.value) * stripHeight');
  });

  it('gorhom bu yüzeyden TAMAMEN çıktı', () => {
    // ⚠️ Metin değil IMPORT aranıyor: dosyanın başındaki gerekçe bölümü
    // modalın adını zaten anıyor ("burada bir modal vardı") ve anmaya devam
    // etmeli — kaldırılmasının sebebi orada yazılı.
    expect(STRIP_SOURCE).not.toMatch(/^import .*AppBottomSheet/m);
    expect(STRIP_SOURCE).not.toMatch(/^import .*@gorhom/m);
    // Hareketin sayıları ekranda değil, tek kaynakta.
    expect(STRIP_SOURCE).not.toMatch(/duration:\s*\d/);
  });

  it('süreler ekranda ELLE yazılmıyor', () => {
    // ⚠️ Bölge `expandMap`ten `listSlideStyle`a: ikinci argüman arama
    // OFSETİYLE bulunmak zorunda, yoksa dosyanın başındaki başka bir eşleşmeye
    // düşüp boş dilim veriyor (bu test ilk yazıldığında tam o oldu).
    const start = SOURCE.indexOf('const expandMap = useCallback(');
    const region = SOURCE.slice(
      start,
      SOURCE.indexOf('const listSlideStyle', start),
    );
    expect(region.length).toBeGreaterThan(0);
    expect(region).toContain('MAP_MOTION_MS');
    // Eski hâli: `duration: 340` / `duration: 280`.
    expect(region).not.toMatch(/duration:\s*\d/);
  });

  it('KARTTA KARAR ÇİFTİ YOK — dokunuş kartı BÜYÜTÜYOR', () => {
    /**
     * ⚠️ BU KURAL TERSİNE DÖNDÜ (istek: "tik ve x'i kaldır, direkt basınca
     * userin profiline gitsin"). Eski hâli: fotoğrafın sağ altında cam tik/X
     * ve onların MOUNT KAPISI (`actionsReady`) — animasyonlu bir atanın
     * altında doğan cam sessizce hiç çizilmediği için şerit yerine oturmadan
     * mount edilemiyorlardı.
     *
     * Butonlar kalkınca kapının müşterisi de kalmadı; üç dosyadan birlikte
     * silindi. Camın kuralı değişmedi — şeride cam bir yüzey geri eklenirse
     * kapı da geri gelmeli (gerekçeler yorumlarda duruyor, o yüzden METİN
     * değil KULLANIM aranıyor).
     */
    // ⚠️ METİN DEĞİL KULLANIM: kartın `Host` notu `CardActionGlassButton`ın
    // "sabit ölçü" kuralına atıf yapıyor ve yapmaya devam etmeli.
    expect(CARD_SOURCE).not.toMatch(/actionsReady[?:,=}]/);
    expect(CARD_SOURCE).not.toMatch(/<CardActionGlassButton/);
    expect(CARD_SOURCE).not.toMatch(/^import .*CardActionGlassButton/m);
    expect(STRIP_SOURCE).not.toMatch(/actionsReady[?:,=}]/);
    expect(SOURCE).not.toMatch(/mapActionsReady[?:,=)]/);

    // Kararın yeni yolu: kart dokunuşu → şerit → ekran → BÜYÜYEN KART.
    // ⚠️ Dokunuş artık ölçüm yapıyor: kart kendi penceresini ölçüp anla
    // BİRLİKTE yukarı veriyor (büyüme o kareden başlıyor).
    expect(CARD_SOURCE).toContain('onPress={onPress ? handlePress : undefined}');
    expect(CARD_SOURCE).toContain('measureInWindow');
    // ⚠️ KAPI ŞERİTTE DEĞİL: kendi anım da büyüyor, karar butonu overlay'de
    // `isMine` ile kesiliyor.
    expect(STRIP_SOURCE).toContain('onPress={onOpenCard}');
    // ⚠️ `shown` → `moment`: hareketi taşıyan yüzey ayrı bir çocuk bileşene
    // taşındı (`ExpandedSurface`) ve dondurma/çözme işi DIŞTA kaldı, yani
    // çocuk zaten çözülmüş anı prop olarak alıyor. Taşımanın sebebi
    // Reanimated'in bayat `initial` stili — gerekçe overlay'in başındaki
    // "İKİ BİLEŞEN" blokunda; kapının kendisi değişmedi.
    expect(OVERLAY_SOURCE).toContain('settled && !moment.isMine');
    // ⚠️ Şerit artık anı DEĞİL kimliğini + ölçülen kareyi yukarı veriyor:
    // gösterilen an her render canlı listeden çözülüyor (`resolveOpenMoment`),
    // böylece an düşünce yüzey kendiliğinden kapanıyor.
    expect(SOURCE).toContain('setMomentTarget({ id: moment.id, frame })');
  });

  it('kararı BÜYÜYEN KART veriyor ve KAMPÜS ucuna gidiyor', () => {
    /**
     * ⚠️ PROFİL KARTI (`LikerSwipeModal`) BU YOLDAN ÇIKTI: ödünç alınan uç
     * bizi beğenmemiş biri için 404 veriyor (backend teyidi), kampüse özel uç
     * henüz yok. Karar artık büyüyen kartın cam tikinde.
     *
     * ⚠️ BEĞENİ YİNE `campus.like`TAN GEÇİYOR ve bu şart: gövdeye
     * `source: "CampusMoment"` + `momentId` koyan, kotayı ve paywall'ı
     * yöneten tek yer orası. Doğrudan `useSwipeMutation` çağrılsaydı kampüs
     * kotası yerine keşif kotası yanardı.
     */
    const overlay = SOURCE.slice(SOURCE.indexOf('<CampusMomentExpandOverlay'));
    expect(overlay.slice(0, overlay.indexOf('/>'))).toContain(
      'onLike={handleMomentLike}',
    );
    const like = SOURCE.slice(
      SOURCE.indexOf('const handleMomentLike = useCallback('),
    );
    expect(like).toContain('campus.like(moment)');
    // Kutlama kotaya BAĞLI: hak bitmişken alev oynamıyor.
    expect(like).toContain('exhausted: campus.decisionsExhausted');
    expect(like).toContain('runFlameSweep(onCovered, { hold: true })');
  });

  it('üst chrome\'un kapısı ZAMANLAYICIYLA açılıyor, animasyon callback\'iyle DEĞİL', () => {
    // Reanimated üzerine yazılan animasyonun callback'ini `finished: false`
    // ile çağırıyor; açılış kesilirse (banda iki kez dokunmak) callback'e
    // dayanan bayrak hiç true olmaz ve kullanıcı çıkışı olmayan bir haritada
    // kalırdı (cam X bu kapıdan mount ediliyor).
    const expandBody = SOURCE.slice(
      SOURCE.indexOf('const expandMap = useCallback('),
      SOURCE.indexOf('expandMapRef.current = expandMap'),
    );
    // ⚠️ ARTIK CAM BUTONUN KAPISI DEĞİL (o satır hiç sökülmüyor): zamanlayıcı
    // perdeleri, şeridin girişini ve sınırın çizimini başlatıyor. Gerekçe
    // aynı — kesilen bir animasyonun callback'ine bağlanan hiçbir şey
    // güvenilir değil.
    expect(expandBody).toContain('mapChromeFade.value = withTiming(1, {');
    expect(expandBody).toContain('}, MAP_MOTION_MS)');
    // Kapanışta bekleyen zamanlayıcı iptal: yoksa chrome kapanmış haritanın
    // üstünde beliriyordu.
    expect(collapseBody).toContain('clearMapActionsTimer()');
  });

  it('`available` kapısı ÖNCEDEN ısıtılıyor', () => {
    // Şeridin çizilip çizilmeyeceği buna bakıyor; sorgu yalnız harita açılınca
    // koşarken yüzey ilk açılışta ağ cevabını bekliyordu.
    expect(SOURCE).toContain('prewarm: true');
    const SURFACE_SOURCE = readFileSync(
      'src/features/campus/useCampusSurface.ts',
      'utf8',
    );
    // ⚠️ MOD İLK ARGÜMAN: `/campus/me` mod başına cache'leniyor (`postedToday`
    // mod başına, backend 2026-10-30). Modsuz ısıtma yanlış anahtarı
    // doldurur, yani ısıtmamakla aynı şey olurdu.
    expect(SURFACE_SOURCE).toContain(
      'useCampusMe(mode, { enabled: enabled || prewarm })',
    );
    // Anlar listesi de ısıtılıyor — ama KAPININ ARDINDA: yüzeyi kapalı
    // kampüslerde istek atılmıyor (istek: açılınca içerik ORADA olsun).
    expect(SURFACE_SOURCE).toContain('(enabled || prewarm) && available');
    // ⚠️ KONUM ısıtılmıyor: yüksek hassasiyetli GPS okuması her akış
    // mount'unda tetiklenemez (campusPresence'ın kendi uyarısı).
    const presenceGate = SURFACE_SOURCE.slice(
      SURFACE_SOURCE.indexOf('/** Harita açıldığında bir kez oku'),
    );
    expect(presenceGate).toContain('if (!enabled) return;');
  });

  it('AÇILIŞ VE KAPANIŞ AYNI — tek süre, tek eğri', () => {
    /**
     * ⚠️ BU KURAL TERSİNE DÖNDÜ (2026-10-23 isteği). Eskiden açılış ayrı
     * ayarlıydı (340ms + `out(cubic)`) ve testi "ikisi FARKLI kalmalı"ydı.
     * Kullanıcının tarifi "açılırken animasyon aşırı hızlı gibi, başlık ve
     * gönderiler için kapanışla aynı olsun"du: `out(cubic)` yolun yarısını ilk
     * %20'lik zamanda alıyor, yani gönderiler fırlayıp sonra oturuyordu.
     *
     * Artık TEK SABİT var — iki ayrı sayıyı eşit tutmaya çalışmak bu dosyanın
     * tarihçesindeki ayrışmanın ta kendisi.
     */
    const SOURCE_MOTION = readFileSync(
      'src/features/feed/components/feedMapMotion.ts',
      'utf8',
    );
    expect(typeof MAP_MOTION_MS).toBe('number');
    expect(SOURCE_MOTION).not.toContain('MAP_EXPAND_MS');
    expect(SOURCE_MOTION).not.toContain('MAP_COLLAPSE_MS');
    // Ekran iki yönde de aynı eğriyi geçiyor: iki ayrı easing adı kalmadı.
    expect(SOURCE).not.toContain('mapExpandEasing');
    expect(SOURCE).not.toContain('mapCollapseEasing');
  });
});

/**
 * HARİTANIN GİRİŞİ: ÇEKME JESTİ KALDIRILDI, YERİNE ANLARIN DESTESİ.
 *
 * ⚠️🔴 ÜÇ ŞEY BİRLİKTE GİTTİ (istek): pill'lerin altındaki 120pt'lik bant (ve
 * onun tam ekranı açan `Pressable`ı), bandın sağındaki süzülen kareler, ve
 * YUKARIDAN AŞAĞI ÇEKME jesti. Gönderiler artık doğrudan pill'lerin altında
 * başlıyor; haritanın tek girişi başlığın sağ ucundaki üçlü deste
 * (`FeedMomentsPeek`) ve aşağı çekmek yine YENİLİYOR.
 *
 * Buradaki testlerin işi geri sızmayı yakalamak: çekmeyle açılan bir yol
 * eklenirse `onRefresh` ile aynı jeste iki iş biner ve ikisi de bozulur.
 */
describe('haritanın girişi', () => {
  it('ÇEKME JESTİ YOK — eşik, kilit ve tetiğin hiçbiri kalmadı', () => {
    /**
     * ⚠️ METİN DEĞİL KULLANIM aranıyor: kaldırılan mekanizmaların adı
     * gerekçelerde ANILMAYA DEVAM EDİYOR (bu projenin kuralı) ve anmalı —
     * geri eklemek isteyen kişi neyin neden gittiğini orada buluyor.
     */
    expect(SOURCE).not.toMatch(/feedPullEngaged\.value/);
    expect(SOURCE).not.toMatch(/feedDragging\.value/);
    expect(SOURCE).not.toMatch(/mapPullFrozen\.value/);
    expect(SOURCE).not.toMatch(/expandFromPull\(/);
    expect(SOURCE).not.toMatch(/-MAP_PULL_EXPAND_PX/);
    // Çekmeyi okuyan scroll olayları da gitti: handler yalnız offset yazıyor.
    expect(SOURCE).not.toContain('onBeginDrag:');
    expect(SOURCE).not.toContain('onEndDrag:');
  });

  it('PULL-TO-REFRESH İKİ SAYFADA DA — akışta geri geldi', () => {
    // ⚠️ `isMine` koşulu KALKTI: çark artık akışta da var.
    expect(SOURCE).toContain('onRefresh={() => {');
    expect(SOURCE).toContain(
      'refreshing={query.isRefetching && !query.isFetchingNextPage}',
    );
    const LIST = readFileSync(
      'src/features/feed/components/FeedListPage.tsx',
      'utf8',
    );
    expect(LIST).toContain('onRefresh && isActive ? (');
  });

  it('TEK GİRİŞ: anların destesi haritayı açıyor', () => {
    expect(SOURCE).toContain('<FeedMomentsPeek');
    expect(SOURCE).toContain('onPress={expandMap}');
    // Deste yalnız AKIŞ sayfasının başlığında.
    expect(SOURCE).toContain('trailing={key === "mine" ? null : momentsPeek}');
    // Bandın butonu ve kareleri tamamen gitti.
    expect(SOURCE).not.toContain('FeedBandMoments');
    expect(SOURCE).not.toContain('FEED_MAP_BAND_HEIGHT');
    expect(SOURCE).not.toContain('feed.map.expandHint');
  });

  it('BANT KALKTI: perde pill satırının altında bitiyor', () => {
    // `heroHeight` bant terimini kaybetti, `bandHeight` de sıfır.
    expect(SOURCE).toContain(
      'heroHeight={chromeHeight > 0 ? listTopPadding + chromeHeight : 0}',
    );
    expect(SOURCE).toContain('bandHeight={0}');
  });

  it('CHROME SCROLL OFFSET\'İNİ HİÇ OKUMUYOR — iki tur da geri alındı', () => {
    /**
     * ⚠️🔴 İKİ AYRI DENEME, İKİSİ DE GERİ ALINDI:
     *  1. POZİTİF tarafta 120pt'lik YAPIŞMA (bandın boyu) — bant kaldırılınca
     *     dayanaksız kaldı.
     *  2. NEGATİF tarafta ÇEKME TELAFİSİ ("piller ve üstü sabit kalsın") —
     *     lastik natif olarak her karede hareket ediyor, telafi ise 16ms'lik
     *     scroll olayından türüyordu: chrome bir kare geriden geliyor ve tam
     *     olarak başlık/açıklama/pill satırında TİTRİYOR. Olay hızını 1'e
     *     çekmek de çözüm değil — o, başlığın alfayla sönen blur'unu titretiyor
     *     (aynı gün yaşandı, bkz. FeedListPage > scrollEventThrottle).
     *
     * Kalan kural: chrome scroll'u HİÇ okumuyor, yalnız tam ekran geçişinin
     * iki terimini taşıyor.
     */
    expect(SOURCE).toContain(
      'transform: [{ translateY: -exitPx.value - listOffsetPx.value }]',
    );
    expect(SOURCE).not.toMatch(/translateY:\s*\n?\s*Math\.min\(feedScrollY/);
    expect(SOURCE).not.toContain('const stick = Math.min(feedScrollY.value');
    /**
     * ⚠️🔴 ÇARKIN KONUMLANDIRMA PROP'U HİÇ YOK — ve bu iddia DEĞİŞTİ.
     *
     * Burada bir dönem `progressViewOffset={insets.top +
     * SCREEN_HEADER_TITLE_HEIGHT}` ÇAKILIYDI, yani "varsayılan yerinde"
     * sayılıyordu. Değilmiş: aynı prop, yalnız daha küçük bir sayıyla. RN'in
     * kaynağında (RCTRefreshControl.m) o sayı kontrolün FRAME'ini itiyor ve
     * eşik frame'e bağlı — 109pt de tıpkı 300 gibi 109pt fazla çekme demek.
     * Şikâyet ("çok fazla aşağı çekiyorum") bu yüzden iki tur sonra da
     * sürüyordu ve BU TEST onu kural diye koruyordu.
     *
     * Eşik artık native'de, görünen çark bizim. Tam kural ve gerekçe:
     * tests/features/feed/feedRefreshControl.test.ts.
     */
    expect(SOURCE).not.toMatch(/refreshOffset=\{/);
    const LIST = readFileSync(
      'src/features/feed/components/FeedListPage.tsx',
      'utf8',
    );
    expect(LIST).not.toMatch(/^\s*progressViewOffset=/m);
  });

  it('SINIR TAM EKRANDA KENDİNİ ÇİZİYOR — akışta hiç çizilmiyor', () => {
    // Akışta 0'da duruyor; 1'e yalnız açılış zamanlayıcısında gidiyor.
    expect(SOURCE).toContain('const polygonReveal = useSharedValue(0)');
    expect(SOURCE).toContain('polygonReveal.value = withTiming(1, {');
    expect(SOURCE).toContain('duration: MAP_POLYGON_DRAW_MS');
    // ⚠️ Çizim haritanın hareketi BİTİNCE: aynı zamanlayıcının içinde.
    const timer = SOURCE.slice(
      SOURCE.indexOf('mapTimersRef.current = ['),
      SOURCE.indexOf('mapProgress.value = withTiming(1, {'),
    );
    expect(timer).toContain('polygonReveal.value = withTiming(1, {');
    // ⚠️ BİLEREK UZUN: açılışın içinde kaybolursa şeklin KURULDUĞU görünmüyor.
    expect(MAP_POLYGON_DRAW_MS).toBeGreaterThan(MAP_MOTION_MS * 3);
  });
});

/**
 * AÇILIŞIN KATMANLARI — ÇEKME FAZI OLMADAN.
 *
 * Burada bir zamanlar "çekme → açılış sürekliliği" vardı: eşik geçildiği an
 * `scrollEnabled` kapanıyor, iOS sürüklemeyi iptal ediyor ve o tek karede
 * gönderilerin lastikten gelen konumu ile chrome'un ödünç aldığı pay birden
 * kayboluyordu (iki ayrı ZIPLAMA). Çözüm donmuş orandı; çekme jesti üründen
 * çıkınca (istek) yarışın tamamı da gitti.
 *
 * Kalan kurallar açılışın KENDİ katmanlarıyla ilgili: tek öteleme kaynağı,
 * şeridin kendi girişi, chrome'un yavaş sönümü ve sınırın kendini çizmesi.
 */
describe('açılışın katmanları', () => {
  it('ZOOM TEK SÜRÜCÜDEN — çekmenin payı kalmadı', () => {
    /**
     * Bir dönem yakınlaşmanın `MAP_PULL_ZOOM_SHARE` kadarı parmakla alınıyordu
     * ("hafif çekerken zoom atıyor gibi olsun"); çekme jesti üründen çıkınca
     * (istek) o terimin sürücüsü de gitti.
     *
     * ⚠️ ÜÇ TÜKETİCİ AYNI DEĞERİ OKUMAK ZORUNDA: haritanın kutusu, blur
     * deliğinin maskesi ve perdelerin üstüne taşınan poligon. Biri ayrışırsa
     * açılırken delik ya da şekil haritadan kayar.
     */
    // ⚠️ METİN DEĞİL KULLANIM: iki adın ikisi de gerekçelerde anılıyor.
    expect(MAP_SOURCE).not.toMatch(/\* MAP_PULL_ZOOM_SHARE/);
    expect(MAP_SOURCE).not.toMatch(/pullProgress\s*\?/);
    expect(MAP_SOURCE).not.toMatch(/^\s+pullProgress,$/m);
    expect(MAP_SOURCE).toContain(
      '() => 1 + (expandScale - 1) * expandProgress.value,',
    );
    expect(MAP_SOURCE.match(/\{ scale: zoom\.value \}/g)).toHaveLength(3);
    // Dikey terim de dört kopyada tek kaynaktan (`centerY`).
    expect(MAP_SOURCE.match(/\{ translateY: centerY\.value \}/g)).toHaveLength(
      4,
    );
  });

  it('poligon sönümlemenin ve blur`un ÜSTÜNDE, iskeletin ALTINDA', () => {
    const dim = MAP_SOURCE.indexOf('backgroundColor: scrimAt(MAP_DIM_ALPHA)');
    const blur = MAP_SOURCE.indexOf('intensity={MAP_OVERVIEW_BLUR}');
    const lifted = MAP_SOURCE.lastIndexOf('<CampusPolygonOverlay');
    const skeleton = MAP_SOURCE.indexOf('{skeletonMounted ? (');
    expect(dim).toBeGreaterThan(-1);
    expect(blur).toBeGreaterThan(-1);
    expect(skeleton).toBeGreaterThan(-1);
    expect(lifted).toBeGreaterThan(dim);
    expect(lifted).toBeGreaterThan(blur);
    // Harita kurulmadan şekil görünmemeli.
    expect(lifted).toBeLessThan(skeleton);

    // ⚠️ GEOMETRİ KOPYASI ŞART: kutunun yerleşimi + transformu haritayla
    // birebir olmazsa tam ekrana geçerken şekil haritadan ayrılır.
    expect(MAP_SOURCE).toContain('polygonBoxStyle');
    // ⚠️ Kampüs değişiminin geçişi de kopyalanmış: yoksa yeni şekil, ESKİ
    // haritanın üstünde tam opak olarak 280ms durur.
    expect(MAP_SOURCE).toContain('polygonIncomingStyle');
    // ⚠️ BLUR DELİĞİ DURUYOR: işi şekil değil İÇİNDEKİ harita — kampüsün
    // sokakları akışta da net kalıyor.
    expect(MAP_SOURCE).toContain('<CampusPolygonBlurMask');
  });

  it('KUTULAR ÇEKMEYE BAĞLI DEĞİL — kendi girişleri var', () => {
    /**
     * ⚠️ BU KURAL TERSİNE DÖNDÜ (istek). Bir dönem şerit çekerken mount edilip
     * parmakla yukarı çıkıyordu; istenen his o değil — kutular haritanın bir
     * parçası gibi davranıyordu, oysa haritanın ÜSTÜNE gelen ayrı bir yüzey.
     * Artık açılış animasyonu bitince kendiliğinden aşağıdan geliyorlar.
     */
    expect(SOURCE).not.toContain('mapPullPeek');
    expect(SOURCE).toContain('mapStripEntry.value = withTiming(1, {');
    expect(SOURCE).toContain('}, MAP_MOTION_MS),');
    // Kapanışta haritayla BİRLİKTE iniyor: kendi süresiyle inse harita
    // kapandıktan sonra ekranın dibinde asılı kalırdı.
    expect(collapseBody).toContain('mapStripEntry.value = withTiming(0, {');
  });

  it('ŞERİDİN GİRİŞİ haritanın hareketi BİTİNCE başlıyor', () => {
    /**
     * ⚠️ Burada bir zamanlar "cam butonlar iki animasyonun TOPLAMI kadar sonra
     * mount edilir" kuralı vardı (`MAP_MOTION_MS + MAP_STRIP_ENTRY_MS`) ve
     * butonlarla birlikte düştü (gerekçe yukarıdaki "KARTTA KARAR ÇİFTİ YOK"
     * testinde). Şeridin kendi girişi duruyor: aynı zamanlayıcının içinde,
     * yani harita oturduktan SONRA kendi eğrisiyle aşağıdan geliyor.
     */
    const timer = SOURCE.slice(
      SOURCE.indexOf('mapTimersRef.current = ['),
      SOURCE.indexOf('mapProgress.value = withTiming(1, {'),
    );
    expect(timer).toContain('mapStripEntry.value = withTiming(1, {');
    expect(timer).toContain('duration: MAP_STRIP_ENTRY_MS');
    expect(timer).toContain('}, MAP_MOTION_MS)');
  });

  it('öteleme TEK KAYNAKTA — liste ekliyor, chrome aynısını çıkarıyor', () => {
    expect(SOURCE).toContain('const listOffsetPx = useDerivedValue(');
    expect(SOURCE).toContain('translateY: listOffsetPx.value }],');
    // Chrome AYNI değeri çıkarıyor (tek satır, scroll terimi YOK).
    expect(SOURCE).toContain(
      'transform: [{ translateY: -exitPx.value - listOffsetPx.value }]',
    );
    // Eski hâli: chrome kendi içinde `windowHeight`i yeniden yazıyordu.
    expect(SOURCE).not.toContain('mapProgress.value * (windowHeight + lift)');
  });

  it('SINIR KAPANIŞTA ANINDA sıfırlanıyor — geri silinmiyor', () => {
    // Akış şekli hiç çizmiyor, yani kapanırken ekranda kalan son şey bir
    // çizgi parçası olmamalı. Geri silme animasyonu BİLEREK yok.
    expect(collapseBody).toContain('polygonReveal.value = 0;');
  });

  it('PERDELER yavaşça sönüyor, BAŞLIK ise sekmelerle ÇAPRAZ', () => {
    /**
     * ⚠️ İKİ AYRI DEĞER VE AYRIŞMALARI KASITLI.
     *
     * Perdeler `mapChromeFade`: haritayla aynı 280ms'de belirdiklerinde
     * ekranın iki ucu "bir anda" karanlıklaşıyor gibi okunuyordu (istek) —
     * kendi süresiyle ve harita oturduktan SONRA açılıyorlar.
     *
     * Başlık `mapProgress` (istek: "title da yok olup baştan çizilmesin"):
     * perdelere bağlıyken sıra "sekmeler gidiyor → şerit boş kalıyor → başlık
     * sıfırdan beliriyor" oluyordu. Artık aynı hareketin içinde, sekmelerin
     * çıkışıyla çakışıyor; ikinci yarıda açılıyor ki iki yazı aynı merkezde
     * üst üste binmesin.
     */
    expect(SOURCE).toContain('progress={mapChromeFade}');
    expect(SOURCE).toContain('mapChromeFade.value = withTiming(1, {');
    expect(SOURCE).toContain('duration: MAP_CHROME_FADE_MS');
    expect(collapseBody).toContain('mapChromeFade.value = withTiming(0, {');
    // Başlık perdenin değerini ARTIK OKUMUYOR — kendi çapraz sönümü var.
    // ⚠️ METİN DEĞİL KULLANIM: adı kaldırıldığını söyleyen notta anılıyor.
    expect(SOURCE).not.toMatch(/[^`]mapChromeFadeStyle/);
    expect(SOURCE).toContain('const mapTitleFadeStyle = useAnimatedStyle');
    const titleFade = SOURCE.slice(
      SOURCE.indexOf('const mapTitleFadeStyle'),
      SOURCE.indexOf('const campus = useCampusSurface'),
    );
    expect(titleFade).toContain('mapProgress.value');
    expect(titleFade).toContain('[0.45, 1]');
    /**
     * Sönüm cam butona VARMADAN kapanmak zorunda: ata zincirinde opacity<1
     * gören SwiftUI camı sessizce hiç çizilmiyor. Etiket kaynakta butondan
     * ÖNCE yazılıyor (mutlak ortalama) ama KARDEŞ — aradaki kapanış etiketi
     * bunu kanıtlıyor.
     */
    const fadeAt = SOURCE.indexOf('mapTitleFadeStyle,');
    const buttonAt = SOURCE.indexOf('<DiscoverHeaderGlassButton', fadeAt);
    const between = SOURCE.slice(fadeAt, buttonAt);
    expect(between).toContain('</Animated.View>');
  });
});
