# App Store Review — cevap taslağı (Submission da80f216)

> **GÖNDERMEDEN ÖNCE:** aşağıdaki `⟦…⟧` alanlarının hepsi doldurulmalı. Track D
> bitmeden bu mektup gönderilmemeli — demo hesabı ve video eklenemeden gönderilen
> cevap, reddi tekrarlatmaktan başka işe yaramaz.
>
> Doldurulacaklar:
> - `⟦DEMO_EMAIL⟧` / `⟦DEMO_PASSWORD⟧` — seed'li incelemeci hesabı
>   (**`ignoreDistanceFilter = true` ŞART**, premium yetki, dolu deste, ≥1 eşleşme,
>   sesli mesajlı sohbet, alınmış bir Not, foto doğrulama rozeti)
> - `⟦ALLOWLIST_DOMAIN⟧` / `⟦ALLOWLIST_OTP⟧` — kayıt akışını denemesi için
>   allowlist'e alınmış geçici domain + sabit kod
> - Videolar App Store Connect → App Review Information → Notes alanına eklenmeli
>   (Resolution Center mesajına dosya iliştirilemiyor)
>
> Gönderim sırası: **önce bu cevap → Apple yanıtlasın → sonra yeni binary.**
> "Extended Review" uyarısı yüzünden körlemesine yeni gönderim riskli.
>
> Apple "kendi dilinizde yazabilirsiniz" diyor ama İngilizce yazmak incelemeyi
> hızlandırıyor. Türkçe tercih ederseniz aynı metnin çevirisi yeterli.

---

## 1. Reply to App Review (kopyala-yapıştır — 4000 karakter sınırına uygun)

> ASC'deki "Reply to App Review" kutusu **düz metin** ve **4000 karakter**.
> Aşağıdaki sürüm bunun için kısaltıldı; markdown işareti yok, olduğu gibi
> yapıştırılabilir. Kutunun altındaki **Attach File** ile video da eklenebilir.

```text
Hello,

Thank you for the detailed feedback. We have addressed both items, and would like to provide information that was not available during the review.

GUIDELINE 2.5.4 - BACKGROUND AUDIO

You are correct, and we have removed it. Lit has no background audio feature. The "audio" entry was injected into UIBackgroundModes by the default setting of a third-party build plugin we use for voice messages (expo-audio, whose background playback option defaults to enabled). We never used the capability - playback already stopped whenever the app was backgrounded. We have disabled that option, and the next build declares only "remote-notification". As the app has no persistent-audio feature, we have taken the second remedy you described rather than submitting a recording.

GUIDELINE 4.3(b) - APP CONCEPT

We would respectfully offer some context, because we believe the reviewer was unable to reach the parts of the app that distinguish it.

Lit is a closed network, not an open dating app. Registration requires a verified institutional email on a server-maintained registry of more than 200 accredited Turkish university domains (.edu.tr). There is no way to join with a personal email, and no manual "select your university" fallback - the sign-up flow terminates for any unrecognized domain. A member's university is derived from the verified domain and cannot be self-declared or edited afterward.

A reviewer without a Turkish university email therefore could not create an account, and would have seen only the sign-in screen. That was our oversight in preparing the submission, and we have now provided full access:

- Demo account: ⟦DEMO_EMAIL⟧ / ⟦DEMO_PASSWORD⟧ - pre-populated with matches, conversations and received activity, so every feature is immediately reachable.
- To experience the university gate yourself: any address at ⟦ALLOWLIST_DOMAIN⟧ with verification code ⟦ALLOWLIST_OTP⟧ completes registration. By contrast, test@gmail.com is refused - that refusal is the core of the product.

Features built for a campus context, which general-audience dating apps do not have:

1. Two-directional university-scoped visibility. Members restrict not only whom they see (up to 3 universities) but whom they are visible to - allowing only specific universities (up to 3), or hiding from specific ones (up to 5). This solves a problem unique to closed campus populations: avoiding a former partner, a relative, or a classmate at a specific institution.

2. Academic profile fields. Department and year of study are first-class, filterable fields, including Hazirlik (preparatory year), a Turkish higher-education concept with no equivalent elsewhere. Cards surface a "Same University" indicator.

3. Notes. Instead of a generic like, a member attaches a 150-character comment anchored to one specific photo, or one specific prompt answer, on another profile. The recipient sees exactly what was referenced.

4. Trust and safety for a verified-identity community: server-issued randomized selfie challenges compared against the profile photo, per-photo automated moderation with an in-app appeal process, and a gate that removes a profile from discovery until its photos are approved. Biometric processing requires two separate explicit consents under Turkish Law No. 6698 (KVKK), including a distinct consent for cross-border transfer.

Lit is not built on a dating app template. The client, the .NET backend and the SignalR real-time messaging layer are developed in-house. The app operates in one country, in Turkish, under a single national data protection framework, for a population that must prove institutional membership to participate.

If the concern remains after reviewing the app with the access above, could you tell us specifically what evidence or changes would resolve it? We would also welcome a phone call if that is more efficient than written correspondence.

Thank you for your time.
```

---

## 1b. Uzun sürüm (arşiv — App Review Board itirazı için)

> 4000 karakteri aşıyor, ASC reply kutusuna sığmaz. App Review Board itirazında
> veya telefon görüşmesine hazırlık notu olarak kullanılabilir.

Hello,

Thank you for the detailed feedback. We have addressed both items and would like to provide information that we believe was not available during the review.

### Guideline 2.5.4 — Background audio

You are correct, and we have removed it. Lit has no background audio feature. The `audio` entry was injected into `UIBackgroundModes` by the default setting of a third-party build plugin we use for voice messages (`expo-audio`, whose `enableBackgroundPlayback` option defaults to enabled). We did not intend to declare this capability and never used it — audio playback already stopped whenever the app was backgrounded.

We have explicitly disabled that option. The next build declares only `remote-notification`. We have also attached a screen recording to the App Review Information notes demonstrating that no audio continues after navigating to the Home Screen, as requested.

### Guideline 4.3(b) — App concept

We would like to respectfully offer some context, because we believe the reviewer was unable to reach the parts of the app that distinguish it.

**Lit is a closed network, not an open dating app.** Registration requires a verified institutional email address on a server-maintained registry of more than 200 accredited Turkish university domains (`.edu.tr`). There is no way to join with a personal email address, and there is no manual "select your university" fallback — the sign-up flow terminates for any unrecognized domain. A user's university is *derived from the verified email domain* and cannot be self-declared or edited afterward.

This means a reviewer without a Turkish university email address could not create an account, and would have seen only the sign-in screen. We recognize this was our oversight in preparing the submission, and we have now provided full access:

- **Demo account:** `⟦DEMO_EMAIL⟧` / `⟦DEMO_PASSWORD⟧` — pre-populated with matches, conversations, and received activity so every feature is reachable immediately.
- **To experience the university gate yourself:** entering any address at `⟦ALLOWLIST_DOMAIN⟧` with verification code `⟦ALLOWLIST_OTP⟧` will complete registration. For contrast, entering `test@gmail.com` will be refused — that refusal is the core of the product.
- **Walkthrough video** attached in the App Review Information notes.

**Features built specifically for a campus context, which general-audience dating apps do not have:**

1. **Two-directional university-scoped visibility.** Members can restrict not only whom they see (up to 3 universities) but whom they are *visible to* — either allowing only specific universities (up to 3) or hiding from specific universities (up to 5). This exists to solve a problem unique to closed campus populations: avoiding a former partner, a relative, or a classmate at a specific institution. We are not aware of a general-audience dating app that offers this.

2. **Academic profile primitives.** Department and year of study are first-class, filterable profile fields — including *Hazırlık* (preparatory year), a Turkish higher-education concept with no equivalent elsewhere. Cards surface a "Same University" common-ground indicator.

3. **Notes.** Rather than a generic like, a member can attach a 150-character comment anchored to one *specific* photo or one *specific* prompt answer on another member's profile. The recipient sees exactly what was referenced.

4. **Trust and safety built for a verified-identity community.** Server-issued randomized selfie challenges compared against the profile photo; per-photo automated moderation with an in-app appeal process; and a visibility gate that removes a profile from discovery until its photos are approved. Biometric processing requires two separate explicit consents under Turkish Law No. 6698 (KVKK), including a distinct consent for cross-border transfer.

**On duplication:** Lit is not built on a dating app template. The client, the .NET backend, and the SignalR real-time messaging layer are all developed in-house. The app operates in a single country, in Turkish, under a single national data protection framework, for a population that must prove institutional membership to participate.

We would genuinely appreciate your guidance. If, after reviewing the app with the access above, the concern remains, could you tell us specifically what evidence or changes would resolve it? We would also welcome a phone call with the review team if that would be more efficient than written correspondence.

Thank you for your time.

---

## 2. App Review Information → Notes alanı (kısa sürüm)

> Bu metin ASC'de **App Review Information → Notes** alanına girilmeli, videolar da
> oraya eklenmeli. Resolution Center mesajı dosya kabul etmiyor.

**IMPORTANT — this app requires a verified Turkish university email to register.**

Sign in with the demo account below; it is pre-populated so all features are immediately reachable:

- Email: `⟦DEMO_EMAIL⟧`
- Password: `⟦DEMO_PASSWORD⟧`

To test registration, use any address at `⟦ALLOWLIST_DOMAIN⟧` with verification code `⟦ALLOWLIST_OTP⟧`. Registration with a non-university address (e.g. `test@gmail.com`) is refused by design — this gate is the core of the product.

Attached recording: full feature walkthrough (university gate → department/year → prompts → discovery → university visibility controls → Note → match → chat with voice message).

Re: Guideline 2.5.4 — the app has no persistent-audio feature, so the `audio` background mode has been removed from `UIBackgroundModes` in this build rather than demonstrated.

The app is Turkish-language and operates only in Turkey. Set the device language to English for an English UI.

---

## 3. App Review Board itirazı — "Reason for appeal" (2000 karakter)

> **HENÜZ GÖNDERME.** Sıra: Resolution Center cevabı → Apple yanıtlasın →
> karar değişmezse burası. Board da incelemecinin gördüğü kaydı okuyor; demo
> erişimi sunulmadan gidilen itiraz, escalation hakkını boşa harcar.
>
> Form: developer.apple.com/contact/app-store → topic **App Rejection**.
> Yalnız **4.3 - Spam** işaretlenmeli; 2.5.4 tartışmalı değil, düzeltildi.
>
> Gönderirken son paragrafa Resolution Center yazışmasının tarihini ve
> Apple'ın cevabının özetini eklemek argümanı güçlendirir.

```text
We appeal the 4.3(b) determination and believe the review record is incomplete.

Lit is a closed, credential-gated network for students at accredited Turkish universities, not an open-audience dating app. Registration requires a verified institutional email on a server-maintained registry of 200+ .edu.tr domains. There is no personal-email path and no manual "select your university" fallback: sign-up terminates for any unrecognized domain. A member's university is derived from the verified domain and cannot be self-declared or edited.

Consequently a reviewer without a Turkish university email could not create an account, and would have seen only the sign-in screen. We did not supply working demo access with the original submission - our error. Credentials, a registration test path and a walkthrough video are now in App Review Information.

Features that do not exist in general-audience dating apps:

1. Two-directional university-scoped visibility. Members control not only whom they see (up to 3 universities) but whom they are visible to - allowing only specific universities (up to 3), or hiding from specific ones (up to 5). This addresses a problem unique to closed campus populations: avoiding a former partner, a relative, or a classmate at a named school.

2. Academic profile fields as first-class filterable data, including Hazirlik (preparatory year), a Turkish concept with no equivalent elsewhere.

3. Notes: a 150-character comment anchored to one specific photo or one specific prompt answer on another profile - not a generic like.

4. Verification built for a credentialed community: randomized server-issued selfie challenges, per-photo moderation with an in-app appeal, and dual explicit biometric consents under Turkish Law 6698 (KVKK).

Lit is not built on a dating app template. The client, the .NET backend and the SignalR messaging layer are developed in-house, for one country and one language.

We ask that the app be re-examined with the access now provided.
```

Apple tavrını korursa yedekteki iki seçenek devreye girer (ikisi de planda
kapsam dışı bırakılmıştı):
- listeyi "flört" yerine **doğrulanmış kampüs ağı** üzerinden yeniden konumlandırmak
  (ad, altyazı, açıklama, anahtar kelimeler, ekran görüntüleri),
- gerçekten flört dışı bir kampüs katmanı eklemek (etkinlik/kulüp/akış) — uygulama
  bugün tamamen swipe/eşleşme/sohbet.
