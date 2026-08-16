import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
  Switch,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/shared/hooks/redux";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import {
  Download,
  Trash2,
  Eye,
  BellOff,
  InfoIcon,
  ChevronRight,
  LogOut,
} from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import BlockedUsersModal from "@/features/profile/components/BlockedUsersModal";
import { useQueryClient } from "@tanstack/react-query";
import api, { refreshAccessToken } from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { swipeKeys } from "@/features/discover/swipeKeys";
import chatService from "@/features/chat/chatService";
import profileService from "@/features/profile/profileService";
import { logout } from "@/features/auth/authSlice";
import {
  buildIapReport,
  clearIapDiagnostics,
} from "@/features/profile/purchaseDiagnostics";
import {
  premiumSyncUserKey,
  readPendingPremiumSync,
} from "@/features/profile/pendingPremiumSync";
import { readPendingRedeems } from "@/features/discover/superlikeRedeem";
import { colors } from "../../../shared/theme/colors";
import { setLanguage } from "@/shared/store/settingsSlice";
import i18n from "@/shared/i18n";
import { getDateLocale } from "@/shared/i18n/dateLocale";
import type { RootState } from "@/shared/store";

export default function SettingsModal({ visible, onClose }: any) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  const language = useSelector((s: RootState) => s.settings?.language ?? 'tr');
  const authUser = useSelector((s: RootState) => s.auth?.user);
  const subscription = useSelector((s: RootState) => s.subscription);

  const [downloadLoading, setDownloadLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const pollingRef = useRef(null);

  // Notification preferences — YALNIZ modal açılınca çek (bir kez). ÖNCESİ mount'ta
  // koşulsuz çekiyordu; SettingsModal iki yerde (ProfileScreen + AppNavigator)
  // gizli mount edildiği için cold-boot'ta preferences ×2 atıyordu. visible gate
  // + fetchedRef → boot'ta hiç atmaz, açılınca tek sefer.
  const prefsFetchedRef = useRef(false);
  useEffect(() => {
    if (!visible || prefsFetchedRef.current) return;
    prefsFetchedRef.current = true;
    let cancelled = false;
    chatService.getNotificationPreferences()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible]);

  // Export polling'i unmount'ta durdur — modal kapanıp component düşerse
  // interval arkada dönmeye devam ediyordu.
  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  const togglePref = async (field) => {
    if (!prefs) return;
    const next = { ...prefs, [field]: !prefs[field] };
    setPrefs(next); // optimistic
    try {
      await chatService.updateNotificationPreferences(next);
    } catch {
      setPrefs(prefs);
      Alert.alert(t('errors.generic'), t('errors.prefUpdate'));
    }
  };

  // Arayüz dili i18n ile ANINDA değişiyor. Sunucudan gelen metinler (keşif
  // kartlarındaki hobiler, konuşulan diller, evcil hayvan vb.) ise JWT'deki
  // `language` claim'ine bakıyor ve claim token yenilenene kadar — yani 2 saate
  // kadar — eski dilde kalıyor. Profil güncellendikten SONRA token'ı tazeleyip
  // desteyi invalidate ediyoruz ki kartlar da yeni dile geçsin.
  //
  // Zincir await EDİLMİYOR: dil seçimi UI'da beklemesin, ağ hatası da seçimi
  // geri almasın. Token tazelenemezse tek kayıp, kartların bir sonraki doğal
  // yenilenmeye kadar eski dilde kalması.
  const handleLanguageSelect = (lang: 'tr' | 'en') => {
    dispatch(setLanguage(lang));
    i18n.changeLanguage(lang);
    profileService
      .updateProfile({ Language: lang })
      .then(() => refreshAccessToken())
      .then((token) => {
        if (token) qc.invalidateQueries({ queryKey: swipeKeys.matches });
      })
      .catch(() => {});
  };

  // ── Satın alma teşhis raporu (gizli) ───────────────────────────────────────
  //
  // Alttaki ortam satırına UZUN BASINCA açılır. Ürün özelliği değil, teşhis
  // aracı: "premium aldım gitti / superlike hiç gelmiyor" akışında cihazdan
  // kanıt çıkarmanın tek pratik yolu. TestFlight'ta Metro konsolu yok ve
  // Console.app için kablo gerekiyor; rapor panoya kopyalanıp doğrudan
  // yapıştırılabiliyor.
  //
  // Metinler i18n'e taşınmadı (bilinçli): buradan yalnız geliştirici geçiyor,
  // çıktının tamamı zaten TR teşhis metni.
  const handleDiagnostics = async () => {
    const uid = premiumSyncUserKey(authUser);
    const pending = readPendingPremiumSync(uid);
    const queue = uid ? readPendingRedeems(uid) : [];
    const report = buildIapReport({
      backendUserId: uid,
      reduxPremium: subscription?.isPremium ?? null,
      reduxSyncPending: subscription?.syncPending ?? null,
      sonSyncReason: subscription?.lastSyncReason ?? null,
      bekleyenPremium: pending
        ? `${pending.productId ?? "?"} · ${pending.attempts} deneme · ${Math.round(
            (Date.now() - pending.at) / 60000,
          )}dk`
        : "yok",
      bekleyenRedeem: queue.length
        ? queue.map((q) => `${q.productId}#${q.transactionId}@${q.attempts ?? 0}`).join(", ")
        : "yok",
    });
    await Clipboard.setStringAsync(report).catch(() => {});
    Alert.alert(
      "Satın alma teşhis raporu",
      "Rapor panoya kopyalandı.\n\n" + report.slice(0, 500) + "\n…",
      [
        { text: "Paylaş", onPress: () => { Share.share({ message: report }).catch(() => {}); } },
        {
          text: "Kaydı sıfırla",
          style: "destructive",
          onPress: () => clearIapDiagnostics(),
        },
        { text: "Kapat", style: "cancel" },
      ],
    );
  };

  // ── Çıkış Yap ─────────────────────────────────────────────────────────────
  const handleLogout = () =>
    Alert.alert(t('profile.logout.title'), t('profile.logout.message'), [
      { text: t('common.cancel'), style: "cancel" },
      {
        text: t('profile.logout.confirmButton'),
        style: "destructive",
        onPress: () => {
          onClose?.();
          dispatch(logout());
        },
      },
    ]);

  // ── Verilerimi İndir ────────────────────────────────────────────────────────
  const handleDownloadData = async () => {
    setDownloadLoading(true);
    try {
      const res = await api.post(API_ENDPOINTS.PRIVACY_MY_DATA);
      if (!res.isSuccess) throw new Error(res.message);

      const requestId = res.result?.requestId;
      if (!requestId) throw new Error("requestId alınamadı");

      // Polling: 5 saniyede bir, max 60 deneme (~5 dk). Backend export'u async
      // hazırlıyor ve "birkaç dakika" sürebiliyor — eski 1 dk'lık pencere hazır
      // olan export'ta bile timeout'a düşüyordu.
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await api.get(
            API_ENDPOINTS.PRIVACY_MY_DATA_STATUS(requestId),
          );
          // Backend status'ü PascalCase döner ("Completed"/"Failed"/"Pending").
          // Küçük harfle karşılaştırmak hazır export'u hiç yakalamıyordu.
          const status = String(statusRes.result?.status ?? "").toLowerCase();
          if (status === "completed" && statusRes.result?.fileUrl) {
            clearInterval(pollingRef.current);
            setDownloadLoading(false);
            Linking.openURL(statusRes.result.fileUrl);
          } else if (status === "failed" || attempts >= 60) {
            clearInterval(pollingRef.current);
            setDownloadLoading(false);
            Alert.alert(t('errors.generic'), t('errors.dataNotReady'));
          }
        } catch {
          clearInterval(pollingRef.current);
          setDownloadLoading(false);
        }
      }, 5000);
    } catch (e) {
      setDownloadLoading(false);
      Alert.alert(t('errors.generic'), e.message || t('errors.requestFailed'));
    }
  };

  // ── Hesabı Sil ──────────────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccount.alertTitle'),
      t('deleteAccount.alertMsg'),
      [
        { text: t('deleteAccount.cancel'), style: "cancel" },
        {
          text: t('deleteAccount.confirm'),
          style: "destructive",
          onPress: confirmDelete,
        },
      ],
    );
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await api.post(API_ENDPOINTS.PRIVACY_DELETE_ACCOUNT, {});
      if (!res.isSuccess) throw new Error(res.message);
      // Backend gerçek silinme tarihini + kalan gün sayısını dönüyor; sabit
      // "30 gün" metni yerine onu göster.
      const scheduledAt = res.result?.scheduledDeletionAt;
      const daysRemaining = res.result?.daysRemaining;
      const message = scheduledAt
        ? t('deleteAccount.successMsgDated', {
            date: new Date(scheduledAt).toLocaleDateString(getDateLocale(), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            days: daysRemaining ?? 30,
          })
        : t('deleteAccount.successMsg');
      Alert.alert(
        t('deleteAccount.successTitle'),
        message,
        [{ text: t('common.ok'), onPress: onClose }],
      );
    } catch (e) {
      Alert.alert(t('errors.generic'), e.message || t('errors.operationFailed'));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('settings.title')}
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36, paddingBottom: 100 }}
    >
      {/* Mesajlaşma Bölümü */}
      <SettingsSection
        title={t('settings.messaging.title')}
        subtitle={t('settings.messaging.subtitle')}
        marginTop={20}
      />

      {/* Read receipt opt-out */}
      <SettingsToggleRow
        icon={<SFIcon name="eye.fill" fallback={Eye} size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.readReceipts.title')}
        subtitle={t('settings.readReceipts.subtitle')}
        value={prefs?.showReadReceipts ?? true}
        disabled={!prefs}
        onToggle={() => togglePref('showReadReceipts')}
      />

      {/* Skip push when online */}
      <SettingsToggleRow
        icon={<SFIcon name="bell.slash.fill" fallback={BellOff} size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.muteOnline.title')}
        subtitle={t('settings.muteOnline.subtitle')}
        value={prefs?.skipPushWhenOnline ?? false}
        disabled={!prefs}
        onToggle={() => togglePref('skipPushWhenOnline')}
      />

      {/* Gizlilik Bölümü */}
      <SettingsSection
        title={t('settings.privacy.title')}
        subtitle={t('settings.privacy.subtitle')}
      />

      {/* Verilerimi İndir */}
      <TouchableOpacity
        onPress={handleDownloadData}
        disabled={downloadLoading}
        activeOpacity={0.8}
        style={{
          borderRadius: 36,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.1)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingHorizontal: 20,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
              {t('settings.downloadData')}
            </Text>
          </View>
          {downloadLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.textSecondary}
              style={{ width: 18, height: 18 }}
            />
          ) : (
            <SFIcon name="square.and.arrow.down" fallback={Download} size={18} color={colors.text} strokeWidth={2} weight="semibold" style={{ pointerEvents: "none" }} />
          )}
        </View>
      </TouchableOpacity>

      {/* Engellenenler */}
      <TouchableOpacity
        onPress={() => setBlockedVisible(true)}
        activeOpacity={0.8}
        style={{
          borderRadius: 36,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.1)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
              {t('settings.blockedUsers')}
            </Text>
          </View>
          <SFIcon name="chevron.right" fallback={ChevronRight} size={18} color={colors.textSecondary} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        </View>
      </TouchableOpacity>

      {/* Dil Bölümü */}
      <SettingsSection
        title={t('settings.language.title')}
        subtitle={t('settings.language.subtitle')}
      />
      <SettingsLanguageRow
        language={language}
        onSelect={handleLanguageSelect}
      />

      {/* Hesap Bölümü */}
      <SettingsSection
        title={t('settings.account.title')}
        subtitle={t('settings.account.subtitle')}
      />

      {/* Çıkış Yap */}
      <TouchableOpacity
        onPress={handleLogout}
        activeOpacity={0.8}
        style={{
          borderRadius: 36,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.1)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingHorizontal: 20,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
              {t('profile.logout.button')}
            </Text>
          </View>
          <SFIcon name="rectangle.portrait.and.arrow.right" fallback={LogOut} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        </View>
      </TouchableOpacity>

      {/* Hesabı Sil */}
      <TouchableOpacity
        onPress={handleDeleteAccount}
        disabled={deleteLoading}
        activeOpacity={0.8}
        style={{
          borderRadius: 36,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: colors.errorStrong,
          backgroundColor: colors.errorStrong,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#000", fontSize: 15, fontWeight: "500" }}>
              {t('settings.deleteAccount')}
            </Text>
          </View>
          {deleteLoading ? (
            <ActivityIndicator
              size="small"
              color="#000"
              style={{ width: 18, height: 18 }}
            />
          ) : (
            <SFIcon name="trash.fill" fallback={Trash2} size={18} color="#000" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
          )}
        </View>
      </TouchableOpacity>

      {/* Ortam satırı — normal basışta hiçbir şey yapmaz, UZUN BASINCA satın
          alma teşhis raporunu panoya kopyalar (bkz. handleDiagnostics). */}
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={handleDiagnostics}
        delayLongPress={1200}
        style={{ marginTop: 24, paddingVertical: 8, alignItems: "center" }}
      >
        <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
          {`LIT · ${__DEV__ ? "dev" : "release"}`}
        </Text>
      </TouchableOpacity>
    </AppModal>

    <BlockedUsersModal
      visible={blockedVisible}
      onClose={() => setBlockedVisible(false)}
    />
    </>
  );
}

// Section header — EditModal/EditProfileForm patterniyle aynı: büyük beyaz başlık + InfoIcon + gri açıklama.
// Bölümler arası boşluk da oradan geliyor: EditProfileForm'da dış sarmalayıcının
// marginTop'u (28) ile başlık bloğunun marginTop'u (12) toplanıp 40 ediyor.
// Burada tek View olduğu için toplam doğrudan yazılı (FilterSection'la aynı).
function SettingsSection({ title, subtitle, marginTop = 40 }: any) {
  return (
    <View
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        marginTop,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: "600",
          marginBottom: subtitle ? 6 : 0,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingRight: 16,
          }}
        >
          <SFIcon name="info.circle" fallback={InfoIcon} size={16} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {subtitle}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Reusable toggle row — icon + title + subtitle + Switch.
// Optimistic toggle pattern: parent state'i hemen değişir, fail durumunda rollback.
function SettingsToggleRow({ icon: _icon, title, subtitle: _subtitle, value, disabled, onToggle }: any) {
  return (
    <View
      style={{
        borderRadius: 36,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
            {title}
          </Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{false: "rgba(255,255,255,0.15)",true: colors.successIos, }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

function SettingsLanguageRow({ language, onSelect }: { language: 'tr' | 'en'; onSelect: (lang: 'tr' | 'en') => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(['tr', 'en'] as const).map((lang) => {
        const isSelected = language === lang;
        return (
          <TouchableOpacity
            key={lang}
            onPress={() => onSelect(lang)}
            activeOpacity={1}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              paddingHorizontal: 12,
              paddingVertical: 11,
              borderWidth: 0.5,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: isSelected ? colors.text : "transparent",
              borderColor: isSelected ? colors.text : "rgba(255,255,255,0.1)",
            }}
          >
            <Text
              style={{
                color: isSelected ? "#000" : colors.textSecondary,
                fontSize: 13,
                fontWeight: "500",
              }}
            >
              {lang === 'tr' ? 'Türkçe' : 'English'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
