import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import LocationPermissionSheet from "@/features/auth/components/LocationPermissionSheet";
import { sendLocationHeartbeat } from "@/features/profile/locationHeartbeat";
import { useSwipeTutorialBlocking } from "@/features/discover/swipeTutorialGate";
import { whenAppShellReady } from "@/shared/bootPhase";
import { devLog } from "@/shared/utils/devLog";

/**
 * Girişten sonraki konum izni kapısı.
 *
 * Kayıt sihirbazında izin ZORUNLU (RegisterStep9: koordinat alınmadan sonraki
 * adıma geçilmiyor), ama o adımdan geçmeyen kullanıcılar var:
 *   • başka bir cihazda kaydolup burada YALNIZCA giriş yapan,
 *   • izni sonradan sistem ayarlarından kapatan,
 *   • kaydını izin adımı eklenmeden önceki bir sürümde tamamlamış olan.
 * Bu kullanıcılarda şehir/ilçe hiç türetilemiyor (backend ikisini de
 * koordinattan üretiyor) ve mesafe filtresi katı olduğu için deste boş
 * kalabiliyor. Kapı, izin yoksa kayıttaki sheet'i `layout="page"` ile açıyor —
 * arkasında RegisterStep9 ekranı olmadığı için sheet o ekranın düzenini
 * kendisi taşıyor.
 *
 * ⚠️ KAPATILAMAZ: kayıttaki zorunluluk girişte de aynen geçerli — izin
 * verilmeden uygulama kullanılamıyor. Reddedilirse sheet "Ayarlar'a Git" +
 * "Tekrar Dene" hâlinde kalıyor ve Ayarlar'dan dönüş AppState ile yakalanıyor
 * (bkz. LocationPermissionSheet). Tek çıkış yolu uygulamayı kapatmak.
 *
 * KONTROL KULLANICI BAŞINA BİR KEZ; sonucu da modülde duruyor. Component
 * state'i tek başına yetmezdi: tema değişimi AppNavigator'ı `key` ile remount
 * ediyor ve kapı, kullanıcı izin vermemişken sessizce kaybolurdu. Anahtara
 * bağlı olması aynı process'te başka hesaba girildiğinde yeniden çalışmasını
 * sağlıyor.
 */
let checkedUserKey: string | null = null;
let permissionMissing = false;

/**
 * Kabuk zinciri hiç oturmazsa (Discover beklenmedik bir durumda mount olmazsa)
 * kapı sonsuza kilitlenmesin. MatchModal'ın emniyet kemeriyle aynı süre.
 */
const SHELL_READY_SAFETY_MS = 9000;

export default function LocationAccessGate({
  userKey,
  blocked = false,
}: {
  /** Oturumdaki kullanıcı (`userId ?? id`). `null` iken kapı hiç çalışmaz. */
  userKey: string | null;
  /** Üstte daha öncelikli bir kapı varsa bekle — iki sheet üst üste binmesin. */
  blocked?: boolean;
}) {
  const [needed, setNeeded] = useState(
    () => !!userKey && checkedUserKey === userKey && permissionMissing,
  );
  /**
   * Discover'ın ilk giriş swipe demosu oynarken açılmasın —
   * `ProfileHiddenGate` ile birebir aynı gerekçe: kapı kartın üstünde duruyor,
   * demo arkasında oynayıp "görüldü" işaretleniyor ve jest hiç görülmüyor.
   */
  const tutorialBlocking = useSwipeTutorialBlocking();

  useEffect(() => {
    if (!userKey) return;
    // Bu kullanıcı için karar zaten verilmiş (tema remount'u / hızlı yeniden
    // mount) — izni tekrar sormadan aynı sonucu uygula.
    if (checkedUserKey === userKey) {
      setNeeded(permissionMissing);
      return;
    }

    let cancelled = false;
    let started = false;
    const run = () => {
      if (cancelled || started) return;
      started = true;
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          checkedUserKey = userKey;
          permissionMissing = status !== "granted";
          if (!cancelled) setNeeded(permissionMissing);
        })
        .catch((err) => devLog("[locationGate] permission check failed:", err));
    };

    // Boot zinciri otururken açma: sheet + backdrop blur'u Discover mount'unun
    // üstüne binerse commit fırtınasına katkı oluyor (bkz. bootPhase).
    const unsubscribe = whenAppShellReady(run);
    const safety = setTimeout(run, SHELL_READY_SAFETY_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(safety);
    };
  }, [userKey]);

  /**
   * İzin alındı → koordinat BEKLENEREK gönderiliyor: sheet o sırada spinner'da
   * kalıyor, kullanıcı "izin verdim ama hiçbir şey olmadı" hissine düşmüyor.
   * `sendLocationHeartbeat` hiçbir hata fırlatmıyor (fix alınamazsa da sessiz),
   * bu yüzden sonuç ne olursa olsun kapanıyoruz — izin alındı, kapının işi
   * bitti; şehir gelmediyse bir sonraki foreground turu aynı isteği atacak.
   */
  const handleGranted = useCallback(async () => {
    await sendLocationHeartbeat();
    permissionMissing = false;
    setNeeded(false);
  }, []);

  /**
   * Görünürlük TÜRETİLİYOR, ayrı bir state değil: üstümüze daha öncelikli bir
   * kapı açıldığında sheet iniyor, o kapı kapanınca kendiliğinden geri geliyor.
   * `onClose` bilerek VERİLMİYOR (UpdateGateSheet blokaj kipiyle aynı desen) —
   * kapanış kararının tek sahibi burası, dışarıdan gelen bir dismiss kapıyı
   * düşürmemeli.
   */
  return (
    <LocationPermissionSheet
      visible={needed && !blocked && !tutorialBlocking}
      onGranted={handleGranted}
      layout="page"
      dismissible={false}
    />
  );
}
