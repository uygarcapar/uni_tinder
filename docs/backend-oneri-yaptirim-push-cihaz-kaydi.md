# Öneri: Yaptırım (ban / askı / silme) push cihaz kaydını iptal etmiyor

**Kimden:** Frontend
**Tarih:** 2026-08-11
**Konu:** Askıya alınan kullanıcı oturumdan düşürülüyor ama cihazı `notifications/devices` tablosunda aktif kalıyor; askı süresince ve askı kalkınca o cihaza push gitmeye devam ediyor
**İlgili FE dosyaları:** `src/features/notifications/pushService.ts`, `src/shared/services/api.ts` (`handleBlockedResponse`), `src/features/auth/authSlice.ts` (`accountBlocked`)

---

## TL;DR

| # | İstek | Aciliyet |
|---|---|---|
| 1 | Ban / askı / silme talebi işlenirken kullanıcının **tüm cihaz kayıtları pasifleştirilsin** | Yüksek — oturumu olmayan cihaza push gidiyor |
| 2 | Push gönderim yolunda **hesap durumu kontrolü** olsun (yaptırımlı kullanıcıya bildirim üretilmesin/gönderilmesin) | Orta — 1'in kaçtığı durumları yakalar |
| 3 | `DELETE /api/notifications/devices/{token}` yaptırım filtresinden **muaf** tutulsun | Düşük — istemcinin kendi kendini temizlemesi için; 1'in yerine geçmez |

FE tarafında bunun tam karşılığı **yok**: yaptırımlı hesapta bütün yetkili uçlar 403
döndüğü için istemci cihaz kaydını silemiyor; üstelik kullanıcı askıya alındığında
uygulama kapalıysa istemci hiç çalışmıyor. Çözümün sahibi backend.

---

## 1. Gözlenen davranış

Gerçek bir kullanıcı hesabı üzerinde:

1. Hesap admin tarafından **askıya alındı** (UT-1008).
2. Uygulama beklendiği gibi oturumu düşürdü, askı ekranı açıldı.
3. Askı **kaldırıldı** → aynı cihaza **push bildirimi düştü**, hâlbuki cihazda oturum yok.

Bildirimin gelmesi, backend'de `userId ↔ FCM token` eşlemesinin hâlâ aktif olduğunun
kanıtı.

## 2. İstemci ne yapıyor (ve neden yeterli değil)

Yaptırım 403'ünde (`UT-1007` / `UT-1008` / `UT-1009`) istemci şunu yapıyor
(`api.ts` → `handleBlockedResponse`):

```
clearAllTokens()             // refresh + access token diskten silindi
setCurrentAccessToken(null)
emitAccountBlocked(payload)  // oturum düşürüldü, yaptırım ekranı açıldı
```

Yani **auth token tarafı temiz** — bildirimi getiren şey bayat bir JWT değil.

`DELETE /api/notifications/devices/{token}` ise bu yolda **çağrılmıyor**. Sebebi
bilinçli: yaptırımlı hesapta global filtre yetkili uçların hepsini 403'lediği için o
DELETE de 403 dönerdi. Normal çıkışta (`logout` thunk'ı) çağrılıyor, yaptırımda
çağrılmıyor → cihaz satırı aktif kalıyor.

Muaf tutulsa bile (3. istek) tek başına yetmez:

- Kullanıcı askıya alındığında **uygulama kapalı** olabilir; o zaman istemci hiçbir şey
  yapamaz, cihaz kaydı yine kalır.
- Yaptırımı ilk fark eden yol SignalR `ForceLogout` da olabilir ve o best-effort.
- Ağ hatası / kill edilmiş uygulama gibi durumlar için garanti gerekiyor.

Bu yüzden cihaz kaydının iptali **yaptırım işleminin kendisinin bir parçası** olmalı.

## 3. İstenen davranış

### 3.1 Yaptırım uygulanırken cihazları pasifleştir (asıl fix)

Ban / askı / silme talebi işlenirken, kullanıcının refresh token'ları revoke edilip
`ForceLogout` atıldığı **aynı transaction'da**, o `UserId`'ye ait tüm cihaz kayıtları
da pasifleştirilsin (`IsActive = false` veya silme — hangisi şemaya uyuyorsa).

Askı kalkınca kullanıcı yeniden giriş yapacak ve istemci `POST /api/notifications/devices`
ile cihazı **kendisi yeniden kaydediyor** — yani askı bitişinde backend'in kayıtları geri
canlandırmasına gerek yok, canlandırılmamalı da (aradaki sürede cihaz el değiştirmiş
olabilir).

### 3.2 Gönderim yolunda hesap durumu kontrolü

Push üretilen/gönderilen noktada, hedef kullanıcının hesap durumu yaptırımlıysa
(banned / suspended / pending-deletion) bildirim **oluşturulmasın ve gönderilmesin**.
3.1 herhangi bir yeni yaptırım yolunda atlanırsa bu katman yakalar.

Bu ayrıca "askın kalktı" türü bildirimleri de kapsıyor: askı kalkma anında kullanıcının
kayıtlı bir cihazı olmamalı; bilgilendirme yapılacaksa **e-posta** doğru kanal.

### 3.3 `DELETE /api/notifications/devices/{token}` yaptırım filtresine takılmasın

Yaptırımlı hesapta bile bu uç çalışırsa istemci, 403'ü aldığı anda kendi cihaz kaydını
temizleyebilir. Güvenlik açısından risksiz: uç yalnızca bir token siliyor, veri
döndürmüyor. 3.1 uygulanırsa bu bir "kemer + askı" katmanı olur; **3.1 yerine geçmez.**

## 4. Yan etki: aynı cihazda başka hesap

Cihaz kaydı A kullanıcısında asılı kalınca, aynı cihazda B kullanıcısı giriş yaptığında
`POST /api/notifications/devices` aynı token'ı B için gönderiyor. Backend'in bu durumda
token'ı **B'ye taşıması** (aynı token birden fazla kullanıcıda aktif kalmamalı) gerekiyor.
Halihazırda böyleyse ek iş yok; değilse aynı token üzerinden A'nın bildirimleri B'nin
elindeki telefona düşer.

## 5. Doğrulama senaryosu

1. Cihazda A ile giriş yap, `POST /devices` başarılı olsun.
2. A'yı **uygulama kapalıyken** askıya al.
3. A'ya bildirim doğuran bir olay tetikle (mesaj / eşleşme) → **cihaza push GELMEMELİ.**
4. Askıyı kaldır → **cihaza push GELMEMELİ** (oturum yok).
5. A ile tekrar giriş yap → cihaz yeniden kaydolsun, bildirimler normale dönsün.
