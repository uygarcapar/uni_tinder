import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { Navigation, Settings as SettingsIcon } from "@/shared/icons";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, ink } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";

/**
 * Konum izni priming sheet'i: sistem dialogu DOĞRUDAN açılmaz, önce bu sheet
 * gösterilir (büyük konum ikonu + neden istediğimiz + tek buton). iOS izin
 * dialogunu kullanıcı başına BİR kez gösteriyor; kullanıcı bağlamı okumadan
 * reddederse tek çare Ayarlar oluyor. Bu yüzden dialogu ancak kullanıcı
 * butona bastığında tetikliyoruz.
 *
 * İzin verildikten sonra koordinat okuma parent'ın işi (`onGranted`) — sheet
 * o promise boyunca spinner'da kalır. Reddedilirse denied state'ine geçer ve
 * Ayarlar'a yönlendirir; Ayarlar'dan dönüşü AppState 'active' ile yakalayıp
 * izni tekrar kontrol eder (navigation focus event'i uygulamadan çıkışta
 * fire etmediği için bu kontrol AppState'e bağlı).
 *
 * `requestOnOpen` bu priming mantığının BİLİNÇLİ istisnası: sheet ekrandaki
 * "konuma izin ver" butonundan açıldıysa kullanıcı priming'i zaten görmüş ve
 * butona basmış oluyor — aynı metni bir kez daha okutup ikinci bir tıklama
 * istemek yerine sistem dialogunu doğrudan açıyoruz.
 *
 * İKİ YERLEŞİM, TEK İZİN MANTIĞI. Kayıt akışında sheet ARKASINDAKİ ekranın
 * (RegisterStep9) üstüne biniyor: orada kısa, ortalanmış bir blok yeterli
 * (`layout="centered"`). Giriş sonrası kapısında (LocationAccessGate) arkada
 * o ekran YOK — sheet tek başına o ekranın yerine geçiyor, bu yüzden
 * `layout="page"` aynı düzeni birebir taşıyor: sol hizalı başlık + açıklama,
 * ortada daire ikon, altta gizlilik notu ve sticky buton. İzin isteme /
 * reddedilme / Ayarlar'dan dönüş mantığı ikisinde de aynı — çoğaltılmıyor.
 */
type PermState = "idle" | "requesting" | "denied";

interface LocationPermissionSheetProps {
  visible: boolean;
  /**
   * Sheet dismiss oldu. Kapatılamaz kipte VERİLMEZ: kapanış kararının tek
   * sahibi parent'ın `visible`'ı olur (bkz. UpdateGateSheet blokaj kipi).
   */
  onClose?: () => void;
  /** Sheet açılır açılmaz izin isteğini tetikle (sheet'teki butona basılmış gibi). */
  requestOnOpen?: boolean;
  /** İzin alındı — parent koordinatı okur/navigate eder. Promise boyunca spinner döner. */
  onGranted: () => void | Promise<unknown>;
  /**
   * "centered" — kısa sheet, arkasında zaten aynı içeriği taşıyan bir ekran var.
   * "page" — RegisterStep9 düzeninin sheet içindeki karşılığı; sheet tek başına
   * ekranın yerine geçtiğinde kullanılır. Yüksekliği içeriğinden gelir
   * (bkz. aşağıdaki `enableDynamicSizing` notu).
   */
  layout?: "centered" | "page";
  /**
   * Aşağı çekerek / arka plana basarak kapatılabilir mi. `false` iken tutamaç
   * da çizilmiyor: sürüklenemeyen bir sheet'te tutamaç yalan söylüyor.
   */
  dismissible?: boolean;
}

export default function LocationPermissionSheet({
  visible,
  onClose,
  requestOnOpen = false,
  onGranted,
  layout = "centered",
  dismissible = true,
}: LocationPermissionSheetProps) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const [permState, setPermState] = useState<PermState>("idle");
  const mountedRef = useRef(true);
  const autoRequestedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sheet kapanıp tekrar açıldığında eski denied ekranıyla açılmasın.
  useEffect(() => {
    if (!visible) {
      setPermState("idle");
      autoRequestedRef.current = false;
    }
  }, [visible]);

  const runGranted = useCallback(async () => {
    setPermState("requesting");
    try {
      await onGranted();
    } catch (err) {
      // İzin var ama fix alınamadı (kapalı alan / GPS kapalı). denied
      // göstermiyoruz — kullanıcı aynı butonla tekrar deneyebilsin.
      devLog("[locationSheet] onGranted failed:", err);
    } finally {
      if (mountedRef.current) setPermState("idle");
    }
  }, [onGranted]);

  const handleRequest = useCallback(async () => {
    setPermState("requesting");
    let status: Location.PermissionStatus;
    try {
      ({ status } = await Location.requestForegroundPermissionsAsync());
    } catch (err) {
      devLog("[locationSheet] permission request failed:", err);
      if (mountedRef.current) setPermState("denied");
      return;
    }
    if (status !== "granted") {
      if (mountedRef.current) setPermState("denied");
      return;
    }
    await runGranted();
  }, [runGranted]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  // Otomatik istek present animasyonu BİTİNCE tetiklenir (visible=true anında
  // değil): sistem dialogu yarı açılmış sheet'in üstüne düşerse arkada boş bir
  // panel kalıyor. Ref guard'ı gorhom'un onChange'i aynı snap için birden çok
  // kez fire ederse ikinci isteği engelliyor; sheet kapanınca sıfırlanıyor.
  const handlePresented = useCallback(() => {
    if (!requestOnOpen || autoRequestedRef.current) return;
    autoRequestedRef.current = true;
    handleRequest();
  }, [requestOnOpen, handleRequest]);

  // Ayarlar'dan izin verip döndüğünde sheet denied'da takılı kalmasın.
  useEffect(() => {
    if (!visible || permState !== "denied") return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status === "granted" && mountedRef.current) runGranted();
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [visible, permState, runGranted]);

  // Kapatılamaz kipte Android donanım geri tuşunu yut: gorhom modal'ı geri
  // tuşuyla dismiss ediyor ve `enablePanDownToClose={false}` bu yolu
  // kapatmıyor (aynı desen: UpdateGateSheet blokaj kipi).
  useEffect(() => {
    if (!visible || dismissible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [visible, dismissible]);

  const busy = permState === "requesting";
  const denied = permState === "denied";
  const page = layout === "page";

  // Daire ikon — "page" yerleşiminde RegisterStep9 ekranındaki ölçüler (108/44),
  // "centered"da sheet tek başına konuştuğu için bir beden büyük.
  const iconCircle = (
    <View
      style={{
        width: page ? 108 : 132,
        height: page ? 108 : 132,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 4,
        borderColor: colors.text,
      }}
    >
      <SFIcon
        name="location.fill"
        fallback={Navigation}
        size={page ? 44 : 58}
        color={colors.text}
        strokeWidth={1.5}
        weight="semibold"
      />
    </View>
  );

  // AnimatedPressable dış Animated.View'una style geçirmiyor; parent
  // alignItems:"center" olduğunda sarmalayıcı olmadan buton içeriği kadar
  // daralıyor. Full width'i bu wrapper veriyor.
  const primaryButton = (
    <View style={{ width: "100%" }}>
      <AnimatedPressable
        onPress={denied ? handleOpenSettings : handleRequest}
        disabled={busy}
        style={{
          width: "100%",
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.inverseSurface,
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? (
          <View style={{ paddingVertical: 18 }}>
            <ActivityIndicator color={colors.onInverseSurface} />
          </View>
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 20,
              paddingHorizontal: 24,
            }}
          >
            {denied && (
              <SFIcon
                name="gearshape.fill"
                fallback={SettingsIcon}
                size={17}
                color={colors.onInverseSurface}
                strokeWidth={2}
                weight="semibold"
              />
            )}
            <Text
              style={{
                color: colors.onInverseSurface,
                fontSize: 15,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              {denied
                ? t("auth.step9.openSettings")
                : t("auth.step9.allowButton")}
            </Text>
          </View>
        )}
      </AnimatedPressable>
    </View>
  );

  const retryLink = denied ? (
    <TouchableOpacity
      onPress={handleRequest}
      disabled={busy}
      activeOpacity={0.8}
      style={{
        marginTop: 6,
        paddingVertical: 20,
        alignItems: "center",
        alignSelf: "stretch",
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "600" }}>
        {t("auth.step9.retryButton")}
      </Text>
    </TouchableOpacity>
  ) : null;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      onPresented={handlePresented}
      // "page" yerleşiminin yüksekliği İÇERİĞİNDEN geliyor: sabit 92% ile sheet
      // neredeyse tam ekran açılıyordu ve aynı dikey ritmi (başlık → ikon → not
      // → buton) esneterek taşıdığı için kayıttaki sheet'in yanında bambaşka
      // bir yüzey gibi duruyordu. Ölçüm `BottomSheetView`den geliyor (düz `View`
      // yükseklik bildirmez) ve tavan pencere yüksekliğinin 92%'si — büyük
      // yazı tipinde içerik ekranı aşmasın. "centered" sabit detent'te kalıyor:
      // arkasında RegisterStep9 duruyor, orada sheet'in ekranın belirli bir
      // yerine oturması düzenin parçası.
      snapPoints={page ? undefined : ["58%"]}
      enableDynamicSizing={page}
      maxDynamicContentSize={page ? windowHeight * 0.92 : undefined}
      handleIndicatorStyle={{ backgroundColor: ink(0.25) }}
      // Kapatılamaz kipte tutamaç HİÇ çizilmiyor — sürüklenemeyen bir sheet'te
      // tutamaç kullanıcıya olmayan bir çıkış vaat ediyor.
      handleComponent={dismissible ? undefined : null}
      enablePanDownToClose={dismissible}
      enableContentPanningGesture={dismissible}
      enableHandlePanningGesture={dismissible}
      backdrop="blur"
    >
      {page ? (
        <BottomSheetView style={{ paddingTop: dismissible ? 12 : 36 }}>
          <View style={{ paddingHorizontal: 24, gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 36, fontWeight: "700" }}>
              {denied ? t("auth.step9.deniedTitle") : t("auth.step9.title")}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 18,
                fontWeight: "400",
                lineHeight: 25,
              }}
            >
              {denied
                ? t("auth.step9.deniedDescription")
                : t("auth.step9.description")}
            </Text>
          </View>

          <View style={{ alignItems: "center", marginTop: 40 }}>
            {iconCircle}
          </View>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 14,
              fontWeight: "400",
              textAlign: "center",
              lineHeight: 20,
              marginTop: 32,
              paddingHorizontal: 32,
            }}
          >
            {t("auth.step9.privacyNote")}
          </Text>

          {/* Esneyen boşluk YOK: sheet artık içeriği kadar açıldığı için
              `flex: 1` bir şeyi itmez, ölçümü sıfırlar. Butonu nottan ayıran
              payı sabit veriyoruz. */}
          <View
            style={{ paddingHorizontal: 32, paddingTop: 40, paddingBottom: 32 }}
          >
            {primaryButton}
            {retryLink}
          </View>
        </BottomSheetView>
      ) : (
        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
            alignItems: "center",
          }}
        >
          <View style={{ marginBottom: 24 }}>{iconCircle}</View>

          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {denied ? t("auth.step9.deniedTitle") : t("auth.step9.title")}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 15,
              fontWeight: "400",
              textAlign: "center",
              lineHeight: 21,
              paddingHorizontal: 4,
            }}
          >
            {denied
              ? t("auth.step9.deniedDescription")
              : `${t("auth.step9.description")} ${t("auth.step9.privacyNote")}`}
          </Text>

          <View style={{ flex: 1 }} />

          {primaryButton}
          {retryLink}
        </View>
      )}
    </AppBottomSheet>
  );
}
