import { fetchChatQuota } from "@/features/chat/chatSlice";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { analytics } from "@/shared/services/analytics";
import { store } from "@/shared/store";

/**
 * Kota dolduğunda TEK çıkış: Premium modalı (consumable "sohbeti aç" akışı
 * 2026-08-02'de kaldırıldı). Huni: chat_quota_exhausted →
 * chat_quota_paywall_viewed → subscription_initial_purchase.
 *
 * §11: modalı açmadan önce canonical premium state'i tazele — kullanıcı başka
 * bir cihazdan premium olmuş olabilir. Premium çıkarsa kotayı yeniliyoruz
 * (sohbet zaten sınırsıza dönmüştür) ve paywall açılmıyor; huni eventi de o
 * durumda yazılmıyor, "görüntülendi" sayısı şişmesin.
 *
 * EKRAN DIŞINDA: gövde ChatScreen'den taşındı çünkü gönderim yolu artık
 * outbox'ta yaşıyor ve oradan da tetiklenebilmesi gerekiyor. `openLitPlus`
 * zaten `navigationRef` üzerinden çalışan modül seviyesi bir giriş; tek
 * bağımlılık `dispatch`ti, o da store'dan okunuyor (precedent: AppNavigator,
 * DiscoverScreen, MessagesScreen).
 */
export function openQuotaPaywall(conversationId: string, source: string): void {
  (store.dispatch as any)(refreshEntitlementsForPaywall())
    .unwrap()
    .then((premium: boolean) => {
      if (premium) {
        (store.dispatch as any)(fetchChatQuota({ conversationId, force: true }));
        return;
      }
      analytics.capture("chat_quota_paywall_viewed", { conversationId, source });
      openLitPlus();
    })
    .catch(() => {
      // Tazeleme başarısız → eski davranış: paywall'ı yine aç.
      analytics.capture("chat_quota_paywall_viewed", { conversationId, source });
      openLitPlus();
    });
}
