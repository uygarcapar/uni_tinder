import type { AccountBlockPayload } from "@/shared/utils/accountBlock";
import type { RegistrationStepRoute } from "@/features/auth/registrationFlow";

// ─── Auth / User ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName?: string;
  isMailVerified: boolean;
  isProfileCreated: boolean;
  isKvkkAccepted?: boolean;
  profileImageUrl?: string;
}

export interface RegistrationForm {
  firstName: string;
  gender: string;
  dateOfBirth: Date | null;
  password: string;
  confirmPassword: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  needsVerification: boolean;
  pendingVerificationEmail: string | null;
  kvkkVersion: string | null;
  loading: boolean;
  error: string | null;
  registrationEmail: string | null;
  emailVerifiedToken: string | null;
  registrationForm: RegistrationForm;
  /**
   * Kayıt sihirbazında en son bulunulan ekranın rota adı ("RegisterStep13").
   * Persist edilir; soğuk açılışta akış baştan değil buradan devam eder.
   * (bkz. features/auth/registrationFlow.ts)
   */
  registrationStep: RegistrationStepRoute | null;
  /** Ban/askı/silme yaptırımı — doluysa kapatılamaz AccountBlockedScreen açılır. */
  accountBlock: AccountBlockPayload | null;
}

// ─── Profile ───────────────────────────────────────────────────────────────────

/**
 * Kullanıcının kendi prompt cevabı — düzenleme ve gönderim şekli.
 *
 * `promptKey` katalogdaki `enumName` (PascalCase string). Gönderimde indeksli
 * multipart'a çevriliyor: `Prompts[0].PromptKey` / `Prompts[0].Answer`.
 */
export interface ProfilePromptAnswer {
  promptKey: string;
  answer: string;
}

/**
 * Kartta çizilen prompt — soru metni SUNUCUDA çözülmüş hâlde geliyor.
 *
 * `promptDisplay` İZLEYİCİNİN dilinde (diğer `*Display` alanlarıyla aynı kural),
 * `answer` ise HER ZAMAN ham: profil sahibinin yazdığı dil ve noktalamayla.
 * Cevabı çevirmeye/normalize etmeye çalışma.
 *
 * `promptDisplay` gelmezse (pasife alınmış prompt, eski sürüm sunucu) katalogdan
 * `findPrompt` ile çözülüyor; o da bulamazsa bölüm çizilmiyor.
 */
export interface ProfilePromptCard {
  promptKey: string;
  promptDisplay?: string;
  answer: string;
}

export interface ProfileState {
  yearOfStudy: string;
  department: number | null;
  // city/district YOK: backend bunları latitude/longitude'dan türetiyor,
  // onboarding payload'ı artık sadece koordinat taşıyor.
  latitude: number | null;
  longitude: number | null;
  ageRangeMin: number;
  ageRangeMax: number;
  height: string;
  /**
   * Kayıt akışında toplanan prompt cevapları (en az 1, en fazla 3).
   * Sıra korunuyor: dizideki index = kartta çizilme sırası = backend `DisplayOrder`.
   */
  prompts: ProfilePromptAnswer[];
  /**
   * @deprecated Bio üründen kaldırıldı, yerini `prompts` aldı. Alan yalnızca
   * geçiş fazı için duruyor: kayıt akışı artık HİÇ doldurmuyor (boş string
   * kalıyor ve `put()` boş değerleri multipart'a eklemiyor). Backend Faz 4'te
   * kolonu düşürünce bu alan da silinecek.
   */
  bio: string;
  interestedIn: number[];
  hobbies: string[];
  smokingStatus: string | null;
  zodiacSign: string | null;
  relationshipIntent: string | null;
  // Alkol + dini görüş — kayıt akışında RegisterStep16'da toplanıyor
  // (fotoğraflardan bir önceki adım). Diğer yaşam tarzı alanları gibi
  // opsiyonel: atlanırsa null kalır ve payload'a hiç eklenmez.
  alcoholUsage: string | null;
  religiousView: string | null;
  photos: string[];
  mainPhotoIndex: number;
  loading: boolean;
  error: string | null;
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface ReactionDto {
  emoji: string;
  userId: string;
  reactedAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType?: number;
  sentAt: string;
  readAt?: string | null;
  deliveredAt?: string | null;
  clientMessageId?: string;
  reactions?: ReactionDto[];
  isSystemMessage?: boolean;
  localizationKey?: string;
  deletedAt?: string | null;
  deletedForEveryone?: boolean;
  mediaUrl?: string | null;
  replyToMessageId?: string | null;
  _pending?: boolean;
  _failed?: boolean;
  _selfUserId?: string;
}

export interface ConversationListItemDto {
  conversationId: string;
  matchId?: string;
  partnerUserId: string;
  partnerDisplayName: string;
  partnerProfileImageUrl?: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  lastMessageContentType?: number;
  unreadCount: number;
  isActive: boolean;
  partnerIsOnline: boolean;
  /**
   * Unmatch sonrası geri alma penceresinin bitişi. `null` = geri alma YOK
   * (rematch limiti dolmuş, çift engellenmiş ya da hiç mesajlaşılmamış) —
   * bu durumda "geri al" gösterilmez, restore çağrısı reddedilir.
   */
  restorableUntil?: string | null;
}

export interface MessageBucket {
  messages: MessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  /**
   * Rematch sonrası eski sohbetin gizli mesajları var. Liste tepesindeki
   * "eski sohbeti göster" kapısını besler; reveal edilince (ya da karşı taraf
   * açınca) false'a döner.
   */
  hasHiddenHistory?: boolean;
}

export interface TypingEntry {
  [userId: string]: number;
}

export interface PresenceEntry {
  isOnline: boolean;
  lastSeen: string | null;
}

// Kural (2026-08-02): taraflardan EN AZ BİRİ aktif premium ise sohbet sınırsız.
// Kanonik bayrak `isUnlimited`; `bothPremium`/`requiresUnlock` backend'de
// deprecated (aynı değerle doldurulmaya devam ediyor) — normalizeQuota bunları
// yeni alanlar gelmediğinde fallback olarak okur, bkz. chatSlice.
export interface ChatQuotaStatus {
  /** Taraflardan biri aktif premium mi. */
  hasPremiumParticipant: boolean;
  /** Kanonik: sohbet sınırsız mı (premium taraf VEYA manuel unlock). */
  isUnlimited: boolean;
  /** Legacy/destek grant'i ile açılmış sohbet. */
  isUnlocked: boolean;
  messageCount: number;
  freeMessageLimit: number;
  remainingMessages: number | null;
  /** Cap doldu — Premium modalı açılmalı (consumable satışı YOK). */
  requiresPremium: boolean;
}

// Fetch metadata quota içeriğinden ayrı tutuluyor: _fetchedAt: Date.now()
// spread'i her .fulfilled'de quotaByConv[id] referansını değiştiriyordu,
// downstream cascade yaratıyordu. Meta ayrı map'te → quotaByConv[id]
// referansı sadece anlamlı içerik değişiminde güncellenir.
export interface ChatQuotaMeta {
  fetchedAt: number;
  inFlight: boolean;
}

export interface ChatState {
  conversations: ConversationListItemDto[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  /** Son başarılı fetchConversations zamanı — staleness guard için (bkz. chatSlice). */
  _conversationsFetchedAt?: number;
  messagesByConv: Record<string, MessageBucket>;
  typingByConv: Record<string, TypingEntry>;
  presenceByUser: Record<string, PresenceEntry>;
  unreadTotal: number;
  activeConversationId: string | null;
  quotaByConv: Record<string, ChatQuotaStatus>;
  quotaMetaByConv: Record<string, ChatQuotaMeta>;
}

// ─── Swipe ─────────────────────────────────────────────────────────────────────

// Backend (DiscoveryService) tek string sözlüğüyle döner. Frontend dictionary
// (src/features/discover/responseCodes.ts) bu sabitlere göre metin/aksiyon map'ler.
// Bilinmeyen değer → response message fallback.
export type EmptyReason =
  | "None"
  | "NoCandidatesInRadius"
  | "AllCandidatesSeen"
  | "FiltersTooStrict"
  | "ProfileIncomplete"
  | "AccountRestricted"
  | "PoolWarming"
  | "SwipeLimitReached";

// Aile prefiksleri: UT-1xxx Auth · UT-2xxx Profil/Match · UT-3xxx Limit ·
// UT-4xxx Konum · UT-5xxx Sistem · UT-6xxx Discovery.
export type ResponseCode =
  | "UT-6001" // NoCandidatesInRadius
  | "UT-6002" // AllCandidatesSeen
  | "UT-6003" // FiltersTooStrict
  | "UT-6004" // ProfileIncomplete
  | "UT-6005" // AccountRestricted
  | "UT-6006" // PoolWarming
  | "UT-3001" // SwipeLimitReached
  | "UT-6101" // SuperLike/Redeem — webhook henüz inmedi (GEÇİCİ, tek retry'lık durum)
  | "UT-6102" // SuperLike/Redeem — ürün backend map'inde tanımlı değil (KALICI)
  | "UT-6103" // SuperLike/Redeem — transaction başka hesaba ait (KALICI)
  // Recovery/Redeem — UT-61xx'in birebir aynısı, AYRI aile. Backend çakışmayı
  // testle koruyor: iki ürünün webhook'u aynı boruyu kullandığı için hangi
  // paketin beklendiği ancak koddan ayırt edilebiliyor.
  | "UT-6201" // Recovery/Redeem — webhook henüz inmedi (GEÇİCİ)
  | "UT-6202" // Recovery/Redeem — ürün tanımlı değil (KALICI)
  | "UT-6203" // Recovery/Redeem — transaction başka hesaba ait (KALICI)
  // Not (yorumlu beğeni) — UT-64xx. UT-63xx İSTENMİŞTİ ama o aile 2026-08-25'te
  // foto moderasyonuna verilmişti; backend not ailesini 2026-08-26'da UT-64xx'e
  // taşıdı (`9874f4d`). 640x gönderim, 641x redeem.
  | "UT-6401" // Note — bakiye yok (402, satın alma sheet'i açılır)
  | "UT-6402" // Note — yorum boş ya da sınırı aşıyor
  | "UT-6403" // Note — hedef geçersiz (foto index'i / promptKey)
  | "UT-6404" // Note — bu kullanıcıya zaten swipe atılmış (kredi HARCANMAZ)
  | "UT-6405" // Note — hedef kullanıcı erişilemez (kredi HARCANMAZ)
  | "UT-6406" // Note — yorum moderasyondan geçmedi
  | "UT-6407" // Note — suistimal freni, 429 (kredi HARCANMAZ)
  | "UT-6411" // Note/Redeem — webhook henüz inmedi (GEÇİCİ)
  | "UT-6412" // Note/Redeem — ürün tanımlı değil (KALICI)
  | "UT-6413" // Note/Redeem — transaction başka hesaba ait (KALICI)
  | (string & {}); // forward-compat: bilinmeyen kodlar string olarak geçer

export type PaywallType =
  | "SWIPE_LIMIT"
  | "SUPER_LIKE_LIMIT"
  | "UNDO_LIMIT"
  | "MISSED_MATCH_RECOVERY_LIMIT"
  | "PREMIUM_FILTERS"
  | "CHAT_QUOTA_EXHAUSTED";

/**
 * Kart üzerinde ortak nokta rozeti. `kindName` dil değişse de sabit kalan
 * anahtar (ikon eşlemesi buna bakar); `label` sunucuda aktif dile göre
 * ÇÖZÜLMÜŞ gelir, istemcide tekrar çevrilmez.
 */
export interface ThingInCommon {
  kind?: string;
  kindName?: string;
  label?: string;
}

/** Hobi ya düz etiket ya da `{ enumName, name }` çifti olarak gelir. */
export type ProfileHobby = string | { enumName?: string; name?: string };

/**
 * Backend ProfileCardDto (GetPotentialMatches → profiles[]).
 *
 * `*Display` alanları backend tarafından KULLANICININ DİLİNE göre çözülmüş
 * düz string'lerdir — `/api/common/*` enum'larındaki `{tr,en}` sözlüğüyle
 * karıştırma, kartta resolveLocalized'a ihtiyaç yok.
 */
export interface PotentialMatch {
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  age?: number;
  bio?: string;
  photos?: string[];
  distance?: number;
  isPremium?: boolean;

  // Üniversite — `showUniversity` false ise kartta hiç gösterilmez.
  universityName?: string;
  showUniversity?: boolean;
  department?: string;
  departmentDisplay?: string;
  /**
   * Sınıf — SAYI (0 = hazırlık). Eskiden `string?` tanımlıydı ama kart
   * `t('profile.card.grade', { year })` ile sayı gibi kullanıyor.
   */
  yearOfStudy?: number;
  yearOfStudyDisplay?: string;

  // Enum tabanlı alanlar: `*Display` gösterim, çıplak ad ikon eşlemesi için.
  // `usagePurpose` KALDIRILDI: alan üründen çıktı, response'ta artık dönmüyor.
  relationshipIntent?: string;
  relationshipIntentDisplay?: string;
  smokingStatusDisplay?: string;
  zodiacSignDisplay?: string;
  /**
   * Alkol tercihi — kartın yaşam tarzı pill'lerinde gösteriliyor. Keşif
   * filtresinin (`alcoholUsages`) karşılığı: filtre eleme yapıyorsa kullanıcı
   * bunu kartta da görebilmeli. Alan opsiyonel — eski sürüm backend'de
   * gelmezse pill hiç çizilmiyor.
   */
  alcoholUsage?: string;
  alcoholUsageDisplay?: string;
  /**
   * Boy — CM cinsinden SAYI (backend `Height`, profil tarafında 140–220
   * doğrulamalı). Kartın yaşam tarzı pill'lerinde gösteriliyor: keşif
   * filtresinin (`heightMin`/`heightMax`) karşılığı — filtre bu alana göre
   * eleme yapıyorsa kullanıcı değeri kartta da görebilmeli.
   *
   * `*Display` kardeşi YOK: birim her dilde "cm", metin istemcide kuruluyor
   * (`profile.card.heightCm`). Alan opsiyonel — göndermeyen sürümde pill hiç
   * çizilmez (bkz. SwipeCard heightLabel).
   */
  height?: number | null;
  /**
   * Evcil hayvan — üç alan birlikte geliyor ve HEPSİ opsiyonel:
   * `hasPets` legacy 3 durumlu bool (var/yok/belirtmemiş), `pets` spesifik
   * PetType enum listesi (`["Dog","Cat"]`), `petsDisplay` onun request diline
   * göre lokalize karşılığı (`["Köpek","Kedi"]`). Kartta GÖSTERİLEN
   * `petsDisplay`; `pets` yalnız ikon eşlemesi için.
   *
   * `hasPets = true` ama `pets` boş olan profiller var (eski kayıtlar + yalnız
   * `hasPets` yazan tercih akışı, ayrıca seed profiller) — hangi hayvan olduğu
   * bilinmiyor, backfill edilemiyor. O yüzden legacy alan silinmedi: spesifik
   * liste boşsa kart "var/yok" pill'ine düşüyor.
   */
  hasPets?: boolean | null;
  pets?: string[];
  petsDisplay?: string[];

  hobbies?: ProfileHobby[];
  /** Ortak nokta YOKSA backend boş dizi değil `null` gönderir. */
  thingsInCommon?: ThingInCommon[] | null;

  cityDisplay?: string;
  districtDisplay?: string;

  /**
   * Bu kullanıcı beni beğenmiş mi. Free üyede normal beğeni için HER ZAMAN
   * `false` döner (yalnız karşı taraf SuperLike attıysa gerçek değer gelir);
   * premium'da gerçek değer.
   */
  hasLikedMe?: boolean;
  likedMeAt?: string | null;

  /**
   * Hesap son 7 gün içinde açıldı (backend `UserProfile.CreatedAt`, kalıcı
   * kolon). Kartta ismin sağındaki "Yeni" rozeti.
   */
  isNewMember?: boolean;
  /**
   * Son 24 SAAT içinde aktifti — canlı presence VEYA `lastActiveAt` (OR'lanmış).
   *
   * "ŞU ANDA ONLINE" DEĞİLDİR: 24 saatlik penceredir, o yüzden arayüzde
   * "Çevrimiçi" dili kullanılmaz, "Bugün aktif" yazılır. Anlık online bilgisi
   * yalnız sohbette var (`partnerIsOnline` + hub event'i).
   *
   * `false` "kesin pasif" DEMEK DEĞİL: Redis/DB okunamadığında da false döner
   * (deste yine normal gelir). Rozetin yokluğunu negatif bilgi olarak sunma.
   */
  isOnlineToday?: boolean;
  /** @deprecated `isNewMember` ile aynı değer; backend ileride kaldıracak. */
  isNewAccount?: boolean;
}

// Backend PaginatedProfilesDto (GetPotentialMatches result alanı).
// `code`/`action` (zarftaki) ve `emptyReason*` (result'taki) frontend code handler
// için canonical alanlar. Backend boş dönerken sessiz değil — neden taşır.
export interface PotentialMatchesResult {
  profiles: PotentialMatch[];
  /**
   * Backend alanı göndermezse `null`. Sayfalama OTORİTESİ bu değil —
   * usePotentialMatches cursor'ı `lastPageParam`'dan türetiyor (bkz. oradaki
   * not). Eskiden default `1` idi; alan hiç gelmediğinde her sayfa "1" gibi
   * görünüyor ve okuyanı yanıltıyordu.
   */
  currentPage: number | null;
  pageSize: number;
  totalProfiles: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  remainingSwipes: number;
  showPaywall: boolean;
  paywallType: PaywallType | null;
  paywallMessage: string | null;
  isPremium: boolean;
  // NOT: `wasRadiusExpanded` / `appliedRadiusKm` BİLEREK YOK. Backend hâlâ
  // döndürüyor ama 2026-08-17 sözleşmesinden beri ölü alanlar (her zaman
  // false / null) ve sonraki major'da silinecekler. Sessiz yarıçap
  // genişletmesi kullanıcıya gösterilmiyor — yeniden bağlama.
  emptyReason: EmptyReason;
  emptyReasonCode: ResponseCode | null;
  emptyReasonMessage: string | null;
  emptyReasonAction: string | null;
}

export interface SwipeStats {
  remainingSwipes: number | null;
  /** Tier kotası + satın alınan kredi TOPLAMI. Backend tabanı 0 garanti eder. */
  superLikesRemaining: number | null;
  /** Satın alınmış, süresiz kredi. Haftalık reset'te sıfırlanmaz. */
  purchasedSuperLikes: number | null;
  /** Yalnız tier kotasından kalan (krediyi kapsamaz). */
  quotaSuperLikesRemaining: number | null;
  swipeCountResetAt: string | null;
  superLikeCountResetAt: string | null;
  premiumExpiresAt: string | null;
  isPremium: boolean;
  totalSwipesToday: number;
  likesToday: number;
  passesToday: number;
  superLikesToday: number;
  matchesToday: number;
  remainingUndos: number | null;
  undoCountResetAt: string | null;
  /**
   * Kaçırılan eşleşme kurtarma bakiyesi — tier kotası + satın alınan kredi
   * TOPLAMI (SuperLike'ın `superLikesRemaining`i ile aynı desen).
   *
   * 2026-08-22'de GÜNLÜK olmaktan çıktı: free'de kota 0 (yalnız satın alınan
   * kredi), premium'da tier başına 1/2/5 ve abonelik döngüsüyle (7/30/365 gün)
   * yenileniyor. Alan adı ve tipi korunuyor — güncellememiş istemciler doğru
   * toplamı okumaya devam ediyor.
   */
  remainingMissedMatchRecovery: number | null;
  /** Yalnız tier kotasından kalan (krediyi kapsamaz). */
  quotaRecoveryRemaining: number | null;
  /** Satın alınmış, SÜRESİZ kredi. Döngü yenilenmesinde sıfırlanmaz. */
  purchasedRecoveries: number | null;
  /**
   * Tier tavanı — free 0, premium 1/2/5. `-1` (sınırsız) ASLA dönmez.
   *
   * ⚠️ Bakiye tavanı DEĞİL: `remainingMissedMatchRecovery > bu değer` artık
   * NORMAL (satın alınan kredi, ya da yıllıktan aylığa düşen kullanıcının eski
   * kotası). Payda tek yerden çözülüyor — bkz. discover/recoveryQuota.ts.
   */
  dailyMissedMatchRecoveryLimit: number | null;
  /** Kaçırılan eşleşme penceresi (gün, backend config'i — varsayılan 30). */
  missedMatchLookbackDays: number | null;
  /** Döngünün en son başladığı an (GEÇMİŞ). İleri sayaç için değil. */
  missedMatchRecoveryResetAt: string | null;
  /**
   * Döngü bitişi. Free'de artık SENTİNEL (`9999-12-31`) — "asla yenilenmez";
   * quotaFormat.resolveResetSeconds sentinel'i UNLIMITED'a çeviriyor.
   */
  nextMissedMatchRecoveryResetAt: string | null;
  /**
   * Döngü bitişine kalan saniye. Free'de `-1` = UNLIMITED sentinel'i ("asla
   * yenilenmez"), premium'da gerçek geri sayım. Günlük kota kalktığı için üst
   * sınır artık 86400 DEĞİL — yıllık aboneye 365 güne kadar çıkabiliyor.
   */
  missedMatchRecoveryResetInSeconds: number | null;
  // Tavanlar (backend SwipeLimitsOptions). -1 = sınırsız, null = backend
  // henüz göndermiyor. Free'de weeklySuperLikeLimit lifetime kotayı ifade
  // eder — yenilenmez.
  dailySwipeLimit: number | null;
  /**
   * Tier kotasının REFERANS değeri — bakiye tavanı DEĞİL. `superLikesRemaining`
   * bunu iki ayrı sebeple aşabilir:
   *   1. Satın alınan kredi kapsam dışı (3 kota + 12 kredi = 15 > 5),
   *   2. Premium ilk kez verilirken harcanmamış free lifetime hakkı kotanın
   *      ÜSTÜNE ekleniyor (2026-08-17 backend fix'i): tavan `5 + 1 = 6`, yani
   *      kredi hiç yokken bile `quotaSuperLikesRemaining` 6 > limit 5 olabilir.
   * Bu yüzden `weeklySuperLikeLimit + purchasedSuperLikes` de güvenli bir payda
   * değil; oran/progress gösterilecekse `Math.min(1, ...)` ile clamp'lenmeli,
   * "x/5" formatı kullanılmamalı (6/5 çıkar).
   */
  weeklySuperLikeLimit: number | null;
  dailyUndoLimit: number | null;
}

/**
 * Redux'ta kalan TEK swipe state'i: "beni beğenenler" rozeti. Deste ve kota
 * sayaçları React Query'de yaşıyor (bkz. swipeSlice.ts başındaki not) — bu
 * arayüz eskiden `SwipeStats`i de kapsıyordu, o alanlar hiçbir yerden
 * okunmadığı için kaldırıldı.
 */
export interface SwipeState {
  whoLikedMeCount: number;
  /**
   * Beni beğenmiş kullanıcıların id'leri (lowercase). Rozet sayısının aksine
   * KISMİ bir küme: yalnızca WhoLikedMe'nin çekilmiş sayfası + oturum içinde
   * gelen canlı IncomingLike'lar. "Bu kişi beni beğenmiş miydi?" sorusunu
   * Discover'da ağ turu atmadan cevaplamak için var (kaçırılan eşleşme).
   */
  whoLikedMeIds: string[];
}

// ─── Subscription ──────────────────────────────────────────────────────────────

// Backend SubscriptionStatusDto.status
export type SubscriptionStatusState =
  | "Active"
  | "Cancelled"
  | "Expired"
  | "BillingIssue"
  | "Paused";

export type SubscriptionProvider = "AppStore" | "PlayStore" | "RevenueCat";

// POST /api/subscription/sync → { synced, source, reason, status }
export type SyncSource = "db" | "rc_rest" | "none";
export type SyncReason =
  | "WEBHOOK_LANDED"
  | "RC_REST_CONFIRMED"
  | "NOT_FOUND_IN_RC"
  | "RC_REST_UNAVAILABLE"
  | "RC_REST_ERROR";

// Hub `SubscriptionChanged` → payload.reason. Liste UÇ DEĞİL: backend yeni
// gerekçe ekleyebiliyor, bu yüzden `(string & {})` ile açık bırakıldı — bilinmeyen
// bir `reason` event'i düşürmemeli, durum bilgisi her hâlükârda doğru.
export type SubscriptionChangeReason =
  | "admin_revoke"
  | "admin_grant"
  | "store_purchase"
  | "store_expired"
  | "sync_upgrade"
  | "sync_downgrade"
  | (string & Record<never, never>);

/**
 * Hub `SubscriptionChanged` payload'ı. Gövde `/api/subscription/status` ile
 * BİREBİR aynı (backend ikisini de aynı projeksiyondan üretiyor) + `reason`/`at`
 * — bu yüzden event'i almak ek bir `/status` turu gerektirmiyor.
 */
export interface SubscriptionChangedEvent {
  isActivelyPremium?: boolean;
  premiumExpiresAt?: string | null;
  productId?: string | null;
  status?: SubscriptionStatusState | null;
  autoRenewEnabled?: boolean;
  purchasedAt?: string | null;
  cancelledAt?: string | null;
  isTrial?: boolean;
  trialEndsAt?: string | null;
  gracePeriodEndsAt?: string | null;
  provider?: SubscriptionProvider | null;
  originalTransactionId?: string | null;
  latestTransactionId?: string | null;
  reason?: SubscriptionChangeReason | null;
  at?: string | null;
}

// `/status` ve `/sync`'in `status` alanının normalize edilmiş hâli.
export interface SubscriptionStatusSnapshot {
  /** Backend `isActivelyPremium` — TEK gating alanı. */
  isPremium: boolean;
  expiresAt: string | null;
  status: SubscriptionStatusState | null;
  productId: string | null;
  autoRenewEnabled: boolean;
  isTrial: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelledAt: string | null;
  provider: SubscriptionProvider | null;
}

export interface SubscriptionState extends SubscriptionStatusSnapshot {
  loading: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  /** Son `/sync` (veya `/reconcile`) çağrısının backend gerekçesi. */
  lastSyncReason: SyncReason | null;
  /** Satın alma alındı ama backend hâlâ premium görmüyor → "aktivasyon sürüyor". */
  syncPending: boolean;
  // Satın alma anında yazılan optimistic premium'un zaman damgası. Backend
  // henüz webhook'u görmediği için dönen `false` bu pencerede downgrade
  // sayılmaz. Bkz. subscriptionSlice OPTIMISTIC_PREMIUM_GRACE_MS.
  optimisticPremiumAt: number | null;
  /** Son hub `SubscriptionChanged` gerekçesi — teşhis raporunda görünür. */
  lastChangeReason: SubscriptionChangeReason | null;
  /** Son hub event'inin UYGULANDIĞI an (istemci saati) — teşhis. */
  lastEventAt: number | null;
  /** Uçuştaki `/status` isteğinin BAŞLADIĞI an — teşhis. */
  statusRequestAt: number | null;
  /**
   * Kanonik her yazımda (status / hub / sync / reconcile / optimistic) artan
   * sayaç. Uçuştaki bir cevabın bayat olup olmadığı SAATLE DEĞİL bununla
   * ölçülür: iki tur aynı milisaniyeye düşebiliyor ve `Date.now()`
   * karşılaştırması o durumda taze cevapları da eliyordu.
   */
  writeSeq: number;
  /**
   * `/status` isteği yola çıkarken görülen `writeSeq`. Cevap indiğinde sayaç
   * değişmişse arada kanonik bir yazım olmuş demektir → cevap bayat, uygulamak
   * o yazımı geri alır.
   */
  statusRequestSeq: number | null;
  /**
   * Backend kanonik bir cevap ÜRETTİĞİ ilk an (`/status`, hub event'i veya
   * `/sync` — hepsi `applyStatus`'tan geçer). `null` = "henüz bilmiyoruz",
   * `isPremium:false` ile AYNI ŞEY DEĞİL. Ekranlar premium'u bir profil
   * bayrağıyla OR'lamak zorunda kalmasın diye var: cevap geldikten sonra
   * kanonik kaynak yalnız bu slice'tır, o OR'lar downgrade'i yutuyordu.
   */
  statusResolvedAt: number | null;
}
