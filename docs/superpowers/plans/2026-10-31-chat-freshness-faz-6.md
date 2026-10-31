# Faz 6 — Tazelik boşluğu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub bağlı kalıp bir event kaçırdığında ekran, kullanıcı uygulamayı arkaya atıp dönene kadar bayat kalmasın.

**Architecture:** `startDeltaSync`'in mevcut `fire(reason)`'ına **foreground'da seyrek periyodik** bir tetik ekleniyor. Yeni tur mantığı YOK: `pullChanges`, `MIN_PULL_INTERVAL_MS` kısıtlayıcısı, watermark, tam-senkron dalı ve `onApplied` olduğu gibi devralınıyor.

**Tech Stack:** React Native `AppState`, expo-sqlite, jest (`PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest`).

**Spec:** `chat_local_first_roadmap_2026-10.md` → "Faz 6 — Tazelik boşluğu (düşük öncelik)" (satır ~318-322).

## Bu fazın kapsamı bilerek küçük

Roadmap'in kendi ifadesi: *"Bugün bilinen bir şikâyet üretmiyor — en sona."* Yani bu, bilinen bir hatayı düzeltmiyor; bilinen bir **deliği** kapatıyor. Kapsamı büyütmek (ör. her sohbet için ayrı tur, ya da görünür bir "yenile" düğmesi) bedava değil ve talep edilmedi.

**Delta turu bugün yalnız hub `connected` olayında koşuyor** (`chatDeltaSync.ts:291-320`; yorumu boot'ta doğrudan çekmemenin gerekçesini anlatıyor — token henüz yerinde olmayabilir, ilk `connected` açılış turu sayılıyor). Hub bağlı kalıp bir event düşerse yeni bir `connected` gelmiyor ve ekran bayat kalıyor.

## Global Constraints

- **Rate limit kovası PAYLAŞIMLI:** `messaging_default` = 200 istek/60sn, TÜM `MessagesController`'da, kullanıcı başına. Geçmiş sayfalama, backfill (80 rezerv), mutasyon kuyruğu (20 rezerv) ve bu tur aynı kovadan içiyor. Periyodik tur **dördüncü tüketici** oluyor — seyreklik bir tercih değil, kısıt.
- **Yeni tur mantığı YAZILMAYACAK.** `fire()` ve `MIN_PULL_INTERVAL_MS` devralınıyor; ikinci bir throttle, ikinci bir watermark yolu, ikinci bir `pullChanges` çağıranı icat edilmeyecek.
- **Arka planda ASLA ateşlenmeyecek** — pil ve kota. Hub kopukken de ateşlenmeyecek: o hâli zaten `connected` tetiği kapatıyor ve kopuk hatta istek atmak boşa slot yakar.
- **Bir yorum ya da test, kırılsa yakalayacağından fazlasını iddia etmeyecek.** Bu işin baskın kusur sınıfı — altı fazda 35+ bulgu; yalnız önceki iki dalda altı test "pin'lediğini söylediği satır silinince hâlâ geçiyor" diye yakalandı.
- Türkçe yorumlar, çevre dosyaların ses ve yoğunluğuyla.

## Review Focus

1. **Arka plana geçince zamanlayıcı DURMALI**, öne dönünce yeniden kurulmalı. Durmazsa pil ve paylaşımlı kota arka planda yanar. → Task 1.
2. **Söküm (`stop()`) zamanlayıcıyı temizlemeli.** Sızan bir interval, logout'tan sonra bile istek atmaya devam eder — oturum kapanmışken 401 üretir. → Task 1.
3. **Periyot `MIN_PULL_INTERVAL_MS`'ten KISA olmamalı**, yoksa tetik ateşlenip kısıtlayıcı tarafından sessizce yutulur: görünürde çalışan, gerçekte hiçbir şey yapmayan bir zamanlayıcı. → Task 1.
4. **Hub kopukken ateşlenmemeli.** → Task 1.
5. **Bayrak kapalıyken (`CHAT_DELTA_SYNC_ENABLED`) hiç kurulmamalı** — `startDeltaSync` zaten ilk satırında dönüyor; periyodik tetiğin o dönüşün ALTINDA kalması gerekiyor. → Task 1.

---

### Task 1: Foreground'da seyrek periyodik tur

**Files:**
- Modify: `src/features/chat/chatDeltaSync.ts`
- Test: `tests/features/chat/chatDeltaSyncPeriodic.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Foreground'da periyodik tazelik turunun aralığı. `MIN_PULL_INTERVAL_MS`ten
   *  UZUN olmak zorunda (bkz. Review Focus 3). */
  export const PERIODIC_PULL_INTERVAL_MS: number;
  ```
  `startDeltaSync`'in dönüş değeri (`() => void`) değişmiyor; sökümü zamanlayıcıyı da kapatıyor.

Tetik `AppState`'e bağlanıyor: uygulama `active` iken interval kuruluyor, `background`/`inactive` olunca temizleniyor. Her atışta mevcut `fire('periodic')` çağrılıyor — hub bağlı değilse çağrılmıyor.

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 3 — AYIRT EDİCİ: sabitin kendisi, davranışın ön koşulu.
it('PERIODIC_PULL_INTERVAL_MS, MIN_PULL_INTERVAL_MS'ten UZUN', () => {
  expect(PERIODIC_PULL_INTERVAL_MS).toBeGreaterThan(MIN_PULL_INTERVAL_MS);
});

it('foreground + hub bağlıyken periyot dolunca tur koşuyor', async () => {
  // hub connected, AppState 'active', advanceTimersByTime(PERIODIC_PULL_INTERVAL_MS)
  expect(pullChanges).toHaveBeenCalledTimes(1);
});

// Review Focus 1
it('arka plana geçince zamanlayıcı DURUYOR, öne dönünce yeniden kuruluyor', async () => {
  // 'background' → iki periyot ilerlet → çağrı YOK
  // 'active' → bir periyot ilerlet → çağrı VAR
});

// Review Focus 4
it('hub kopukken periyot dolsa da tur koşmuyor', async () => { /* … */ });

// Review Focus 2
it('stop() zamanlayıcıyı temizliyor — sökümden sonra periyot boşa geçiyor', async () => {
  const stop = startDeltaSync(deps);
  stop();
  await jest.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS * 2);
  expect(pullChanges).not.toHaveBeenCalled();
});

// Review Focus 5 — AYRI DOSYA gerekiyor: bayrak modül yüklenirken okunuyor
// (bkz. chatBackfill.killSwitch.test.ts'teki aynı kısıt).
it('bayrak kapalıyken zamanlayıcı HİÇ kurulmuyor', async () => { /* … */ });
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**
- [ ] **Step 3: Periyodik tetiği yaz**

`PERIODIC_PULL_INTERVAL_MS`in değeri gerekçelendirilecek: paylaşımlı kova, pil, ve "seyrek" ifadesinin ne anlama geldiği. Cihazda ölçülmediği de söylenecek.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**
- [ ] **Step 5: Commit** — `feat(chat): foregroundda seyrek periyodik tazelik turu`

---

## Fazdan sonra açık kalanlar

- Cihazda hiç koşmadı — periyodun pil etkisi ölçülmedi.
- "Uzun sohbet oturumunda tek tur" alternatifi (roadmap'in parantezi) seçilmedi; periyodik tur daha basit ve aynı deliği kapatıyor.
