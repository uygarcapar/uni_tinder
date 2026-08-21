# Kaçırılan eşleşme kurtarma — FE durumu

**Tarih:** 2026-08-18
**Durum:** Backend sözleşmesi alındı, özellik FE'de **uçtan uca implement edildi**.
Bu dosya artık soru listesi değil; ne yaptığımızın ve backend'den ne beklediğimizin kaydı.

## FE'de ne var

| Parça | Yer |
|---|---|
| Endpoint sabitleri | `src/shared/constants/api.ts` — `SWIPE_MISSED_MATCHES`, `SWIPE_RECOVER_MISSED_MATCH` |
| Liste + kurtarma çağrısı, status→sonuç eşlemesi | `src/features/discover/missedMatchRecovery.ts` |
| Kota alanları (`nextMissedMatchRecoveryResetAt`, `missedMatchRecoveryResetInSeconds`) | `src/features/discover/swipeQueries.ts` → `useSwipeStats` |
| UI: "Kaçırdıkların" sekmesi, kart başına "Kurtar", kota satırı | `src/features/discover/screens/LikesScreen.tsx` |
| Testler | `tests/features/discover/missedMatchRecovery.test.ts` |

Uygulanan kurallar:

- **Gövde** `{ targetUserId, swipeType: "like" }` — `swipeType` dummy, §1'deki
  `[ApiController]` validation tuzağı için. Testle kilitlendi, yorumla gerekçelendirildi.
- **Status ayrımı:** 200 kurtarıldı · **403** kota paywall'ı (`paywallType` ile) · **400**
  ret (kota harcanmadı → mesaj göster + listeyi tazele) · diğerleri geçici hata.
- **404 → 400 ile aynı yol.** Kullanıcı kaybolmuşsa liste bayattır.
- **Premium'un kotası dolduğunda paywall AÇILMIYOR** (`showPaywall:false` + 400 → düz mesaj).
- **`matchId` beklenmiyor.** Kurtarma sonrası anında geri bildirim veriyoruz; sohbete
  yönlendirme mevcut SignalR `MatchNotification` akışından geliyor (global MatchModal
  zaten bağlı, bu ekran da `uiBus` "match" ile kartı düşürüyor).
- **Bakiye yanıtta gelmediği için** (`SwipeResultDto.remaining*` bu akışta null) kota
  yerel düşürülüyor, `/Stats` bir sonraki tazelemede doğrusunu getiriyor.
- **Liste premium gating'e tabi değil:** kartlar blur'suz çiziliyor ve bu sekmede
  "Seni beğenenleri gör" satış butonu gizli.
- **`-1` / sentinel guard'ı yok** — §7 uyarınca bu alanlarda o konvansiyon geçerli değil.
- **2/gün ve 5/gün sayıları FE'de YOK.** Kota satırı yalnız `remainingMissedMatchRecovery`
  gösteriyor.

⚠️ §6'daki uyarınız için: 403'ün gövdeyi yuttuğu bir durum yok. Interceptor'ımız 403'ü
yalnız `errorCode` taşıyan hesap-yaptırımı gövdelerinde yakalıyor; paywall gövdesi
`errorCode` içermediği için `paywallType` bize sağlam ulaşıyor.

## Backend cevabı sonrası (2026-08-18, `c491b0d`) uygulananlar

- **`dailyMissedMatchRecoveryLimit`** okunuyor, kota satırı artık "2/2" biçiminde.
  `-1` dalı **yazılmadı** — bu kotada sınırsız durumu yok (premium de 5/gün).
- **`missedMatchLookbackDays`** okunuyor; boş durum metni değer geldiyse "{{days}} gün",
  gelmediyse sayısız varyanta düşüyor.
- **400 + `showPaywall:false`** (engelli/uygunsuz çift) paywall AÇMIYOR: mesaj gösterilip
  kart listeden düşüyor ve liste doğrulanıyor. Kota zaten harcanmıyor.
- **200 sonrası 10 sn'lik SignalR emniyeti** duruyor: `MatchNotification` gelmezse sohbet
  listesi bir kez tazeleniyor (döngü değil, unmount'ta iptal ediliyor).
- **`swipeType` göndermeye devam ediyoruz.** Yeni DTO'da opsiyonel, eskisinde zorunlu —
  yani bu gövde iki sürümde de geçerli olan tek gövde. Deploy'un canlıda olduğu
  doğrulanınca alanı düşürmek isteğe bağlı; acelesi yok.

`/sync` retry'ı da aynı cevaba göre düzeltildi (aralıklar negative cache penceresinin
dışına taşındı, cache'lenmeyen `reason`lar için ayrı ve daha sık merdiven).
