import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { Navigation } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import LocationPermissionSheet from "@/features/auth/components/LocationPermissionSheet";
import { readCurrentPosition } from "@/features/profile/locationHeartbeat";
import { colors } from "../../../shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";
import { useTranslation } from "react-i18next";

/**
 * Şehir/ilçe artık kullanıcı seçimi DEĞİL — backend `Latitude`/`Longitude`'dan
 * kendisi türetiyor ve CompleteProfile/register-and-complete şeması City/District
 * kabul etmiyor. Bu yüzden eski şehir+ilçe dropdown'ları kaldırıldı, yerine
 * ZORUNLU konum izni adımı geldi: koordinat alınmadan bir sonraki adıma
 * geçilmiyor ve manuel şehir seçimi fallback'i bilinçli olarak YOK (backend'de
 * karşılığı bulunmuyor).
 *
 * İzin isteği ekrandan DEĞİL, ekran odaklanınca otomatik açılan bottom sheet'ten
 * yürütülüyor (LocationPermissionSheet). Sheet swipe ile kapatılırsa ekrandaki
 * sticky buton geri açar — ama o yol `requestOnOpen` ile açar: kullanıcı aynı
 * metni ikinci kez okuyup ikinci kez butona basmasın, sheet açılır açılmaz izin
 * isteği kendiliğinden gitsin. Odakla açılan İLK sheet'te bu bayrak kapalı
 * (priming önce okunsun).
 *
 * ── İZİN ZATEN VARSA ADIM KENDİ GEÇİYOR ────────────────────────────────────
 *
 * İlk odakta önce `getForegroundPermissionsAsync` soruluyor: izin verilmişse
 * sheet HİÇ AÇILMIYOR, koordinat okunup Step12'ye geçiliyor. Priming'in tek
 * işi sistem dialogunu bağlamıyla göstermek; izin duruyorken o dialog zaten
 * çıkmayacağı için sheet kullanıcıya "izin ver"e bastırdığı tek bir ekstra
 * tıklamadan başka bir şey yapmıyordu.
 *
 * ⚠️ YALNIZ İLK ODAKTA (`autoAdvancedRef`). Step12'nin geri butonu buraya
 * dönüyor; her odakta geçersek o buton ölürdü — kullanıcı Step8'e inemezdi.
 * Dönüş turunda eski davranış aynen duruyor (sheet açılır).
 *
 * İzin var ama fix YOKSA (kapalı alan / GPS kapalı) otomatik geçiş sessizce
 * priming sheet'ine düşüyor: butonu olan bir yüzey gerekiyor, kullanıcı
 * tekrar deneyebilsin.
 */
export default function RegisterStep9Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep9'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [autoRequest, setAutoRequest] = useState(false);
  // Otomatik geçiş denemesi sürüyor mu? Sticky buton o sırada spinner'a
  // dönüyor: `getCurrentPositionAsync` saniyeler sürebiliyor ve o boşlukta
  // "izin ver" butonu duruyorsa kullanıcı basıp aynı okumayı ikinci kez
  // başlatıyor.
  const [autoChecking, setAutoChecking] = useState(false);
  // Otomatik geçiş bu mount'ta DENENDİ mi? Dönüş turunda tekrar denenmemeli
  // (bkz. dosya başı — Step12'nin geri butonu).
  const autoAdvancedRef = useRef(false);

  // Sticky buton: sheet'i geri açar VE sheet'teki butona basılmış gibi izin
  // isteğini tetikler. İki state aynı render'da batch'lendiği için sheet
  // visible=true'ya geçtiğinde requestOnOpen zaten true.
  const reopenSheetAndRequest = useCallback(() => {
    setAutoRequest(true);
    setSheetVisible(true);
  }, []);

  // Sheet izni aldıktan sonra çağırır. Hata fırlatırsa sheet spinner'dan çıkıp
  // idle'a döner (kullanıcı tekrar deneyebilir) — denied ekranı gösterilmez.
  const captureAndContinue = useCallback(async () => {
    try {
      const position = await readCurrentPosition();
      dispatch(
        updateMultipleFields({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      );
      setSheetVisible(false);
      navigation.navigate("RegisterStep12");
    } catch (err) {
      // İzin var ama fix alınamadı (kapalı alan / GPS kapalı).
      devLog("[step9] position read failed:", err);
      throw err;
    }
  }, [dispatch, navigation]);

  /**
   * Odakta: izin varsa geç, yoksa priming sheet'ini aç. Blur'da sheet
   * kendiliğinden kapanır (Step12'ye geçişte de bu yol çalışıyor).
   *
   * `cancelled`: izin sorusu/koordinat okuması uçarken kullanıcı geri
   * gidebiliyor. Bayrak olmadan ekran blur olduktan SONRA navigate ya da
   * sheet açılması mümkün — ikisi de kullanıcıyı bıraktığı yerden koparırdı.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const openPriming = () => {
        setAutoRequest(false);
        setSheetVisible(true);
      };

      if (autoAdvancedRef.current) {
        openPriming();
        return () => setSheetVisible(false);
      }
      autoAdvancedRef.current = true;
      setAutoChecking(true);

      (async () => {
        let granted = false;
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          granted = status === "granted";
        } catch (err) {
          // İzin DURUMU okunamadı — izin yok saymak doğru taraf: priming
          // sheet'i zaten kullanıcıya soracak.
          devLog("[step9] permission check failed:", err);
        }
        if (cancelled) return;

        let advanced = false;
        if (granted) {
          try {
            await captureAndContinue();
            advanced = true;
          } catch {
            // Fix alınamadı; gerekçe captureAndContinue'da loglandı.
          }
        }

        // ⚠️ Spinner `cancelled`a BAKMADAN kapanıyor: başarılı geçişte blur
        // cleanup'ı bayrağı zaten çevirmiş oluyor, orada erken dönülürse ekran
        // (yığında mount kalıyor) sonsuza kadar spinner'lı butonla duruyordu.
        setAutoChecking(false);
        if (advanced || cancelled) return;
        openPriming();
      })();

      return () => {
        cancelled = true;
        setSheetVisible(false);
      };
    }, [captureAndContinue]),
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <RegisterProgressBar step={9} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>{t('auth.step9.title')}</Text>
          <Text className="text-[18px] font-normal mb-8" style={{ color: colors.textSecondary }}>
            {t('auth.step9.description')}
          </Text>
        </View>

        <View className="items-center justify-center mt-4">
          <View
            style={{
              width: 108,
              height: 108,
              borderRadius: 54,
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 4,
              borderColor: colors.text,
            }}
          >
            <SFIcon name="location.fill" fallback={Navigation} size={44} color={colors.text} strokeWidth={1.5} weight="semibold" />
          </View>
        </View>

        <Text className="text-[14px] font-normal text-center mt-8 px-2" style={{ color: colors.textMuted }}>
          {t('auth.step9.privacyNote')}
        </Text>
      </View>

      {/* Sticky Button — sheet swipe ile kapatıldıysa geri açar ve izni ister.
          Otomatik geçiş denenirken spinner: o sırada basılırsa aynı koordinat
          okuması ikinci kez başlıyor (sheet'in kendi busy mantığıyla aynı
          gerekçe, bkz. LocationPermissionSheet). */}
      <View className="px-8 pb-8 pt-4">
        <AnimatedPressable
          onPress={reopenSheetAndRequest}
          disabled={autoChecking}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
            opacity: autoChecking ? 0.5 : 1,
          }}
        >
          {autoChecking ? (
            <View style={{ paddingVertical: 18 }}>
              <ActivityIndicator color={colors.onInverseSurface} />
            </View>
          ) : (
            <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
              {t('auth.step9.allowButton')}
            </Text>
          )}
        </AnimatedPressable>
      </View>

      <LocationPermissionSheet
        visible={sheetVisible}
        requestOnOpen={autoRequest}
        onClose={() => setSheetVisible(false)}
        onGranted={captureAndContinue}
      />
    </View>
  );
}
