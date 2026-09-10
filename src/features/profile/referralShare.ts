import { useCallback } from "react";
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import i18n from "@/shared/i18n";
import { inviteLink } from "@/shared/constants/links";
import { showInfoToast } from "@/shared/services/toaster";
import { devLog } from "@/shared/utils/devLog";

/**
 * Davet kodunun iki çıkış yolu: panoya kopyala ve sistem paylaşım sayfası.
 *
 * İkisi de kartta VE sheet'te duruyor; mantık burada tek yerde toplandı ki
 * paylaşılan metin (ve içindeki mağaza linki) iki yüzeyde ayrışmasın.
 */

/**
 * Kodu panoya kopyalar ve teyit toast'ı gösterir.
 *
 * Toast şart: `setStringAsync` sessiz — kullanıcı bastıktan sonra kopyanın
 * gerçekleşip gerçekleşmediğini gösteren hiçbir işaret olmazdı.
 */
export function useCopyReferralCode() {
  const { t } = useTranslation();
  return useCallback(
    async (code?: string | null) => {
      if (!code) return;
      try {
        await Clipboard.setStringAsync(code);
        showInfoToast({ message: t("referral.copied"), variant: "success" });
      } catch (error) {
        devLog("⚠️ [referral] kod kopyalanamadı:", error);
      }
    },
    [t],
  );
}

/**
 * Sistem paylaşım sayfası. HOOK DEĞİL: bildirim/sheet gibi render dışından da
 * çağrılabilsin diye çeviri `i18n` instance'ından okunuyor (toaster.ts'teki
 * aynı gerekçe).
 *
 * Mesaj kodu VE davet linkini birlikte taşıyor — kodu alan kişi uygulamayı
 * ayrıca aramak zorunda kalmamalı. Link universal link: uygulama yüklüyse
 * doğrudan açılır ve kod dolu gelir (bkz. shared/constants/links.ts).
 */
export async function shareReferralCode(code?: string | null): Promise<void> {
  if (!code) return;
  try {
    await Share.share({
      message: i18n.t("referral.shareMessage", { code, url: inviteLink(code) }),
    });
  } catch (error) {
    // Kullanıcının paylaşım sayfasını kapatması da buraya düşebiliyor —
    // sessizce yutuluyor, gösterilecek bir hata yok.
    devLog("⚠️ [referral] paylaşım açılamadı:", error);
  }
}
