import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, type CameraType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { setStatusBarStyle } from "expo-status-bar";
import { useTranslation } from "react-i18next";

import AnimatedPressable from "@/shared/components/AnimatedPressable";
import MediaChromeIconButton from "@/shared/components/MediaChromeIconButton";
import type { SFSymbol } from "@/shared/components/SFIcon";
import { RefreshCw, X, Zap } from "@/shared/icons";
import { colors, isLight, onMediaAt } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";
import { frameWindow } from "@/shared/components/cropper/cropGeometry";
import { bindCamera, type CameraOutcome } from "./cameraBridge";

/**
 * Uygulama içi kamera ekranı — profil fotoğrafını UYGULAMADAN çekmek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR: SİSTEM KAMERASI İKİNCİ BİR ONAY EKRANI GETİRİYORDU.
 * ══════════════════════════════════════════════════════════════════════════
 * Eski yol `ImagePicker.launchCameraAsync` idi, yani UIImagePickerController:
 * deklanşörden sonra kendi "Tekrar Çek / Fotoğrafı Kullan" ekranını açıyor.
 * Kullanıcı orada onaylıyor, hemen ardından BİZİM kırpma ekranı açılıyor ve
 * orada bir daha onaylıyordu — tek bir fotoğraf için iki onay. Üstelik o
 * ekranın kadrajı 3:4 pencereyle ilgisizdi; "kullan" dediği kare ile kırpıcıda
 * gördüğü kare aynı şey değildi.
 *
 * Buradaki akış: deklanşör → KARE DOĞRUDAN KIRPICIYA. Tek onay, kırpıcının
 * "Kaydet"i; kırpıcıdaki ✕ ise buraya GERİ döner (yeniden çek, bkz.
 * photoPicker.captureAndCropPhoto).
 *
 * ÖNİZLEME KIRPICININ PENCERESİNDE: kadraj `frameWindow` ile kırpma ekranıyla
 * birebir aynı 3:4 kutu. Telefon kamerası portrede zaten 3:4 (4032×3024)
 * üretiyor, yani bu kutuda görünen şey çekilen karenin TAMAMI — çekimden
 * kırpmaya geçişte kadraj kıpırdamıyor ve kırpıcı "hiçbir şey atmadan"
 * başlıyor.
 *
 * ⚠️ AYNALAMA SELFIE EKRANININ TERSİ: `mirror={facing === "front"}`. Ön
 * kamerada canlı görüntü sistem tarafından aynalı (kullanıcı kendini aynadaki
 * gibi görüyor); dosya ham kalırsa profil fotoğrafı, çekerken gördüğü şeyin
 * TERSİ oluyor. Burada ürün kararı "gördüğünü kaydet" olduğu için dosya da
 * aynalanıyor. Selfie DOĞRULAMASI (SelfieCameraStep) bunun tam tersini yapıyor
 * — orada kare AWS'ye gidiyor ve ham gitmek zorunda; iki ekranı karıştırma.
 *
 * NEREYE MOUNT EDİLİR: CropperOverlay'in yanı, `BottomSheetModalProvider`'ın
 * DIŞI (bkz. App.tsx). Aynı gerekçe: portal host'u children'dan sonra render
 * ediliyor, içeride kalsa profil düzenleme modalının ALTINDA açılırdı.
 *
 * Boştayken `null` döner: aktif değilken ağaçta hiçbir düğüm yok, yani kamera
 * donanımı da tutulmuyor.
 */

const ASPECT_W = 3;
const ASPECT_H = 4;

/** Deklanşör çapı — iOS kamerasının dolu beyaz düğmesiyle aynı ölçek. */
const SHUTTER = 72;
const SHUTTER_RING = 3;

/** JPEG kalitesi: kırpıcı çıktıyı 900×1200'e indirip 0.85 ile yeniden
 *  kodluyor, buradaki tek iş ara dosyada nesil kaybı bırakmamak. */
const QUALITY = 0.9;

type Session = { settle: (outcome: CameraOutcome) => void };

/**
 * Flaş sırası: kapalı → otomatik → açık.
 *
 * expo-camera'nın `FlashMode`'u bir de `screen` taşıyor (ekranı flaş olarak
 * kullanan Retina Flash yolu) — BURAYA ALINMADI: ön kamera düğmesi gizli,
 * arka kamerada ise gerçek flaş varken ekranı yakmanın anlamı yok.
 */
type FlashChoice = "off" | "auto" | "on";
const FLASH_ORDER: FlashChoice[] = ["off", "auto", "on"];

const FLASH_SYMBOL: Record<FlashChoice, SFSymbol> = {
  off: "bolt.slash.fill",
  auto: "bolt.badge.automatic.fill",
  on: "bolt.fill",
};

export default function CameraCaptureOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const cameraRef = useRef<CameraView>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashChoice>("off");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sonuçlandırma state updater'ının İÇİNDE yapılamaz (bkz. CropperOverlay):
  // React updater'ı iki kez çağırabiliyor ve promise iki kez çözülürdü.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const finish = useCallback((outcome: CameraOutcome) => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setBusy(false);
    setReady(false);
    current?.settle(outcome);
  }, []);

  const present = useCallback((settle: (outcome: CameraOutcome) => void) => {
    // Her oturum TEMİZ başlıyor: önceki çekimin flaşı/ön kamerası kalıcı bir
    // tercih değil, o anın kararı.
    setFacing("back");
    setFlash("off");
    setReady(false);
    setBusy(false);
    setSession({ settle });
  }, []);

  useEffect(() => {
    bindCamera(present);
    return () => bindCamera(null);
  }, [present]);

  const open = session !== null;

  useEffect(() => {
    if (!open) return;
    setStatusBarStyle("light", true);
    return () => setStatusBarStyle(isLight() ? "dark" : "light", true);
  }, [open]);

  /**
   * Arka plana düşerken oturumu KAPATIYORUZ.
   *
   * Kamera donanımı arka planda zaten askıya alınıyor; dönüşte önizleme ölü bir
   * kare olarak kalabiliyor ve `takePictureAsync` o kareyi çekiyordu. Oturumu
   * iptal etmek, çağıranı (photoPicker) sessizce null'a düşürüyor — kullanıcı
   * geri döndüğünde kamera kapalı, kendi isteğiyle yeniden açıyor.
   */
  useEffect(() => {
    if (!open) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") finish({ status: "cancelled" });
    });
    return () => sub.remove();
  }, [open, finish]);

  const layout = useMemo(() => {
    const headerH = insets.top + 56;
    // 16 (üst pad) + deklanşör + 16 (alt pad).
    const footerH = insets.bottom + 32 + SHUTTER;
    const { winW, winH } = frameWindow({
      screenW,
      screenH,
      headerH,
      footerH,
      aspectW: ASPECT_W,
      aspectH: ASPECT_H,
    });
    return {
      headerH,
      winW,
      winH,
      // Pencere ekranın tam ortasında — kırpıcıdaki winCX/winCY ile aynı.
      left: (screenW - winW) / 2,
      top: (screenH - winH) / 2,
    };
  }, [insets.top, insets.bottom, screenW, screenH]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || !ready || busy || !sessionRef.current) return;

    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const shot = await camera.takePictureAsync({
        quality: QUALITY,
        // Base64/EXIF gerekmiyor — ikisi de yalnızca bellek ve süre.
        base64: false,
        exif: false,
        // `skipProcessing` KULLANILMIYOR: Android'de kareyi ham sensör
        // oryantasyonunda bırakıyor (EXIF'e uyulmuyor) ve fotoğraf yatık
        // kaydediliyordu (bkz. captureSelfieFrame'deki aynı not).
      });
      if (!shot?.uri) throw new Error("empty picture");
      finish({
        status: "captured",
        shot: { uri: shot.uri, width: shot.width ?? 0, height: shot.height ?? 0 },
      });
    } catch (error) {
      devLog("📸 [camera] kare çekilemedi", error);
      finish({ status: "failed", error });
    }
  }, [ready, busy, finish]);

  if (!session) return null;

  const disabled = !ready || busy;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
      {/* Önizleme PENCERENİN İÇİNDE, tam ekran değil: kutu 3:4 ve kamera da
          3:4 ürettiği için burada görünen şey çekilecek karenin tamamı.
          Tam ekran bir önizleme, telefon ekranı 3:4'ten çok daha uzun olduğu
          için kareyi iki yandan kırpıp gösterirdi — kullanıcı kadrajın
          dışında kalan şeyi göremezdi. */}
      <View
        style={{
          position: "absolute",
          left: layout.left,
          top: layout.top,
          width: layout.winW,
          height: layout.winH,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="picture"
          // 🔴 Bkz. dosya başı: ön kamerada DOSYA da aynalanıyor (selfie
          // doğrulamasının tersi) — profil fotoğrafı, çekerken görülen kare.
          mirror={facing === "front"}
          // Sistemin beyaz deklanşör animasyonu kapalı: kendi kırpma ekranımıza
          // geçiş zaten bir sahne değişimi, iki efekt üst üste biniyordu.
          animateShutter={false}
          onCameraReady={() => setReady(true)}
        />
      </View>

      <CornerTicks
        left={layout.left}
        top={layout.top}
        width={layout.winW}
        height={layout.winH}
      />

      {/* ------------------------------------------------------------ başlık */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: layout.headerH,
          paddingTop: insets.top,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <MediaChromeIconButton
          systemImage="xmark"
          fallbackIcon={X}
          label={t("common.cancel")}
          onPress={() => finish({ status: "cancelled" })}
          disabled={busy}
        />

        {/* Kırpma ekranının düzeniyle aynı: solda vazgeçme yolu, sağda kareyi
            değiştiren eylemler. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Flaş ön kamerada GİZLİ: donanım flaşı yok, `on` orada sessizce
              hiçbir şey yapmıyor ve "çalışmayan buton" olarak okunuyor. */}
          {facing === "back" && (
            <MediaChromeIconButton
              systemImage={FLASH_SYMBOL[flash]}
              fallbackIcon={Zap}
              label={t(`common.camera.flash.${flash}`)}
              onPress={() =>
                setFlash(
                  (current) =>
                    FLASH_ORDER[
                      (FLASH_ORDER.indexOf(current) + 1) % FLASH_ORDER.length
                    ],
                )
              }
              disabled={busy}
              active={flash !== "off"}
            />
          )}

          <MediaChromeIconButton
            systemImage="arrow.triangle.2.circlepath.camera"
            fallbackIcon={RefreshCw}
            label={t("common.camera.flip")}
            onPress={() => {
              // Çevirince önizleme yeniden kurulduğu için hazır bayrağı da
              // sıfırlanıyor; yoksa deklanşör henüz bağlanmamış oturuma basardı.
              setReady(false);
              setFacing((current) => (current === "back" ? "front" : "back"));
            }}
            disabled={busy}
          />
        </View>
      </View>

      {/* ------------------------------------------------------------- alt bar
          TEK EYLEM, ORTADA: deklanşör. Kırpıcının alt barı sağa hizalı ama
          orada eylem bir onay; burada parmağın gittiği yer ekranın ortası
          (sistem kamerasının da deklanşörü orada). */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          alignItems: "center",
        }}
      >
        <AnimatedPressable
          onPress={handleCapture}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t("common.camera.capture")}
          pressScale={0.92}
          style={{
            width: SHUTTER,
            height: SHUTTER,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            // Cam YOK: deklanşör, kamera arayüzünün öğrenilmiş dolu beyaz
            // düğmesi. Donuk hâl OPAKLIKLA DEĞİL dolgu alfasıyla veriliyor
            // (ata zincirindeki opacity, chrome'daki cam butonları düşürüyor).
            backgroundColor: disabled ? onMediaAt(0.4) : colors.onMedia,
            borderWidth: SHUTTER_RING,
            borderColor: onMediaAt(disabled ? 0.25 : 0.55),
          }}
        >
          {busy ? <ActivityIndicator size="small" color={colors.onMediaInverse} /> : null}
        </AnimatedPressable>
      </View>
    </View>
  );
}

/**
 * Kadrajın dört köşesindeki L tırnaklar — kırpma ekranındakilerin aynısı.
 *
 * Kutunun KENARLIĞI yerine tırnak: tam çerçeve, önizlemenin kenarına
 * oturduğunda fotoğrafın içindeymiş gibi okunuyordu.
 */
function CornerTicks({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const LEN = 22;
  const THICK = 2;
  const tick = onMediaAt(0.95);
  const corners = [
    { x: left, y: top, hx: 0, hy: 0, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top, hx: 0, hy: 0, vx: LEN - THICK, vy: 0 },
    { x: left, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: 0, vy: 0 },
    {
      x: left + width - LEN,
      y: top + height - LEN,
      hx: 0,
      hy: LEN - THICK,
      vx: LEN - THICK,
      vy: 0,
    },
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {corners.map((c, i) => (
        <View
          key={i}
          style={{ position: "absolute", left: c.x, top: c.y, width: LEN, height: LEN }}
        >
          <View
            style={{
              position: "absolute",
              left: c.hx,
              top: c.hy,
              width: LEN,
              height: THICK,
              backgroundColor: tick,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: c.vx,
              top: c.vy,
              width: THICK,
              height: LEN,
              backgroundColor: tick,
            }}
          />
        </View>
      ))}
    </View>
  );
}
