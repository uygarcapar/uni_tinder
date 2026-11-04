# Akış Gönderi Üç Nokta Menüsü (FeedPostOptionsSheet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Akış kartındaki üç nokta, doğrudan silme Alert'i/şikayet modalı yerine önce SwipeCard kalıbında bir ara menü (tam tarih + duruma göre "Şikayet Et" VEYA "Gönderiyi sil") açsın.

**Architecture:** Saf tarih fonksiyonu `feedText.ts`'e (test altında), görsel kalıp `ProfileOptionsSheet`'ten kopyalanan yeni `FeedPostOptionsSheet` bileşenine, bağlama `FeedScreen`'deki mevcut `handlePostMenu`'ya girer. Şikayet (`FeedReportSheet`) ve silme (Alert + `useDeletePost`) davranışlarının kendisi DEĞİŞMEZ — önlerine menü girer.

**Tech Stack:** React Native + `AppModal` (gorhom sheet sarmalayıcısı), `SFIcon` + lucide fallback, i18next, jest.

**Spec:** `docs/superpowers/specs/2026-11-04-feed-post-options-sheet-design.md`

## Global Constraints

- Jest YALNIZ node 24 ile koşar: her jest komutunun önüne `PATH="/opt/homebrew/opt/node@24/bin:$PATH"` konur (varsayılan node 20'de çıktısız SIGSEGV).
- Lucide ikonları YALNIZ `@/shared/icons` barrel'ından import edilir (derin path yasak).
- Commit mesajlarında Claude imzası/`Co-Authored-By` YOK.
- Z'siz server damgaları: tarih parse'ı `parseUtc` ile (koşulsuz +Z/+3sa ekleme YASAK).
- Kart içi görünen metinler akışın küçük-harf kuralına uyar: `toDisplayLowercase` (RN iOS `textTransform` değil).
- `feedText.ts` saf kalır: React/i18n-instance import ETMEZ (locale parametre olarak gelir).

## Review Focus

- Z'siz damga (`2026-11-02T10:23:00`, Z yok) TR cihazda 3 saat kayıp yanlış gün adı basmamalı → test Task 1'de (Z'siz girdi testi).
- Tam 7 gün önceki gönderi "çarşamba 10:23" gibi bu haftanınmış sanılacak bir etiket almamalı, tam tarihe düşmeli → test Task 1'de (sınır testi).
- `createdAt` boş/null gelirse menü çökmemeli, tarih satırı boş kalmalı → test Task 1'de (boş girdi testi).
- Anonim gönderide şikayet modalı engelleme satırını yine ÇİZMEMELİ (`isAnonymousTarget` bayrağı menü araya girince kaybolmamalı) → Task 3'te mevcut `setReportTarget({ isAnonymous: post.isAnonymous })` alanının korunduğu adımda; otomatik test yok, bağlama gözle doğrulanır (mevcut davranış da testsiz).
- Gece yarısı sınırı: dün 23:59'daki gönderi "bugün" DEĞİL "dün" etiketi almalı (fark takvim günüyle, 24 saatle değil) → test Task 1'de.

---

### Task 1: `formatPostTimestamp` — tam tarih/dakika yazımı

**Files:**
- Modify: `src/features/feed/feedText.ts` (dosya sonuna; `Translate` tipi ve `parseUtc` zaten orada)
- Test: `tests/features/feed/feedText.test.ts` (mevcut dosyaya yeni describe)

**Interfaces:**
- Consumes: `parseUtc` (dosyada import'lu), mevcut `Translate` tipi, mevcut test dosyasının `t` stub'ı (anahtarı aynen döndürür).
- Produces: `export function formatPostTimestamp(iso: string | null | undefined, t: Translate, locale: string, now?: number): string` — Task 2 bunu bu imzayla çağırır. Dönen metin BÜYÜK harfli başlar ("Bugün…" / "Pazartesi…"); küçük harfe çevirme ÇAĞIRANIN işi.

- [ ] **Step 1: Write the failing test**

Mevcut `feedText.test.ts`'in sonuna, dosyanın kendi `t` stub'ını kullanarak:

```ts
describe('formatPostTimestamp — menüdeki tam tarih', () => {
  // 4 Kasım 2026 Çarşamba 12:00, YEREL saat. Girdiler aynı yerel andan
  // toISOString ile üretiliyor ki test TZ'den bağımsız kalsın.
  const now = new Date(2026, 10, 4, 12, 0).getTime();
  const iso = (d: Date) => d.toISOString();

  it('bugünkü gönderi → today anahtarı + 24 saatlik dakika', () => {
    expect(
      formatPostTimestamp(iso(new Date(2026, 10, 4, 10, 23)), t, 'tr-TR', now),
    ).toBe('chat.messages.today 10:23');
  });

  it('dünkü gönderi 23:59 → yesterday (takvim günü, 24 saat DEĞİL)', () => {
    expect(
      formatPostTimestamp(iso(new Date(2026, 10, 3, 23, 59)), t, 'tr-TR', now),
    ).toBe('chat.messages.yesterday 23:59');
  });

  it('hafta içi → gün adı + saat (kullanıcı örneği: pazartesi 10:23)', () => {
    // 2 Kasım 2026 = Pazartesi
    expect(
      formatPostTimestamp(iso(new Date(2026, 10, 2, 10, 23)), t, 'tr-TR', now),
    ).toBe('Pazartesi 10:23');
  });

  it('tam 7 gün önce → gün adı DEĞİL tam tarih (hangi çarşamba belirsiz)', () => {
    expect(
      formatPostTimestamp(iso(new Date(2026, 9, 28, 9, 5)), t, 'tr-TR', now),
    ).toBe('28 Ekim 09:05');
  });

  it("Z'siz damga parseUtc'den geçer (TR cihazda 3 saat kaymaz)", () => {
    // toISOString'in Z'si silinince elde Z'siz ama UTC duvar saatli bir damga
    // kalıyor. parseUtc onu UTC sayar → aynı an → Z'li girdiyle AYNI çıktı.
    // Naif `new Date(str)` kullanılsaydı yerel sayar ve 3 saat kayardı.
    const d = new Date(2026, 10, 2, 10, 23); // yerel Pazartesi 10:23
    const zless = d.toISOString().replace('Z', '');
    expect(formatPostTimestamp(zless, t, 'tr-TR', now)).toBe('Pazartesi 10:23');
  });

  it('boş girdi → boş string, çökme yok', () => {
    expect(formatPostTimestamp('', t, 'tr-TR', now)).toBe('');
    expect(formatPostTimestamp(null, t, 'tr-TR', now)).toBe('');
    expect(formatPostTimestamp(undefined, t, 'tr-TR', now)).toBe('');
  });
});
```

`formatPostTimestamp` import listesine eklenir.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/feed/feedText.test.ts`
Expected: FAIL — `formatPostTimestamp` export'u yok.

- [ ] **Step 3: Implement `formatPostTimestamp(iso, t, locale, now = Date.now())` in `src/features/feed/feedText.ts`**

Katmanlama `formatRelativeTime`'daki takvim-günü mantığının aynısı (startOfDay
farkı), AMA her katmanda saat de eklenir ve >7 günde ay adı uzun yazılır:

- boş `iso` → `""`
- saat: `d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })` — 24 saat, dilden bağımsız (formatRelativeTime ile aynı karar).
- `dayDiff <= 0` → `` `${t("chat.messages.today")} ${time}` `` (anahtar yeniden kullanımı: `formatRelativeTime` da `chat.messages.yesterday`'i kullanıyor, metin tek kaynakta kalsın)
- `dayDiff === 1` → yesterday anahtarı + saat
- `dayDiff < 7` → `` `${d.toLocaleDateString(locale, { weekday: "long" })} ${time}` ``
- değilse → `` `${d.toLocaleDateString(locale, { day: "numeric", month: "long" })} ${time}` ``

`locale` parametredir; `getDateLocale` BURADAN import edilmez (o `i18n/index`'i
çeker, feedText saf kalmalı — Global Constraints).

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/feed/feedText.test.ts`
Expected: PASS (yeni 6 test dahil tüm dosya yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/features/feed/feedText.ts tests/features/feed/feedText.test.ts
git commit -m "feat(feed): gönderi menüsü için tam tarih yazıcısı formatPostTimestamp"
```

### Task 2: `FeedPostOptionsSheet` bileşeni + i18n anahtarı

**Files:**
- Create: `src/features/feed/components/FeedPostOptionsSheet.tsx`
- Modify: `src/shared/i18n/translations/tr.ts` (feed bloğu), `src/shared/i18n/translations/en.ts` (aynı yol)

**Interfaces:**
- Consumes: `formatPostTimestamp` (Task 1 imzasıyla), `getDateLocale` (`@/shared/i18n/dateLocale`), `toDisplayLowercase` (`@/shared/utils/textCase`), `AppModal`, `SFIcon`, `Clock`/`Flag`/`Trash2` (`@/shared/icons`), `colors`, `FeedPostDto`.
- Produces: default export `FeedPostOptionsSheet({ visible, onClose, post, onReport, onDelete }: { visible: boolean; onClose: () => void; post: FeedPostDto | null; onReport?: () => void; onDelete?: () => void })` — Task 3 bu imzayla bağlar. Satırlar `onClose()` çağırıp SONRA callback'i çağırır (ProfileOptionsSheet ile aynı sıra; hedefi saklamak ÇAĞIRANIN işi).

- [ ] **Step 1: i18n anahtarı ekle**

`tr.ts` feed bloğuna (örn. `mine:` bloğunun yanına) `options: { title: 'Gönderi Seçenekleri' }`; `en.ts`'e aynı yolda `options: { title: 'Post Options' }`. Satır etiketleri YENİ ANAHTAR ALMAZ: şikayet `moderation.options.report` ('Şikayet Et'), silme `feed.mine.delete` ('Gönderiyi sil') mevcut anahtarlarını kullanır.

- [ ] **Step 2: Bileşeni yaz — `src/features/feed/components/FeedPostOptionsSheet.tsx`**

`ProfileOptionsSheet.tsx`'in kalıbı birebir (bilerek KOPYA, ortaklaştırma yok —
o dosya da ConversationOptionsSheet'in bilinçli kardeşi):

- `AppModal`: `title={t("feed.options.title")}`, `dynamicSizing`, `maxDynamicContentSize={windowHeight * 0.6}`, `closeButton={false}`, `contentContainerStyle={{ paddingTop: 36, paddingBottom: 48 }}`. `stackBehavior` YOK (akış kartı bir sheet değil — DiscoverScreen'deki gerekçenin aynısı).
- Tarih satırı: ProfileOptionsSheet'teki `Section` description satırının düzeni (row, gap 8, 14 punto `colors.textSecondary` metin) ama ikon `SFIcon name="clock"` fallback `Clock`. Metin: `toDisplayLowercase(formatPostTimestamp(post?.createdAt, t, getDateLocale()))` → "pazartesi 10:23". `post` null'ken satır boş render edilmez.
- `ActionRow` ProfileOptionsSheet'ten aynen kopyalanır (radius 36, 0.5 kenar, destructive = `colors.errorStrong` dolgu + `colors.onInverseSurface` metin).
- Tek aksiyon satırı: `post?.isMine` ise destructive "Gönderiyi sil" (`SFIcon name="trash.fill"` fallback `Trash2`, renk `colors.onInverseSurface`), değilse "Şikayet Et" (`SFIcon name="flag.fill"` fallback `Flag`, renk `colors.text`) — ikisi de `onPress`'te `onClose()` sonra callback.

- [ ] **Step 3: Verify — lint**

Run: `npx eslint src/features/feed/components/FeedPostOptionsSheet.tsx src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts`
Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/features/feed/components/FeedPostOptionsSheet.tsx src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts
git commit -m "feat(feed): gönderi üç nokta menüsü sheet'i (tarih + şikayet/sil)"
```

### Task 3: FeedScreen bağlama — üç nokta önce menüyü açar

**Files:**
- Modify: `src/features/feed/screens/FeedScreen.tsx:964-990` (handlePostMenu) ve `:3277` civarı (sheet render bölgesi)

**Interfaces:**
- Consumes: Task 2'nin `FeedPostOptionsSheet` prop imzası; mevcut `deletePost` mutation'ı, `setReportTarget`, silme Alert metin anahtarları (`feed.mine.deleteConfirmTitle/Body`, `feed.mine.delete`, `common.cancel`).
- Produces: —

- [ ] **Step 1: `menuPost` state + handler'ları böl**

- `const [menuPost, setMenuPost] = useState<FeedPostDto | null>(null);`
- `handlePostMenu` artık YALNIZ `setMenuPost(post)` yapar.
- Mevcut Alert+`deletePost.mutate` gövdesi `handleDeletePost(post: FeedPostDto)` callback'ine, mevcut `setReportTarget({...})` gövdesi `handleReportPost(post: FeedPostDto)` callback'ine taşınır — `isAnonymous: post.isAnonymous` alanı AYNEN korunur (Review Focus: anonim hedefte engelleme satırı çizilmemeli). Alert'in iki-sonuç yorumu (hak + bekleyen yanıtlar) gövdeyle birlikte taşınır.

- [ ] **Step 2: Sheet'i render et**

`<FeedReportSheet …/>`'in hemen ÜSTÜNE, DiscoverScreen'in ProfileOptionsSheet bağlamasıyla aynı kalıpta:

```tsx
<FeedPostOptionsSheet
  visible={!!menuPost}
  post={menuPost}
  onClose={() => setMenuPost(null)}
  onReport={() => {
    const target = menuPost;
    setMenuPost(null);
    if (target) handleReportPost(target);
  }}
  onDelete={() => {
    const target = menuPost;
    setMenuPost(null);
    if (target) handleDeletePost(target);
  }}
/>
```

handlePostMenu'nun üstündeki "Kart menüsü" bölüm yorumu yeni akışı anlatacak şekilde güncellenir (menü araya girdi; şikayet/sil davranışı değişmedi).

- [ ] **Step 3: Verify — lint + feed test takımı**

Run: `npx eslint src/features/feed && PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/feed`
Expected: lint 0 error, tüm feed testleri PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/feed/screens/FeedScreen.tsx
git commit -m "feat(feed): üç nokta artık ara menü açıyor; şikayet ve silme menüden"
```

**Not (cihaz doğrulaması):** Menünün görünümü ve sheet sıralaması (menü kapanırken şikayet sheet'inin açılması) simülatörde gözle doğrulanmalı — bu plan kapsamında otomatik testi yok; mevcut Discover akışıyla aynı kalıp olduğu için risk düşük.
