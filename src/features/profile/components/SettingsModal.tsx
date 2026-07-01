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
import AppModal from "@/shared/components/AppModal";
import {
  Download,
  Trash2,
  AlertCircle,
  Eye,
  BellOff,
  InfoIcon,
} from "lucide-react-native";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import chatService from "@/features/chat/chatService";
import { colors } from "../../../shared/theme/colors";

export default function SettingsModal({ visible, onClose }: any) {
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
      Alert.alert("Hata", "Tercih güncellenemedi.");
    }
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
            Alert.alert("Hata", "Veri hazırlanamadı, tekrar dene.");
          }
        } catch {
          clearInterval(pollingRef.current);
          setDownloadLoading(false);
        }
      }, 3000);
    } catch (e) {
      setDownloadLoading(false);
      Alert.alert("Hata", e.message || "İstek gönderilemedi.");
    }
  };

  // ── Hesabı Sil ──────────────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      "Hesabı Sil",
      "Hesabın 30 gün boyunca askıya alınır. Bu süre içinde giriş yaparak geri dönebilirsin. 30 gün sonra kalıcı olarak silinir.",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Devam Et",
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
        "Hesap Silme Başlatıldı",
        "Hesabın 30 gün içinde silinecek. Bu süre içinde giriş yaparak iptal edebilirsin.",
        [{ text: "Tamam", onPress: onClose }],
      );
    } catch (e) {
      Alert.alert("Hata", e.message || "İşlem gerçekleştirilemedi.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Ayarlar"
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36 }}
    >
      {/* Mesajlaşma Bölümü */}
      <SettingsSection
        title="Mesajlaşma"
        subtitle="Sohbet ve bildirim davranışını kontrol et."
        marginTop={20}
      />

      {/* Read receipt opt-out */}
      <SettingsToggleRow
        icon={<Eye size={18} color={colors.text} strokeWidth={1.5} />}
        title="Okundu Bilgisi"
        subtitle="Mesajları okuduğunda partner görsün"
        value={prefs?.showReadReceipts ?? true}
        disabled={!prefs}
        onToggle={() => togglePref('showReadReceipts')}
      />

      {/* Skip push when online */}
      <SettingsToggleRow
        icon={<BellOff size={18} color={colors.text} strokeWidth={1.5} />}
        title="Online'ken Bildirim Susturma"
        subtitle="Uygulama açıkken push bildirimi alma"
        value={prefs?.skipPushWhenOnline ?? false}
        disabled={!prefs}
        onToggle={() => togglePref('skipPushWhenOnline')}
      />

      {/* Gizlilik Bölümü */}
      <SettingsSection
        title="Gizlilik"
        subtitle="Verilerin üzerinde tam kontrol sende."
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
              Verilerimi İndir
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
        title="Hesap"
        subtitle="Hesabını silersen 30 gün içinde geri dönebilirsin."
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
              Hesabı Sil
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
