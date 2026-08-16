import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { UserX } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import EmptyState from "@/shared/components/EmptyState";
import moderationService, { BlockedUser } from "@/shared/services/moderationService";
import { getDateLocale } from "@/shared/i18n/dateLocale";
import { colors } from "../../../shared/theme/colors";

/**
 * GET /api/moderation/blocked-users — kart bilgileriyle (isim/yaş/üniversite/foto)
 * engellenenler listesi + engel kaldırma. Eski /blocks yalnızca id listesi
 * döndürdüğü için burada kullanılmıyor.
 */
export default function BlockedUsersModal({ visible, onClose }: any) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Modal her açılışında tazele — kullanıcı bu arada başka bir ekrandan
  // birini engellemiş olabilir.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    moderationService
      .getBlockedUsers()
      .then((list) => { if (!cancelled) setUsers(list); })
      .catch(() => {
        if (cancelled) return;
        setUsers([]);
        Alert.alert(t('errors.generic'), t('moderation.blocked.loadError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, t]);

  const handleUnblock = useCallback((user: BlockedUser) => {
    Alert.alert(
      t('moderation.blocked.unblockConfirmTitle'),
      t('moderation.blocked.unblockConfirmMessage', { name: user.displayName }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('moderation.blocked.unblockConfirm'),
          style: "destructive",
          onPress: async () => {
            setPendingId(user.userId);
            try {
              await moderationService.unblockUser(user.userId);
              if (!mountedRef.current) return;
              setUsers((prev) => (prev ?? []).filter((u) => u.userId !== user.userId));
            } catch {
              if (!mountedRef.current) return;
              Alert.alert(t('errors.generic'), t('moderation.blocked.unblockError'));
            } finally {
              if (mountedRef.current) setPendingId(null);
            }
          },
        },
      ],
    );
  }, [t]);

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('moderation.blocked.title')}
      // "push" → SettingsModal altta mount'lu kalır, bu sheet üstüne biner.
      // Default ("replace") altındaki sheet'i dismiss ediyordu: X'e basınca
      // veya aşağı sürükleyince ayarlara dönmek yerine her şey kapanıyordu.
      stackBehavior="push"
      contentContainerStyle={{ paddingTop: 24, paddingBottom: 32 }}
    >
      {loading && users === null ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      ) : (users?.length ?? 0) === 0 ? (
        <EmptyState
          Icon={UserX}
          sf="person.fill.xmark"
          text={t('moderation.blocked.empty')}
          subtitle={t('moderation.blocked.emptySubtitle')}
          topOffset={40}
        />
      ) : (
        users!.map((user) => (
          <BlockedUserRow
            key={user.userId}
            user={user}
            pending={pendingId === user.userId}
            onUnblock={handleUnblock}
            t={t}
          />
        ))
      )}
    </AppModal>
  );
}

function BlockedUserRow({ user, pending, onUnblock, t }: any) {
  const subtitleParts = [
    user.age ? String(user.age) : null,
    user.university || null,
  ].filter(Boolean);

  const blockedAt = user.blockedAt
    ? new Date(user.blockedAt).toLocaleDateString(getDateLocale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

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
        gap: 12,
        padding: 12,
        paddingRight: 16,
        marginBottom: 8,
      }}
    >
      {user.photoUrl ? (
        <Image
          source={{ uri: user.photoUrl }}
          style={{ width: 48, height: 48, borderRadius: 24 }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.surface3,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SFIcon name="person.fill.xmark" fallback={UserX} size={20} color={colors.textMuted} strokeWidth={1.5} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
        >
          {user.displayName}
        </Text>
        {subtitleParts.length > 0 && (
          <Text
            numberOfLines={1}
            style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
          >
            {subtitleParts.join(" · ")}
          </Text>
        )}
        {blockedAt && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {t('moderation.blocked.blockedAt', { date: blockedAt })}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onUnblock(user)}
        disabled={pending}
        activeOpacity={0.8}
        style={{
          borderRadius: 999,
          borderCurve: "continuous",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.2)",
          paddingHorizontal: 14,
          paddingVertical: 8,
          minWidth: 72,
          alignItems: "center",
        }}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
            {t('moderation.blocked.unblock')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
