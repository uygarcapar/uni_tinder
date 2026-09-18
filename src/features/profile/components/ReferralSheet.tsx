import { useEffect, type ReactNode } from "react";
import {
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// AppBottomSheet DEĞİL AppModal: progressive blur header, drag pill, X ve
// scroll'a bağlı başlık fade'i uygulamadaki tüm modal'larla tek yerden geliyor.
import AppModal from "@/shared/components/AppModal";
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
import SkeletonBox from "@/shared/components/SkeletonBox";
import { useReferralSummary } from "@/features/profile/referralQueries";
import {
  shareReferralCode,
  useCopyReferralCode,
} from "@/features/profile/referralShare";
import { grantDaysRemaining, rewardLabel } from "@/features/profile/referralView";
import { colors, ink } from "@/shared/theme/colors";

/**
 * Davet programının sheet'i — profildeki ilerleme satırından (ReferralProgressRow)
 * açılır.
 *
 * Sade tutuluyor: kod + iki eylem, tek satır ilerleme. Ne ödül geçmişi ne de
 * katılanlar listesi var — sıradaki ödül satırı, ilerleme sayısı ve görünürlük
 * notu zaten "ne kazandım / ne kazanacağım"ı söylüyor; isim isim liste bunu
 * tekrar ediyordu (bkz. gövdedeki kaldırma notu).
 *
 * 🔴 YÜZEY DİLİ (2026-09-10): içerik KARTLARA alındı. Öncesinde her şey çıplak
 * metindi ve sheet, uygulamanın geri kalanından kopuyordu — kullanıcı profilde
 * 28 yarıçaplı bir surface KARTA basıp içi düz metin olan bir sayfaya
 * iniyordu. Şimdi aynı kabuk sheet'in içinde de sürüyor: kod kartı, ilerleme
 * kartı. Ölçüler ReferralProgressRow'dan geliyor.
 *
 * Kart kabuğu ve çip bu dosyanın ALTINDA duruyor (Card / Chip); yeni bir blok
 * eklerken onları kullan, satır içine yeni bir yüzey yazma.
 */
export default function ReferralSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
    <AppModal
      visible={visible}
      onClose={onClose}
      // Header'ın küçük başlığı: scroll 55px'i geçince beliriyor (AppModal).
      // İçerideki 26pt başlık scroll'un altına girerken bu devralıyor — iOS'un
      // büyük başlık paterni, ProfileEditModal'daki davranışın aynısı.
      title={t("referral.sheet.title")}
      // X YOK: sheet hiçbir şey kaydetmiyor, aşağı sürüklemek ve backdrop'a
      // dokunmak zaten kapatıyor. Kardeş bilgi sheet'leriyle aynı karar
      // (PremiumBenefitInfoSheet / ProfileOptionsSheet). Header'da buton
      // kalmadığı için `clearGlassHeader` da geçilmiyor — tek etkisi buton
      // ölçüsüydü.
      closeButton={false}
      // 🔴 snapPoints YOK: tek detent ÖLÇÜLEN içerik yüksekliği.
      //
      // Önce sabit "64%" idi ve dinamik ölçü bilerek kapalıydı — gerekçe
      // katılanlar listesiydi: uzayıp kısaldıkça sheet'in boyu zıplıyordu. O
      // liste kalktı, geriye sabit bir blok kaldı (başlık, açıklama, kod
      // kartı, ilerleme kartı, çip) ama YÜKSEKLİĞİ SABİT DEĞİL: metin ölçeği
      // (Dynamic Type), dil ve ekran genişliği açıklamanın kaç satıra
      // sardığını değiştiriyor. Sabit yüzde bu yüzden bir cihazda altta
      // kocaman boşluk, diğerinde kırpılmış içerik demekti.
      //
      // Tavan `maxDynamicContentSize`: en büyük metin ölçeğinde bile sheet
      // ekranı yutmasın, o noktadan sonra içerik scroll'a kalsın.
      //
      // ⚠️ İÇERİK SIĞDIĞINDA SCROLL YOK, yani header'ın başlığı da BELİRMİYOR
      // (fade scroll'a bağlı) — görünen başlık içerideki 26pt'lik olan.
      // Header başlığının her koşulda durması istenirse `titleAlwaysVisible`
      // var, ama o zaman iki başlık üst üste gelir: içerideki kaldırılmalı.
      //
      // ⚠️ Kardeş sheet (UniversityVisibilitySheet) hâlâ sabit "64%" — ikisi
      // artık farklı yükseklikte açılıyor. Oradaki içerik de ölçülebilir
      // olduğunda aynı yola geçirilmeli.
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.85}
      // ÜST PAY 88 DEĞİL 40. Varsayılan, header'ın TAM yüksekliğini boş
      // bırakıyor — X'i olan modal'larda doğru (içerik butonun altından
      // başlamalı), ama bu header'da buton yok: yalnız 20'de başlayıp 24'te
      // biten drag pill ve scroll'la beliren küçük başlık var. Sonuç,
      // başlığın üstünde bir parmak boyu boşluktu. 40 = pill'in bittiği yer +
      // nefes payı.
      //
      // Blur ŞERİDİ yine 88: kaydırınca içerik onun altına giriyor ve küçük
      // başlık orada beliriyor — istenen davranış bu.
      //
      // Alt pay HOME INDICATOR'ı sayıyor: içerik kadar açılan sheet'te kartın
      // altı doğrudan ekranın alt kenarı, sabit bir sayı gesture çubuğunun
      // üstüne oturuyordu.
      contentContainerStyle={{ paddingTop: 40, paddingBottom: 28 + insets.bottom }}
    >
      {/* Büyük başlık İÇERİKTE: header'ınki scroll'a bağlı beliriyor, bu ise
          sheet açılır açılmaz duruyor. Ölçü doğrulama sheet'inin
          (SelfieVerificationOverlay → IntroStep) başlığıyla AYNI: 26/700. */}
      <Text
        style={{ color: colors.text, fontSize: 26, fontWeight: "700", marginBottom: 9 }}
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
          {/* "Davet kodun" ETİKETİ YOK: kart zaten tek şey taşıyor ve kod
              kartın konusu — 42pt'lik kod, üstündeki 13pt etiketin söylediği
              şeyi kendisi söylüyordu. Etiket düşünce kart kısalıp bandına
              dönüştüğü için dikey padding kabuğun 20'sinden 28'e çıkıyor:
              kod, kendi kutusunda nefes alsın. */}
          <Card
            style={{ paddingVertical: 28, opacity: data.codeDisabled ? 0.4 : 1 }}
          >
            {/* Kod ve iki eylem AYNI SATIRDA, kod solda / glifler onun
                KARŞISINDA sağda. Eylemler önce kodun altında ayrı bir
                satırdaydı: kart boşuna uzuyordu ve iki glif, ait oldukları
                şeyden (koddan) kopuk, sahipsiz duruyordu. Yan yana
                gelince "bu kodu kopyala / paylaş" tek bakışta okunuyor.

                Glifler hâlâ ÇIPLAK: yazı yok, zemin yok. Kapsül buton
                denendi ve kartın içinde fazla ağırdı — kod kartın konusu,
                iki buton onun önüne geçiyordu. Görünen şey glifin kendisi,
                40pt yalnız dokunma alanı. */}
            {/* `marginTop` YOK: üstünde artık etiket durmuyor, kartın kendi
                padding'i satırı zaten yerine oturtuyor. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* "#" ayrı Text: kodun letterSpacing'i ona bulaşmasın, rengi soluk.
                  Kodla birlikte büyüyor, ondan bir tık küçük kalıyor. */}
              <Text style={{ color: colors.textMuted, fontSize: 34, fontWeight: "600" }}>
                #
              </Text>
              <Text
                testID="referral-sheet-code"
                numberOfLines={1}
                // flex: 1 — kod kalan genişliği alır, glifleri sağ kenara iter;
                // uzun bir kod da glifleri ezmeden kendi içinde kısalır.
                // Kod 5 karakter sabit (REFERRAL_CODE_LENGTH): 42pt + 4
                // letterSpacing, iki 40pt glifin yanında hâlâ kırpılmadan
                // sığıyor. Daha büyüğü için önce glifleri alt satıra almak
                // gerekir.
                style={{
                  flex: 1,
                  marginLeft: 6,
                  color: colors.text,
                  fontSize: 42,
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

              <View style={{ marginTop: 12 }}>
                <ProgressBar ratio={ratio} />
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

          {/* 🔴 KATILANLAR LİSTESİ ("Joined" + ilk adlar) KALDIRILDI: sheet
              artık kod + ilerleme, o kadar. Sayı zaten ilerleme kartında
              ("2 / 3 arkadaş katıldı") duruyordu, liste onu isim isim
              tekrarlıyordu. `data.invitees` sözleşmede DURUYOR (backend
              gönderiyor, tipi de yerinde) — geri istenirse çizim tarafı
              yeniden yazılır. Ad gösterilecekse kural aynı kalmalı: YALNIZ
              ilk ad, tam kimlik davet edene açılmıyor (plan §1.5). */}
        </>
      ) : null}
    </AppModal>
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

/**
 * Davet ilerleme çubuğu — profil tamamlama çizgisiyle AYNI dil ve artık AYNI
 * ANİMASYON: 4pt, hairline zemin, koyu dolgu; oran 700ms'de Easing.out(cubic)
 * ile soldan sağa doluyor (ProfileScreen'deki `progressRatio` ile birebir).
 * Çubuk hem profildeki satırda hem sheet'in ilerleme kartında bu bileşenden
 * geliyor: ikisi aynı hareketi yapsın, sheet bastığı satırın devamı gibi
 * okunsun.
 *
 * 🔴 DOLGU `width` İLE ANİME EDİLMİYOR. `width` bir LAYOUT property'si, her
 * frame'de bir ShadowTree commit'i demek — ProfileScreen'deki eşi tam bu
 * yüzden transform'a taşınmıştı (mount commit'leriyle çakışıp Fabric'in
 * "attempts < 1024" assert'ine çarpıyordu). Dolgu tam genişlikte duruyor,
 * `translateX` ile açılıyor; transform UI thread'de kalır, commit üretmez.
 */
function ProgressBar({ ratio }: { ratio: number }) {
  const fillRatio = useSharedValue(0);
  // Genişlik shared value: worklet ölçüyü React state'inden okursa Fabric'te
  // bayat değer yakalıyor (ProfileScreen'deki badge'in sol kenarda takılma
  // hikâyesi) — onLayout doğrudan buraya yazıyor.
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    fillRatio.value = withTiming(ratio, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [ratio, fillRatio]);

  const fillStyle = useAnimatedStyle(() => ({
    // Ölçülmeden ÇİZME: `trackWidth` 0'ken translateX de 0 olur ve dolgu bir
    // frame boyunca TAM DOLU görünür — animasyon o kareden geriye sarıyormuş
    // gibi olurdu. Badge'in ProfileScreen'deki guard'ının aynısı.
    opacity: trackWidth.value === 0 ? 0 : 1,
    transform: [{ translateX: (fillRatio.value - 1) * trackWidth.value }],
  }));

  return (
    <View
      onLayout={(e) => {
        trackWidth.value = e.nativeEvent.layout.width;
      }}
      style={{
        height: 4,
        borderRadius: 999,
        backgroundColor: colors.hairline,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            width: "100%",
            height: "100%",
            borderRadius: 999,
            backgroundColor: colors.inverseSurface,
          },
          fillStyle,
        ]}
      />
    </View>
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
 * 🔴 İLK İSTEK UÇARKEN İSKELET, sonrasında ya kart ya HİÇBİR ŞEY. Eskiden veri
 * gelene kadar `null` dönüyordu ve kart, profil sayfası çizildikten sonra araya
 * giriyordu (altındaki her şey aşağı kayıyordu). Asıl sebep zincirdi ve
 * çözümü prefetch'te (bkz. prefetchReferralSummary); iskelet ikinci savunma:
 * yavaş ağda yerini tutuyor.
 *
 * Kapı `isLoading` — `isPending && isFetching`, yani YALNIZ ilk istek havada.
 * Eski gerekçe ("iskelet yüklenemeyen backend'de sonsuza kadar kalır") bu yüzden
 * geçerli değil: istek hata verince (retry: 1'den sonra) `isLoading` düşüyor ve
 * satır tamamen kayboluyor.
 */
export function ReferralProgressRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useReferralSummary();
  if (!data) return isLoading ? <ReferralProgressRowSkeleton /> : null;

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
              {/* Boşluksuz — accordion'ın sayacıyla (`{current}/{max}`) aynı
                  yazım; ikisi yan yana değil ama aynı sayfada aynı işi yapıyor
                  ve "1 / 3" ile "1/3" iki ayrı gösterge gibi okunuyordu. */}
              {needed ? `${progress}/${needed}` : `${progress}`}
            </Text>
            {/* Profil sayfasındaki satır oklarının ortak ölçüsü — kaynağı
                plus+ kartı (bkz. PlusCard): 16pt / 2.5 / semibold, %70 ink. */}
            <SFIcon
              name="chevron.right"
              fallback={ChevronRight}
              size={16}
              color={ink(0.7)}
              strokeWidth={2.5}
              weight="semibold"
              style={{ pointerEvents: "none" }}
            />
          </View>

          {/* Profil tamamlama çizgisiyle aynı dil VE aynı animasyon — ölçüler
              ve hareket tek yerden geliyor (ProgressBar). */}
          <ProgressBar ratio={ratio} />
        </View>
      </AnimatedPressable>
    </View>
  );
}

/**
 * Satırın yer tutucusu — ÖLÇÜLERİ BİREBİR aynı (16 yatay pay, 28 yarıçap, 20
 * padding, 12 gap, 4pt çubuk) ki veri gelince sayfa zıplamasın: iskeletin
 * kapladığı yerin aynısına kart oturuyor.
 *
 * Basılamaz ve ekran okuyucuya açılmaz: henüz açılacak bir sheet yok.
 */
function ReferralProgressRowSkeleton() {
  return (
    <View
      style={{ paddingHorizontal: 16, paddingBottom: 16 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
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
          {/* 24pt glif + esneyen başlık: kartın gerçek satırının ritmi. */}
          <SkeletonBox width={24} height={24} borderRadius={8} color={colors.hairline} />
          <View style={{ flex: 1 }}>
            <SkeletonBox width="60%" height={15} borderRadius={999} color={colors.hairline} />
          </View>
          <SkeletonBox width={34} height={15} borderRadius={999} color={colors.hairline} />
        </View>
        <SkeletonBox height={4} borderRadius={999} color={colors.hairline} />
      </View>
    </View>
  );
}
