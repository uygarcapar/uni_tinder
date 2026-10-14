# İki Modlu Yapı (Dating / Friends) — FRONTEND Planı

> **Durum:** Plan — onay bekliyor. Backend karşılığı: `~/UniversityTinder/two_mode_friends_dating_plan.md`.
> Kimlikler/loglar/yorumlar İngilizce. Uygulama metinleri `src/shared/i18n/translations/{en,tr}.ts`te
> (`locales/*.json` Expo izin metinleri — ORAYA DEĞİL).

## Context

Ürün iki modlu kampüs uygulamasına dönüşüyor (Bumble BFF modeli). Bu plan FE tarafını kapsar:
kayıtta mod adımı, profil düzenlemede mod anahtarı, Discover'da mod başlığı + seçici + yeşil tema,
akışta reply sökümü + kart aksiyonları + topic'ler + harita.

**Kullanıcı kararları (final):**
- Harita: **@rnmapbox/maps native SDK** (tam ekran pan/zoom); akıştaki önizleme statik görüntü kalır.
- Anonim postlar: **sadece beğeni** — reply sistemi istemciden komple sökülür.
- Akış kartı aksiyonları **Keşif'teki seçili modu** izler; uygun değilse diğerine düşer.
- Mod değişimi: Discover tepesinde ortada mod adı + chevron → seçici sheet; açılmamış mod satırı "Profili aç" CTA → mini kurulum.
- Fire Friends'te **yeşil** + farklı ad (öneri: "Spark" / TR "Kıvılcım" — onaya tabi). Dating'deki turuncu-kırmızı vurgular Friends'te yeşile döner.
- Alt sekmeler moda göre DEĞİŞMEZ.

**Backend bağımlılık özeti** (ayrıntı BE planında):
`mode` paramları (deck/like/superlike/note/undo/wholikedme), `availableModes`lı author-profile,
`POST /api/profile/modes/{mode}/open`, `GET /api/common/friendship-intents`, prompt kataloğunda `modes`,
`FriendsPrompts[i].*` + `FriendshipIntents` yazma alanları, `MatchNotification.mode`, universities ucunda `lat/lon/canonicalDomain`,
`/api/feed/me` içinde topic listesi. Eski sözleşme: `mode` gönderilmezse Dating.

---

## FE1 — Temel (S)

- **YENİ `src/features/discover/modeTheme.ts`**: `AppMode = "Dating" | "Friends"` tipi, `modeAccent(mode)`,
  `modeFireGradient(mode)`, `modeOutline(mode)`, mod başına Fire görünen adı (`t`-anahtarıyla).
- **`src/shared/theme/colors.ts`**: `friendsAccent = "#22C55E"` (⚠️ `success` #34D399 YENİDEN KULLANILMAZ —
  semantik token kimlik rengi olamaz) + `gradients.friendsHeart = ["#0fae57","#12c96a","#2bff8a"]`
  (swipeHeart'ın 3-duraklı şekli) — İKİ palete de. Mutable palet kuralı: renkler RENDER İÇİNDE okunur, modül seviyesinde değil.
- **YENİ `src/features/discover/modePrefs.ts`**: seçili mod MMKV'de kullanıcı bazlı
  (`feedPrefs.ts` kalıbı: `KEY_PREFIX + userId`, SCHEMA_VERSION'lı; şifreli redux'a DEĞİL).
- i18n: `discover.mode.*`, friends metin varyantları, Spark adı, `feed.topics.*` — `translations/{en,tr}.ts`.

## FE2 — Kayıt (L)

- **YENİ `RegisterStepModeScreen`** ("Uygulamayı ne için kullanıyorsun?" — Friends | Dating, tek seçim) —
  `RegisterStep12`den (boy) SONRA. Değişen dosyalar: `src/features/auth/registrationFlow.ts` (dizi + `STEP_NUMBER_OVERRIDES`),
  `RegisterStep12Screen.tsx:124` (navigate hedefi), `src/shared/types/navigation.ts` (`AuthStackParamList`),
  `src/navigation/AuthNavigator.tsx` (Stack.Screen). Seçim `authSlice.registrationForm.mode`a yazılır.
- **`RegisterStep10` (InterestedIn) mod adımının ARKASINA taşınır** ve yalnız Dating kayıtlarında gösterilir
  (Friends → ekran atlanır; sunucu `InterestedInFlags=7` basar; dating'i sonradan açarsa open akışında sorulur).
  Step9 navigate hedefi + dizi sırası + progress numaraları güncellenir.
- **`RegisterStep17` (prompt'lar)**: `usePrompts()` kataloğu seçili modun `modes` alanıyla filtrelenir (picker'a geçen gruplar).
- **`RegisterStep14` (niyet)**: dal — Dating: mevcut tek-seçim aynen; Friends: YENİ `FriendshipIntentPicker`
  (çoklu seçim, `GET /api/common/friendship-intents`, `useRelationshipIntents` kalıbında yeni `useFriendshipIntents` hook'u —
  `src/shared/queries/commonQueries.ts`).
- **Submit** (`profileSlice.ts` `registerAndComplete` :278-384): `Mode` + `FriendshipIntents` append;
  Mode=Friends iken `InterestedIn` GÖNDERİLMEZ. `put()` helper'ı boşları zaten atlıyor.

## FE3 — Discover: mod başlığı + seçici + tema (L)

- **Mod başlığı**: `DiscoverScreen.tsx:3001-3076` yüzen header'ın BOŞ ORTASI (eski WaveFillLogo yuvası —
  `:3006-3008` yorumu). Dokunulabilir `ModeTitle` (ad + chevron.down); orta `box-none` — başlık absolute-centered,
  iki cam butonun 16pt insets'ini kaydırmaz.
- **YENİ `ModeSelectorSheet`** (`src/features/discover/components/`): iki satır (Friends/Dating);
  açılmamış mod satırı "Profili aç" CTA'sına dönüşür → **YENİ `ModeSetupFlow`** modalı:
  niyet seçici (friends: çoklu; dating: InterestedIn + RelationshipIntent) + mevcut `PromptsEditor`
  (`src/shared/components/PromptsEditor.tsx`, MAX 3, `flush()` handle) → `POST /api/profile/modes/{mode}/open`.
- **Veri iplikleme**: `swipeService.ts` / `swipeQueries.ts` / `swipeKeys.ts` her çağrı + her query key'de `mode`
  (key'de mod = temiz cache ayrımı, elle reset yok); `deckProgress.ts` mod başına; WhoLikedMe sorgusu mode'lu.
  Mod geçişi **mevcut filtre-değişim deste yolunu** kullanır (taze kart yanda ısınır) — remount DEĞİL
  (commit-storm + beyazlık riski). İki saniyede üç geçiş → son geçiş kazanır, bayat istekler düşer.
- **Tema iplikleme** (`mode` prop + modeTheme getter'ları) — `gradients.swipeHeart`/`litPlus` tüketen Discover yüzeyleri:
  - `FireGlassButton.tsx` — `fireTint()` :192 → `modeFireGradient(mode)[0]`
  - `FireFlameCanvas.tsx` — LinearGradient :176 + hardcoded `OUTLINE = "#FFD79E"` :47 → `modeOutline(mode)` (`OUTLINE_FRIENDS = "#B9F5D0"`)
  - `FireBurnCanvas.tsx` :230/:256 · `FireHeart.tsx` :67/:114 · `flameBurn.ts` · `SwipeCard.tsx` kenarlıkları :1249/:1278 · `LikeCard.tsx`
  - Discover'daki `litPlus` dolgulu CTA'lar → `modeAccent(mode)`
  - `PurchaseSections.tsx` / `PremiumFlame.tsx` dating-markalı KALIR (satın almalar global) — bilinçli karar.
- **MatchModal**: `MatchNotification.mode` → `AppNavigator.tsx:1021-1035` handler `pendingMatch.mode`a yazar →
  `MatchModal.tsx` FlameCurtain'e mod geçer (yeşil perde + friends metni; "lit" başlığı/`match.subtitle` friends varyantı).
  ⚠️ Perde rengi HER ZAMAN payload'dan, ASLA anlık Discover modundan (eşleşme diğer moddayken/arka planda gelebilir).
  Alan yoksa Dating.
- **Chat mod rozeti** (S, kesilebilir): conversation DTO `modeFlags` → `MessagesScreen` satırı + `ChatScreen` başlığına
  küçük renk işareti (friends yeşil, dating mevcut kırmızı aile). Renk tek başına anlam taşımaz — `accessibilityLabel` + başlıkta ad.
- **Boş deste metinleri**: `emptyDeckCopy.ts` — moda özel başlık + "profili aç" CTA'lı yeni sebep kodu dalı;
  mesafe teklifi kuralı aynen kalır.
- Fire adı: Friends'te tüm görünür metinler i18n mod anahtarıyla — **"Spark" (karar kesin; TR'de de çevrilmeden).**
  Aynı consumable: `superLikesRemaining` sayacı, redeem akışı, `FirePurchaseModal` ortak — yalnız etiket + renk değişir.

## FE4 — Profil düzenleme mod anahtarı (M)

- **`EditProfileForm.tsx`**: scroll içeriğinin İLK ÇOCUĞU olarak segmented mod anahtarı
  (header dolu: X · başlık · ✓ — AppModal :857-981; içeriğe koymanın emsali ProfileScreen `centerSlot` PagerTabBar'ı).
- Geçiş şunları takaslar:
  - prompts `Controller` değeri — **iki ayrı RHF alanı** (`prompts` = dating, `friendsPrompts`), ikisi de save'de `flush()`lanır;
  - niyet bölümü (:2286) — `RelationshipIntent` tek-seçim ↔ `FriendshipIntentPicker` çoklu-seçim.
- Açılmamış mod sekmesi editör yerine "Profili aç" CTA'sı (ModeSetupFlow'a gider).
- Submit (`:1480 submit` + `profileService.updateProfile`): `Prompts[i].*` (dating) + YENİ `FriendsPrompts[i].*` +
  `FriendshipIntents` — `promptPayload.ts`e `appendFriendsPrompts` eşi (0-bazlı boşluksuz index kuralı aynı).
  `hydrateProfileForm.ts` `friendsPrompts` + `friendshipIntents` hidratlar.
- Prompt picker kataloğu aktif düzenleme moduna göre `modes` ile filtrelenir (`selectablePrompts`e mod paramı).

## FE5 — Reply sistemi sökümü (M — çoğu silme; satır numaraları doğrulandı)

| Dosya | İş |
|---|---|
| `FeedPostCard.tsx` | aksiyon satırı :383-477 reply pill'i + `ReplyButton` :487-555 kalkar; beğeni kalbi kalır |
| `feedPolicy.ts` | `replyActionFor` :41-65 + `replyGate` :145-160 kalkar |
| `FeedSkeletonList.tsx` | :13-15 `REPLY_PILL_*` importu + :126-135 `ReplyPillBar` kalkar |
| `FeedReplyComposerSheet.tsx` | dosya silinir (tek tüketici FeedScreen :1466-1476) |
| `FeedScreen.tsx` | reply handler'ları :792-900, replies pager sayfası :1186-1262, `LikerSwipeModal` replier dalı :1549-1559 |
| `feedEntry.ts` | `PAGES` → 2 sayfa (`feed`,`mine`); `FEED_PAGE_INDEX.replies` kalkar; `openFeed('replies')` çağıranları güncellenir |
| `feedQueries.ts` | `useCreateReply` / `useAcceptReply` / `useDismissReply` / `useReceivedReplies` / `useReceivedReplyCount` / `useFeedReplierProfile` |
| `feedService.ts` | :162-244 reply metotları (author-profile metodu KALIR — FE7 kullanıyor) |
| `LikesScreen.tsx` | 6. "feedReplies" sekmesi: :350-428, :778-783, :836-837, :955, :1659-1670, :1765-1779, :1896-1922, :2029-2043 |
| `swipeSlice.ts` | `pendingFeedReplyCount` + reducer'ları (:37-125 ilgili parçalar) |
| `TabNavigator.tsx` | rozet toplamı :133-141 → yalnız `whoLikedMeCount` |
| `realtimeService.ts` | `'FeedReplyReceived'` :175 → **no-op handler BIRAK** (flag yarışında bilinmeyen hub olayı fırlatmasın) |
| `AppNavigator.tsx` | hub handler :1102-1114 → no-op; `routeFromNotification` `'FeedReply'` :1555-1560 → Notifications fallback |
| `notificationsService.ts` | :45/:61 tip + `FEED_NOTIFICATION_TYPES` |
| `NotificationsScreen.tsx` | :114 ikon haritası, :134 yönlendirme, :367 emit |
| i18n | `feed.reply.*` / `feed.received.*` / `likes.tabFeedReplies` kalkar; **sunucunun hâlâ bastığı `feed.codes.*` KALIR** (feedParity testi 28 key assert ediyor — test en son ayarlanır) |
| `FeedQuotaSheet.tsx` | tek tüketicisi reply yoluydu → post kotasına repurpose veya sil |
| Testler | `FeedPostCard.test.tsx` :244-310 reply describe'ı; `feedPolicy.test.ts` :80-142 |

Anonim post: header Pressable zaten `disabled={post.isAnonymous}` — değişmez; anonim kart beğeni-only.

## FE6 — Feed topic'leri (M)

- **`FeedComposerSheet.tsx`**: zorunlu topic çip satırı. ⚠️ Çip bileşeni **MODÜL SEVİYESİNDE** —
  render içinde tanımlanan bileşen input'u remount edip klavyeyi düşürür (dosya başlığındaki kural).
- **`FeedFilterSheet.tsx`**: yeni ilk `Section` — "tümü | topic" tek-seçim radio (mevcut `OptionRow` kalıbı; `TOPICS` modül sabiti).
  `FeedFilterValue` + `DEFAULTS` genişler; Section zorunlu `description` ister → tr+en iki yeni anahtar.
- **`FeedScreen.tsx`**: `filterPills` :1017-1058'e 4. `{key:"topic"}` pill'i + `handlePillPress` :1060-1068'e dal
  (topic kendi mini sheet'ini açar ya da filtre sheet'ine gider — pill rozetli).
- `feedTypes.ts` `FeedListParams.topic` + `FeedPostDto.topic`; `feedKeys.ts` `posts()` key'ine topic;
  `feedService.ts` `getPosts` query param (boşsa HİÇ gönderme — `university` emsali :99);
  **`feedPrefs.ts` SCHEMA_VERSION 1→2** — v1→v2 migrator yaz (topic=null default), prefs'i sıfırlama; `activeFilterCount`a topic.
- `FeedPostCard.tsx`: başlıkta topic çipi. Topic etiketleri `/api/feed/me`nin `topics` listesinden
  (`resolveLocalized` ile; istemci fallback'i i18n'de).
- Testler: `feedPrefs.test.ts` migration vakası, `feedPagination.test.ts` key değişimi.

## FE7 — Akış kartı aksiyonları (M)

- `FeedPostCard` header Pressable (:206-299, anonimde disabled KALIR) → artık `PreviewModal` yerine
  **`LikerSwipeModal` `onDecide` kalıbı** (:60-81 sözleşmesi — onDecide verilince discover ucu atlanır; sonuç yönetimi merkezî).
- Mod seçimi: author-profile yanıtındaki `availableModes` → Keşif'te seçili mod listedeyse O, değilse listedeki diğeri,
  liste boşsa aksiyonsuz `PreviewModal` (bugünkü davranış).
- Her aksiyon çağrısı (`like`/`superlike`/`note`) açık `mode` taşır; kapı hatasında (mod bu arada kapanmış — TOCTOU)
  toast + görüntüleme moduna düş, retry döngüsü YOK.
- Kart teması (Fire butonu, vurgular) seçilen aksiyonun moduna göre `modeTheme`den.

## FE8 — Harita şeridi + tam ekran (L; en kesilebilir)

- **Statik şerit** — YENİ `FeedMapStrip.tsx`: `FeedScreen` listHeader'da `filterRow`dan sonra
  (:1131-1161 / :1303-1308; `PILL_ROW_GAP = 21` artık haritanın üstündeki boşluk olur).
  `buildMapboxStaticUrl` **RENDER İÇİNDE** çağrılır (tema-reaktif — `shared/constants/mapbox.ts:47-51` kuralı);
  merkez = seçili üniversitenin `lat/lon`u (genişletilmiş `/api/common/universities`; `useUniversities` DTO'suna alanlar eklenir);
  `expo-image` memory-disk + `recyclingKey` (SwipeCard harita kalıbı :3455-3521); Pressable sarmalı → tam ekran.
- **Tam ekran** — ⚠️ **YENİ native bağımlılık `@rnmapbox/maps`**: `app.json` config plugin + **dev-client/EAS yeniden build.
  ERKEN planla — mevcut dev client'ları geçersiz kılar ve kendi testini bloklar.**
  YENİ `UniversityMapScreen` (modal route, `RootStackParamList`e eklenir): `styleURL` = MEVCUT Studio stilleri
  (`MAPBOX_STYLE_DARK/LIGHT`, koyu/açık tema); marker'lar `?distinct=true` universities listesinden;
  marker dokunuşu → onay sheet'i → akış kampüsü değişir — Plus kapısı `FeedUniversitySheet` ile AYNI
  (`gate === "paywall" → onPaywall`, sheet önce kapanır).
- Mapbox attribution sözleşmesi: `MAPBOX_ATTRIBUTION_URL` bağları Ayarlar'da duruyor (`SettingsScreen.tsx:1424-1460`) — korunur;
  statik URL cache'i için `MAPBOX_STYLE_VERSION` kuralı aynen.

---

## Bağımlılık sırası ve kesme listesi

**Sıra:** FE1 → FE2 ∥ FE3 (ikisi de FE1 ister; FE3 için BE'nin B5/B7 deploy'lu olması gerek) → FE4 → FE5 ∥ FE6 (bağımsız)
→ FE7 (BE B8 author ucu) → FE8 (BE B8 geo + native rebuild; FE1 sonrası tamamen paralel).

**Kesme sırası (takvim sıkışırsa):**
1. FE8 tam ekran harita — statik şerit kalır, dokunuş `FeedUniversitySheet`i açar
2. Chat mod rozetleri (FE3 içindeki S parçası)
3. Topic pill'i — composer çipleri + filtre bölümü kalır
4. WhoLikedMe mod filtresi — rozetli tek liste

## Riskler (FE'ye düşenler)

- **MatchModal renk yarışı** — perde rengi payload `mode`undan, asla `modePrefs`ten; alan yoksa Dating.
- **Mod geçişinde render churn** — filtre-değişim yolu kullanılır, remount değil (Fabric commit-storm geçmişi);
  `ModeTitle`/seçici cam kromun yakınında `opacity<1` veya kimliksel olmayan transform taşıyan ata altına KONMAZ
  (GlassView sessiz ölüm kuralı).
- **feedPrefs şema göçü** — migrator yazılır; sürüm uyuşmazlığında sessiz default'a düşme davranışı korunur.
- **Reply sökümünde hub yarışı** — `FeedReplyReceived` no-op handler bırakılır.
- **@rnmapbox/maps rebuild** — EAS/dev-client build'i sprint başında alınır.

## Ürün girdileri — durum (2026-10-15)
1. ✅ Fire'ın Friends adı ONAYLANDI: **"Spark"** — **AYNI consumable.** Bakiye/kota/redeem/satın alma SuperLike'ınki;
   değişen YALNIZ görünen ad (i18n mod anahtarı; "Fire" gibi TR'de de çevrilmeden "Spark") + yeşil tema.
   `FirePurchaseModal` Friends'ten açılırsa AYNI modal ve AYNI bakiye — modal dating-markalı kalır (bilinçli, satın alma global).
2. ✅ FriendshipIntent listesi ONAYLANDI: FunHangout, StudyBuddy, Roommate, Events, Sports.
3. ✅ FeedTopic listesi ONAYLANDI: General, Roommate, Event, StudyGroup, LostAndFound, Advice, Social.
   **Topic composer'da ZORUNLU** — seçilmeden gönder butonu aktifleşmez (FE6 zaten böyle; artık kesin karar).
4. ⏳ Friends yeşili cihazda doğrulanır (`#22C55E` öneri; litPlus kırmızısıyla yan yana bakılır).

## Doğrulama
1. `npx tsc --noEmit` + jest (⚠️ node 24 — better-sqlite3 ABI; PATH'e node@24) — feed/mod testleri yeşil.
2. **Cihaz (yeniden build sonrası), iki test hesabı:**
   - Friends kayıt: mod adımı → friends intent çoklu seçim → friends prompt → InterestedIn SORULMAZ → kayıt biter.
   - Dating kayıt: eski akış birebir.
   - Discover: başlıkta mod adı; dokun → seçici; açılmamış mod → "Profili aç" mini akışı; Friends deck yalnız aynı-kategori;
     Fire butonu/perde Friends'te YEŞİL + "Spark"; karşılıklı friends like → yeşil MatchModal; çapraz-mod like eşleşme ÜRETMEZ.
   - Profil düzenleme: mod anahtarı iki prompt setini bağımsız düzenler; dating kaydet friends prompt'larını SİLMEZ.
   - Akış: composer topic zorunlu; topic filtresi/pill; anonim post beğeni-only, profil açılmaz;
     normal post → kart → seçili modda like/note/Spark; kapı hatası toast'a düşer.
   - Harita: şeritte seçili kampüs ortada; tam ekranda pan + marker'lar; marker → kampüs değişimi Plus kapılı;
     koyu/açık temada iki stil de doğru.
3. Reply sökümü sonrası: Beğeniler 5 sekme, rozet yalnız `whoLikedMeCount`, FeedReply push'u Notifications'a düşer, hub olayı sessiz.
