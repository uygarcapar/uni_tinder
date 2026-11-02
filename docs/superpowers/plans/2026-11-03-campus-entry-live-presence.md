# Kampüse Giriş: Anlık Yüzey + Bildirim — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kampüse giriş (gerçek veya simülasyon) anında yüzeye yansısın: önplanda in-app toast, "+"/ipucu sayfa yenilenmeden belirsin, simülasyon açılınca presence Enter otomatik gitsin.

**Architecture:** Sıfır-import'lu bir `campusPresenceBus` (çıplak emitter) konum-durumu değişimini yayınlar; yayıncılar sim aç/kapat ve geofence task'ı, abone `useCampusSurface`. Önplan push'u `addNotificationReceivedListener` ile yakalanıp mevcut InfoToast'a basılır (metin sunucunun). Settings'teki "Kampüste say" başarılıysa mevcut `reportSimulatedEntry` otomatik koşar.

**Tech Stack:** React Native + expo-notifications + expo-location, react-native-notifier (toaster), jest (node 24 ŞART — PATH'e `/opt/homebrew/opt/node@24/bin`).

**Spec:** `docs/superpowers/specs/2026-11-03-campus-entry-live-presence-design.md`

## Global Constraints

- `campusGeofenceTask.ts` grafiği ÇIPLAK kalır: React/Redux/reanimated/`api.ts` import edilmez. Bus bu yüzden SIFIR import'lu.
- Bildirim METNİ SUNUCUNUN: istemci metin üretmez; boş `title`+`body` → toast GÖSTERİLMEZ (trim ile).
- Cihazda yerel bildirim KURULMAZ (push kararı sunucuda).
- GPS periyodik yoklanmaz; app foreground dönüşünde yalnız UCUZ ipucu (`resolveCampusPresenceHint`) tazelenir. Yüksek doğruluklu okuma yalnız harita açıkken bus olayında (`refreshPresence(true)`).
- Commit mesajlarında Claude atfı YOK (Co-Authored-By vb. eklenmez).

## Review Focus

- Boş metinli kampüs push'u önplanda → toast çıkmamalı (test: Task 4, `boş metinli push'ta toast payload'ı null`).
- Android'de aynı push'un FCM onMessage + expo re-dispatch ile İKİ kez listener tetiklemesi → tek toast (test: Task 4, dedupe penceresi).
- Headless geofence bağlamında emit (dinleyici yok) → task çökmemeli (test: Task 1, dinleyicisiz emit no-op; Task 2 kaynak kuralı bus'ın çıplaklığını çiviler).
- Toast'a dokunulduğunda akış bayrağı kapalıysa → `openFeed` false döner, Bildirimler'e düşülmeli (test: Task 4, onPress fallback).
- "Kampüste say" sonrası otomatik Enter ağda patlarsa → sim AÇIK kalmalı, hata raporu alert'te görünmeli (test: Task 5, enter reddi senaryosu).

---

### Task 1: `campusPresenceBus` — sıfır import'lu emitter

**Files:**
- Create: `src/features/campus/campusPresenceBus.ts`
- Test: `tests/features/campus/campusPresenceBus.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `onCampusPresenceDirty(listener: () => void): () => void` (dönen fonksiyon aboneliği bırakır)
  - `emitCampusPresenceDirty(): void`

- [ ] **Step 1: Başarısız testi yaz**

```ts
import {
  emitCampusPresenceDirty,
  onCampusPresenceDirty,
} from '@/features/campus/campusPresenceBus';

it('emit aboneyi çağırıyor, bırakınca çağırmıyor', () => {
  const calls: number[] = [];
  const off = onCampusPresenceDirty(() => calls.push(1));
  emitCampusPresenceDirty();
  expect(calls).toHaveLength(1);
  off();
  emitCampusPresenceDirty();
  expect(calls).toHaveLength(1);
});

it('dinleyici yokken emit no-op (headless geofence bağlamı)', () => {
  expect(() => emitCampusPresenceDirty()).not.toThrow();
});

it('fırlatan dinleyici diğerlerini düşürmüyor', () => {
  const calls: string[] = [];
  onCampusPresenceDirty(() => { throw new Error('boom'); });
  onCampusPresenceDirty(() => calls.push('ok'));
  expect(() => emitCampusPresenceDirty()).not.toThrow();
  expect(calls).toEqual(['ok']);
});

it('🔴 KAYNAK KURALI: modül SIFIR import — geofence task grafiğine girebilmeli', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as { readFileSync: (p: string, e: string) => string };
  const src = readFileSync('src/features/campus/campusPresenceBus.ts', 'utf8');
  expect(src).not.toMatch(/^import /m);
  expect(src).not.toMatch(/require\(/);
});
```

- [ ] **Step 2: Koş, düştüğünü gör** — `npx jest tests/features/campus/campusPresenceBus.test.ts` → FAIL (modül yok)
- [ ] **Step 3: `campusPresenceBus.ts`'i yaz** — modül içi `Set<() => void>`; emit her dinleyiciyi `try/catch` ile çağırır (uiBus'ın emit sözleşmesinin kopyası, ama import'suz). Dosya başına yorum: NEDEN uiBus değil (reanimated import'u, geofence task'ı çıplak kalmalı).
- [ ] **Step 4: Koş, geçtiğini gör** — aynı komut → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(campus): campusPresenceBus — konum-durumu değişim otobüsü (sıfır import)"`

---

### Task 2: Yayıncılar — sim aç/kapat + geofence Enter/Exit

**Files:**
- Modify: `src/features/campus/campusDevLocation.ts` (simulateCampusLocation başarı dalı, clearSimulatedCampusLocation)
- Modify: `src/features/campus/campusGeofenceTask.ts` (Enter ve Exit dallarında `reportPresence` SONRASI)
- Test: `tests/features/campus/campusDevLocation.test.ts` (ekleme), `tests/features/campus/campusPresenceBus.test.ts` (kaynak kuralı ekleme)

**Interfaces:**
- Consumes: Task 1'in `emitCampusPresenceDirty`'si.
- Produces: "sim değişti / kampüse girildi-çıkıldı → bus'ta dirty" garantisi (Task 3 buna abone).

- [ ] **Step 1: Başarısız testleri yaz** — `campusDevLocation.test.ts`'e:

```ts
import { onCampusPresenceDirty } from '@/features/campus/campusPresenceBus';

it('simülasyon AÇILINCA ve KAPANINCA bus dirty yayıyor', () => {
  writeCachedBoundary(TR_DOMAIN, boundary());
  let hits = 0;
  const off = onCampusPresenceDirty(() => { hits += 1; });
  try {
    simulateCampusLocation(TR_DOMAIN);
    expect(hits).toBe(1);
    clearSimulatedCampusLocation();
    expect(hits).toBe(2);
  } finally { off(); }
});

it('BAŞARISIZ simülasyon denemesi dirty yaymıyor', () => {
  let hits = 0;
  const off = onCampusPresenceDirty(() => { hits += 1; });
  try {
    expect(simulateCampusLocation(TR_DOMAIN).failure).toBe('noBoundary');
    expect(hits).toBe(0);
  } finally { off(); }
});
```

`campusPresenceBus.test.ts`'e kaynak kuralı: `campusGeofenceTask.ts` kaynağı `emitCampusPresenceDirty` çağrısını hem Enter hem Exit dalında içermeli (`src.match(/emitCampusPresenceDirty\(\)/g)!.length >= 2`) ve `./campusPresenceBus`tan import etmeli.

- [ ] **Step 2: Koş, düştüğünü gör** — iki dosya → FAIL
- [ ] **Step 3: Uygula** — `campusDevLocation.ts`: başarı dalında `appPrefs.set`ten sonra ve `clearSimulatedCampusLocation`'da `appPrefs.remove`dan sonra `emitCampusPresenceDirty()`. `campusGeofenceTask.ts`: Exit dalında `reportPresence("Exit", exitFix)` sonrası ve Enter dalında `reportPresence("Enter", fix)` sonrası `emitCampusPresenceDirty()` — önplanda task ana JS context'te koştuğu için mount'lu yüzey bunu duyar; headless'ta dinleyici yok, no-op (Task 1 testi bunu çiviler).
- [ ] **Step 4: Koş, geçtiğini gör** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(campus): sim ve geofence presence değişimini bus'a yayıyor"`

---

### Task 3: `useCampusSurface` abone — canlı "+"/ipucu

**Files:**
- Modify: `src/features/campus/useCampusSurface.ts`
- Test: `tests/features/campus/useCampusSurfaceLive.test.tsx` (yeni)

**Interfaces:**
- Consumes: Task 1 `onCampusPresenceDirty`; mevcut `resolveCampusPresence`/`resolveCampusPresenceHint`.
- Produces: davranış — bus dirty'de `insideHint` yeniden hesaplanır; harita açıksa (`enabled`) `inside` da `force:true` ile tazelenir; AppState `active`e dönünce yalnız ipucu tazelenir.

- [ ] **Step 1: Başarısız testi yaz** — `renderHook` (repo'da örnekleri var: `useVersionGate.test.tsx`). Mock seti: `@/features/campus/campusQueries` (useCampusMe→`{data:{enabled:true}}`, useCampusBoundary→`{data:<sahte sınır>}`, diğer hook'lar no-op jest.fn), `@/features/campus/campusPresence` (resolveCampusPresence / resolveCampusPresenceHint jest.fn), `@/features/campus/campusGeofence`, `@/features/discover/swipeQueries`, `@/shared/utils/photoPicker`, `react-i18next`, `@/shared/hooks/redux`. Testler:

```ts
it('bus dirty → ipucu yeniden hesaplanıyor; harita açıkken inside force ile', async () => {
  resolveCampusPresenceHint.mockResolvedValue(true);
  resolveCampusPresence.mockResolvedValue({ inside: true, insideRaw: true, fix: {...}, permissionDenied: false });
  const { result } = renderHook(() => useCampusSurface({ enabled: true, mode: 'Dating', domain: 'bilgiedu.net', onPaywall: jest.fn() }));
  resolveCampusPresence.mockClear();
  resolveCampusPresenceHint.mockClear();
  await act(async () => { emitCampusPresenceDirty(); });
  expect(resolveCampusPresenceHint).toHaveBeenCalled();
  expect(resolveCampusPresence).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
});

it('harita KAPALIYKEN bus dirty GPS okutmuyor (pil kuralı) — yalnız ipucu', async () => {
  // enabled: false, prewarm: true ile render; emit → resolveCampusPresence ÇAĞRILMAZ,
  // resolveCampusPresenceHint ÇAĞRILIR.
});

it("AppState 'active' dönüşünde yalnız ipucu tazeleniyor", async () => {
  // AppState.addEventListener'ı jest.spyOn ile yakala, handler'ı 'active' ile çağır →
  // hint çağrıldı, resolveCampusPresence çağrılmadı.
});

it('unmount abonelikleri bırakıyor', async () => {
  // unmount sonrası emit → hiçbir resolve çağrılmıyor.
});
```

- [ ] **Step 2: Koş, düştüğünü gör** — FAIL (abonelik yok)
- [ ] **Step 3: Uygula** — (a) mevcut ipucu effect'inin gövdesini `refreshHint = useCallback` olarak çıkar (effect onu çağırır, bağımlılıklar aynı); (b) yeni effect: `useEffect(() => onCampusPresenceDirty(() => { refreshHint(); if (enabled) void refreshPresence(true); }), [enabled, refreshHint, refreshPresence])`; (c) yeni effect: `AppState.addEventListener('change', s => { if (s === 'active') refreshHint(); })`, cleanup'ta `remove()`. Yorumlara pil kuralını yaz: dirty'de force okuma YALNIZ harita açıkken; foreground dönüşü yalnız ucuz ipucu.
- [ ] **Step 4: Koş, geçtiğini gör** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(campus): yüzey presence değişimini canlı dinliyor — '+' ve ipucu yenilemesiz"`

---

### Task 4: Önplan kampüs push'u → InfoToast

**Files:**
- Modify: `src/features/notifications/pushService.ts`
- Modify: `src/navigation/AppNavigator.tsx` (push lifecycle effect'indeki `unsubs` dizisi)
- Test: `tests/features/notifications/campusEntryToast.test.ts` (yeni)

**Interfaces:**
- Consumes: `showInfoToast({ title?, message, onPress? })` (`@/shared/services/toaster`), `openFeed(tab, opts)` (`@/features/feed/feedEntry`), `navigationRef`.
- Produces:
  - `campusEntryToastPayload(content: { title?: string | null; body?: string | null; data?: Record<string, any> }): { title?: string; message: string } | null` — SAF, test edilen filtre.
  - `subscribeCampusEntryToast(): () => void` — `Notifications.addNotificationReceivedListener` sarmalayıcısı; AppNavigator `unsubs`a eklenir.

- [ ] **Step 1: Başarısız testleri yaz** — saf fonksiyon üzerinden:

```ts
it('CampusMomentsNearby push\'unu toast payload\'ına çeviriyor (metin sunucunun, ham)', () => {
  expect(campusEntryToastPayload({ title: 'Kampüstesin', body: '3 an paylaşıldı', data: { type: 'CampusMomentsNearby' } }))
    .toEqual({ title: 'Kampüstesin', message: '3 an paylaşıldı' });
});
it('yalnız gövde yoksa başlık mesaj oluyor', () => {
  expect(campusEntryToastPayload({ title: 'Kampüstesin', body: '  ', data: { type: 'CampusMomentsNearby' } }))
    .toEqual({ message: 'Kampüstesin' });
});
it('boş metinli push\'ta toast payload\'ı null (metin ÜRETME yasağı)', () => {
  expect(campusEntryToastPayload({ title: ' ', body: '', data: { type: 'CampusMomentsNearby' } })).toBeNull();
});
it('başka tipte null', () => {
  expect(campusEntryToastPayload({ title: 'x', body: 'y', data: { type: 'Like' } })).toBeNull();
});
```

Dedupe için `subscribeCampusEntryToast`'ı birimden test etmek expo-notifications mock'u ister; bunun yerine dedupe saf yardımcıya alınır: `campusToastDedupeKey(data): string` (`type:campusDomain:timestamp`) + modül içi 5 sn pencere. Test: aynı anahtar 5 sn içinde ikinci kez → `shouldShowCampusToast(key, now)` false; pencere dışı → true.

Toast dokunuşu da saf hedefe alınır: `openCampusMomentsSurface(): void` (pushService'ten export; `openFeed('feed', { expandMap: true })` false dönerse `navigationRef.navigate('Notifications')`). Test: `jest.mock('@/features/feed/feedEntry')` + `jest.mock('@/shared/services/navigationRef')`; `openFeed` true → navigate ÇAĞRILMAZ, false → çağrılır. `subscribeCampusEntryToast` onPress olarak bunu geçer.

- [ ] **Step 2: Koş, düştüğünü gör** — FAIL
- [ ] **Step 3: Uygula** — `pushService.ts`: üç export (`campusEntryToastPayload`, `shouldShowCampusToast`, `subscribeCampusEntryToast`). Listener: content'ten payload çıkar → null ise dön → dedupe anahtarı penceredeyse dön → `showInfoToast({ ...payload, onPress: () => { if (!openFeed('feed', { expandMap: true })) navigationRef.navigate('Notifications' as never); } })`. Yorum: önplanda OS banner'ı bilerek kapalı (`shouldShowBanner:false`) ve `CampusMomentsNearby` için in-app gösterim yoktu — kullanıcı önplanda push'u HİÇ görmüyordu; Android'de FCM onMessage + expo re-dispatch aynı push'u iki kez düşürebilir, pencere bunun için. `AppNavigator.tsx`: `unsubs` dizisine `subscribeCampusEntryToast()` ekle (import pushService'ten).
- [ ] **Step 4: Koş, geçtiğini gör** — PASS; ayrıca `npx jest tests/features --forceExit` ile komşu süitler yeşil.
- [ ] **Step 5: Commit** — `git commit -m "feat(notifications): kampüs push'u önplanda in-app toast — dokununca harita"`

---

### Task 5: "Kampüste say" → otomatik presence Enter

**Files:**
- Modify: `src/features/profile/screens/SettingsScreen.tsx` (`turnOn`)
- Test: `tests/features/profile/screens/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: mevcut `simulateCampusLocation(domain)`, `describeSimulateResult`, `reportSimulatedEntry` (campusDevLocation).
- Produces: davranış — başarı halinde Enter otomatik; başarısızlıkta Enter ATILMAZ.

- [ ] **Step 1: Başarısız testleri yaz** — suite'e `jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })), getCurrentPositionAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(async () => null) }))` ve `@/shared/constants/api` mock'una `CAMPUS_PRESENCE: '/campus/presence'`, `CAMPUS_ME: (m: string) => \`/campus/me/\${m}\`` benzeri alanlar (campusService'in OKUDUĞU adlar — implementer campusService'ten doğrular). Testler:

```ts
it('"Kampüste say" başarılıysa presence Enter OTOMATİK gidiyor', async () => {
  // bilgi sınırı diskte + feed/me cache'inde bilgiedu.net; mockApi.post resolve.
  // pressTurnOn(tree) sonrası:
  await waitFor(() =>
    expect(mockApi.post).toHaveBeenCalledWith(
      expect.stringContaining('presence'),
      expect.objectContaining({ state: 'Enter' }),
    ),
  );
});
it('simülasyon KURULAMADIYSA Enter atılmıyor', async () => {
  // sınır diskte yok → noBoundary; mockApi.post hiç çağrılmadı.
});
it('Enter ağda patlarsa sim AÇIK kalıyor', async () => {
  // mockApi.post reject; isCampusLocationSimulated() true kalmalı ve
  // "Kampüse giriş bildirilemedi" alert'i görünmeli.
});
```

- [ ] **Step 2: Koş, düştüğünü gör** — FAIL
- [ ] **Step 3: Uygula** — `turnOn` içinde:

```ts
const res = simulateCampusLocation(myDomain);
const { title, message } = describeSimulateResult(res);
Alert.alert(title, message);
// Başarıda giriş OTOMATİK bildiriliyor (tasarım: eski ikinci menü adımı).
// İkinci alert iOS'ta kuyruğa girer; DEV aracı için kabul edilmiş davranış.
if (res.point) void enter();
```

"Kampüse girdim (presence)" düğmesi tekrar tetiklemek için AYNEN kalır.
- [ ] **Step 4: Koş, geçtiğini gör** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(campus): simülasyon açılınca kampüse giriş otomatik bildiriliyor"`

---

### Task 6: Bütün doğrulama

- [ ] **Step 1:** `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"; npx jest --forceExit` → 0 fail (mevcut "worker failed to exit" uyarısı bilinen durum, yeni DEĞİL).
- [ ] **Step 2:** `npm run type-check` → temiz.
- [ ] **Step 3:** `npm run lint` → yeni dosyalarda hata yok.
- [ ] **Step 4:** Commit (kalan dokümantasyon/plan işaretlemeleri) — `git commit -m "docs: kampüs canlı presence planı işaretlendi"`
