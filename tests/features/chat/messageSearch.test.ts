import {
  MIN_SEARCH_LENGTH,
  prepareSearchQuery,
  highlightSegments,
} from '@/features/chat/messageSearch';

/**
 * `messageSearch.ts` SAF — bu dosya store/DB/network kurmuyor, hiçbir
 * `jest.mock` gerektirmiyor (chatRepository'nin SQL testleriyle karışmasın
 * diye bilerek ayrı dosya, bkz. tests/features/chat/messageSearchRepo.test.ts).
 */
describe('prepareSearchQuery', () => {
  // Review Focus 4 — yalnız noktalamadan oluşan sorgu null dönüyor, her şeyi
  // döndürmüyor. `conversationMatchesQuery` (sohbet listesi filtresi) boş
  // sorguda `true` döner; burada tam tersi ispatlanmak zorunda, yoksa arama
  // ekranı boş kutuda tüm arşivi listeler.
  it('yalnız noktalamadan oluşan sorgu null dönüyor — her şeyi döndürmüyor', () => {
    expect(prepareSearchQuery('...')).toBeNull();
    expect(prepareSearchQuery('???')).toBeNull();
    expect(prepareSearchQuery('   ')).toBeNull();
    expect(prepareSearchQuery('a')).toBeNull(); // MIN_SEARCH_LENGTH altı
    expect(prepareSearchQuery('  IŞık ')).toBe('isik');
  });

  it('MIN_SEARCH_LENGTH tam sınırında geçer, bir eksiğinde geçmez', () => {
    // Bu test MIN_SEARCH_LENGTH sabitinin DEĞERİNİ değil DAVRANIŞINI pinliyor:
    // sabit değişse bile sınır testi anlamını korur.
    const atLimit = 'x'.repeat(MIN_SEARCH_LENGTH);
    const belowLimit = 'x'.repeat(MIN_SEARCH_LENGTH - 1);
    expect(prepareSearchQuery(atLimit)).toBe(atLimit);
    expect(prepareSearchQuery(belowLimit)).toBeNull();
  });

  it('katlama sohbet adı aramasıyla AYNI kuralı kullanıyor: "ISIK" → "isik"', () => {
    expect(prepareSearchQuery('ISIK')).toBe('isik');
  });

  it('baştaki/sondaki boşluk kırpılıyor, ortadaki korunuyor', () => {
    expect(prepareSearchQuery('  iki kelime  ')).toBe('iki kelime');
  });

  // Review turu 3, Önemli — `MIN_SEARCH_LENGTH` BYPASS ediliyordu: ham dize
  // uzunluğu 2 karakterdi ('a%') ve bir harf taşıyordu, eski kontrol bunu
  // GEÇERLİ sayıyordu. Tokenize edilince TEK harfli 'a' tokenine iniyor —
  // yani arşivin TAMAMI üzerinde bir harflik bir ön ek taraması
  // (debouncesız bir arama kutusunda, bkz. Task 4'ün `onChangeText`i).
  it('MIN_SEARCH_LENGTH token BAZINDA uygulanıyor — "a%" ayraç atılınca tek harfe iniyor, BYPASS edilemiyor', () => {
    expect(prepareSearchQuery('a%')).toBeNull();
    expect(prepareSearchQuery('a_')).toBeNull();
    expect(prepareSearchQuery('.a.')).toBeNull();
  });

  // Review turu 3 — karar: HERHANGİ BİR token eşiği geçerse YETERLİ, hepsinin
  // geçmesi GEREKMEZ. "ali v" kullanıcının yazarken geçtiği gerçekçi bir ara
  // durum (ikinci kelimeye yeni başlamış); tüm tokenları şart koşsaydık bu
  // dizi TAMAMEN reddedilir ve "ali" ile zaten görünen sonuçlar ekrandan
  // kaybolurdu.
  it('çok tokenlı sorguda YALNIZ BİRİ eşiği geçse yeterli — "ali v" reddedilmiyor', () => {
    expect(prepareSearchQuery('ali v')).toBe('ali v');
    expect(prepareSearchQuery('v ali')).toBe('v ali');
  });
});

/**
 * Review turu 1, Önemli 1 — önceki sürüm `content`i katlanmamış bir regex'le
 * arayıp parçayı `toLocaleLowerCase('tr')` ile katlanmış bir `matchSet`e karşı
 * kontrol ediyordu. "IŞIK" sorgusu "isik" (içerikte KATLANMIŞ hâliyle duran,
 * gerçekçi bir mesaj: kullanıcı Türkçe klavyesiz "isik" yazmış) içeriğinde HİÇ
 * BULUNAMIYORDU — regex harfi harfine "IŞIK" arıyor, katlanmış içeriği hiç
 * görmüyordu. Satır dönüyordu (SQL katlanmış arıyor) ama vurgu asla
 * ÇİZİLMİYORDU. Bu suite artık `highlightSegments`i `messageSearch.ts`e
 * taşındığı (ve `tokenizeFolded`i paylaştığı) için PİNLİYOR.
 */
describe('highlightSegments', () => {
  it('"ISIK" sorgusu katlanmış "isik" içeriğini VURGULUYOR — eski regex hatası', () => {
    const segs = highlightSegments('isik aciyor', 'isik');
    expect(segs.map((s) => ({ text: s.text, match: s.match }))).toEqual([
      { text: 'isik', match: true },
      { text: ' aciyor', match: false },
    ]);
  });

  it('Türkçe katlanmış sorgu orijinal (katlanmamış) içerikteki karşılığını buluyor: "isik" → "IŞIK"', () => {
    const segs = highlightSegments('IŞIK yanıyor', 'isik');
    expect(segs[0]).toEqual({ text: 'IŞIK', match: true });
    expect(segs[1].match).toBe(false);
  });

  it('kelime İÇİNDE geçen bir alt dizeyi vurgulamıyor — yalnız kelime BAŞI', () => {
    // searchMessages'ın kendisi "yanlışinema" gibi bir satırı HİÇ döndürmez
    // (kelime başı ön ek kuralı, chatRepository.ts); vurgu da aynı kuralı
    // uygulamak zorunda, yoksa SQL'in asla üretmeyeceği bir eşleşmeyi çizer.
    const segs = highlightSegments('yanlışinema oldu', 'sinema');
    expect(segs.every((s) => !s.match)).toBe(true);
  });

  it('eşleşme YOKSA tüm içerik tek, vurgusuz parça', () => {
    expect(highlightSegments('merhaba dünya', 'zeynep')).toEqual([
      { text: 'merhaba dünya', match: false },
    ]);
  });

  it('MIN_SEARCH_LENGTH altındaki token vurguya KATILMIYOR (kozmetik filtre)', () => {
    // "sinema g" — ikinci kelimeye yeni başlanmış, gerçekçi bir yazma anı.
    // SQL tarafı "g"yi hâlâ dar bir AND terimi olarak kullanıyor (DEĞİŞMEDİ),
    // ama her tek harfi ekranda kalınlaştırmak salt gürültü olurdu.
    const segs = highlightSegments('git sinemaya', 'sinema g');
    const bolded = segs.filter((s) => s.match).map((s) => s.text);
    expect(bolded).toEqual(['sinema']);
  });

  it('boş sorguda/içerikte çökmeden vurgusuz tek parça döner', () => {
    expect(highlightSegments('merhaba', '')).toEqual([{ text: 'merhaba', match: false }]);
    expect(highlightSegments('', 'merhaba')).toEqual([{ text: '', match: false }]);
  });
});
