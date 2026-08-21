/**
 * Premium'un UYGULAMADAKİ TEK KAYNAĞI.
 *
 * Aynı soruya dört ayrı cevap veriyorduk: abonelik slice'ı (`/status` + hub +
 * `/sync`), `/swipe/stats`ın `isPremium`i, `/filters` yanıtının `isPremium`i ve
 * `GetMyProfile`ın bayrağı. Hepsi aynı backend'in cevabı ama farklı zamanlarda
 * donuyorlar — `/stats` oturumda BİR KEZ çekiliyor (`staleTime: Infinity`),
 * `/filters` modal açılınca. Sonuç: premium bitince ekranların bir kısmı
 * güncelleniyor, bir kısmı reload'a kadar premium göstermeye devam ediyordu.
 * Her ekran bunu kendi OR'uyla yamamıştı ve OR'lar tek yönlüydü (yalnız
 * yükseltiyor, düşürmüyor) — düşüş yönü hep kırık kaldı.
 *
 * KURAL: tier kararı (kilit, paywall, rozet, upsell) YALNIZ buradan okunur.
 * Backend payload'larındaki `isPremium` alanları "backend o an ne gördü"
 * bilgisidir; kota SAYILARI için kullanılabilir, gating için KULLANILMAZ.
 *
 * Slice canlı: hub `SubscriptionChanged` anında düşürüyor, bitiş anında
 * AppNavigator'daki timer `/status` çekiyor, satın almada optimistic yükseliyor.
 */
import { useAppSelector } from "@/shared/hooks/redux";
import {
  selectIsPremium,
  selectPremiumResolved,
} from "@/features/profile/subscriptionSlice";

export interface PremiumTier {
  /** Gating cevabı. Backend henüz konuşmadıysa `false` — `resolved`a bak. */
  isPremium: boolean;
  /**
   * Backend premium hakkında en az bir kez konuştu mu. `false` = BİLMİYORUZ,
   * "premium değil" DEĞİL: slice persist edilmiyor, reload'da premium kullanıcı
   * da bir an `isPremium:false` doğuyor. Bu pencerede ekranlar elindeki son
   * bilgiye (profil bayrağı, stats cevabı) düşebilir; premium'a satış yapmak
   * en pahalı yanılma yönü.
   */
  resolved: boolean;
}

export function usePremiumTier(): PremiumTier {
  const isPremium = useAppSelector(selectIsPremium);
  const resolved = useAppSelector(selectPremiumResolved);
  return { isPremium, resolved };
}

/** Kısa yol — `resolved` penceresini önemsemeyen basit kapılar için. */
export function useIsPremium(): boolean {
  return useAppSelector(selectIsPremium);
}
