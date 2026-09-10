import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { OtpInput, type OtpInputRef } from "react-native-otp-entry";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import { ClipboardPaste } from "@/shared/icons";
import { hideToast, showInfoToast } from "@/shared/services/toaster";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import { REFERRAL_STEP_NUMBER } from "@/features/auth/registrationFlow";
import {
  REFERRAL_CODE_LENGTH,
  extractReferralCode,
  normalizeReferralCode,
} from "@/features/auth/referralCode";
import { colors, ink } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";

/**
 * Davet kodu adımı — sihirbazın İLK ekranı (bkz. registrationFlow.ts).
 *
 * 🔴 OPSİYONEL BİR ADIM. "Devam" kod boşken de aktif, "Atla" belirgin: davet
 * edilmemiş kullanıcıyı geçemeyeceği bir kapıya dayamak kaydın en pahalı
 * yerinde (henüz hiçbir şey yatırmamışken) terk üretir.
 *
 * 🔴 DAVET EDENİN ADI GÖSTERİLMİYOR (ürün kararı, plan §0): ekran yalnız "kod
 * geçerli / bulamadık" diyor. Aksi halde kod deneyerek isim toplanabilirdi;
 * `validate` ucu de bu yüzden sadece `{ valid: bool }` dönüyor.
 *
 * 🔴 GEÇERSİZ KOD AKIŞI DURDURMUYOR: satır kırmızıya dönüyor ama "Devam" aktif
 * kalıyor. Kodun geçerliliği kaydın koşulu değil, bir hediyenin koşulu — yanlış
 * hatırlanan bir kod yüzünden kullanıcıyı kayıt olamaz hâle getirmek orantısız.
 * Kod yine de gönderiliyor; backend geçersizse sessizce yok sayıyor.
 *
 * SONUÇ (geçerli / bulunamadı) TOAST'TA, satırda değil: uygulamanın geri
 * kalanıyla aynı dynamic-island banner'ı (bkz. services/toaster.ts). Ekranda
 * kalıcı iz olarak yalnız geçersiz kodda kutuların kırmızı kenarlığı var;
 * "kontrol ediliyor" ise kısa ömürlü olduğu için inline spinner olarak kaldı —
 * onu da toast yapsak sonuç banner'ı kuyrukta 5 sn beklerdi.
 */

/** Kod dolduktan sonra isteği beklet — her hanede bir istek atmamak için. */
const VALIDATE_DEBOUNCE_MS = 300;

/**
 * `idle` = henüz hüküm yok (kod eksik, ya da sunucu cevap vermedi).
 * `registrationToken.ts`teki üç durumlu mantığın aynısı: ağ hatasını
 * "geçersiz" saymak, çevrimdışı kullanıcıya var olmayan bir hata gösterirdi.
 */
type ValidationState = "idle" | "checking" | "valid" | "invalid";

/** Sunucu kod hakkında HÜKÜM VERMEDİ mi? (bkz. registrationToken.ts) */
const isTransientStatus = (status?: number): boolean =>
  status === 429 || status === 408 || (typeof status === "number" && status >= 500);

export default function RegisterReferralScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "RegisterReferral">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const savedCode = useAppSelector(
    (s: any) => s.auth.registrationForm.referralCode as string | null,
  );

  // Kod ekran STATE'inde (RegisterStep2'deki gibi react-hook-form'da değil):
  // orada formu yalnız "Doğrula" butonu okuyordu, burada ise durum satırı,
  // "Devam" ve doğrulama efekti aynı değeri okuyor. Formda tutmak render
  // kazandırmaz, sadece üç aboneye ayrı `useWatch` yazdırırdı.
  const [code, setCode] = useState(() => normalizeReferralCode(savedCode));
  const [status, setStatus] = useState<ValidationState>("idle");
  const [clipboardHasText, setClipboardHasText] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  // Uçuştaki isteğin sırası. Kullanıcı kodu düzeltince eski cevap sonradan
  // inip yeni kodun durumunu EZEBİLİYOR — cevap kendi turunu doğrulamalı.
  const requestSeq = useRef(0);
  // Ekranda hâlâ bu ekranın attığı bir sonuç toast'ı var mı? Kullanıcı kodu
  // değiştirince eski hüküm anlamsızlaşıyor; onu kapatıyoruz. Yalnız KENDİ
  // toast'ımızı kapatmak için ref — başka bir banner'ı (mesaj vb.) yutmayalım.
  const verdictToastShown = useRef(false);

  const complete = code.length === REFERRAL_CODE_LENGTH;

  // ── Doğrulama: 5 karakter dolunca, 300 ms debounce ───────────────────────
  useEffect(() => {
    if (verdictToastShown.current) {
      verdictToastShown.current = false;
      hideToast();
    }
    if (!complete) {
      setStatus("idle");
      return;
    }
    const seq = ++requestSeq.current;
    setStatus("checking");

    const timer = setTimeout(async () => {
      let next: ValidationState = "idle";
      try {
        // Anonim uç: kullanıcı henüz yok, `api` instance'ının auth/refresh
        // zinciri burada anlamsız (bkz. registrationToken.ts).
        const response = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.REFERRAL_VALIDATE}?code=${encodeURIComponent(code)}`,
        );
        if (isTransientStatus(response.status)) {
          devLog("⚠️ [referral] geçici sunucu cevabı:", response.status);
        } else {
          const data = await response.json();
          next = data?.isSuccess && data?.result?.valid === true ? "valid" : "invalid";
        }
      } catch (error) {
        devLog("⚠️ [referral] validate network error:", error);
      }
      if (requestSeq.current !== seq) return;
      setStatus(next);
      if (next === "valid") {
        verdictToastShown.current = true;
        // `note`: hediye 1 not, simge onu gösteriyor.
        showInfoToast({
          title: t("auth.referral.validTitle"),
          message: t("auth.referral.valid"),
          icon: "note",
        });
      } else if (next === "invalid") {
        verdictToastShown.current = true;
        showInfoToast({
          title: t("auth.referral.invalidTitle"),
          message: t("auth.referral.invalid"),
          variant: "error",
        });
      }
    }, VALIDATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code, complete, t]);

  // Panoda metin var mı? (içeriği OKUMAZ → iOS'ta izin uyarısı çıkmaz.)
  // Yapıştır butonu yalnız bunun doğru olduğu hâlde çiziliyor: boş panoda
  // "Yapıştır"a basmak sessiz bir hata (bkz. ForgotPasswordCodeScreen).
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      Clipboard.hasStringAsync()
        ?.then((has) => {
          if (!cancelled) setClipboardHasText(has === true);
        })
        .catch(() => {});
    };
    check();
    // Kullanıcı kodu mesajlaşma uygulamasından kopyalayıp geri döndüğünde yakala.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  /**
   * Native input'tan gelen HAM metni koda çevirip kütüphaneye ref üzerinden
   * yazar. `extractOtp` KULLANILMIYOR: o rakam-only (bkz. referralCode.ts).
   */
  const handleOtpChange = useCallback((raw: string) => {
    otpRef.current?.setValue(extractReferralCode(raw));
  }, []);

  const handlePaste = async () => {
    try {
      const pasted = extractReferralCode((await Clipboard.getStringAsync()) ?? "");
      if (!pasted) return;
      otpRef.current?.setValue(pasted);
    } catch (error) {
      devLog("⚠️ [referral] pano okunamadı:", error);
    }
  };

  const handleContinue = () => {
    Keyboard.dismiss();
    // Yarım kod GÖNDERİLMEZ: backend 5 karakter bekliyor, eksik değer yalnız
    // sunucuda bir doğrulama hatasına dönüşürdü.
    dispatch(
      updateRegistrationField({
        field: "referralCode",
        value: complete ? code : null,
      }),
    );
    navigation.navigate("RegisterStep3");
  };

  const handleSkip = () => {
    Keyboard.dismiss();
    dispatch(updateRegistrationField({ field: "referralCode", value: null }));
    // `reset`: "Atla" kesin bir karar, geri yığınında dönülecek bir kod ekranı
    // bırakmıyor (Step3'ün geri butonu zaten kaydı bırakma onayına gidiyor).
    navigation.reset({ index: 0, routes: [{ name: "RegisterStep3" }] });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        {/* Step3'ün geri butonuyla AYNI davranış: bu ekranın altında bir yığın
            yok (Step2 `reset` ile buraya geçiyor), yani "geri" = kaydı bırak. */}
        <RegisterBackButton
          onPress={() =>
            Alert.alert(
              t("auth.step3.confirmCancel.title"),
              t("auth.step3.confirmCancel.message"),
              [
                { text: t("common.no"), style: "cancel" },
                {
                  text: t("common.yes"),
                  style: "destructive",
                  onPress: () => navigation.navigate("Welcome"),
                },
              ],
            )
          }
        />
      </View>

      <RegisterProgressBar step={REFERRAL_STEP_NUMBER} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold" style={{ color: colors.text }}>
              {t("auth.referral.title")}
            </Text>
            <Text
              className="text-[18px] font-normal mb-8"
              style={{ color: colors.textSecondary }}
            >
              {t("auth.referral.subtitle")}
            </Text>
          </View>

          {/* RegisterStep2'deki OTP bloğunun aynısı; farklar: 5 hane,
              alfanümerik tip, büyük harf zorlaması ve `textContentType` YOK —
              davet kodu bir doğrulama kodu değil, iOS'un oneTimeCode autofill'i
              buraya yanlış değer basardı. */}
          <OtpInput
            ref={otpRef}
            numberOfDigits={REFERRAL_CODE_LENGTH}
            type="alphanumeric"
            placeholder={t("auth.referral.placeholder")}
            onTextChange={(text) => setCode(normalizeReferralCode(text))}
            textInputProps={{
              autoCapitalize: "characters",
              autoCorrect: false,
              // Kütüphanenin varsayılanı `oneTimeCode` — bu bir doğrulama kodu
              // DEĞİL; iOS o autofill'i açtığında mailden gelen 6 haneli kodu
              // buraya basmaya çalışırdı.
              textContentType: "none",
              autoComplete: "off",
              // Kütüphanenin maxLength'i uzun yapıştırmayı kırpıp kodu
              // bozuyor; ham metin extractReferralCode'dan geçiyor.
              maxLength: undefined,
              onChangeText: handleOtpChange,
              // caret dikdörtgeni CGRectZero olursa uzun basma menüsü yanlış
              // yerde çıkıyor (bkz. RegisterStep2Screen).
              caretHidden: false,
              selectionColor: "transparent",
            }}
            theme={{
              containerStyle: { justifyContent: "center", gap: 4 },
              pinCodeContainerStyle: {
                width: 56,
                height: 64,
                borderRadius: 15,
                borderCurve: "continuous",
                backgroundColor: colors.surface,
                borderWidth: status === "invalid" ? 1 : 0,
                borderColor: status === "invalid" ? colors.error : "transparent",
              },
              focusedPinCodeContainerStyle: {
                borderWidth: status === "invalid" ? 1 : 0,
                borderColor: status === "invalid" ? colors.error : "transparent",
              },
              pinCodeTextStyle: {
                color: colors.text,
                fontSize: 28,
                fontWeight: "600",
              },
              placeholderTextStyle: { color: ink(0.25), fontSize: 28 },
              focusStickStyle: { backgroundColor: colors.inverseSurface },
            }}
          />

          {clipboardHasText ? (
            <View className="flex-row justify-center mt-5">
              <TouchableOpacity activeOpacity={0.8} onPress={handlePaste}>
                <View className="flex-row items-center gap-2 py-[2px]">
                  <SFIcon
                    name="doc.on.clipboard"
                    fallback={ClipboardPaste}
                    size={16}
                    color={colors.text}
                    strokeWidth={2.5}
                    weight="bold"
                  />
                  <Text className="font-medium" style={{ color: colors.text }}>
                    {t("auth.referral.paste")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Yapıştır'ın ALTINDA ve sabit yükseklikte: spinner kutuların hemen
              altında belirip kaybolunca Yapıştır aşağı-yukarı zıplıyordu. */}
          <StatusLine status={status} t={t} />
        </View>
      </TouchableWithoutFeedback>

      <View className="px-6 pb-8 pt-4">
        <AnimatedPressable
          onPress={handleContinue}
          testID="referral-continue"
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
          }}
        >
          <Text
            className="py-[20px] font-bold text-[15px] text-center"
            style={{ color: colors.onInverseSurface }}
          >
            {t("auth.referral.continue")}
          </Text>
        </AnimatedPressable>

        {/* "Atla" BELİRGİN, gizli bir bağlantı değil: adım opsiyonel olduğunu
            kendisi söylemeli, kullanıcı çıkışı aramak zorunda kalmamalı. */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSkip}
          testID="referral-skip"
          style={{ alignSelf: "center", paddingHorizontal: 24, paddingVertical: 16 }}
        >
          <Text className="font-medium text-[15px]" style={{ color: ink(0.6) }}>
            {t("auth.referral.skip")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * "Kontrol ediliyor" satırı — Yapıştır'ın altında. Sonuç (geçerli / bulunamadı) burada DEĞİL,
 * toast'ta (bkz. dosya başı). `idle` hiçbir şey çizmiyor: "kontrol edilmedi"
 * kullanıcıya söylenecek bir şey değil, boş satır zaten onu anlatıyor.
 */
function StatusLine({
  status,
  t,
}: {
  status: ValidationState;
  t: (key: string) => string;
}) {
  // Satır HER ZAMAN yer kaplıyor (sabit yükseklik); yalnız içeriği koşullu.
  // Aksi hâlde spinner gelip giderken üstündeki Yapıştır satırı kayıyordu.
  return (
    <View
      className="flex-row items-center justify-center gap-2 mt-4"
      style={{ height: 20 }}
    >
      {status === "checking" ? (
        <>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text className="text-[13px] font-medium" style={{ color: colors.textSecondary }}>
            {t("auth.referral.checking")}
          </Text>
        </>
      ) : null}
    </View>
  );
}
