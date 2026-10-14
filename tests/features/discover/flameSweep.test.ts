// uiBus gerçek modülü reanimated'ın `makeMutable`ını çağırıyor (shared
// value'lar) — burada ölçtüğümüz şey olay akışı, o yüzden otobüsü sadeleştirip
// emit/on'u elle sürüyoruz (FirePullHint testindeki kaçışın aynısı).
const mockEmit = jest.fn();
const mockListeners = new Map<string, Set<(p?: unknown) => void>>();
jest.mock('@/shared/services/uiBus', () => ({
  __esModule: true,
  default: {
    emit: (event: string, payload?: unknown) => {
      mockEmit(event, payload);
      mockListeners.get(event)?.forEach((fn) => fn(payload));
    },
    on: (event: string, fn: (p?: unknown) => void) => {
      const set = mockListeners.get(event) ?? new Set();
      set.add(fn);
      mockListeners.set(event, set);
      return () => set.delete(fn);
    },
  },
}));

import { runFlameSweep, runMatchCurtain } from '@/features/discover/flameSweep';

/** Canvas'ın (ya da yedek zamanlayıcının) "ekranı kapattım" haberi. */
const fireCover = () =>
  mockListeners.get('flameSweepCover')?.forEach((fn) => fn());
/** MatchModal'ın perdesi ekranı kapladı. */
const fireCurtainCover = () =>
  mockListeners.get('matchCurtainCover')?.forEach((fn) => fn());
/** SignalR eşleşme bildirimi (AppNavigator yayınlıyor). */
const fireMatch = () => mockListeners.get('match')?.forEach((fn) => fn());

describe('flameSweep', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    mockListeners.clear();
  });

  it('aleve başlıyor ve örtme olayına abone oluyor', () => {
    // İki iş birden: dalgayı tetiklemek ve kart değişimini onun saatine
    // bağlamak. Abonelik olmadan deste hiç ilerlemezdi.
    const unsub = runFlameSweep(() => {});
    expect(mockEmit).toHaveBeenCalledWith('flameSweep', undefined);
    expect(mockListeners.get('flameSweepCover')?.size).toBe(1);
    unsub();
  });

  it('onCovered TAM BİR KEZ çalışıyor', () => {
    // Örtme olayının iki kaynağı var (canvas + yedek zamanlayıcı, bkz.
    // FireFlame); ikisi birden gelirse deste iki adım ilerlerdi.
    const covered = jest.fn();
    runFlameSweep(covered);
    fireCover();
    fireCover();
    expect(covered).toHaveBeenCalledTimes(1);
  });

  it('unsub sonrası örtme haberi YAZMIYOR', () => {
    // Çağıran örtmeden önce ağaçtan düşebiliyor (deste tazelendi, sekme
    // değişti, tema remount'u) — sökülmüş ağaca yazmak sözleşme ihlali.
    const late = jest.fn();
    const cancel = runFlameSweep(late);
    cancel();
    fireCover();
    expect(late).not.toHaveBeenCalled();
    expect(mockListeners.get('flameSweepCover')?.size ?? 0).toBe(0);
  });

  it('eşleşme dalı: deste PERDE ekranı kaplayınca ilerliyor', () => {
    // İstek: "önce modal gelsin, kart arkasında değişsin." Bu dalda süpürme
    // oynamıyor (kutlama MatchModal'ın) ve örtüyü perde kuruyor.
    jest.useFakeTimers();
    const advance = jest.fn();
    runMatchCurtain(advance);
    fireMatch();
    jest.advanceTimersByTime(1200);
    expect(advance).not.toHaveBeenCalled();
    fireCurtainCover();
    expect(advance).toHaveBeenCalledTimes(1);
    // Perde örttükten sonra gelen hiçbir şey ikinci kez ilerletmemeli.
    jest.advanceTimersByTime(10_000);
    fireCurtainCover();
    expect(advance).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('perde gelmezse ÖRTÜYÜ KENDİMİZ kuruyoruz — açıkta değişim YOK', () => {
    // İstek: "her türlü perde tam ekranı kaplamışken arkada değişmesi lazım,
    // kassa bile." `willMatchOnLike` bir kestirim; yanlışsa ya da bildirim
    // kaybolursa zaman aşımı desteyi İLERLETMİYOR, kendi alevimizi oynatıyor
    // ve devir onun örtüsünün altında oluyor.
    jest.useFakeTimers();
    const advance = jest.fn();
    runMatchCurtain(advance);
    jest.advanceTimersByTime(1499);
    expect(mockEmit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    // Alev başladı ama deste HENÜZ ilerlemedi: örtme bekleniyor.
    expect(mockEmit).toHaveBeenCalledWith('flameSweep', undefined);
    expect(advance).not.toHaveBeenCalled();
    fireCover();
    expect(advance).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('kendi alevimiz devraldıktan sonra gecikmiş perde ikinci kez ilerletmiyor', () => {
    // Patolojik yol: yedek süpürme başladıktan sonra perde de açılabilir.
    // Devrin tek sahibi süpürme — yoksa deste iki adım atardı.
    jest.useFakeTimers();
    const advance = jest.fn();
    runMatchCurtain(advance);
    jest.advanceTimersByTime(1501);
    fireCover();
    fireCurtainCover();
    expect(advance).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('bildirim gelince pencere UZUYOR — modal fotoğrafları bekliyor olabilir', () => {
    // MatchModal kendi 3 sn'lik fotoğraf emniyet kemerini bekleyebiliyor;
    // kısa pencere tam o yavaş açılışta kartı erken değiştiriyordu.
    jest.useFakeTimers();
    const advance = jest.fn();
    runMatchCurtain(advance);
    jest.advanceTimersByTime(1000);
    fireMatch();
    // Kısa pencere artık geçersiz: bildirim var, kutlama kesin.
    jest.advanceTimersByTime(3000);
    expect(advance).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
    fireCurtainCover();
    expect(advance).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('uzun pencere de dolarsa yine örtü altında ilerliyor', () => {
    // Modal hiç açılmadı (gate kapalı, uygulama arkaplandan döndü): bildirim
    // gelmiş olsa bile devir örtüsüz yapılmıyor.
    jest.useFakeTimers();
    const advance = jest.fn();
    runMatchCurtain(advance);
    fireMatch();
    jest.advanceTimersByTime(5001);
    expect(mockEmit).toHaveBeenCalledWith('flameSweep', undefined);
    expect(advance).not.toHaveBeenCalled();
    fireCover();
    expect(advance).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('eşleşme dalında unsub sonrası ilerletme YOK', () => {
    // Ekran ağaçtan düşebiliyor (sekme değişti, tema remount'u). Yedek
    // süpürme kurulmuşsa onun aboneliği de bırakılıyor.
    jest.useFakeTimers();
    const advance = jest.fn();
    const cancel = runMatchCurtain(advance);
    cancel();
    fireMatch();
    jest.advanceTimersByTime(10_000);
    fireCurtainCover();
    fireCover();
    expect(advance).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('yedek süpürme başladıktan SONRA iptal edilirse de ilerletmiyor', () => {
    jest.useFakeTimers();
    const advance = jest.fn();
    const cancel = runMatchCurtain(advance);
    jest.advanceTimersByTime(1501);
    cancel();
    fireCover();
    expect(advance).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('üst üste iki süpürme birbirinin örtmesini çalmıyor', () => {
    // Geri al alevi sürerken bir çıkış basışı gelebiliyor: her çağıran KENDİ
    // aboneliğini taşıyor, örtme haberi ikisine de gidiyor ve her biri tam
    // bir kez tetikleniyor.
    const first = jest.fn();
    const second = jest.fn();
    runFlameSweep(first);
    runFlameSweep(second);
    fireCover();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
