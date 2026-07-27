// DEV teşhis anahtarları — hepsi prod'da otomatik kapalı (__DEV__ guard).
// Bir jank/crash kovalarken ilgili flag'i elle `true` yap, ölç, geri kapat.
//
// wdyr ve render-log çok gürültülü: startup crash'ini yakalarken bunlar AÇIK ise
// gerçek hata binlerce satır arasında kaybolur. Crash repro'su alırken PERF_WDYR
// ve PERF_RENDER_LOG'u false bırak; sadece startup mark'ları (ucuz, gürültüsüz) kalsın.

export const PERF_WDYR = __DEV__ && false; // why-did-you-render tracking + log
export const PERF_RENDER_LOG = __DEV__ && false; // useRenderCount console.log spam
export const PERF_HUD = __DEV__ && false; // ekrandaki canlı render sayacı overlay
export const PERF_STARTUP = __DEV__ && true; // [startup] mark'ları — ucuz, açık kalabilir

// Render-storm dedektörü: bir component tek frame içinde eşik kadar render ederse
// (= senkron render loop, JS thread'i dondurup crash'e götüren şey) senkron
// console.error basar ve döngüyü yapan label'ı adıyla söyler. Ucuz, açık kalsın.
export const PERF_STORM = __DEV__ && true;
export const STORM_THRESHOLD = 40; // React'in "Maximum update depth" limiti ~50; ondan önce yakala

// Açılış ölçüm raporları — ucuz, gürültüsüz (tek seferlik tablo). Bir crash/jank
// kovalarken açık bırak; ölçüm bitince kapat.
export const PERF_NET = __DEV__ && true; // cold-boot HTTP istek sayacı + duplike raporu ([[netTally]])
export const PERF_STARTUP_RENDER = __DEV__ && true; // component başına açılış render sayısı tablosu
export const STARTUP_REPORT_MS = 6000; // ilk N ms'lik pencere; sonunda tek rapor basılır
