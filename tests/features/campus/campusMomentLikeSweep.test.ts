import { likeWithFlameSweep } from '@/features/campus/campusMomentLikeSweep';

/**
 * TİK → ALEV → ÖRTÜ ALTINDA KAPANIŞ.
 *
 * Beğeni isteği örtüyü BEKLEMİYOR (paralel gidiyor); kapanış ise alevin
 * örtüsünü bekliyor — örtü açıldıktan sonra küçülen bir kart "geri kaçtı" gibi
 * okunuyor.
 *
 * ⚠️🔴 ÇİVİLENEN ASIL ŞEY KOTA DALI: hak bitmişken `like` paywall açıp dönüyor,
 * yani ortada gönderilmiş bir beğeni YOK. Alev yine oynasaydı kullanıcı günlük
 * tek ve geri alınamaz kararını harcadığını sanırdı.
 */

const deps = (over: Partial<Parameters<typeof likeWithFlameSweep>[0]> = {}) => {
  const like = jest.fn();
  const startSweep = jest.fn();
  const collapse = jest.fn();
  return {
    args: { exhausted: false, like, startSweep, collapse, ...over },
    like,
    startSweep,
    collapse,
  };
};

it('beğeni gidiyor ve alev HOLD ile başlıyor', () => {
  const { args, like, startSweep } = deps();
  likeWithFlameSweep(args);
  expect(like).toHaveBeenCalledTimes(1);
  expect(startSweep).toHaveBeenCalledTimes(1);
});

it('örtü kapanınca kart küçülmeye başlıyor — önce DEĞİL', () => {
  const { args, startSweep, collapse } = deps();
  likeWithFlameSweep(args);
  expect(collapse).not.toHaveBeenCalled();
  // Alev katmanı "örtündüm" diyor:
  startSweep.mock.calls[0][0]();
  expect(collapse).toHaveBeenCalledTimes(1);
});

it('KOTA BİTMİŞKEN: yalnız paywall — alev YOK, kapanış YOK', () => {
  const { args, like, startSweep, collapse } = deps({ exhausted: true });
  likeWithFlameSweep(args);
  // Paywall'ı `like`ın kendisi açıyor, o yüzden yine çağrılıyor.
  expect(like).toHaveBeenCalledTimes(1);
  expect(startSweep).not.toHaveBeenCalled();
  expect(collapse).not.toHaveBeenCalled();
});
