import { useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Switch,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import BlurBottomSheetBackdrop from "./BlurBottomSheetBackdrop";
import { X, Download, Trash2, AlertCircle, Eye, BellOff } from "lucide-react-native";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import chatService from "../services/chatService";

export default function SettingsModal({ bottomSheetRef, onClose }) {
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

  const renderBackdrop = useCallback(
    (props) => <BlurBottomSheetBackdrop {...props} onPress={onClose} />,
    [onClose],
  );

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
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["90%"]}
      enablePanDownToClose={true}
      enableOverDrag={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.3)" }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 12,
          backgroundColor: "#121212",
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{ width: 60 }}
        >
          <X size={22} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            color: "#fff",
            fontSize: 15,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Ayarlar
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        {/* Mesajlaşma Bölümü */}
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            fontWeight: "700",
            marginTop: 20,
            marginBottom: 12,
            marginLeft: 4,
          }}
        >
          Mesajlaşma
        </Text>

        {/* Read receipt opt-out */}
        <SettingsToggleRow
          icon={<Eye size={20} color="#fff" strokeWidth={1.5} />}
          title="Okundu Bilgisi"
          subtitle="Mesajları okuduğunda partner görsün"
          value={prefs?.showReadReceipts ?? true}
          disabled={!prefs}
          onToggle={() => togglePref('showReadReceipts')}
        />

        {/* Skip push when online */}
        <SettingsToggleRow
          icon={<BellOff size={20} color="#fff" strokeWidth={1.5} />}
          title="Online'ken Bildirim Susturma"
          subtitle="Uygulama açıkken push bildirimi alma"
          value={prefs?.skipPushWhenOnline ?? false}
          disabled={!prefs}
          onToggle={() => togglePref('skipPushWhenOnline')}
        />

        {/* Gizlilik Bölümü */}
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            fontWeight: "700",
            marginTop: 24,
            marginBottom: 12,
            marginLeft: 4,
          }}
        >
          Gizlilik
        </Text>

        {/* Verilerimi İndir */}
        <TouchableOpacity
          onPress={handleDownloadData}
          disabled={downloadLoading}
          activeOpacity={0.8}
          style={{
            borderRadius: 40,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.1)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 18,
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Download size={20} color="#fff" strokeWidth={1.5} pointerEvents="none" />
            <View>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
                Verilerimi İndir
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                Tüm verilerinin bir kopyasını al
              </Text>
            </View>
          </View>
          {downloadLoading && (
            <ActivityIndicator size="small" color="#9CA3AF" />
          )}
        </TouchableOpacity>

        {/* Hesap Bölümü */}
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            fontWeight: "700",
            marginTop: 24,
            marginBottom: 12,
            marginLeft: 4,
          }}
        >
          Hesap
        </Text>

        {/* Hesabı Sil */}
        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={deleteLoading}
          activeOpacity={0.8}
          style={{
            borderRadius: 40,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.1)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 18,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Trash2 size={20} color="#d10d27" strokeWidth={1.5} pointerEvents="none" />
            <View>
              <Text style={{ color: "#d10d27", fontSize: 14, fontWeight: "500" }}>
                Hesabı Sil
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                30 gün geri dönüş hakkın olur
              </Text>
            </View>
          </View>
          {deleteLoading && (
            <ActivityIndicator size="small" color="#d10d27" />
          )}
        </TouchableOpacity>

        {/* Grace Period Notu */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 12,
            paddingHorizontal: 4,
          }}
        >
          <AlertCircle size={14} color="#6B7280" strokeWidth={1.5} pointerEvents="none" style={{ marginTop: 1 }} />
          <Text style={{ color: "#6B7280", fontSize: 12, lineHeight: 18, flex: 1 }}>
            Hesabını sildikten sonra 30 gün boyunca tekrar giriş yaparak işlemi iptal edebilirsin.
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// Reusable toggle row — icon + title + subtitle + Switch.
// Optimistic toggle pattern: parent state'i hemen değişir, fail durumunda rollback.
function SettingsToggleRow({ icon, title, subtitle, value, disabled, onToggle }) {
  return (
    <View
      style={{
        borderRadius: 40,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 18,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
            {title}
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: "#3a3a3a", true: "#f57656" }}
        thumbColor="#fff"
        ios_backgroundColor="#3a3a3a"
      />
    </View>
  );
}
