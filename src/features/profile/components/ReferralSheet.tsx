import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { ChevronRight, Copy, Gift, Share2, type LucideIcon } from "@/shared/icons";
import { useReferralSummary } from "@/features/profile/referralQueries";
import {
  shareReferralCode,
  useCopyReferralCode,
} from "@/features/profile/referralShare";
import { grantDaysRemaining, rewardLabel } from "@/features/profile/referralView";
import type { ReferralInvitee } from "@/shared/types";
import { colors } from "@/shared/theme/colors";

/**
 * Davet programının sheet'i — profildeki ilerleme satırından (ReferralProgressRow)
 * açılır.
 *
 * Sade tutuluyor: kod + iki eylem, tek satır ilerleme, katılanlar. Ödül
 * geçmişi listesi yok — sıradaki ödül satırı ve görünürlük notu zaten "ne
 * kazandım / ne kazanacağım"ı söylüyor.
 *
 * Kod KUTUSUZ: "#" + büyük kod, yanında zeminsiz iki ikon. Kutu ve daireler
 * sheet'i kart-içinde-kart yapıyordu; kodun kendisi zaten yeterince belirgin.
 *
 * 🔴 YALNIZ İLK AD gösteriliyor: davet edilenin tam kimliğini davet edene
 * açmak, kaydolan kişinin vermediği bir rıza olurdu (backend zaten böyle
 * gönderiyor, plan §1.5).
 */
export default function ReferralSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Sheet KAPALIYKEN sorgu açılmıyor: hiç açmayan kullanıcı için istek boşuna.
  const { data } = useReferralSummary(visible);
  const copyCode = useCopyReferralCode();

  const activeDays = grantDaysRemaining(data?.visibilityGrant.expiresAt);
  const pausedDays = data?.visibilityGrant.pausedDays ?? null;
  const next = data?.nextTier ?? null;
  const nextLabel = next ? rewardLabel(t, next.type, next.amount) : null;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["52%"]}
      backgroundStyle={{ backgroundColor: colors.bg }}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{ color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 16 }}
        >
          {t("referral.sheet.title")}
        </Text>

        {data ? (
          <>
            {/* Kod + iki eylem. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                opacity: data.codeDisabled ? 0.4 : 1,
              }}
            >
              {/* "#" ayrı Text: kodun letterSpacing'i ona bulaşmasın, rengi soluk. */}
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 30,
                  fontWeight: "600",
                }}
              >
                #
              </Text>
              <Text
                testID="referral-sheet-code"
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: 34,
                  fontWeight: "800",
                  letterSpacing: 4,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {data.code}
              </Text>
              <SheetAction
                sfIcon="doc.on.doc"
                fallback={Copy}
                label={t("referral.card.copy")}
                disabled={data.codeDisabled}
                testID="referral-sheet-copy"
                onPress={() => copyCode(data.code)}
              />
              <SheetAction
                sfIcon="square.and.arrow.up"
                fallback={Share2}
                label={t("referral.card.share")}
                disabled={data.codeDisabled}
                testID="referral-sheet-share"
                onPress={() => shareReferralCode(data.code)}
              />
            </View>

            {data.codeDisabled ? (
              <Note text={t("referral.card.disabled")} />
            ) : (
              <>
                {/* Tek satır ilerleme: "2 / 3 arkadaş katıldı" ve sıradaki ödül.
                    Merdiven bittiyse (nextTier null) "yeni ödüller yakında". */}
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "600",
                    marginTop: 18,
                  }}
                >
                  {next
                    ? t("referral.card.progress", {
                        progress: next.progress,
                        needed: next.needed,
                      })
                    : t("referral.card.comingSoon")}
                </Text>
                {next && nextLabel ? (
                  <Note text={t("referral.card.nextReward", { reward: nextLabel })} top={4} />
                ) : null}
              </>
            )}

            {activeDays !== null ? (
              <Note text={t("referral.card.visibilityActive", { days: activeDays })} />
            ) : pausedDays ? (
              <Note text={t("referral.card.visibilityPaused", { days: pausedDays })} />
            ) : null}

            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                fontWeight: "600",
                marginTop: 26,
                marginBottom: 6,
              }}
            >
              {t("referral.sheet.inviteesTitle")}
            </Text>
            {data.invitees.length === 0 ? (
              <Note text={t("referral.sheet.inviteesEmpty")} top={4} />
            ) : (
              data.invitees.map((invitee, index) => (
                <InviteeRow key={`${invitee.firstName}-${index}`} invitee={invitee} />
              ))
            )}
          </>
        ) : null}
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}

function InviteeRow({ invitee }: { invitee: ReferralInvitee }) {
  const { t } = useTranslation();
  // Reddedilen davet SAKLANMIYOR: davet eden neyin sayılmadığını görmeli,
  // yoksa "üç kişi çağırdım ama ödül gelmedi" sessiz bir şikâyete dönüşür.
  const rejected = invitee.status === "Rejected";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.hairline,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: "500" }}
      >
        {invitee.firstName}
      </Text>
      <Text
        style={{
          color: rejected ? colors.error : colors.successText,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {t(rejected ? "referral.sheet.statusRejected" : "referral.sheet.statusQualified")}
      </Text>
    </View>
  );
}

function Note({ text, top = 12 }: { text: string; top?: number }) {
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        fontWeight: "500",
        marginTop: top,
      }}
    >
      {text}
    </Text>
  );
}

function SheetAction({
  sfIcon,
  fallback,
  label,
  onPress,
  disabled,
  testID,
}: {
  sfIcon: SFSymbol;
  fallback: LucideIcon;
  label: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}) {
  return (
    <AnimatedPressable
      pressScale={0.9}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityLabel={label}
      // Zemin YOK: 40pt yalnız dokunma alanı, görünen şey ikonun kendisi.
      style={{
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <SFIcon
        name={sfIcon}
        fallback={fallback}
        size={22}
        color={colors.text}
        strokeWidth={2}
        weight="semibold"
      />
    </AnimatedPressable>
  );
}

/**
 * Profildeki giriş noktası — fotoğraf doğrulama satırının hemen altında, onunla
 * aynı kabukta (surface kart, 28 yarıçap, 20 padding). Hero'daki hediye
 * ikonunun yerini aldı: ikon durum taşımıyordu, satır ise "kaç davet kaldı"yı
 * profil tamamlama çizgisi gibi 4pt bir çubukla gösteriyor.
 *
 * Sorgu SHEET KAPALIYKEN DE açık: sayı satırda görünüyor. `staleTime` 60 sn ve
 * referral push'ları anahtarı zaten invalidate ediyor (bkz. referralQueries).
 *
 * Veri gelmeden HİÇ çizilmiyor: boş bir kart ya da iskelet, yüklenemeyen
 * (eski backend) durumda sonsuza kadar kalırdı.
 */
export function ReferralProgressRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { data } = useReferralSummary();
  if (!data) return null;

  const next = data.nextTier;
  // Merdiven bittiyse çubuk dolu, sayı toplam davet; sıradaki ödül yerine
  // "yeni ödüller yakında".
  const progress = next ? next.progress : data.qualifiedCount;
  const needed = next ? next.needed : null;
  const ratio =
    needed && needed > 0 ? Math.min(1, Math.max(0, progress / needed)) : 1;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <AnimatedPressable
        onPress={onPress}
        pressBounciness={0}
        accessibilityRole="button"
        accessibilityLabel={t("referral.sheet.title")}
        testID="referral-progress-row"
      >
        <View
          style={{
            borderRadius: 28,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: colors.hairline,
            overflow: "hidden",
            backgroundColor: colors.surface,
            padding: 20,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <SFIcon
              name="gift.fill"
              fallback={Gift}
              size={24}
              color={colors.text}
              strokeWidth={1.75}
              weight="semibold"
              style={{ pointerEvents: "none" }}
            />
            {/* Yalnız başlık: sıradaki ödül / pasif kod açıklaması sheet'te.
                Satır tek satırlık kalsın, çubuk zaten durumu anlatıyor. */}
            <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" }}>
              {t("referral.sheet.title")}
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {needed ? `${progress} / ${needed}` : `${progress}`}
            </Text>
            <SFIcon
              name="chevron.right"
              fallback={ChevronRight}
              size={16}
              color={colors.textMuted}
              style={{ pointerEvents: "none" }}
            />
          </View>

          {/* Profil tamamlama çizgisiyle aynı dil: 4pt, hairline zemin, koyu dolgu. */}
          <View
            style={{
              height: 4,
              borderRadius: 999,
              backgroundColor: colors.hairline,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${ratio * 100}%`,
                height: "100%",
                borderRadius: 999,
                backgroundColor: colors.inverseSurface,
              }}
            />
          </View>
        </View>
      </AnimatedPressable>
    </View>
  );
}
