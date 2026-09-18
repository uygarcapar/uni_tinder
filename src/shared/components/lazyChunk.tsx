import { useEffect, useState, type ComponentType } from "react";

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

/**
 * `React.lazy` yerine kullanılan, İSTEĞE BAĞLI (kutlama/efekt) chunk yükleyici.
 *
 * `lazy()` reddedilen chunk'ı render sırasında FIRLATIYOR. Bunun iki bedeli var:
 *
 * 1. Hata bir error boundary tarafından yakalansa bile React 19 + RN 0.85'te
 *    `onCaughtError` → `ExceptionsManager.handleException(err, false)` çağrılıyor
 *    ve dev'de tam ekran kırmızı "Render Error" kutusu çıkıyor. Yani boundary
 *    ağacı kurtarıyor ama ekranı kurtarmıyor.
 * 2. `lazy()` payload'u reddi KALICI olarak önbelleğe alıyor (`_status = Rejected`).
 *    Bir kez patlayınca aynı modül o oturum boyunca bir daha denenmiyor — efekt
 *    Metro geri gelse bile ölü kalıyor.
 *
 * Burada reddi promise seviyesinde yutuyoruz: render hiç fırlatmıyor (kırmızı
 * kutu yok), bileşen `null` çiziyor (efekt atlanır, akış durmaz) ve bir sonraki
 * mount'ta yeniden deneniyor.
 *
 * Bilinen dev vakası: Metro'nun HMR soketi düştükten SONRA ilk chunk isteğinde
 * `expo/src/async-require/hmr.ts` `window.location.reload()` çağırıyor — RN'de
 * `window.location` yok. O oturumda `hmrUnavailableReason` bir daha sıfırlanmadığı
 * için tekrar denemek de çare değil; tek çözüm uygulamayı reload etmek. Bu
 * sarmalayıcının işi o senaryoda hatayı görünmez ve zararsız kılmak.
 *
 * Zorunlu ekranlar için KULLANMA: orada sessizce kaybolmak yerine görünür bir
 * hata doğru davranış.
 */
export default function lazyChunk<P extends object>(
  load: Loader<P>,
): ComponentType<P> {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;

  function start(): Promise<void> {
    if (!pending) {
      pending = load()
        .then((mod) => {
          Loaded = mod.default;
        })
        .catch((error) => {
          if (__DEV__) {
            console.warn("[lazyChunk] chunk yüklenemedi, atlanıyor:", error);
          }
        })
        // Başarıda `Loaded` dolu olduğu için tekrar çağrılmıyor; başarısızlıkta
        // ise bir sonraki mount temiz bir deneme yapabilsin diye sıfırlanıyor.
        .then(() => {
          pending = null;
        });
    }
    return pending;
  }

  return function LazyChunk(props: P) {
    // Başlangıç değeri fonksiyon OLDUĞU için `useState(Loaded)` yazılamaz:
    // React onu lazy initializer sanıp çağırırdı.
    const [Component, setComponent] = useState<ComponentType<P> | null>(
      () => Loaded,
    );

    useEffect(() => {
      if (Loaded) {
        setComponent(() => Loaded);
        return;
      }
      let alive = true;
      // `start()` reddetmiyor (catch yukarıda); burada sadece sonucu bekliyoruz.
      start().then(() => {
        if (alive && Loaded) setComponent(() => Loaded);
      });
      return () => {
        alive = false;
      };
    }, []);

    return Component ? <Component {...props} /> : null;
  };
}
