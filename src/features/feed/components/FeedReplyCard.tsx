import { memo, useCallback } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, User } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import type { FeedReceivedReplyDto } from "../feedTypes";

/**
 * Gelen yanıt kartı — "gönderine şu kişi şunu yazdı, kabul mü?".
 *
 * ⚠️ Yanıt VEREN her zaman görünür, anonimlik burada YOK: anonim olan gönderi
 * SAHİBİ (yani bu kartı gören kişi), yanıtlayan değil. `postIsAnonymous` sadece
 * alıntı satırının metnini değiştiriyor ("Anonim gönderine").
 *
 * ⚠️ Beğeniler ekranındaki blur/unlock kuralı (isUnlockedLike) BURAYA
 * UYGULANMIYOR: akış yanıtları free kullanıcıya da açık.
 */

export interface FeedReplyCardProps {
  reply: FeedReceivedReplyDto;
  onPress?: (reply: FeedReceivedReplyDto) => void;
  onAccept?: (reply: FeedReceivedReplyDto) => void;
  onDismiss?: (reply: FeedReceivedReplyDto) => void;
  onMenu?: (reply: FeedReceivedReplyDto) => void;
  busy?: boolean;
}

const AVATAR = 44;

function FeedReplyCardBase({
  reply,
  onPress,
  onAccept,
  onDismiss,
  onMenu,
  busy = false,
}: FeedReplyCardProps) {
  const { t } = useTranslation();

  const handlePress = useCallback(() => onPress?.(reply), [onPress, reply]);
  const handleAccept = useCallback(() => onAccept?.(reply), [onAccept, reply]);
  const handleDismiss = useCallback(() => onDismiss?.(reply), [onDismiss, reply]);
  const handleMenu = useCallback(() => onMenu?.(reply), [onMenu, reply]);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 22,
        borderCurve: "continuous",
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
        marginBottom: 10,
      }}
    >
      {/* ── Alıntı: hangi gönderine ── */}
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {reply.postIsAnonymous
              ? t("feed.received.onYourAnonymousPost")
              : t("feed.received.onYourPost")}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              fontSize: 13.5,
              color: colors.textSecondary,
              marginTop: 3,
              // Alıntı gövdeden ayrışsın: sol çizgi yerine italik + soluk renk
              // (sol çizgi kartın yuvarlak köşesiyle çakışıyordu).
              fontStyle: "italic",
            }}
          >
            {reply.postExcerpt}
          </Text>
        </View>
        {onMenu ? (
          <Pressable onPress={handleMenu} hitSlop={10} style={{ marginLeft: 8 }}>
            <SFIcon
              name="ellipsis"
              fallback={MoreHorizontal}
              size={18}
              color={colors.textMuted}
              strokeWidth={2}
            />
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.hairlineSoft,
          marginVertical: 12,
        }}
      />

      {/* ── Yanıt veren + yorum ── */}
      <Pressable
        onPress={handlePress}
        disabled={!onPress}
        style={{ flexDirection: "row", alignItems: "flex-start" }}
      >
        {reply.replier?.mainPhotoUrl ? (
          <Image
            source={{ uri: reply.replier.mainPhotoUrl }}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              backgroundColor: colors.surface3,
            }}
          />
        ) : (
          <View
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              backgroundColor: colors.surface3,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SFIcon
              name="person.fill"
              fallback={User}
              size={20}
              color={colors.textMuted}
              strokeWidth={1.8}
            />
          </View>
        )}

        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 }}
            >
              {[reply.replier?.name, reply.replier?.age]
                .filter((v) => v != null && v !== "")
                .join(", ")}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: 8 }}>
              {formatRelativeTime(reply.sentAt, t)}
            </Text>
          </View>
          {reply.replier?.universityDisplay ? (
            <Text
              numberOfLines={1}
              style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 1 }}
            >
              {reply.replier.universityDisplay}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: 15,
              lineHeight: 20,
              color: colors.text,
              marginTop: 7,
            }}
          >
            {reply.comment}
          </Text>
        </View>
      </Pressable>

      {/* ── Kabul / Geç ── */}
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <Pressable
          onPress={handleDismiss}
          disabled={busy || !onDismiss}
          style={{
            flex: 1,
            paddingVertical: 11,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: colors.surface3,
            alignItems: "center",
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.text }}>
            {t("feed.received.skip")}
          </Text>
        </Pressable>
        <View style={{ width: 10 }} />
        <Pressable
          onPress={handleAccept}
          disabled={busy || !onAccept}
          style={{
            flex: 1,
            paddingVertical: 11,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: colors.inverseSurface,
            alignItems: "center",
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: "600",
              color: colors.onInverseSurface,
            }}
          >
            {t("feed.received.accept")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default memo(FeedReplyCardBase);
