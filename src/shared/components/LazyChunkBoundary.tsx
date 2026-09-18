import { Component, Suspense, type ReactNode } from "react";

/**
 * İSTEĞE BAĞLI (kutlama/efekt) bir alt ağaç render'da fırlatırsa ekranı
 * götürmeyen sınır — efekt atlanır, akış durmaz. Zorunlu bir ekran için
 * kullanma; orada sessizce kaybolmak yerine görünür bir hata doğru davranış.
 *
 * Kapsamı DAR: burada kastedilen chunk çözüldükten sonra bileşenin kendi
 * render'ında çıkan hata (ör. Skia path'i kurulamadı). Chunk'ın HİÇ gelmemesi
 * ayrı bir dosyanın işi — bkz. `lazyChunk`. Sebebi: `React.lazy`'nin reddi
 * render'da fırlatması, boundary yakalasa BİLE React 19 + RN 0.85'te
 * `onCaughtError` üzerinden dev'de kırmızı "Render Error" perdesi açıyor.
 * Boundary ağacı kurtarır, ekranı kurtarmaz; o yüzden yükleme hatası promise
 * seviyesinde yutuluyor.
 */
type Props = {
  children: ReactNode;
  /** Hem Suspense hem de hata durumunun yerine çizilecek şey. Varsayılan: hiçbir şey. */
  fallback?: ReactNode;
  /**
   * Değiştiğinde boundary sıfırlanır ve chunk yeniden denenir. Hata geçiciyse
   * (sokete bağlı dev hatası, ağ) bir sonraki kullanımda efekt geri gelsin
   * diye: `key` ile remount etmek state'i de sıfırlardı, burada sadece hata
   * bayrağını düşürüyoruz.
   */
  resetKey?: unknown;
};

type State = { failed: boolean };

export default class LazyChunkBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.warn("[LazyChunkBoundary] chunk yüklenemedi, atlanıyor:", error);
    }
  }

  render() {
    const { children, fallback = null } = this.props;
    if (this.state.failed) return <>{fallback}</>;
    return <Suspense fallback={fallback}>{children}</Suspense>;
  }
}
