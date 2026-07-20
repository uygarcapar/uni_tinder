import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Switch,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import {
  Download,
  Trash2,
  AlertCircle,
  Eye,
  BellOff,
  InfoIcon,
  Globe,
} from "lucide-react-native";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import chatService from "@/features/chat/chatService";
import profileService from "@/features/profile/profileService";
import { colors } from "../../../shared/theme/colors";
import { setLanguage } from "@/shared/store/settingsSlice";
import i18n from "@/shared/i18n";
import type { RootState } from "@/shared/store";

export default function SettingsModal({ visible, onClose }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const language = useSelector((s: RootState) => s.settings?.language ?? 'tr');

  const [downloadLoading, setDownloadLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const pollingRef = useRef(null);

  // Notification preferences (read receipt opt-out, skip push when online) — fresh fetch.
  useEffect(() => {
    let cancelled = false;
    chatService.getNotificationPreferences()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const togglePref = async (field) => {
    if (!prefs) return;
    const next = { ...prefs, [field]: !prefs[field] };
    setPrefs(next); // optimistic
    try {
      await chatService.updateNotificationPreferences(next);
    } catch (e) {
      setPrefs(prefs);
      Alert.alert(t('errors.generic'), t('errors.prefUpdate'));
    }
  };

  const handleLanguageSelect = (lang: 'tr' | 'en') => {
    dispatch(setLanguage(lang));
    i18n.changeLanguage(lang);
    profileService.updateProfile({ Language: lang }).catch(() => {});
  };

  // ── Verilerimi İndir ────────────────────────────────────────────────────────
  const handleDownloadData = async () => {
    setDownloadLoading(true);
    try {
      const res = await api.post(API_ENDPOINTS.PRIVACY_MY_DATA);
      if (!res.isSuccess) throw new Error(res.message);

      const requestId = res.result?.requestId;
      if (!requestId) throw new Error("requestId alınamadı");

      // Polling: 3 saniyede bir, max 20 deneme (~1 dk)
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await api.get(
            `${API_ENDPOINTS.PRIVACY_MY_DATA}/${requestId}`,
          );
          if (statusRes.result?.status === "completed" && statusRes.result?.fileUrl) {
            clearInterval(pollingRef.current);
            setDownloadLoading(false);
            Linking.openURL(statusRes.result.fileUrl);
          } else if (statusRes.result?.status === "failed" || attempts >= 20) {
            clearInterval(pollingRef.current);
            setDownloadLoading(false);
            Alert.alert(t('errors.generic'), t('errors.dataNotReady'));
          }
        } catch {
          clearInterval(pollingRef.current);
          setDownloadLoading(false);
        }
      }, 3000);
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
      Alert.alert(
        t('deleteAccount.successTitle'),
        t('deleteAccount.successMsg'),
        [{ text: t('common.ok'), onPress: onClose }],
      );
    } catch (e) {
      Alert.alert(t('errors.generic'), e.message || t('errors.operationFailed'));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('settings.title')}
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36 }}
    >
      {/* Mesajlaşma Bölümü */}
      <SettingsSection
        title={t('settings.messaging.title')}
        subtitle={t('settings.messaging.subtitle')}
        marginTop={20}
      />

      {/* Read receipt opt-out */}
      <SettingsToggleRow
        icon={<Eye size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.readReceipts.title')}
        subtitle={t('settings.readReceipts.subtitle')}
        value={prefs?.showReadReceipts ?? true}
        disabled={!prefs}
        onToggle={() => togglePref('showReadReceipts')}
      />

      {/* Skip push when online */}
      <SettingsToggleRow
        icon={<BellOff size={18} color={colors.text} strokeWidth={1.5} />}
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
            <Download size={18} color={colors.text} strokeWidth={2} pointerEvents="none" />
          )}
        </View>
      </TouchableOpacity>

      {/* Hesap Bölümü */}
      <SettingsSection
        title={t('settings.account.title')}
        subtitle={t('settings.account.subtitle')}
      />

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
            <Text style={{ color: colors.errorStrong, fontSize: 15, fontWeight: "500" }}>
              {t('settings.deleteAccount')}
            </Text>
          </View>
          {deleteLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.errorStrong}
              style={{ width: 18, height: 18 }}
            />
          ) : (
            <Trash2 size={18} color={colors.errorStrong} strokeWidth={1.5} pointerEvents="none" />
          )}
        </View>
      </TouchableOpacity>

      {/* Dil Bölümü */}
      <SettingsSection title={t('settings.language')} marginTop={28} />
      <SettingsLanguageRow
        language={language}
        onSelect={handleLanguageSelect}
      />
    </AppModal>
  );
}

// Section header — EditModal/EditProfileForm patterniyle aynı: büyük beyaz başlık + InfoIcon + gri açıklama.
function SettingsSection({ title, subtitle, marginTop = 28 }: any) {
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
          <InfoIcon size={16} color={colors.textSecondary} />
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
function SettingsToggleRow({ icon, title, subtitle, value, disabled, onToggle }: any) {
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
        paddingHorizontal: 20,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Globe size={18} color={colors.text} strokeWidth={1.5} />
      </View>
      <View
        style={{
          flexDirection: "row",
          borderRadius: 20,
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.15)",
          overflow: "hidden",
        }}
      >
        {(['tr', 'en'] as const).map((lang, idx) => (
          <TouchableOpacity
            key={lang}
            onPress={() => onSelect(lang)}
            activeOpacity={0.7}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 16,
              backgroundColor:
                language === lang ? colors.text : "transparent",
              borderRightWidth: idx === 0 ? 0.5 : 0,
              borderRightColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: language === lang ? "#121212" : colors.textSecondary,
              }}
            >
              {lang === 'tr' ? 'Türkçe' : 'English'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
