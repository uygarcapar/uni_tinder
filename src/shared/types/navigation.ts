export type RootStackParamList = {
  HomeTabs: undefined;
  Chat: {
    conversationId: string;
    partner?: {
      userId: string;
      displayName: string;
      profileImageUrl?: string;
    };
    isActive?: boolean;
  };
  Notifications: undefined;
  // Ayarlar → Şifre Değiştir. İki adım (mevcut şifre → kod + yeni şifre) tek
  // ekranın iç durumu: mevcut şifreyi route param'ıyla taşımak onu Sentry'nin
  // navigation breadcrumb'larına düşürürdü.
  ChangePassword: undefined;
  // Ayarlar → E-posta Değiştir. Şifre ekranıyla aynı gerekçe: mevcut şifre
  // route param'ı olmuyor. Başarıda oturum kapanıyor (yeni token DÖNMÜYOR),
  // yani bu ekrandan çıkış login'e — geri döndüğü yere değil.
  ChangeEmail: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  // Şifre sıfırlama: e-posta → kod → yeni şifre. Kod backend'de ayrıca
  // doğrulanamadığı için ResetPassword'e parametre olarak taşınır.
  ForgotPassword: { email?: string } | undefined;
  ForgotPasswordCode: { email: string };
  ResetPassword: { email: string; resetCode: string };
  RegisterStep1: undefined;
  RegisterStep2: { email?: string; mode?: string; pending?: boolean; retryAfterSeconds?: number } | undefined;
  RegisterStep3: undefined;
  RegisterStep5: undefined;
  RegisterStep6: undefined;
  RegisterStep7: undefined;
  RegisterStep8: undefined;
  RegisterStep9: undefined;
  RegisterStep10: undefined;
  RegisterStep12: undefined;
  RegisterStep13: undefined;
  // Sorular (prompt'lar) — akışta Step13 ile Step14 arasında, bkz.
  // registrationFlow.ts (sıra numarayla değil o diziyle belirleniyor).
  RegisterStep17: undefined;
  RegisterStep14: undefined;
  // Step16 akışta 15'ten ÖNCE geliyor (alkol/dini görüş → fotoğraflar);
  // numara ekranın eklenme sırasını gösteriyor.
  RegisterStep16: undefined;
  RegisterStep15: undefined;
};

export type TabParamList = {
  Discover: undefined;
  Likes: undefined;
  Messages: undefined;
  Profile: undefined;
};
