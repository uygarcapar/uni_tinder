/**
 * Lit Akışı — wire tipleri. MANTIK YOK (kararlar feedPolicy.ts'te).
 *
 * Sözleşme notları (frontend_feed_integration_guide.md §1.2):
 *  - Enum'lar STRING ve PascalCase ("Published", "Women", "AlreadyMatched").
 *    Sorgu parametrelerinde büyük/küçük harf fark etmiyor, o yüzden istemcinin
 *    kendi filtre değerleri lowercase ("new", "popular", "all") tutuluyor.
 *  - Zamanlar UTC + `Z` sonekli ISO 8601.
 *  - ⚠️ Id'ler STRING, number DEĞİL ("id": "123") — JS number hassasiyeti
 *    kaybolmasın diye backend bilerek string yolluyor. Path'e olduğu gibi koy,
 *    parseInt ETME.
 */

export type FeedSort = "new" | "popular" | "top";
export type FeedInterest = "all" | "mine";
export type FeedKind = "all" | "anonymous" | "normal";

/**
 * Gönderi konusu (hashtag) — KAPALI küme, kullanıcı serbest etiket yazamıyor.
 *
 * Değerler sunucunun enum'u (PascalCase string, wire sözleşmesi). Liste
 * `/api/feed/me` içinde `topics` olarak geliyor — ETİKETLERİ ORADAN OKU,
 * buradaki tip yalnız hangi değerlerin geçerli olduğunu söylüyor.
 *
 * ⚠️ İstemci kendi etiketini SABİT YAZMAZ: yeni bir konu eklendiğinde
 * uygulama sürümü çıkmadan görünmesi gerekiyor. i18n'deki karşılıklar yalnız
 * YEDEK (sunucu listesi gelmediğinde / tanımadığı bir anahtar için).
 */
export type FeedTopic =
  | "General"
  | "Roommate"
  | "Event"
  | "StudyGroup"
  | "LostAndFound"
  | "Advice"
  | "Social";

/** Filtrede "hepsi" seçeneği — sunucuya parametre GÖNDERİLMİYOR demek. */
export type FeedTopicFilter = FeedTopic | "all";

/** `/api/feed/me`den gelen konu kataloğu — etiket çift dilli. */
export interface FeedTopicOption {
  key: string;
  display?: { tr?: string; en?: string } | string;
}

/** Gönderi durumu. Akışta yalnız `Published` görünür; diğerleri Gönderilerim'de. */
export type FeedPostStatus =
  | "Published"
  | "PendingReview"
  | "SupportHold"
  | "HiddenByReports"
  | "Rejected"
  | "RemovedByAdmin";

/**
 * Yanıt butonunun durumu — SUNUCU karar veriyor.
 *
 * ⚠️ İstemci bunu YENİDEN HESAPLAMAZ. Özellikle: eşleştiğin kişinin AÇIK
 * gönderisinde `AlreadyMatched` + conversationId dönüyor, ama ANONİM
 * gönderisinde eşleşmiş olsan bile `Ok` dönüyor — "Sohbete git" gösterilseydi
 * anonim yazarın kimliği açığa çıkardı. Bu bilinçli bir ürün kararı.
 */
export type FeedReplyState =
  | "Ok"
  | "AlreadyMatched"
  | "OwnPost"
  | "AlreadyReplied"
  | "OtherUniversityRequiresPlus"
  | "PreferenceMismatch"
  | "Restricted";

/** Anonim gönderide yazar yerine gösterilen tek bilgi. */
export type FeedAuthorCategory = "Men" | "Women" | "NonBinary";

export type FeedAnonymousLockReason = "requiresPlus" | "restricted";

export type FeedReplySubmitStatus = "Pending" | "PendingReview" | "SupportHold";

/** Kart başlığındaki mini yazar bilgisi (tam profil ayrı uçtan). */
export interface FeedAuthorDto {
  userId: string;
  name: string;
  /** Kullanıcı yaşını gizlediyse null. */
  age: number | null;
  mainPhotoUrl: string | null;
  /** Kullanıcı üniversitesini gizlediyse null. */
  universityDisplay: string | null;
}

export interface FeedPostDto {
  id: string;
  /** Satır sonları KORUNUYOR (en fazla 2 boş satır, sunucuda normalize edilmiş). */
  body: string;
  createdAt: string;
  /** createdAt + 15 gün. Geçmişteyse "süresi doldu". */
  expiresAt: string;
  isAnonymous: boolean;
  /**
   * Gönderinin konusu. Eski sunucu alanı göndermiyorsa `undefined` —
   * kart çipi o zaman çizilmiyor (varsayılan "General" UYDURULMUYOR:
   * konusuz bir gönderiyi "Genel" diye etiketlemek yanlış bilgi olurdu).
   */
  topic?: FeedTopic;
  authorCategory: FeedAuthorCategory | null;
  /** Normal gönderide dolu; ANONİM gönderide HER ZAMAN null. */
  author: FeedAuthorDto | null;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  /** Yalnız "Gönderilerim"de anlamlı — akışta her zaman Published. */
  status: FeedPostStatus;
  /** Yalnız isMine = true iken dolu. */
  replyCount: number | null;
  reply: { state: FeedReplyState; conversationId: string | null };
}

export interface FeedQuotaDto {
  postsRemaining: number;
  repliesRemaining: number;
  postLimit: number;
  replyLimit: number;
  /** Bir sonraki 20:30 İstanbul. */
  nextResetAt: string | null;
}

export interface FeedMeDto {
  universityDomain: string;
  canPostAnonymously: boolean;
  anonymousLockReason: FeedAnonymousLockReason | null;
  /** Plus: başka kampüsü görebilir. */
  canPickUniversity: boolean;
  /** Plus: anonim/normal filtresi. */
  canUseKindFilter: boolean;
  /** Akış kısıtı bitişi; null = kısıt yok YA DA süresiz (isPermanent'a bak). */
  restrictedUntil: string | null;
  isPermanentlyRestricted: boolean;
  /**
   * Konu kataloğu — composer çipleri ve filtre bölümü buradan doluyor.
   * Alan gelmezse istemci kendi yedek listesine düşüyor (bkz. feedTopics.ts).
   */
  topics?: FeedTopicOption[];
  /** ⚠️ Karakter sınırlarını SABİT YAZMA — buradan oku. */
  postMaxLength: number;
  replyMaxLength: number;
  quota: FeedQuotaDto;
}

/**
 * `/posts` ve `/posts/mine` AYNI zarfı dönüyor.
 * `nextCursor` yalnız sort=new'de dolu; `page` yalnız popular/top ve mine'da.
 */
export interface FeedPostPageDto {
  items: FeedPostDto[];
  nextCursor: string | null;
  page: number | null;
  hasMore: boolean;
}

export interface FeedReceivedReplyDto {
  replyId: string;
  postId: string;
  /** Gönderinin ilk 80 karakteri. */
  postExcerpt: string;
  postIsAnonymous: boolean;
  comment: string;
  sentAt: string;
  /** Yanıt veren HER ZAMAN görünür — anonim olan gönderi sahibi, yanıtlayan değil. */
  replier: FeedAuthorDto;
}

export interface FeedReceivedRepliesPageDto {
  items: FeedReceivedReplyDto[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface FeedCreatePostResult {
  post: FeedPostDto;
  quota: FeedQuotaDto;
  /** true → kendine zarar sinyali; destek ekranı göster, gönderi yayına ALINMADI. */
  supportResources: boolean;
}

export interface FeedCreateReplyResult {
  replyId: string;
  status: FeedReplySubmitStatus;
  quota: FeedQuotaDto;
  supportResources: boolean;
}

export interface FeedAcceptReplyResult {
  matchId: string;
  conversationId: string;
  /** false → zaten eşleşmiştiniz; yeni modal yok, sohbete git. */
  isNewMatch: boolean;
}

export interface FeedLikeResult {
  likeCount: number;
  likedByMe: boolean;
}

/** Akış listesinin filtre imzası — query key'in de omurgası. */
export interface FeedListParams {
  /** null = kendi kampüsü (parametre hiç gönderilmez). */
  university: string | null;
  sort: FeedSort;
  interest: FeedInterest;
  kind: FeedKind;
  /** "all" = konu filtresi yok (parametre hiç gönderilmez). */
  topic: FeedTopicFilter;
}

/**
 * Yazar profili kartının aksiyon kapısı — `/api/feed/posts/{id}/author-profile`
 * yanıtına eklenen alan.
 *
 * Sunucu, İZLEYİCİYE GÖRE hangi modların karşılıklı uygun olduğunu söylüyor:
 * Dating için karşılıklı cinsiyet tercihi + iki tarafta da flört profilinin
 * açık olması; Friends için aynı cinsiyet + iki tarafta da arkadaş profilinin
 * açık olması.
 *
 * ⚠️ İSTEMCİ BUNU YENİDEN HESAPLAMIYOR. Karşı tarafın tercihlerini ve hangi
 * modlarının açık olduğunu bilmiyor (bilmemeli de — `EnabledMeetModes` hiçbir
 * DTO'da dönmüyor, dönerse kimin flört piyasasında olduğu kampüse sızar).
 *
 * Boş dizi = hiçbir modda aksiyon alınamaz → kart SALT OKUNUR açılıyor.
 * Alan HİÇ GELMEZSE (eski sunucu) kart yine salt okunur açılıyor: olmayan bir
 * hakkı varsaymak, kullanıcıya reddedilecek bir buton göstermek olurdu.
 */
export interface FeedAuthorProfileGate {
  availableModes?: string[];
}

export type FeedReportTargetType = "Post" | "Reply";

export interface FeedReportArgs {
  targetType: FeedReportTargetType;
  postId?: string | null;
  replyId?: string | null;
  reason: string;
  description?: string;
  alsoBlock: boolean;
}
