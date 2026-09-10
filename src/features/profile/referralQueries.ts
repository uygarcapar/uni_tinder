import { useQuery } from "@tanstack/react-query";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { referralKeys } from "@/features/profile/referralKeys";
import type { ReferralSummary } from "@/shared/types";

// Anahtarlar ayrı modülde (referralKeys.ts); buradan re-export ediliyor ki
// çağıranlar tek yerden import edebilsin (swipeQueries.ts'teki desen).
export { referralKeys };

/**
 * `GET /api/referral/me` — davet kartının ve sheet'in TEK kaynağı.
 *
 * Kod, sayı, kademe, ödüller ve görünürlük hakkı aynı cevaptan geliyor: kartın
 * üst satırıyla sheet'in listesi ayrı isteklerden beslenirse aynı ekranda iki
 * farklı gerçek görünür.
 *
 * `staleTime: 60s` — özet dakikalarca değişmiyor (davet edilen kayıt olduğunda
 * değişiyor) ve o an zaten bir bildirim geliyor: AppNavigator beş referral
 * bildirimi için bu anahtarı invalidate ediyor, yani tazelik push'a bağlı,
 * polling'e değil.
 */
export function useReferralSummary(enabled = true) {
  return useQuery<ReferralSummary>({
    queryKey: referralKeys.me,
    queryFn: async () => {
      const res = (await api.get(API_ENDPOINTS.REFERRAL_ME)) as any;
      if (!res?.isSuccess || !res.result) throw new Error("Referral summary fetch failed");
      const r = res.result;
      // Alanlar TEK TEK okunuyor: sunucu cevabını olduğu gibi geçirmek,
      // sözleşmede olmayan bir alan geldiğinde onu sessizce arayüze sokar.
      return {
        code: r.code ?? "",
        codeDisabled: r.codeDisabled === true,
        qualifiedCount: r.qualifiedCount ?? 0,
        inviteesPerTier: r.inviteesPerTier ?? 0,
        currentTier: r.currentTier ?? 0,
        // `null` = merdiven bitti. `?? null` ŞART: alan hiç gelmezse de
        // "bitti" demek doğru cevap (kart "yeni ödüller yakında" der).
        nextTier: r.nextTier ?? null,
        visibilityGrant: {
          expiresAt: r.visibilityGrant?.expiresAt ?? null,
          pausedDays: r.visibilityGrant?.pausedDays ?? null,
        },
        invitees: Array.isArray(r.invitees) ? r.invitees : [],
        rewards: Array.isArray(r.rewards) ? r.rewards : [],
      };
    },
    enabled,
    staleTime: 60_000,
  });
}
