# Backend'e iki soru — selfieResetAt prod'da mı, hukuki metinler güncel mi

Tarih: 2026-09-10
Yazan: frontend
İlgili: `UniversityTinder/docs/frontend_selfie_reset_reason_guide.md`
FE durumu: ✅ **iki iş de bitti ve merge'e hazır** — aşağıdakiler doğrulama/aksiyon talebi

---

## 0. Özet

| # | Konu | Kimde | Ne lazım |
|---|---|---|---|
| 1 | `selfieResetAt` prod'da dönüyor mu | backend | **Doğrulama** — 2 dakika |
| 2 | Hukuki metinler silme davranışıyla çelişiyor | backend | **Düzeltme** — metin sizde |

İkisi bağımsız. Birincisi bloke etmiyor (FE geriye dönük uyumlu yazıldı),
ikincisi App Store incelemesi için önemli.

---

## 1. `selfieResetAt` prod'da dönüyor mu?

### Durum

`frontend_selfie_reset_reason_guide.md`'de istenen FE işi bitti:

- `resolveSelfieResetAt` yazıldı (`src/features/profile/selfie/selfieVerification.ts`)
  — `??` KULLANILMADI, uyardığınız gibi `root !== undefined` kontrolüyle;
  `null` gerçek cevap olarak korunuyor
- `SelfieVerificationRow` durum çıkarımı sunucudan okuyor, alan gelmezse
  `wasSelfieVerifiedBefore`'a düşüyor
- 13 test eklendi (5 çözücü + 8 satır bileşeni), hepsi geçiyor

Sizin taraf da hazır görünüyor — `7365d55` commit'i `origin/master`'da:

| Parça | Yer |
|---|---|
| `UserProfile.SelfieResetAt` | `Models/Profile.cs:259` |
| `UserDto.SelfieResetAt` | `Models/Dto/UserDto.cs:56` |
| AutoMapper eşlemesi | `MappingConfig.cs:73` |
| Migration | `20260909212947_AddSelfieResetAt` |

### Doğrulayamadığımız

`/api/profile/me` token istediği için FE'den bakamıyoruz. İki şey:

1. **`7365d55`'i içeren deploy koştu mu?** Migration'lar startup'ta otomatik
   uygulanıyor (`deploy.yml:186`), yani deploy geçtiyse kolon da açılmış olmalı —
   ama teyit edemiyoruz.
2. **Yanıtta alan fiilen var mı?** `user` altında, `isSelfieVerified`'ın yanında.

### Nasıl bakılır

```bash
# 1) Sunucudaki imaj güncel mi
ssh deploy@178.105.240.171 'cd /opt/unitinder && docker compose images api'

# 2) Kolon açıldı mı
ssh deploy@178.105.240.171 'cd /opt/unitinder && docker compose exec -T mssql \
  /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$SA_PASSWORD" \
  -Q "SELECT COUNT(*) FROM sys.columns WHERE name = '"'"'SelfieResetAt'"'"' \
      AND object_id = OBJECT_ID('"'"'UserProfiles'"'"')"'

# 3) Yanıtta dönüyor mu (herhangi bir kullanıcı token'ıyla)
curl -s https://api.lit.4ourstack.com/api/profile/me \
  -H "Authorization: Bearer $TOKEN" | jq '.result.user | {isSelfieVerified, selfieResetAt}'
```

Beklenen üçüncü çıktı — sıfırlanmamış kullanıcıda:

```json
{ "isSelfieVerified": true, "selfieResetAt": null }
```

🔴 Dikkat: alanın **hiç gelmemesi** ile `null` gelmesi FE'de FARKLI şeyler.
`null` = "sıfırlanmadı, sunucu söyledi". Alan yoksa FE eski yerel tahmine
düşüyor, yani rehberde anlattığınız bug geri geliyor. `jq` çıktısında
`selfieResetAt` anahtarı hiç görünmüyorsa mapping prod'a çıkmamış demektir.

### Bloke mi?

Hayır. FE her iki hâlde de doğru çalışıyor — alan gelmezse mevcut davranış
aynen sürüyor. Sadece bug deploy edilene kadar kapanmıyor.

---

## 2. Hukuki metinler silme davranışıyla çelişiyor

### Sorun

Uygulamadaki "Hesabı Sil" akışını `DELETE /api/privacy/account`'a bağladık —
kalıcı, anında, şifre teyitli. Eski `POST /api/privacy/delete-account` artık
kullanılmıyor (sizde de `[ESKİ]` işaretli ve zaten donduruyor).

Ama **backend'in servis ettiği** hukuki metinler hâlâ 30 günlük modeli
anlatıyor:

| Dosya | Satır | Metin |
|---|---|---|
| `wwwroot/legal/terms-of-service-v1.0.md` | 48 | "…talebinizi 30 gün içinde geri alabilirsiniz." |
| `wwwroot/legal/privacy-policy-v1.0.md` | 118 | "hesabınız 30 gün boyunca askıya alınır ve bu süre içinde giriş yaparak silme talebinizi iptal edebilirsiniz." |

Bu metinler `GET /api/privacy/policy/{type}` ile servis ediliyor ve uygulama
içinde okunuyor.

### Neden önemli

- **App Store**: Guideline 5.1.1(v) silmenin gerçekten silme olmasını istiyor.
  Uygulama siliyor ama politika "30 gün askıda" diyor — inceleme bu çelişkiyi
  okuyor. İlk gönderim öncesi kapatılmalı.
- **KVKK**: aydınlatma metninde var olmayan bir saklama süresi anlatmak,
  fiilî işlemeyle metnin uyuşmaması demek.

### Aynı metin üç yerde

Hangisinin kanonik olduğunu bilmiyoruz, o yüzden hiçbirine dokunmadık:

1. `UniversityTinder/UniversityTinder/wwwroot/legal/*.md` ← backend servis ediyor
2. `lit-landing/legal/*.md` ← web sitesi
3. `uni_tinder/src/shared/i18n/translations/{tr,en}.ts` ← uygulama içi kopya
   (tr.ts:221 ve tr.ts:518)

Üçünün birlikte güncellenmesi ve yürürlük tarihinin değişmesi gerekiyor.
Kanonik kaynak sizdeyse metni siz yazın, biz i18n kopyasını ona göre
güncelleriz — haber verin yeter.

### Öneri (metin sizin kararınız)

Yeni davranışın karşılığı:

> Hesabınızı dilediğiniz an uygulama içinden **kalıcı olarak** silebilirsiniz;
> silme anında gerçekleşir ve geri alınamaz. Ara vermek isterseniz hesabınızı
> **dondurabilirsiniz** — verileriniz durur, tekrar giriş yaptığınızda hesabınız
> kaldığı yerden açılır.

Saklanan tek kaydın (e-posta hash'i + silinme tarihi + ban durumu) anlatıldığı
paragraf aynen kalabilir, o kısım hâlâ doğru.

---

## 3. Yan not — eski uçlar

`POST /delete-account`, `POST /cancel-deletion`, `GET /deletion-status`
üçünü de FE artık HİÇ çağırmıyor; `api.ts`'ten çıkarıldı, `DeletionBanner`
bileşeni silindi. Sizde `[ESKİ]` işaretli duruyorlar — eski istemciler için
tutuyorsanız sorun yok, sadece bilginiz olsun: yeni sürümden sonra trafik
sıfıra iner.

---

Sorularınız için frontend'e yazın. Birinci maddeyi doğrulayınca haber verin,
bug'ın kapandığını cihazda teyit edelim.
