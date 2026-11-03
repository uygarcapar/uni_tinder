# Kayıt Mod Adımı Fotoğraflı Kartlar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayıttaki mod seçme adımı, Keşif'teki fotoğraflı 3:2 mod kartlarını (ModeChoiceCard) `select` varyantıyla kullansın; seçim sağ üstte akış-filtresi kalıbında checkbox ile gösterilsin.

**Architecture:** `ModeChoiceCard`'a `variant: "switch" | "select"` eklenir — `switch` bugünkü davranış (chevron + "moduna geç" satırı + `!active` → sönük), `select` kayıt için (chevron yok, hep açıklama, sağ üstte her zaman çizili checkbox yuvası, sönükleştirme dışarıdan `dimmed` ile). RegisterStepModeScreen yerel `ModeCard`'ını silip bu kartı kullanır; akışın kalanı (progress bar, Devam, dallanma, toast) aynen kalır.

**Tech Stack:** React Native, expo-image, Animated (mevcut `markIn` yayı), jest + @testing-library/react-native.

**Spec:** docs/superpowers/specs/2026-11-01-register-mode-photo-cards-design.md

## Global Constraints

- Checkbox kalıbı FeedFilterSheet > OptionRow ile birebir: 22×22, borderRadius 7, `borderCurve: "continuous"`, seçili değilken borderWidth 1.5, seçilince dolgu + checkmark (SFIcon `checkmark`, size 14, strokeWidth 3, weight bold); yuva HER ZAMAN çizili.
- Checkbox mürekkebi MEDYA-SABİT: çizgi `colors.onMedia`, seçili dolgu `colors.onMedia`, tik `colors.onMediaInverse`. Tema mürekkebi (`inverseSurface`/`hairlineStrong`) foto üstünde KULLANILMAZ.
- Kayıtta ön-seçim yok: ekran açılışında hiçbir kart seçili değil ve İKİ KART DA TAM PARLAK; sönükleştirme ancak bir seçim varken diğer karta uygulanır.
- Dallanma aynen: Friends → `RegisterStep13`, Dating → `RegisterStep10`; seçimsiz Devam → mevcut `showInfoToast` hatası, navigate yok.
- Commit mesajları repo dilinde (Türkçe, conventional prefix); Claude atfı/Co-Authored-By YOK.
- Jest node 24 ister: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest <path>`.

## Review Focus

1. `MODE_CARD_ART` boşsa kart nötr zeminde kalmalı, sonsuz iskelet parlamamalı — testi Task 1'e eklendi (boş harita → iskelet yok).
2. İki karta ardışık dokunuş: seçim son dokunulana geçmeli, iki kart aynı anda tikli görünmemeli — testi Task 2'de.
3. Geri dönüp ekrana tekrar giriş: store'daki `mode` ile kart seçili (tikli) açılmalı — testi Task 2'de.
4. Küçük ekranda (SE sınıfı) iki 3:2 kart + başlık + bilgi satırı + Devam'ın scroll'suz sığması — birim testiyle ölçülemez; cihaz/simülatör kontrolü implementasyon sonunda yapılmalı, taşıyorsa kart araları/başlık payı kısılır.
5. `select` varyantında `open` prop'u anlamsız — verilse bile "moduna geç" satırı/chevron sızmamalı — testi Task 1'de (select + open=true + active=false → yine açıklama, chevron yok).

---

### Task 1: ModeChoiceCard `select` varyantı

**Files:**
- Modify: `src/features/discover/components/ModeChoiceCard.tsx`
- Test: `tests/features/discover/components/ModeChoiceCard.test.tsx` (yeni)

**Interfaces:**
- Consumes: mevcut `ModeChoiceCardProps`, `MODE_CARD_ART`, `colors.onMedia`/`colors.onMediaInverse`.
- Produces (Task 2 bunlara yaslanır):

```ts
export interface ModeChoiceCardProps {
  mode: AppMode;
  active: boolean;
  open?: boolean;            // yalnız "switch" varyantında anlamlı
  variant?: "switch" | "select"; // default "switch" — mevcut davranış birebir
  dimmed?: boolean;          // yalnız "select": perdeyi dışarıdan sürer
  testID?: string;           // TouchableOpacity'ye geçer
  onPress: (mode: AppMode) => void;
}
```

- [ ] **Step 1: Failing testi yaz** — `tests/features/discover/components/ModeChoiceCard.test.tsx`

Mock'lar: `react-i18next` (`t: (k) => k`), `@/shared/components/SFIcon` (default export, `name`'i `sficon:${name}` metni olarak basar), `@/shared/components/SkeletonBox` (`'Skeleton'` metni basan bileşen), `expo-image` (`Image: 'Image'`), `expo-linear-gradient` (`LinearGradient: 'LinearGradient'`). `MODE_CARD_ART` için `jest.mock('@/features/auth/modeCardArt', ...)` — testler arası `jest.resetModules` yerine iki describe'da ayrı mock değeri gerekiyorsa haritayı `let` ile dışarı al.

```tsx
describe('select varyantı', () => {
  it('chevron ve "moduna geç" satırı hiç çizilmiyor — open=true, active=false olsa bile', () => {
    // render(<ModeChoiceCard mode="Dating" active={false} open variant="select" onPress={jest.fn()} />)
    // queryByText('sficon:chevron.right') → null
    // queryByText('discover.mode.switchTo.Dating') → null
    // getByText('discover.mode.description.Dating') → var
  });
  it('checkbox yuvası hep çizili, tik yalnız active iken', () => {
    // active=false → getByTestId('mode-card-Dating-checkbox') var, queryByText('sficon:checkmark') → null
    // active=true  → getByText('sficon:checkmark') var
  });
});
describe('switch varyantı (regresyon)', () => {
  it('open ve !active → "moduna geç" + chevron, checkbox yok', () => {
    // variant verilmeden render → getByText('discover.mode.switchTo.Dating'),
    // getByText('sficon:chevron.right'), queryByTestId('mode-card-Dating-checkbox') → null
  });
});
it('MODE_CARD_ART boşken iskelet hiç çizilmiyor', () => {
  // art mock'u undefined dönerken render → queryByText('Skeleton') → null
});
```

- [ ] **Step 2: Testi koştur, FAIL gör**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/discover/components/ModeChoiceCard.test.tsx`
Expected: FAIL (variant prop'u yok, checkbox testID'si yok)

- [ ] **Step 3: Varyantı implemente et** — `ModeChoiceCard.tsx`

- Props'a `variant = "switch"`, `dimmed`, `testID` ekle; `testID` TouchableOpacity'ye.
- Perde sürücüsü: `const lit = variant === "select" ? !dimmed : active;` — `markIn` yayı `lit ? 1 : 0`'a gider, bounciness `lit ? 12 : 0`. Perde opaklığı değişmez (1 − markIn).
- Alt satır: `variant === "select"` ise HEP `description`; chevron bloğunun koşulu `variant !== "select" && !active`.
- Checkbox: `variant === "select"` iken kartın sağ üstünde absolute (`top: CARD_PAD, right: CARD_PAD`), Global Constraints'teki kalıp ve mürekkeplerle; `testID` olarak `` `${testID ?? `mode-card-${mode}`}-checkbox` `` değil — SABİT `mode-card-${mode}-checkbox` kullan (test ve ekran aynı adı görsün). `pointerEvents: "none"`.
- Dosya başındaki "KAYIT ADIMI BU BİLEŞENİ KULLANMIYOR" notunu güncelle: kayıt artık `select` varyantının tüketicisi; iki-kapı/işaretle ayrımı varyantla taşınıyor. `modeCardArt.ts` başındaki "kayıt adımına dokunulmadı" cümlesini de düzelt.

- [ ] **Step 4: Testi koştur, PASS gör**

Run: aynı komut. Expected: PASS (dördü de)

- [ ] **Step 5: Commit**

```bash
git add src/features/discover/components/ModeChoiceCard.tsx src/features/auth/modeCardArt.ts tests/features/discover/components/ModeChoiceCard.test.tsx
git commit -m "feat(discover): ModeChoiceCard'a kayit icin select varyanti"
```

### Task 2: RegisterStepModeScreen fotoğraflı kartlara geçer

**Files:**
- Modify: `src/features/auth/screens/RegisterStepModeScreen.tsx`
- Test: `tests/features/auth/screens/RegisterStepModeScreen.test.tsx` (yeni)

**Interfaces:**
- Consumes: Task 1'in `ModeChoiceCard` imzası (`variant="select"`, `dimmed`, `testID`); mevcut `APP_MODES`, `updateRegistrationField`, `showInfoToast`.
- Produces: değişen dış arayüz yok (ekranın route/props sözleşmesi aynı).

- [ ] **Step 1: Failing testi yaz** — `tests/features/auth/screens/RegisterStepModeScreen.test.tsx`

Mock kalıbı RegisterStep13Screen.test.tsx'teki gibi: `@/shared/hooks/redux` (dispatch'i yakala, `mockAuthState.registrationForm.mode`'u güncelle), `react-i18next`, RegisterProgressBar/RegisterBackButton string mock, `@/shared/services/toaster` (`showInfoToast: jest.fn()`), Task 1'deki SFIcon/expo-image/expo-linear-gradient/SkeletonBox mock'ları. `nav = { navigate: jest.fn(), goBack: jest.fn() }`.

```tsx
it('karta basmak modu store\'a yazıyor', () => {
  // fireEvent.press(getByTestId('reg-mode-Dating'))
  // dispatch → updateRegistrationField({ field: 'mode', value: 'Dating' })
});
it('ikinci karta basınca seçim el değiştiriyor — tek tik', () => {
  // press Dating, press Friends → mode 'Friends'
  // rerender sonrası sficon:checkmark SAYISI 1 (queryAllByText)
});
it('store\'da mode varken ekran tikli açılıyor', () => {
  // mockAuthState.registrationForm.mode = 'Friends' ile mount
  // getAllByText('sficon:checkmark').length === 1
});
it('seçimsiz Devam → toast, navigate yok', () => {
  // press reg-btn-next → showInfoToast çağrıldı, nav.navigate çağrılmadı
});
it('Friends → RegisterStep13, Dating → RegisterStep10', () => {
  // iki ayrı mount'ta seçim + Devam → nav.navigate doğru hedefle
});
```

- [ ] **Step 2: Testi koştur, FAIL gör**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/auth/screens/RegisterStepModeScreen.test.tsx`
Expected: FAIL (ekran hâlâ satır kartlarında — checkmark/checkbox yok)

- [ ] **Step 3: Ekranı geçir** — `RegisterStepModeScreen.tsx`

- Yerel `ModeCard` bileşenini ve artık kullanılmayan import'ları (Animated, TouchableOpacity, Check…) sil.
- Kart listesi:

```tsx
{APP_MODES.map((mode) => (
  <ModeChoiceCard
    key={mode}
    mode={mode}
    variant="select"
    active={selected === mode}
    dimmed={selected !== "" && selected !== mode}
    testID={`reg-mode-${mode}`}
    onPress={pick}
  />
))}
```

- Kart arası `gap: 12` kalır; başlık/açıklama/bilgi satırı/Devam/`handleNext` dallanması ve dosya başı akış yorumu aynen durur (yorumda yalnız "görsel kalıp Step10 ile aynı" cümlesi güncellenir — kart artık ModeChoiceCard'ın select varyantı).

- [ ] **Step 4: Testleri koştur, PASS gör**

Run: Step 2 komutu + regresyon için `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/discover/components/ModeChoiceCard.test.tsx tests/features/auth/registrationFlow.test.ts`
Expected: hepsi PASS

- [ ] **Step 5: Küçük ekran kontrolü**

Simülatörde (SE sınıfı dar ekran) adımı aç: iki kart + başlık + bilgi satırı + Devam scroll'suz sığıyor mu bak; taşıyorsa önce kart arası boşluğu, sonra başlık altı `mb-6`'yı kıs. (Simülatör koşulamıyorsa bunu PR notuna "cihaz doğrulaması bekliyor" diye yaz.)

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/screens/RegisterStepModeScreen.tsx tests/features/auth/screens/RegisterStepModeScreen.test.tsx
git commit -m "feat(auth): kayit mod adimi fotografli mod kartlarina gecti"
```
