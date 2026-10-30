import uiBus from "@/shared/services/uiBus";

/**
 * Ekranı kaplayan alev kutlaması + desteyi ÖRTÜNÜN ALTINDA ilerletme.
 *
 * KEŞİF'TE KARTIN TEK DEĞİŞME YOLU (2026-10-13 isteğiyle genişledi): geç ·
 * beğen · Fire · not · GERİ AL — hepsinde kart fırlamıyor, yerinde duruyor;
 * dalga alttan yukarı süpürürken ekranı tam kapattığı anda deste bir adım
 * ilerliyor (geri al'da bir adım geri). Kullanıcı ne gidenin ne gelenin
 * karesini görüyor — yalnız kutlamayı. Zamanlama ölçülüyor, tahmin
 * edilmiyor: canvas kendi animasyon saatinden "kapandım" diyor (bkz.
 * flameWaveGeometry / coverMs).
 *
 * Kutlama bütün eylemlerde BİREBİR aynı: ortada duran premium alev rozeti
 * hangi eylemden geldiğini söylemiyor, o yüzden burada bir "tür" parametresi
 * de yok. Ayrışması gerekirse olaya bir alan eklenip rozet ona göre seçilir.
 * Yönü SÖYLEYEN şey kartın üstündeki büyük tik/X rozeti (bkz. SwipeOverlay);
 * alev onun üstünden geçiyor.
 *
 * ⚠️ EŞLEŞMEYLE SONUÇLANACAK AKSİYONDA BU SÜPÜRME HİÇ ÇALIŞTIRILMAZ
 * (2026-09-03). MatchModal aynı ateşin PERDE hâliyle açılıyor (bkz.
 * flameCurtainGeometry); ikisi arka arkaya oynayınca kullanıcı tek bir
 * eylemden iki alev görüyordu. Kural: eşleşme kutlaması MatchModal'ın,
 * süpürme yalnız eşleşmeyen (tek yönlü) Fire ve not içindir.
 * Çağıranların "eşleşme gelecek mi" kestirimi:
 *   • Beğenenler/Kaçırdıkların — liste tanımı gereği KESİN (herkes seni zaten
 *     beğenmiş), orada süpürme hiç çağrılmıyor.
 *   • Keşfet destesi — kartın `hasLikedMe` bayrağı VEYA yerel "beni beğenenler"
 *     kümesi (bkz. DiscoverScreen > willMatchOnLike).
 *
 * `onCovered` TAM BİR KEZ çalışır. Örtme olayının iki kaynağı var — canvas'ın
 * kendisi ve canvas hiç çizemezse devreye giren yedek zamanlayıcı (bkz.
 * FireFlame) — ilki alınıp abonelik hemen bırakılıyor.
 *
 * ── `hold`: DALGA, DEĞİŞİM BİTENE KADAR PARK EDİYOR ────────────────────────
 *
 * Örtme anı kart değişimine ~200 ms bırakıyor (bkz. flameWavePath >
 * COVER_LEAD_MS) ve o pay bazen yetmiyordu: dalga, eski kart hâlâ boyalıyken
 * çekiliyor, kullanıcı "gitmesi gereken kartı" görüyordu. `hold: true` ile
 * dalga ekranı tam kapattığı yerde DURUYOR; yoluna ancak çağıran
 * `releaseFlameSweep()` deyince devam ediyor. BEKLEME TAVANSIZ — tek sınır,
 * ekranı sonsuza kadar kaplı bırakmamak için duran emniyet valfi
 * (COVER_HOLD_LIMIT_MS). Park donuk değil: canlılığı UI thread'inde nefes alan
 * bir salınım taşıyor (bkz. FireFlameCanvas'ın park fazı).
 *
 * Yani `hold` isteyen çağıran, SALIVERMEKLE DE YÜKÜMLÜ. Salıvermeyi "iş bitti"
 * anına değil "yeni kart ekrana BOYANDI" anına bağlamak gerekiyor: React'in
 * commit'i bitmiş olması henüz boyandığı anlamına gelmiyor (bkz. DiscoverScreen
 * > tryReleaseFlame, dep'siz effect + bir kare).
 *
 * @returns Aboneliği iptal eden fonksiyon. Çağıran, örtme anından ÖNCE
 * ağaçtan düşebiliyorsa (deste tazelendi, ekran değişti, tema remount'u)
 * temizlikte bunu çağırmalı; yoksa `onCovered` sökülmüş bir ağaca yazar.
 * İPTAL AYNI ZAMANDA SALIVERİYOR: park sırasında ağaçtan düşen bir çağıranın
 * dalgası tavana kadar asılı kalırdı.
 */
/**
 * ── EŞLEŞME DALI: PERDE ÖNCE, DEĞİŞİM ARKASINDA (istek, 2026-10-13) ─────────
 *
 * Eşleşmeyle bitecek beğenide süpürme oynamıyor (yukarıdaki kural) — kutlamayı
 * MatchModal'ın PERDESİ yapıyor. Ama deste o perdeyi beklemiyordu: kart basışın
 * ilk karesinde değişiyor, kutlama ancak HTTP + SignalR turundan sonra
 * açılıyordu. Kullanıcının tarifi: "önce kart değişiyor, sonra alev modalı
 * geliyor; ilk o gelsin, kart arkasında değişsin."
 *
 * Bu yüzden eşleşme dalı da bir ÖRTME anı bekliyor; tek farkı örtüyü başka
 * birinin kurması: perde `MatchNotification` ile açılıyor ve ekranı
 * `curtain.enterMs` sonunda kaplıyor (bkz. MatchModal, `matchCurtainCover`
 * olayını o yayıyor).
 *
 * ⚠️ DEĞİŞİM HİÇBİR DALDA ÖRTÜSÜZ OLMUYOR (istek: "her türlü perde tam ekranı
 * kaplamışken arkada değişmesi lazım, kassa bile"). Bu yüzden zaman aşımları
 * "deste şimdi ilerlesin" DEMİYOR — örtüyü KENDİMİZ kuruyor: kendi alev
 * süpürmemiz oynuyor ve devir onun örtüsünün altında oluyor
 * (`runFlameSweep`). Yani kötü yolda bedel GECİKME, görünür bir kart
 * değişimi değil.
 *
 * İki pencere var, çünkü "eşleşecek" bir KESTİRİM (bkz. DiscoverScreen >
 * willMatchOnLike) ve perde ağın ucunda:
 *   • `MATCH_WAIT_MS` — bildirim gelmedi: kestirim yanlış olabilir (ya da
 *     bildirim kayıp). Perdeyi beklemeyi bırakıp kendi alevimizi oynatıyoruz;
 *     kullanıcı eşleşmeyen bir beğeninin kutlamasını görüyor, yani yolun
 *     doğrusu. Uzatmak "tik'e bastım, kart donup kaldı" demek.
 *   • `CURTAIN_WAIT_MS` — bildirim GELDİ, yani kutlama kesin: modal
 *     fotoğrafları bekliyor olabilir ve perde ancak ondan sonra yükseliyor.
 *     Pencere o yüzden geniş ve ÖLÇÜLÜ: MatchModal'ın fotoğraf emniyet kemeri
 *     3 sn + perdenin yükselişi (`curtain.enterMs`, ~1 sn) + pay. Bu da
 *     dolarsa (modal hiç açılmadı, gate kapalı, uygulama arkaplandan döndü)
 *     yine kendi alevimiz örtüyor — o patolojik durumda perde ARKASINDAN
 *     gelip ikinci alev olarak görünebilir; iki alev, örtüsüz değişimden
 *     iyidir.
 */
const MATCH_WAIT_MS = 1500;
const CURTAIN_WAIT_MS = 5000;

export function runMatchCurtain(onCovered: () => void): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Yedek yolda kurulan KENDİ süpürmemizin aboneliği. */
  let sweepUnsub: (() => void) | null = null;
  const unsubs: Array<() => void> = [];
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    unsubs.forEach((u) => u());
    unsubs.length = 0;
  };
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    onCovered();
  };
  /**
   * Perde gelmedi ya da gecikti: örtüyü kendimiz kuruyoruz.
   *
   * `done` BURADA İŞARETLENİYOR — perde dinleyicisi bırakılıyor, yani bu
   * noktadan sonra gelen `matchCurtainCover` desteyi ikinci kez ilerletmiyor;
   * devrin tek sahibi artık kendi süpürmemiz.
   */
  const coverOurselves = () => {
    if (done) return;
    done = true;
    cleanup();
    // `hold`: bu dalın `onCovered`ı da desteyi ilerletiyor, yani buradaki
    // değişim de üstteki kartın MOUNT'unu bekliyor (bkz. runFlameSweep > hold).
    // Salıveren taraf aynı: DiscoverScreen > tryReleaseFlame.
    sweepUnsub = runFlameSweep(
      () => {
        sweepUnsub = null;
        onCovered();
      },
      { hold: true },
    );
  };
  unsubs.push(uiBus.on("matchCurtainCover", finish));
  // Bildirim geldi: artık perdeyi beklemek güvenli, süreyi uzat.
  unsubs.push(
    uiBus.on("match", () => {
      if (done) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(coverOurselves, CURTAIN_WAIT_MS);
    }),
  );
  timer = setTimeout(coverOurselves, MATCH_WAIT_MS);
  return () => {
    done = true;
    cleanup();
    sweepUnsub?.();
    sweepUnsub = null;
  };
}

export function runFlameSweep(
  onCovered: () => void,
  opts?: { hold?: boolean },
): () => void {
  const hold = !!opts?.hold;
  let done = false;
  const unsub = uiBus.on("flameSweepCover", () => {
    if (done) return;
    done = true;
    unsub();
    onCovered();
  });
  uiBus.emit("flameSweep", { hold });
  return () => {
    done = true;
    unsub();
    // Park eden bir dalga bırakmıyoruz: çağıran ağaçtan düştüyse onu
    // salıverecek kimse kalmadı.
    if (hold) releaseFlameSweep();
  };
}

/**
 * Park eden dalgayı salıver — "yeni kart ekrana boyandı" demenin tek yolu.
 *
 * Park etmeyen bir dalgada (ya da hiç dalga yokken) NO-OP: canvas olayı yalnız
 * `hold` ile mount edildiyse dinliyor. Bu yüzden çağıranın "acaba bekleyen var
 * mı" diye bir bayrak tutması gerekmiyor.
 */
export function releaseFlameSweep(): void {
  uiBus.emit("flameSweepRelease");
}
