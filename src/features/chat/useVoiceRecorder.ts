import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import { useSharedValue, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import {
  VOICE_MAX_MS,
  VOICE_TICK_MAX_MS,
  VOICE_TICK_MS,
  encodeWaveformPeaks,
  meteringToLevel,
} from "@/features/chat/voiceMessage";
import { devLog } from "@/shared/utils/devLog";

export type VoiceTake = {
  uri: string;
  durationMs: number;
  waveformPeaks?: string;
};

export type VoiceStartResult = "started" | "denied" | "aborted" | "error";

/**
 * Kilitli kayıt panelindeki CANLI dalga formunun çubuk TAMPONU. Değerler shared
 * value'da tutuluyor (React state DEĞİL): saniyede 20 kez render etmek yerine
 * UI thread'inde güncelleniyor — kayıt sırasında JS thread'i boşta kalsın.
 *
 * Bu bir ÇİZİM sayısı değil, tampon boyu: LiveWaveform ölçtüğü genişliğe kaç
 * çubuk sığıyorsa tamponun O KADAR SON örneğini çiziyor. Sayı, en geniş
 * telefonda şeridin süre sayacına kadar dayanmasına yetecek kadar bol seçildi
 * (44'te şerit dar kalıyor, solda ölü boşluk bırakıyordu).
 */
export const WAVE_BARS = 64;
/**
 * "Bu slota henüz örnek gelmedi" işareti. Tampon 0 ile doldurulsaydı boş slot
 * ile GERÇEK sessizlik ayırt edilemez, kayıt başlar başlamaz şerit boyunca duran
 * bir placeholder dalga çizilirdi. Negatif değer örnek aralığının (0..1) dışında
 * olduğu için çizim tarafı onu güvenle "boş" sayabiliyor (bkz. WaveBar).
 */
export const WAVE_EMPTY = -1;

/**
 * Gönderilmeyecek kaydı diskten siler (çok kısa basış / iptal). Kayıtlar cache
 * dizininde duruyor, yani OS er geç temizler — ama basılı tutmayı deneyen bir
 * kullanıcı dakikada onlarca dosya bırakabiliyor.
 */
export function discardVoiceTake(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (err) {
    devLog("🎙️ [voice] kayıt silinemedi", err);
  }
}

/**
 * Mono, 48 kbps AAC → 60 saniye ≈ 360 KB, sunucunun 5 MB tavanının çok altında.
 * `isMeteringEnabled` dalga formu için ŞART: seviyeler yalnız status'tan okunuyor.
 */
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
};

/**
 * Basılı-tut kaydı — mikrofon butonunun motoru.
 *
 * İki ayrı "açık mı" bayrağı var ve karıştırılmamalı:
 *  - `holdRef`  : parmak hâlâ ekranda mı. İzin diyaloğu + prepare async olduğu
 *                 için kullanıcı native kayıt başlamadan ÖNCE parmağını
 *                 kaldırabiliyor; o durumda kaydı hiç başlatmadan iptal ederiz.
 *  - `activeRef`: native kayıt gerçekten başladı mı. stop() yalnız bunu görür,
 *                 yoksa hiç başlamamış bir kaydı durdurmaya çalışıp patlardık.
 *
 * Süre state'i SANİYE değişince güncellenir (10/sn render yerine 1/sn); anlık
 * seviye ise shared value ile UI thread'inde kalır, hiç render tetiklemez.
 */
export function useVoiceRecorder({
  onLimitReached,
}: { onLimitReached?: () => void } = {}): {
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  level: SharedValue<number>;
  waveform: SharedValue<number[]>;
  /** Örnekler arasındaki ÖLÇÜLEN periyot — dalganın kayma hızı buna uyuyor. */
  tickMs: SharedValue<number>;
  start: () => Promise<VoiceStartResult>;
  stop: () => Promise<VoiceTake | null>;
  cancel: () => Promise<void>;
  pause: () => void;
  resume: () => void;
} {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  // 0..1 — kayıt butonundaki nabız bunu okur.
  const level = useSharedValue(0);
  // Son WAVE_BARS örnek (0..1), en yenisi sonda — kayıt panelinin dalga formu.
  // Başlangıçta hepsi WAVE_EMPTY: örnekler sondan eklendiği için şerit sağdan
  // sola yazılıyor, henüz kaydedilmemiş kısım BOŞ kalıyor.
  const waveform = useSharedValue<number[]>(
    new Array(WAVE_BARS).fill(WAVE_EMPTY),
  );
  const waveRef = useRef<number[]>(new Array(WAVE_BARS).fill(WAVE_EMPTY));
  /**
   * Örneklerin ARASINDAKİ gerçek süre (yumuşatılmış). Sabit VOICE_TICK_MS
   * DEĞİL: ticker JS thread'inde dönüyor ve sohbet listesi kaydırılırken 50ms
   * yerine 150-200ms'de bir koşabiliyor. Dalganın kayma animasyonu bu ölçüyü
   * okuyor — sabit süreye bağlıyken kayma erken bitip bir sonraki örneğe kadar
   * DONUYORDU (kaydırırken "duraksama" tam olarak buydu).
   */
  const tickMs = useSharedValue(VOICE_TICK_MS);
  const tickEmaRef = useRef(VOICE_TICK_MS);

  const holdRef = useRef(false);
  const activeRef = useRef(false);
  const levelsRef = useRef<number[]>([]);
  const durationRef = useRef(0);
  const limitFiredRef = useRef(false);
  // Metering hiç gelmiyorsa dalga düz kalır ama kayıt SORUNSUZ sürer — sessiz
  // bir bozulma. Kayıt başına bir kez uyar (bkz. ticker).
  const meteringOkRef = useRef(false);
  const meteringWarnedRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onLimitRef = useRef(onLimitReached);
  useEffect(() => {
    onLimitRef.current = onLimitReached;
  }, [onLimitReached]);

  /**
   * Son tick'in duvar saati. Süre buradan ilerliyor — bkz. startTicker.
   * Duraklatma ticker'ı durdurduğu için duraklamada geçen zaman sayılmaz.
   */
  const lastTickRef = useRef(0);

  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    lastTickRef.current = 0;
  }, []);

  /**
   * iOS'ta kayıt oturumu AÇIK bırakılırsa sonraki oynatma kulaklık hoparlöründen
   * ve kısık çıkar — kayıt biter bitmez modu geri almak şart.
   */
  const releaseSession = useCallback(async () => {
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (err) {
      devLog("🎙️ [voice] ses oturumu geri alınamadı", err);
    }
  }, []);

  /**
   * Saniyede 20 kez: süreyi ilerlet, seviye örneğini al, dalgayı kaydır.
   *
   * İki savunma var ve ikisi de gerçek bir donma vakasından geldi — kayıt
   * sürüyor (ses dosyaya yazılıyor) ama panelde sayaç 0:00'da duruyor, dalga
   * hiç ilerlemiyordu:
   *
   *  1. `getStatus()` NATIVE'e iniyor ve hazırlık/kesinti anlarında patlayabiliyor.
   *     İstisna tick'in tamamını düşürüyordu (süre de dalga da yazılmıyordu) ve
   *     bir sonraki tick aynı yere geliyordu. Artık okuma izole: durum
   *     alınamazsa tur seviyesiz ama ÇALIŞIR devam ediyor.
   *  2. Süre artık DUVAR SAATİNDEN. Native `durationMillis` bazen 0 takılı
   *     kalıyor (recorder hazırlanırken, oturum başka bir uygulamaya kaptırılıp
   *     geri alınırken); `??` yalnız null/undefined'ı yakaladığı için 0 gerçek
   *     değer sayılıp sayaç sıfırda çakılıyordu. Bildirilen değer artık yalnız
   *     TABAN — hangisi büyükse o.
   */
  const startTicker = useCallback(() => {
    stopTicker();
    lastTickRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = lastTickRef.current
        ? Math.max(0, now - lastTickRef.current)
        : VOICE_TICK_MS;
      lastTickRef.current = now;
      // Ölçülen periyodu yumuşat (EMA): tek bir gecikmiş tur kaymayı sıçratmasın,
      // ama kalıcı yavaşlamaya birkaç tur içinde uyum sağlasın.
      tickEmaRef.current = tickEmaRef.current * 0.6 + elapsed * 0.4;
      tickMs.value = Math.min(
        VOICE_TICK_MAX_MS,
        Math.max(VOICE_TICK_MS, tickEmaRef.current),
      );
      let status: ReturnType<typeof recorder.getStatus> | null = null;
      try {
        status = recorder.getStatus?.() ?? null;
      } catch (err) {
        devLog("🎙️ [voice] durum okunamadı", err);
      }
      const ms = Math.max(
        status?.durationMillis ?? 0,
        durationRef.current + elapsed,
      );
      durationRef.current = ms;
      if (status?.metering != null) meteringOkRef.current = true;
      else if (!meteringOkRef.current && !meteringWarnedRef.current && ms > 1000) {
        meteringWarnedRef.current = true;
        devLog("🎙️ [voice] metering gelmiyor, dalga düz kalacak", status);
      }
      const lvl = meteringToLevel(status?.metering);
      levelsRef.current.push(lvl);
      level.value = withTiming(lvl / 100, { duration: VOICE_TICK_MS });
      // Kayan pencere: en eski çubuk düşer, yenisi sona eklenir. Yeni DİZİ
      // atanıyor — shared value'da mutasyon animasyonlu stilleri uyandırmaz.
      waveRef.current = [...waveRef.current.slice(1), lvl / 100];
      waveform.value = waveRef.current;
      // Yalnız saniye değişince render: sayaç zaten saniye gösteriyor.
      setDurationMs((prev) =>
        Math.floor(prev / 1000) === Math.floor(ms / 1000) ? prev : ms,
      );
      if (ms >= VOICE_MAX_MS && !limitFiredRef.current) {
        limitFiredRef.current = true;
        onLimitRef.current?.();
      }
    }, VOICE_TICK_MS);
  }, [level, recorder, stopTicker, tickMs, waveform]);

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    holdRef.current = true;
    levelsRef.current = [];
    durationRef.current = 0;
    limitFiredRef.current = false;
    meteringOkRef.current = false;
    meteringWarnedRef.current = false;
    setDurationMs(0);
    setIsPaused(false);
    level.value = 0;
    // Yeni kayıt boş şeritle başlar (bkz. WAVE_EMPTY) — önceki kaydın dalgası
    // bir an görünüp silinmesin, placeholder da çizilmesin.
    waveRef.current = new Array(WAVE_BARS).fill(WAVE_EMPTY);
    waveform.value = waveRef.current;
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        holdRef.current = false;
        return "denied";
      }
      // İzin diyaloğu ekranı kapattığı için parmak kalkmış olabilir.
      if (!holdRef.current) return "aborted";

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!holdRef.current) {
        await releaseSession();
        return "aborted";
      }
      recorder.record();
      activeRef.current = true;
      setIsRecording(true);
      startTicker();
      return "started";
    } catch (err) {
      devLog("🎙️ [voice] kayıt başlatılamadı", err);
      holdRef.current = false;
      activeRef.current = false;
      setIsRecording(false);
      await releaseSession();
      return "error";
    }
  }, [level, recorder, releaseSession, startTicker, waveform]);

  /**
   * Kilitli kayıtta duraklat/devam et. Ticker de duruyor: duraklarken sessizlik
   * örneklemek dalga formunu düz sıfırlarla dolduruyordu, üstelik durmuş süreyi
   * boşuna okuyorduk.
   */
  const pause = useCallback(() => {
    if (!activeRef.current) return;
    try {
      recorder.pause();
      stopTicker();
      level.value = 0;
      setIsPaused(true);
    } catch (err) {
      devLog("🎙️ [voice] duraklatılamadı", err);
    }
  }, [level, recorder, stopTicker]);

  const resume = useCallback(() => {
    if (!activeRef.current) return;
    try {
      recorder.record();
      setIsPaused(false);
      startTicker();
    } catch (err) {
      devLog("🎙️ [voice] devam ettirilemedi", err);
    }
  }, [recorder, startTicker]);

  const stop = useCallback(async (): Promise<VoiceTake | null> => {
    holdRef.current = false;
    stopTicker();
    setIsPaused(false);
    if (!activeRef.current) {
      setIsRecording(false);
      return null;
    }
    activeRef.current = false;
    // Süre stop'tan ÖNCE okunur — durdurulan recorder'ın status'ü sıfırlanıyor.
    const status = recorder.getStatus?.();
    const raw = Math.max(status?.durationMillis ?? 0, durationRef.current);
    try {
      await recorder.stop();
    } catch (err) {
      devLog("🎙️ [voice] kayıt durdurulamadı", err);
    }
    setIsRecording(false);
    level.value = 0;
    await releaseSession();
    const uri = recorder.uri;
    if (!uri) return null;
    return {
      uri,
      // Sunucu 1..60000 bekliyor; tavanı istemcide kırpıyoruz (UT-6603 kötü UX).
      durationMs: Math.max(1, Math.min(VOICE_MAX_MS, Math.round(raw))),
      waveformPeaks: encodeWaveformPeaks(levelsRef.current),
    };
  }, [level, recorder, releaseSession, stopTicker]);

  const cancel = useCallback(async () => {
    const take = await stop();
    if (take?.uri) discardVoiceTake(take.uri);
  }, [stop]);

  // Ekrandan çıkarken elde kalan kayıt: ticker'ı kes, native kaydı kapat.
  useEffect(
    () => () => {
      holdRef.current = false;
      if (tickRef.current) clearInterval(tickRef.current);
      if (activeRef.current) {
        activeRef.current = false;
        recorder.stop().catch(() => {});
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
          () => {},
        );
      }
    },
    [recorder],
  );

  return {
    isRecording,
    isPaused,
    durationMs,
    level,
    waveform,
    tickMs,
    start,
    stop,
    cancel,
    pause,
    resume,
  };
}
