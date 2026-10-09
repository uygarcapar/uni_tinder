import { memo, useCallback } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Heart, MoreHorizontal, User } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import { anonymousLabelKey, replyActionFor } from "../feedPolicy";
import { formatExpiresIn } from "../feedText";
import type { FeedPostDto } from "../feedTypes";

/**
 * Akış gönderi kartı — sadece YAZI (fotoğraf yok, gönderi altında yorum yok).
 *
 * Yanıt butonunun durumu TAMAMEN `feedPolicy.replyActionFor`dan geliyor; burada
 * hiçbir kural yeniden hesaplanmıyor. En kritik sonucu: ANONİM gönderide
 * eşleştiğin kişi bile olsa sunucu `Ok` döndüğü için "Yanıtla" çiziliyor —
 * "Sohbete git" göstermek anonim yazarın kimliğini ifşa ederdi.
 */

export interface FeedPostCardProps {
  post: FeedPostDto;
  /** Gönderilerim sayfasında durum rozeti + yanıt sayısı gösterilir. */
  variant?: "feed" | "mine";
  onToggleLike?: (post: FeedPostDto) => void;
  onReply?: (post: FeedPostDto) => void;
  onOpenChat?: (conversationId: string | null) => void;
  onReplyPaywall?: (post: FeedPostDto) => void;
  /** Normal gönderide yazara dokunma → aksiyonsuz profil önizlemesi. */
  onPressAuthor?: (post: FeedPostDto) => void;
  onMenu?: (post: FeedPostDto) => void;
  /** Gönderilerim'de yanıt sayısına dokunma → Yanıtlar sayfası. */
  onPressReplyCount?: (post: FeedPostDto) => void;
  /** Durum rozeti metni (Gönderilerim) — sayfanın `postPresentation`ı çözüyor. */
  statusLabel?: string | null;
  statusTone?: "neutral" | "warning" | "danger";
}

const AVATAR = 34;

function FeedPostCardBase({
  post,
  variant = "feed",
  onToggleLike,
  onReply,
  onOpenChat,
  onReplyPaywall,
  onPressAuthor,
  onMenu,
  onPressReplyCount,
  statusLabel,
  statusTone = "neutral",
}: FeedPostCardProps) {
  const { t } = useTranslation();
  const action = replyActionFor(post);

  const handleLike = useCallback(() => onToggleLike?.(post), [onToggleLike, post]);
  const handleMenu = useCallback(() => onMenu?.(post), [onMenu, post]);
  const handleAuthor = useCallback(() => {
    // Anonim gönderide açılacak profil YOK — sunucu da `author: null` yolluyor.
    if (post.isAnonymous) return;
    onPressAuthor?.(post);
  }, [onPressAuthor, post]);

  const handleReplyPress = useCallback(() => {
    switch (action.kind) {
      case "compose":
        onReply?.(post);
        return;
      case "openChat":
        onOpenChat?.(action.conversationId);
        return;
      case "paywall":
        onReplyPaywall?.(post);
        return;
      default:
        // hidden / disabled: buton zaten basılamaz halde çiziliyor.
        return;
    }
  }, [action, onReply, onOpenChat, onReplyPaywall, post]);

  const anonLabel = t(anonymousLabelKey(post.authorCategory));
  const expiresLabel =
    variant === "mine" ? formatExpiresIn(post.expiresAt, t) : null;

  const statusColor =
    statusTone === "danger"
      ? colors.errorStrong
      : statusTone === "warning"
        ? colors.warning
        : colors.textSecondary;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 22,
        borderCurve: "continuous",
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
        marginBottom: 10,
      }}
    >
      {/* ── Başlık: yazar ya da anonim etiketi ── */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={handleAuthor}
          disabled={post.isAnonymous || !onPressAuthor}
          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          hitSlop={6}
        >
          {post.isAnonymous || !post.author?.mainPhotoUrl ? (
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
                size={16}
                color={colors.textMuted}
                strokeWidth={1.8}
              />
            </View>
          ) : (
            <Image
              source={{ uri: post.author.mainPhotoUrl }}
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: AVATAR / 2,
                backgroundColor: colors.surface3,
              }}
            />
          )}

          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 15, fontWeight: "600", color: colors.text }}
            >
              {post.isAnonymous
                ? anonLabel
                : [post.author?.name, post.author?.age]
                    .filter((v) => v != null && v !== "")
                    .join(", ")}
            </Text>
            {/* Üniversite satırı: kullanıcı gizlediyse `null` gelir, satır çizilmez. */}
            {!post.isAnonymous && post.author?.universityDisplay ? (
              <Text
                numberOfLines={1}
                style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 1 }}
              >
                {post.author.universityDisplay}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Text style={{ fontSize: 12.5, color: colors.textMuted, marginLeft: 8 }}>
          {formatRelativeTime(post.createdAt, t)}
        </Text>

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

      {/* ── Gövde ── Satır sonları KORUNUYOR (sunucu en fazla 2 boş satıra
          normalize ediyor), o yüzden metin olduğu gibi basılıyor. */}
      <Text
        style={{
          fontSize: 15.5,
          lineHeight: 21,
          color: colors.text,
          marginTop: 12,
        }}
      >
        {post.body}
      </Text>

      {/* ── Gönderilerim: durum rozeti + kalan ömür ── */}
      {variant === "mine" && (statusLabel || expiresLabel) ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          {statusLabel ? (
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: statusColor }}>
              {statusLabel}
            </Text>
          ) : null}
          {statusLabel && expiresLabel ? (
            <Text style={{ fontSize: 12.5, color: colors.textMuted }}> · </Text>
          ) : null}
          {expiresLabel ? (
            <Text style={{ fontSize: 12.5, color: colors.textMuted }}>
              {expiresLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Alt satır: beğeni + yanıt ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        {/* Kendi gönderini beğenemezsin (UT-7330) → buton hiç çizilmiyor,
            yalnız sayı duruyor. */}
        <Pressable
          onPress={handleLike}
          disabled={post.isMine || !onToggleLike}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <SFIcon
            name={post.likedByMe ? "heart.fill" : "heart"}
            fallback={Heart}
            size={18}
            color={post.likedByMe ? colors.errorStrong : colors.textMuted}
            strokeWidth={1.9}
          />
          <Text
            style={{
              marginLeft: 6,
              fontSize: 13.5,
              fontWeight: "600",
              color: post.likedByMe ? colors.errorStrong : colors.textSecondary,
            }}
          >
            {post.likeCount}
          </Text>
        </Pressable>

        {/* Gönderilerim: yanıt sayısı — dokununca Yanıtlar sayfası. */}
        {variant === "mine" && typeof post.replyCount === "number" ? (
          <Pressable
            onPress={() => onPressReplyCount?.(post)}
            disabled={!onPressReplyCount || post.replyCount === 0}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", marginLeft: 18 }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: "600",
                color: post.replyCount > 0 ? colors.text : colors.textMuted,
              }}
            >
              {t("feed.mine.replyCount", { count: post.replyCount })}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }} />

        <ReplyButton
          action={action}
          onPress={handleReplyPress}
          t={t}
        />
      </View>
    </View>
  );
}

/**
 * Yanıt butonu — `ReplyAction` → görünüm. Ayrı bileşen, çünkü kartın geri
 * kalanından BAĞIMSIZ değişiyor (beğeni optimistic'i kartı yeniden çiziyor,
 * buton durumu ise yalnız mutasyon sonrası değişiyor).
 */
function ReplyButton({
  action,
  onPress,
  t,
}: {
  action: ReturnType<typeof replyActionFor>;
  onPress: () => void;
  t: (k: string) => string;
}) {
  if (action.kind === "hidden") return null;

  const disabled = action.kind === "disabled";
  const label =
    action.kind === "openChat"
      ? t("feed.reply.goToChat")
      : action.kind === "disabled"
        ? t(action.labelKey)
        : t("feed.reply.button");

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        borderCurve: "continuous",
        backgroundColor: disabled ? colors.surface3 : colors.inverseSurface,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Kilit YALNIZ paywall dalında — "bilinmiyor" ya da pasif durumda kilit
          çizmek kullanıcıya olmayan bir satın alma ima ederdi. */}
      {action.kind === "paywall" ? (
        <Text style={{ fontSize: 12, marginRight: 5 }}>🔒</Text>
      ) : null}
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: "600",
          color: disabled ? colors.textMuted : colors.onInverseSurface,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * `memo` — liste satırı. Beğeni optimistic'i tek gönderiyi yamalıyor ve
 * `patchPostInCaches` isabet olmayan satırların REFERANSINI koruyor, yani
 * memo burada gerçekten iş görüyor.
 */
export default memo(FeedPostCardBase);
