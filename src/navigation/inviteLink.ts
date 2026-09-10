import { normalizeReferralCode } from "@/features/auth/referralCode";
import { INVITE_PATH } from "@/shared/constants/links";

/**
 * Davet linki — universal link (https://lit.4ourstack.com/invite/AK7M2) ya da
 * şema (lit://invite/AK7M2) ile gelen yolu koda çevirir.
 *
 * Saf fonksiyon: React Navigation'ın `getStateFromPath` kancasından çağrılıyor
 * (AppNavigator LINKING). Eşleşmezse `null` → normal rota çözümü devam eder.
 *
 * Kod kayıt formuna yazılır (auth.registrationForm.referralCode); kayıt
 * akışındaki davet ekranı oradan okuyup dolu gösterir. Giriş yapmış kullanıcıda
 * link YOK SAYILIR: kendi kodunu girecek bir yer yok, karıştırmaya değmez.
 */
export function parseInviteLinkPath(path: string): string | null {
  const clean = path.replace(/^\/+/, "");
  const m = clean.match(new RegExp(`^${INVITE_PATH}/([^/?#]+)`, "i"));
  if (!m) return null;

  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Bozuk yüzde kodlaması — ham değerle devam, normalize zaten alfabe dışını atar.
  }
  const code = normalizeReferralCode(raw);
  return code.length === 5 ? code : null;
}
