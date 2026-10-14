/**
 * Boş deste metni + aksiyonu (2026-08-27 kuralı).
 *
 * Test edilen asıl şey: mesafe sınırı hâlâ uygulanıyorken "Mesafe sınırını
 * kaldır" teklifi deste HANGİ sebeple boşalırsa boşalsın çıkıyor mu. Eskiden
 * teklif yalnız backend `NoCandidatesInRadius` dediğinde çiziliyordu; sebep
 * sınıflandırması yaklaşık olduğu için ("hepsini gördün" / "filtrelerin dar" /
 * hiç sebep gelmemesi) kullanıcı çoğu boş destede tek işe yarayan çözümü hiç
 * görmüyordu.
 *
 * İkinci kritik nokta ters yön: teklif sebebin kendi aksiyonunu EZMEMELİ.
 * Swipe limiti dolmuşken "Premium'u incele" yerine mesafe teklifi koymak hem
 * yanlış (mesafe tek kart bile getirmez) hem de dönüşüm kaybı.
 */

import {
  resolveEmptyDeckCopy,
  type EmptyDeckCopyInput,
} from '@/features/discover/emptyDeckCopy';
import { resolveCode } from '@/shared/constants/responseCodes';

// i18n yerine anahtarın kendisini döndür: test metne değil, HANGİ anahtarın
// seçildiğine bakıyor (metin sözlükte değişebilir, karar değişmemeli).
const t = (key: string) => key;

const REMOVE_DISTANCE = 'discover.empty.noCandidatesInRadius.action';

const copyFor = (
  reason: string | null,
  overrides: Partial<EmptyDeckCopyInput> = {},
) =>
  resolveEmptyDeckCopy({
    entry: reason ? resolveCode(null, reason as any) : null,
    distanceLimitOff: false,
    deckSettled: true,
    t,
    ...overrides,
  });

describe('mesafe sınırı AÇIKKEN (anahtar kapalı)', () => {
  it('sebep NoCandidatesInRadius ise teklif birincil butondur', () => {
    const copy = copyFor('NoCandidatesInRadius');
    expect(copy?.actionKind).toBe('removeDistanceLimit');
    expect(copy?.actionLabel).toBe(REMOVE_DISTANCE);
    // Sebebin kendi aksiyonu zaten bu → ikinci kez teklif edilmez.
    expect(copy?.secondaryLabel).toBeNull();
  });

  it('sebebin kendi butonu varsa teklif İKİNCİL satıra biner', () => {
    // Birincil buton sebebin butonu olarak KALIYOR: "Filtrelerin çok dar"
    // derken kullanıcıyı filtre ekranından mahrum bırakmıyoruz.
    const copy = copyFor('FiltersTooStrict');
    expect(copy?.actionKind).toBe('openFilters');
    expect(copy?.secondaryLabel).toBe(REMOVE_DISTANCE);
  });

  it('geçici sebeplerde de teklif edilir (PoolWarming)', () => {
    const copy = copyFor('PoolWarming');
    expect(copy?.actionKind).toBe('retry');
    expect(copy?.secondaryLabel).toBe(REMOVE_DISTANCE);
  });

  it('butonsuz sebepte (dismiss) teklif birincil butona oturur', () => {
    // "Görebileceklerinin hepsini gördün" → eskiden ekranda HİÇ buton yoktu.
    // Yarıçap dışında bakılmamış profiller varken bu bir çıkmaz.
    const copy = copyFor('AllCandidatesSeen');
    expect(copy?.actionKind).toBe('removeDistanceLimit');
    expect(copy?.actionLabel).toBe(REMOVE_DISTANCE);
    expect(copy?.title).toBe('discover.empty.allCandidatesSeen.title');
  });

  it('sebep hiç çözülemediğinde bile teklif eder', () => {
    // Bilinmeyen kod / alan hiç gelmiyor. Eskiden yalnız radar dönüyordu.
    const copy = copyFor(null);
    expect(copy?.title).toBe('discover.empty.unknown.title');
    expect(copy?.actionKind).toBe('removeDistanceLimit');
  });

  it('deste daha oturmamışken sebepsiz metin YAZMAZ', () => {
    // Yükleme sürerken "kimse yok" demek yalan; deste bir saniye sonra dolabilir.
    expect(copyFor(null, { deckSettled: false })).toBeNull();
  });
});

describe('mesafenin çözemeyeceği kapılar', () => {
  it.each([
    ['SwipeLimitReached', 'openPaywall'],
    ['ProfileIncomplete', 'completeProfile'],
    ['AccountRestricted', 'contactSupport'],
  ])('%s → teklif YOK, sebebin aksiyonu korunur', (reason, kind) => {
    const copy = copyFor(reason);
    expect(copy?.actionKind).toBe(kind);
    expect(copy?.secondaryLabel).toBeNull();
  });
});

describe('mesafe sınırı ZATEN kapalıyken', () => {
  const off = { distanceLimitOff: true };

  it('teklif hiçbir sebepte çizilmez', () => {
    // Basmak hiçbir şeyi değiştirmez; kullanıcı aynı boş desteye bakmaya
    // devam eder ve buton bozuk sanılır.
    expect(copyFor('FiltersTooStrict', off)?.secondaryLabel).toBeNull();
    expect(copyFor('AllCandidatesSeen', off)?.actionKind).toBe('dismiss');
    expect(copyFor('PoolWarming', off)?.secondaryLabel).toBeNull();
  });

  it('NoCandidatesInRadius aksiyonsuz kalmaz, filtrelere düşer', () => {
    const copy = copyFor('NoCandidatesInRadius', off);
    expect(copy?.actionKind).toBe('openFilters');
    expect(copy?.actionLabel).toBe('discover.empty.filtersTooStrict.action');
  });

  it('sebepsiz durumda metin de göstermez (eski davranış: radar)', () => {
    expect(copyFor(null, off)).toBeNull();
  });
});

describe('başlık kaynağı', () => {
  it('i18n karşılığı backend metnini yener', () => {
    // `t` burada anahtarı döndürüyor = i18n karşılığı VAR demek.
    const copy = copyFor('FiltersTooStrict', {
      backendMessage: 'Backend metni',
    });
    expect(copy?.title).toBe('discover.empty.filtersTooStrict.title');
  });

  it('i18n karşılığı yoksa backend metnine düşer', () => {
    // defaultValue'yu döndüren `t` = anahtar sözlükte yok senaryosu.
    const copy = resolveEmptyDeckCopy({
      entry: resolveCode(null, 'FiltersTooStrict' as any),
      backendMessage: 'Backend metni',
      distanceLimitOff: true,
      deckSettled: true,
      t: (_key, opts) => opts?.defaultValue ?? _key,
    });
    expect(copy?.title).toBe('Backend metni');
  });
});

/**
 * MOD KAPISI (UT-2302 / UT-2304) — her şeyden ÖNCE değerlendiriliyor.
 *
 * Bu iki kodda deste "boşalmadı", o modun HAVUZU HİÇ YOK. Mesafe sınırını
 * kaldırmayı teklif etmek yalan olurdu: sınır kalksa da tek kart gelmez.
 *
 * ⚠️ İKİ KOD AYRI MESAJ VE AYRI AKSİYON taşıyor; ikisi de "Friends yok"
 * demiyor. 2302 ÖZELLİK kapalı (yapılacak bir şey yok), 2304 KULLANICI
 * profilini açmamış (açabilir). Aynı mesajla karşılamak, açabileceği bir modu
 * "kapalı" diye göstermek olurdu.
 */
describe('mod kapısı — mesafe/filtre tavsiyesini EZİYOR', () => {
  it('UT-2302 (özellik kapalı) → aksiyon YOK', () => {
    const copy = resolveEmptyDeckCopy({
      entry: null,
      distanceLimitOff: false, // mesafe sınırı AÇIK: normalde teklif çıkardı
      deckSettled: true,
      modeCode: 'UT-2302',
      mode: 'Friends',
      t,
    });
    expect(copy?.modeAction).toBe('none');
    expect(copy?.actionLabel).toBeNull();
    // Mesafe teklifi SIZMAMALI.
    expect(copy?.secondaryLabel).toBeNull();
    expect(copy?.title).toBe('discover.empty.modeDisabled.title');
  });

  it('UT-2304 (kullanıcı modu açmamış) → "Profili aç" aksiyonu', () => {
    const copy = resolveEmptyDeckCopy({
      entry: null,
      distanceLimitOff: false,
      deckSettled: true,
      modeCode: 'UT-2304',
      mode: 'Friends',
      t,
    });
    expect(copy?.modeAction).toBe('openModeSetup');
    expect(copy?.actionLabel).toBe('discover.mode.openCta');
    expect(copy?.title).toBe('discover.mode.lockedTitle.Friends');
    expect(copy?.secondaryLabel).toBeNull();
  });

  it('UT-2304 başlığı MODA GÖRE isimlendiriliyor', () => {
    const dating = resolveEmptyDeckCopy({
      entry: null,
      distanceLimitOff: false,
      deckSettled: true,
      modeCode: 'UT-2304',
      mode: 'Dating',
      t,
    });
    expect(dating?.title).toBe('discover.mode.lockedTitle.Dating');
  });

  it('mod kapısı SEBEBİN kendi aksiyonunu da eziyor', () => {
    // Swipe limiti dolmuş AMA mod da kapalı: mod kapısı önce, çünkü limit
    // yenilense bile o modda kart gelmez.
    const copy = resolveEmptyDeckCopy({
      entry: resolveCode(null, 'SwipeLimitReached'),
      distanceLimitOff: true,
      deckSettled: true,
      modeCode: 'UT-2302',
      mode: 'Friends',
      t,
    });
    expect(copy?.modeAction).toBe('none');
  });

  it('mod kodu YOKSA normal akış bozulmuyor', () => {
    const copy = resolveEmptyDeckCopy({
      entry: null,
      distanceLimitOff: false,
      deckSettled: true,
      modeCode: null,
      t,
    });
    expect(copy?.modeAction).toBeUndefined();
    expect(copy?.actionKind).toBe('removeDistanceLimit');
  });

  it('ALAKASIZ bir kod mod kapısını tetiklemiyor', () => {
    const copy = resolveEmptyDeckCopy({
      entry: null,
      distanceLimitOff: false,
      deckSettled: true,
      modeCode: 'UT-6101',
      t,
    });
    expect(copy?.modeAction).toBeUndefined();
  });
});
