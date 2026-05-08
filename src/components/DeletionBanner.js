import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle } from "lucide-react-native";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";

export default function DeletionBanner() {
  const insets = useSafeAreaInsets();
  const [scheduled, setScheduled] = useState(false);
  const [deletionDate, setDeletionDate] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(API_ENDPOINTS.PRIVACY_DELETION_STATUS)
      .then((res) => {
        if (cancelled) return;
        if (res.result?.isDeletionScheduled) {
          setScheduled(true);
          setDeletionDate(res.result.deletionDate ?? null);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.post(API_ENDPOINTS.PRIVACY_CANCEL_DELETION);
      setScheduled(false);
      setDismissed(false);
    } catch {
      // silently ignore
    } finally {
      setCancelling(false);
    }
  };

  if (!scheduled || dismissed) return null;

  const formattedDate = deletionDate
    ? new Date(deletionDate).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <View
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 999,
        marginHorizontal: 12,
        marginTop: 8,
        backgroundColor: "#1a0608",
        borderRadius: 20,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(209,13,39,0.4)",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
      }}
    >
      <AlertTriangle size={18} color="#d10d27" strokeWidth={1.5} pointerEvents="none" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
          Hesabın silinmek üzere
        </Text>
        {formattedDate && (
          <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
            {formattedDate} tarihinde kalıcı olarak silinecek.
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={handleCancel}
        disabled={cancelling}
        activeOpacity={0.8}
        style={{
          borderRadius: 999,
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.2)",
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
            İptal Et
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
