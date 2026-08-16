import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  checkAppVersion,
  isSoftUpdateDismissed,
  markSoftUpdateDismissed,
  type VersionCheckResult,
} from "./versionService";

/**
 * Sürüm kapısının tüm state'i. AppNavigator'da tek satırla kullanılır.
 *
 * Kontrol açılışla PARALEL gider — boot'u beklemez, boot'u da bekletmez
 * (`bootPhase` latch'i bilinçli olarak kullanılmıyor: o latch ağır overlay'leri
 * ertelemek için). Cevap `ok` ise hiçbir şey mount edilmez; bu, vakaların
 * neredeyse tamamı.
 *
 * Yeniden kontrol noktaları:
 *   • cold start
 *   • arka plandan öne dönüş — kullanıcı uygulamayı günlerce arka planda
 *     tutabilir, bu arada force-update açılmış olabilir
 *   • bakım ekranındaki "tekrar dene"
 */
export interface VersionGate {
  /** Gösterilecek karar. Kapanıştan SONRA da dolu kalır (bkz. `open`). */
  result: VersionCheckResult | null;
  /** Sheet açık mı — kapanış animasyonu oynasın diye `result`tan ayrı. */
  open: boolean;
  /** Bakım ekranındaki "tekrar dene" sürerken true. */
  rechecking: boolean;
  /** Yalnız `soft`ta çağrılır — aynı sürüm için 24 saat susturur. */
  dismiss: () => void;
  recheck: () => void;
}

export function useVersionGate(): VersionGate {
  // `result` payload'ı KAPANDIKTAN sonra da tutulur: sıfırlasaydık sheet
  // unmount olur ve gorhom'un aşağı kayma animasyonu hiç oynamazdı (uygulamanın
  // geri kalanındaki sheet'lerden farklı, ani bir kaybolma). Görünürlüğü `open`
  // taşır.
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [open, setOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const mountedRef = useRef(true);
  // `dismiss` bayat closure okumasın — `result` her kontrolde değişebiliyor.
  const resultRef = useRef<VersionCheckResult | null>(null);
  // Eşzamanlı kontrol olmasın: foreground dönüşü ile "tekrar dene" aynı ana
  // denk gelebiliyor ve ikisi de aynı rate limit kovasını yiyor.
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const run = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const r = await checkAppVersion();
      if (!mountedRef.current) return;
      // `ok` kapıyı KAPATIR: bakım bitmiş ya da admin eşiği düşürmüş olabilir,
      // kullanıcıyı gereksiz yere blokajda tutmayalım.
      //
      // "Sonra" denmiş soft güncelleme de aynı sürüm için tekrar açılmaz.
      // Blokaj (force / maintenance) bu filtreden GEÇMEZ — her seferinde
      // gösterilir.
      const suppressed =
        r.action === "ok" ||
        (r.action === "soft" && isSoftUpdateDismissed(r.latestVersion));
      if (suppressed) {
        setOpen(false);
        return;
      }
      setResult(r);
      setOpen(true);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Cold start — hemen, boot'u beklemeden. İstek async olduğu için state yazımı
  // doğal olarak ilk paint'ten sonraya düşüyor; ayrıca AppBottomSheet present()'i
  // kendi içinde bir tık erteliyor.
  useEffect(() => {
    run();
  }, [run]);

  // Arka plandan öne dönüş. `version_check` rate limit'i 30 istek/dk — sık
  // geçişlerde bile rahat, ayrıca inFlight guard'ı çakışmayı eliyor.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") run();
    });
    return () => sub.remove();
  }, [run]);

  const dismiss = useCallback(() => {
    const current = resultRef.current;
    // Savunma: blokaj hiçbir koşulda bu yoldan kapanmamalı. Sheet zaten "Sonra"
    // butonunu render etmiyor ve pan-down'ı kapalı — bu ikinci kilit.
    if (!current || current.isBlocking) return;
    if (current.action === "soft")
      markSoftUpdateDismissed(current.latestVersion);
    setOpen(false);
  }, []);

  const recheck = useCallback(async () => {
    setRechecking(true);
    try {
      await run();
    } finally {
      if (mountedRef.current) setRechecking(false);
    }
  }, [run]);

  return { result, open, rechecking, dismiss, recheck };
}
