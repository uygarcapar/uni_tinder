import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/shared/hooks/redux";
import uiBus from "@/shared/services/uiBus";
import { loadAppMode, peekAppMode, saveAppMode } from "./modePrefs";
import { DEFAULT_APP_MODE, isAppMode, type AppMode } from "./modeTheme";

/**
 * Seçili uygulama modunun OKUMA/YAZMA kapısı — Keşif ve Beğeniler aynı değeri
 * paylaşıyor (tek zihinsel model: Keşif'te Arkadaş'a geçmek Beğeniler'i de
 * arkadaş beğenilerine kapsıyor).
 *
 * ── Neden redux DEĞİL ───────────────────────────────────────────────────────
 * Mod bir UI tercihi: persist edilmesi gerekiyor ama redux'a girmesi gerekmiyor
 * ve girmemesi daha iyi — redux-app deposu ŞİFRELİ (anahtar Keychain'de) ve
 * anahtar kaybında tamamı okunamaz hâle geliyor. Tercih diskte düz MMKV'de
 * (`modePrefs`), ekranlar arası senkron ise uiBus ile.
 *
 * ── uiBus neden gerekli ─────────────────────────────────────────────────────
 * İki ekran (Keşif, Beğeniler) ayrı ayrı mount; biri modu değiştirdiğinde
 * diğerinin state'i bayat kalırdı. MMKV'nin kendi listener'ı yerine uiBus:
 * uygulamanın geri kalanı zaten bu kanalı kullanıyor ve mod değişimi bir
 * "olay" (başka tüketiciler de dinleyebilir — ör. ileride sekme rozeti).
 *
 * ⚠️ uiBus REPLAY YAPMIYOR: sonradan mount olan ekran kaçırdığı olayı
 * görmez. Bu yüzden ilk değer her zaman DİSKTEN okunuyor (`useState`
 * initializer'ı), olay yalnız AÇIKKEN senkron tutuyor.
 */

export const APP_MODE_EVENT = "appModeChanged";

export function useAppMode(): {
  mode: AppMode;
  setMode: (next: AppMode) => void;
} {
  const userId = useAppSelector((s) => (s as any).auth?.user?.id as string | undefined);

  // İlk değer diskten — mount sırası garanti değil, olaya güvenilemez.
  const [mode, setLocal] = useState<AppMode>(() => loadAppMode(userId));

  // Hesap değişiminde (logout → başka kullanıcı) yeniden oku: anahtar userId
  // ile scope'lu, yoksa önceki kullanıcının modu sızar.
  useEffect(() => {
    setLocal(loadAppMode(userId));
  }, [userId]);

  useEffect(() => {
    const off = uiBus.on(APP_MODE_EVENT, (payload: any) => {
      const next = payload?.mode;
      // Kurcalanmış/eski payload state'e girmesin — sorgu parametresine
      // gidiyor ve sunucu tanımadığı `mode`a 400 döner.
      if (isAppMode(next)) setLocal(next);
    });
    return off;
  }, []);

  const setMode = useCallback(
    (next: AppMode) => {
      if (!isAppMode(next)) return;
      writeAppMode(userId, next);
      // Kendi state'i olaydan BAĞIMSIZ hizalanıyor: `writeAppMode` değer
      // zaten aynıysa olay atmıyor, ama bu hook'un çağıranı yine de güncel
      // değeri görmeli.
      setLocal(next);
    },
    [userId],
  );

  return { mode, setMode };
}

/**
 * Hook'suz okuma — sorgu anahtarı kuran saf yollar için (ör. invalidate
 * eden bir servis). Ekranlar `useAppMode` kullanmalı; bu yol state'e abone
 * DEĞİL, yalnız o anki diskteki değeri verir.
 */
export function readAppModeFor(userId?: string | null): AppMode {
  return userId ? loadAppMode(userId) : DEFAULT_APP_MODE;
}

/**
 * Hook'suz YAZMA — bir ekranın içinde olmayan yollar için (ör. bildirimden
 * yönlendirme: `AppNavigator > routeFromNotification`).
 *
 * ⚠️ SIRA BAĞLAYICI: önce diske, sonra olay. Olayı dinleyen bir ekran hemen
 * diski okursa (ör. kendi effect'inde) taze değeri bulsun.
 *
 * Değer DEĞİŞMEDİYSE olay atılmıyor ve `false` dönüyor: mod değişimi
 * tüketicilerde pahalı (Beğeniler iki listesini boşaltıp yeniden çekiyor,
 * Keşif destesini tazeliyor) — "aynı moda geç" demek o işi bedava yapmak
 * olurdu. Dönüş değeri çağıranın ikinci bir tazeleme atıp atmayacağına karar
 * vermesi için (bkz. bildirim yolundaki `likesDirty`).
 *
 * @returns Mod gerçekten değişti mi (yani olay atıldı mı).
 */
export function writeAppMode(
  userId: string | null | undefined,
  next: AppMode,
): boolean {
  if (!isAppMode(next)) return false;
  const changed = peekAppMode(userId) !== next;
  saveAppMode(userId, next);
  if (changed) uiBus.emit(APP_MODE_EVENT, { mode: next });
  return changed;
}
