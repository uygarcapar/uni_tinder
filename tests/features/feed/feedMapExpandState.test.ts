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
  MAP_PULL_SHARE,
  MAP_PULL_EXPAND_PX,
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

  it('cam X AÇILIŞ BİTTİKTEN SONRA mount ediliyor — eşikte takılma olmasın', () => {
    /**
     * ⚠️ BU KAPI DEĞİŞTİ. Eskiden `mapChromeMounted` ile eşik karesinde mount
     * ediliyordu; X bir SwiftUI cam butonu, yani mount'u native bir
     * `Host`/`RNHostView` kurulumu demek. O kurulum dört setState + bir
     * `withTiming` + `scrollEnabled` değişimiyle aynı kareye düşünce parmak
     * altında gözle görülür bir TAKILMA oluyordu.
     *
     * `|| !mapExpanded` kapanış için: `mapActionsReady` kapanışın BAŞINDA
     * düşüyor ve tek başına okunsa X harita küçülmeye başladığı an yok olurdu.
     */
    // ⚠️ Kapı `mapChromeReady` (haritanın hareketi kadar sonra).
    // `mapActionsReady`den AYRI: o, kutuların cam butonları için ve şeridin
    // girişi de bittiğinde açılıyor.
    expect(SOURCE).toContain(
      '{mapChromeMounted && (mapChromeReady || !mapExpanded) ? (',
    );
  });

  it('başlık ÜST BANDIN içinde ve EKRANIN ORTASINDA', () => {
    // İstek: başlık kutuların üstünden Keşif şeridinin hizasına taşındı, sonra
    // o satırın ORTASINA alındı. Satırın ölçüsü perdenin sahibinde.
    expect(SOURCE).toContain('top: insets.top + CAMPUS_MAP_CHROME_TOP');
    expect(SOURCE).toContain('height: CAMPUS_MAP_CHROME_ROW');
    expect(SOURCE).toContain('<CampusMapTitle');
    // ⚠️ MUTLAK ORTALAMA: etiket satırın AKIŞINA girerse X ve pill'in
    // genişliği onu merkezden kaydırır (Keşif başlığındaki aynı kalıp).
    const titleBlock = SOURCE.slice(
      SOURCE.indexOf('{campus.available ? ('),
      SOURCE.indexOf('<CampusMapTitle'),
    );
    expect(titleBlock).toContain('position: "absolute"');
    expect(titleBlock).toContain('alignItems: "center"');
    // ⚠️ Kap `box-none`: tam genişlikte bir satır haritanın üstündeki her
    // dokunuşu yutardı, kontroller ise dokunuşu almaya devam etmeli.
    expect(SOURCE).toContain('pointerEvents="box-none"');
    // Perde de aynı formülden — bant kısalırsa yazı çıplak haritada kalır.
    expect(SOURCE).toContain('campusMapTopScrimHeight(insets.top)');
  });

  it('başlığın SAĞINDA Plus pill\'i — yalnız Plus DEĞİLSE', () => {
    /**
     * İstek: "sağında, plus değilse, LikesScreen'deki gibi bir buton olsun".
     * Reçete oradan: yarıçap 999, dolgu modun aksanı, mürekkep
     * `onMediaInverse`, 13/700.
     *
     * ⚠️ `showPlusUpsell` kapısı `premiumResolved` de içeriyor: abonelik
     * slice'ı persist edilmediği için reload'da premium kullanıcı bir an
     * `isPremium:false` doğuyor ve pill çizilip hemen kaybolurdu — premium'a
     * premium satmak en pahalı yanılma yönü.
     */
    const row = SOURCE.slice(
      SOURCE.indexOf('{mapChromeMounted && (mapChromeReady || !mapExpanded) ? ('),
    );
    const pill = row.slice(0, row.indexOf('KAMPÜS ANLARI ŞERİDİ'));
    expect(pill).toContain('{showPlusUpsell ? (');
    expect(pill).toContain('onPress={openPaywall}');
    expect(pill).toContain('backgroundColor: modeAccent(selectedMode)');
    expect(pill).toContain('t("feed.header.plusAction")');
  });

  it('alt perdenin SÖNÜMÜ kısa — blur başlığa kadar geliyor', () => {
    // Varsayılan reçete bandın yarısında sönüyor; 430pt'lik bir bantta bu,
    // başlığın hizasında alfanın ~0.05'e düşmesi demek.
    expect(SOURCE).toContain('fadePx={CAMPUS_STRIP_SCRIM_FADE}');
  });

  it('FAB GECİKEN kapıyı okuyor', () => {
    // Mantıksal durum kapanışın başında düşüyor; FAB o anda belirse kapanış
    // animasyonu boyunca şeridin üstünde dururdu.
    expect(SOURCE).toContain('!mapChromeMounted ? (');
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
    expect(SOURCE).toContain('mapProgress.value +\n      (1 - mapProgress.value) * mapPull.value * MAP_PULL_SHARE');
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

  it('kutuların CAM butonları yalnız şerit OTURDUKTAN SONRA mount ediliyor', () => {
    // ⚠️ Camın kuralı: ata zincirinde kimliksel olmayan transform gören cam
    // sessizce hiç çizilmiyor ve sonradan düzelmiyor. Şerit `translateY` ile
    // geldiği için kapı zorunlu.
    expect(CARD_SOURCE).toContain(') : actionsReady ? (');
    expect(STRIP_SOURCE).toContain('actionsReady={actionsReady}');
    expect(SOURCE).toContain('actionsReady={mapActionsReady}');
  });

  it('mount kapısı ZAMANLAYICIYLA açılıyor, animasyon callback\'iyle DEĞİL', () => {
    // Reanimated üzerine yazılan animasyonun callback'ini `finished: false`
    // ile çağırıyor; açılış kesilirse (banda iki kez dokunmak) callback'e
    // dayanan bayrak hiç true olmaz ve kullanıcı karar veremeyen bir şeritte
    // kalırdı.
    const expandBody = SOURCE.slice(
      SOURCE.indexOf('const expandMap = useCallback('),
      SOURCE.indexOf('expandMapRef.current = expandMap'),
    );
    expect(expandBody).toContain('setMapActionsReady(true)');
    expect(expandBody).toContain('}, MAP_MOTION_MS)');
    // Kapanışta ANINDA düşüyor: öteleme başladığı an cam zaten çizilmez.
    expect(collapseBody).toContain('setMapActionsReady(false)');
  });

  it('`available` kapısı ÖNCEDEN ısıtılıyor', () => {
    // Şeridin çizilip çizilmeyeceği buna bakıyor; sorgu yalnız harita açılınca
    // koşarken yüzey ilk açılışta ağ cevabını bekliyordu.
    expect(SOURCE).toContain('prewarm: true');
    const SURFACE_SOURCE = readFileSync(
      'src/features/campus/useCampusSurface.ts',
      'utf8',
    );
    expect(SURFACE_SOURCE).toContain(
      'useCampusMe({ enabled: enabled || prewarm })',
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
 * AŞAĞI ÇEKMEK HARİTAYI AÇIYOR — akışta pull-to-refresh YOK.
 *
 * İstek: "postları yukarıdan aşağı çekince activity indicator olmasın,
 * threshold olsun, geçince expanded map olsun". Jest zaten o anlama geliyordu:
 * çekerken gönderiler iniyor, başlık ve pill satırı yerinde duruyor ve açılan
 * boşluktan harita görünüyor — çarkın orada belirmesi okunuşu bozuyordu.
 *
 * ⚠️ TAKAS: akış artık ELLE yenilenmiyor. Tazelik sekmeye dönüşte açılan
 * sorgu, push/SignalR köprüsü ve 30sn'lik pencereden geliyor; Gönderilerim
 * sayfasında çark duruyor (orada harita yok).
 */
describe('çekerek açma', () => {
  it('akışta RefreshControl HİÇ takılmıyor — yalnız Gönderilerim', () => {
    // `onRefresh` verilmezse `FeedListPage` kontrolü hiç kurmuyor.
    expect(SOURCE).toContain('onRefresh={\n          isMine');
    expect(SOURCE).toContain('isMine ? query.isRefetching && !query.isFetchingNextPage : false');
    const LIST = readFileSync(
      'src/features/feed/components/FeedListPage.tsx',
      'utf8',
    );
    expect(LIST).toContain('onRefresh && isActive ? (');
    // Çarkın akışa özel konumu (`refreshOffset`) artık ölü — prop kaldırıldı.
    // ⚠️ Metin değil KULLANIM aranıyor: kaldırılma gerekçesi yorumda duruyor
    // ve durmaya devam etmeli.
    expect(LIST).not.toMatch(/refreshOffset[?:,=]/);
  });

  it('eşik TEK KAYNAKTA ve makul bir menzilde', () => {
    expect(SOURCE).toContain('-MAP_PULL_EXPAND_PX');
    // Küçük bir sayı her fling'de kazara açıyor, büyüğü parmağın menzilinden
    // çıkıyor (gerekçe sabitin yanında).
    expect(MAP_PULL_EXPAND_PX).toBeGreaterThanOrEqual(64);
    expect(MAP_PULL_EXPAND_PX).toBeLessThanOrEqual(140);
  });

  it('MOMENTUM BOUNCE çekme sayılmıyor — parmak kilidi', () => {
    /**
     * ── Yaşanan hata ───────────────────────────────────────────────────────
     * Liste hızlıca YUKARI savruluyor; momentum tepeye varıyor ve lastik eşiği
     * AŞACAK kadar taşıyor. Offset'e bakan bir kapı bunu çekme sanıyordu:
     * chrome/sekmeler/kutular %45 yola çıkıp geri dönüyor, üstüne harita
     * kendiliğinden açılıyordu ("görüntü kirliliği").
     *
     * Kural: çekme yalnız PARMAK LİSTEDEYKEN başlayabilir. Kilit bir kez
     * açıldıktan sonra offset sıfıra dönene kadar açık kalıyor — parmak
     * kalktıktan sonra lastik geri yaylanırken chrome da onunla yumuşakça
     * geri geliyor (kilit parmakla düşseydi orada sert bir sıçrama olurdu).
     */
    expect(SOURCE).toContain('onBeginDrag: () => {');
    expect(SOURCE).toContain('onEndDrag: () => {');
    expect(SOURCE).toContain('} else if (feedDragging.value && y < -2) {');
    // Tepeye dönüş kilidi HER HÂLÜKÂRDA kapatıyor (sıra önemli).
    expect(SOURCE).toContain('if (y >= 0) {\n        feedPullEngaged.value = false;');
    // İki tüketici de kilidi okuyor: görsel pay ve tetik.
    expect(SOURCE).toContain('if (!feedPullEngaged.value) return 0;');
    expect(SOURCE).toContain(
      '() => feedPullEngaged.value && feedScrollY.value <= -MAP_PULL_EXPAND_PX',
    );
  });

  it('tetik eşiğin GEÇİLDİĞİ AN — ve yalnız kenarda', () => {
    const body = SOURCE.slice(
      SOURCE.indexOf('const expandFromPull = useCallback('),
    );
    // ⚠️ `prev === null` ilk tur kapısı: olmasa ekran açılır açılmaz harita
    // açılırdı. `crossed === prev` ise lastik geri yaylanırken her karede
    // tetiklenmeyi engelliyor.
    expect(body).toContain('if (prev === null || !crossed || crossed === prev) return;');
    expect(body).toContain('runOnJS(expandFromPull)()');
  });

  it('kapılar REF\'ten okunuyor — bayat closure açık haritayı yeniden açamaz', () => {
    // ⚠️ Dilim `expandFromPull`dan İLERİYE: `useAnimatedReaction` dosyanın
    // başındaki import'ta da geçiyor, ofsetsiz arama boş dilim veriyor.
    const start = SOURCE.indexOf('const expandFromPull = useCallback(');
    const body = SOURCE.slice(start, SOURCE.indexOf('useAnimatedReaction(', start));
    expect(body).toContain('if (mapExpandedRef.current) return;');
    expect(body).toContain('if (activeTabRef.current !== "feed") return;');
  });
});

/**
 * ÇEKME İLE AÇILIŞ ARASINDA KESİNTİ OLMAMALI.
 *
 * Eşik geçildiği an `scrollEnabled` kapanıyor ve iOS süren sürüklemeyi iptal
 * edip içeriği 0'a snap'liyor. O tek karede iki şey birden kayboluyor:
 * gönderilerin lastikten gelen aşağı konumu ve chrome'un ödünç aldığı yukarı
 * pay. Animasyon henüz 0'da olduğu için ikisi de ZIPLAMA olarak görünüyordu —
 * başlık aşağı düşüp yukarı kalkıyor, gönderiler aşağı inmeden önce yukarı
 * sıçrıyor.
 *
 * Çare donmuş oran: açılış anındaki çekme payı saklanıp animasyon boyunca
 * `(1 - ilerleme)` ile söndürülüyor.
 */
describe('çekme → açılış sürekliliği', () => {
  it('her katman ÇEKERKEN yola çıkıyor — açılış parmakla başlıyor', () => {
    // ⚠️ 1.0 olamaz: katmanlar eşikte tamamen çıkarsa çekmenin iptal
    // edilebilir olduğu hissi kayboluyor (gerekçe sabitin yanında).
    expect(MAP_PULL_SHARE).toBeGreaterThan(0);
    expect(MAP_PULL_SHARE).toBeLessThan(1);

    // ── TEK SÜRÜCÜ, ÇOK TÜKETİCİ ──────────────────────────────────────────
    // Çekmenin payı tek bir türetilmiş değerde harmanlanıyor; ayrı ayrı
    // yazılsalar biri değiştiğinde diğerleri geride kalırdı.
    expect(SOURCE).toContain('const mapDrive = useDerivedValue(');
    // Sekme şeridi (Akış / Gönderilerim) — istek.
    expect(SOURCE).toContain('translateY: -mapDrive.value * listTopPadding');
    // Tüketici: sekme şeridi (yukarıdaki satır). Kutular ve perdeler bir
    // dönem bunu okuyordu, artık okumuyorlar (istek).
    // Chrome kendi formülünü kullanıyor (listenin çocuğu, lastiği de iptal
    // etmek zorunda) ama oranı AYNI kaynaktan okuyor.
    expect(SOURCE).toContain('mapPull.value * lift * MAP_PULL_SHARE');
    // Üst bandın blur'u da çekmeye bağlı (harita katmanına geçiyor).
    expect(SOURCE).toContain('pullProgress={mapPull}');
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

  it('kutuların CAM butonları ŞERİT DE oturduktan sonra mount ediliyor', () => {
    // Şeridin girişi de bir `translateY`: animasyonlu atanın altında doğan cam
    // sessizce hiç çizilmiyor, yani kapı iki animasyonun TOPLAMI kadar sonra
    // açılmak zorunda.
    expect(SOURCE).toContain('MAP_MOTION_MS + MAP_STRIP_ENTRY_MS,');
  });

  it('açılış başlayınca CANLI offset okunmuyor — donmuş oran', () => {
    // Tek yerde: `mapPull`. Tüketicilerin hiçbiri `feedScrollY`yi kendi
    // başına yorumlamıyor.
    expect(SOURCE).toContain(
      'if (mapProgress.value > 0) return mapPullFrozen.value;',
    );
  });

  it('liste telafisi LAYOUT-FARKINDALIKLI — koşulsuz pay zıplama üretiyordu', () => {
    /**
     * `scrollEnabled` kapandığında iOS sürüklemeyi ya aynı karede 0'a
     * snap'liyor ya da lastiği kendi süresinde geri yaylandırıyor. Koşulsuz
     * eklenen pay ikinci durumda ZIPLAMA üretiyordu: lastik gönderileri hâlâ
     * aşağıda tutarken telafi de aynı payı ekliyor.
     *
     * Doğru hesap "layout şu an ne kadarını veriyor": eksik = donmuş − canlı.
     */
    expect(SOURCE).toContain('const livePx = Math.max(-feedScrollY.value, 0);');
    expect(SOURCE).toContain('const missing = Math.max(frozenPx - livePx, 0);');
    // ⚠️ `(1 - ilerleme)` ÇARPANI YOK: yaylanma animasyonun ortasında biterse
    // çarpan telafiyi yutar ve tam o anda sıçrama doğar.
    expect(SOURCE).toContain('mapProgress.value * windowHeight + missing');
  });

  it('donmuş oran KAPANIŞIN BAŞINDA sıfırlanıyor', () => {
    // Kapanış bittiğinde (ilerleme 0) pay yeniden devreye girerse chrome
    // ekranın dışında kalıyor. O anda terim `(1 - ilerleme)` ile çarpıldığı
    // için sıfırlamanın kendisi görünmüyor.
    expect(collapseBody).toContain('mapPullFrozen.value = 0;');
  });

  it('üst chrome KOMPLE ve YAVAŞÇA sönüyor — başlık + pill birlikte', () => {
    /**
     * ⚠️ `mapProgress` DEĞİL (istek): haritayla aynı 280ms'de belirdiğinde
     * ekranın iki ucu "bir anda" oluşuyor gibi okunuyordu. Kendi süresiyle ve
     * harita oturduktan SONRA açılıyor; kapanışta haritayla birlikte sönüyor.
     *
     * Pill de AYNI kapta (istek: "headerdaki buton da header'la beraber yok
     * olup gelsin") — düz RN olduğu için camın kuralı onu bağlamıyor.
     */
    expect(SOURCE).toContain('opacity: mapChromeFade.value');
    expect(SOURCE).toContain('mapChromeFade.value = withTiming(1, {');
    expect(SOURCE).toContain('duration: MAP_CHROME_FADE_MS');
    expect(collapseBody).toContain('mapChromeFade.value = withTiming(0, {');
    // Perdeler de aynı değeri okuyor: "expanded olunca bir anda oluşmasın".
    expect(SOURCE).toContain('progress={mapChromeFade}');
    const pill = SOURCE.slice(SOURCE.indexOf('{showPlusUpsell ? ('));
    expect(pill.slice(0, 200)).toContain('mapChromeFadeStyle');
    // ⚠️ Opaklık yalnız YAZININ kabında: cam X aynı satırda ve ata
    // zincirindeki opacity<1 camı sessizce hiç çizdirmiyor.
    /**
     * Sönüm cam butona VARMADAN kapanmak zorunda: ata zincirinde opacity<1
     * gören SwiftUI camı sessizce hiç çizilmiyor. Etiket kaynakta butondan
     * ÖNCE yazılıyor (mutlak ortalama) ama KARDEŞ — aradaki kapanış etiketi
     * bunu kanıtlıyor.
     */
    const fadeAt = SOURCE.indexOf('mapChromeFadeStyle,');
    const buttonAt = SOURCE.indexOf('<DiscoverHeaderGlassButton', fadeAt);
    const between = SOURCE.slice(fadeAt, buttonAt);
    expect(between).toContain('</Animated.View>');
  });
});
