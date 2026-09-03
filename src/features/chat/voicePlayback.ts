import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import {
  Easing,
  cancelAnimation,
  makeMutable,
  withTiming,
} from "react-native-reanimated";
import chatService from "@/features/chat/chatService";
import { devLog } from "@/shared/utils/devLog";

/**
 * Sesli mesaj oynatma — TEK oynatıcı, uygulama genelinde.
 *
 * NEDEN singleton: her balon kendi native player'ını kursaydı uzun bir sohbette
 * onlarca AVPlayer açılırdı (LegendList recycle ederken de sızardı). Üstelik
 * aynı anda iki sesli mesajın çalması istenmeyen bir davranış — burada
 * "ikincisine bas, birincisi durur" bedavaya geliyor.
 *
 * URL CACHE'İ YOK (rehber kuralı): oynatma linki 15 dakikalık imzalı bir URL ve
 * her PLAY'de yeniden alınıyor. Saklamak, expiresAt geçince 403'e düşmek
 * demekti; en uzun sesli mesaj 60 saniye olduğu için taze link oynatma boyunca
 * asla eskimez.
 */
export type VoicePlaybackState = {
  messageId: string | null;
  playing: boolean;
  loading: boolean;
  /**
   * SANİYE çözünürlüğünde konum — yalnız balondaki geri sayım metni için.
   * Çubukların ve topuzun ilerlemesi buradan DEĞİL `voiceProgress`ten gelir
   * (aşağıya bak), yoksa saniyede 10 render + 10 Fabric commit ederdik.
   */
  positionMs: number;
  /** Oynatıcıdan gelen gerçek süre; yüklenene kadar 0 (balon DTO'dakini çizer). */
  durationMs: number;
  /** Oynatma hızı (1 veya 2). Mesajlar arasında KORUNUR — kullanıcı bir kez seçer. */
  rate: number;
  error: boolean;
};

/** Hız kapsülünün döngüsü. */
export const VOICE_RATES = [1, 2] as const;

/**
 * ÇALAN mesajın ilerlemesi (0..1) — UI thread'inde yaşar.
 *
 * NEDEN shared value: oynatıcı konumu saniyede yalnız birkaç kez bildiriyor.
 * Bunu React state'ine yazıp çubukları yeniden render etmek hem kasıyordu
 * (her tick'te tüm balonlar + 34 View) hem de adım adım, düşük FPS'li bir
 * hareket veriyordu. Şimdi JS yalnız "şu an buradayız, kalan süre bu kadar"
 * diyor; aradaki her kare UI thread'inde DOĞRUSAL animasyonla üretiliyor ve
 * ekrana yalnız transform yazılıyor (layout/commit YOK).
 */
export const voiceProgress = makeMutable(0);

/**
 * Oynatıcının bildirdiği konumla animasyonun arasındaki bu kadarlık kayma
 * GÖRMEZDEN gelinir (ms).
 *
 * NEDEN: `status.currentTime` native tarafta örneklenip JS'e gecikmeyle
 * ulaşıyor, yani her bildirim geldiğinde animasyon ondan birkaç on ms İLERİDE
 * oluyor. Animasyonu her bildirimde yeniden kurmak, saniyede birkaç kez
 * geriye sıçramak demekti — ekranda tam olarak "kasıyor / FPS düşük" gibi
 * görünen şey buydu. Artık yalnız GERÇEK bir kopmada (seek, buffer, arka
 * plandan dönüş) yeniden kuruluyor.
 */
const RESYNC_MS = 400;

/** "Ses hazır mı" yoklamasının periyodu ve pes etme süresi. */
const READY_POLL_MS = 120;
const READY_TIMEOUT_MS = 20_000;

/**
 * Süren animasyonun JS tarafındaki muhasebesi: nereden, ne zaman başladı.
 *
 * Kaymayı ölçmek için `voiceProgress.value`'yu JS'ten OKUMUYORUZ — animasyon
 * UI thread'inde ilerliyor ve JS kopyası bayat (çoğu zaman hedef değer)
 * olabiliyor; ona bakan bir kontrol her seferinde "kopma var" deyip
 * animasyonu yeniden kurar, yani düzeltmeye çalıştığımız sıçramayı geri
 * getirirdi. Doğrusal animasyonda beklenen konum zaten saatle hesaplanabilir.
 */
let driving = false;
let driveFromMs = 0;
let driveStartedAt = 0;
let driveRate = 1;

/** Seçili hız — oynatıcı değişse de korunur, her yeni sese uygulanır. */
let currentRate = 1;

/**
 * Kullanıcının gördüğü hız (1 / 2) → oynatıcıya VERİLEN hız.
 *
 * 1x TAM 1.0 DEĞİL, bilerek: AVFoundation zaman-perde ünitesini (perde
 * düzeltmesi, `audioTimePitchAlgorithm`) yalnız hız 1.0'DAN FARKLIYKEN devreye
 * sokuyor, tam 1.0'da bypass ediyor. Bu yüzden 1.0 → 2.0 geçişinde ünite İLK
 * KEZ kurulup beslenmek zorunda kalıyor ve ses ~100ms susuyor; 2x → 1x'te ünite
 * yalnızca kapandığı için boşluk YOK — "ilk 1x'ten 2x'e geçerken duraklıyor"un
 * sebebi tam olarak bu asimetri.
 *
 * 1.01'de ünite oynatma başlarken (yani sessizken, play() öncesinde) kuruluyor
 * ve hız değişince yalnızca oranı değişiyor → geçiş kesintisiz. Bedeli %1 hız
 * farkı: 60 saniyelik bir mesajda 0.6sn, duyulmuyor. Geri sayım metni
 * oynatıcının kendi konumundan geldiği için yalan söylemiyor.
 */
const UNITY_RATE = 1.01;
const engineRate = (rate: number) => (rate === 1 ? UNITY_RATE : rate);

/**
 * Konum animasyonunu kurar. Doğrusal: JS yalnız "buradayız + kalan süre"
 * diyor, aradaki kareleri UI thread üretiyor. Hız 2x ise duvar saatinde kalan
 * süre yarısı kadardır — animasyon süresi hıza BÖLÜNÜR.
 */
function driveProgress(positionMs: number, durationMs: number, playing: boolean) {
  cancelAnimation(voiceProgress);
  driving = false;
  const total = durationMs > 0 ? durationMs : 0;
  const p = total ? Math.min(1, Math.max(0, positionMs / total)) : 0;
  voiceProgress.value = p;
  if (!playing || !total) return;
  const remaining = Math.max(0, total - positionMs);
  if (remaining > 0) {
    // Etiket hızı değil MOTOR hızı: 1x fiilen 1.01 çalıyor (bkz. engineRate),
    // animasyon sesin gerçek hızını takip etmeli.
    const speed = engineRate(currentRate);
    driving = true;
    driveFromMs = positionMs;
    driveStartedAt = Date.now();
    driveRate = speed;
    voiceProgress.value = withTiming(1, {
      duration: remaining / speed,
      easing: Easing.linear,
    });
  }
}

/** Animasyonun O AN göstermesi gereken SES konumu (ms) — hızla ölçeklenir. */
function animatedPositionMs(): number {
  return driveFromMs + (Date.now() - driveStartedAt) * driveRate;
}

/**
 * Son oynat/duraklat NİYETİ ve zamanı.
 *
 * Oynatıcının `playbackStatusUpdate` bildirimi niyetin ARKASINDAN geliyor:
 * play()'den hemen sonraki bildirim hâlâ `playing: false`, pause()'dan
 * sonraki hâlâ `playing: true` diyebiliyor. O bildirimi olduğu gibi yayınca
 * balondaki simge oynat → duraklat → oynat → duraklat diye zıplıyordu.
 * Bu pencerede niyetle ÇELİŞEN bildirimin `playing` alanı yutulur (konum
 * bilgisi yine kullanılır). Pencere dışında oynatıcı yine tek doğru kaynak —
 * kesinti/araya girme (telefon çalması) simgeyi doğru şekilde düşürebilsin.
 */
let intendedPlaying = false;
let intentAt = 0;
const INTENT_GRACE_MS = 800;
function setPlayIntent(playing: boolean) {
  intendedPlaying = playing;
  intentAt = Date.now();
}

/** Animasyonu olduğu yerde dondurur (duraklatma, durdurma). */
function freezeProgress() {
  cancelAnimation(voiceProgress);
  driving = false;
}

type Listener = (state: VoicePlaybackState) => void;

const IDLE: VoicePlaybackState = {
  messageId: null,
  playing: false,
  loading: false,
  positionMs: 0,
  durationMs: 0,
  rate: 1,
  error: false,
};

let player: AudioPlayer | null = null;
let sub: { remove: () => void } | null = null;
let state: VoicePlaybackState = IDLE;
// Aynı mesaja arka arkaya basıldığında eski (yavaş) URL isteğinin sonucu
// yenisinin üstüne binmesin diye her yükleme bir sıra numarası alır.
let loadSeq = 0;
const listeners = new Set<Listener>();

/**
 * Aboneleri yalnız GÖRÜNÜR bir şey değiştiğinde uyandırır: oynat/duraklat,
 * yükleniyor, süre ve konumun SANİYESİ. Milisaniye güncellemeleri burada
 * kasten yutuluyor — geri sayım metni saniyede bir değişiyor, çubuklar ise
 * zaten shared value'dan besleniyor.
 */
function emit(patch: Partial<VoicePlaybackState>) {
  const next = { ...state, ...patch };
  const changed =
    next.messageId !== state.messageId ||
    next.playing !== state.playing ||
    next.loading !== state.loading ||
    next.error !== state.error ||
    next.rate !== state.rate ||
    next.durationMs !== state.durationMs ||
    Math.floor(next.positionMs / 1000) !== Math.floor(state.positionMs / 1000);
  state = next;
  if (changed) listeners.forEach((l) => l(state));
}

export function getVoicePlaybackState(): VoicePlaybackState {
  return state;
}

/**
 * Hız kapsülü (1x / 2x). Seçim ÇALARKEN anında uygulanır ve sonraki sesli
 * mesajlarda da geçerli kalır. İlerleme animasyonu, o anki tahmini konumdan
 * yeni hızla yeniden kurulur — topuz/çubuklar sıçramaz.
 */
export function setVoicePlaybackRate(rate: number) {
  if (rate === currentRate) return;
  currentRate = rate;
  if (player) {
    try {
      // Perde düzeltmesi açık: 2x'te ses tizleşip "sincap" gibi çıkmasın.
      // ÖNCE bu, sonra hız: setPlaybackRate perde algoritmasını bu bayrağa
      // bakarak seçiyor.
      player.shouldCorrectPitch = true;
      // ATAMA DEĞİL, FONKSİYON. `playbackRate` expo-audio'da yalnız GETTER
      // (AudioModule.swift > Property("playbackRate") — `.set` yok; Android'de
      // de öyle). `player.playbackRate = 2` sessizce hiçbir şey yapmıyordu,
      // 2x'in çalışmama sebebi buydu. Tip tanımı yanıltıcı: yazılabilir
      // görünüyor ve dokümanda atama örneği bile var.
      player.setPlaybackRate(engineRate(rate));
      // ÇALARKEN bir de play(): setPlaybackRate hızı AVPlayer'ın `rate`ine
      // DOĞRUDAN atıyor ve oynatıcı (automaticallyWaitsToMinimizeStalling
      // varsayılan olarak açık) yeni hız için tamponu yetersiz bulup kısa süre
      // "beklemeye" geçiyor — ilk 1x→2x geçişinde duyulan boşluk buydu (2x→1x'te
      // yok: daha az tampon gerekiyor). play() ise native tarafta
      // `playImmediately(atRate:)` çağırıyor (expo-audio/ios/AudioPlayer.swift),
      // yani beklemeyi atlayıp hızı anında uyguluyor ve rate'i setPlaybackRate'in
      // yazdığı `currentRate`ten okuyor — sıra bu yüzden önemli.
      // Gözlemci çoğaltmaz: play() bitiş bildirimi ve zaman gözlemcisini
      // eskisini kaldırarak yeniden kuruyor. Duraklatılmışken çağrılmaz, yoksa
      // hız değiştirmek sesi kendiliğinden başlatırdı.
      if (state.playing) player.play();
    } catch (err) {
      devLog("🔊 [voice] hız uygulanamadı", err);
    }
    if (state.playing && driving) {
      driveProgress(animatedPositionMs(), state.durationMs, true);
    }
  }
  emit({ rate });
}

export function subscribeVoicePlayback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ses HAZIR olana kadar oynatma başlamaz (bkz. toggleVoicePlayback). Bu bayrak
 * "çalmaya başladık mı" demek: yükleme sürerken gelen dokunuşlar yok sayılır,
 * yoksa yüklenmemiş oynatıcıya play() gönderirdik.
 */
let ready = false;
// "Hazır mı" yoklaması — bazı kaynaklarda yükleme bitişi ayrı bir status
// olayı üretmiyor, o yüzden olayın yanında bir de yoklama var.
let readyTimer: ReturnType<typeof setInterval> | null = null;

function clearReadyTimer() {
  if (readyTimer) {
    clearInterval(readyTimer);
    readyTimer = null;
  }
}

function teardown() {
  clearReadyTimer();
  ready = false;
  sub?.remove();
  sub = null;
  try {
    // ÖNCE pause, SONRA remove — sırası kritik. expo-audio'nun `remove()`u sesi
    // DURDURMUYOR: native tarafta yalnız oynatıcıyı registry sözlüğünden
    // siliyor (node_modules/expo-audio/ios/AudioModule.swift > Function("remove")).
    // Gerçek kapatma `sharedObjectWillRelease`ta, yani JS nesnesi çöp
    // toplandığında oluyor — o ana kadar AVPlayer çalmaya devam ediyordu.
    // Görünen şey: ikinci sesli mesaja basınca birincisi susmuyor, ikisi
    // üst üste çalıyor.
    player?.pause();
    player?.remove();
  } catch (err) {
    devLog("🔊 [voice] oynatıcı kapatılamadı", err);
  }
  player = null;
}

/** Çalan sesi durdurur (sohbetten çıkarken / uzun basış menüsü açılırken). */
export function stopVoicePlayback() {
  loadSeq++;
  setPlayIntent(false);
  teardown();
  freezeProgress();
  voiceProgress.value = 0;
  state = IDLE;
  listeners.forEach((l) => l(state));
}

/**
 * Oynat / duraklat. `localUri` yalnız KENDİ az önce gönderdiğimiz mesajda dolu:
 * dosya zaten cihazda, sunucudan imzalı link istemeye gerek yok. `durationMs`
 * DTO'dan gelir: oynatıcı kendi süresini bildirene kadar ilerleme animasyonu
 * bununla kurulur, yoksa ilk saniyeler hareketsiz kalırdı.
 */
export async function toggleVoicePlayback(
  messageId: string,
  {
    localUri,
    durationMs,
  }: { localUri?: string | null; durationMs?: number | null } = {},
) {
  // Aynı mesaj: yükleme bitmişse duraklat/devam ettir. Ses HENÜZ HAZIR DEĞİLSE
  // dokunuş yok sayılır — yüklenmemiş oynatıcıya play() göndermek, "biraz
  // çalıp başa dönme" davranışının ta kendisiydi.
  if (state.messageId === messageId && player) {
    if (!ready) return;
    if (state.playing) {
      setPlayIntent(false);
      player.pause();
      // Sadece dondur: son örneklenen konuma geri sarmak topuzu geri
      // zıplatırdı. Gerçek konumu bir sonraki status güncellemesi oturtuyor.
      freezeProgress();
      emit({ playing: false });
    } else {
      setPlayIntent(true);
      player.play();
      driveProgress(state.positionMs, state.durationMs, true);
      emit({ playing: true, error: false });
    }
    return;
  }

  const seq = ++loadSeq;
  teardown();
  freezeProgress();
  voiceProgress.value = 0;
  // rate IDLE'dan DEĞİL seçili hızdan gelir: kullanıcı 2x seçtiyse sonraki
  // sesli mesaj da 2x başlar.
  state = {
    ...IDLE,
    messageId,
    loading: true,
    durationMs: durationMs || 0,
    rate: currentRate,
  };
  listeners.forEach((l) => l(state));

  try {
    const source = localUri || (await chatService.getMediaUrl(messageId)).url;
    if (seq !== loadSeq) return; // bu arada başka mesaja basıldı
    // Sessiz moddaki telefonda da çalsın — sesli mesajın beklenen davranışı bu.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (seq !== loadSeq) return;

    // updateInterval 500ms: konum ekrana JS'ten çizilmiyor. Bu bildirimlerin
    // tek işi geri sayım metnini (saniyelik) beslemek, bitişi yakalamak ve
    // gerçek bir kopma olursa animasyonu düzeltmek.
    //
    // downloadFirst: dosya ÖNCE indirilir, oynatma ondan sonra başlar — akış
    // ortasında buffer beklemesi (ve onun yarattığı duraklama/geri sarma) olmaz.
    const next = createAudioPlayer(source, {
      updateInterval: 500,
      downloadFirst: true,
    });
    player = next;

    /**
     * Ses hazır olduğunda oynatmayı başlatır. play() HAZIR OLMADAN çağrılırsa
     * native oynatıcı hazır olunca konumu sıfırlıyor: görünen şey "biraz
     * ilerleyip başa dönme"ydi. Süre de burada kesinleşiyor, animasyon 0'dan
     * gerçek süreyle tek seferde kuruluyor.
     */
    const beginPlayback = () => {
      if (ready || seq !== loadSeq) return;
      const total = next.duration > 0 ? Math.round(next.duration * 1000) : 0;
      if (!next.isLoaded || total <= 0) return;
      ready = true;
      clearReadyTimer();
      // Seçili hız yeni oynatıcıya da taşınır (kullanıcı bir kez seçiyor).
      // play() hızı `currentRate`ten okuduğu için sıra önemli: önce hız, sonra
      // play. (Atama değil setPlaybackRate — gerekçe setVoicePlaybackRate'te.)
      try {
        next.shouldCorrectPitch = true;
        // Hız play()'DEN ÖNCE: zaman-perde ünitesi oynatma başlamadan kurulsun
        // (bkz. engineRate) ve play() rate'i `currentRate`ten okusun.
        next.setPlaybackRate(engineRate(currentRate));
      } catch (err) {
        devLog("🔊 [voice] hız uygulanamadı", err);
      }
      setPlayIntent(true);
      next.play();
      driveProgress(0, total, true);
      emit({ playing: true, loading: false, positionMs: 0, durationMs: total });
    };

    sub = next.addListener("playbackStatusUpdate", (status) => {
      if (seq !== loadSeq) return;
      if (!ready) {
        beginPlayback();
        return;
      }
      if (status.didJustFinish) {
        // Baştan çalınabilsin diye başa sar, ama otomatik devam etme.
        setPlayIntent(false);
        next.seekTo(0).catch(() => {});
        freezeProgress();
        voiceProgress.value = 0;
        emit({ playing: false, positionMs: 0, loading: false });
        return;
      }
      const positionMs = Math.max(0, Math.round((status.currentTime || 0) * 1000));
      const total =
        status.duration > 0 ? Math.round(status.duration * 1000) : state.durationMs;
      // Niyetin hemen ardından gelen ÇELİŞEN bildirim yutulur (bkz.
      // setPlayIntent) — simge oynat/duraklat arasında zıplamasın. Konum ve
      // süre alanları her hâlükârda kullanılır, yalnız bu bayrak düzeltilir.
      const playing =
        status.playing !== intendedPlaying &&
        Date.now() - intentAt < INTENT_GRACE_MS
          ? intendedPlaying
          : status.playing;
      if (!playing) {
        freezeProgress();
      } else if (
        // Animasyon YALNIZ oynatıcının bildirdiği gerçek süreyle kurulur:
        // DTO'daki süreye güvenip kurmak, o değer küçük/yanlış geldiğinde
        // animasyonu anında sona sürüklüyordu (tüm dalga bir anda "çalınmış"
        // görünüyor, sonraki bildirim başa sarıyor → sürekli geri tepme).
        total > 0 &&
        (!driving || Math.abs(animatedPositionMs() - positionMs) > RESYNC_MS)
      ) {
        driveProgress(positionMs, total, true);
      }
      emit({
        playing,
        loading: !status.isLoaded,
        positionMs,
        durationMs: total,
      });
    });
    // Hazır olur olmaz başlat. Yükleme bitişi her kaynakta status olayı
    // üretmediği için olayın yanına bir de yoklama koyuyoruz; ikisinden hangisi
    // önce yakalarsa oynatma o an başlar (beginPlayback tek atımlık).
    beginPlayback();
    if (!ready) {
      clearReadyTimer();
      let waited = 0;
      readyTimer = setInterval(() => {
        if (seq !== loadSeq) {
          clearReadyTimer();
          return;
        }
        waited += READY_POLL_MS;
        beginPlayback();
        if (!ready && waited >= READY_TIMEOUT_MS) {
          // Ses bu kadar sürede hazır olmadıysa gerçekten bir sorun var.
          clearReadyTimer();
          teardown();
          emit({ playing: false, loading: false, error: true });
        }
      }, READY_POLL_MS);
    }
  } catch (err) {
    devLog("🔊 [voice] oynatılamadı", err);
    if (seq !== loadSeq) return;
    teardown();
    freezeProgress();
    voiceProgress.value = 0;
    emit({ playing: false, loading: false, error: true });
  }
}
