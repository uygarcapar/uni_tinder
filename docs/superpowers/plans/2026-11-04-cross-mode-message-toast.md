# Çapraz-Mod Mesaj Toast'ı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Başka moddaki sohbetten gelen mesaj toast'ına `[<mod adı>]` etiketi; toast ve push tap'inde navigate'ten önce mod devri (`writeAppMode`).

**Architecture:** Mod bilgisi her iki tetik noktasında da zaten elde olan yerel `conv` satırından okunur (payload'da yok, backend değişmiyor). Etiket kararı `showMessageToast` içinde verilir (`readAppModeFor` karşılaştırması), çizim `MessageToast`'ta; tap devri Like push'ındaki "MOD DEVRİ" kalıbının aynısıdır (`isAppMode` kapısı + `writeAppMode`).

**Tech Stack:** React Native / Expo, react-native-notifier, i18next, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-11-04-cross-mode-message-toast-design.md`

## Global Constraints

- `conv.mode` boş/bilinmeyen → etiket YOK, devir YOK; `undefined` asla `Dating` sayılmaz.
- Mod değerleri wire-PascalCase: `'Dating' | 'Friends'` (`isAppMode` kapısından geçmeden kullanılmaz).
- Yeni i18n anahtarı YOK: etiket metni `modeTitleKey(mode)` = `discover.mode.title.*`; köşeli parantezi bileşen basar.
- Dokunma kapısı Notifier seviyesinde kalır (`showNotification({ onPress })`); toast içine `Pressable` konmaz (toaster.ts başındaki ⚠️).
- Jest node 24 ister: testleri `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest …` ile koş.
- Commit mesajlarında Claude atıfı/Co-Authored-By YOK (kullanıcı kuralı).

## Review Focus

1. Push tap'inde yerel `conv` satırı yok (cold start / taze kurulum) → devir yapılmadan bugünkü gibi navigate edilmeli, crash değil. — Test: Task 3 elle doğrulama notu; kod `conv?.mode` + `isAppMode` kapısıyla yazılır.
2. Toast ekrandayken kullanıcı modu değiştirir → tap yine OLAYIN moduna indirmeli (etiket bayat kalabilir, kabul). — Test: Task 2, aynı-mod testinde `writeAppMode`'un yine çağrıldığı assert edilir.
3. `conv.mode` çöp string (eski şema / kurcalanmış disk) → etiket ve devir sessizce atlanır. — Test: Task 2 test 3 (`mode: 'Bestie'`).
4. `selfUserId` düşmüş (oturum yarışı) → `readAppModeFor(undefined)` Dating döner, `saveAppMode` no-op; crash yok. — Test: Task 2 testlerinde mock zaten userId'siz çağrıyı kabul eder; davranış `modePrefs.ts:49/76` guard'larıyla mevcut.
5. Sesli mesaj + çapraz mod: etiket, mikrofon satırıyla birlikte tek satırlık ad alanında kırpılmadan önce gelmeli (etiket önde). — Test: Task 1 test 3 (voiceDuration + modeLabel birlikte).

---

### Task 1: MessageToast `modeLabel` prop'u

**Files:**
- Modify: `src/shared/components/toaster/MessageToast.tsx`
- Test: `tests/shared/components/toaster/MessageToast.test.tsx` (yeni)

**Interfaces:**
- Produces: `MessageToastProps` artı alan `modeLabel?: string | null`. Doluysa gönderen adı satırı `[<modeLabel>] <senderName>` olarak çizilir (aynı `Text`, aynı stil, `numberOfLines={1}` korunur). Boş/null → bugünkü çizim birebir.

- [ ] **Step 1: Failing test'i yaz**

`tests/shared/components/toaster/MessageToast.test.tsx`. Mock'lar: `ToastShell` → çocukları aynen render eden stub (`jest.mock('@/shared/components/toaster/ToastShell', …)`), gerekiyorsa `expo-image` → `View` stub'ı (önce mock'suz dene; preset zaten karşılıyorsa ekleme). `SFIcon` native-guard'lı, testte fallback'e düşer — mock gerekmez; sorun çıkarsa stub'la.

```tsx
import { render, screen } from '@testing-library/react-native';
import MessageToast from '@/shared/components/toaster/MessageToast';

it('modeLabel doluysa adın önüne köşeli parantezle basar', () => {
  render(<MessageToast senderName="Ayşe" preview="selam" modeLabel="Arkadaş" />);
  expect(screen.getByText('[Arkadaş] Ayşe')).toBeTruthy();
});

it('modeLabel yoksa yalnız adı basar', () => {
  render(<MessageToast senderName="Ayşe" preview="selam" />);
  expect(screen.getByText('Ayşe')).toBeTruthy();
  expect(screen.queryByText(/\[/)).toBeNull();
});

it('sesli mesajda da etiket ad satırında durur', () => {
  render(
    <MessageToast senderName="Ayşe" preview="Sesli mesaj" voiceDuration="0:12" modeLabel="Flört" />,
  );
  expect(screen.getByText('[Flört] Ayşe')).toBeTruthy();
  expect(screen.getByText('(0:12)')).toBeTruthy();
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest tests/shared/components/toaster/MessageToast.test.tsx`
Expected: FAIL — `[Arkadaş] Ayşe` bulunamıyor (prop henüz yok).

- [ ] **Step 3: `modeLabel`'ı implemente et**

`MessageToastProps`'a `modeLabel?: string | null` ekle (doc yorumu: "Konuşmanın modu o anki moddan farklıysa dolu; metin `discover.mode.title.*`ten gelir, parantezi burası basar"). Ad `Text`'inin içeriği: `{modeLabel ? `[${modeLabel}] ` : ''}{senderName}` — stil değişmez.

- [ ] **Step 4: Testin geçtiğini gör**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest tests/shared/components/toaster/MessageToast.test.tsx`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/toaster/MessageToast.tsx tests/shared/components/toaster/MessageToast.test.tsx
git commit -m "feat(toaster): mesaj toast'ında çapraz-mod etiketi için modeLabel prop'u"
```

### Task 2: `showMessageToast` — etiket kararı + tap'te mod devri

**Files:**
- Modify: `src/shared/services/toaster.ts:57-91`
- Test: `tests/shared/services/toaster.test.ts` (yeni)

**Interfaces:**
- Consumes: Task 1'in `modeLabel` prop'u; `readAppModeFor(userId?) → AppMode` ve `writeAppMode(userId, mode) → boolean` (`@/features/discover/useAppMode`); `isAppMode`, `modeTitleKey` (`@/features/discover/modeTheme`).
- Produces: `ShowMessageToastArg = Omit<MessageToastProps, 'modeLabel'> & { conversationId: string; partnerUserId?: string; isActive?: boolean; mode?: string | null; selfUserId?: string | null }`. `modeLabel` dışarıdan ALINMAZ — burada hesaplanır. Task 3 çağıranları `mode: conv.mode, selfUserId` geçer.

- [ ] **Step 1: Failing test'i yaz**

`tests/shared/services/toaster.test.ts`. Mock'lar (hepsi import'lardan ÖNCE):

```ts
jest.mock('react-native-notifier', () => ({
  Notifier: { showNotification: jest.fn(), hideNotification: jest.fn() },
}));
jest.mock('@/shared/services/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));
jest.mock('@/features/discover/useAppMode', () => ({
  readAppModeFor: jest.fn(() => 'Dating'),
  writeAppMode: jest.fn(() => true),
}));
// toaster.ts i18n'i DEFAULT import ile alıyor → __esModule + default şart
jest.mock('@/shared/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
```

Testler (her testte `jest.clearAllMocks()`; `showNotification`'ın son çağrısından `componentProps` ve `onPress` alınır):

```ts
it('çapraz modda modeLabel mod başlığı anahtarından gelir, tap devir+navigate yapar', () => {
  showMessageToast({ senderName: 'Ayşe', preview: 'selam', conversationId: 'c1',
    partnerUserId: 'p1', mode: 'Friends', selfUserId: 'u1' });
  const call = (Notifier.showNotification as jest.Mock).mock.calls[0][0];
  expect(call.componentProps.modeLabel).toBe('discover.mode.title.Friends');
  call.onPress();
  expect(writeAppMode).toHaveBeenCalledWith('u1', 'Friends');
  expect(navigationRef.navigate).toHaveBeenCalledWith('Chat',
    expect.objectContaining({ conversationId: 'c1' }));
  // devir navigate'ten ÖNCE (invocationCallOrder karşılaştır)
});

it('aynı moddayken etiket yok ama tap yine writeAppMode çağırır', () => {
  (readAppModeFor as jest.Mock).mockReturnValue('Friends');
  // mode: 'Friends' → modeLabel null/undefined; onPress() → writeAppMode('u1','Friends')
});

it('mode boş ya da çöpse etiket de devir de yok', () => {
  // mode: undefined ve mode: 'Bestie' iki çağrı: componentProps.modeLabel falsy,
  // onPress() → writeAppMode HİÇ çağrılmaz, navigate yine çağrılır
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest tests/shared/services/toaster.test.ts`
Expected: FAIL — `modeLabel` undefined / `writeAppMode` çağrılmıyor.

- [ ] **Step 3: `showMessageToast`'u genişlet**

`toaster.ts`'e import'lar: `isAppMode, modeTitleKey` (`@/features/discover/modeTheme`), `readAppModeFor, writeAppMode` (`@/features/discover/useAppMode`). Gövde:

```ts
const convMode = isAppMode(mode) ? mode : null;
const modeLabel =
  convMode && convMode !== readAppModeFor(selfUserId)
    ? i18n.t(modeTitleKey(convMode))
    : null;
```

`goToChat` içinde, `navigate`'ten önce: `if (convMode) writeAppMode(selfUserId, convMode);` — koşulsuz (aynı modsa `writeAppMode` zaten no-op; toast ekrandayken mod değişirse tap yine olayın moduna indirir — bu gerekçeyi kısa yorumla yaz). `componentProps`'a `modeLabel` ekle.

- [ ] **Step 4: Testin geçtiğini gör**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest tests/shared/services/toaster.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/shared/services/toaster.ts tests/shared/services/toaster.test.ts
git commit -m "feat(toaster): çapraz-mod etiketi + toast tap'inde mod devri"
```

### Task 3: Çağıranların bağlanması — hub toast'ı, push dalı, dev galerisi

**Files:**
- Modify: `src/navigation/AppNavigator.tsx:1055-1065` (ReceiveMessage → showMessageToast)
- Modify: `src/navigation/AppNavigator.tsx:1686-1706` (routeFromNotification `Message`/`Match`)
- Modify: `src/shared/debug/toastCatalog.ts` (MessageToast grubu)

**Interfaces:**
- Consumes: Task 2'nin `mode` / `selfUserId` alanları; `isAppMode` + `writeAppMode` (AppNavigator'da zaten import'lu, `:109-112`).

- [ ] **Step 1: ReceiveMessage handler'ına modu geçir**

`AppNavigator.tsx:1055` `showMessageToast` çağrısına iki alan ekle: `mode: conv.mode,` ve `selfUserId,` (ikisi de scope'ta). Kısa yorum: etiket/devir kararı toaster'da, boş mod orada eleniyor.

- [ ] **Step 2: Push `Message`/`Match` dalına mod devri ekle**

`:1691` conv lookup'ının altına, `navigate`'ten önce:

```ts
const convMode = conv?.mode;
if (isAppMode(convMode)) {
  writeAppMode(store.getState()?.auth?.user?.id, convMode);
}
```

Yorum, Like dalındaki "MOD DEVRİ" fıkrasına işaret etsin ve farkı söylesin: mesaj push'unun payload'ında `mode` YOK, yerel `conv` satırından okunuyor; satır yoksa (cold start) devir atlanır, navigate bugünkü gibi — geri dönüşte liste süzgeci sohbeti göstermeyebilir, kabul edilen sınır.

- [ ] **Step 3: Dev galerisine çapraz-mod vakası ekle**

`toastCatalog.ts` MessageToast grubuna yeni case: id `msg.crossMode`, label `Çapraz mod etiketi ([Arkadaş])`, from `AppNavigator · conv.mode ≠ seçili mod`. `run`: mevcut `msg.photo` çağrısının aynısı + `mode: 'Friends'` (`selfUserId` verilmez → `readAppModeFor(undefined)` Dating döner, etiket galeride DETERMİNİSTİK görünür; tap'in modu Friends'e çevireceğini label'a değil yoruma yaz).

- [ ] **Step 4: Tip ve regresyon doğrulaması**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx tsc --noEmit && PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest`
Expected: tsc temiz; suite yeşil (yeni 6 test dahil).

- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppNavigator.tsx src/shared/debug/toastCatalog.ts
git commit -m "feat(chat): mesaj toast'ı ve push tap'inde çapraz-mod devri"
```
