import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  Pressable,
  type ViewStyle,
} from "react-native";
// Reanimated'ın Animated'ı AYRI isimle: hız kapsülü RN Animated kullanıyor
// (balon başına UI-thread mapper'ı açmamak için), dalga maskesi ise reanimated.
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import { Play, Pause } from "@/shared/icons";
import * as Haptics from "expo-haptics";
import SFIcon from "@/shared/components/SFIcon";
import {
  formatVoiceDuration,
  parseWaveformPeaks,
} from "@/features/chat/voiceMessage";
import {
  BUBBLE_MAX_WIDTH,
  BUBBLE_PAD_H,
} from "@/features/chat/components/bubbleStyle";
import {
  getVoicePlaybackState,
  setVoicePlaybackRate,
  subscribeVoicePlayback,
  toggleVoicePlayback,
  voiceProgress,
  VOICE_RATES,
  type VoicePlaybackState,
} from "@/features/chat/voicePlayback";
import { colors } from "../../../shared/theme/colors";

// TAM SAYI olmak zorunda: 3.5pt gibi kesirli genişlik @3x ekranda 10.5 piksele
// denk geliyor ve her çubuk farklı yöne yuvarlanıyor → aralar gözle görülür
// biçimde eşitsizleşiyordu. Genişlik de boşluk da tam sayı olduğunda tüm
// çubuklar aynı fiziksel piksel adımına oturur.
const BAR_W = 4;
const BAR_GAP = 2;
/**
 * Çubuk tavanı. Şerit kutunun dikey ORTASINDA durduğu için bu değeri artırmak
 * dalgayı alttan ve üstten eşit uzatır.
 *
 * Kutu `max(BAR_MAX_H, STACK_H)` (bkz. WAVE_H): süre + kapsül yığını 39pt
 * olduğu için 39'a kadar balonu HİÇ büyütmüyordu. Bu değer artık o tavanın
 * ÜSTÜNDE, yani balonun boyunu buradan itibaren dalga belirliyor — her punto
 * balona bir punto ekler.
 */
const BAR_MAX_H = 44;
// Sessiz kısımlar yuvarlak bir nokta gibi kalsın: kalınlıkla birlikte taban da
// büyüdü, yoksa kalın çubukların dibinde ezik bir çizgi oluyordu.
const BAR_MIN_H = 4;
const PLAY_W = 26;
const ROW_GAP = 8;
/**
 * Balonun KENDİ dikey iç boşluğu — MessageBubble'ın BUBBLE_PAD_V'sine EKLENİR.
 * Yalnız sesli balonda: içerik (dalga + süre + hız kapsülü) metinden yoğun,
 * standart boşlukta kenarlara yapışık duruyordu.
 */
const VOICE_PAD_V = 3;
/**
 * Balonun SAĞ iç boşluğundan kırpılan miktar — negatif margin ile. Sesli balonda
 * içerik (dalga + süre) sağa daha yakın dursun diye standart 14pt'nin 6'sı geri
 * alınıyor; kazanılan genişlik doğrudan çubuk bütçesine gidiyor (bkz. BARS), yani
 * dalga da o kadar uzuyor.
 *
 * NEDEN margin, neden kapsül rezervini (RIGHT_COL_W) daha da kısmıyoruz: rezervi
 * kısmak kapsülü dalga kutusunun DIŞINA taşırır ve iOS'ta ebeveyn sınırının
 * dışına düşen alan dokunuş almaz. Negatif margin ise yalnız balonun ölçüsünü
 * değiştiriyor, kutu içeriği kendi sınırları içinde kalıyor.
 *
 * Bir çubuk adımının (BAR_W + BAR_GAP) katı olmalı: aksi halde artan genişlik
 * yeni bir çubuğa yetmez, sadece kutunun sağında ölü boşluk olur.
 */
const VOICE_TRIM_RIGHT = 6;
/**
 * Süre + hız kapsülü için ayrılan genişlik (boşluktan SONRA). İçerik soldan
 * hizalı olduğu için bu yalnızca bir REZERV: en geniş eleman hız kapsülü
 * (2 × RATE_PAD_H + "2x" ≈ 34pt) ve o da sürenin merkezine oturmak için yarım
 * fark kadar sola kayıyor. Ölçüm değil sabit, çünkü çubuk sayısı buradan
 * türüyor ve render'dan ÖNCE bilinmesi gerekiyor.
 *
 * TAM OTURTULMUŞ: kapsülün sağ kenarı (boşluk + (kapsül + süre) / 2 ≈ 38pt)
 * kutunun sağ kenarına denk geliyor, arkasında ölü boşluk YOK. Büyütürsen o
 * boşluk geri gelir ve dalga kısalır; küçültürsen kapsülün sağ ucu kutunun
 * dışına taşar — orası iOS'ta dokunuş almaz.
 */
const RIGHT_COL_W = 30;
/**
 * Şerit ile süre sütunu arası — oynat butonuyla şerit arasındaki boşlukla AYNI
 * (ROW_GAP), satır soldan sağa eşit nefes alsın. Şerit sütunun altına GİRMEZ:
 * eskiden dalga balonun sağ kenarına kadar uzanıp sürenin altından geçiyordu ve
 * okunurluk 62pt'lik geniş bir kaybolma bandına bağlıydı — o band da dalganın
 * son üçte birini siliyordu.
 */
const RIGHT_COL_GAP = ROW_GAP;

// ── Süre + hız kapsülü geometrisi ──────────────────────────────────────────
// İkisi de dalga kutusunun İÇİNDE mutlak konumlu: kapsül akışta dururken
// balonun boyu oynatmaya başlayınca ~23pt büyüyordu. Yığın (süre + boşluk +
// kapsül) çubuklardan yüksek olduğu için KUTU ondan türetiliyor — yani balonun
// boyunu kapsülün ölçüsü belirliyor, çubuklar (BAR_MAX_H) kutunun ortasında
// duruyor. Kapsülü büyütmek balonu da büyütür, hesabı elle güncellemek gerekmez.
//
// Kapsül kutunun DIŞINA taşırılamaz: iOS'ta ebeveyn sınırının dışına düşen alan
// dokunuş almıyor (hitSlop dahil), kapsül tıklanamaz olurdu.
const DURATION_LINE_H = 14;
const RATE_LINE_H = 15;
const RATE_PAD_V = 4;
const RATE_PAD_H = 10;
const RATE_H = RATE_LINE_H + RATE_PAD_V * 2;
/** Süre ile kapsül arası. */
const STACK_GAP = 2;
const STACK_H = DURATION_LINE_H + STACK_GAP + RATE_H;
/** Dalga kutusunun (ve dolayısıyla balon içeriğinin) yüksekliği. */
const WAVE_H = Math.max(BAR_MAX_H, STACK_H);
/**
 * Sürenin dikey ortadan ne kadar kalktığı: yığın ortalı dururken sürenin üst
 * satıra çıkması bu kadar. Kapsül de yığının altına oturur (RATE_BOTTOM).
 */
const DURATION_LIFT = (STACK_H - DURATION_LINE_H) / 2;
const RATE_BOTTOM = (WAVE_H - STACK_H) / 2;
// Kapsül süre kalkmaya BAŞLADIKTAN sonra belirsin — aynı anda açılınca ikisi
// üst üste binmiş gibi okunuyor.
const RATE_FADE_AT = 0.4;
// Kapsül belirirken sürenin ALTINDAN kayarak yerine oturur (yukarıdan aşağı).
// Yönü bilerek aşağı: yukarıdan başlasa kutunun alt kenarını taşar ve o sırada
// dokunuş almaz (ebeveyn sınırı dışı).
const RATE_SLIDE = 4;
const RATE_IN_MS = 320;
const RATE_OUT_MS = 200;

/**
 * Ekranda çizilen çubuk sayısı, balona GERÇEKTEN sığan genişlikten türetiliyor:
 * sunucudaki 48 nokta 4.5pt'lik çubuklarla ~216pt eder, dar cihazlarda balondan
 * taşardı. Sabit bir sayı yazmak SE'de çubukları balonun dışına taşırır.
 *
 * Hesaptan oynat butonu, iki boşluk ve süre sütunu düşülür — şerit ikisinin
 * ARASINDA kalıyor, hiçbirinin altına girmiyor.
 */
const BARS_MAX = Math.max(
  14,
  Math.floor(
    (BUBBLE_MAX_WIDTH -
      BUBBLE_PAD_H * 2 +
      VOICE_TRIM_RIGHT -
      PLAY_W -
      ROW_GAP -
      RIGHT_COL_GAP -
      RIGHT_COL_W +
      BAR_GAP) /
      (BAR_W + BAR_GAP),
  ),
);

/**
 * Balon genişliği SÜREYLE ölçülür: 5 saniyeye kadar orantılı büyür, sonrası hep
 * tam boy. Sabit genişlik 1 saniyelik bir mesajı 60 saniyelik gibi gösteriyordu.
 * Kısalan tek şey çubuk ŞERİDİ — oynat tuşu, boşluklar ve süre sütunu sabit.
 *
 * Ölçü DTO'daki süreden alınır, oynatıcının bildirdiğinden DEĞİL: o değer
 * oynatma başlayınca kesinleşiyor ve balon o anda yeniden boyutlanırdı.
 */
const FULL_WIDTH_MS = 5000;
/** Yarım saniyelik bir mesaj bile çubuk yerine çizgiye dönmesin. */
const BARS_MIN = 6;

function barCountFor(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) return BARS_MAX;
  const ratio = Math.min(1, durationMs / FULL_WIDTH_MS);
  return Math.max(BARS_MIN, Math.round(BARS_MAX * ratio));
}

/** Çubuk sayısından şerit genişliği. */
function stripWidth(count: number) {
  return count * BAR_W + (count - 1) * BAR_GAP;
}

/**
 * Çubuk şeridinin kabı — iki katman (sönük + dolu) BİREBİR aynı kesilmeli.
 * Genişlik BURADA YOK: mesaj başına değişiyor, çağrı yerinde veriliyor.
 */
const BARS_ROW: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: BAR_GAP,
  height: WAVE_H,
};

/**
 * Sessiz/gürültülü farkını AÇAN üs. Ham veri sıkışık geliyor: metering dB'si
 * -50..0 aralığından doğrusal ölçekleniyor (voiceMessage > meteringToLevel) ve
 * konuşma neredeyse tamamen -30..-10 arasında kalıyor — yani çubukların hepsi
 * orta yükseklikte, dalga düz bir şerit gibi duruyordu. Üs 1'den büyük olunca
 * alçak değerler daha çok bastırılıyor, tepeler yerinde kalıyor.
 */
const BAR_GAMMA = 1.8;

/**
 * Tek çubuğun yüksekliği. Tam sayıya yuvarlanır — kesirli yükseklikler komşu
 * çubuklarda farklı yuvarlanıp tepe çizgisini tırtıklı gösteriyordu.
 */
function barHeight(peak: number) {
  const n = Math.max(0, Math.min(1, peak / 100));
  return Math.max(BAR_MIN_H, Math.round(Math.pow(n, BAR_GAMMA) * BAR_MAX_H));
}

/**
 * Çalınmış kısmın maskesi — SÜREKLİ, çubuk çubuk değil.
 *
 * Eskiden ilerleme çubuk indeksine yuvarlanıp JS'e taşınıyordu: hareket
 * "bir çubuk doldu, sıradakine geç" diye kesikliydi. Şimdi dolu şerit,
 * ilerlemeyle sağa açılan bir pencereyle kırpılıyor — çizgi çubuğun ortasında
 * da durabiliyor, hareket kare kare akıyor.
 *
 * NASIL: kırpma kabı ilerleme kadar sağa ötelenir, içindeki şerit AYNI kadar
 * ters yöne — net sonuç [0, p × WAVE_W] aralığının görünmesi, içerik ise
 * yerinde. İkisi de TRANSFORM: `width` animasyonlansaydı her karede bir Fabric
 * commit'i olurdu (bkz. shared value gerekçesi, voicePlayback.ts).
 *
 * YALNIZ çalan balonda mount edilir → diğer balonlarda tek bir animasyon
 * mapper'ı bile çalışmaz.
 */
const WaveFill = memo(function WaveFill({
  bars,
  color,
  waveW,
}: {
  bars: number[];
  color: string;
  waveW: number;
}) {
  const clip = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - voiceProgress.value) * waveW }],
  }));
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - voiceProgress.value) * waveW }],
  }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: waveW,
          height: WAVE_H,
          overflow: "hidden",
        },
        clip,
      ]}
    >
      <Reanimated.View style={[BARS_ROW, { width: waveW }, strip]}>
        {bars.map((peak, i) => (
          <View
            key={i}
            style={{
              width: BAR_W,
              height: barHeight(peak),
              borderRadius: BAR_W / 2,
              backgroundColor: color,
            }}
          />
        ))}
      </Reanimated.View>
    </Reanimated.View>
  );
});

/**
 * Sesli mesaj baloncuğu — oynat/duraklat + dalga formu + süre.
 *
 * Oynatma durumu bileşenin İÇİNDE tutulmaz: tek bir global oynatıcı var
 * (voicePlayback), balon ona abone olur. Böylece ikinci bir sesli mesaja
 * basınca birincisi kendiliğinden durur ve liste recycle ederken native
 * oynatıcı sızmaz.
 */
function VoiceBubble({
  messageId,
  isOwn,
  durationMs,
  waveformPeaks,
  localUri,
  pending,
  failed,
}: {
  messageId: string;
  isOwn: boolean;
  durationMs?: number | null;
  waveformPeaks?: string | null;
  /** Kendi az önce gönderdiğimiz kayıt — sunucudan link istemeden çalınır. */
  localUri?: string | null;
  /** Yükleme sürüyor: yerel dosya varsa yine çalınabilir. */
  pending?: boolean;
  /** Gönderim başarısız: dokunuş oynatma değil YENİDEN DENEME (balonun işi). */
  failed?: boolean;
}) {
  const [playback, setPlayback] = useState<VoicePlaybackState>(
    getVoicePlaybackState,
  );
  // Abonelik BU mesaja göre filtreli: yayın globaldir ama başka bir mesaj
  // çalarken bu balonun render olmasının hiçbir anlamı yok. Aynı referansı geri
  // vermek React'in bail-out'unu tetikler → render hiç kuyruğa girmez.
  // (Filtresiz hali, sohbetteki HER sesli balonu saniyede defalarca render
  // ediyordu — takılmanın asıl kaynağı buydu.)
  useEffect(
    () =>
      subscribeVoicePlayback((next) =>
        setPlayback((prev) =>
          next.messageId === messageId || prev.messageId === messageId
            ? next
            : prev,
        ),
      ),
    [messageId],
  );

  const isCurrent = playback.messageId === messageId;
  const playing = isCurrent && playback.playing;

  // Süre: oynatıcı gerçek süreyi bildirene kadar DTO'daki değer (sunucu bunu
  // zorunlu tuttuğu için hep dolu — çubuk asla boş çizilmez).
  const totalMs = (isCurrent && playback.durationMs) || durationMs || 0;
  // Metin geri sayımı için; ÇUBUKLARIN ilerlemesi buradan gelmiyor (ProgressTracker).
  const positionMs = isCurrent ? playback.positionMs : 0;

  // Şerit uzunluğu SÜREYE bağlı (bkz. FULL_WIDTH_MS). DTO'daki süre kullanılır,
  // `totalMs` DEĞİL: oynatıcı kendi süresini bildirince balon yeniden boyutlanırdı.
  const barCount = barCountFor(durationMs);
  const waveW = stripWidth(barCount);

  const bars = useMemo(() => {
    const peaks = parseWaveformPeaks(waveformPeaks);
    if (!peaks.length) {
      // Dalga formu yok (eski mesaj / bozuk veri) → düz çubuk. Değer BAR_GAMMA
      // uygulandıktan sonra orta yükseklik versin diye seçildi.
      return new Array(barCount).fill(60);
    }
    const step = peaks.length / barCount;
    const avg = Array.from({ length: barCount }, (_, i) => {
      const from = Math.floor(i * step);
      const to = Math.max(from + 1, Math.floor((i + 1) * step));
      let sum = 0;
      let n = 0;
      for (let j = from; j < to && j < peaks.length; j++) {
        sum += peaks[j];
        n++;
      }
      return n ? sum / n : 0;
    });
    // Mesaj İÇİNDE normalize: en yüksek çubuk tavana otursun. Kayıt seviyesi
    // mesajdan mesaja değişiyor (mikrofona uzaklık, ortam) — normalize etmeden
    // kısık kaydedilmiş bir mesajın dalgası tümüyle bastık kalıyor, üstüne bir
    // de BAR_GAMMA binince düz çizgiye dönüyordu.
    const top = Math.max(...avg);
    if (top <= 0) return avg;
    return avg.map((v) => (v / top) * 100);
  }, [waveformPeaks, barCount]);

  // Yüklenirken bile kendi kaydımızı dinleyebiliriz (dosya cihazda). Hata
  // durumunda oynatıcı kapalı: o baloncuğa dokunmak yeniden denemek demek.
  const canPlay = !failed && (!!localUri || !pending);

  const rate = isCurrent ? playback.rate : 1;
  const onCycleRate = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const index = VOICE_RATES.indexOf(rate as (typeof VOICE_RATES)[number]);
    setVoicePlaybackRate(VOICE_RATES[(index + 1) % VOICE_RATES.length]);
  }, [rate]);

  // ── Hız kapsülünün geliş/gidişi ──────────────────────────────────────────
  // Kapsül YALNIZ oynatma gerçekten başladıktan sonra çıkar (yükleme sırasında
  // görünüp kaybolmasın); duraklatınca kalır. Reanimated DEĞİL, RN Animated:
  // balon başına reanimated hook'u commit-storm teşhisinde suçlu çıkmıştı
  // (bkz. MessageBubble). Buradaki tek değer yalnız çalan balonda oynuyor.
  const showRate = isCurrent && (playing || positionMs > 0);
  const rateAnimRef = useRef<Animated.Value | null>(null);
  if (!rateAnimRef.current) {
    rateAnimRef.current = new Animated.Value(showRate ? 1 : 0);
  }
  const rateAnim = rateAnimRef.current;
  // Çıkış animasyonu oynasın diye kapsül showRate düşer düşmez sökülmez;
  // animasyon bitince sökülür.
  const [rateMounted, setRateMounted] = useState(showRate);
  const prevMessageId = useRef(messageId);
  useEffect(() => {
    // recycleItems açık: container başka mesaja geçince component REMOUNT
    // EDİLMEZ → scroll sırasında rastgele balonlarda kapsül açılıp kapanmasın
    // diye kimlik değişiminde animasyon YOK, değer doğrudan yerine konur.
    const recycled = prevMessageId.current !== messageId;
    prevMessageId.current = messageId;
    if (showRate) setRateMounted(true);
    if (recycled) {
      rateAnim.stopAnimation();
      rateAnim.setValue(showRate ? 1 : 0);
      if (!showRate) setRateMounted(false);
      return;
    }
    const anim = Animated.timing(rateAnim, {
      toValue: showRate ? 1 : 0,
      duration: showRate ? RATE_IN_MS : RATE_OUT_MS,
      easing: showRate ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !showRate) setRateMounted(false);
    });
    return () => anim.stop();
  }, [showRate, messageId, rateAnim]);

  // ── Süre ile kapsülün ortak merkezi ──────────────────────────────────────
  // SÜRE SABİT: sol kenarı şeridin bittiği yerden RIGHT_COL_GAP kadar sonra,
  // hiç kaymıyor. Ortalamayı KAPSÜL yapıyor — yarım genişlik farkı kadar sola
  // kaydırılıp sürenin merkezine oturuyor. Ters kurgu (süreyi kaydırmak)
  // denendi ve bırakıldı: kapsül gelirken süre yana süzülüyordu, hareket
  // gereksiz ve rahatsız ediciydi.
  //
  // Genişlikler ölçülüyor — yazı tipi metriklerinden hesaplanamaz; ikisi de
  // ömür boyu bir kez ölçülür (tabular-nums, metin uzunluğu sabit).
  const [durationW, setDurationW] = useState(0);
  const [rateW, setRateW] = useState(0);
  const centerShift = Math.max(0, Math.round((rateW - durationW) / 2));

  // Süre yukarı kayar, kapsül onun altında belirir — ikisi de aynı değerden.
  const durationLift = useMemo(
    () =>
      rateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -DURATION_LIFT],
      }),
    [rateAnim],
  );
  // Üç noktalı aralık: kapsül RATE_FADE_AT'e kadar hiç görünmez, extrapolate
  // ayarına gerek kalmaz.
  const rateOpacity = useMemo(
    () =>
      rateAnim.interpolate({
        inputRange: [0, RATE_FADE_AT, 1],
        outputRange: [0, 0, 1],
      }),
    [rateAnim],
  );
  const rateSlide = useMemo(
    () =>
      rateAnim.interpolate({
        inputRange: [0, RATE_FADE_AT, 1],
        outputRange: [-RATE_SLIDE, -RATE_SLIDE, 0],
      }),
    [rateAnim],
  );

  const onToggle = useCallback(() => {
    if (!canPlay) return;
    Haptics.selectionAsync().catch(() => {});
    // durationMs yalnız GERİ SAYIM METNİ için: oynatıcı kendi süresini
    // bildirene kadar balon boş kalmasın. İlerleme animasyonu bu değerle
    // KURULMAZ (yanlış gelirse dalgayı bir anda dolduruyordu).
    toggleVoicePlayback(messageId, { localUri, durationMs });
  }, [canPlay, durationMs, localUri, messageId]);

  const tint = isOwn ? colors.onMedia : colors.text;
  // Süre kendi balonumuzda TAM BEYAZ (soluk beyaz açık modda kırmızı zeminin
  // üstünde okunmuyordu); karşı tarafın balonunda beyaz görünmez olacağı için
  // ikincil metin rengi kalıyor.
  const dim = isOwn ? colors.onMedia : colors.textSecondary;
  // Çalınmış kısım dolu, kalanı soluk — ilerleme çubukların üstünde okunuyor.
  const barOn = tint;
  const barOff = isOwn ? "rgba(255,255,255,0.4)" : colors.textMuted;

  return (
    <View
      style={{ paddingVertical: VOICE_PAD_V, marginRight: -VOICE_TRIM_RIGHT }}
    >
      {/* Ana satır: oynat + dalga + süre. Hepsi dalganın orta ekseninde. */}
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: ROW_GAP }}
      >
        {/* Çıplak glif: dolgulu daire kaldırıldı, dokunma alanı hitSlop'ta. */}
        <Pressable
          onPress={onToggle}
          disabled={!canPlay}
          hitSlop={10}
          accessibilityRole="button"
          style={{
            width: PLAY_W,
            height: WAVE_H,
            alignItems: "center",
            justifyContent: "center",
            opacity: canPlay ? 1 : 0.5,
          }}
        >
          {/* Yükleme göstergesi YOK (bilinçli): ses hazır olana kadar simge
            "oynat" olarak kalır, hazır olduğu an duraklat'a döner ve kesintisiz
            çalar. Spinner hem bir kare için görünüp kaybolan bir titreşim
            yaratıyordu hem de kullanıcı isteği bu değildi. */}
          <SFIcon
            name={playing ? "pause.fill" : "play.fill"}
            fallback={playing ? Pause : Play}
            size={22}
            strokeWidth={2}
            weight="semibold"
            color={tint}
            fill={tint}
          />
        </Pressable>

        {/* Kutu iki sütun: solda çubuk şeridi, sağda süre + hız kapsülü.
            Şerit sütunun ALTINA GİRMEZ, o yüzden ucunda kaybolma bandı da yok
            (kaldırıldı): band, dalga sürenin altından geçerken okunurluk
            içindi. */}
        <View
          style={{ width: waveW + RIGHT_COL_GAP + RIGHT_COL_W, height: WAVE_H }}
        >
          {/* Sönük katman hep TAM çizilir; çalınmış kısmı üstündeki maske
              (WaveFill) açar. İki katman aynı geometriden beslenmeli. */}
          <View style={[BARS_ROW, { width: waveW }]}>
            {bars.map((peak, i) => (
              <View
                key={i}
                style={{
                  width: BAR_W,
                  height: barHeight(peak),
                  borderRadius: BAR_W / 2,
                  backgroundColor: barOff,
                }}
              />
            ))}
          </View>
          {isCurrent && (
            <WaveFill bars={bars} color={barOn} waveW={waveW} />
          )}

          {/* Süre: sol kenarı şeridin bittiği yerden RIGHT_COL_GAP kadar sonra
              — yani oynat tuşuyla şerit arasındaki boşluğun aynısı. YATAYDA HİÇ
              KIMILDAMAZ; kapsül gelince yalnız dikey ortadan DURATION_LIFT kadar
              kalkıp ona yer açar. Kutunun içinde mutlak durduğu için balonun
              boyu değişmez. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: waveW + RIGHT_COL_GAP,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              transform: [{ translateY: durationLift }],
            }}
          >
            <Text
              onLayout={(e) => {
                const w = Math.round(e.nativeEvent.layout.width);
                if (w > 0 && w !== durationW) setDurationW(w);
              }}
              style={{
                color: dim,
                fontSize: 13,
                // Sabit satır yüksekliği: yığın hesabı (14 + 1 + 15 = 30) buna
                // dayanıyor, cihazın varsayılan satır aralığına bırakılamaz.
                lineHeight: DURATION_LINE_H,
                fontVariant: ["tabular-nums"],
              }}
            >
              {/* Çalarken kalan süre, dururken toplam süre (WhatsApp davranışı). */}
              {formatVoiceDuration(
                positionMs > 0 ? Math.max(0, totalMs - positionMs) : totalMs,
              )}
            </Text>
          </Animated.View>

          {/* Hız kapsülü: sürenin TAM ALTINDA, dalga kutusunun alt kenarına
              dayalı. Duraklatınca kalır — yoksa her duraklatmada süre bir aşağı
              bir yukarı zıplardı. */}
          {rateMounted && (
            <Animated.View
              style={{
                position: "absolute",
                // Sürenin merkezine hizalı: kapsül daha geniş olduğu için yarım
                // fark kadar SOLA kaydırılıyor. Kayan taraf bu, süre değil.
                left: waveW + RIGHT_COL_GAP - centerShift,
                bottom: RATE_BOTTOM,
                opacity: rateOpacity,
                transform: [{ translateY: rateSlide }],
              }}
            >
              <Pressable
                onPress={onCycleRate}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${rate}x`}
              >
                {({ pressed }) => (
                  <View
                    onLayout={(e) => {
                      const w = Math.round(e.nativeEvent.layout.width);
                      if (w > 0 && w !== rateW) setRateW(w);
                    }}
                    style={{
                      paddingHorizontal: RATE_PAD_H,
                      paddingVertical: RATE_PAD_V,
                      // Kapsül: yarıçap = yüksekliğin yarısı.
                      borderRadius: RATE_H / 2,
                      backgroundColor: isOwn
                        ? "rgba(255,255,255,0.22)"
                        : colors.surface3,
                      opacity: pressed ? 0.7 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: tint,
                        fontSize: 13,
                        lineHeight: RATE_LINE_H,
                        fontWeight: "600",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {rate}x
                    </Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

export default memo(VoiceBubble);
