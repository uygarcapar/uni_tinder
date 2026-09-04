import { useMemo } from "react";
import { Linking, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/shared/hooks/redux";
import { selectSyncPending } from "@/features/profile/subscriptionSlice";

/**
 * Abonelik durum makinesi — TEK KAYNAK.
 *
 * Tek tüketicisi paywall'ın plan kartı (ProfileScreen'in üyelik kartı silindi):
 * abonede kartın alt satırını bu makine yazıyor — olağan hâlde yalnız bilgi
 * ("Yenileme 12 Eyl"), sorunlu hâlde eylem. Durum makinesi ekranın içinde
 * kalsaydı yeni bir yüzey aynı cümleleri baştan uydurmak zorunda kalırdı.
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
 * Abonenin ekranında MAĞAZAYA GİDEN bir buton olmalı mı?
 *
 * Yalnız yapılacak bir iş varken: ödeme yöntemi düzeltilecek ya da iptal
 * geri alınacak. İkisi de uygulama içinden yapılamıyor, tek yer mağaza —
 * bu iki durumda linki kaldırmak kullanıcıyı çaresiz bırakırdı.
 *
 * OLAĞAN aboneliğe (aktif / deneme) buton YOK: orada "Aboneliği Yönet"
 * yapacak bir iş önermiyor, yalnızca kartı mağazaya açılan bir kapıya
 * çeviriyordu. Onun yerine yalnız bilgi duruyor (bkz.
 * subscriptionRenewalNote). `pending` de burada değil: oradaki iş mağazaya
 * gitmek değil `/status`ü beklemek.
 */
export function subscriptionNeedsStoreAction(
  kind: SubscriptionViewKind,
): boolean {
  return kind === "billingIssue" || kind === "cancelled";
}

/**
 * "Yönet" dokunuşunun etiketi — duruma göre değişiyor ama hedefi hep aynı
 * (mağazanın abonelik ekranı). YALNIZ `subscriptionNeedsStoreAction` true'yken
 * anlamlı; `manageButton` fallback'i sadece beklenmedik bir durum eklenirse
 * etiketsiz buton çıkmasın diye duruyor.
 */
export function subscriptionManageLabel(
  kind: SubscriptionViewKind,
  t: (key: string) => string,
): string {
  if (kind === "billingIssue") return t("profile.subscription.fixPaymentButton");
  if (kind === "cancelled") return t("profile.subscription.resubscribeButton");
  return t("profile.subscription.manageButton");
}

/**
 * Abone kartının GÖVDE cümlesi — satın alınabilir kartta fiyatın ve plan
 * cümlesinin (`purchase.planDesc.*`) durduğu yer.
 *
 * Aboneye satış cümlesi yazmıyor: kart artık bir SATIŞ yüzeyi değil, aboneliğin
 * durum yüzeyi. (Eskiden orada tek bir sabit cümle vardı — "Artılardan
 * faydalanıyorsun" — ve altında satın alma için yazılmış plan cümlesi; ikisi de
 * ödeyen kullanıcıya bir şey söylemiyordu.)
 *
 * Durumun KELİMESİNİ tekrar etmiyor ("Aktif" / "Deneme" …): onu ad satırındaki
 * çerçeveli rozet söylüyor (bkz. PurchaseSections > PlanStatusPill). Burada
 * yalnız o durumun ne anlama geldiği var.
 *
 * TARİH yalnız `cancelled`ta: aktif ve denemede tarihi kartın alt satırı zaten
 * yazıyor (bkz. subscriptionRenewalNote), iptalde ise o satırın yerini mağaza
 * butonu alıyor — tarih başka yerde geçmiyor. `billingIssue`ta grace bitişi bu
 * görünümde taşınmıyor, o yüzden cümle tarihsiz.
 */
export function subscriptionCardNote(
  view: SubscriptionView,
  t: (key: string, opts?: any) => string,
): string {
  if (view.kind === "pending") return t("profile.subscription.cardNotePending");
  if (view.kind === "billingIssue") {
    return t("profile.subscription.cardNoteBillingIssue");
  }
  if (view.kind === "cancelled") {
    const date = formatSubscriptionDate(view.expiresAt);
    return date
      ? t("profile.subscription.cardNoteCancelledDate", { date })
      : t("profile.subscription.cardNoteCancelled");
  }
  if (view.kind === "trial") return t("profile.subscription.cardNoteTrial");
  return t("profile.subscription.cardNoteActive");
}

/**
 * Olağan abonelikte kartın alt satırı: "Yenileme 12 Eyl" — eylem değil, BİLGİ.
 *
 * `label` + `date` ayrı dönüyor çünkü çağıran ikisini farklı mürekkeple
 * yazıyor (etiket soluk, tarih okunur). Tarih bilinmiyorsa `date` boş: satır
 * o zaman yalnız durumu söyler, "Yenileme " diye yarım kalmaz.
 *
 * `null` = yazacak bir şey yok (aktif abonelikte tarih de gelmemiş).
 */
export function subscriptionRenewalNote(
  view: SubscriptionView,
  t: (key: string) => string,
): { label: string; date: string } | null {
  // Mağaza onayı beklenirken tarih henüz YOK (satın alma backend'e ulaşmadı) —
  // satırın söyleyeceği tek doğru şey durumun kendisi.
  if (view.kind === "pending") {
    return { label: t("profile.subscription.pendingBadge"), date: "" };
  }
  const isEnding = view.kind === "trial" || view.kind === "cancelled";
  const date = formatSubscriptionDate(
    view.kind === "trial" && view.trialEndsAt ? view.trialEndsAt : view.expiresAt,
  );
  if (!date) return null;
  return {
    // Deneme ve iptal edilmiş abonelik YENİLENMİYOR: ikisinde de tarih bir
    // bitiş ("Bitiş 12 Eyl"), yenileme değil.
    label: t(
      isEnding
        ? "profile.subscription.trialEndsLabel"
        : "profile.subscription.renewalLabel",
    ),
    date,
  };
}
