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
