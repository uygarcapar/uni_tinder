# Friends Same-Gender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends modunda deste kullanıcının kendi cinsiyet kategorisiyle sınırlansın; Non-Binary kullanıcı havuzunu bir kez seçsin.

**Architecture:** Kural backend'in deste sorgusunda; istemci hiçbir noktada kapı değil. Değer, var olan per-mode `interestedIn` alanında saklanır (`POST /api/profile/modes/friends/open`). İkili kategorilerde sunucu değeri kendi türetip kilitler; istemci yalnız sunucunun döndürdüğü kilit bayrağı açıkken soru sorar. FE tarafı üç yüzeyden ibaret: mod kurulum sheet'i, kayıt adımı, filtre modalının mod-farkındalığı.

**Tech Stack:** React Native + Expo, TypeScript, React Query, i18next, Jest + @testing-library/react-native

**Spec:** [docs/superpowers/specs/2026-11-04-friends-same-gender-design.md](../specs/2026-11-04-friends-same-gender-design.md)

## Global Constraints

- **Jest node@24 ister.** Varsayılan node 20'de çıktısız SIGSEGV veriyor. Test komutlarından önce PATH'e node@24 konmalı.
- **Wire formatı:** `interestedIn` değerleri `/modes/{mode}/open` ucunda **enumName** ("Men" | "Women" | "NonBinary"). `/swipe/filters` ucundaki int gösterimi (Men=0, Women=1, NonBinary=2) bu planda HİÇ kullanılmıyor.
- **İstemci kapı değil.** Hiçbir FE kontrolü "aynı cinsiyet" kuralını kurmuyor; sunucu reddi kanonik.
- **Kayıttan sonra istemci kategori TÜRETMEZ.** Soru sorulup sorulmayacağı yalnız sunucunun kilit bayrağından okunur.
- **Hata metinleri nötr kalır.** Mod uçlarının UT-23xx ailesinde 2305/2309 bilerek nötr; yeni doğrulama mesajları da karşı taraf hakkında hiçbir şey ima etmemeli.
- **Commit mesajlarında Claude atfı YOK** (ne `Co-Authored-By` ne gövdede anma).

## Review Focus

1. **Kilit bayrağı hiç gelmezse** (eski sunucu, alan yok) istemci soruyu SORMAMALI ve bugünkü davranış korunmalı — olmayan bir soruyu uydurmak, sormamaktan kötü. (Task 7)
2. **Sheet kapatılabilmeli.** Havuz değeri boş kalan Non-Binary kullanıcı sheet'i kapatıp modu kullanmaya devam edebilmeli; sheet her girişte kullanıcıyı hapseden bir duvara dönüşmemeli. (Task 7)
3. **Mod canlı değişince FilterModal da değişmeli.** Friends'te gizlenen bölüm, Dating'e geçildiğinde aynı mount içinde geri gelmeli. (Task 4)
4. **Cinsiyet kataloğu yüklenmemişken** kayıt adımı kararı yanlış tarafa düşmemeli: katalog boşken adım gösterilmez, sunucu türetir. (Task 6)
5. **Bir alt cinsiyet hem Non-Binary hem ikili kategoride görünürse** istemci sormaz (spec'in savunma kuralı). (Task 6)

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `backend_friends_same_gender_2026-11.md` (yeni, kök) | Backend sözleşmesi — repo konvansiyonu |
| `src/features/profile/profileService.ts:180-205` | `openProfileMode` Friends gövdesine `interestedIn` eklenmesi |
| `src/features/profile/genderCategory.ts` (yeni) | Saf yardımcı: katalogdan "bu alt cinsiyet Non-Binary mi" |
| `src/features/discover/components/ModeSetupSheet.tsx` | Friends'te havuz sorusu bölümü |
| `src/features/discover/components/FilterModal.tsx` | `mode` prop'u, Friends'te bölümün gizlenmesi, guard |
| `src/features/discover/screens/DiscoverScreen.tsx` | Kilit bayrağının okunması + tek seferlik sheet |
| `src/features/auth/registrationFlow.ts` | `RegisterStep10`'un Friends + Non-Binary'de gösterilmesi |
| `src/shared/i18n/translations/{tr,en}.ts` | Havuz sorusu metinleri + "İlgi Alanı" başlığının düzeltilmesi |

---

### Task 1: Backend sözleşme dokümanı

**Files:**
- Create: `backend_friends_same_gender_2026-11.md`

**Interfaces:**
- Consumes: —
- Produces: Bu planın geri kalanının dayandığı alan adları — `friendsInterestedIn: string[]`, `friendsInterestedInLocked: boolean` (`GET /api/profile` yanıtında).

- [ ] **Step 1: Dokümanı yaz**

Kökteki `backend_*_2026-*.md` dosyalarının biçimini izle (başlık, bağlam, istenen değişiklikler numaralı, FE'nin ne yapacağı, hata kodları). Spec'in "Backend'den istenecekler" bölümündeki altı maddeyi aç; her madde için sunucunun ne döndüreceğini ve FE'nin onu nerede okuyacağını yaz. Alan adlarını yukarıdaki Interfaces bloğundan aynen al.

Dokümanda açıkça yer alması gerekenler:
- `Mode=Friends` deste sorgusunda aynı-kategori kuralı; `InterestedInFlags` **kategori** seviyesinde yorumlanır (`Male` ve `TransMale` aynı havuz).
- Alt cinsiyet → kategori eşlemesinin sunucuda sabitlenmesi, özellikle `Transgender` (bugün hem Erkek hem Kadın kategorisinde dönüyor).
- `/modes/friends/open` gövdesindeki `interestedIn`in saklanmaya başlaması; ikili kategorilerde sunucunun istemciden geleni **yok sayıp** kendi türetmesini yazması.
- Geriye dönük doldurma; mevcut eşleşme ve sohbetlerin korunması.
- Cinsiyet değişiminde yeniden türetme.
- `GET /api/profile` yanıtında `friendsInterestedIn` + `friendsInterestedInLocked`.

- [ ] **Step 2: Commit**

```bash
git add backend_friends_same_gender_2026-11.md
git commit -m "docs: Friends aynı-cinsiyet kuralı için backend sözleşmesi"
```

---

### Task 2: `openProfileMode` Friends'te `interestedIn` göndersin

**Files:**
- Modify: `src/features/profile/profileService.ts:180-205`
- Test: `tests/features/profile/openProfileMode.test.ts` (yeni)

**Interfaces:**
- Consumes: Task 1'in alan adları.
- Produces: `profileService.openProfileMode(mode: string, payload: { intents: string[]; prompts: {promptKey: string; answer: string}[]; interestedIn?: string[] })` — imza DEĞİŞMİYOR; değişen, Friends dalının `interestedIn`i artık gövdeye koyması.

Bugün Friends dalı gövdeyi `{ friendshipIntents }` olarak kuruyor ve `interestedIn`i düşürüyor.

- [ ] **Step 1: Failing test'leri yaz**

`api.post`'u mock'layıp çağrılan gövdeyi yakala.

```ts
it('Friends açılışında interestedIn gövdeye giriyor', async () => {
  await profileService.openProfileMode('Friends', {
    intents: ['Hobby'], prompts: [], interestedIn: ['Women', 'NonBinary'],
  });
  expect(mockPost.mock.calls[0][1]).toMatchObject({
    friendshipIntents: ['Hobby'],
    interestedIn: ['Women', 'NonBinary'],
  });
});

it('Friends açılışında interestedIn verilmediyse alan HİÇ gönderilmiyor', async () => {
  await profileService.openProfileMode('Friends', { intents: ['Hobby'], prompts: [] });
  expect(mockPost.mock.calls[0][1]).not.toHaveProperty('interestedIn');
});

it('Dating dalı değişmedi', async () => {
  await profileService.openProfileMode('Dating', {
    intents: ['LongTerm'], prompts: [], interestedIn: ['Men'],
  });
  expect(mockPost.mock.calls[0][1]).toMatchObject({
    interestedIn: ['Men'], relationshipIntent: 'LongTerm',
  });
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu gör**

Run: `npx jest tests/features/profile/openProfileMode.test.ts`
Expected: FAIL — Friends gövdesinde `interestedIn` yok.

- [ ] **Step 3: Friends dalını düzelt**

`mode === "Friends"` dalında `payload.interestedIn` **doluysa** gövdeye ekle, boş/verilmemişse ekleme. Boş dizi göndermek ile hiç göndermemek sunucu için aynı şey değil (kilitli kullanıcıda ölü yük).

- [ ] **Step 4: Test'i çalıştır, geçtiğini gör**

Run: `npx jest tests/features/profile/openProfileMode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/profileService.ts tests/features/profile/openProfileMode.test.ts
git commit -m "feat(profile): Friends açılışında interestedIn gövdeye giriyor"
```

---

### Task 3: Cinsiyet kategorisi yardımcısı

**Files:**
- Create: `src/features/profile/genderCategory.ts`
- Test: `tests/features/profile/genderCategory.test.ts` (yeni)

**Interfaces:**
- Consumes: `GenderCategoryOption` tipi (`@/shared/queries/commonQueries`).
- Produces: `isNonBinaryOnlyGender(categories: GenderCategoryOption[], genderEnumName: string | null | undefined): boolean`

İsim kasıtlı olarak `asksFriendsPool`tan AYRI: o ad plan boyunca taşınan **boolean**in adı (Task 6-7 parametreleri). Fonksiyon ile değerin aynı adı taşıması, ikisinin birlikte göründüğü ekranda gölgeleme yaratırdı.

Saf fonksiyon: verilen alt cinsiyet YALNIZ Non-Binary kategorisinde görünüyorsa `true`. Katalog boşsa, cinsiyet yoksa, ya da alt cinsiyet ikili bir kategoride DE görünüyorsa `false` (spec'in savunma kuralı — belirsizlikte sorma).

- [ ] **Step 1: Failing test'leri yaz**

```ts
const CATS = [
  { categoryEnumName: 'Male', subGenders: [{ enumName: 'Male' }, { enumName: 'Transgender' }] },
  { categoryEnumName: 'Female', subGenders: [{ enumName: 'Female' }, { enumName: 'Transgender' }] },
  { categoryEnumName: 'NonBinary', subGenders: [{ enumName: 'NonBinary' }, { enumName: 'Agender' }] },
] as any;

it('yalnız Non-Binary kategorisindeki alt cinsiyette soruyor', () => {
  expect(isNonBinaryOnlyGender(CATS, 'Agender')).toBe(true);
});
it('ikili kategorideki alt cinsiyette sormuyor', () => {
  expect(isNonBinaryOnlyGender(CATS, 'Male')).toBe(false);
});
it('iki kategoride birden görünen alt cinsiyette sormuyor', () => {
  expect(isNonBinaryOnlyGender(CATS, 'Transgender')).toBe(false);
});
it('hem NB hem ikili kategoride görünen alt cinsiyette sormuyor', () => {
  const amb = [...CATS, { categoryEnumName: 'NonBinary', subGenders: [{ enumName: 'Male' }] }] as any;
  expect(isNonBinaryOnlyGender(amb, 'Male')).toBe(false);
});
it('katalog boşken sormuyor', () => {
  expect(isNonBinaryOnlyGender([], 'Agender')).toBe(false);
});
it('cinsiyet yokken sormuyor', () => {
  expect(isNonBinaryOnlyGender(CATS, null)).toBe(false);
  expect(isNonBinaryOnlyGender(CATS, '')).toBe(false);
});
it('katalogda olmayan alt cinsiyette sormuyor', () => {
  expect(isNonBinaryOnlyGender(CATS, 'Bilinmeyen')).toBe(false);
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu gör**

Run: `npx jest tests/features/profile/genderCategory.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: `isNonBinaryOnlyGender` fonksiyonunu yaz**

`categories` içinde alt cinsiyetin geçtiği TÜM kategorileri bul; sonuç tam olarak bir kategoriyse ve o kategorinin `categoryEnumName`i Non-Binary ise `true`, diğer her durumda `false`. Non-Binary kategorisinin tanınması `categoryEnumName === "NonBinary"` üzerinden; dosyada tek bir sabit olarak dursun ki ad değişirse tek yerden düzelsin.

- [ ] **Step 4: Test'i çalıştır, geçtiğini gör**

Run: `npx jest tests/features/profile/genderCategory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/genderCategory.ts tests/features/profile/genderCategory.test.ts
git commit -m "feat(profile): alt cinsiyetin Non-Binary kategorisinde olup olmadığını çözen saf yardımcı"
```

---

### Task 4: FilterModal mod farkındalığı

**Files:**
- Modify: `src/features/discover/components/FilterModal.tsx:1711-1718` (props), `:2553` (`interestedInEmpty`), `:2788` (`actionDisabled`), `:2521` (reset guard), `:2869-2876` (bölüm)
- Modify: `src/features/discover/screens/DiscoverScreen.tsx:3410-3417` (prop geçişi)
- Test: `tests/features/discover/components/FilterModal.test.tsx` (var olan dosyaya ekleme)

**Interfaces:**
- Consumes: `AppMode` (`@/features/discover/modeTheme`).
- Produces: `FilterModal` yeni prop'u `mode?: AppMode` — verilmezse `"Dating"` gibi davranır (bölüm görünür). Eski çağıranları bozmamak için opsiyonel.

- [ ] **Step 1: Failing test'leri yaz**

```tsx
it('Friends modunda interestedIn bölümü çizilmiyor', () => {
  const { queryByText } = render(<FilterModal {...base} mode="Friends" />);
  expect(queryByText(TR.discover.filters.interestedIn.title)).toBeNull();
});

it('Dating modunda bölüm çiziliyor', () => {
  const { queryByText } = render(<FilterModal {...base} mode="Dating" />);
  expect(queryByText(TR.discover.filters.interestedIn.title)).not.toBeNull();
});

it('Friends modunda interestedIn boşken Uygula kilitli DEĞİL', () => {
  const { getByTestId } = render(
    <FilterModal {...base} mode="Friends" filters={{ ...base.filters, interestedIn: [] }} />,
  );
  expect(getByTestId('filter-apply').props.accessibilityState?.disabled).toBeFalsy();
});

it('Dating modunda interestedIn boşken Uygula kilitli', () => { /* aynı kurulum, mode="Dating" */ });

// Review Focus 3
it('mod canlı değişince bölüm geri geliyor', () => {
  const { rerender, queryByText } = render(<FilterModal {...base} mode="Friends" />);
  rerender(<FilterModal {...base} mode="Dating" />);
  expect(queryByText(TR.discover.filters.interestedIn.title)).not.toBeNull();
});
```

Uygula butonunun testID'si var olan dosyadaki kalıptan alınsın; yoksa bu task'ta eklenir.

- [ ] **Step 2: Test'leri çalıştır, başarısız olduklarını gör**

Run: `npx jest tests/features/discover/components/FilterModal.test.tsx`
Expected: FAIL — bölüm her modda çiziliyor, guard her modda kilitliyor.

- [ ] **Step 3: `mode` prop'unu ekle ve bölümü koşulla**

`FilterModal`'ın destructuring'ine `mode` eklenir; `const isFriends = mode === "Friends"`. Bölüm (`FilterSection` + pill listesi) `!isFriends` koşuluna alınır. `interestedInEmpty` Friends'te `false` olur — hem `actionDisabled` hem reset guard'ı bu değeri okuduğu için ikisi birden düzelir; iki yere ayrı koşul yazma.

Kayıt kuralı: Friends'te bölüm görünmediği için `local.interestedIn` kullanıcı tarafından değiştirilemez; `onSave` payload'ı mevcut değeri olduğu gibi taşımaya devam eder (Dating tercihi bozulmamalı).

- [ ] **Step 4: DiscoverScreen'den prop'u geç**

`<FilterModal ... mode={mode} />`.

- [ ] **Step 5: Test'leri çalıştır, geçtiklerini gör**

Run: `npx jest tests/features/discover/components/FilterModal.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/discover/components/FilterModal.tsx src/features/discover/screens/DiscoverScreen.tsx tests/features/discover/components/FilterModal.test.tsx
git commit -m "feat(discover): filtre modalı mod-farkındalı, Friends'te cinsiyet bölümü yok"
```

---

### Task 5: Havuz sorusu metinleri + "İlgi Alanı" başlığının düzeltilmesi

**Files:**
- Modify: `src/shared/i18n/translations/tr.ts:1320-1327` (`discover.filters.interestedIn`), `discover.mode.*` bloğu
- Modify: `src/shared/i18n/translations/en.ts` (karşılıkları)
- Test: `tests/shared/i18n/friendsPool.test.ts` (yeni)

**Interfaces:**
- Produces: Yeni anahtarlar — `discover.mode.friendsPoolTitle`, `discover.mode.friendsPoolDescription`, `discover.mode.friendsPoolRequired`. Seçenek etiketleri var olan `auth.step10.{male,female,nonBinary}` anahtarlarından okunur (ModeSetupSheet zaten bu eşlemeyi taşıyor).

- [ ] **Step 1: Failing test'i yaz**

```ts
it('havuz sorusu anahtarları iki dilde de dolu', () => {
  for (const key of ['friendsPoolTitle', 'friendsPoolDescription', 'friendsPoolRequired']) {
    expect(tr.discover.mode[key]).toBeTruthy();
    expect(en.discover.mode[key]).toBeTruthy();
  }
});

it('filtre başlığı artık hobiyle karışan "İlgi Alanı" değil', () => {
  expect(tr.discover.filters.interestedIn.title).not.toBe('İlgi Alanı');
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu gör**

Run: `npx jest tests/shared/i18n/friendsPool.test.ts`
Expected: FAIL

- [ ] **Step 3: Metinleri yaz**

- `friendsPoolTitle` (TR): "Arkadaş modunda kimleri görmek istersin?" / (EN): "Who do you want to see in Friends?"
- `friendsPoolDescription` (TR): "Birden fazla seçebilirsin." / (EN): "You can pick more than one."
- `friendsPoolRequired` (TR): "En az bir tane seç." / (EN): "Pick at least one."
- `discover.filters.interestedIn.title` (TR): "Kiminle ilgileniyorsun" / (EN): "Who you're interested in" — ModeSetupSheet'in dili kanonik.

Metinler karşı taraf hakkında hiçbir şey ima etmemeli (Global Constraints).

- [ ] **Step 4: Test'i çalıştır, geçtiğini gör**

Run: `npx jest tests/shared/i18n/friendsPool.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts tests/shared/i18n/friendsPool.test.ts
git commit -m "feat(i18n): Friends havuz sorusu metinleri, filtre başlığı hobiyle karışmıyor"
```

---

### Task 6: Kayıt akışı — Friends + Non-Binary'de `RegisterStep10`

**Files:**
- Modify: `src/features/auth/registrationFlow.ts:57-71` (`stepsForMode`), `registrationResumeStack`
- Modify: `src/features/auth/screens/RegisterStepModeScreen.tsx:76` (Friends dalının hedefi)
- Modify: `src/features/auth/screens/RegisterStep10Screen.tsx` (Friends varyantının kopyası)
- Test: `tests/features/auth/registrationFlow.test.ts` (var olan dosyaya ekleme)

**Interfaces:**
- Consumes: `isNonBinaryOnlyGender` (Task 3), `discover.mode.friendsPool*` anahtarları (Task 5).
- Produces: `stepsForMode(mode?: string | null, asksFriendsPool?: boolean): RegistrationStepRoute[]` ve `registrationResumeStack(route?, mode?, asksFriendsPool?)` — üçüncü parametre verilmezse `false`, yani bugünkü davranış.

Karar istemcide türetilmiyor: çağıran `isNonBinaryOnlyGender(categories, gender)` sonucunu geçiyor. Katalog boşken `false` döndüğü için adım gösterilmez (Review Focus 4).

- [ ] **Step 1: Failing test'leri yaz**

```ts
it('Friends + havuz sorusu YOK → RegisterStep10 elenmiş', () => {
  expect(stepsForMode('Friends')).not.toContain('RegisterStep10');
  expect(stepsForMode('Friends', false)).not.toContain('RegisterStep10');
});
it('Friends + havuz sorusu VAR → RegisterStep10 duruyor', () => {
  expect(stepsForMode('Friends', true)).toContain('RegisterStep10');
});
it('Dating her hâlde RegisterStep10 taşıyor', () => {
  expect(stepsForMode('Dating', false)).toContain('RegisterStep10');
});
it('resume yığını aynı kaynaktan okuyor', () => {
  expect(registrationResumeStack('RegisterStep13', 'Friends', true)).toContain('RegisterStep10');
  expect(registrationResumeStack('RegisterStep13', 'Friends', false)).not.toContain('RegisterStep10');
});
```

- [ ] **Step 2: Test'leri çalıştır, başarısız olduklarını gör**

Run: `npx jest tests/features/auth/registrationFlow.test.ts`
Expected: FAIL — üçüncü parametre yok.

- [ ] **Step 3: `stepsForMode` ve `registrationResumeStack` imzalarını genişlet**

Eleme `mode !== 'Friends' || asksFriendsPool` olduğunda uygulanmaz. İlerleme çubuğunun paydası ile resume yığını aynı fonksiyondan okumaya devam etmeli — dosyadaki mevcut uyarı geçerli: ayrışırsa Arkadaş kullanıcısının barı takılır.

- [ ] **Step 4: Ekran dallanmasını ve kopyayı bağla**

`RegisterStepModeScreen`'in Friends dalı, `isNonBinaryOnlyGender` doğruysa `RegisterStep10`a, değilse bugünkü gibi `RegisterStep13`e gider; katalog `useGenders()`ten, cinsiyet redux'taki kayıt alanından okunur. `RegisterStep10Screen` Friends akışında başlık/açıklama olarak `discover.mode.friendsPool*` anahtarlarını kullanır (Dating akışında mevcut `auth.step10.*` kopyası aynen kalır); hangi akışta olduğunu redux'taki seçili moddan okur.

- [ ] **Step 5: Test'leri çalıştır, geçtiklerini gör**

Run: `npx jest tests/features/auth/registrationFlow.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/auth tests/features/auth/registrationFlow.test.ts
git commit -m "feat(auth): Non-Binary Friends kaydında havuz adımı akışta kalıyor"
```

---

### Task 7: ModeSetupSheet havuz bölümü + tek seferlik sheet

**Files:**
- Modify: `src/features/discover/components/ModeSetupSheet.tsx:64-76` (props), `:163-199` (doğrulama + submit), `:400-401` (bölüm koşulu)
- Modify: `src/features/discover/screens/DiscoverScreen.tsx:1486-1545` (kilit bayrağının okunması), `:1561-1597` (submit), `:3395-3408` (sheet)
- Test: `tests/features/discover/components/ModeSetupSheet.test.tsx` (yeni)

**Interfaces:**
- Consumes: Task 2'nin `openProfileMode` davranışı, Task 5'in metin anahtarları, Task 1'in `friendsInterestedIn` / `friendsInterestedInLocked` alanları.
- Produces: `ModeSetupSheetProps` yeni alanı `asksFriendsPool?: boolean` (varsayılan `false`). Friends + `asksFriendsPool` olduğunda sheet havuz bölümünü çizer ve `onSubmit` payload'ında `interestedIn` gönderir; diğer her Friends durumunda alan gönderilmez.

- [ ] **Step 1: Failing test'leri yaz**

```tsx
it('Friends + asksFriendsPool → havuz bölümü çiziliyor', () => { /* başlık görünür */ });

it('Friends + asksFriendsPool, havuz boşken submit engelleniyor', () => {
  // niyet + prompt dolu, havuz boş → onSubmit çağrılmıyor, friendsPoolRequired görünüyor
});

it('Friends + asksFriendsPool → payload interestedIn taşıyor', () => {
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ interestedIn: ['Women'] }));
});

it('Friends + asksFriendsPool YOK → bölüm yok, payload interestedIn taşımıyor', () => {
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('interestedIn');
});

it('Dating davranışı değişmedi', () => { /* mevcut interestedIn bölümü + UT-2308 doğrulaması */ });
```

DiscoverScreen'in türetmesi için iki test daha — `getMyProfile` mock'lanıp sheet'in açılıp açılmadığına bakılır:

```tsx
// Review Focus 1
it.each([
  ['alan hiç gelmiyor', {}],
  ['kilit açıkça true', { friendsInterestedInLocked: true }],
])('kilit bayrağı %s → havuz sheet'i açılmıyor', async (_, extra) => {
  mockGetMyProfile.mockResolvedValue({ modes: { friends: true }, ...extra });
  // Friends'e girilir; setupMode null kalır
});

// Review Focus 2
it('havuz sheet\'i kapatılabiliyor ve mod kullanılabilir kalıyor', async () => {
  mockGetMyProfile.mockResolvedValue({
    modes: { friends: true }, friendsInterestedInLocked: false, friendsInterestedIn: [],
  });
  // sheet açılır → onClose → sheet kapalı kalır, deste görünür
});
```

- [ ] **Step 2: Test'leri çalıştır, başarısız olduklarını gör**

Run: `npx jest tests/features/discover/components/ModeSetupSheet.test.tsx`
Expected: FAIL — prop yok, Friends'te bölüm hiç çizilmiyor.

- [ ] **Step 3: Sheet'e havuz bölümünü ekle**

`:401`'deki `!isFriends` koşulu `!isFriends || asksFriendsPool` olur; başlık/açıklama Dating'de `discover.mode.interestedIn*`, Friends'te `discover.mode.friendsPool*`. Seçenek listesi ve `INTERESTED_IN_KEYS` ortak. `handleSubmit`'teki zorunluluk kontrolü `(!isFriends || asksFriendsPool) && interestedIn.length === 0` olur; Friends'te hata metni `friendsPoolRequired`. Payload'da `interestedIn` yalnız bölüm çizildiğinde gider.

- [ ] **Step 4: DiscoverScreen'de kilit bayrağını oku**

Açık mod haritasını okuyan effect (`getMyProfile`) aynı yanıttan `friendsInterestedIn` ve `friendsInterestedInLocked` alanlarını da alır. Türetilen durum:

- `asksFriendsPool` = `friendsInterestedInLocked === false` — **kesin karşılaştırma**. Alan hiç gelmezse (eski sunucu) değer `undefined` olur ve soru SORULMAZ (Review Focus 1).
- Tek seferlik sheet: Friends moduna girildiğinde profil açık **ve** `asksFriendsPool` **ve** `friendsInterestedIn` boşsa `setSetupMode("Friends")`.

- [ ] **Step 5: Sheet'i kapatılabilir bırak**

Sheet'in `onClose`'u oturum içinde bir daha açılmayacağını işaretler (ref ya da state — kalıcı depolama YOK, bir sonraki açılışta tekrar sorulur). Kullanıcı modu kullanmaya devam edebilir. (Review Focus 2)

- [ ] **Step 6: Test'leri çalıştır, geçtiklerini gör**

Run: `npx jest tests/features/discover/components/ModeSetupSheet.test.tsx`
Expected: PASS

- [ ] **Step 7: Tüm paketi çalıştır**

Run: `npx jest` ve `npm run type-check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/discover tests/features/discover/components/ModeSetupSheet.test.tsx
git commit -m "feat(discover): Non-Binary kullanıcıya Friends havuz sorusu, mevcut kullanıcılara tek seferlik sheet"
```

---

## Sıralama notu

Task 1 sözleşmeyi adlandırdığı için önce gelir. Task 2-3 bağımsız. Task 4-5 bağımsız. Task 6 Task 3+5'e, Task 7 Task 2+5'e dayanır.

Backend'in 1. ve 2. maddesi inmeden sürüm çıkarsa FE yüzeyleri doğru davranır ama deste karma kalır — kopyadaki söz tutulmamaya devam eder. Sürüm sırası: backend kuralı → FE.
