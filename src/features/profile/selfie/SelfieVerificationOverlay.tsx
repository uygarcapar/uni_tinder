import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BadgeCheck, ShieldCheck } from "@/shared/icons";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
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
import SelfieConsentStep from "./SelfieConsentStep";
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
  type SelfieAttempt,
  type SelfieResult,
} from "./selfieVerification";

/**
 * Selfie doğrulama akışının kök host'u: intro → rıza → kamera → sonuç.
 *
 * NEREYE MOUNT EDİLİYOR: App.tsx'te CropperOverlay'in yanına, yani
 * `BottomSheetModalProvider`'ın DIŞINA. Gerekçe cropper ile aynı — gorhom
 * portal'ı provider içindeki her şeyin üstüne boyanıyor, kamera profil
 * düzenleme modalının (AppModal, o da bir sheet) altında kalmamalı.
 *
 * NEDEN AYRI BİR "intro" ADIMI VAR: `/start` saatlik 5 haktan birini yakıyor,
 * dolayısıyla ekran açılışında değil kullanıcı "Başla"ya bastığında çağrılmalı.
 * Bildirimden gelen derin bağlantı da kullanıcıyı doğrudan kameraya düşürmemeli.
 */

type Step = "intro" | "consent" | "camera" | "result";

const errorCodeOf = (error: any): string | null =>
  error?.response?.data?.code ?? error?.response?.data?.errorCode ?? null;

export default function SelfieVerificationOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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

  const close = useCallback(() => {
    setVisible(false);
    setStep("intro");
    setAttempt(null);
    setResult(null);
    setStarting(false);
    setSubmitting(false);
    autoRestartedRef.current = false;
  }, []);

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
      const next = await startSelfieVerification();
      if (!next) {
        // 200 geldi ama şekil tutmadı (challenge yok / attemptId yok). Kod
        // yolundan AYRI bir başarısızlık — dev'de ayırt edilebilir olmalı.
        if (__DEV__) {
          showInfoToast({ message: "[dev] /start 200 ama şekil geçersiz", variant: "error" });
        }
        showInfoToast({ message: t("profile.selfie.errors.generic"), variant: "error" });
        close();
        return;
      }
      setAttempt(next);
      setResult(null);
      setStep("camera");
    } catch (error: any) {
      const code = errorCodeOf(error);
      const status = error?.response?.status;
      devLog("🪪 [selfie] /start hatası", code, status);

      // UT-6503 ve UT-6505 ikisi de SESSİZCE kapanıyor (kasıtlı: kullanıcının
      // bilmesi gereken bir şey yok). Geliştirici için bu ikisi ayırt
      // edilemez hale geliyor — "neden kapandı"nın cevabı yalnız Metro
      // log'unda kalıyor. Dev'de kodu ekrana da bas.
      if (__DEV__) {
        showInfoToast({
          message: `[dev] /start ${status ?? "ağ"} · ${code ?? "kod yok"}`,
          variant: "error",
        });
      }

      switch (code) {
        case SELFIE_CODES.CONSENT_REQUIRED:
          setStep("consent");
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
          // ⚠️ `setAttempt(null)` YAPMA. `step` hâlâ "camera" ve kamera dalının
          // koşulu `step === "camera" && attempt` — attempt'i erken silmek
          // beginAttempt dönene kadar HİÇBİR dalı eşleştirmez ve render intro
          // sheet'ine düşer. Sheet o aralıkta mount olup hemen unmount olur,
          // gorhom'un present/dismiss state machine'i bunu kaldırmıyor
          // (bkz. AppBottomSheet'teki handleDismiss notu). Yeni attempt
          // zaten beginAttempt içinde set ediliyor.
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

  /**
   * Yeniden deneme HER ZAMAN yeni `/start` — attemptId tek kullanımlık.
   *
   * ⚠️ Burada `setResult(null)` / `setAttempt(null)` YAPILMIYOR. Yapılırsa
   * `step` "result" kalırken `result` null olur, hiçbir dal eşleşmez ve render
   * intro sheet'ine düşer: kullanıcı "Tekrar Dene"ye bastığında sheet bir anlık
   * açılıp kapanıyor ve akış kapanmış gibi görünüyordu. İkisini de beginAttempt
   * başarılı olunca kendisi temizliyor; o ana kadar sonuç ekranı durur.
   */
  const handleRetry = useCallback(() => {
    autoRestartedRef.current = false;
    beginAttempt();
  }, [beginAttempt]);

  if (!visible) return null;

  if (step === "consent") {
    return (
      <Host>
        <SelfieConsentStep onAccepted={beginAttempt} onCancel={close} />
      </Host>
    );
  }

  if (step === "camera" && attempt) {
    return (
      <Host>
        <SelfieCameraStep
          // Yeni attempt = SIFIRDAN çekim. `attempt_expired` otomatik yeniden
          // başlatmasında `step` "camera"da kaldığı için bileşen kendiliğinden
          // unmount olmuyor; key olmadan iç `index`i son karede takılı kalır ve
          // kullanıcı challenge sayısından az kare çekip UT-6507'ye düşerdi.
          key={attempt.attemptId}
          challenges={attempt.challenges}
          submitting={submitting}
          onFrames={handleFrames}
          onCancel={close}
        />
      </Host>
    );
  }

  if (step === "result" && result) {
    return (
      <Host>
        <ResultStep
          result={result}
          busy={starting}
          onRetry={handleRetry}
          onClose={close}
          insetTop={insets.top}
          insetBottom={insets.bottom}
        />
      </Host>
    );
  }

  // Intro bir BottomSheetModal ve KENDİ provider'ını taşıyor.
  //
  // Gerekçe: bu overlay App.tsx'te uygulama genelindeki
  // `BottomSheetModalProvider`ın DIŞINA mount edilmiş (kamera adımı profil
  // düzenleme sheet'inin altında kalmasın diye). Sheet'in bir portal host'a
  // ihtiyacı var, o yüzden burada yerel bir tane kuruluyor. Katman sırası yine
  // doğru: App.tsx'te overlay uygulama provider'ından SONRA render edildiği
  // için bu host da onun üstüne boyanıyor.
  //
  // `Host`'a SARILMIYOR — opak zemin sheet'in perdesini öldürür, arkadaki
  // profil ekranı görünmeli. `box-none`: perde dışındaki dokunuşlar altta.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <BottomSheetModalProvider>
        <IntroStep
          busy={starting}
          onStart={beginAttempt}
          onClose={close}
          insetBottom={insets.bottom}
        />
      </BottomSheetModalProvider>
    </View>
  );
}

/** Tam ekran kök katman — navigator'ın ve tüm sheet'lerin üstünde. */
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

  const footer = (
    <View
      style={{
        paddingHorizontal: 28,
        paddingTop: 12,
        paddingBottom: insetBottom + 16,
        backgroundColor: colors.bg,
      }}
    >
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
    </View>
  );

  return (
    <AppBottomSheet
      visible
      // İPTAL BUTONU KALDIRILDI → kapanma yolları yalnız aşağı sürükleme ve
      // perdeye dokunma. `handleComponent`'i null'a çekme: tutamaç bu iki
      // yolun TEK görsel işareti. `busy` iken kapanış kapalı, `/start` uçarken
      // kapatmak attempt'i sahipsiz bırakırdı.
      onClose={busy ? () => {} : onClose}
      enablePanDownToClose={!busy}
      snapPoints={["88%"]}
      footer={footer}
      backgroundStyle={{ backgroundColor: colors.bg }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingTop: 8,
          paddingHorizontal: 28,
          // Footer içeriğin üstüne biniyor; son satır altında kalmasın.
          paddingBottom: 120,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Başlık bloğu ORTALI, madde listesi değil: ortalanmış bir liste sol
            kenarını kaybeder ve okunurluğu düşer. */}
        <View style={{ alignItems: "center", gap: 16 }}>
          <SFIcon
            name="checkmark.seal.fill"
            fallback={ShieldCheck}
            size={72}
            color={colors.text}
            style={{ pointerEvents: "none" }}
          />
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            {t("profile.selfie.intro.title")}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 15,
              lineHeight: 22,
              textAlign: "center",
            }}
          >
            {t("profile.selfie.intro.description")}
          </Text>
        </View>

        <View style={{ gap: 12, marginTop: 8 }}>
          <IntroBullet text={t("profile.selfie.intro.bullet1")} />
          <IntroBullet text={t("profile.selfie.intro.bullet2")} />
          <IntroBullet text={t("profile.selfie.intro.bullet3")} />
          <IntroBullet text={t("profile.selfie.intro.bullet4")} />
          <IntroBullet text={t("profile.selfie.intro.bullet5")} />
        </View>

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 13,
            lineHeight: 19,
            marginTop: 8,
          }}
        >
          {t("profile.selfie.intro.privacyNote")}
        </Text>
      </BottomSheetScrollView>
    </AppBottomSheet>
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
  busy,
  onRetry,
  onClose,
  insetTop,
  insetBottom,
}: {
  result: SelfieResult;
  busy: boolean;
  onRetry: () => void;
  onClose: () => void;
  insetTop: number;
  insetBottom: number;
}) {
  const { t } = useTranslation();
  const success = result.verified;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          paddingTop: insetTop + 32,
          paddingHorizontal: 28,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <SFIcon
          name={success ? "checkmark.seal.fill" : "exclamationmark.circle"}
          fallback={success ? BadgeCheck : ShieldCheck}
          size={64}
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
          <Text
            style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}
          >
            {t("profile.selfie.result.failedAtStep", { step: result.failedAtStep })}
          </Text>
        )}
      </View>

      <View
        style={{
          paddingHorizontal: 28,
          paddingBottom: insetBottom + 16,
          gap: 8,
        }}
      >
        {!success && result.canRetry && (
          <AnimatedPressable
            onPress={onRetry}
            // Yeni `/start` uçarken sonuç ekranı DURUYOR (bkz. handleRetry).
            // Geri bildirim olmazsa buton ölü görünür ve ikinci dokunuş
            // saatlik 5 haktan bir tane daha yakar.
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
                {t("profile.selfie.result.retry")}
              </Text>
            )}
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
    </View>
  );
}
