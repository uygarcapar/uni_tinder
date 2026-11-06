# Mod Açılışında Fotoğraf Adımı + Mod-Bağlı Editör — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mod açılışında kullanıcı fotoğraflarını bilinçli seçsin (mevcutları kullan YA DA yeni çek), profil editörü segment'siz olarak aktif modun profilini (fotoğraflar dahil) düzenlesin.

**Architecture:** Alan-adı seçimi tek saf çözücüde (`modePhotoFields`), kurulum foto bölümü kendi bileşeninde, `openProfileMode` multipart'a geçiyor. Editörde `ModeSwitch`/`ModeClosedNotice` sökülüyor; foto okuma/yazma noktaları çözücüden geçiyor.

**Tech Stack:** React Native + Expo, TanStack sorgu YOK bu yüzeyde (profileService kendi TTL cache'i), jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-11-06-mode-open-photo-step-design.md`

## Global Constraints

- Sunucu görünürlük eşiği: mod başına **en az 2 görünür foto** (`PhotoVisibility.MinimumVisiblePhotos = 2`).
- Slot tavanı: `MAX_PROFILE_PHOTOS` (6) — mod başına.
- `open` multipart alan adları sözleşme §4.1 örneğindeki gibi: `PhotoIds[0]`, `MainPhotoId`, `FriendshipIntents[0]`, `InterestedIn[0]`, `RelationshipIntent`, `Prompts[0].PromptKey` / `Prompts[0].Answer`, `NewPhotos` (tekrarlı dosya alanı).
- "Gönderilmeyen alana dokunulmaz" — boş `interestedIn` alanı HİÇ eklenmez (mevcut sözleşme korunur).
- `open` yanıtı `{dating, friends}` haritası olarak KALIR.
- Jest node 24 ister: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- Commit mesajlarında Claude imzası/atıfı YOK.

## Review Focus

1. Kaynak modda görünür foto < 2 → "mevcutları kullan" seçeneği HİÇ çizilmez, doğrudan yeni-kare hâli (testi Task 3'te).
2. Havuz-güncelleme yolu (profil zaten açık, `shouldAskFriendsPool`) foto alanı GÖNDERMEZ — yoksa açık profilin fotoğrafları sessizce değişir (testi Task 4'te).
3. `interestedIn` boşken multipart'ta alan yok — eski JSON sözleşmesinin FormData'da da korunması (testi Task 2'de).
4. Aktif mod KAPALIYKEN editör açık moda düşer, asla kapalı modun formunu çizmez (testi Task 6'da).
5. Moderasyon kararı dosyaya ait: aynı `photoId` iki listede varsa yama İKİSİNİ de günceller (testi Task 7'de).

---

### Task 1: `modePhotoFields` saf çözücüsü

**Files:**
- Create: `src/features/profile/modePhotoFields.ts`
- Test: `tests/features/profile/modePhotoFields.test.ts`

**Interfaces:**
- Consumes: `AppMode` (`@/features/discover/modeTheme`).
- Produces (sonraki görevlerin tamamı bunu kullanır):
  ```ts
  export type ModePhotoFields = {
    listKey: "photosList" | "friendsPhotosList";
    visibilityKey: "profileVisibility" | "friendsProfileVisibility";
    newPhotosKey: "NewPhotos" | "FriendsNewPhotos";
    photoOrdersKey: "PhotoOrders" | "FriendsPhotoOrders";
    newMainPhotoIdKey: "NewMainPhotoId" | "FriendsNewMainPhotoId";
    photoIdsToDeleteKey: "PhotoIdsToDelete" | "FriendsPhotoIdsToDelete";
  };
  export function modePhotoFields(mode: AppMode): ModePhotoFields;
  /** Modun foto listesi, `order`a göre SIRALI; alan yoksa []. */
  export function modePhotosOf(profile: unknown, mode: AppMode): any[];
  ```

- [ ] **Step 1: Failing test yaz** — `modePhotoFields("Dating")` düz adları, `modePhotoFields("Friends")` `Friends*`/`friends*` adlarını döner; `modePhotosOf` sıralar (order 2,1 → 1,2), profil null/alan yok → `[]`, Friends isteğinde `friendsPhotosList` okur.
- [ ] **Step 2: Koş, düşsün** — `npx jest tests/features/profile/modePhotoFields.test.ts` → FAIL (modül yok).
- [ ] **Step 3: Modülü yaz** — doc yorumu: alan adları backend kardeş-alan sözleşmesinden, tek kaynak burada; çatallanırsa iki yüzey sessizce ayrışır.
- [ ] **Step 4: Koş, geçsin.**
- [ ] **Step 5: Commit** — `feat(profile): mod başına foto alan adlarının tek çözücüsü`

### Task 2: `openProfileMode` multipart + foto seçimi

**Files:**
- Modify: `src/features/profile/profileService.ts:180-224` (openProfileMode)
- Test: `tests/features/profile/openProfileMode.test.ts` (mevcut — güncellenir)

**Interfaces:**
- Produces:
  ```ts
  export type OpenModePhotos =
    | { kind: "existing"; photoIds: string[]; mainPhotoId: string }
    | { kind: "new"; files: Array<{ uri: string; name: string; type: string }> };
  // openProfileMode(mode, payload) — payload'a opsiyonel `photos?: OpenModePhotos` eklenir.
  // Dönüş aynı: Promise<{ dating?: boolean; friends?: boolean } | undefined>
  ```
- Gövde artık HER ZAMAN `FormData` (kanonik multipart). `photos` yokken foto alanı eklenmez (havuz-güncelleme yolu). `kind:"existing"` → `PhotoIds[i]` + `MainPhotoId`; `kind:"new"` → her dosya `NewPhotos` adıyla append. Prompt'lar `Prompts[i].PromptKey/.Answer`; Friends niyetleri `FriendshipIntents[i]`; Dating `InterestedIn[i]` + `RelationshipIntent`.

- [ ] **Step 1: Mevcut testleri FormData okuyacak şekilde güncelle + yeni case'ler** — test başına yardımcı: `const partsOf = () => { const fd = mockPost.mock.calls[0][1]; return (fd.getParts?.() ?? (fd as any)._parts).map(...) }` (RN FormData; jest ortamında hangisi çalışıyorsa — Step 2'de görülür). Case'ler: (a) Friends + interestedIn dolu → `FriendshipIntents[0]` ve `InterestedIn[0]` alanları var; (b) interestedIn boş/yok → `InterestedIn` HİÇ yok; (c) Dating → `InterestedIn[0]` + `RelationshipIntent`; (d) `photos: {kind:"existing"}` → `PhotoIds[0]`,`PhotoIds[1]`,`MainPhotoId`; (e) `photos: {kind:"new", files:[f1,f2]}` → iki `NewPhotos` parçası, `PhotoIds` yok; (f) `photos` yok → ne `PhotoIds` ne `NewPhotos`.
- [ ] **Step 2: Koş, düşsün** (gövde bugün düz obje).
- [ ] **Step 3: Servisi yaz** — `updateProfile`'daki FormData kalıbı (satır 117-128) örnek; `bustProfileCache()` ve dönüş aynı kalır.
- [ ] **Step 4: Koş, geçsin.**
- [ ] **Step 5: Commit** — `feat(profile): open ucu multipart'a geçti, foto seçimi taşıyor`

### Task 3: Kurulum foto bölümü bileşeni

**Files:**
- Create: `src/features/discover/components/ModeSetupPhotoSection.tsx`
- Test: `tests/features/discover/components/ModeSetupPhotoSection.test.tsx`
- i18n: `src/shared/i18n/translations/tr.ts` + `en.ts` — `discover.mode.photos.*` anahtarları (useOther — `{{mode}}` enterpolasyonlu "{{mode}} fotoğraflarımı kullan", minHint, addTile, mainBadge)

**Interfaces:**
- Produces:
  ```ts
  export type SetupPhotoChoice =
    | { kind: "existing" }
    | { kind: "new"; photos: PickedPhoto[] }; // PickedPhoto: @/shared/utils/photoPicker
  type Props = {
    /** Kaynak modun GÖRÜNÜR fotoğrafları, sıralı. Boş/2'den azsa "mevcutları kullan" HİÇ çizilmez. */
    sourcePhotos: Array<{ photoId: string; photoImageUrl: string | null }>;
    sourceModeLabel: string; // "Flört" | "Arkadaş" — etiket enterpolasyonu çağıranda değil burada
    value: SetupPhotoChoice;
    onChange: (next: SetupPhotoChoice) => void;
  };
  ```
- Bileşen `PhotoSourceSheet`i (`@/shared/components/PhotoSourceSheet`) KENDİSİ mount eder; kamera `captureAndCropPhoto()`, galeri `pickAndCropPhotos(kalanSlot)` (`@/shared/utils/photoPicker`). Seçilenler yerel kalır (upload yok — kayıt akışı kalıbı). İlk kare "ana" rozeti; her karede silme ✕'i. Tavan `MAX_PROFILE_PHOTOS`. Sürükleme/sıralama YOK (statik yerleşim; `ProfilePhotoGrid` KULLANILMAZ).

- [ ] **Step 1: Failing testler** — (a) `sourcePhotos.length >= 2` iken seçenek satırı çizilir ve varsayılan işaretli (`value.kind === "existing"` çağıranda; bileşen önizleme şeridi basar); (b) `sourcePhotos.length < 2` iken seçenek satırı YOK, ekle karosu var; (c) ekle karosuna basınca PhotoSourceSheet açılır, galeri mock'u 2 foto dönünce `onChange({kind:"new", photos:[...]})`; (d) foto ✕'ine basınca listeden düşer; (e) ilk karede ana rozeti; (f) `photos.length === MAX_PROFILE_PHOTOS` iken ekle karosu çizilmez. Picker utils jest.mock ile.
- [ ] **Step 2: Koş, düşsün.**
- [ ] **Step 3: Bileşeni + i18n anahtarlarını yaz.**
- [ ] **Step 4: Koş, geçsin.**
- [ ] **Step 5: Commit** — `feat(discover): mod kurulumunda fotoğraf bölümü bileşeni`

### Task 4: `ModeSetupSheet` entegrasyonu

**Files:**
- Modify: `src/features/discover/components/ModeSetupSheet.tsx`
- Test: `tests/features/discover/components/ModeSetupSheet.test.tsx` (mevcut — genişletilir)

**Interfaces:**
- Consumes: Task 3'ün `ModeSetupPhotoSection` + `SetupPhotoChoice`.
- Produces (DiscoverScreen bunu kullanır):
  ```ts
  // Props'a eklenir:
  /** null → foto bölümü HİÇ çizilmez ve payload'a photos girmez (havuz-güncelleme yolu). */
  photoSetup?: { sourcePhotos: Array<{photoId: string; photoImageUrl: string | null}>; sourceModeLabel: string } | null;
  // onSubmit payload'ına eklenir:
  photos?: SetupPhotoChoice;
  ```
- Doğrulama: `photoSetup` doluyken submit için ya `kind:"existing"` (yalnız sourcePhotos>=2'de mümkün) ya `kind:"new" && photos.length >= 2`; sağlanmadıkça gönder butonu pasif + `discover.mode.photos.minHint` satırı. Başlangıç değeri: sourcePhotos>=2 → `{kind:"existing"}`, değilse `{kind:"new", photos:[]}`.

- [ ] **Step 1: Failing testler** — (a) `photoSetup` doluyken bölüm çizilir, submit payload'ında `photos: {kind:"existing"}`; (b) `photoSetup: null` iken bölüm yok ve payload'da `photos` alanı YOK; (c) `kind:"new"` + 1 foto → gönder pasif; 2 foto → aktif ve payload'da fotolar.
- [ ] **Step 2: Koş, düşsün.**
- [ ] **Step 3: Entegre et** — mevcut submit doğrulama zinciri korunur (niyet/prompt kuralları aynen).
- [ ] **Step 4: Koş, geçsin; mevcut ModeSetupSheet testleri de yeşil kalsın.**
- [ ] **Step 5: Commit** — `feat(discover): kurulum sheet'i foto adımı topluyor`

### Task 5: DiscoverScreen bağlama + moderasyon özeti

**Files:**
- Modify: `src/features/discover/screens/DiscoverScreen.tsx` (~1580 `handleOpenModeSetup`, ~1620 `handleSubmitModeSetup`, ~3451 `<ModeSetupSheet>`)

**Interfaces:**
- Consumes: Task 1 `modePhotosOf`, Task 2 `photos` payload'ı, Task 4 `photoSetup` prop'u; `summarizeModeration` (`@/features/profile/photoModeration`), `profileService.getMyProfile(true)`.

- [ ] **Step 1: `handleOpenModeSetup`** — sheet açılırken `profileService.getMyProfile()` çek (TTL cache ucuz); kaynak mod = açılan modun TERSİ; `modePhotosOf(profile, kaynakMod)` → `isVisibleToOthers === true` süzgeci (alan `photosList` öğesinde; `normalizePhotoModeration` kalıbına bak) → state'e `photoSetup` yaz. Profil çekilemezse `photoSetup = { sourcePhotos: [], ... }` (yalnız yeni-kare yolu — güvenli taraf).
- [ ] **Step 2: Havuz-güncelleme yolunu koru** — `shouldAskFriendsPool` effect'inden açılan sheet'e `photoSetup: null` geçir (profil zaten açık; Review Focus 2).
- [ ] **Step 3: `handleSubmitModeSetup`** — payload'daki `photos`u `OpenModePhotos`a çevir: `existing` → kaynak modun TÜM slotları `PhotoIds` (görünmezler dahil — devralma semantiği) + kaynak ana `MainPhotoId`; `new` → `files` (PickedPhoto → {uri,name,type}). Başarıda `kind:"new"` ise `profileService.getMyProfile(true)` + `summarizeModeration(modePhotosOf(profil, açılanMod))` → doluysa `Alert.alert(summary.title, summary.message)`.
- [ ] **Step 4: Elle doğrulama çizgisi** — `npx tsc --noEmit` dokunulan dosyalarda yeni hata yok; `npx jest tests/features/discover` yeşil.
- [ ] **Step 5: Commit** — `feat(discover): mod açılışı foto seçimiyle gidiyor, yeni karede moderasyon özeti`

### Task 6: Editör — segment kalkıyor, mod aktif moddan

**Files:**
- Create: `src/features/profile/editMode.ts`
- Modify: `src/features/profile/components/EditProfileForm.tsx` (satır ~389 `ModeClosedNotice`, ~463 `ModeSwitch`, ~1111 `editMode` state, ~2028 `<ModeSwitch>`, ~2269 `<ModeClosedNotice>`)
- Test: `tests/features/profile/editMode.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Aktif mod açıksa o; kapalıysa AÇIK olan mod; ikisi de kapalıysa (bilinmiyor sayılır) aktif mod. */
  export function resolveEditMode(active: AppMode, datingOpen: boolean, friendsOpen: boolean): AppMode;
  ```
- EditProfileForm: `const { mode } = useAppMode()` + `const editMode = resolveEditMode(mode, datingOpen, friendsOpen)` — `setEditMode`/`useState` KALKAR. `ModeSwitch` ve `ModeClosedNotice` bileşenleri ve kullanım yerleri SÖKÜLÜR (`activeModeOpen` dalı dahil). Form başlığının yanına hangi modun düzenlendiğini söyleyen mevcut-kalıp mod etiketi (builder kararı — ör. `modeAccent` renkli küçük pill).

- [ ] **Step 1: `resolveEditMode` failing testleri** — (aktif açık → aktif), (aktif kapalı + diğeri açık → diğeri), (ikisi kapalı → aktif), her iki mod yönünde.
- [ ] **Step 2: Koş, düşsün; modülü yaz; geçsin.**
- [ ] **Step 3: EditProfileForm sökümü** — segment, kapalı-mod ekranı, `editMode` state'i; prompts alan anahtarı (`friendsPrompts`/`prompts`, satır 2285-2290) `editMode`'dan okumaya devam eder.
- [ ] **Step 4: Doğrula** — `npx tsc --noEmit` yeni hata yok; `npx jest tests/features/profile` yeşil.
- [ ] **Step 5: Commit** — `feat(profile): editör segment'siz — aktif modun profili açılıyor`

### Task 7: Foto boru hattı moda bağlanıyor

**Files:**
- Modify: `src/features/profile/components/EditProfileForm.tsx` (~1267 grid kaynağı, ~1684-1720 kaydetme)
- Modify: `src/features/profile/screens/ProfileScreen.tsx` (~1663 `uploadPickedPhoto`, ~1736 tavan kontrolü, ~1782 `applyModerationFromResponse`, ~1968/2058 silme, görünürlük banner'ı/gizli kapı okumaları)
- Test: `tests/features/profile/modePhotoFields.test.ts` (genişletilir — çift liste yaması)

**Interfaces:**
- Consumes: Task 1 `modePhotoFields`/`modePhotosOf`, Task 6 `editMode`/`resolveEditMode`.
- Produces: Task 1 modülüne eklenir:
  ```ts
  /** photoId eşleşen kaydı HER İKİ listede günceller; isabet yoksa referans korunur. */
  export function patchPhotoInBothLists(profile: any, photoId: string, patch: (p: any) => any): any;
  ```

- [ ] **Step 1: `patchPhotoInBothLists` failing testleri** — aynı photoId iki listedeyken ikisi de yamalanır (Review Focus 5); tek listedeyken öbürüne dokunulmaz; isabet yoksa aynı referans döner.
- [ ] **Step 2: Koş, düşsün; yaz; geçsin.**
- [ ] **Step 3: EditProfileForm** — grid kaynağı `modePhotosOf(myProfile, editMode)`; kaydetmede `updates[fields.photoOrdersKey]` / `updates[fields.newMainPhotoIdKey]`; `originalMain` mod listesinden.
- [ ] **Step 4: ProfileScreen** — `uploadPickedPhoto` → `updateProfile({ [fields.newPhotosKey]: [file] })`; tavan kontrolü mod listesiyle; silme → `{ [fields.photoIdsToDeleteKey]: [...] }` + onay metni "bu moddan çıkar" (dosya öbür modda yaşıyorsa); `applyModerationFromResponse` → `patchPhotoInBothLists`; görünürlük banner'ı/gizli kapı `modePhotoFields(editMode).visibilityKey`den okur. Ekran hangi modu düzenliyorsa onu kullanır (Task 6'nın `resolveEditMode` çıktısı ProfileScreen'e de gerekiyorsa aynı modülden çağrılır).
- [ ] **Step 5: Doğrula** — `npx tsc --noEmit` yeni hata yok; `npx jest tests/features/profile tests/features/discover` yeşil.
- [ ] **Step 6: Commit** — `feat(profile): foto okuma/yazma yolları aktif moda bağlandı`

### Task 8: Uçtan uca doğrulama

- [ ] **Step 1: Tam suite** — `npx jest` → tümü yeşil (bilinen flake: PlusPage/BlockedUsersModal paralel koşuda; tek başına koşulup teyit edilir).
- [ ] **Step 2: `npx tsc --noEmit`** — hata sayısı başlangıçtaki 18'i (auth ekranları, önceden var) aşmıyor.
- [ ] **Step 3: Canlı doğrulama (cihaz/simülatör, backend yayında)** — (a) Friends açılışında "Flört fotoğraflarımı kullan" → Arkadaş profili aynı fotolarla açılır; (b) yeni-kare yolu → yalnız çekilenler Arkadaş'ta, Flört değişmez; **spec'in açık varsayımı burada sınanır: ilk kare ana oldu mu?** Olmadıysa: başarı yolunda `updateProfile({ FriendsNewMainPhotoId })` ile ana ataması eklenir (spec'teki ucuz düzeltme). (c) Editör Friends'te Arkadaş fotoğraflarını gösteriyor ve oraya yazıyor.
- [ ] **Step 4: Commit + memory güncelle** — `project_per_mode_photos` notuna "FE kurulum+editör İNDİ, canlı doğrulama sonucu" işlenir.
