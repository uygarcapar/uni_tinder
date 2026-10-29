/**
 * TİK'E BASILDIĞINDA NE OLUYOR — sıralamanın tek kaynağı.
 *
 * Üç şey var ve sırası ürünün kendisi:
 *   1. beğeni isteği gider — alevi BEKLEMEZ,
 *   2. Keşif'in alev süpürmesi oynar (`hold`: dalga tam kapalıyken park eder),
 *   3. örtü kapandığı AN kart küçülmeye başlar ve yüzey kapanır.
 *
 * ⚠️ KÜÇÜLME ÖRTÜNÜN ALTINDA OLMAK ZORUNDA. Örtü açıldıktan sonra küçülen bir
 * kart "geri kaçıyor" gibi okunuyor — Keşif'te aynı tuzağa düşülmüştü (giden
 * kart görünüyordu) ve çözüm orada da dalganın park etmesiydi.
 *
 * ⚠️ BAĞIMLILIKLAR PARAMETRE, import DEĞİL: bu dosya `uiBus`a da ekrana da
 * dokunmuyor, yani sıralama node'da test edilebiliyor. Alevin kendisi global
 * (`<FireFlame />`, AppNavigator), ekran yalnız tetikliyor.
 */
export interface CampusLikeSweepArgs {
  /**
   * Günlük kampüs kararı bitti mi.
   *
   * ⚠️🔴 ALEVİN KAPISI BU. Hak bitmişken `like` yalnız paywall açıp dönüyor,
   * yani gönderilmiş bir beğeni YOK; alev yine oynasaydı kullanıcı geri
   * alınamaz kararını harcadığını sanırdı. Yüzey de açık kalıyor — paywall
   * kapanınca kullanıcı aynı kartla karşılaşıyor.
   */
  exhausted: boolean;
  /**
   * Beğeni isteği. Paywall, kota ve kart düşüren kodlar bunun İÇİNDE.
   *
   * ⚠️ SONUÇ DÖNDÜRÜYOR: `false` = karar KAYDEDİLMEDİ (sunucu kotası, ağ,
   * zaten karar verilmiş). Kutlamanın kapısı bu — gerekçe `abort`ta.
   */
  like: () => Promise<boolean>;
  /** Alev süpürmesini başlat; geri çağrı "örtü kapandı" demek. */
  startSweep: (onCovered: () => void | Promise<void>) => void;
  /** Kartı küçült ve yüzeyi kapat — yalnız örtü kapalıyken çağrılıyor. */
  collapse: () => void;
  /**
   * KARAR KAYDEDİLMEDİ: dalgayı salıver, yüzeyi AÇIK bırak.
   *
   * ⚠️ İSTEMCİNİN KOTA BAYRAĞI YETMİYOR ve bu dalın sebebi o: kullanıcı son
   * hakkıyla A anını beğenip `/campus/me` tazelenmeden B anında tike basarsa
   * `exhausted` hâlâ `false` olur, alev oynar, sunucu `UT-7420` ile reddeder
   * ve kullanıcı kaydedilmemiş bir kararı kaydedilmiş sanır — sözleşmenin
   * kendi anti-hedefi. Örtü PARK ETTİĞİ için sonucu beklemek bedava.
   */
  abort: () => void;
}

export function likeWithFlameSweep({
  exhausted,
  like,
  startSweep,
  collapse,
  abort,
}: CampusLikeSweepArgs): void {
  // Paywall'ı `like`ın kendisi açıyor — kapı burada değil, orada.
  const sent = like();
  if (exhausted) return;
  /**
   * ⚠️ İSTEK ÖRTÜYÜ BEKLEMİYOR, ÖRTÜ İSTEĞİ BEKLİYOR. Alev dokunuşla birlikte
   * başlıyor (kullanıcı anında geri bildirim alıyor); kapanış kararı ise
   * sonucu bekliyor, çünkü kapanan bir kart "oldu" demek.
   */
  startSweep(async () => {
    const ok = await sent;
    if (ok) collapse();
    else abort();
  });
}
