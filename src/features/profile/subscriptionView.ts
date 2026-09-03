import { useMemo } from "react";
import { Linking, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/shared/hooks/redux";
import { selectSyncPending } from "@/features/profile/subscriptionSlice";

/**
 * Abonelik durum makinesi — TEK KAYNAK.
 *
 * İki yüzey aynı cümleleri yazıyor: ProfileScreen'in üyelik kartı ve paywall'ın
 * plan kartındaki eylem rozeti (premium'da "Aboneliği Yönet"). Durum makinesi
 * ekranlardan birinde kalırsa ikisi kaçınılmaz olarak ayrışıyor — ekranın biri
 * "iptal edildi" derken diğeri "abone ol" yazıyordu.
 *
 * Kaynak backend `/status`.status + `isActivelyPremium`. `Cancelled` ve
 * `BillingIssue`'da erişim AÇIK kalır (dönem sonu / grace bitişine kadar);
 * burada da kapatılmıyor, yalnız rozet + CTA değişiyor.
 */

export type SubscriptionViewKind =
  | "pending"
  | "billingIssue"
  | "cancelled"
  | "trial"
  | "active";

export type SubscriptionView = {
  kind: SubscriptionViewKind;
  /** Kartın sağ üstündeki durum rozeti ("Aktif" / "İptal edildi" …). */
  badge: string;
  /** Kartın gövde metni. */
  description: string;
  /** Yenileme / dönem sonu — ham ISO, biçimlendirme çağıranda. */
  expiresAt?: string | null;
  trialEndsAt?: string | null;
  /** `pending`teki manuel yenileme isteği uçuyor mu. */
  syncing: boolean;
};

// Abonelik tarihleri (yenileme / iptal geçerlilik / trial bitişi / grace).
// Aynı yıl içindeyse yıl gösterilmiyor. Geçersiz tarihte "" döner ki metin
// "undefined tarihine kadar" gibi bozulmasın.
export const formatSubscriptionDate = (
  iso: string | null | undefined,
): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

/**
 * Mağazanın abonelik ekranı. Aboneliği iptal/yenileme yalnız burada yapılabilir
 * — uygulama içinden değiştirilemiyor, o yüzden her "yönet" dokunuşunun tek
 * hedefi bu.
 */
export const openStoreSubscriptions = () => {
  const url =
    Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";
  Linking.openURL(url).catch(() => {});
};

export function useSubscriptionView(): SubscriptionView {
  const { t } = useTranslation();
  const expiresAt = useAppSelector((s) => (s as any).subscription?.expiresAt);
  const status = useAppSelector((s) => (s as any).subscription?.status);
  const isTrial = useAppSelector((s) => (s as any).subscription?.isTrial);
  const trialEndsAt = useAppSelector((s) => (s as any).subscription?.trialEndsAt);
  const graceEndsAt = useAppSelector(
    (s) => (s as any).subscription?.gracePeriodEndsAt,
  );
  const syncPending = useAppSelector(selectSyncPending);
  const syncing = useAppSelector((s) => Boolean((s as any).subscription?.syncing));
  // Yalnız dev teşhisi için — "aktivasyon sürüyor" kartında gösteriliyor.
  const lastSyncReason = useAppSelector(
    (s) => (s as any).subscription?.lastSyncReason as string | null,
  );

  return useMemo(() => {
    const base = { expiresAt, trialEndsAt, syncing };
    if (syncPending) {
      return {
        ...base,
        kind: "pending" as const,
        badge: t("profile.subscription.pendingBadge"),
        // Dev build'de `/sync`'in son `reason`'ı da yazılıyor: "aktivasyon
        // sürüyor" tek başına sorunun hangi tarafta olduğunu söylemiyor ve
        // cevabı cihaz logunda aramak gerekiyordu.
        //   NOT_FOUND_IN_RC     → RC'de bu kullanıcıda aktif abonelik yok
        //                         (prod backend + sandbox satın alma buraya düşer)
        //   RC_REST_UNAVAILABLE → backend'de RC REST anahtarı konfigüre değil
        //   RC_REST_ERROR       → backend RC'ye ulaşamadı
        description:
          __DEV__ && lastSyncReason
            ? `${t("profile.subscription.pendingDescription")}\n[dev] sync reason: ${lastSyncReason}`
            : t("profile.subscription.pendingDescription"),
      };
    }
    if (status === "BillingIssue") {
      return {
        ...base,
        kind: "billingIssue" as const,
        badge: t("profile.subscription.billingIssueBadge"),
        description: graceEndsAt
          ? t("profile.subscription.billingIssueDescription", {
              date: formatSubscriptionDate(graceEndsAt),
            })
          : t("profile.subscription.billingIssueDescriptionNoDate"),
      };
    }
    if (status === "Cancelled") {
      return {
        ...base,
        kind: "cancelled" as const,
        badge: t("profile.subscription.cancelledBadge"),
        description: expiresAt
          ? t("profile.subscription.cancelledDescription", {
              date: formatSubscriptionDate(expiresAt),
            })
          : t("profile.subscription.cancelledDescriptionNoDate"),
      };
    }
    if (isTrial) {
      return {
        ...base,
        kind: "trial" as const,
        badge: t("profile.subscription.trialBadge"),
        description: trialEndsAt
          ? t("profile.subscription.trialDescription", {
              date: formatSubscriptionDate(trialEndsAt),
            })
          : t("profile.subscription.trialDescriptionNoDate"),
      };
    }
    return {
      ...base,
      kind: "active" as const,
      badge: t("profile.subscription.status"),
      description: t("profile.subscription.activeDescription"),
    };
  }, [
    syncPending,
    lastSyncReason,
    status,
    isTrial,
    trialEndsAt,
    graceEndsAt,
    expiresAt,
    syncing,
    t,
  ]);
}

/**
 * "Yönet" dokunuşunun etiketi — duruma göre değişiyor ama hedefi hep aynı
 * (mağazanın abonelik ekranı). `pending` BURADA YOK: orada yapılacak şey
 * mağazaya gitmek değil `/status`ü yenilemek, o yüzden çağıran o durumu ayrıca
 * ele alıyor (bkz. ProfileScreen üyelik kartı).
 */
export function subscriptionManageLabel(
  kind: SubscriptionViewKind,
  t: (key: string) => string,
): string {
  if (kind === "billingIssue") return t("profile.subscription.fixPaymentButton");
  if (kind === "cancelled") return t("profile.subscription.resubscribeButton");
  return t("profile.subscription.manageButton");
}
