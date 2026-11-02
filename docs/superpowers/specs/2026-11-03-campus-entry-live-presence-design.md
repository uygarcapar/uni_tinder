# Kampüse giriş: anlık yüzey + bildirim — tasarım (2026-11-03)

## Niyet

Kampüse girildiğinde (gerçek konum YA DA dev simülasyonu) kullanıcı bunu
**anında** görmeli:

1. Uygulama **arka plandaysa** push gelir ("kampüse girdin, moment at") —
   bu yol bugün var (geofence → presence Enter → sunucu push'u).
2. Uygulama **önplandaysa** aynı bildirim **uygulama içi toast** olarak
   görünür — bugün HİÇ görünmüyor: önplanda OS banner'ı bilerek kapalı
   (`shouldShowBanner:false`) ve `CampusMomentsNearby` için in-app gösterim
   yok.
3. "+" butonu ve akıştaki "paylaşabilirsin" ipucu **sayfa yenilenmeden**
   belirir — bugün `inside` yalnız harita açılırken, ipucu yalnız mount'ta
   okunuyor.

## Hedef dışı / anti-hedef

- Push'un kararı ve metni SUNUCUDA kalır (günlük tek kampüs bildirimi,
  `campusAlerts` tercihi). "Her girişte garanti push" vaat edilmiyor; cihazda
  yerel bildirim KURULMUYOR (mevcut sözleşme kararı).
- GPS periyodik yoklanmıyor (pil kuralı). "Her zaman" izni yoksa gerçek
  girişte canlı sinyal YOK — tazeleme app öne gelince / harita açılınca
  (bugünkü davranış) kalır. Bu bilinçli bir sınır.

## Yaklaşımlar (seçilenler ✓)

1. **Önplan bildirimi** — ✓ A: `addNotificationReceivedListener` ile önplanda
   gelen `CampusMomentsNearby` push'unun `title/body`si InfoToast'a basılır;
   dokunuş mevcut routing'e (harita aç) gider. Metin ham, sunucunun.
   (B: hub `NewNotification` — backend işi gerektirir, elendi.)
2. **Canlı "+" / ipucu** — ✓ A: sıfır-import'lu `campusPresenceBus` (çıplak
   emitter). Yayıncılar: sim aç/kapat, geofence task'ının Enter/Exit'i
   (önplandayken), app foreground'a dönüş. Abone: `useCampusSurface` →
   `refreshPresence(force)` + ipucu yeniden hesap. `uiBus` KULLANILAMAZ:
   reanimated import ediyor, geofence task'ı çıplak kalmak zorunda.
   (B: GPS polling — pil, elendi.)
3. **Simülasyonda push** — "Kampüste say" başarılıysa presence Enter otomatik
   bildirilir (bugünkü ikinci menü adımı kendiliğinden koşar, rapor alert'i
   yine gösterilir). Ayrı "Kampüse girdim" düğmesi tekrar tetiklemek için
   kalır. (Benim kararım.)

## Kısıtlar

- `campusGeofenceTask` grafiği ÇIPLAK kalır: React/Redux/api/reanimated yok.
  Bus bu yüzden bağımsız, sıfır import'lu bir modül.
- Önplan toast'ı yalnız `CampusMomentsNearby` tipine; diğer tipler mevcut
  davranışta (banner kapalı, tepside listelenir).
- `useCampusSurface` aboneliği `enabled || prewarm` yaşam döngüsüne bağlı;
  unmount'ta bırakılır.

## Uygulayıcıya kalanlar

- Toast'a dokununca haritayı açan yol: `AppNavigator`'daki
  `CampusMomentsNearby` case'inin kullandığı `openFeed('feed', {expandMap})`
  hedefine eşdeğer bir çağrı; nasıl erişileceği uygulayıcının seçimi.
- Bus olay adı/imzası; test yerleşimi (bus unit, Settings auto-enter,
  task → emit kaynak kuralı, önplan toast birimi).
