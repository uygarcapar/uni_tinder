# Keşif beğen/geç uçuşu — PARK EDİLDİ (2026-11-06)

**Durum:** Kod silinmedi, yorum satırı olarak duruyor. Beğen/geç yine alev
banner'ıyla (örtü altı devir) çalışıyor.

**İstek:** "Swipe'la sağ sola atma animasyonunu kaldır ama comment'e al, geri
alınabilir dursun. Like'ta da dislike'ta da fire banner'ı geri getir — tik, X,
not, Fire/Spark, Beğeniler ekranı, Akış: nerede beğenirsem/atarsam banner çıksın."

Uçuşun tasarımı: `2026-11-06-discover-exit-flight-design.md` (commit'ler
`700933e`, `fac1b3e`, `2fc1b04`, `3f8ff82`, `d4a70d6`).

## Park edilen kod nerede

| Dosya | Ne |
|---|---|
| `src/features/discover/components/SwipeWrapper.tsx` | `runCoveredExit`in başındaki `if (direction !== "up") flyOut(...)` dalı (yorumda) |
| aynı dosya | `flyOut` + `finishFlight` fonksiyonlarının tamamı (`// ` önekli blok, "PARK EDİLDİ" başlığıyla) |
| aynı dosya | `Easing` ve `flyOutDurationMs` importları (yorumda) |
| `src/features/discover/screens/DiscoverScreen.tsx` | `SWIPE_BUTTON_LOCK_MS = 250` (yorumda; şu an `FIRE_BUTTON_LOCK_MS` = 1300) |
| `src/features/discover/exitFlight.ts` + testi | Dokunulmadı, hâlâ derleniyor ve test ediliyor |

Uçuşla birlikte gelen ve park sırasında da yerinde kalanlar (zararsız):
`resetAfterExit({ keepTx })` seçeneği, `commitExit`in `velocityX` geçirmesi,
`cancelDragForPinch`teki `exitPending` kapısı.

## Uçuşu geri açmak (4 adım)

1. `SwipeWrapper.tsx` → importlarda `Easing` ve `flyOutDurationMs` satırlarını aç.
2. Aynı dosyada "PARK EDİLDİ (2026-11-06)" başlıklı bloğun `// ` öneklerini
   kaldır (`flyOut` + `finishFlight`).
3. `runCoveredExit`te:
   - yorumdaki `if (direction !== "up") { flyOut(direction, _velocityX); return; }` dalını aç,
   - eşleşme kapısını `if (direction !== "left" && willMatch?.(profile))` →
     `if (willMatch?.(profile))` yap (uçuşta eşleşmeli beğeni de uçuyor, perde
     arkadan geliyor).
4. `DiscoverScreen.tsx` → `SWIPE_BUTTON_LOCK_MS`i yeniden `250` yap.

`handleSwipe`teki `matching` notu park süresince "beğeni bu dala yine giriyor"
diyor; geri açınca o ek notu sil.

## Park süresince geçerli eylem matrisi

| Yüzey | Eylem | Görsel |
|---|---|---|
| Keşif | geç / beğen (jest + tik/X) | alev, deste örtü altında (`hold`) |
| Keşif | beğen + eşleşme | MatchModal perdesi (alevin perde hâli) |
| Keşif | Fire/Spark · not | alev (değişmedi) |
| Keşif | geri al | alevsiz, soldan kayarak (değişmedi — beğeni/atma değil) |
| Beğeniler | X (kart + modal) | alev (YENİ) + kart sola uçar |
| Beğeniler | tik / Fire / kurtarma | MatchModal perdesi (hepsi kesin eşleşme) |
| Akış yazar kartı | reddet | alev (YENİ) |
| Akış yazar kartı | kabul / Fire / not | eşleşme yoksa alev, varsa MatchModal perdesi |
| Akış gönderi notu | not | alev (YENİ), yazar seni beğenmişse perde |
| Akış kampüs anı | tik | alev (değişmedi) |

**Kural:** her karar bir alev görür; ama eşleşmeye giden kararda alev
MatchModal'ın perdesidir — üstüne süpürme de oynatılmaz (tek karara iki alev,
2026-09-05 `ac0d53a`).

Akıştaki gönderi kalbi (post beğenisi) kişiye beğeni olmadığı için kapsam dışı.
