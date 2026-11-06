# Şikayet **gizlemesin**, engel gizlesin (ve geri alınabilsin)

> **Durum: HAZIR — gözden geçirme ve merge bekliyor.** Değişiklik
> `UniversityTinder` reposunda **`feat/report-no-hide`** dalında yapıldı
> (commit'lenmedi, çalışma ağacında). Tüm test paketi yeşil: 3320 geçti, 0 düştü.
> Yeni uç yok, DTO değişikliği yok, migration yok.
>
> **Geçersiz kıldığı:** `backend_discover_report_exclusion_2026-11-02.md` ve
> backend spec'i `2026-11-02-report-block-visibility-design.md` (Tinder modeli:
> "şikayet kalıcı gizler").

---

## 1. Neden

Bir kullanıcı akışta bir postu şikayet edip yazarını engelledi, sonra engeli
kaldırdı. Post **bir daha geri gelmedi**, yenileme de işe yaramadı.

Sebep: engel kaldırılınca `UserBlocks` satırı siliniyor, ama şikayet satırı
(`UserReports.FeedPostId`) duruyor ve `FeedQueryService.VisiblePosts` bu postu
şikayetçiden kalıcı olarak gizliyor. Profil şikayetinde durum daha ağır:
şikayet edilen kişi her yüzeyden **ömür boyu** gizleniyordu.

Bu, uygulamada şikayetsiz engel yolu olmamasıyla birleşince kullanıcıyı
tuzağa düşürüyordu: engellemek isteyen herkes şikayet etmek zorundaydı
(üstelik "engelle" kutusu varsayılan işaretliydi), şikayet de geri alınamıyordu.

## 2. Yeni model (ürün kararı, 2026-11-06)

| Eylem | Şikayetçinin gördüğü | Geri alınabilir mi |
|---|---|---|
| **Şikayet** (engelsiz) | Hiçbir şey değişmez. Yalnız moderasyona gider. | Gerek yok |
| **Engel** (tek başına ya da şikayetle) | Kişi her yerden kalkar: deste, beğeniler, akış, kampüs, sohbet | **Evet**, engellenenler listesinden. Kaldırılınca HER ŞEY geri gelir, şikayet ettiği post dahil. |

Instagram'ın modeli: engel, kısıtla ve gizle geri alınabilir eylemler; şikayet
ise hesabı ya da içeriği şikayetçiden gizlemiyor, yalnız moderasyona gidiyor.

## 3. Backend'de yapılanlar

### 3.1 Şikayet kaynaklı tüm görünürlük süzgeçleri kaldırıldı

| Yüzey | Dosya | Kaldırılan |
|---|---|---|
| Deste (havuz üretimi) | `Discovery/Stages/HardFilterStage.cs` | `rels.ReportedByMe` elemesi (iki yerde) |
| Deste (cache-hit ağı) | `Relations/UserRelationsQuery.cs` → `GetStillHiddenTargetsAsync` | şikayet sorgusu |
| İlişki katmanı | `UserRelationsQuery.cs`, `IUserRelationsQuery.cs`, `RelationModels.cs` | `GetReportedByMeIdsAsync`, `HardFilterRelations.ReportedByMe`, UNION'daki `'reportedByMe'` satırı |
| Beğeniler | `Swipes/GetWhoLikedMeHandler.cs` | `reportedIds` |
| Kaçırdıkların | `Swipes/GetMissedMatchesHandler.cs` | `reportedIds` |
| Kaçırdıkların kurtarma | `Swipes/RecoverMissedMatchHandler.cs` | `HasReportedAsync` kapısı |
| Beğenen kartı | `Swipes/GetLikerProfileDetailHandler.cs` | `HasReportedAsync` kapısı |
| Aksiyon kapısı (Fire/Not) | `Swipes/SwipeActionGate.cs` | `HasReportedAsync` kapısı |
| Beğeni bildirimi | `Handlers/IncomingLikeNotifyHandler.cs` | `HasReportedAsync` erken dönüşü |
| Akış postları | `Feed/FeedQueryService.cs` → `VisiblePosts` | profil şikayeti ve içerik şikayeti (`FeedPostId`) süzgeçleri |
| Akış yanıtları | `Feed/FeedReplyQueryService.cs` | iki `UserReports` süzgeci + `GetReplierProfileAsync`'teki şikayet kapısı |
| Kampüs şeridi | `Campus/CampusQueryService.cs` | şikayet kümesi (**iki yönlü engel süzgeci DURUYOR**) |
| Kampüs an profili | `Campus/CampusMomentProfileService.cs` | `HasReportedAsync` kapısı |
| `/api/moderation/report` | `ModerationService.ReportUserAsync` | şikayetçinin havuz invalidasyonu (artık gizleyecek bir şey yok; engel seçildiyse `BlockUserAsync` zaten invalide ediyor) + kullanılmayan `IMemoryCache` bağımlılığı |

`HasReportedAsync` **silinmedi**: `ReportUserHandler`'daki mükerrer şikayet
kontrolü onu kullanıyor.

### 3.2 Engeli kaldırmak iki tarafın havuzunu düşürüyor (yeni)

`ModerationService.UnblockUserAsync` eskiden aday havuzlarına dokunmuyordu.
Isınmış havuz (TTL 15 dk) yüzünden kişi desteye ancak süre dolunca dönüyordu.
Artık iki tarafın havuzu best-effort düşürülüyor, `BlockUserAsync` ile aynı
desen: Redis hatası engel kaldırmayı geri almıyor. Kart cache'ine dokunulmadı,
çünkü kart değişmedi, yalnız süzgeç kalktı.

### 3.3 Değişmeyenler

- `UserReports` satırları, günlük çift sınırı (UT-6804), akış tekilliği
  (UT-7340), shadow-ban sayımı, moderasyon paneli.
- **Akışın global otomatik gizleme eşiği** (`FeedReportPolicy` →
  `HiddenByReports`): bu şikayetçiye özel değil, tüm izleyiciler için içerik
  moderasyonu. Aynen duruyor.
- Engel davranışı: iki yönlü süzgeç, eşleşme `Blocked`, sohbet deaktif.
  `UnblockUserAsync` eşleşmeyi `Unmatched`'a çekiyor (cooldown ve rematch
  limiti normal işliyor). Eski sohbet geri gelmiyor.
- Yanıt (Reply) şikayeti bekleyen yanıtı `Dismissed`'a çekmeye devam ediyor.
  Bu gizleme değil, gelen isteği reddetmek.

## 4. Testler

- Eski "şikayet gizler" testleri **ters çevrildi**, artık "şikayet gizlemez"i
  doğruluyorlar: deste, beğeniler, akış postu (profil ve içerik), akış yanıtları
  (liste ve rozet), kampüs şeridi, `GetHardFilterRelationsAsync`,
  `GetStillHiddenTargetsAsync`.
- Artık var olmayan kapıların testleri silindi: kurtarma, aksiyon kapısı,
  beğenen kartı, yanıtlayan kartı, an profili, beğeni bildirimi, kaçırdıkların,
  Dismissed şikayet. `ModerationReportVisibilityTests.cs` dosyası da silindi.
- Aynı postu ikinci kez şikayet etmek artık **UT-7340** dönüyor. Eskiden post
  şikayetçiye görünmediği için UT-7312 dönüyordu. Yarış testi buna göre
  sıkılaştırıldı: kaybedenlerin tümü UT-7340 almalı.
- **Yeni:** `Feed_SikayetVeEngel_EngelKalkincaGonderilerGeriGelir`
  (şikayet + engel → gizli; engel kalkınca şikayet edilen post dahil geri gelir).
- **Yeni:** `Unblock_IkiTarafinHavuzunuDusurur`,
  `Unblock_RedisHatasindaBileBasarili`.

Çalıştırma: `DOTNET_ROLL_FORWARD=LatestMajor dotnet test UniversityTinder.Tests`

## 5. Yayına almada bilinmesi gerekenler

- **Geriye dönük etki:** bugüne kadar yalnız şikayet yüzünden gizlenmiş herkes
  (profil şikayeti) ve şikayet edilen her post, şikayetçiye **geri görünür
  olur**. Engellenmiş olanlar gizli kalır. Bu istenen davranış, veri
  temizliği gerekmiyor.
- Anonim gönderinin yazarı engellenemiyor (istemci `alsoBlock:false`
  gönderiyor), dolayısıyla şikayet edilen anonim post şikayetçiye görünür
  kalır. Global eşik dolarsa herkesten gizlenir. Bilinçli kabul.
- Isınmış aday havuzları en geç TTL (15 dk) içinde yeni kurala geçer, ayrıca
  bir işlem gerekmiyor.
- Dalı gözden geçirirken `ModerationService` kurucusundan `IMemoryCache`
  parametresinin çıktığına dikkat edin (DI kaydı etkilenmiyor).

## 6. İstemci durumu (yapıldı, yayın bekliyor)

- Şikayet ekranındaki "Bu kişiyi engelle" kutusu artık **varsayılan
  işaretsiz**. Engel bilerek seçilmeli.
- Keşif ve Beğeniler'de kart yalnız `result.blocked === true` ise düşüyor.
  Akışta post yalnız `alsoBlock` seçildiyse düşüyor ve liste tazeleniyor.
- Engellenenler listesinden kaldırınca istemci akış, deste, beğeniler ve
  kampüs cache'lerini bayatlatıyor.
- "Engelleme kalıcıdır" metinleri "Engellenenler listesinden geri
  alabilirsin" olarak değiştirildi.
- İstemci, `/api/moderation/report` yanıtındaki **`blocked`** alanına
  güvenmeye devam ediyor. Bu alanın sözleşmesi değişmemeli.

**İstemci backend'den önce yayına çıkarsa:** şikayet sonrası kart istemcide
düşmez, ama eski sunucu kişiyi bir sonraki fetch'te zaten gizler. Zararsız,
yalnız tutarsız görünür. **Backend önce çıkarsa:** eski istemci kartı
koşulsuz düşürür, kişi sonraki fetch'te geri gelir. O da zararsız.
