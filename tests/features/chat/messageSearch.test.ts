import { MIN_SEARCH_LENGTH, prepareSearchQuery } from '@/features/chat/messageSearch';

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
