import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import {
  ChevronRight,
  Copy,
  Gift,
  InfoIcon,
  Share2,
  type LucideIcon,
} from "@/shared/icons";
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
 * 🔴 YÜZEY DİLİ (2026-09-10): içerik KARTLARA alındı. Öncesinde her şey çıplak
 * metindi ve sheet, uygulamanın geri kalanından kopuyordu — kullanıcı profilde
 * 28 yarıçaplı bir surface KARTA basıp içi düz metin olan bir sayfaya
 * iniyordu. Şimdi aynı kabuk sheet'in içinde de sürüyor: kod kartı, ilerleme
 * kartı, katılanlar kartı. Ölçüler ReferralProgressRow'dan geliyor.
 *
 * Kart kabuğu, çip ve bölüm başlığı bu dosyanın ALTINDA tek tek duruyor
 * (Card / Chip / SectionLabel); yeni bir blok eklerken onları kullan, satır
 * içine yeni bir yüzey yazma.
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
  const ratio =
    next && next.needed > 0
      ? Math.min(1, Math.max(0, next.progress / next.needed))
      : 1;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      // Kardeş sheet ile (UniversityVisibilitySheet) AYNI detent: ikisi de
      // profilden açılıyor, farklı yükseklikte açılmaları iki ayrı yüzey gibi
      // okunuyordu. `enableDynamicSizing` bilerek KAPALI — katılanlar listesi
      // uzayıp kısaldıkça sheet'in boyu zıplamasın, içerik taşarsa kaydırsın.
      snapPoints={["64%"]}
      backgroundStyle={{ backgroundColor: colors.bg }}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{ color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 9 }}
        >
          {t("referral.sheet.title")}
        </Text>

        {/* İkon + açıklama — kardeş sheet'in açılış satırının aynısı. Metin
            zaten sözlükte duruyordu ama hiç çizilmiyordu: sheet doğrudan koda
            başlıyor ve "3 arkadaş = 1 ödül" kuralını hiçbir yerde söylemiyordu. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <SFIcon
            name="info.circle"
            fallback={InfoIcon}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontSize: 13,
              lineHeight: 19,
              fontWeight: "500",
            }}
          >
            {t("referral.sheet.description")}
          </Text>
        </View>

        {data ? (
          <>
            {/* KOD KARTI. Kod eskiden zeminsizdi ve sheet düz metin bir sayfa
                gibi okunuyordu; oysa bu sheet'i açan şey profildeki SURFACE
                KART. Aynı kabuk (28 yarıçap, hairline, surface) burada da
                sürüyor, yani kullanıcı karta basıp kartın içine giriyor. */}
            <Card style={{ opacity: data.codeDisabled ? 0.4 : 1 }}>
              <CardLabel text={t("referral.card.label")} />
              {/* Kod ve iki eylem AYNI SATIRDA, kod solda / glifler onun
                  KARŞISINDA sağda. Eylemler önce kodun altında ayrı bir
                  satırdaydı: kart boşuna uzuyordu ve iki glif, ait oldukları
                  şeyden (koddan) kopuk, sahipsiz duruyordu. Yan yana
                  gelince "bu kodu kopyala / paylaş" tek bakışta okunuyor.

                  Glifler hâlâ ÇIPLAK: yazı yok, zemin yok. Kapsül buton
                  denendi ve kartın içinde fazla ağırdı — kod kartın konusu,
                  iki buton onun önüne geçiyordu. Görünen şey glifin kendisi,
                  40pt yalnız dokunma alanı. */}
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                {/* "#" ayrı Text: kodun letterSpacing'i ona bulaşmasın, rengi soluk. */}
                <Text style={{ color: colors.textMuted, fontSize: 30, fontWeight: "600" }}>
                  #
                </Text>
                <Text
                  testID="referral-sheet-code"
                  numberOfLines={1}
                  // flex: 1 — kod kalan genişliği alır, glifleri sağ kenara iter;
                  // uzun bir kod da glifleri ezmeden kendi içinde kısalır.
                  style={{
                    flex: 1,
                    marginLeft: 6,
                    color: colors.text,
                    fontSize: 34,
                    fontWeight: "800",
                    letterSpacing: 4,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {data.code}
                </Text>
                <View style={{ flexDirection: "row", gap: 4, marginLeft: 8 }}>
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
              </View>
            </Card>

            {data.codeDisabled ? (
              <Chip text={t("referral.card.disabled")} />
            ) : (
              /* İLERLEME KARTI — profildeki giriş satırının içeriğiyle aynı:
                 sayı, 4pt çubuk, sıradaki ödül. Çubuk orada da burada da
                 duruyor ki sheet, bastığı satırın devamı gibi okunsun. */
              <Card style={{ marginTop: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <Text
                    style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" }}
                  >
                    {next
                      ? t("referral.card.progress", {
                          progress: next.progress,
                          needed: next.needed,
                        })
                      : t("referral.card.comingSoon")}
                  </Text>
                  {next ? (
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 15,
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {`${next.progress} / ${next.needed}`}
                    </Text>
                  ) : null}
                </View>

                <View
                  style={{
                    height: 4,
                    borderRadius: 999,
                    marginTop: 12,
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

                {next && nextLabel ? (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 13,
                      lineHeight: 19,
                      fontWeight: "500",
                      marginTop: 10,
                    }}
                  >
                    {t("referral.card.nextReward", { reward: nextLabel })}
                  </Text>
                ) : null}
              </Card>
            )}

            {/* Görünürlük hakkı ÇİP olarak. Aynı cümle görünürlük sheet'inde
                zaten `hairlineSoft` zeminli yuvarlak bir çip; burada gri düz
                metindi, yani aynı bilgi iki farklı görsel dilde çiziliyordu. */}
            {activeDays !== null ? (
              <Chip text={t("referral.card.visibilityActive", { days: activeDays })} />
            ) : pausedDays ? (
              <Chip text={t("referral.card.visibilityPaused", { days: pausedDays })} />
            ) : null}

            <SectionLabel text={t("referral.sheet.inviteesTitle")} />
            {/* Liste de KART İÇİNDE: satırlar eskiden zemine çizilip alt
                çizgiyle ayrılıyordu, yani gruplanmış liste hissi yoktu.
                Ayraç kart içinde ve SON satırda çizilmiyor. */}
            <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              {data.invitees.length === 0 ? (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: "500",
                    paddingVertical: 12,
                  }}
                >
                  {t("referral.sheet.inviteesEmpty")}
                </Text>
              ) : (
                data.invitees.map((invitee, index) => (
                  <InviteeRow
                    key={`${invitee.firstName}-${index}`}
                    invitee={invitee}
                    last={index === data.invitees.length - 1}
                  />
                ))
              )}
            </Card>
          </>
        ) : null}
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}

/**
 * Sheet'in tek kabuğu. Ölçüler profildeki giriş satırından (ReferralProgressRow)
 * geliyor — sheet onun içi, ayrı bir yüzey dili kurmuyor.
 */
function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          borderRadius: 28,
          borderCurve: "continuous",
          borderWidth: 0.5,
          borderColor: colors.hairline,
          overflow: "hidden",
          backgroundColor: colors.surface,
          padding: 20,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Kart içi üst etiket — kartın neyi taşıdığını söyleyen küçük satır. */
function CardLabel({ text }: { text: string }) {
  return (
    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
      {text}
    </Text>
  );
}

/** Kartlar arası bölüm başlığı (grouped list'in section header'ı). */
function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: "600",
        marginTop: 24,
        marginBottom: 8,
        marginLeft: 4,
      }}
    >
      {text}
    </Text>
  );
}

/**
 * Zeminli bilgi çipi — görünürlük sheet'indeki `grantNote` şeridiyle BİREBİR
 * aynı ölçüler. Aynı bilgiyi iki ekranda iki farklı biçimde çizmemek için tek
 * kaynak burası; oradaki şerit de ileride buna bağlanabilir.
 */
function Chip({ text }: { text: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        alignSelf: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginTop: 12,
        backgroundColor: colors.hairlineSoft,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

function InviteeRow({
  invitee,
  last,
}: {
  invitee: ReferralInvitee;
  last: boolean;
}) {
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
        // Son satırda ayraç YOK: kartın kendi kenarı zaten listeyi kapatıyor,
        // ikisi üst üste binince kartın dibinde çift çizgi oluşuyordu.
        borderBottomWidth: last ? 0 : 0.5,
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

/**
 * Kod kartının iki eylemi — ÇIPLAK GLİF, kabuk yok.
 *
 * `label` ekranda çizilmiyor, yalnız `accessibilityLabel` olarak gidiyor:
 * VoiceOver kullanıcısı iki glifi ayırt edebilmeli, ama görsel olarak yazı da
 * zemin de kartı ağırlaştırıyordu (kod kartın konusu, butonlar onun önüne
 * geçmemeli). 40pt'lik kutu yalnız dokunma alanı, görünen şey glifin kendisi.
 */
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
      accessibilityRole="button"
      accessibilityLabel={label}
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
