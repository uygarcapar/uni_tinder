import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetModalProvider, BottomSheetView } from "@gorhom/bottom-sheet";
import { BadgeCheck, ShieldCheck } from "@/shared/icons";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SFIcon from "@/shared/components/SFIcon";
import uiBus from "@/shared/services/uiBus";
import { showInfoToast } from "@/shared/services/toaster";
import { SELFIE_CODES, selfieCodeI18nKey } from "@/shared/constants/responseCodes";
import { colors, ink } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";
import { useAppSelector } from "@/shared/hooks/redux";
import { forgetPhoto } from "@/shared/utils/photoStore";
import profileService from "@/features/profile/profileService";
import i18n from "@/shared/i18n";
import SelfieCameraStep from "./SelfieCameraStep";
import { markSelfieFeatureUnavailable, markSelfieWasVerified } from "./selfieAvailability";
import { SELFIE_OPEN_EVENT } from "./selfieEvents";
import {
  startSelfieVerification,
  submitSelfieFrames,
  type SelfieFrame,
} from "./selfieService";
import {
  isSelfieRetryAuto,
  selfieReasonText,
  selfieReasonTitle,
  selfieResultAnalytics,
  type SelfieAttempt,
  type SelfieResult,
} from "./selfieVerification";
import { analytics } from "@/shared/services/analytics";

/**
 * Selfie doğrulama akışının kök host'u: intro → kamera → sonuç.
 *
 * RIZA BU AKIŞTA TOPLANMIYOR. KVKK m.6/2-a (biyometrik) ve m.9 (yurt dışına
 * aktarım) açık rızalarının verildiği, geri alındığı ve durumunun görüldüğü TEK
 * yer Ayarlar > Gizlilik > Doğrulama İzinleri; iki izin orada AYRI AYRI
 * açılıyor. Kayıt ekranındaki KVKK modalı yalnız metnin kabulünü alıyor —
 * zorunlu onayla birlikte üç kutuyu tek şeride sıkıştırmak metinleri kesiyor ve
 * zorunlu olanla isteğe bağlı olanı ayrıştırmıyordu.
 *
 * Rıza yoksa `/start` `UT-6501` döner: akış kapanır ve kullanıcı bir Alert ile
 * o ekrana yönlendirilir. Doğrulamaya başlamak isteyen kullanıcıyı akışın
 * ortasında hukuki metin kutularıyla karşılamak akışı orada bitiriyordu.
 *
 * KAMERA DIŞINDAKİ HER ADIM BİR BOTTOM SHEET. Akış profildeki bir satırdan
 * açılıyor; tam ekran bir katmanın animasyonsuz, anında belirmesi kullanıcıya
 * "ekran değişti" değil "bir şey ters gitti" hissi veriyordu. İki adım da (intro,
 * sonuç) TEK bir sheet örneğinin içeriği — adımlar arası geçişte sheet kapanıp
 * açılmıyor, yalnız yüksekliği içeriğe göre animasyonla değişiyor
 * (`enableDynamicSizing`). Kamera bunun İSTİSNASI: yüz çerçevesi ve yönerge
 * şeridi yarım ekranda okunmuyor, o adım tam ekran `Host` olarak kalıyor.
 *
 * NEREYE MOUNT EDİLİYOR: App.tsx'te CropperOverlay'in yanına, yani
 * uygulamanın `BottomSheetModalProvider`'ının DIŞINA. Gerekçe cropper ile aynı —
 * gorhom portal'ı provider içindeki her şeyin üstüne boyanıyor, kamera profil
 * düzenleme modalının (AppModal, o da bir sheet) altında kalmamalı. Bu yüzden
 * buradaki sheet KENDİ provider'ını taşıyor (aşağıdaki nota bakın).
 *
 * NEDEN AYRI BİR "intro" ADIMI VAR: `/start` saatlik 5 haktan birini yakıyor,
 * dolayısıyla ekran açılışında değil kullanıcı "Başla"ya bastığında çağrılmalı.
 * Bildirimden gelen derin bağlantı da kullanıcıyı doğrudan kameraya düşürmemeli.
 */

type Step = "intro" | "camera" | "result";

const errorCodeOf = (error: any): string | null =>
  error?.response?.data?.code ?? error?.response?.data?.errorCode ?? null;

export default function SelfieVerificationOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const userId = useAppSelector((state) => state.auth.user?.id);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [attempt, setAttempt] = useState<SelfieAttempt | null>(null);
  const [result, setResult] = useState<SelfieResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // `attempt_expired` sonrası otomatik yeniden başlatma YALNIZ BİR KEZ:
  // sunucu ısrarla süresi dolmuş attempt döndürürse döngüye girmemeli.
  const autoRestartedRef = useRef(false);

  // Sheet KAPANIRKEN İÇERİĞİ SIFIRLANMAZ: `step`/`result` burada temizlenseydi
  // sonuç ekranı, sheet daha aşağı inerken bir anda intro metnine dönerdi.
  // Sıfırlama bir sonraki AÇILIŞTA yapılıyor (bkz. SELFIE_OPEN_EVENT).
  const close = useCallback(() => {
    setVisible(false);
    setStarting(false);
    setSubmitting(false);
  }, []);

  // Adımın SON değeri — `handleSheetClose` render kapanışına takılmadan
  // okuyabilsin diye (gorhom callback'i eski closure'ı çağırabiliyor).
  const stepRef = useRef<Step>("intro");
  stepRef.current = step;

  /**
   * gorhom sheet'i kapattı. Aşağı çekme / backdrop dokunuşu / programatik
   * dismiss — hepsi buraya düşüyor.
   *
   * ⚠️ KAMERAYA GEÇİŞ DE BİR KAPANIŞ: kamera adımında sheet bilerek dismiss
   * ediliyor (aşağıdaki `sheetVisible`). O kapanışı "kullanıcı vazgeçti" sayıp
   * akışı sonlandırırsak kamera açılır açılmaz kendini iptal eder.
   */
  const handleSheetClose = useCallback(() => {
    if (stepRef.current === "camera") return;
    close();
  }, [close]);

  useEffect(() => uiBus.on(SELFIE_OPEN_EVENT, () => {
    setStep("intro");
    setAttempt(null);
    setResult(null);
    autoRestartedRef.current = false;
    setVisible(true);
  }), []);

  /**
   * `/start` + hata kodlarının tamamı. Hata kodlarının çoğu "hata ekranı"
   * değil bir AKIŞ YÖNLENDİRMESİ (rıza eksik → rıza adımı, özellik kapalı →
   * sessizce kapan), o yüzden hepsi burada tek yerde ele alınıyor.
   */
  const beginAttempt = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      // Geçiş oranının PAYDASI. Sonuç olayı tek başına "kaç kişi denedi"yi
      // söylemiyor: akışı yarıda bırakan kullanıcı sonuç üretmiyor.
      analytics.capture("selfie_verification_started");

      const next = await startSelfieVerification();
      if (!next) {
        showInfoToast({ message: t("profile.selfie.errors.generic"), variant: "error" });
        close();
        return;
      }
      setAttempt(next);
      setResult(null);
      setStep("camera");
    } catch (error: any) {
      const code = errorCodeOf(error);
      devLog("🪪 [selfie] /start hatası", code, error?.response?.status);

      switch (code) {
        // İki açık rızadan biri eksik. Rızayı AKIŞIN İÇİNDE TOPLAMIYORUZ:
        // doğrulamaya başlamak isteyen kullanıcıyı hukuki metin kutularıyla
        // karşılamak akışı orada öldürüyor. Kullanıcı, izinlerin verildiği ve
        // geri alındığı TEK yere gönderiliyor: Ayarlar > Gizlilik > Doğrulama
        // İzinleri. Orada iki izin ayrı ayrı açılıyor.
        case SELFIE_CODES.CONSENT_REQUIRED:
          close();
          Alert.alert(
            t("profile.selfie.codes.UT-6501Title"),
            t("profile.selfie.codes.UT-6501"),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("profile.selfie.intro.goToPrivacySettings"),
                onPress: () => uiBus.emit("openSettings", { section: "privacy" }),
              },
            ],
          );
          break;

        case SELFIE_CODES.NO_MAIN_PHOTO:
          close();
          Alert.alert(
            t("profile.selfie.codes.UT-6502Title"),
            t("profile.selfie.codes.UT-6502"),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("profile.selfie.intro.goToPhotos"),
                onPress: () => uiBus.emit("addProfilePhoto"),
              },
            ],
          );
          break;

        case SELFIE_CODES.ALREADY_VERIFIED:
          // Rozet zaten var; tek doğru davranış profili tazeleyip girişi
          // güncellemek — kullanıcıya hata göstermek kafa karıştırır.
          profileService.bustProfileCache();
          uiBus.emit("profileDirty");
          markSelfieWasVerified(userId);
          close();
          break;

        case SELFIE_CODES.FEATURE_OFF:
          // Sessizce kapan: özellik bu sürümde YOK, kullanıcının bilmesi
          // gereken bir şey de yok. Giriş noktası da gizleniyor.
          markSelfieFeatureUnavailable();
          close();
          // ⚠️ DEV'E ÖZEL: üretimde bu sessizlik doğru, ama geliştiricide
          // "butona bastım, modal kapandı, hiçbir şey olmadı" görüntüsü veriyor
          // ve bozuk koddan ayırt edilemiyor. Sebebi söylüyoruz.
          if (__DEV__) {
            showInfoToast({
              message: "[dev] SelfieVerification:Enabled kapalı (UT-6505)",
              variant: "error",
            });
          }
          break;

        case SELFIE_CODES.RATE_LIMITED:
          // Kalan süre bilerek verilmiyor → geri sayım gösterme.
          close();
          showInfoToast({ message: t("profile.selfie.codes.UT-6504"), variant: "error" });
          break;

        default: {
          close();
          const key = selfieCodeI18nKey(code);
          showInfoToast({
            message: key ? i18n.t(key) : t("profile.selfie.errors.generic"),
            variant: "error",
          });
        }
      }
    } finally {
      setStarting(false);
    }
  }, [starting, close, userId, t]);

  const handleFrames = useCallback(
    async (frames: SelfieFrame[]) => {
      if (!attempt) return;
      setSubmitting(true);
      try {
        const outcome = await submitSelfieFrames(attempt.attemptId, frames);

        // Rehber §14.3: eşiklerin gevşetilip gevşetilmeyeceği bu dağılıma
        // bakılarak karar verilecek. Yalnızca KOD gidiyor — kare/similarity/ham
        // poz değeri asla (bkz. selfieResultAnalytics).
        analytics.capture(
          "selfie_verification_result",
          selfieResultAnalytics(outcome, attempt),
        );

        // 🔴 verified:false HATA DEĞİL — buraya normal akışta geliniyor.
        if (outcome.verified) {
          markSelfieWasVerified(userId);
          profileService.bustProfileCache();
          uiBus.emit("profileDirty");
        }

        // Süre dolduysa kullanıcıya "tekrar dene" dedirtmenin anlamı yok:
        // yanlış bir şey yapmadı. Bir kez otomatik yeniden başlatılıyor.
        if (
          !outcome.verified &&
          isSelfieRetryAuto(outcome.reasonCode) &&
          !autoRestartedRef.current
        ) {
          autoRestartedRef.current = true;
          setAttempt(null);
          await beginAttempt();
          return;
        }

        setResult(outcome);
        setStep("result");
      } catch (error: any) {
        const code = errorCodeOf(error);
        devLog("🪪 [selfie] /submit hatası", code, error?.response?.status);

        if (code === SELFIE_CODES.FEATURE_OFF) {
          markSelfieFeatureUnavailable();
          close();
          return;
        }
        if (code === SELFIE_CODES.BAD_FRAMES) {
          // İstemci bug'ı — kullanıcıya teknik ayrıntı gösterilmez.
          devLog("🪪 [selfie] UT-6507: kare sayısı/boyutu sözleşmeye uymuyor", frames.length);
        }

        close();
        const key = selfieCodeI18nKey(code);
        showInfoToast({
          message: key ? i18n.t(key) : t("profile.selfie.errors.generic"),
          variant: "error",
        });
      } finally {
        // Kareler gönderildi (ya da düştü); diskte tutmanın anlamı yok.
        frames.forEach((frame) => forgetPhoto(frame.uri));
        setSubmitting(false);
      }
    },
    [attempt, userId, beginAttempt, close, t],
  );

  /** Yeniden deneme HER ZAMAN yeni `/start` — attemptId tek kullanımlık. */
  const handleRetry = useCallback(() => {
    setAttempt(null);
    setResult(null);
    autoRestartedRef.current = false;
    beginAttempt();
  }, [beginAttempt]);

  // Sheet'in TAVANI. Rıza metni her zaman bu tavana dayanır (ve içeride
  // kaydırılır); intro ile sonuç adımı içerikleri kadar yer kaplar. Çentiğin
  // altına girmemesi için üst güvenli alan düşülüyor.
  const maxSheetHeight = Math.max(320, windowHeight - insets.top - 24);

  // Kamera adımında sheet BİLEREK kapatılıyor: o adım tam ekran.
  const sheetVisible = visible && step !== "camera";

  return (
    <>
      {visible && step === "camera" && (
        <Host>
          {attempt ? (
            <SelfieCameraStep
              challenges={attempt.challenges}
              submitting={submitting}
              onFrames={handleFrames}
              onCancel={close}
            />
          ) : (
            // `attempt_expired` sonrası otomatik yeniden başlatma penceresi:
            // eski attempt düşürüldü, yenisi `/start`tan henüz dönmedi. Katman
            // AYAKTA KALMALI — yoksa kamera bir anlığına kaybolup arkadaki
            // profil ekranı görünüyor.
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.text} />
            </View>
          )}
        </Host>
      )}

      {/*
        KENDİ BottomSheetModalProvider'I — bu bir kopya değil, zorunluluk.

        Bileşen App.tsx'te uygulamanın provider'ının DIŞINDA duruyor (bkz. dosya
        başındaki not), gorhom modalı ise provider olmadan portal host'unu
        bulamıyor. Yerel provider hem o kısıtı çözüyor hem de niyetimizi
        koruyor: ağaçta uygulamanın tüm sheet'lerinden SONRA çizildiği için
        doğrulama sheet'i profil düzenleme modalının (o da bir sheet) üstünde
        açılıyor.

        Kalıcı mount: provider'ın hosting container'ı `pointerEvents="box-none"`
        boş bir katman, yani kapalıyken dokunuşları geçiriyor. Açılış/kapanışta
        mount/unmount etmek ise kapanış animasyonunu yarıda keserdi.
      */}
      <BottomSheetModalProvider>
        <AppBottomSheet
          visible={sheetVisible}
          onClose={handleSheetClose}
          // snapPoints YOK: her adım kendi içeriği kadar yer kaplasın. Sabit
          // bir yüzde, intro'nun altında kocaman bir boşluk bırakır.
          enableDynamicSizing
          maxDynamicContentSize={maxSheetHeight}
          backdrop="blur"
          // `/start` uçarken aşağı çekip kapatmak saatlik haklardan birini
          // sahipsiz yakardı — istek dönene kadar sheet kilitli.
          enablePanDownToClose={!starting}
          handleIndicatorStyle={{ backgroundColor: ink(0.25) }}
        >
          {step === "result" && result ? (
            <ResultStep
              result={result}
              onRetry={handleRetry}
              onClose={close}
              insetBottom={insets.bottom}
            />
          ) : (
            <IntroStep
              busy={starting}
              onStart={beginAttempt}
              onClose={close}
              insetBottom={insets.bottom}
            />
          )}
        </AppBottomSheet>
      </BottomSheetModalProvider>
    </>
  );
}

/**
 * Tam ekran kök katman — navigator'ın ve tüm sheet'lerin üstünde.
 * YALNIZ KAMERA ADIMI kullanıyor; diğer adımlar bottom sheet'in içinde.
 */
function Host({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.bg,
      }}
    >
      {children}
    </View>
  );
}

/**
 * Sheet içeriği — `BottomSheetView` ZORUNLU: sheet yüksekliğini ölçen tek şey
 * bu bileşenin layout'u, düz bir `View` yüksekliğini bildirmiyor. Aynı sebeple
 * içeride ne `flex: 1` ne de ayrı bir ScrollView var; içerik kısa ve sheet
 * kendini ona göre boyutluyor.
 */
function IntroStep({
  busy,
  onStart,
  onClose,
  insetBottom,
}: {
  busy: boolean;
  onStart: () => void;
  onClose: () => void;
  insetBottom: number;
}) {
  const { t } = useTranslation();

  return (
    <BottomSheetView
      style={{
        paddingTop: 8,
        paddingHorizontal: 28,
        paddingBottom: insetBottom + 16,
        gap: 16,
      }}
    >
      {/* Rozet BAŞLIKLA aynı satırda: sheet'te başlığın üstünde tek başına
          duran ikon, kısalan yükseklikte iki ayrı blok gibi okunuyordu. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <SFIcon
          name="checkmark.seal.fill"
          fallback={ShieldCheck}
          size={40}
          color={colors.text}
          style={{ pointerEvents: "none" }}
        />
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 26,
            fontWeight: "700",
          }}
        >
          {t("profile.selfie.intro.title")}
        </Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
        {t("profile.selfie.intro.description")}
      </Text>

      <View style={{ gap: 12 }}>
        <IntroBullet text={t("profile.selfie.intro.bullet1")} />
        <IntroBullet text={t("profile.selfie.intro.bullet2")} />
        <IntroBullet text={t("profile.selfie.intro.bullet3")} />
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
        {t("profile.selfie.intro.privacyNote")}
      </Text>

      <View style={{ gap: 8, marginTop: 4 }}>
        <AnimatedPressable
          onPress={onStart}
          disabled={busy}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
          }}
        >
          {busy ? (
            <ActivityIndicator
              style={{ paddingVertical: 17.5 }}
              color={colors.onInverseSurface}
            />
          ) : (
            <Text
              style={{
                paddingVertical: 20,
                textAlign: "center",
                fontSize: 15,
                fontWeight: "700",
                color: colors.onInverseSurface,
              }}
            >
              {t("profile.selfie.intro.startButton")}
            </Text>
          )}
        </AnimatedPressable>

        <AnimatedPressable onPress={onClose} disabled={busy} pressScale={1}>
          <Text
            style={{
              paddingVertical: 8,
              textAlign: "center",
              fontSize: 14,
              color: colors.textSecondary,
            }}
          >
            {t("common.cancel")}
          </Text>
        </AnimatedPressable>
      </View>
    </BottomSheetView>
  );
}

function IntroBullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
        •
      </Text>
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontSize: 15,
          lineHeight: 22,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function ResultStep({
  result,
  onRetry,
  onClose,
  insetBottom,
}: {
  result: SelfieResult;
  onRetry: () => void;
  onClose: () => void;
  insetBottom: number;
}) {
  const { t } = useTranslation();
  const success = result.verified;

  return (
    <BottomSheetView
      style={{
        paddingTop: 12,
        paddingHorizontal: 28,
        paddingBottom: insetBottom + 16,
        alignItems: "center",
        gap: 16,
      }}
    >
      <SFIcon
        name={success ? "checkmark.seal.fill" : "exclamationmark.circle"}
        fallback={success ? BadgeCheck : ShieldCheck}
        size={56}
        color={success ? colors.success : colors.textSecondary}
        style={{ pointerEvents: "none" }}
      />
      <Text
        style={{
          color: colors.text,
          fontSize: 24,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {success
          ? t("profile.selfie.result.successTitle")
          : selfieReasonTitle(result.reasonCode)}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 15,
          lineHeight: 22,
          textAlign: "center",
        }}
      >
        {success
          ? t("profile.selfie.result.successBody")
          : selfieReasonText(result.reasonCode, result.message)}
      </Text>

      {!success && result.failedAtStep != null && (
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>
          {t("profile.selfie.result.failedAtStep", { step: result.failedAtStep })}
        </Text>
      )}

      {/* Butonlar sheet'in TAM GENİŞLİĞİNDE: dış kap `alignItems: "center"`
          olduğu için `alignSelf: "stretch"` verilmezse pill'ler metin kadar
          büzülüyor. */}
      <View style={{ alignSelf: "stretch", gap: 8, marginTop: 4 }}>
        {!success && result.canRetry && (
          <AnimatedPressable
            onPress={onRetry}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.inverseSurface,
            }}
          >
            <Text
              style={{
                paddingVertical: 20,
                textAlign: "center",
                fontSize: 15,
                fontWeight: "700",
                color: colors.onInverseSurface,
              }}
            >
              {t("profile.selfie.result.retry")}
            </Text>
          </AnimatedPressable>
        )}

        <AnimatedPressable
          onPress={onClose}
          style={
            success
              ? {
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  backgroundColor: colors.inverseSurface,
                }
              : undefined
          }
          pressScale={success ? 0.97 : 1}
        >
          <Text
            style={{
              paddingVertical: success ? 20 : 8,
              textAlign: "center",
              fontSize: success ? 15 : 14,
              fontWeight: success ? "700" : "400",
              color: success ? colors.onInverseSurface : ink(0.55),
            }}
          >
            {success ? t("common.ok") : t("profile.selfie.result.close")}
          </Text>
        </AnimatedPressable>
      </View>
    </BottomSheetView>
  );
}
