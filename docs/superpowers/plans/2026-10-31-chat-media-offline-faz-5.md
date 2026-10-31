# Faz 5 — Medya offline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir kez oynatılmış sesli mesaj bir daha ağ istemesin; uçakta gelen sesli mesaj, daha önce açılmışsa çalsın, açılmamışsa dürüstçe "offline" desin.

**Architecture:** İlk oynatmada dosya kalıcı dizine indiriliyor ve yolu `messages.local_uri`'ye yazılıyor; sonraki oynatmalar yereli kullanıyor. Önbellek **bayt tavanlı LRU**, tahliye `media_cached_at_ms` (v11) üzerinden. O kolonun VARLIĞI "bu yerel dosya tahliye edilebilir bir önbellek kopyası" demek — yani `local_uri`'nin "dosya şurada" anlamı tek kalıyor, ömür ayrı kolonda duruyor.

**Tech Stack:** expo-file-system (`File`/`Directory`), expo-sqlite (senkron), expo-audio, jest (`PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest` — node 20 segfault).

**Spec:** `chat_local_first_roadmap_2026-10.md` → "Faz 5 — Medya offline" (satır ~303-315).

## Kapsamı daraltan ölçüm — GİDEN ses zaten çalışıyor

Roadmap bunu söylemiyor, kod söylüyor: **offline sesli mesaj gönderimi KIRIK DEĞİL.** `outbox.ts:490` `d.kind === "voice"` dalını taşıyor, `sendVoiceMessage`'a `mediaUrl` geçerek tamamlanmış yüklemeyi tekrarlamıyor, ve `onUploaded` → `setVoiceMediaUrl` (`chatRepository.ts:1508`) anahtarı diske yazıyor. `isVoiceRecordingGone` ayrı bir hâl olarak ele alınıyor.

Bu fazın işi bu yüzden **yalnız GELEN medya**: `voicePlayback.ts:359` her oynatmada `chatService.getMediaUrl(messageId)` ile ağa çıkıyor ve dosyanın kendisi hiç saklanmıyor. `local_uri` bugün YALNIZ kendi gönderdiğimiz kaydı gösteriyor (`chatRepository.ts:532-533` bunu açıkça belgeliyor).

## Global Constraints

- **Yayınlanmış migration ASLA düzenlenmez.** Son sürüm **v10**; bu fazınki **v11**, yalnız `ALTER TABLE ADD COLUMN` (atması imkânsız).
- **`local_uri`'nin anlamı GENİŞLİYOR** — "gönderdiğimiz sesin yerel dosyası"ndan "bu mesajın medyasının yerel kopyası"na. `chatRepository.ts:532-533`'teki yorum YÜK TAŞIYOR (upsert'teki `COALESCE`'un gerekçesi); aynı commit'te güncellenecek. İkinci bir yol kolonu AÇILMAYACAK — bu dosyanın tarihçesinde "aynı kolon, iki yazıcı, iki format" bir kez yaşandı.
- **Yazıcı tek kapı.** Önbellek yazımı `chatRepository.ts`teki tek bir fonksiyondan geçecek; `voicePlayback.ts` SQL görmeyecek.
- **Bir yorum ya da test, kırılsa yakalayacağından fazlasını iddia etmeyecek.** Bu işin baskın kusur sınıfı: dört fazda 25+ bulgu, çoğu kodun vermediği garantiyi iddia eden yorumlar ve pin'lediğini söylediği satır silinince hâlâ geçen testler.
- **Her kalıcı duruma ÇIKIŞ yolu yazılacak ve ulaşılabilir olduğu gösterilecek.** Faz 4'ün tek Critical'ı tam bu boşluktan çıktı (rafa kaldırılan sohbeti indiren yol yoktu).
- Türkçe yorumlar, çevre dosyaların ses ve yoğunluğuyla.
- Yeni i18n anahtarı `tr.ts` ve `en.ts`'e **aynı commit'te**.

## Review Focus

1. **Önbellek dosyası ortadan kaybolabilir.** iOS disk baskısında dizini boşaltabilir, kullanıcı "App Data"yı silebilir. `local_uri` var olmayan bir dosyayı gösterdiğinde oynatma **yeniden indirmeli**, sonsuza dek patlamamalı. → Task 3.
2. **Tahliye, GÖNDERİLMEMİŞ kaydı ASLA silmemeli.** Kendi kaydımızın yerel dosyası yükleme tamamlanana kadar **tek kopya**; LRU onu seçerse mesaj kalıcı olarak gönderilemez hâle gelir. Ayrım `media_cached_at_ms`in varlığı — kaydın kendisi o kolonu almaz. → Task 2.
3. **Logout dosyaları SİLMELİ, yalnız satırları değil.** `clearAllChatData` (`chatRepository.ts:1896`) tabloları boşaltıyor; diskte başka kullanıcının sesi kalırsa bu Faz 4'teki gizlilik bulgusunun aynısı. → Task 3.
4. **Herkesten silinen mesajın (UT-6606) yerel kopyası da gitmeli.** Sunucu nesneyi siliyor; bizde kalırsa silinmiş ses çalınmaya devam eder. → Task 3.
5. **Offline + kopya yok = dürüst hâl.** Sonsuz spinner ya da sessiz başarısızlık değil; oynatıcı "şu an açılamıyor" demeli ve ağ gelince tekrar denenebilmeli. → Task 4.

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/features/chat/db/migrations.ts` | V11: `messages.media_cached_at_ms` |
| `src/features/chat/chatRepository.ts` | önbellek kolonlarının TÜM SQL'i + `local_uri` yorumunun güncellenmesi |
| `src/features/chat/mediaCachePolicy.ts` | **yeni, saf**: tahliye seçimi, tavan, nelerin tahliye edilebilir olduğu |
| `src/features/chat/mediaCache.ts` | **yeni**: indirme, var-mı kontrolü, tahliye, toptan silme |
| `src/features/chat/voicePlayback.ts` | kaynak çözümü önbellekten geçiyor; offline hâli |

---

### Task 1: v11 kolonu + depo API'si + `local_uri`'nin yeni anlamı

**Files:**
- Modify: `src/features/chat/db/migrations.ts`, `src/features/chat/chatRepository.ts`
- Test: `tests/features/chat/mediaCacheRepo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MediaCacheRow {
    message_id: string; local_uri: string; media_cached_at_ms: number; size_bytes: number;
  }
  /** Önbellek kaydını yazar/günceller — TEK yazıcı kapısı. */
  export function setMediaCache(messageId: string, localUri: string, sizeBytes: number, nowMs: number): void;
  /** Oynatma anında okunur; `null` = yerel kopya yok. */
  export function readMediaCache(messageId: string): MediaCacheRow | null;
  /** LRU için: tahliye edilebilir satırlar, EN ESKİ ERİŞİM ÖNCE. */
  export function readCacheEntriesOldestFirst(): MediaCacheRow[];
  /** Erişim damgasını tazeler (LRU'nun "recently used" yarısı). */
  export function touchMediaCache(messageId: string, nowMs: number): void;
  /** Satırı düşürür (dosyayı SİLMEZ — çağıran siler). */
  export function clearMediaCache(messageIds: string[]): void;
  /** Logout/wipe için: silinecek TÜM yerel yolları döndürür. */
  export function readAllCachedUris(): string[];
  ```

V11 (`size_bytes` neden var: tavan BAYT cinsinden, her tahliye turunda dosyaları tek tek `stat`lamak senkron API'de açılışı yavaşlatırdı):
```sql
ALTER TABLE messages ADD COLUMN media_cached_at_ms INTEGER;
ALTER TABLE messages ADD COLUMN media_size_bytes INTEGER;
```

- [ ] **Step 1: Testleri yaz**

```ts
it('setMediaCache yolu, damgayı ve boyutu yazıyor; local_uri okunabiliyor', () => { /* … */ });

// Review Focus 2 — AYIRT EDİCİ: kaydın kendisi önbellek satırı DEĞİL.
it('gönderilmemiş kendi kaydımız readCacheEntriesOldestFirst'te ÇIKMIYOR', () => {
  saveMessage({ id: 'cmid-1', _localUri: 'file:///rec.m4a' }, 'c1', 'pending');
  expect(readCacheEntriesOldestFirst()).toHaveLength(0);   // media_cached_at_ms NULL
  expect(readMediaCache('cmid-1')).toBeNull();
});

it('readCacheEntriesOldestFirst EN ESKİ erişimi önce veriyor', () => { /* üç satır, karışık damga */ });
it('touchMediaCache damgayı tazeliyor, sıralamayı değiştiriyor', () => { /* … */ });
it('clearMediaCache satırı düşürüyor ama local_uri DOKUNULMUYOR mu — karar testte açık olsun', () => { /* … */ });
it('readAllCachedUris yalnız önbellek kopyalarını döndürüyor, kendi kaydımızı DEĞİL', () => { /* … */ });

// Sunucu upsert'i yerel yolu ezmemeli (bugünkü COALESCE'un koruduğu şey).
it('sunucudan gelen aynı mesaj local_uri ve önbellek damgasını EZMİYOR', () => { /* … */ });
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**
- [ ] **Step 3: V11'i, yedi depo fonksiyonunu yaz ve `chatRepository.ts:532-533`'teki `local_uri` yorumunu yeni anlamıyla güncelle**

Yorum iki şeyi söylemek zorunda: kolon artık iki kaynaktan dolabiliyor (kendi kaydımız / indirilmiş kopya), ve ikisini AYIRAN şey `media_cached_at_ms`in varlığı. `COALESCE`'un gerekçesi (sunucu upsert'i ezmesin) aynen kalıyor.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**
- [ ] **Step 5: Commit** — `feat(chat): medya onbellegi kolonlari (v11) + local_uri anlami genisledi`

---

### Task 2: Saf tahliye politikası

**Files:**
- Create: `src/features/chat/mediaCachePolicy.ts`
- Test: `tests/features/chat/mediaCachePolicy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MEDIA_CACHE_MAX_BYTES = 200 * 1024 * 1024;   // gerekçesi yorumda
  /** Tavanı aşan baytı kurtarmak için silinecekler — en eski erişim önce. */
  export function selectEvictions(
    entries: { message_id: string; media_cached_at_ms: number; size_bytes: number }[],
    maxBytes: number,
  ): string[];
  /** Toplam bayt — çağıran tavanla kıyaslıyor. */
  export function totalBytes(entries: { size_bytes: number }[]): number;
  ```

- [ ] **Step 1: Testleri yaz**

```ts
it('tavanın altındayken HİÇBİR ŞEY silmiyor', () => {
  expect(selectEvictions([e(1, 10), e(2, 10)], 100)).toEqual([]);
});

it('tavanı aşınca EN ESKİ erişimden başlayarak yeterince siliyor, fazlasını DEĞİL', () => {
  // toplam 120, tavan 100 → yalnız en eskisi (20) gitmeli
  expect(selectEvictions([e(1, 20), e(2, 50), e(3, 50)], 100)).toEqual(['m1']);
});

it('tek dosya tavandan büyükse onu siliyor (sonsuz döngüye girmiyor)', () => { /* … */ });
it('boş girdide boş dönüyor', () => { /* … */ });
it('eşit damgalarda deterministik sıra (message_id) — tahliye kararsız olmasın', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN.** Saf: store/ağ/DB/dosya sistemi import ETMİYOR (`backfillPolicy.ts` aynı sözleşme).
- [ ] **Step 5: Commit** — `feat(chat): medya onbellegi tahliye politikasi (saf)`

---

### Task 3: Önbellek yürütücüsü

**Files:**
- Create: `src/features/chat/mediaCache.ts`
- Modify: `src/features/chat/chatRepository.ts` (`clearAllChatData` + silme yolları)
- Test: `tests/features/chat/mediaCache.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Yerel kopyayı döndürür; yoksa indirir. `null` = şu an elde edilemiyor. */
  export async function ensureCachedMedia(messageId: string): Promise<string | null>;
  /** Tavanı aşan kopyaları siler (dosya + satır). Silinen sayısını döndürür. */
  export function evictOverCap(): number;
  /** Logout/wipe: TÜM önbellek dosyalarını diskten siler. */
  export function wipeMediaCache(): void;
  /** Tek mesajın kopyasını siler (UT-6606, herkesten silme). */
  export function dropCachedMedia(messageId: string): void;
  ```

`ensureCachedMedia` sırası: satırı oku → dosya GERÇEKTEN var mı (`new File(uri).exists`) → varsa `touchMediaCache` + yolu dön → yoksa satırı düşür ve indirmeye geç → `getMediaUrl` → indir → `setMediaCache` → `evictOverCap`. Offline'da ya da `getMediaUrl` patlarsa `null`.

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 1 — AYIRT EDİCİ
it('satır var ama dosya YOK: yeniden indiriyor, kalıcı patlamıyor', async () => {
  setMediaCache('m1', 'file:///gone.m4a', 1000, 1);
  mockFileExists(false);
  await ensureCachedMedia('m1');
  expect(getMediaUrl).toHaveBeenCalledWith('m1');
});

it('dosya varsa AĞA ÇIKMIYOR ve damga tazeleniyor', async () => {
  expect(getMediaUrl).not.toHaveBeenCalled();
});

// Review Focus 5
it('offline + kopya yok → null, satır yazılmıyor', async () => { /* … */ });
it('getMediaUrl patlarsa null dönüyor, yarım satır bırakmıyor', async () => { /* … */ });

// Review Focus 3 — dosyaların kendisi
it('wipeMediaCache DOSYALARI siliyor, yalnız satırları değil', () => {
  expect(deletedPaths).toEqual(['file:///a.m4a', 'file:///b.m4a']);
});
it('clearAllChatData önbellek dosyalarını da siliyor', () => { /* … */ });

// Review Focus 4
it('herkesten silinen mesajın yerel kopyası diskten gidiyor', () => { /* … */ });

// Review Focus 2
it('tahliye gönderilmemiş kendi kaydımızın dosyasına DOKUNMUYOR', () => { /* … */ });
it('evictOverCap tavanın altındayken hiçbir dosyayı silmiyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): medya onbellegi — ilk oynatmada indir, LRU tahliye, logoutta sil`

---

### Task 4: Oynatmayı önbelleğe bağla

**Files:**
- Modify: `src/features/chat/voicePlayback.ts` (kaynak çözümü `:359` civarı)
- Modify: `src/shared/i18n/translations/tr.ts`, `en.ts`
- Test: `tests/features/chat/voicePlaybackCache.test.ts`

`const source = localUri || (await chatService.getMediaUrl(messageId)).url;` yerine: kendi kaydımız varsa aynen onu kullan (bugünkü davranış), yoksa `ensureCachedMedia`. `null` dönerse oynatıcı **hata hâline** geçiyor ve kullanıcıya "şu an açılamıyor" deniyor — sessiz başarısızlık ya da sonsuz `loading` DEĞİL.

`downloadFirst` ayrımı (`:365-375`'teki yorum) korunuyor: yerel dosyada `expo-asset`'in bellek-içi `Asset.byUri` kısa devresi yüzünden o yola GİRİLMEMELİ.

- [ ] **Step 1: Testleri yaz**

```ts
it('kendi kaydımız varsa önbelleğe HİÇ sorulmuyor', async () => { /* … */ });
it('ikinci oynatma ağa çıkmıyor', async () => { /* … */ });
it('kopya yoksa ve offline ise oynatıcı HATA hâline geçiyor, loading'de kalmıyor', async () => { /* … */ });
it('hata hâlinden sonra tekrar dokunmak yeniden deniyor', async () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): sesli mesaj yerel kopyadan caliyor, offline hali durust`

---

## Fazdan sonra açık kalanlar

- **Image/Video content type'ları** ürüne girerse aynı mekanizma onları taşır; bu faz yalnız sesi bağlıyor çünkü bugün tek medya türü o.
- **Önbellek ısıtma** (mesaj gelince beklemeden indirme) kapsam dışı: kota/veri maliyeti ürün kararı, ve roadmap "ilk oynatmada" diyor.
- `MEDIA_CACHE_MAX_BYTES` cihazda ölçülmedi.
