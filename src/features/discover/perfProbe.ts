/**
 * ── KEŞİF SCROLL KASMASI: TEŞHİS PROBE'U (GEÇİCİ) ─────────────────────────
 *
 * Bu dosya bir özellik değil, bir ÖLÇÜ ALETİ. Teşhis bitince silinecek — üç
 * bayrağın da tek işi bir şüpheliyi ağaçtan çıkarıp scroll'un düzelip
 * düzelmediğine bakmak.
 *
 * NEDEN VAR: "Keşif'te kart scroll ederken kasıyor, AMA aynı kart önizleme
 * sheet'inde akıcı" (cihazda, hem release hem dev). Aynı bileşen, aynı cam
 * bölüm kutuları, aynı scroll — yani suçlu kartın ortak gövdesi DEĞİL, yalnız
 * Keşif'te var olan bir şey. Üç yapısal fark var:
 *
 *   0. DESTE — Keşif 3 kart mount ediyor (rewind yuvası + sonraki + üstteki),
 *      önizlemede tek kart var.
 *   1. ZEMİN — kart kendi tam ekran `BlurView`'ını yalnız Keşif'te çiziyor
 *      (`coverGlass && !previewMode`). Önizlemede zemini sheet taşıyor, yani
 *      kartın içinde HİÇ efekt view yok. Üstelik `coverGlass`ta `isTopCard`
 *      kapısı yok → örtülü iki kart da taşıyor.
 *   2. KAPAK KOLONU — `coverStickyStyle` scroll'u takip eden bir `translateY`
 *      sürüyor ve o katmanda 5 cam daire var. Önizlemede bu transform kimlik
 *      (`previewMode` erken dönüşü) ve karar butonları hiç çizilmiyor.
 *
 * ── NASIL KULLANILIR ───────────────────────────────────────────────────────
 *
 * Dev build'de cihazda aç, Keşif'te kartı açıp scroll et. Sonra bayrakları
 * TEK TEK, BİRER BİRER aç (Fast Refresh anında uyguluyor, rebuild yok) ve her
 * seferinde aynı scroll'u tekrarla. Bir bayrak scroll'u düzeltiyorsa kök neden
 * o bayrağın çıkardığı katman.
 *
 * ⚠️ İKİSİNİ BİRDEN AÇMA. Aynı anda iki değişken oynatmak hangisinin işe
 * yaradığını ölçülemez hâle getiriyor.
 *
 * Bayrakların GÖRÜNÜMÜ bozması normal ve geçici — ölçtüğümüz şey kare süresi,
 * görüntü değil. Her ölçümden sonra `false`a geri al.
 */
export const DISCOVER_PERF_PROBE = {
  /**
   * TEST 0 — DESTEYİ TEKE İNDİR.
   *
   * Yalnız üstteki kart çiziliyor; rewind yuvası ve arkadaki kart hiç mount
   * edilmiyor. Önizlemeyle aradaki "kaç kart" farkını kapatıyor.
   *
   * DÜZELİRSE: suçlu örtülü kartların taşıdığı katmanlar (en güçlü aday:
   * her kartın kendi tam ekran `BlurView`'ı — bkz. TEST 1). Fix yönü
   * `coverGlass` kapısı.
   * DÜZELMEZSE: suçlu üstteki kartın KENDİ Keşif'e özel katmanları → TEST 2.
   *
   * Yan etki: geri alma (rewind) ve kart geçişi bu bayrak açıkken bozuk
   * çalışır. Yalnız scroll'u ölçmek için.
   */
  soloCard: false,

  /**
   * TEST 1 — ZEMİNDEKİ `BlurView`'LARI KAPAT.
   *
   * `CardGlassBackdrop` 26 altı yoluna düşüyor: bulanıklık fotoğrafın kendi
   * `blurRadius`'undan geliyor (düz bitmap), ağaçta hiç `UIVisualEffectView`
   * kalmıyor. Ekrandaki toplam yayılma neredeyse aynı — bu yol zaten var ve
   * miktarı eşlenmiş durumda (bkz. BACKDROP_BLUR_SCREEN_RADIUS).
   *
   * DÜZELİRSE: kök neden üst üste binen canlı efekt view'lar — mount edilen
   * her kart bir tane taşıyor ve ikisi tamamen örtülü.
   *
   * ⚠️ Bu bayrak açıkken cam bölüm kutuları DEĞİŞMİYOR (onlar
   * `hasLiquidGlassSurface()`i ayrı okuyor). Yani ölçülen şey sadece zemin.
   */
  killBackdropBlur: false,

  /**
   * TEST 2 — KAPAK KOLONUNUN HER-KARE TRANSFORM'UNU KALDIR.
   *
   * `coverStickyStyle` kimliğe sabitleniyor: isim bloğu ve 5 cam daireli buton
   * kolonu kaydırırken ekranda SABİT KALMIYOR, fotoğrafla birlikte yukarı
   * gidiyor. Katmanlar duruyor, yalnız her karede yazılan transform gidiyor.
   *
   * DÜZELİRSE: kök neden camın altındaki hareket — kimliksel olmayan bir ata
   * transform'u her karede 5 cam efektini yeniden örnekletiyor. (Bu riskin
   * kendisi SwipeCard > coverStickyStyle notunda zaten yazılı ve "bilerek göze
   * alındı" deniyor.)
   *
   * DÜZELMEZSE: sıradaki şüpheli katmanların KENDİSİ (transform değil) —
   * kolondaki cam daireleri `glass={false}`a düşürüp tekrar ölç.
   */
  killCoverSticky: false,

  /**
   * ÖLÇÜ ALETİ — kill-switch değil (bkz. PerfProbeOverlay): ekranın sol üstüne
   * en kötü kare aralığını (ui/js, son 1 sn) ve canlı/toplam SwipeCard sayısını
   * basıyor. Perf monitor'ün ortalama "60fps"inin sakladığı tekil geç kareleri
   * ve kart birikmesini görünür kılıyor.
   */
  overlay: true,
} as const;
