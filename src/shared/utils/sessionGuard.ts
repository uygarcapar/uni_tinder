/**
 * Kendi /login'imizin tetiklediği ForceLogout'u filtrelemek için.
 *
 * Backend (AuthService, login yolu) yeni girişte kullanıcının mevcut refresh
 * token'larını `RevokedReason = "new_login_elsewhere"` ile iptal edip
 * `Clients.User(userId)` üzerinden TÜM bağlantılarına ForceLogout yolluyor —
 * girişi yapan cihazın kendi bağlantıları dahil. Login anında önceki oturumdan
 * kalmış canlı bir hub bağlantısı varsa, kullanıcı kendi girişinden saniyeler
 * sonra "başka cihazdan giriş yapıldı" ile dışarı atılıyor.
 *
 * Login'i damgalıyoruz; kısa pencere içinde gelen ForceLogout bize ait sayılıp
 * yok sayılıyor. Pencere kaçarsa da güvenlik kaybı yok: gerçekten başka bir
 * cihaz giriş yaptıysa bu cihazın refresh token'ı zaten revoke edilmiş durumda,
 * ilk refresh denemesinde `new_login_elsewhere` dönüp toast + logout işliyor.
 *
 * Not: ForceLogout payload'ındaki `at` sunucu UTC damgası; cihaz saatiyle
 * karşılaştırmak güvenilir değil, o yüzden yalnızca kendi lokal damgamıza
 * bakıyoruz. Backend payload'a giriş yapan oturumun kimliğini eklerse bu
 * heuristik yerine kesin karşılaştırma yapılabilir.
 */
const SELF_LOGIN_WINDOW_MS = 20_000;

let lastSelfLoginAt = 0;

export const markSelfLogin = (): void => {
  lastSelfLoginAt = Date.now();
};

export const clearSelfLoginMark = (): void => {
  lastSelfLoginAt = 0;
};

export const isSelfInflictedForceLogout = (): boolean =>
  lastSelfLoginAt > 0 && Date.now() - lastSelfLoginAt < SELF_LOGIN_WINDOW_MS;

/**
 * Şifre değiştirme/sıfırlamayı BU cihazın başlattığını damgalar.
 *
 * Backend her iki akışta da tüm refresh token'ları iptal edip
 * `Clients.User(userId)` üzerinden ForceLogout yolluyor — işlemi yapan cihaz
 * dahil. Bu cihaz sinyali yok saymalı:
 *   • Şifre DEĞİŞTİRME (A2) cevapta yeni token seti veriyor, oturum devam eder.
 *   • Ayarlar'dan şifre SIFIRLAMA (C) token vermiyor ama kapanışı ekran
 *     yönetiyor ("şifren sıfırlandı" → login), araya jenerik bir toast girmesin.
 *
 * Damga ForceLogout dışında refresh hatasını da kapsıyor: pencerede uçan bir
 * istek 401 alıp ESKİ (artık revoke) refresh token'la yenilemeye kalkarsa,
 * o hata kullanıcıyı dışarı atmamalı — yeni token birazdan yazılacak.
 *
 * Pencere login damgasıyla aynı: yakalanmayan bir sinyal kaybolmaz, cihaz ilk
 * refresh denemesinde `password_changed` gerekçesiyle zaten düşer.
 */
const SELF_PASSWORD_CHANGE_WINDOW_MS = 20_000;

let lastSelfPasswordChangeAt = 0;

export const markSelfPasswordChange = (): void => {
  lastSelfPasswordChangeAt = Date.now();
};

export const clearSelfPasswordChangeMark = (): void => {
  lastSelfPasswordChangeAt = 0;
};

export const isSelfInflictedPasswordChange = (): boolean =>
  lastSelfPasswordChangeAt > 0 &&
  Date.now() - lastSelfPasswordChangeAt < SELF_PASSWORD_CHANGE_WINDOW_MS;

/**
 * E-posta değiştirmeyi BU cihazın başlattığını damgalar.
 *
 * Şifre damgasından AYRI tutuldu çünkü sonuçları farklı: şifre değiştirme
 * cevapta yeni token seti verip oturumu ayakta tutuyor, e-posta değiştirme
 * VERMİYOR — bu cihaz da mutlaka çıkış yapacak. Damganın işi çıkışı engellemek
 * değil, çıkışın SAHİBİNİ belirlemek:
 *
 *   • Ekran kendi kapanışını yönetiyor ("e-postan değişti, tekrar giriş yap" +
 *     üniversite değiştiyse onun bilgisi). Araya hub'dan gelen jenerik bir
 *     "oturumun kapatıldı" toast'ı girerse kullanıcı iki çelişkili mesaj görür.
 *   • Pencerede uçan istekler 401 alıp ESKİ (artık revoke) refresh token'la
 *     yenilemeye kalkarsa o hata da kendi mesajını basmamalı.
 *
 * Pencere kaçarsa kayıp yok: kullanıcı zaten login ekranına gidiyor.
 */
const SELF_EMAIL_CHANGE_WINDOW_MS = 20_000;

let lastSelfEmailChangeAt = 0;

export const markSelfEmailChange = (): void => {
  lastSelfEmailChangeAt = Date.now();
};

export const clearSelfEmailChangeMark = (): void => {
  lastSelfEmailChangeAt = 0;
};

export const isSelfInflictedEmailChange = (): boolean =>
  lastSelfEmailChangeAt > 0 &&
  Date.now() - lastSelfEmailChangeAt < SELF_EMAIL_CHANGE_WINDOW_MS;
