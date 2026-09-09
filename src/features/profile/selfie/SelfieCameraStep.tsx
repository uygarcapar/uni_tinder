import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, onMediaAt, scrimAt } from "@/shared/theme/colors";
import { forgetPhoto } from "@/shared/utils/photoStore";
import { devLog } from "@/shared/utils/devLog";
import { captureSelfieFrame } from "./captureSelfieFrame";
import type { SelfieFrame } from "./selfieService";
import {
  selfieChallengeHintKey,
  type SelfieChallenge,
} from "./selfieVerification";

/**
 * Kamera adımı — challenge başına TEK kare.
 *
 * 🔴 SÜREKLİ AKIŞ YOK. Kamera önizlemesi elbette akıyor ama SUNUCUYA giden kare
 * sayısı challenge sayısını (2) geçmemeli: video akışını örneklemek gerçek bir
 * liveness ürününden ~3× pahalıya geliyor. Kullanıcı "Gönder"e basar, tek kare
 * çekilir.
 *
 * 🔴 `mirror={false}`: önizleme AYNALANMIYOR. Ön kameranın aynalı önizlemesi
 * standart ama burada zararlı — kullanıcı "sağa çevir" deyip aynadaki kendini
 * takip ederse dosyada ters yöne dönmüş görünür. Aynalamayı kapatınca önizleme
 * ile dosya aynı yönde oluyor ve talimat ikisinde de aynı şeye karşılık geliyor.
 * Dosyaya ayrıca hiçbir flip uygulanmıyor (bkz. captureSelfieFrame).
 */

const OVAL_WIDTH_RATIO = 0.68;
const OVAL_ASPECT = 0.76; // genişlik / yükseklik
/** Ovalin ekran yüksekliğinden alabileceği en fazla pay (dar/kısa ekran freni). */
const OVAL_MAX_HEIGHT_RATIO = 0.46;
/** Başlık perdesinin metin kutusunun ALTINA taşma payı — erime kuyruğu. */
const HEADER_OVERHANG = 48;

export default function SelfieCameraStep({
  challenges,
  submitting,
  onFrames,
  onCancel,
}: {
  challenges: SelfieChallenge[];
  submitting: boolean;
  onFrames: (frames: SelfieFrame[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission, getPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const framesRef = useRef<SelfieFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kullanıcı Ayarlar'dan izin verip döndüğünde ekran kendiliğinden açılsın —
  // LocationPermissionSheet'teki desenin aynısı. Yoksa sayfa "izin yok"ta
  // takılı kalıyor ve kullanıcı akışı yeniden başlatmak zorunda kalıyor.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") getPermission().catch(() => {});
    });
    return () => sub.remove();
  }, [getPermission]);

  // Adım yarıda bırakılırsa çekilen kareler diskte asılı kalmasın.
  useEffect(
    () => () => {
      framesRef.current.forEach((frame) => forgetPhoto(frame.uri));
      framesRef.current = [];
    },
    [],
  );

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy || submitting) return;

    setBusy(true);
    setError(null);
    try {
      const frame = await captureSelfieFrame(camera, index);
      framesRef.current = [...framesRef.current, frame];

      if (framesRef.current.length >= challenges.length) {
        // Kareler challenge SIRASIYLA gidiyor — dizi zaten sırayla dolduruldu.
        const frames = framesRef.current;
        // Üst katman artık sahibi: unmount temizliği bunları silmemeli.
        framesRef.current = [];
        onFrames(frames);
        return;
      }
      setIndex((i) => i + 1);
    } catch (e) {
      devLog("🪪 [selfie] kare çekilemedi", e);
      setError(t("profile.selfie.camera.captureError"));
    } finally {
      setBusy(false);
    }
  }, [busy, submitting, index, challenges.length, onFrames, t]);

  if (!permission) {
    return (
      <Centered>
        <ActivityIndicator color={colors.text} />
      </Centered>
    );
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <Centered>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {t("profile.permissions.title")}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
          }}
        >
          {t("profile.selfie.camera.permissionMessage")}
        </Text>
        <AnimatedPressable
          onPress={() =>
            canAsk ? requestPermission() : Linking.openSettings().catch(() => {})
          }
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
            paddingHorizontal: 32,
          }}
        >
          <Text
            style={{
              paddingVertical: 16,
              fontSize: 15,
              fontWeight: "700",
              color: colors.onInverseSurface,
            }}
          >
            {canAsk
              ? t("profile.selfie.camera.grantPermission")
              : t("profile.permissions.openSettings")}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={onCancel} pressScale={1}>
          <Text style={{ padding: 8, fontSize: 14, color: colors.textSecondary }}>
            {t("common.cancel")}
          </Text>
        </AnimatedPressable>
      </Centered>
    );
  }

  const challenge = challenges[index];
  // Bilinmeyen hareket kodunda null → ikinci satır hiç çizilmez.
  const challengeHintKey = selfieChallengeHintKey(challenge?.code);
  // Oval önce genişlikten türüyor, sonra kısa ekranlarda yükseklikten
  // frenleniyor — yoksa küçük telefonlarda başlığın altına giriyor.
  const ovalHeight = Math.min(
    (width * OVAL_WIDTH_RATIO) / OVAL_ASPECT,
    height * OVAL_MAX_HEIGHT_RATIO,
  );
  const ovalWidth = ovalHeight * OVAL_ASPECT;
  const disabled = busy || submitting;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Kamera EN ALTTA ve absolute: üstteki katman normal akışta duruyor,
          böylece oval "kalan boşluğun" ortasına oturuyor. Ovali ekranın
          ortasına çivilemek yanlıştı — başlık üstte yer kapladığı için kılavuz
          yüzün çenesine doğru kayıyordu. */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        // 🔴 Bkz. dosya başı: aynalama KAPALI, önizleme ile dosya aynı yönde.
        mirror={false}
        mode="picture"
        animateShutter={false}
      />

      <View style={{ flex: 1 }} pointerEvents="box-none">
        <SelfieCameraHeader insetTop={insets.top}>
          {/* Adım göstergesi NOKTA: "1 / 2" yazısı başlığın en tepesinde ikinci
              bir metin satırı gibi duruyordu. Nokta hem yer kaplamıyor hem de
              talimatla yarışmıyor. Sayı yalnız ekran okuyucuya gidiyor. */}
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t("profile.selfie.camera.stepCounter", {
              index: index + 1,
              total: challenges.length,
            })}
            style={{
              flexDirection: "row",
              alignSelf: "center",
              alignItems: "center",
              gap: 6,
              paddingBottom: 2,
            }}
          >
            {challenges.map((item, i) => (
              <View
                key={item.code ?? i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor:
                    i === index ? colors.onMedia : onMediaAt(i < index ? 0.5 : 0.28),
                }}
              />
            ))}
          </View>

          {/* Talimat SUNUCUDAN geldiği gibi — kendi metin tablomuz YOK, hangi
              hareketin isteneceğine sunucu karar veriyor. */}
          <Text
            style={{
              color: colors.onMedia,
              fontSize: 22,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            {challenge?.instruction ?? ""}
          </Text>
          {/* İki ipucu da gerekli, ama TEK PARAGRAF:
              • genel ipucu → no_face / multiple_faces (her karede geçerli)
              • harekete özel ipucu → challenge_too_weak / challenge_too_much,
                kalibrasyonda ölçülen EN SIK iki başarısızlık. Metin hareket
                tipine göre değişiyor çünkü backend mimik ve poz hareketlerini
                farklı değerlendiriyor (bkz. selfieChallengeHintKey).
              Ayrı iki satır (ve iki farklı opaklık) başlığı üç metin bloğuna
              çıkarıp kadrajın yarısını yiyordu; birleşince aynı bilgi iki
              satırda duruyor. */}
          <Text
            style={{
              color: onMediaAt(0.72),
              fontSize: 13,
              lineHeight: 18,
              textAlign: "center",
            }}
          >
            {t("profile.selfie.camera.hint")}
            {challengeHintKey ? ` ${t(challengeHintKey)}` : ""}
          </Text>
        </SelfieCameraHeader>

        {/* Yüz kılavuzu — çerçeveyi doldurması gerektiğini gösteriyor. Kesme
            (mask) YOK: hem pahalı hem gereksiz, kenarlık yeterince okunuyor. */}
        <View
          pointerEvents="none"
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <View
            style={{
              width: ovalWidth,
              height: ovalHeight,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: onMediaAt(0.85),
            }}
          />
        </View>

        {/* Alt blokta ZEMİN YOK: butonun kendisi dolu beyaz, altındaki tek
            satır da onun hizasında — burada bir perde daha çekmek kamerayı
            iki taraftan kapatıp kadrajı daraltıyordu. */}
        <View
          style={{
            paddingHorizontal: 28,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            gap: 8,
          }}
        >
          {error && (
            <Text
              style={{ color: colors.errorLight, fontSize: 13, textAlign: "center" }}
            >
              {error}
            </Text>
          )}

          <AnimatedPressable
            onPress={handleCapture}
            disabled={disabled}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: disabled ? onMediaAt(0.35) : colors.onMedia,
            }}
          >
            {disabled ? (
              <ActivityIndicator
                style={{ paddingVertical: 17.5 }}
                color={colors.onMediaInverse}
              />
            ) : (
              <Text
                style={{
                  paddingVertical: 20,
                  textAlign: "center",
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.onMediaInverse,
                }}
              >
                {t("profile.selfie.camera.submit")}
              </Text>
            )}
          </AnimatedPressable>

          <AnimatedPressable onPress={onCancel} disabled={submitting} pressScale={1}>
            <Text
              style={{
                paddingVertical: 8,
                textAlign: "center",
                fontSize: 14,
                fontWeight: "600",
                color: onMediaAt(0.85),
              }}
            >
              {t("common.cancel")}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Başlık perdesi — RegisterStickyHeader'ın FOTO ÜSTÜ hali: aşağı doğru eriyen
 * progressive blur. Fark tek: buradaki zemin tema değil KAMERA, o yüzden renk
 * katmanı `veil()` değil `scrimAt()` (sabit siyah) ve blur tint'i açık modda da
 * KOYU kalıyor — LikesScreen'in foto üstü alt perdesiyle aynı gerekçe.
 *
 * Düz zeminli bir bant (eski hali) ekranı yatay bir çizgiyle ikiye bölüyordu;
 * maskeli perde talimatı taşırken kadrajın nerede bittiğini belli etmiyor.
 * Maskedeki rgba(0,0,0,a) değerleri RENK DEĞİL alfa matematiği — onlara dokunma.
 *
 * Android'de expo-blur'un blurMethod varsayılanı 'none': orada yalnız eriyen
 * gradyan kalıyor, okunabilirlik zaten ondan geliyor.
 */
function SelfieCameraHeader({
  insetTop,
  children,
}: {
  insetTop: number;
  children: React.ReactNode;
}) {
  const { colors: maskColors, locations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  return (
    <View
      pointerEvents="none"
      style={{
        paddingTop: insetTop + 10,
        paddingHorizontal: 28,
        paddingBottom: 16,
        gap: 6,
      }}
    >
      {/* Perde kutunun ALTINA taşıyor (bottom: -overhang) ki erime kuyruğu
          metnin bittiği yerde değil, biraz aşağıda tamamlansın. İlk çocuk
          olduğu için metinlerin ALTINA çiziliyor. */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: -HEADER_OVERHANG,
        }}
      >
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              locations={locations as any}
              colors={maskColors as any}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <LinearGradient
            colors={[scrimAt(0.6), scrimAt(0.2)]}
            style={StyleSheet.absoluteFill}
          />
          {Platform.OS === "ios" && (
            <BlurView
              intensity={18}
              tint="systemChromeMaterialDark"
              style={StyleSheet.absoluteFill}
            />
          )}
        </MaskedView>
      </View>

      {children}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        gap: 16,
      }}
    >
      {children}
    </View>
  );
}
