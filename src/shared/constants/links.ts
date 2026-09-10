/**
 * Uygulama dışına çıkan sabit bağlantılar — tek kaynak.
 *
 * Davet linki landing'deki `/invite/[kod]` sayfasına gider. Uygulama YÜKLÜYSE
 * universal link (app.json `ios.associatedDomains`) onu doğrudan açar ve kod
 * kayıt formuna yazılır (navigation/inviteLink.ts). Yüklü değilse sayfa kodu
 * gösterip App Store'a yönlendirir; kod panoya kopyalanır, kayıt ekranındaki
 * yapıştır butonu alır.
 */

export const SITE_URL = "https://lit.4ourstack.com";

/** Mağazaya yönlendiren landing rotası (uygulama yoksa). */
export const APP_STORE_LINK = `${SITE_URL}/app`;

export const INVITE_PATH = "invite";

/** Paylaşılan davet linki: https://lit.4ourstack.com/invite/AK7M2 */
export const inviteLink = (code: string) =>
  `${SITE_URL}/${INVITE_PATH}/${encodeURIComponent(code)}`;
