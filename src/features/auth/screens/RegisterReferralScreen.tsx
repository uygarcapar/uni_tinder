import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { OtpInput, type OtpInputRef } from "react-native-otp-entry";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { hideToast, showInfoToast } from "@/shared/services/toaster";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import { REFERRAL_STEP_NUMBER } from "@/features/auth/registrationFlow";
import {
  REFERRAL_CODE_LENGTH,
  extractReferralCode,
  normalizeReferralCode,
} from "@/features/auth/referralCode";
import { colors } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";

/**
 * Davet kodu adımı — sihirbazın İLK ekranı (bkz. registrationFlow.ts).
 *
 * 🔴 OPSİYONEL BİR ADIM. Davet edilmemiş kullanıcıyı geçemeyeceği bir kapıya
 * dayamak kaydın en pahalı yerinde (henüz hiçbir şey yatırmamışken) terk
 * üretir — o yüzden kod boşken de çıkış yolu var.
 *
 * ÇIKIŞ TEK BUTONDA: ayrı bir "Atla" bağlantısı YOK, alttaki tek CTA kod
 * eksikken "Atla", 5 hane dolunca "Devam Et" yazıyor. İkisi yan yana
 * durduğunda footer iki karar sunuyordu ("Devam" da kod boşken geçiyordu, yani
 * aynı şeyi iki buton yapıyordu); tek buton o anda yapılabilen tek şeyi
 * söylüyor. Buton KLAVYENİN ÜSTÜNE yapışık (KeyboardStickyView) — OTP
 * kutuları açılışta odaklandığı için klavye hep açık, normal akıştaki footer
 * klavyenin altında kalıyordu.
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
 * 🔴 KOD DOLUNCA KENDİ İLERLİYOR (RegisterStep2'nin `onFilled` mantığının
 * aynısı): hüküm "geçerli" ise kullanıcı "Devam"a basmak zorunda değil, ekran
 * kodu yazıp Step3'e geçiyor. GEÇERSİZDE İLERLEMİYOR — kullanıcı yazdığını
 * düzeltebilsin; çıkış yolu "Devam"/"Atla" olarak duruyor. Otomatik geçiş
 * yalnız o kod için hükmün İLK duyurulduğu turda var (toast ile aynı kapı):
 * aksi halde persist'ten dönen geçerli bir kod kullanıcıyı ekranda tutmaz,
 * her açılışta Step3'e fırlatırdı.
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
  // Sonuç toast'ı bu kod için daha önce gösterildi mi? Persist'ten geliyor:
  // uygulama kapatılıp açılınca ekran yeniden kurulup kodu yeniden doğruluyor
  // (sunucu otoritesi kalsın), ama aynı hükmü ikinci kez BANNER YAPMIYOR.
  // Kullanıcının şikâyeti tam buydu: linkle bir kez gelen kodun "geçerli"
  // toast'ı her açılışta tekrar düşüyordu.
  const toastedCode = useAppSelector(
    (s: any) => s.auth.registrationForm.referralCodeToasted as string | null,
  );
  const toastedCodeRef = useRef(toastedCode);
  toastedCodeRef.current = toastedCode;

  // Kod ekran STATE'inde (RegisterStep2'deki gibi react-hook-form'da değil):
  // orada formu yalnız "Doğrula" butonu okuyordu, burada ise durum satırı,
  // "Devam" ve doğrulama efekti aynı değeri okuyor. Formda tutmak render
  // kazandırmaz, sadece üç aboneye ayrı `useWatch` yazdırırdı.
  const [code, setCode] = useState(() => normalizeReferralCode(savedCode));
  const [status, setStatus] = useState<ValidationState>("idle");

  const otpRef = useRef<OtpInputRef>(null);
  // Uçuştaki isteğin sırası. Kullanıcı kodu düzeltince eski cevap sonradan
  // inip yeni kodun durumunu EZEBİLİYOR — cevap kendi turunu doğrulamalı.
  const requestSeq = useRef(0);
  // Ekranda hâlâ bu ekranın attığı bir sonuç toast'ı var mı? Kullanıcı kodu
  // değiştirince eski hüküm anlamsızlaşıyor; onu kapatıyoruz. Yalnız KENDİ
  // toast'ımızı kapatmak için ref — başka bir banner'ı (mesaj vb.) yutmayalım.
  const verdictToastShown = useRef(false);

  const complete = code.length === REFERRAL_CODE_LENGTH;

  // Redux'taki kodu (davet linkinden — bkz. AppNavigator LINKING — ya da geri
  // gelince) KUTULARA yaz. OtpInput uncontrolled: `code` state'i savedCode ile
  // başlasa da kütüphane onu görmüyor; doğrulama çalışıp "kod geçerli" derken
  // kutular boş kalıyordu. `setValue` onTextChange'i tetikler → `code` de
  // aynı yoldan güncellenir. Bağımlılık savedCode: link ekran açıkken
  // gelirse de yazılsın.
  useEffect(() => {
    const saved = normalizeReferralCode(savedCode);
    if (saved) otpRef.current?.setValue(saved);
  }, [savedCode]);

  /**
   * Kodu forma yazıp Step3'e geçer. İki çağıranı var: "Devam" ve kod geçerli
   * çıktığında doğrulama efektinin kendisi (bkz. dosya başı). Yarım kod
   * GÖNDERİLMEZ: backend 5 karakter bekliyor, eksik değer yalnız sunucuda bir
   * doğrulama hatasına dönüşürdü.
   */
  const goNext = useCallback(
    (value: string | null) => {
      Keyboard.dismiss();
      dispatch(updateRegistrationField({ field: "referralCode", value }));
      navigation.navigate("RegisterStep3");
    },
    [dispatch, navigation],
  );

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
      if (next === "idle") return;
      // Aynı kodun hükmü zaten duyuruldu (persist'ten geri gelen tur):
      // durum satırı/kenarlık güncellendi, banner tekrarlanmıyor.
      if (toastedCodeRef.current === code) return;
      dispatch(updateRegistrationField({ field: "referralCodeToasted", value: code }));
      verdictToastShown.current = true;
      if (next === "valid") {
        // `note`: hediye 1 not, simge onu gösteriyor.
        showInfoToast({
          title: t("auth.referral.validTitle"),
          message: t("auth.referral.valid"),
          icon: "note",
        });
        // Hüküm olumlu → buton beklemeden ilerliyoruz. Banner uygulama
        // genelinde olduğu için Step3'te de görünmeye devam ediyor; burada
        // "toast'ı görsün" diye gecikme koymuyoruz.
        goNext(code);
      } else {
        showInfoToast({
          title: t("auth.referral.invalidTitle"),
          message: t("auth.referral.invalid"),
          variant: "error",
        });
      }
    }, VALIDATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code, complete, t, dispatch, goNext]);

  /**
   * Native input'tan gelen HAM metni koda çevirip kütüphaneye ref üzerinden
   * yazar. `extractOtp` KULLANILMIYOR: o rakam-only (bkz. referralCode.ts).
   */
  const handleOtpChange = useCallback((raw: string) => {
    otpRef.current?.setValue(extractReferralCode(raw));
  }, []);

  const handleSkip = () => {
    Keyboard.dismiss();
    dispatch(updateRegistrationField({ field: "referralCode", value: null }));
    dispatch(updateRegistrationField({ field: "referralCodeToasted", value: null }));
    // `reset`: "Atla" kesin bir karar, geri yığınında dönülecek bir kod ekranı
    // bırakmıyor (Step3'ün geri butonu zaten kaydı bırakma onayına gidiyor).
    navigation.reset({ index: 0, routes: [{ name: "RegisterStep3" }] });
  };

  /**
   * Tek CTA. Kod 5 haneyse "Devam Et" (kodu forma yazıp ilerle), eksikse
   * "Atla" — yarım kod GÖNDERİLMEZ (bkz. goNext), dolayısıyla eksik koddaki
   * basış gerçekten atlamaktır ve `handleSkip`in temizliği/`reset`i doğru
   * davranış.
   */
  const handleCta = () => (complete ? goNext(code) : handleSkip());

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

          {/* RegisterStep2'deki OTP bloğunun aynısı — kutu ölçüsü, yarıçapı,
              zemini ve punto dahil tek bir dil (48×64, 30pt). Farklar yalnız
              davranışsal: 5 hane, alfanümerik tip, büyük harf zorlaması ve
              `textContentType` YOK — davet kodu bir doğrulama kodu değil,
              iOS'un oneTimeCode autofill'i buraya yanlış değer basardı.
              PLACEHOLDER DA YOK: Step2'nin kutuları boşken boş duruyor, örnek
              kod ("AK7M2") girilmiş bir koddan ayırt edilemiyordu. */}
          <OtpInput
            ref={otpRef}
            numberOfDigits={REFERRAL_CODE_LENGTH}
            type="alphanumeric"
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
                width: 48,
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
                // Zemin colors.surface (medya değil) → metin de tema metin
                // rengi; Step2'deki not burada da geçerli.
                color: colors.text,
                fontSize: 30,
                fontWeight: "600",
              },
              focusStickStyle: { backgroundColor: colors.inverseSurface },
            }}
          />

          {/* Sabit yükseklikte: spinner kutuların hemen altında belirip
              kaybolunca altındaki her şey aşağı-yukarı zıplıyordu. */}
          <StatusLine status={status} t={t} />
        </View>
      </TouchableWithoutFeedback>

      {/* Diğer kayıt adımlarıyla aynı yapışma (Step1/5/6/7, Login): klavye
          açılınca buton onun üstüne biniyor. `opened: 15` o adımlardaki
          değerin aynısı — pb-8'in bıraktığı boşluğu klavye açıkken kısıyor. */}
      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        {/* Zemin opak: kap yukarı kaydığında altından OTP kutuları geçiyor. */}
        <View className="px-6 pb-8 pt-4" style={{ backgroundColor: colors.bg }}>
          <AnimatedPressable
            onPress={handleCta}
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
              {complete ? t("auth.referral.continue") : t("auth.referral.skip")}
            </Text>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
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
