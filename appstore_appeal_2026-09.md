# App Review Board itirazı — Lit, 4.3(b)

Durum (2026-09-22): Resolution Center cevabı gönderildi, demo hesabı + tanıtım
videosu App Review Information'a girildi, **4+ iş günüdür cevap yok.**
Escalation koşulları oluştu.

Form: developer.apple.com/contact/app-store → topic **App Rejection**
- İşaretlenecek: yalnız **4.3 - Spam**
- **2.5.4 işaretlenmeyecek** — tartışmalı değil, düzeltildi
- Limit: **2000 karakter**

Göndermeden önce `⟦TARIH⟧` yerine Resolution Center cevabını gönderdiğiniz
tarihi yazın (örn. `September 16, 2026`).

---

```text
We appeal the 4.3(b) determination. We are not asking App Review to re-judge whether our features are novel - App Review has already acknowledged the app "may include features or characteristics that distinguish it." We are asking you to reconsider whether Lit belongs to the saturated category the guideline governs.

Lit is not distributed to the general public. It cannot be downloaded and used by a general audience. Access requires a verified institutional email address on a server-maintained registry of 200+ accredited Turkish university domains (.edu.tr). There is no personal-email path and no manual "select your university" fallback: sign-up terminates for any unrecognized domain, and a member's university is derived from that verified domain and cannot be self-declared or edited.

Guideline 4.3(b) addresses apps competing for the same general audience in an oversupplied category. Lit competes for none of that audience. A user who does not hold a credential at one of those institutions cannot become a user at all. Removing Lit does not reduce the number of apps available to App Store customers seeking a dating app, because Lit was never available to them.

The population Lit does serve - students at a specific Turkish university - has no App Store option that verifies institutional membership as a condition of entry. For that population the category is not saturated; it is empty.

We would also note that the original reviewer could not create an account, and would have seen only the sign-in screen. We supplied demo credentials, a registration test path and a walkthrough video in a Resolution Center reply on ⟦TARIH⟧; the response we received did not indicate whether the app was re-examined with that access.

We would welcome a phone call with the review team. We believe this distinction is easier to establish in conversation than in correspondence, and we would rather understand your position than continue resubmitting.
```

---

## Gönderdikten sonra

- Resolution Center kanalını **kapatmayın**, "Cancel Submission" tıklamayın.
- Board tipik olarak birkaç iş günü içinde dönüyor; dönene kadar yeni build
  göndermeyin (Extended Review uyarısı hâlâ geçerli).
- Board da reddederse kalan iki yol: listeyi "doğrulanmış kampüs ağı" üzerinden
  yeniden konumlandırmak, veya flört dışı bir kampüs katmanı eklemek.

## Not: NSMotionUsageDescription

`e5fac47` ile geri konuldu — ITMS-90683 (missing purpose string) yükleme hatası
veriyordu. `app.json` → `expo-location` → `motionUsagePermission` metni ve
`locales/{en,tr}.json` karşılıkları **kalmalı**, tekrar `false` yapılmamalı.
JS tarafında motion API'si çağrılmıyor ama Apple'ın statik analizi binary'de
CoreMotion referansı buluyor.
