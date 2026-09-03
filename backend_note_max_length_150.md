# İstek — not karakter tavanı 240 → **150**

Tarih: 2026-08-28
Alan: `Stats.noteMaxLength` (`GET /api/swipe/stats`)
Uç: `POST /api/swipe/Note`
İlgili sözleşme: `backend_note_consumable_proposal.md` — **§9 / D7 revizyonu**

---

## 0. Tek cümlelik talep

`Stats.noteMaxLength` **150** dönsün. Sunucu tarafı doğrulama da 150'ye insin,
ama **bizden sonra** — sıralama önemli, bkz. §4.

---

## 1. Neden — D7 kararını biz vermiştik, biz revize ediyoruz

240 sayısı sözleşmenin D7 satırında **FE önerisi** olarak geçti:

> **D7** | Karakter tavanı? | **240.** Mesajlaşma değil, bir açılış cümlesi.

Gerekçe doğruydu, sayı yanlıştı. 240 karakter "açılış cümlesi" değil, **mini
mesaj**: composer'da dört-beş satır dolduruyor ve notu, kullanılmasını
istediğimiz şeyden — kısa, çengel atan bir cümleden — uzaklaştırıyor.

Karşılaştırma noktaları, birebir aynı işi yapan uçlar:

| Ürün | Uç | Tavan |
|---|---|---|
| Bumble | **Compliment** — foto/prompt/bio'ya iliştirilen maç öncesi mesaj | **150** |
| Hinge | Prompt cevabı | **150** |
| **Biz (bugün)** | Not | **240** |
| **Biz (kendi prompt cevabımız)** | `PROMPT_ANSWER_MAX_LENGTH` | **150** |

Son satır asıl tutarsızlık: kullanıcı **kendi profilinde** bir prompt cevabını
150'de kesiliyor, ama **başkasının** o 150 karakterlik cevabının altına 240
karakter yazabiliyor. Notun hedefi, notun kendisinden kısa.

150 ayrıca bizim ürünümüzde ölçülü bir sayı: not kutusu Beğeniler'de kapalıyken
iki satır gösterip kırpıyor, açıldığında **kartı taşırmadan** sığması gereken
metin bu. 240'ta açık kutu fotoğrafın üstüne belirgin biçimde biniyor.

---

## 2. İstenen değişiklik

Yeni alan yok, yeni uç yok, DTO değişmiyor. Yalnız **iki sayı**:

```jsonc
// GET /api/swipe/stats
{
  "notesRemaining": 3,
  "purchasedNotes": 2,
  "quotaNotesRemaining": 1,

  "noteMaxLength": 150   // 240 idi
}
```

ve `POST /api/swipe/Note` doğrulamasında `comment` üst sınırı 240 → 150.

Sayım birimi **değişmiyor**: rune / code point, `string.Length` değil
(sözleşme §4). FE de `[...text].length` ile sayıyor, emoji iki taraf için de 1.

---

## 3. Mevcut kayıtlar — dokunulmasın

DB'de 240'a kadar uzayan notlar **var olabilir**. Bunların hiçbiri için
migration, truncate ya da geri dolgu **istemiyoruz**:

- Okuma yolunda sınır uygulanmasın — eski not tam metniyle dönsün.
- FE zaten okuma tarafında tavana bakmıyor: kutu metni **ölçüp** iki satırda
  kırpıyor, dokunulunca tamamı açılıyor. 240'lık eski bir not bugünkü ekranda
  sorunsuz görünüyor, yalnız açık hali biraz uzun.

Sınır **yazma** yolunda, yani yalnız yeni notlarda.

---

## 4. Sıralama — tek riskli nokta

Tavanı aşağı çekmek iki yönde simetrik değil:

- **`noteMaxLength: 150` dönmek risksiz.** Her istemci daha kısa metin gönderir,
  daha kısa metin 240'lık doğrulamadan geçer. Hiçbir sürüm kırılmaz.
- **Doğrulamayı 150'ye indirmek riskli.** Sahadaki eski istemcilerde tavan
  gelmediğinde `240` yedeği vardı; onlar hâlâ 240 karakter POST'layabilir ve
  doğrulama inerse **400 yemeye başlarlar** — `weeklySuperLikeLimit`te yaşanan
  hatanın aynısı.

Bu yüzden istediğimiz sıra:

1. **Şimdi:** `noteMaxLength` 150 dönsün, doğrulama 240'ta **kalsın**.
2. **Sonra:** 240 yedekli sürümlerin kullanımı düştüğünde doğrulama 150'ye insin.

Adım 2 hiç yapılmasa da ürün doğru çalışır: kullanıcı arayüzde 150'yi aşamıyor,
240 yalnız kapanmamış bir kapı olarak kalıyor. Yani adım 1 tek başına yeterli,
adım 2 temizlik.

Yeni bir hata kodu **istemiyoruz** — taşma zaten `UT-6413` (geçersiz gövde)
ailesinde ve FE oraya hiç düşmüyor.

---

## 5. FE tarafında hazır olan

Sürüm çıkmasını beklemenize gerek yok, istemci **bugün** 150'de kesiyor:

- `NOTE_MAX_LENGTH = 150` — hem `noteMaxLength` gelmediğindeki varsayılan hem de
  istemci tavanı (`src/features/discover/noteTarget.ts`).
- `resolveNoteMaxLength(server)` → `Math.min(server, 150)`. Sunucu **240
  dönmeye devam ederken bile** composer, karakter sayacı, `clampNoteText`
  kırpması ve `noteSchema` doğrulaması 150'yi kullanıyor.
- Alan 150 dönmeye başladığında FE'de **hiçbir değişiklik gerekmiyor** —
  `Math.min` iki tarafı da aynı sayıya getirir.

Tavan ileride **yukarı** çıkarılmak istenirse bu `Math.min` bir tavan olarak
durur: sunucu 300 dönse de istemci 150'de kalır, yeni sürüm gerekir. Bilerek
böyle — aşağı çekmek güvenli, yukarı çıkarmak ürün kararı.

---

## 6. Karar tablosuna işlenecek satır

`backend_note_consumable_proposal.md` §9'daki D7 satırı bununla değişiyor:

| # | Soru | **Karar** |
|---|---|---|
| **D7** | Karakter tavanı? | ~~240~~ → **150** (2026-08-28). Açılış cümlesi; Bumble Compliment ve Hinge prompt cevabıyla aynı, kendi `PROMPT_ANSWER_MAX_LENGTH`imizle de tutarlı. `Stats.noteMaxLength` ile sunucudan gelmeye devam ediyor. |
