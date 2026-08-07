import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { Navigation, Settings as SettingsIcon } from "lucide-react-native";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors } from "@/shared/theme/colors";
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
 */
type PermState = "idle" | "requesting" | "denied";

interface LocationPermissionSheetProps {
  visible: boolean;
  onClose: () => void;
  /** İzin alındı — parent koordinatı okur/navigate eder. Promise boyunca spinner döner. */
  onGranted: () => void | Promise<unknown>;
}

export default function LocationPermissionSheet({
  visible,
  onClose,
  onGranted,
}: LocationPermissionSheetProps) {
  const { t } = useTranslation();
  const [permState, setPermState] = useState<PermState>("idle");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sheet kapanıp tekrar açıldığında eski denied ekranıyla açılmasın.
  useEffect(() => {
    if (!visible) setPermState("idle");
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

  const busy = permState === "requesting";
  const denied = permState === "denied";

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["58%"]}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.25)" }}
      backdrop="blur"
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 32,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 132,
            height: 132,
            borderRadius: 66,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 4,
            borderColor: colors.text,
            marginBottom: 24,
          }}
        >
          <SFIcon
            name="location.fill"
            fallback={Navigation}
            size={58}
            color={colors.text}
            strokeWidth={1.5}
            weight="semibold"
          />
        </View>

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

        {/* AnimatedPressable dış Animated.View'una style geçirmiyor; parent
            alignItems:"center" olduğu için sarmalayıcı olmadan buton içeriği
            kadar daralıyordu. Full width'i bu wrapper veriyor. */}
        <View style={{ width: "100%" }}>
          <AnimatedPressable
            onPress={denied ? handleOpenSettings : handleRequest}
            disabled={busy}
            style={{
              width: "100%",
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.text,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? (
              <View style={{ paddingVertical: 18 }}>
                <ActivityIndicator color="#000000" />
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
                    color="#000000"
                    strokeWidth={2}
                    weight="semibold"
                  />
                )}
                <Text
                  style={{
                    color: "#000000",
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

        {denied && (
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
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {t("auth.step9.retryButton")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </AppBottomSheet>
  );
}
