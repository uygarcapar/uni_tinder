import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { getDateLocale } from "@/shared/i18n/dateLocale";
import { colors, ink } from "../../../shared/theme/colors";

export default function DeletionBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [scheduled, setScheduled] = useState(false);
  const [deletionDate, setDeletionDate] = useState(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(API_ENDPOINTS.PRIVACY_DELETION_STATUS)
      .then((res) => {
        if (cancelled) return;
        // GET /api/privacy/deletion-status →
        //   { deletionScheduled, requestedAt, scheduledDeletionAt, daysRemaining }
        // Banner eskiden `isDeletionScheduled` / `deletionDate` okuyordu; ikisi de
        // backend'de yok → her zaman undefined → banner hiç render olmuyordu,
        // kullanıcı 30 günlük geri alma penceresini göremiyordu.
        if (!res.result?.deletionScheduled) return;
        setScheduled(true);
        setDeletionDate(res.result.scheduledDeletionAt ?? null);
        setDaysRemaining(
          typeof res.result.daysRemaining === "number" ? res.result.daysRemaining : null,
        );
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
    ? new Date(deletionDate).toLocaleDateString(getDateLocale(), {
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
        backgroundColor: colors.dangerSurface,
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
      <SFIcon name="exclamationmark.triangle.fill" fallback={AlertTriangle} size={18} color={colors.errorStrong} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
          {t('deleteAccount.bannerTitle')}
        </Text>
        {formattedDate && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {daysRemaining != null
              ? t('deleteAccount.bannerDatedWithDays', { date: formattedDate, days: daysRemaining })
              : t('deleteAccount.bannerDated', { date: formattedDate })}
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
          borderColor: ink(0.2),
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
            {t('deleteAccount.bannerUndo')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
