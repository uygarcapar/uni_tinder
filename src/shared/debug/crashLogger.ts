// Görünmez crash avcısı. Metro normalde JS hatalarını kırmızı kutuyla gösterir ama
// bazı fatal'lar (bridge/native, watchdog, unhandled rejection) JS tarafında temiz bir
// stack bırakmadan öldürür. Bu modül, JS-kaynaklı bir fatal VARSA en azından tek satırlık
// bir [fatal] / [unhandled-rejection] izi bırakır — grep'le yakalayabilirsin. Native crash
// ise burada da iz olmaz → o zaman Xcode/logcat device log'una bakman gerekir (aşağıdaki mesaja bak).

if (__DEV__) {
  const g: any = global;

  // 1) Global JS error handler — throw'lar ve fatal'lar buraya düşer.
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    console.error(
      `[fatal] isFatal=${isFatal} ${error?.name}: ${error?.message}\n${error?.stack ?? "(stack yok)"}`,
    );
    if (prev) prev(error, isFatal); // orijinal red-box davranışını koru
  });

  // 2) Unhandled promise rejection'lar — quota/network thunk'ları .catch'siz reject ederse burada görünür.
  try {
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id: any, error: any) =>
        console.error(
          `[unhandled-rejection] ${error?.message ?? error}\n${error?.stack ?? ""}`,
        ),
      onHandled: () => {},
    });
  } catch {
    // rejection-tracking yoksa sessiz geç — global handler yine de çalışır.
  }
}

export {};
