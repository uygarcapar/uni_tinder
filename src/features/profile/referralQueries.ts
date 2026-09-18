import { useQuery } from "@tanstack/react-query";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { queryClient } from "@/shared/queries/queryClient";
import { referralKeys } from "@/features/profile/referralKeys";
import type { ReferralSummary } from "@/shared/types";

// Anahtarlar ayrı modülde (referralKeys.ts); buradan re-export ediliyor ki
// çağıranlar tek yerden import edebilsin (swipeQueries.ts'teki desen).
export { referralKeys };

// Özet dakikalarca değişmiyor (davet edilen kayıt olduğunda değişiyor) ve o an
// zaten bir bildirim geliyor: AppNavigator beş referral bildirimi için bu
// anahtarı invalidate ediyor, yani tazelik push'a bağlı, polling'e değil.
// Sabit, prefetch'in de aynı eşiği kullanması için paylaşılıyor — prefetch daha
// kısa bir staleTime ile çağrılırsa ısıttığı veriyi satır anında bayat sayar ve
// aynı isteği ikinci kez uçurur.
const REFERRAL_STALE_TIME = 60_000;

async function fetchReferralSummary(): Promise<ReferralSummary> {
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
}

/**
 * `GET /api/referral/me` — davet kartının ve sheet'in TEK kaynağı.
 *
 * Kod, sayı, kademe, ödüller ve görünürlük hakkı aynı cevaptan geliyor: kartın
 * üst satırıyla sheet'in listesi ayrı isteklerden beslenirse aynı ekranda iki
 * farklı gerçek görünür.
 */
export function useReferralSummary(enabled = true) {
  return useQuery<ReferralSummary>({
    queryKey: referralKeys.me,
    queryFn: fetchReferralSummary,
    enabled,
    staleTime: REFERRAL_STALE_TIME,
  });
}

/**
 * Özeti PROFİL İSTEĞİYLE AYNI ANDA uçur (ProfileScreen → loadProfile).
 *
 * 🔴 NEDEN: davet satırı profil yüklenmesi bitene kadar MOUNT OLMUYOR —
 * ProfileScreen `loading` boyunca `SkeletonBody` çiziyor. Yani istek zinciri
 * seriydi: profil + enum'lar dönsün → sayfa çizilsin → satır mount olsun →
 * ANCAK O ZAMAN `/referral/me` uçsun. Kullanıcının gördüğü şey, sayfa
 * açıldıktan sonra araya giren bir kart oluyordu. Prefetch zinciri paralele
 * çeviriyor; satırın kendi `useQuery`si aynı anahtarı paylaştığı için ikinci
 * bir istek doğmuyor, hazır cevabı okuyor.
 *
 * Hook DEĞİL, bilinçli olarak: ProfileScreen'in gövdesinde `useQuery` çağırmak
 * dev bir bileşeni davet verisine ABONE ederdi (veri geldiğinde tüm sayfa
 * yeniden render → bu ekranın kaçındığı commit yükü). Prefetch cache'i ısıtır,
 * abone olmaz.
 *
 * Await EDİLMİYOR ve hata YUTULUYOR: profil yüklemesi buna bağlı değil, satır
 * kendi sorgusuyla yeniden deneyebilir.
 */
export function prefetchReferralSummary() {
  queryClient
    .prefetchQuery({
      queryKey: referralKeys.me,
      queryFn: fetchReferralSummary,
      staleTime: REFERRAL_STALE_TIME,
    })
    .catch(() => {});
}
