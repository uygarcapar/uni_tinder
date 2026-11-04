# Çapraz-mod mesaj toast'ı + mod devri — kısa tasarım

Onay: sohbet içinde onaylandı (2026-11-04).

## Niyet

Başka moddaki bir sohbetten mesaj gelince kullanıcı bunu toast'ta görsün
(`[Arkadaş] Ayşe` gibi düz metin etiket) ve toast'a ya da push bildirimine
basınca doğru moda geçmiş olarak chat'e düşsün. Bugün toast modsuz basılıyor
ve tap mod devri yapmıyor: Friends sohbetine Dating modundayken girip geri
dönen kullanıcı sohbeti listede bulamıyor (liste `mode` ile istemcide
süzülüyor).

## Hedefler

- Mesaj toast'ında, konuşmanın modu o anki seçili moddan FARKLIYSA gönderen
  adının başında `[<mod adı>]` etiketi.
- Toast tap'i navigate'ten önce `writeAppMode` ile mod devri yapar.
- Push tap'i (`routeFromNotification` → `Message`/`Match` dalı) aynı devri
  yapar; mod push payload'ında YOK, yerel `conv` satırından okunur.

## Hedef olmayanlar / anti-hedefler

- Backend değişikliği yok (payload'a mode eklenmesi beklenmiyor).
- MessageToast görselinde etiket dışında değişiklik yok; rozet/renk yok
  (kullanıcı düz metni seçti).
- `conv.mode` boşsa (eski satırlar) etiket de devir de YOK — `undefined`
  asla Dating sayılmaz (ConversationListItemDto kuralı).

## Kararlar

- Etiket metni mevcut `discover.mode.title.*` anahtarlarından
  (`modeTitleKey`); yeni i18n anahtarı yok. Köşeli parantezi bileşen basar.
  (Benim tercihim: ham "[Friends]" yerine uygulamadaki mod adlarıyla
  tutarlılık — TR'de `[Arkadaş]` / `[Flört]`.)
- Mod devri kalıbı Like push'ındaki "MOD DEVRİ" fıkrasının aynısı
  (`isAppMode` kapısı + `writeAppMode`); React dışı okuma `readAppModeFor`.
- Tap'te devir KOŞULSUZ `writeAppMode(selfUserId, convMode)`: değer aynıysa
  zaten no-op (olay atılmıyor), ve toast ekrandayken kullanıcı mod
  değiştirirse tap yine doğru moda indirir.

## Yaklaşımlar

Tek makul yol: `conv` satırı toast tetiklenen iki noktada da zaten elde,
mod devri kalıbı kodda kurulu. Alternatif (payload'a mode ekletmek) backend
işi ve yerel satır aynı bilgiyi veriyor; rozet/renk alternatifi kullanıcı
tarafından elendi.

## Uygulayıcıya kalanlar

Etiketin satır içi tipografisi (ad ile aynı stil) ve test mock ayrıntıları.
