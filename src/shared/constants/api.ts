const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!envBaseUrl) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL is not set. Add it to your .env file."
  );
}

export const API_BASE_URL = envBaseUrl.replace(/\/+$/, "");

export const HUB_URL = `${API_BASE_URL}/hubs/match`;

export const API_ENDPOINTS = {
  SEND_VERIFICATION: "/api/auth/send-verification",
  VERIFY_EMAIL_REGISTRATION: "/api/auth/verify-email",
  CHECK_REGISTRATION_TOKEN: "/api/auth/check-registration-token",
  REGISTER_AND_COMPLETE: "/api/auth/register-and-complete",

  // ── Davet programı (referral) ───────────────────────────────────────────
  // Validate ANONİM: kayıt akışında kullanıcı henüz yok. Cevap bilerek FAKİR —
  // yalnız `{ valid: bool }`; davet edenin adı DÖNMÜYOR (kod deneyerek isim
  // toplamayı engellemek için). `api` instance'ı yerine ham fetch ile
  // çağrılıyor, bkz. features/auth/registrationToken.ts.
  REFERRAL_VALIDATE: "/api/referral/validate",
  // Özet kart + sheet'in tek kaynağı. Kullanıcının kodu YOKSA bu uç üretiyor
  // (lazy) — mevcut kullanıcılar için backfill job'ı bu yüzden yok.
  REFERRAL_ME: "/api/referral/me",
  // Uygulama içi "hakkın geldi" haberleri (davet ödülü, ön kayıt Lit Plus hediyesi):
  // her açılışta sorulur, gösterilince `seen` ile işaretlenir.
  NOTICES_UNSEEN: "/api/notices/unseen",
  NOTICES_SEEN: "/api/notices/seen",

  REGISTER: "/api/user/Register",
  LOGIN: "/api/user/Login",
  VERIFY_EMAIL: "/api/user/verifyemailwithcode",
  VERIFY_EMAIL_CODE: "/api/user/verifyemailwithcode",
  RESEND_VERIFICATION: "/api/user/resendverificationcode",
  GET_USER: "/api/user/GetUser",
  // KULLANMAYIN — isim değiştirmenin doğru yolu UpdateProfile (`DisplayName`).
  // Bu uç `Name`i yalnız Identity'deki FirstName'e yazıyor, KARTTA GÖRÜNEN isim
  // (UserProfile.DisplayName) değişmiyor. Gövdedeki `Email` ise 2026-08-22'den
  // beri sessizce YOK SAYILIYOR (400 dönmez) — e-posta artık kod onaylı iki
  // adımlı akışla değişiyor, bkz. REQUEST_EMAIL_CHANGE_CODE.
  // Yalnızca Gender / PhoneNumber gibi Identity alanları için düşünülebilir.
  UPDATE_USER: "/api/user/UpdateUser",
  // E-posta değiştirme İKİ ADIMLI — şifre değiştirmeyle aynı desen: önce bu uç
  // mevcut şifreyi doğrulayıp kodu YENİ adrese yollar (adresin sahipliğini
  // kanıtlayan tek şey bu), sonra ConfirmEmailChange kodu alır.
  //
  // ŞİFRE DEĞİŞTİRMEDEN AYRILDIĞI YER: başarıda YENİ TOKEN SETİ DÖNMEZ. Tüm
  // refresh token'lar iptal edilir ve çağıran taraf login'e gitmek zorundadır.
  REQUEST_EMAIL_CHANGE_CODE: "/api/user/RequestEmailChangeCode",
  CONFIRM_EMAIL_CHANGE: "/api/user/ConfirmEmailChange",
  // Şifre değiştirme İKİ ADIMLI: önce bu uç mevcut şifreyi doğrulayıp maile
  // 6 haneli onay kodu yollar, sonra ChangePassword kodu + yeni şifreyi alır.
  // Mevcut şifre 1. adımda doğrulandığı için yanlış şifreyle kod hiç gitmez.
  REQUEST_PASSWORD_CHANGE_CODE: "/api/user/RequestPasswordChangeCode",
  // DİKKAT: tek PUT ucu — diğer üç şifre ucu POST. Yanlış method 405 döner.
  CHANGE_PASSWORD: "/api/user/ChangePassword",
  FORGOT_PASSWORD: "/api/user/ForgotPassword",
  RESET_PASSWORD: "/api/user/ResetPasswordWithCode",
  // NOT: DELETE /api/user/DeleteUser deprecated (orphan kayıt bırakıyor).
  // Hesap silme için PRIVACY_DELETE_PERMANENT kullan — kalıcı ve anında.
  VALIDATE_TOKEN: "/api/user/validate-token",
  REFRESH_TOKEN: "/api/user/refresh-token",
  REVOKE_TOKEN: "/api/user/revoke-token",

  COMPLETE_PROFILE: "/api/profile/CompleteProfile",
  UPDATE_PROFILE: "/api/profile/UpdateProfile",
  GET_MY_PROFILE: "/api/profile/GetMyProfile",
  // GET_MY_PHOTOS (/api/photo/GetMyPhotos) KALDIRILDI: GetMyProfile'ın
  // photosList[]'i kanonik `moderation` bloğunu zaten taşıyor, ikinci istek
  // gereksizdi (2026-08-24 sözleşmesi §1.1).
  UPDATE_PREFERENCES: "/api/profile/update-preferences",
  // Bir modun (Dating/Friends) profilini AÇMA — niyet + prompt'lar tek atomik
  // istekte gidiyor ve sunucu `*ProfileOpenedAt`i damgalıyor. Yarım açılmış
  // profil diye bir durum YOK: niyet yazılıp prompt yazılmazsa kullanıcı o
  // modun destesinde görünür ama kartı boş olurdu.
  OPEN_PROFILE_MODE: (mode: string) =>
    `/api/profile/modes/${encodeURIComponent(mode.toLowerCase())}/open`,
  // App-open heartbeat: şehir/ilçe artık kullanıcı seçimi değil, backend'in bu
  // koordinattan türettiği sonuç. UpdateProfile'da konum alanları kaldırıldı.
  UPDATE_LOCATION: "/api/profile/location",

  // Selfie doğrulama — sunucunun seçtiği 2 hareket, hareket başına TEK kare.
  // Gövdesiz POST; yanıt { attemptId, challenges[2], expiresAt } (5 dk).
  // `attemptId` TEK KULLANIMLIK: submit başarısız olsa bile harcanır, tekrar
  // için yeni /start gerekir. Kota 5 istek/saat → her /start bir hak yakar,
  // yani kamera adımına GİRİLDİĞİNDE çağrılmalı, ekran açılışında değil.
  SELFIE_VERIFICATION_START: "/api/profile/selfie-verification/start",
  // multipart/form-data: attemptId + `frames` (challenge SIRASIYLA, tam 2 adet,
  // her biri ≤5 MB). Başarısız doğrulama HATA DEĞİL: 200 + isSuccess:true +
  // result.verified=false döner (bkz. selfieService.submitSelfieFrames).
  SELFIE_VERIFICATION_SUBMIT: "/api/profile/selfie-verification/submit",

  GET_PHOTO: "/api/photo/GetPhoto",
  // Reddedilen fotoğrafa itiraz → 202. Gövde opsiyonel: { note?: string } (≤500).
  // Günlük 5 istek limiti (`photo_appeal`).
  PHOTO_APPEAL: (photoId: string | number) =>
    `/api/photo/${encodeURIComponent(String(photoId))}/appeal`,

  GET_POTENTIAL_MATCHES: "/api/swipe/GetPotentialMatches",
  SWIPE_LIKE: "/api/swipe/Like",
  SWIPE_PASS: "/api/swipe/Pass",
  SWIPE_FIRE: "/api/swipe/SuperLike",
  // Consumable fire paketinin krediye çevrilmesi. Diğer swipe endpoint'leri
  // hep 200 + ResponseDto dönerken bu action GERÇEK HTTP status kullanıyor:
  // 402 = RC webhook'u henüz inmedi (retry), 400 = kalıcı hata.
  SWIPE_FIRE_REDEEM: "/api/swipe/SuperLike/Redeem",
  // Not = kartın BELİRLİ bir içeriğine (foto / prompt) yazılan yorumla birlikte
  // gönderilen beğeni. Swipe kaydı olarak LIKE sayılır (karşılıklıysa eşleşme),
  // ama kotası günlük like kotası değil: satın alınan ayrı bir consumable.
  // Sözleşme: backend_note_consumable_proposal.md. ⚠️ Uç HENÜZ CANLI DEĞİL —
  // bakiye (`Stats.notesRemaining`) 0 kaldığı sürece FE buraya hiç istek atmaz,
  // not kutusu doğrudan satın alma sheet'ini açar.
  SWIPE_NOTE: "/api/swipe/Note",
  // Fire/kurtarma redeem'lerinin birebir aynısı (gerçek HTTP status:
  // 402 = webhook inmedi → retry, 400 = kalıcı).
  SWIPE_NOTE_REDEEM: "/api/swipe/Note/Redeem",
  SWIPE_STATS: "/api/swipe/Stats",
  SWIPE_MATCHES: "/api/swipe/GetMatches",
  WHO_LIKED_ME: "/api/swipe/wholikedme",
  LIKER_PROFILE: "/api/swipe/LikerProfile",
  SWIPE_UNDO: "/api/swipe/Undo",
  // Kaçırılan eşleşme = beni beğenmiş ama benim pass'ladığım kullanıcı
  // (30 günlük pencere, SwipeLimits:MissedMatchLookbackDays).
  //
  // LİSTE ucu premium gating'e tabi değil — kartlar ve `totalProfiles` free'de
  // de TAM geliyor. Kimliği saklayan tek şey istemcideki blur; kart bunun
  // sinyallerini taşıyor (bkz. missedMatchRecovery.MissedMatchCard).
  //
  // RECOVER aksiyonu 2026-08-31'den beri PREMIUM AYRICALIĞI (kota/kredi yok):
  // 200 / 403 (free — paywall, `MissedMatchRecoveryLimit`) / 400 (premium'un
  // uygunsuz hedefi). `POST /api/swipe/Recovery/Redeem` ve `recovery_*`
  // paketleri KALDIRILDI; UT-62xx ailesi emekliye ayrıldı ve yeniden
  // kullanılmayacak. Cihazda kalmış eski redeem kuyruğu için bkz.
  // discover/recoveryQueuePurge.ts.
  SWIPE_MISSED_MATCHES: "/api/swipe/MissedMatches",
  SWIPE_RECOVER_MISSED_MATCH: "/api/swipe/RecoverMissedMatch",
  SWIPE_FILTERS: "/api/swipe/Filters",
  SWIPE_UPDATE_FILTERS: "/api/swipe/UpdateFilters",

  // Kalıcı silme — ANINDA, geri alınamaz, gövdede şifre zorunlu. 204 döner.
  // DELETE gövdesi axios'ta config.data ile gider:
  //   api.delete(PRIVACY_DELETE_PERMANENT, { data: { password } })
  PRIVACY_DELETE_PERMANENT: "/api/privacy/account",
  // Dondurma — veri durur, kullanıcı tekrar giriş yapınca kendiliğinden açılır.
  // Ayrı bir "aktifleştir" ucu yok (bkz. AuthService.Login).
  PRIVACY_DEACTIVATE: "/api/privacy/deactivate",
  // KALDIRILDI: PRIVACY_DELETE_ACCOUNT (/api/privacy/delete-account),
  // PRIVACY_CANCEL_DELETION, PRIVACY_DELETION_STATUS. Backend'de üçü de [ESKİ]:
  // 30 günlük grace period modeli kaldırıldı, /delete-account artık silmiyor
  // yalnızca donduruyor. Uygulama "30 gün içinde silinecek" derken hesabın
  // dondurulması App Store Guideline 5.1.1(v) ihlaliydi.
  PRIVACY_MY_DATA: "/api/privacy/my-data",
  PRIVACY_MY_DATA_STATUS: (requestId: number | string) => `/api/privacy/my-data/${requestId}`,
  PRIVACY_ACCEPT_CONSENT: "/api/privacy/accept-consent",
  // Rızanın şu anki durumu (Ayarlar'daki fotoğraf doğrulama anahtarı).
  PRIVACY_CONSENT_STATUS: (consentType: string) =>
    `/api/privacy/consent-status?type=${encodeURIComponent(consentType)}`,
  // Tüm rıza kararlarının geçmişi (kabul + geri alma). `consent-status`
  // `isAccepted` vermeyen ESKİ sunucularda geçerli durumu buradan çıkarıyoruz
  // (bkz. features/auth/consents.ts).
  PRIVACY_CONSENT_HISTORY: "/api/privacy/consent-history",
  // Aydınlatma metni — ANONİM erişilebilir, markdown döner:
  // { type, version, contentMarkdown, contentType }.
  // ⚠️ `version` YANITLA GELEN değerdir, sabit kodlanmaz: metin güncellenince
  // yeniden rıza gerekiyor.
  //
  // Uygulama şu an bu ucu ÇAĞIRMIYOR: onay ekranı metni i18n'den basıyor
  // (auth.kvkkConsent.section*), çünkü metin iki dilli ve sunucu tek dil
  // servis ediyor. Uç, aynı metnin makine tarafından doğrulanabilir kopyasını
  // (ve onay anındaki sürümü) sunmaya devam ediyor.
  PRIVACY_POLICY: (consentType: string) =>
    `/api/privacy/policy/${encodeURIComponent(consentType)}`,

  SUBSCRIPTION_STATUS: "/api/subscription/status",
  SUBSCRIPTION_SYNC: "/api/subscription/sync",
  SUBSCRIPTION_PLANS: "/api/subscription/plans",
  // RC SDK customerInfo ile backend /status çeliştiğinde. Aynı flow'u /sync ile
  // paylaşır, ek olarak gönderilen RC bilgilerini audit log'a yazar.
  SUBSCRIPTION_RECONCILE: "/api/subscription/reconcile",

  MESSAGES_CONVERSATIONS: "/api/messages/conversations",
  MESSAGES_HISTORY_CURSOR: (convId: string) => `/api/messages/conversations/${convId}/history-cursor`,
  MESSAGES_HISTORY: (convId: string) => `/api/messages/conversations/${convId}/history`,
  MESSAGES_SEND: "/api/messages/send",
  MESSAGES_MARK_READ: (convId: string) => `/api/messages/conversations/${convId}/mark-read`,
  /**
   * Delta-sync: son watermark'tan bu yana değişen her şey. Bağlantı koptuktan
   * ya da arka plandan dönüşte "ben yokken ne değişti" sorusunun TEK cevabı —
   * özellikle silmeler, çünkü silinmiş mesaj `messages[]`'a hiç girmiyor.
   */
  MESSAGES_CHANGES: "/api/messages/changes",
  MESSAGES_UNREAD_COUNT: "/api/messages/unread-count",
  MESSAGES_UNREAD_PER_CONV: "/api/messages/unread-per-conversation",
  MESSAGES_DEACTIVATE_CONV: (convId: string) => `/api/messages/conversations/${convId}`,
  MESSAGES_RESTORE_CONV: (convId: string) => `/api/messages/conversations/${convId}/restore`,
  // Rematch ("anılar canlanır"): aynı çift tekrar eşleşince eski mesajlar GİZLİ
  // gelir (hasHiddenHistory). Bu uç geçmişi ÇİFT İÇİN açar — karşı tarafa
  // ConversationHistoryRevealed event'i düşer.
  MESSAGES_REVEAL_HISTORY: (convId: string) => `/api/messages/conversations/${convId}/reveal-history`,
  MESSAGES_DELETE: (msgId: string) => `/api/messages/${msgId}`,
  MESSAGES_REACTIONS: (msgId: string) => `/api/messages/${msgId}/reactions`,
  MESSAGES_DELIVERED: (msgId: string) => `/api/messages/${msgId}/delivered`,
  MESSAGES_UPLOAD_URL: "/api/messages/upload-url",
  // Sesli mesaj oynatma linki. DTO'daki mediaUrl oynatılamaz (bucket private) —
  // oynatmaya basıldığında bu uçtan 15 dakikalık imzalı URL alınır, cache'lenmez.
  MESSAGES_MEDIA_URL: (msgId: string) => `/api/messages/${msgId}/media-url`,
  MESSAGES_QUOTA: (convId: string) => `/api/messages/conversations/${convId}/quota`,
  // NOT: .../unlock endpoint'i 2026-08-02'de kaldırıldı (consumable satışı yok);
  // kota dolduğunda Premium modalı açılır.

  MODERATION_BLOCK: (userId: string) => `/api/moderation/block/${userId}`,
  // /blocks sadece id listesi döner; kart göstermek için /blocked-users kullan.
  MODERATION_BLOCKS: "/api/moderation/blocks",
  MODERATION_BLOCKED_USERS: "/api/moderation/blocked-users",
  MODERATION_REPORT: "/api/moderation/report",

  NOTIFICATIONS_PREFERENCES: "/api/notifications/preferences",
  NOTIFICATIONS_DEVICES: "/api/notifications/devices",
  NOTIFICATIONS_DEVICE_BY_TOKEN: (token: string) => `/api/notifications/devices/${encodeURIComponent(token)}`,
  NOTIFICATIONS_FEED: "/api/notifications",
  NOTIFICATIONS_UNREAD_COUNT: "/api/notifications/unread-count",
  NOTIFICATIONS_READ_ONE: (id: string) => `/api/notifications/${id}/read`,
  NOTIFICATIONS_READ_ALL: "/api/notifications/read-all",

  // ── Lit Akışı (feed) ──────────────────────────────────────────────────────
  // Kampüse özel, SADECE YAZI akışı. Gönderi altında yorum yok; "yanıt" yalnız
  // gönderi sahibine gider, sahibi kabul ederse eşleşme olur.
  //
  // ⚠️ Aile bir FEATURE FLAG'in arkasında. Bayrak kapalıyken HER uç 403 + UT-7301
  // dönüyor — bu bir HATA DEĞİL, "özellik yok" demek; istemci sekmeyi hiç
  // çizmemeli (bkz. features/feed/feedFlag.ts).
  // UT-7315 de 403 ama BAŞKA bir şey (profil tamamlanmamış / hesap pasif) →
  // ayrım `code` üzerinden yapılmalı, HTTP status üzerinden ASLA.
  FEED_ME: "/api/feed/me",
  // ⚠️ İKİ SAYFALAMA MODU TEK UÇTA: `cursor` YALNIZ sort=new'de, `page` YALNIZ
  // sort=popular|top'ta geçerli. popular/top sayfalar arasında AYNI gönderiyi
  // tekrar döndürebiliyor (beğeniler değiştikçe skor kayıyor; backend bunu
  // bilinçli kabul ediyor) → tüketici listeyi id'ye göre tekilleştirmek ZORUNDA.
  FEED_POSTS: "/api/feed/posts",
  // Gönderilerim: offset sayfalama, son 30 gün, sildiklerin hariç HER durum
  // (Published/PendingReview/SupportHold/HiddenByReports/Rejected/RemovedByAdmin).
  FEED_MY_POSTS: "/api/feed/posts/mine",
  // DELETE: silinen gönderi hak İADE ETMEZ ve ona gelmiş bekleyen yanıtlar da
  // düşer. Rejected/RemovedByAdmin gönderi silinemez (UT-7312).
  FEED_POST: (id: string) => `/api/feed/posts/${encodeURIComponent(id)}`,
  // PUT beğenir (İDEMPOTENT — iki kez basmak sayıyı iki artırmaz), DELETE geri
  // alır. Sınırsız ve ücretsiz. Yazar kimin beğendiğini HİÇBİR yerde görmüyor.
  FEED_POST_LIKE: (id: string) => `/api/feed/posts/${encodeURIComponent(id)}/like`,
  // Gövde GET /api/swipe/LikerProfile/{id} ile BİREBİR aynı ProfileCardDto →
  // mevcut profil kartı bileşeni olduğu gibi kullanılabilir (beğeniye özel
  // alanlar — hasLikedMe, note — burada dolu GELMEZ). Anonim gönderide UT-7312.
  FEED_POST_AUTHOR_PROFILE: (id: string, mode?: string | null) =>
    `/api/feed/posts/${encodeURIComponent(id)}/author-profile${
      mode ? `?mode=${encodeURIComponent(mode)}` : ""
    }`,
  // Bir gönderiye BİR KEZ yanıt verilebilir (UT-7323). Yanıt verene sahibin
  // kabul/red kararı BİLDİRİLMEZ ve hak geri gelmez; kabulde MatchNotification.
  FEED_POST_REPLIES: (id: string) => `/api/feed/posts/${encodeURIComponent(id)}/replies`,
  // Bana gelen, YALNIZ karar bekleyen yanıtlar (yeniden eskiye). 30 günden eski
  // karar verilmemiş yanıtlar otomatik düşüyor.
  FEED_REPLIES_RECEIVED: "/api/feed/replies/received",
  FEED_REPLIES_RECEIVED_COUNT: "/api/feed/replies/received/count",
  FEED_REPLY_PROFILE: (id: string) =>
    `/api/feed/replies/${encodeURIComponent(id)}/profile`,
  // Kabul → eşleşme + sohbet, iki tarafa standart MatchNotification gider.
  // isNewMatch:false → zaten eşleşmişsiniz (anonim gönderide olabilir), yeni
  // modal yok, conversationId sohbetini aç.
  FEED_REPLY_ACCEPT: (id: string) =>
    `/api/feed/replies/${encodeURIComponent(id)}/accept`,
  FEED_REPLY_DISMISS: (id: string) =>
    `/api/feed/replies/${encodeURIComponent(id)}/dismiss`,
  // ⚠️ Şikayet AYRI UÇ — MODERATION_REPORT DEĞİL. Gövdede `reportedUserId` YOK
  // (anonim gönderide şikayet edilecek bir kimlik de yok; yazarı sunucu biliyor
  // ve alsoBlock yine çalışıyor); hedef targetType + postId/replyId ile veriliyor.
  FEED_REPORTS: "/api/feed/reports",

  // ── Kampüs Anları (campus moments) ────────────────────────────────────────
  // Tam ekran kampüs haritasının üstünde yaşayan, 24 SAATTE KAYBOLAN
  // tek-fotoğraflık anlar ve onlar üzerinden eşleşme. Sözleşmenin tamamı ve
  // gerekçeleri repo kökündeki `backend_campus_moments_2026-10.md` dosyasında.
  //
  // ⚠️ KAPSAM KADEMELİ. Poligon verisi backend'de parti parti toplanıyor;
  // poligonu olmayan kampüste `/me` → `enabled:false` ve `boundary` →
  // `polygon:null` geliyor. Bu bir HATA DEĞİL, "bu kampüste henüz yok" demek.
  //
  // Kampüs sınırı. Daire geofence için, poligon karar için (ikisi birden
  // gerekiyor — işletim sistemi yalnız daire kabul ediyor, daire ise kampüsün
  // yanındaki mahalleyi de içine alıyor).
  // ⚠️ Yanıttaki `domain` KANONİK yazım: `bogazici.edu.tr` sorana `boun.edu.tr`
  // dönüyor. Kullanıcının e-posta domain'iyle string karşılaştırma yapma.
  CAMPUS_BOUNDARY: (domain?: string | null) =>
    `/api/campus/boundary${
      domain ? `?domain=${encodeURIComponent(domain)}` : ""
    }`,
  // Yüzeyin durumu: kota + kapılar + bugünün anı. `/api/feed/me` ikizi.
  // ⚠️ `isInCampus` alanı YOK ve istenmedi: bu yanıt cache'leniyor, konum ise
  // saniyelik. Kampüs kapısı her zaman anlık okumadan geliyor.
  CAMPUS_ME: "/api/campus/me",
  // GET: liste (cursor). POST: paylaş — gövdede konum alanları da var, çünkü
  // "kampüsteyim" kararının OTORİTESİ SUNUCU (istemci kapısı yalnız UX).
  CAMPUS_MOMENTS: "/api/campus/moments",
  // Presigned S3. Yükleme imzası kısa (5 dk); OKUMA tarafı imzasız ve
  // `photoUrl` 24 saat sabit, yani disk cache anahtarı olarak kullanılabilir.
  CAMPUS_MOMENTS_UPLOAD_URL: "/api/campus/moments/upload-url",
  // DELETE: soft delete ve GÜNÜN HAKKINI GERİ VERMİYOR (`postedToday` true
  // kalıyor) — akışın "pencerede yazılan her satır sayılır" kuralı.
  CAMPUS_MOMENT: (id: string) =>
    `/api/campus/moments/${encodeURIComponent(id)}`,
  /**
   * GEÇME — ⚠️ `/api/swipe/Pass` DEĞİL ve bu çok bilinçli.
   *
   * Swipe satırı `UNIQUE(ActorId, TargetId, Mode)`; geçme oraya yazsaydı
   * kampüste geçilen kişi Keşif destesinden de 3 gün düşerdi. Geçmek sınırsız
   * olduğu için kullanıcı anlara hızlıca bakarak kendi keşif havuzunu hiçbir
   * kota harcamadan boşaltır, ertesi gün boş destenin sebebini göremezdi.
   *
   * Ayrıca `PassHandler`'ın yan etkileri burada zararlı: "bir eşleşmeyi
   * kaçırdın" bildirimi olmayan bir kaybı duyurup olmayan bir geri-almayı
   * gösterirdi.
   *
   * BEĞENME ise `/api/swipe/Like`ta kalıyor (`source: "CampusMoment"` +
   * `momentId` ile) — orada "aynı beğeni" istenen şeyin ta kendisi.
   */
  CAMPUS_MOMENT_PASS: (id: string) =>
    `/api/campus/moments/${encodeURIComponent(id)}/pass`,
  // Kampüse giriş/çıkış. Push kararı SUNUCUDA: bildirim ancak görülecek bir şey
  // varsa anlamlı ("bugün 7 an") ve cihaz kaç an olduğunu bilmiyor.
  CAMPUS_PRESENCE: "/api/campus/presence",

  GET_GENDERS: "/api/common/genders",
  GET_CITIES: "/api/common/cities",
  GET_DISTRICTS: "/api/common/cities",
  GET_CLASSES: "/api/common/classes",
  GET_DEPARTMENTS: "/api/common/departments",
  GET_HOBBIES: "/api/common/hobbies",
  // Profil prompt kataloğu — bio'nun yerini alan cümle başlangıçları.
  // Diğer common uçları gibi ANONİM: kayıt sihirbazında token'dan önce çağrılıyor.
  //
  // ⚠️ Katalog `staticGet` ile UYGULAMA OTURUMU BOYUNCA cache'leniyor (TTL yok).
  // Backend bir prompt'u `isActive:false` yaptığında bayat katalogdaki kullanıcı
  // onu hâlâ seçebilir → `UT-2202`. O kodda `bustStaticCache(GET_PROMPTS)` çağırıp
  // listeyi tazelemek gerekiyor (bkz. promptErrors.ts).
  GET_PROMPTS: "/api/common/prompts",
  GET_SMOKING_STATUSES: "/api/common/smoking-statuses",
  GET_ZODIACS: "/api/common/zodiacs",
  // GET_USAGE_PURPOSES KALDIRILDI: "kullanım amacı" alanı üründen çıktı.
  // Endpoint backend'de duruyor ama artık HER ZAMAN boş liste dönüyor (sahadaki
  // eski sürümler 404 alıp onboarding'de kilitlenmesin diye); force-update
  // eşiği bu sürümün üstüne çıkınca backend'den de silinecek.
  GET_INTERESTED_IN: "/api/common/interested-in",
  GET_LANGUAGES: "/api/common/languages",
  GET_UNIVERSITIES: "/api/common/universities",
  GET_PETS: "/api/common/pets",
  GET_ALCOHOL_USAGES: "/api/common/alcohol-usages",
  GET_RELIGIOUS_VIEWS: "/api/common/religious-views",
  GET_RELATIONSHIP_INTENTS: "/api/common/relationship-intents",
  // Arkadaşlık niyetleri — ilişki niyetinin Arkadaş modu karşılığı. ÇOKLU
  // seçim (bitmask), ilişki niyeti ise tek seçim: iki ayrı uç, iki ayrı alan.
  GET_FRIENDSHIP_INTENTS: "/api/common/friendship-intents",
  GET_DISTRICTS_BY_CITY: (cityId: number | string) => `/api/common/cities/${cityId}/districts`,

  // Anonim — login ekranından önce de çağrılır. Backend client'ın sürümünü
  // KARŞILAŞTIRIP karar döner (ok/soft/force/maintenance); istemci kendi
  // semver karşılaştırmasını yapmaz.
  APP_VERSION_CHECK: "/api/app/version-check",
};
