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

  REGISTER: "/api/user/Register",
  LOGIN: "/api/user/Login",
  VERIFY_EMAIL: "/api/user/verifyemailwithcode",
  VERIFY_EMAIL_CODE: "/api/user/verifyemailwithcode",
  RESEND_VERIFICATION: "/api/user/resendverificationcode",
  GET_USER: "/api/user/GetUser",
  UPDATE_USER: "/api/user/UpdateUser",
  // Şifre değiştirme İKİ ADIMLI: önce bu uç mevcut şifreyi doğrulayıp maile
  // 6 haneli onay kodu yollar, sonra ChangePassword kodu + yeni şifreyi alır.
  // Mevcut şifre 1. adımda doğrulandığı için yanlış şifreyle kod hiç gitmez.
  REQUEST_PASSWORD_CHANGE_CODE: "/api/user/RequestPasswordChangeCode",
  // DİKKAT: tek PUT ucu — diğer üç şifre ucu POST. Yanlış method 405 döner.
  CHANGE_PASSWORD: "/api/user/ChangePassword",
  FORGOT_PASSWORD: "/api/user/ForgotPassword",
  RESET_PASSWORD: "/api/user/ResetPasswordWithCode",
  // NOT: DELETE /api/user/DeleteUser deprecated (orphan kayıt bırakıyor).
  // Hesap silme için PRIVACY_DELETE_ACCOUNT kullan — KVKK akışı, 30 gün geri alınabilir.
  VALIDATE_TOKEN: "/api/user/validate-token",
  REFRESH_TOKEN: "/api/user/refresh-token",
  REVOKE_TOKEN: "/api/user/revoke-token",

  COMPLETE_PROFILE: "/api/profile/CompleteProfile",
  UPDATE_PROFILE: "/api/profile/UpdateProfile",
  GET_MY_PROFILE: "/api/profile/GetMyProfile",
  // DİKKAT: /api/photo/ altında, /api/profile/ altında DEĞİL (sabit önceden
  // yanlıştı ama hiç çağrılmadığı için fark edilmemişti). Yalnızca fotoğraf
  // moderasyon alanları için kullanılıyor — bkz. profileService.getMyPhotos.
  GET_MY_PHOTOS: "/api/photo/GetMyPhotos",
  UPDATE_PREFERENCES: "/api/profile/update-preferences",
  // App-open heartbeat: şehir/ilçe artık kullanıcı seçimi değil, backend'in bu
  // koordinattan türettiği sonuç. UpdateProfile'da konum alanları kaldırıldı.
  UPDATE_LOCATION: "/api/profile/location",

  GET_PHOTO: "/api/photo/GetPhoto",

  GET_POTENTIAL_MATCHES: "/api/swipe/GetPotentialMatches",
  SWIPE_LIKE: "/api/swipe/Like",
  SWIPE_PASS: "/api/swipe/Pass",
  SWIPE_SUPER_LIKE: "/api/swipe/SuperLike",
  // Consumable superlike paketinin krediye çevrilmesi. Diğer swipe endpoint'leri
  // hep 200 + ResponseDto dönerken bu action GERÇEK HTTP status kullanıyor:
  // 402 = RC webhook'u henüz inmedi (retry), 400 = kalıcı hata.
  SWIPE_SUPER_LIKE_REDEEM: "/api/swipe/SuperLike/Redeem",
  SWIPE_STATS: "/api/swipe/Stats",
  SWIPE_MATCHES: "/api/swipe/GetMatches",
  WHO_LIKED_ME: "/api/swipe/wholikedme",
  LIKER_PROFILE: "/api/swipe/LikerProfile",
  SWIPE_UNDO: "/api/swipe/Undo",
  // Kaçırılan eşleşme = beni beğenmiş ama benim pass'ladığım kullanıcı
  // (30 günlük pencere, SwipeLimits:MissedMatchLookbackDays). Liste ucu premium
  // gating'e TABİ DEĞİL — kota yalnız Recover aksiyonunda (free 2/gün, premium
  // 5/gün). Recover gerçek HTTP status kullanıyor: 200 / 403 (kota+paywall) /
  // 400 (diğer tüm retler). Bkz. missedMatchRecovery.ts.
  SWIPE_MISSED_MATCHES: "/api/swipe/MissedMatches",
  SWIPE_RECOVER_MISSED_MATCH: "/api/swipe/RecoverMissedMatch",
  SWIPE_FILTERS: "/api/swipe/Filters",
  SWIPE_UPDATE_FILTERS: "/api/swipe/UpdateFilters",

  PRIVACY_DELETE_ACCOUNT: "/api/privacy/delete-account",
  PRIVACY_CANCEL_DELETION: "/api/privacy/cancel-deletion",
  PRIVACY_DELETION_STATUS: "/api/privacy/deletion-status",
  PRIVACY_MY_DATA: "/api/privacy/my-data",
  PRIVACY_MY_DATA_STATUS: (requestId: number | string) => `/api/privacy/my-data/${requestId}`,
  PRIVACY_ACCEPT_CONSENT: "/api/privacy/accept-consent",

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
  GET_DISTRICTS_BY_CITY: (cityId: number | string) => `/api/common/cities/${cityId}/districts`,

  // Anonim — login ekranından önce de çağrılır. Backend client'ın sürümünü
  // KARŞILAŞTIRIP karar döner (ok/soft/force/maintenance); istemci kendi
  // semver karşılaştırmasını yapmaz.
  APP_VERSION_CHECK: "/api/app/version-check",
};
