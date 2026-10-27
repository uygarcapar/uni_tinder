import {
  feedMapCampusColumn,
  feedMapExpandScale,
  feedMapFraming,
  feedMapHorizontal,
  type FeedMapFramingArgs,
  type FeedMapHorizontalArgs,
} from '@/features/feed/components/feedMapFraming';
import { MAP_MOTION_MS } from '@/features/feed/components/feedMapMotion';

/**
 * AKIŞ HARİTASININ KADRAJI.
 *
 * Buradaki asıl test "kutu ve merkez `expandedBottomInset`ten BAĞIMSIZ" —
 * yaşanmış bir regresyonun eşi. O pay kampüs anları sheet'inin küçük
 * detentinden geliyor ve yüzey yalnız harita BİR KEZ tam ekrana açıldıktan
 * sonra etkinleşiyor (sorgular `mapExpanded`e bağlı). Kutu paya bağlandığında
 * akıştaki harita ilk açılışa kadar doğru, ondan sonra kaymış duruyordu —
 * "bir kere girip çıkınca harita bozuluyor".
 *
 * Belirtinin sinsi olmasının sebebi: hata haritanın KENDİSİNDE değil, bir
 * başka özelliğin etkinleşmesinde tetikleniyor ve ekran çalışmaya devam
 * ediyor.
 */

/** iPhone 15 Pro ölçüleri + ölçülmüş chrome. */
const BASE: FeedMapFramingArgs = {
  heroHeight: 373,
  bandHeight: 120,
  viewportHeight: 852,
  expandedBottomInset: 0,
  ready: true,
};

/** Anlar ŞERİDİNİN yüksekliği (kutu + başlık + alt pay + sekme şeridi). */
const STRIP = 410;

describe('feedMapFraming', () => {
  it('kampüs noktası BANDIN ortasında', () => {
    const f = feedMapFraming(BASE);
    // Bandın ortası: chrome'un bittiği yer + bandın yarısı.
    expect(f.campusScreenY).toBeCloseTo(
      BASE.heroHeight - BASE.bandHeight / 2,
      6,
    );
  });

  it('kutunun dibi KATMANIN dibinde', () => {
    const f = feedMapFraming(BASE);
    expect(f.imageTop + f.boxHeight).toBeCloseTo(BASE.viewportHeight, 6);
  });

  it('kutu ekranın tepesinden TAŞIYOR (negatif top)', () => {
    expect(feedMapFraming(BASE).imageTop).toBeLessThan(0);
  });

  // ── Asıl değişmez ────────────────────────────────────────────────────────

  it('KUTU şerit payından BAĞIMSIZ', () => {
    const without = feedMapFraming(BASE);
    const with_ = feedMapFraming({ ...BASE, expandedBottomInset: STRIP });
    expect(with_.imageTop).toBe(without.imageTop);
    expect(with_.boxHeight).toBe(without.boxHeight);
  });

  it('MERKEZ şerit payından BAĞIMSIZ — akıştaki harita oynamıyor', () => {
    const without = feedMapFraming(BASE);
    const with_ = feedMapFraming({ ...BASE, expandedBottomInset: STRIP });
    expect(with_.campusScreenY).toBe(without.campusScreenY);
  });

  it('şerit payı YALNIZ tam ekran kaymasını değiştiriyor', () => {
    const without = feedMapFraming(BASE);
    const with_ = feedMapFraming({ ...BASE, expandedBottomInset: STRIP });
    expect(with_.mapShift).not.toBeCloseTo(without.mapShift, 3);
  });

  // ── Kayma: kapsama payları ───────────────────────────────────────────────

  it('şerit varken kampüs şeridin ÜSTÜNDEKİ alanın ortasına DOĞRU gidiyor', () => {
    // ⚠️ "TAM ortasına" DEĞİL: istenen hedef şeridin üstündeki alanın ortası
    // ama kayma 0'ın altına inemiyor (aşağıdaki kural), yani şerit yüksekse
    // kampüs hedefin bir miktar ALTINDA kalıyor. Hedefe doğru gitmesi ve
    // hedefi AŞMAMASI test ediliyor.
    const target = (BASE.viewportHeight - STRIP) / 2;
    const f = feedMapFraming({ ...BASE, expandedBottomInset: STRIP });
    const landed = f.campusScreenY + f.mapShift;
    expect(landed).toBeGreaterThanOrEqual(target - 1e-9);
    // Şerit yoksa gittiği yerden (ekran ortası) daha YUKARIDA ya da eşit.
    expect(landed).toBeLessThanOrEqual(
      feedMapFraming(BASE).campusScreenY + feedMapFraming(BASE).mapShift + 1e-9,
    );
  });

  it('şerit YOKKEN kampüs EKRANIN ortasına gidiyor', () => {
    const f = feedMapFraming(BASE);
    expect(f.campusScreenY + f.mapShift).toBeCloseTo(
      BASE.viewportHeight / 2,
      6,
    );
  });

  it('YUKARI KAYMA HİÇ YOK — dipte siyah şerit açılamaz', () => {
    /**
     * ⚠️ BU KURAL DEĞİŞTİ ve sebebi ürün tarafında: eski sınır
     * `-expandedBottomInset`ti ("açılan pay sheet'in ALTINDA kalıyor") ve
     * OPAK bir sheet varken doğruydu. Yüzey şeride dönüştü, zemini yok, yani
     * kutunun dibinden ayrılan her piksel ekranda SİYAH bir bant —
     * kullanıcının gördüğü hata buydu.
     */
    for (const inset of [0, 120, STRIP, 2000]) {
      const f = feedMapFraming({ ...BASE, expandedBottomInset: inset });
      expect(f.mapShift).toBeGreaterThanOrEqual(0);
    }
  });

  it('AŞAĞI kayma kutunun ÜST payını aşmıyor — tepede boşluk açılamaz', () => {
    const f = feedMapFraming(BASE);
    expect(f.mapShift).toBeLessThanOrEqual(-f.imageTop + 1e-9);
  });

  it('kırpma güvenlik ağı: şerit ekranı yutsa bile kutu açıkta kalmıyor', () => {
    // Patolojik girdi (pay ekrandan büyük): hedef merkez negatife düşüyor,
    // yani istenen kayma YUKARI. Kırpma onu 0'da tutuyor → kutu yerinde.
    const f = feedMapFraming({ ...BASE, expandedBottomInset: 2000 });
    expect(f.mapShift).toBe(0);
    expect(f.mapShift).toBeLessThanOrEqual(-f.imageTop + 1e-9);
  });

  // ── Ölçüm gelmeden ───────────────────────────────────────────────────────

  it('ölçüm gelmeden kutu KAYMIYOR', () => {
    const f = feedMapFraming({ ...BASE, ready: false });
    expect(f.imageTop).toBe(0);
    expect(f.boxHeight).toBe(BASE.viewportHeight);
    expect(f.campusScreenY).toBeCloseTo(BASE.viewportHeight / 2, 6);
  });

  // ── Clamp: chrome taşarsa ────────────────────────────────────────────────

  it('chrome ekranın ortasını geçerse kayma TEK YÖNLÜ kalıyor', () => {
    // Çok büyük dinamik punto / uzun çeviri: bant ekranın ortasının altına
    // düşüyor. Kutu AŞAĞI kaymaya kalksa tepede boşluk açardı.
    const f = feedMapFraming({ ...BASE, heroHeight: 700 });
    expect(f.imageTop).toBe(0);
    // Merkez o durumda ekran ortasına dönüyor — figür haritanın gerçek
    // merkezinden kopmuyor.
    expect(f.campusScreenY).toBeCloseTo(BASE.viewportHeight / 2, 6);
  });

  it('bant ne kadar uzarsa kampüs o kadar AŞAĞI iniyor', () => {
    const short = feedMapFraming({ ...BASE, bandHeight: 80 });
    const tall = feedMapFraming({ ...BASE, bandHeight: 160 });
    expect(tall.campusScreenY).toBeLessThan(short.campusScreenY);
  });
});

/**
 * KADRAJIN KURULUŞU KULLANICIYA GÖSTERİLMEZ.
 *
 * Harita üç adımda kuruluyor (ölçümler → kadraj/URL → görüntünün kendisi) ve
 * üçü ayrı anlarda bitiyor. Ekranda görünen şey "harita kıpırdıyor, yerine
 * oturuyor" oluyordu; iki ayrı belirtiyle:
 *   • geçişin ölçek payı (`TRANSITION_SCALE = 0.92`) görüntüyü kenarlardan
 *     içeri çekiyor ve bu katmanın ARKASINDA harita yok — ekranın zemini var,
 *     yani "harita yanlardan siyah olup ekrana oturuyor",
 *   • görüntü inene kadar kutu boş duruyor.
 * İkisinin de cevabı aynı: aynı kampüste HAREKET YOK, İSKELET var. Yönlü
 * süzülme yalnız gerçek kampüs değişiminde kalıyor — orası kullanıcının
 * bilinçli aksiyonu.
 *
 * Kaynak kuralı olarak test ediliyor: üçü de worklet/efekt içinde, çıktıları
 * ancak gerçek Reanimated runtime'ında ölçülebilir. Korunan şey YAPI.
 */
describe('harita kadraj geçişi', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as {
    readFileSync: (p: string, enc: string) => string;
  };
  const SOURCE = readFileSync(
    'src/features/feed/components/FeedMapStrip.tsx',
    'utf8',
  );

  it('ölçek YALNIZ yön vektörü varken (kampüs değişimi) uygulanıyor', () => {
    expect(SOURCE).toContain(
      '{ scale: v ? 1 - (1 - TRANSITION_SCALE) * p : 1 }',
    );
    expect(SOURCE).toContain(
      '{ scale: v ? TRANSITION_SCALE + (1 - TRANSITION_SCALE) * p : 1 }',
    );
  });

  it('aynı kampüste geçiş HİÇ BAŞLAMIYOR', () => {
    expect(SOURCE).toContain('const sameCampus = last.campus === current.campus');
    // Erken çıkış: `setPrevious`/`withTiming` o yolda hiç çalışmıyor, yani
    // ekranda kıpırdayan bir harita yok — iskelet URL değişimini kapatıyor.
    expect(SOURCE).toMatch(
      /if \(sameCampus\) \{\s*\n\s*vectorRef\.current = null;\s*\n\s*return;\s*\n\s*\}/,
    );
  });

  it('iskelet DÖRT koşulun hepsini bekliyor ve kalıcı olamıyor', () => {
    // Ölçüm + SINIRIN İNMESİ + doğru URL'in inmesi: hiçbiri eksikken harita
    // gösterilmiyor. `boundaryPending` burada şart — o olmadan okul
    // değiştirmek ara hâlleri (3B figür → ara kadraj → poligon) gösteriyordu.
    expect(SOURCE).toMatch(
      /const settled =\s*\n\s*heroReady &&\s*\n\s*!boundaryPending &&\s*\n\s*loadedUri !== null &&\s*\n\s*loadedUri === mapUri;/,
    );
    // Yüklenen URL karşılaştırmalı: kadraj değişince iskelet geri gelmeli.
    expect(SOURCE).toContain('onLoad={() => setLoadedUri(mapUri)}');
    // Hata da "oturdu" sayılıyor — çevrimdışında iskelet asılı kalmasın.
    expect(SOURCE).toContain('onError={() => setLoadedUri(mapUri)}');
    // Güvenlik ağı: sinyallerden biri hiç gelmezse süre dolunca açılıyor.
    expect(SOURCE).toContain('setForcedUri(mapUri), SKELETON_WATCHDOG_MS');
  });

  /**
   * ⚠️🔴 KAMPÜS DEĞİŞİMİNDE DE İSKELET — eski kuralın TERSİ.
   *
   * Burada bir dönem `!mapSettled && previous === null` çivili duruyordu:
   * "kampüs değişiminin yönlü hareketi iskeletle kapatılmaz". İstek bunu
   * reddetti ("direkt her şey skeletonda olsun, bitince direkt son hâlini
   * göreyim") çünkü o yol ara hâlleri gösteriyordu. İskelet artık yalnız
   * `revealed`e bakıyor; `previous` kapısı geri eklenirse belirti de geri
   * gelir.
   */
  it('iskelet kampüs değişiminde de duruyor — `previous` kapısı YOK', () => {
    expect(SOURCE).toContain('const skeletonWanted = !revealed;');
    expect(SOURCE).not.toContain('previous === null');
  });

  /**
   * 3B figür "sınır yok" demek; sınır HENÜZ İNMEDİYSE bu yanlış bir iddia.
   * Kapı kaldırılırsa okul değiştirirken bina bir an görünür (istek: olmasın).
   */
  it('3B okul figürü AÇILMADAN ÖNCE çizilmiyor', () => {
    expect(SOURCE).toContain('{heroReady && revealed && !showShape ? (');
  });
});

/**
 * SÖNÜMLEME KARTLARIN ALTINDA KALMALI.
 *
 * Harita çok parlaktı ve tamamına ince bir siyah perde çekildi
 * (`MAP_DIM_ALPHA`). Perdenin YERİ bir tercih değil, kuralın kendisi: harita
 * katmanının İÇİNDE duruyor ve o katman listenin ARKASINDA çiziliyor, yani
 * gönderi kartları ve kampüs kutuları perdenin ÜSTÜNDE kalıyor — sönen tek şey
 * harita.
 *
 * Perde ekran köküne (pager'ın üstüne) taşınsa kartlar da sönerdi ve belirti
 * sinsi olurdu: "kartlar biraz soluk" diye okunur, sebebi görünmez.
 */
describe('harita sönümlemesi', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as {
    readFileSync: (p: string, enc: string) => string;
  };
  const MAP = readFileSync(
    'src/features/feed/components/FeedMapStrip.tsx',
    'utf8',
  );
  const SCREEN = readFileSync(
    'src/features/feed/screens/FeedScreen.tsx',
    'utf8',
  );

  it('perde HARİTA KATMANININ içinde — ekran kökünde değil', () => {
    expect(MAP).toContain('scrimAt(MAP_DIM_ALPHA)');
    // Ekranda tam ekranı kaplayan bir sönümleme YOK: olsaydı kartları da
    // söndürürdü (kartlar pager'ın içinde, kökteki katmanların altında).
    expect(SCREEN).not.toContain('MAP_DIM');
  });

  it('harita katmanı LİSTEDEN ÖNCE çiziliyor — kartlar üstte', () => {
    // ⚠️ ÇAPA DEĞİŞTİ, KURAL DEĞİL: harita artık pager'ın İÇİNDE DEĞİL
    // ARKASINDA (iki sekmenin ortak zemini — bkz. feedMapBackdrop.test.ts).
    // "Önce harita, sonra liste" sırası aynen duruyor, yalnız harita bir
    // katman yukarıdan, kökten çiziliyor.
    const hero = SCREEN.indexOf('{mapHero}');
    const list = SCREEN.indexOf('key === "feed" ? listSlideStyle : null');
    expect(hero).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(hero);
  });

  it('perde FİGÜRÜN ALTINDA — okul işareti sönmüyor', () => {
    const dim = MAP.indexOf('scrimAt(MAP_DIM_ALPHA)');
    const figure = MAP.indexOf('<CampusFigure');
    expect(dim).toBeGreaterThan(-1);
    expect(figure).toBeGreaterThan(dim);
  });

  it('perde İNCE kalıyor — harita okunur olmak zorunda', () => {
    const match = MAP.match(/const MAP_DIM_ALPHA = ([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(0.25);
  });
});

/**
 * AKIŞTA BULANIK ZEMİN, TAM EKRANDA NET HARİTA.
 *
 * İstek: "akışta harita üstünde az blur olsun, expanded'a girersem yavaşça
 * blur'u açılsın". İki kural birden taşınıyor:
 *   • blur AKIŞA ait, yani tam ekranda SIFIRLANMAK zorunda (harita orada asıl
 *     içerik, zemin değil),
 *   • netleşme haritanın kendi açılışından (340ms) YAVAŞ olmalı — doğrudan
 *     `expandProgress`e bağlanan bir opaklık tam o 340ms'de biter ve "odaklandı"
 *     hissi kaybolur.
 *
 * Kaynak kuralı olarak test ediliyor: ikisi de worklet içinde, çıktıları ancak
 * gerçek Reanimated runtime'ında ölçülebilir.
 */
describe('haritanın genel bulanıklığı', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as {
    readFileSync: (p: string, enc: string) => string;
  };
  const MAP = readFileSync(
    'src/features/feed/components/FeedMapStrip.tsx',
    'utf8',
  );

  it('blur AZ kalıyor — kampüsün dokusu tanınır olmak zorunda', () => {
    const match = MAP.match(/const MAP_OVERVIEW_BLUR = (\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(25);
  });

  it('tetik EŞİK DEĞİL YÖN — kapanışta blur chrome\'la aynı anda geliyor', () => {
    /**
     * ── İki tur, iki hata ───────────────────────────────────────────────────
     * Eşik 0.5'teyken netleşme, çekme bittikten sonra bir süre DURUYORDU
     * ("blur asılı kaldı sonra birden açıldı"). 0.02'ye indirildi ve açılış
     * düzeldi ama KAPANIŞ bozuk kaldı: eşik ancak animasyonun SONUNDA
     * geçiliyor, yani bulanıklık akış geri geldikten SONRA 280ms boyunca
     * açılıyordu ("expanded'den çıkınca üstteki blur çok sonra geliyor").
     *
     * Yön okuması ikisini birden çözüyor ve yarıda kesilen hareketleri de
     * doğru görüyor — eşik tabanlı kurgu 0.6'dan dönen bir kapanışı hiç
     * görmüyordu.
     */
    expect(MAP).not.toContain('MAP_FOCUS_THRESHOLD');
    expect(MAP).toContain('if (p > prev && blurTarget.value !== 0) {');
    expect(MAP).toContain('if (p < prev && blurTarget.value !== 1) {');
    // Geri geliş HARİTANIN süresiyle: chrome 280ms'de dönüyor, blur da.
    expect(MAP).toContain('duration: MAP_MOTION_MS,\n          easing: mapMotionEasing,');
  });

  it('netleşme haritanın hareketinden YAVAŞ', () => {
    const focus = Number(MAP.match(/const MAP_FOCUS_MS = (\d+)/)![1]);
    // Eşit olursa "odaklandı" hissi yok; harita açılıp bitiyor, blur da onunla.
    expect(focus).toBeGreaterThan(MAP_MOTION_MS);
  });

  it('geri gelişi haritanın KAPANIŞIYLA eş — akışta blur hazır', () => {
    // Kapanış 280ms; blur geride kalırsa kullanıcı akışa döndüğünde zeminin
    // netten bulanığa kaydığını görür.
    expect(MAP).toContain('duration: MAP_MOTION_MS,');
    expect(MAP).toContain('easing: mapMotionEasing,');
  });

  it('kendi zamanlaması var — opaklık progress\'e DOĞRUDAN bağlı değil', () => {
    expect(MAP).toContain('useAnimatedReaction');
    // ⚠️ Opaklık AYRI bir paylaşılan değerden (`blurReveal`): `1 - progress`
    // yazılsaydı netleşme haritayla aynı 340ms'de biterdi.
    // Opaklık `blurDim`den, o da `blurReveal` × çekme payından; hiçbir
    // tüketici `expandProgress`i doğrudan opaklığa çevirmiyor.
    const style = MAP.slice(MAP.indexOf('const overviewBlurStyle'));
    expect(style.slice(0, 200)).toContain('opacity: blurDim.value');
    expect(style.slice(0, 200)).not.toContain('expandProgress');
  });

  it('mount anında animasyon TETİKLENMİYOR (prev null kapısı)', () => {
    // Reaksiyon ilk turda karşılaştırmasız koşuyor; kapı olmasa akışta blur
    // bir kez açılıp kapanırdı.
    expect(MAP).toContain('if (prev === null) return;');
  });

  it('ÜST BANT da aynı değerden sönüyor — "bir anda azalıyor" şikâyetinin kuralı', () => {
    /**
     * Okunabilirlik bandı `1 - expandProgress`e bağlıyken haritanın 280ms'lik
     * hareketiyle sönüyordu ve ekranın üstü bir anda açılıyor gibi
     * okunuyordu. İki blur artık TEK paylaşılan değerden sürülüyor: ayrı ayrı
     * ayarlanamazlar, dolayısıyla ayrışamazlar.
     */
    // ⚠️ İKİ BLUR TEK DEĞERDEN: ayrı yazıldıkları dönemde biri çekmeye
    // bağlıydı, diğeri doğrudan ilerlemeye — ekranın üstü bir anda açılırken
    // zemin yavaşça netleşiyordu, yani tek hareket iki hızda görünüyordu.
    //
    // ⚠️ ÇEKMENİN ÇARPANI KALKTI (jest üründen çıktı, istek): değer artık tek
    // terim. Korunan kural ÇARPANIN SAYISI DEĞİL, iki katmanın AYNI değeri
    // okuması — ikinci bir terim eklenecekse ikisine birden eklenmeli.
    expect(MAP).toContain('const blurDim = useDerivedValue(() => blurReveal.value)');
    expect(MAP).not.toContain('opacity: 1 - expandProgress.value');
    // Her iki katman da aynı türetilmiş değeri okuyor.
    const dimReaders = MAP.split('opacity: blurDim.value').length - 1;
    expect(dimReaders).toBe(2);
  });

  it('blur FİGÜRÜN ALTINDA — okul işareti keskin kalıyor', () => {
    const blur = MAP.indexOf('intensity={MAP_OVERVIEW_BLUR}');
    const figure = MAP.indexOf('<CampusFigure');
    expect(blur).toBeGreaterThan(-1);
    expect(figure).toBeGreaterThan(blur);
  });
});

/**
 * YATAY KADRAJ — kampüs akışta SOLDA, tam ekranda ortada.
 *
 * Buradaki değişmez KAPSAMA: kutu sola uzatılarak kampüs sola alınıyor ve
 * kayma boyunca kutunun ekranı kaplaması bozulmamak zorunda. Bozulursa belirti
 * haritanın kenarında bir ŞERİT olur (sayfanın zemini) — dikeyde yaşanmış,
 * gerekçesi `feedMapFraming` içinde yazılı.
 */
describe('feedMapHorizontal', () => {
  const WIDTH = 393;
  const COLUMN = feedMapCampusColumn(WIDTH);

  const H = (over?: Partial<FeedMapHorizontalArgs>) =>
    feedMapHorizontal({
      viewportWidth: WIDTH,
      columnWidth: COLUMN,
      ready: true,
      ...over,
    });

  it('kampüs SÜTUNUN ortasında — ekranın ortasında DEĞİL', () => {
    const h = H();
    expect(h.campusScreenX).toBeCloseTo(COLUMN / 2, 6);
    expect(h.campusScreenX).toBeLessThan(WIDTH / 2);
  });

  it('kutu ekranı KAPLIYOR: sol kenar dışarıda, sağ kenar tam ekranın sağında', () => {
    const h = H();
    expect(h.imageLeft).toBeLessThan(0);
    expect(h.imageLeft + h.boxWidth).toBeCloseTo(WIDTH, 6);
  });

  it('kutunun MERKEZİ kampüs noktası — `cover` oraya oturtuyor', () => {
    const h = H();
    expect(h.imageLeft + h.boxWidth / 2).toBeCloseTo(h.campusScreenX, 6);
  });

  it('TAM EKRANDA kampüs ortaya dönüyor ve kenar AÇILMIYOR', () => {
    const h = H();
    expect(h.campusScreenX + h.mapShiftX).toBeCloseTo(WIDTH / 2, 6);
    // Kayma sonrası kutu hâlâ ekranı kaplıyor (iki uç da dışarıda/kenarda).
    expect(h.imageLeft + h.mapShiftX).toBeLessThanOrEqual(0);
    expect(h.imageLeft + h.boxWidth + h.mapShiftX).toBeGreaterThanOrEqual(
      WIDTH,
    );
  });

  it('ölçüm gelmeden kutu KAYMIYOR — kampüs ortada', () => {
    const h = H({ ready: false });
    expect(h).toEqual({
      imageLeft: 0,
      boxWidth: WIDTH,
      campusScreenX: WIDTH / 2,
      mapShiftX: 0,
    });
  });

  it('sütun ekranın yarısından genişse kayma YOK — tek yönlü', () => {
    const h = H({ columnWidth: WIDTH });
    expect(h.campusScreenX).toBeCloseTo(WIDTH / 2, 6);
    expect(h.mapShiftX).toBeCloseTo(0, 6);
    expect(h.boxWidth).toBeCloseTo(WIDTH, 6);
  });
});

/**
 * TAM EKRANDA POLİGONA YAKINLAŞMA.
 *
 * İsteğin iki yarısı da burada çivili: "biraz zoom in" VE "ekrandan
 * taşmayacak şekilde". İkincisi sabit bir çarpanla sağlanamıyor — kampüsler
 * arasında 50 kat büyüklük farkı var (tek bina ↔ 4 km²), o yüzden ölçek
 * şeklin GERÇEK ekran ölçüsünden türüyor.
 */
describe('feedMapExpandScale', () => {
  const FIT = (over?: Partial<Parameters<typeof feedMapExpandScale>[0]>) =>
    feedMapExpandScale({
      shapeWidth: 120,
      shapeHeight: 90,
      viewportWidth: 393,
      viewportHeight: 600,
      padding: 96,
      maxScale: 1.8,
      ...over,
    });

  it('küçük şekilde TAVANDA duruyor — sonsuza büyümüyor', () => {
    expect(FIT({ shapeWidth: 20, shapeHeight: 20 })).toBe(1.8);
  });

  it('ölçek SIĞAN eksenden geliyor', () => {
    // Dar ve UZUN şekil: yükseklik sınırlıyor → (600−96)/480 = 1.05.
    expect(FIT({ shapeWidth: 40, shapeHeight: 480 })).toBeCloseTo(1.05, 2);
  });

  it('ölçeklenen şekil kenar payının İÇİNDE kalıyor — taşma yok', () => {
    const shape = { shapeWidth: 200, shapeHeight: 150 };
    const scale = FIT(shape);
    expect(shape.shapeWidth * scale).toBeLessThanOrEqual(393 - 96 + 0.01);
    expect(shape.shapeHeight * scale).toBeLessThanOrEqual(600 - 96 + 0.01);
  });

  it('şekil zaten ekrandan büyükse 1 — tam ekrana geçerken UZAKLAŞMIYOR', () => {
    expect(FIT({ shapeWidth: 900, shapeHeight: 700 })).toBe(1);
  });

  it('ölçüsüz şekilde 1 — sıfıra bölme yok', () => {
    expect(FIT({ shapeWidth: 0, shapeHeight: 0 })).toBe(1);
  });
});
