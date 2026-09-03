import { memo, useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { ChevronUp, Lock, LockOpen, Trash2, ArrowUp } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { WAVE_BARS, WAVE_EMPTY } from "@/features/chat/useVoiceRecorder";
import {
  composerBlurTint,
  composerBarBg,
  COMPOSER_ACTION_W,
  COMPOSER_BAR_PAD_H,
  COMPOSER_BAR_PAD_V,
  COMPOSER_GAP,
} from "@/features/chat/components/composerStyle";
import { glassColorScheme, hasLiquidGlassSurface } from "@/shared/theme/glass";
import { colors, isLight, withAlpha } from "../../../shared/theme/colors";

/**
 * Kilit eşiği — parmağın basış noktasından bu kadar YUKARI çıkması kilitler.
 *
 * İPTAL ARTIK EŞİKLE DEĞİL: "sola 90pt kaydır" kuralı kaldırıldı, kayıt çöp
 * kutusunun üstünde bırakılınca siliniyor (bkz. VoiceLockedActions >
 * onTrashRect). Eski kural, görünen çöp kutusuna ulaşmadan çok önce tetikleniyor
 * ve kullanıcı sürüklemesinin karşılığını göremiyordu.
 */
export const LOCK_DY = 64;
/**
 * Kilidi GERİ AÇMA eşiği — kilitlendikten sonra parmak bu seviyenin altına
 * inerse kilit açılır ve jest normal basılı-tut hâline döner (bırakış = gönder).
 * Kilitleme eşiğinden BELİRGİN biçimde düşük olması şart: iki eşik aynı olsaydı
 * parmak sınırın üstünde titrerken kilit açılıp kapanır, haptik de her seferinde
 * yeniden atardı. Aradaki fark histerezis.
 */
export const UNLOCK_DY = Math.round(LOCK_DY * 0.55);
/** Çöp kutusunun sürükleme hedefi olarak büyütüldüğü pay. */
export const TRASH_HIT_PAD = 16;
/**
 * Parmak çöp kutusunun üstündeyken beliren kırmızı diskin çapı. Aksiyon
 * kapsülünden (48pt) BÜYÜK, bilerek: uyarı sürükleyen parmağın altından
 * taşmalı. Bu yüzden disk kapsülün içine değil üstüne, kırpmayan bir kardeş
 * katmana çiziliyor (kapsülün overflow'u kalkamaz, BlurView'ın köşesi ona
 * bağlı).
 */
const TRASH_HALO = 64;
/**
 * Aksiyon sırasındaki butonların yüksekliği — yazma çubuğundaki emoji/gönder
 * kutularıyla aynı (33×32, bkz. MessageComposer). İki kapsül alt alta durduğu
 * için ölçüleri ayrışırsa alttaki "başka bir uygulamadan" gibi duruyor.
 */
const ACTION_H = 32;
/**
 * Nabzın soldan payı — kenardan nefes alsın. Sağda karşılığı YOK: dalga şeridi
 * kapsülün iç kutusunun sağ ucuna kadar dayanıyor, yoksa çubukların bittiği
 * yerde göze çarpan bir boşluk kalıyordu. (Geriye yalnız kapsülün kendi 8pt'si
 * kalır — emoji/gönder butonlarıyla aynı eksen.)
 */
const ROW_INSET = 10;
/**
 * Kilit kapsülünün genişliği — composer onu mikrofonun tam üstüne hizalıyor.
 * Mikrofon kutusundan (33) belirgin biçimde geniş: kapsül jestin TEK ipucu,
 * dar hâlinde (40) parmağın altında kaybolup fark edilmiyordu.
 */
export const LOCK_PILL_W = 52;

/** Dalganın solundaki nabız noktasının çapı. */
const PULSE_DOT = 9;
/** Nabzın tek yönlü süresi (gidiş-dönüş iki katı). */
const PULSE_MS = 620;
/** Nokta ile dalganın başlangıcı arasındaki boşluk. */
const DOT_GAP = 7;
/** Sayacın taban genişliği — "m:ss" tabular-nums ile sabit. */
const DURATION_W = 44;

// Çubuk ölçüleri BALONDAKİYLE aynı (VoiceBubble): kalınlık 4, ara 2, taban 4.
// Kayıt sırasında gördüğün dalga ile mesaja dönüşünce gördüğün dalga aynı
// malzeme olsun — ayrı ölçüler "kaydettiğim şey bu değil" hissi veriyordu.
const BAR_W = 4;
const BAR_GAP = 2;
/**
 * Çubuk tavanı. Şerit dikey ORTADAN büyüyor (satır alignItems: center), yani
 * bu değer dalgayı alttan ve üstten eşit uzatıyor.
 *
 * 30 = çubuğun 32pt'lik İÇERİK kutusuna iki yanda 1'er pt payla sığan en büyük
 * değer; taşarsa kapsülün overflow:hidden'ı tepeleri keser. Balondaki 44
 * DENENDİ ve geri alındı: sığması için yazma çubuğunun kayıt boyunca 44'ten
 * 62'ye büyümesi gerekiyordu ve panel o hâlde fazla iri duruyordu.
 */
const BAR_MAX_H = 30;
const BAR_MIN_H = 4;
/**
 * Sessiz/gürültülü farkını açan üs. Balondakinden (1.8) DÜŞÜK, bilerek:
 *
 * Balon dalgayı mesaj içinde NORMALİZE ediyor (resampleWaveformPeaks — en
 * yüksek çubuk tavana oturuyor), canlı dalganın böyle bir şansı yok; kayan
 * pencerede normalize etmek sessiz anlarda uğultuyu tavana çıkarırdı. Aynı üs
 * kullanılınca canlı şerit balondan sistematik olarak bastık kalıyordu: normal
 * konuşma seviyesi (~0.5) 1.8'de tavanın %29'una, 1.4'te %38'ine denk geliyor.
 * Yani düşük üs, iki dalgayı AYIRAN değil YAKLAŞTIRAN yön.
 */
const BAR_GAMMA = 1.4;
/** Bir çubuğun kapladığı yatay adım — sığan çubuk sayısı buradan hesaplanıyor. */
const BAR_PITCH = BAR_W + BAR_GAP;
/**
 * İKİ UÇTAKİ sönümleme bandının genişliği. Bandın içindeki çubuk, boyu ne
 * olursa olsun ekran konumuyla orantılı olarak küçülüyor: dalga sağ uçtan
 * sıfırdan büyüyerek giriyor, sol uçta (nabzın hemen sağında) kesilmek yerine
 * büzülerek bitiyor. Simetrik olması şart — tek uçta olsaydı bant bir yanı
 * traşlı görünürdü.
 */
const FADE_W = BAR_PITCH * 3;
/** Kaymanın tavanı — sönümleme bandının hangi çubukları kapsadığını da bu belirler. */
const SLIDE_MAX = BAR_PITCH * 2;
/**
 * Kayma süresi = ÖLÇÜLEN örnek periyodu × bu pay. Payın 1'den büyük olması şart:
 * tam periyot verilirse animasyon bir sonraki örnek gelmeden bitiyor ve şerit
 * her turda birkaç ms duruyor.
 *
 * Sabit süre (VOICE_TICK_MS × pay) DEĞİL, çünkü ticker JS thread'inde dönüyor:
 * sohbet listesi kaydırılırken tur 50ms yerine 150-200ms'ye çıkıyor ve sabit
 * süreli kayma erkenden bitip her örnek arasında DONUYOR — kaydırırken görülen
 * "kasma/duraksama" buydu. Ölçülen periyoda bağlanınca kayma yavaşlıyor ama
 * kesintisiz kalıyor; göz yavaşlamayı değil donmayı fark ediyor.
 */
const SLIDE_RATIO = 1.4;

/**
 * TEK ÇUBUK — GERÇEK yükseklik, üstünde animasyon YOK.
 *
 * İkisi de bilinçli ve birbirine bağlı:
 *
 *  • scaleY DEĞİL height: ölçek, çubuğun yuvarlak uçlarını da eziyor. 26pt'lik
 *    kutu 4pt'ye inince 2pt'lik yarıçap 0.3pt'ye düşüyor, yani sessiz çubuklar
 *    kapsül değil KARE görünüyordu. Balondaki dalga (VoiceBubble) gerçek
 *    yükseklikle çiziliyor; aynı malzeme olsun diye burası da öyle.
 *
 *  • withTiming YOK: yatay akışkanlığı zaten şeridin kayması sağlıyor (bkz.
 *    LiveWaveform). Üstüne bir de çubuk başına yumuşatma binince her çubuk bir
 *    önceki komşusunun boyuna "yetişmeye" çalışıyor ve şeridin sağ ucundaki YENİ
 *    çubuk, sola kayarken aşağı-yukarı oynuyordu. Boy anında yazılınca kayma
 *    dizinin kaymasının tam karşılığı oluyor: bant sıçramasız akıyor, tepe
 *    örneklendiği boyla giriyor.
 *
 * Layout prop'u olduğu için her örnekte (saniyede 20) shadow tree commit'i var
 * — 60fps'lik sürekli bir commit akışı DEĞİL, çubuk boyu yalnız yeni örnek
 * geldiğinde değişiyor.
 *
 * ÖRNEĞİ OLMAYAN slot HİÇ ÇİZİLMEZ (boy 0): tampon WAVE_EMPTY ile başlıyor ve
 * örnekler sondan eklendiği için şerit sağdan sola yazılıyor. Boş slotu taban
 * boyuyla çizmek, kayıt daha başlamadan şerit boyunca duran sahte bir dalga
 * (placeholder nokta dizisi) bırakıyordu.
 */
function WaveBar({
  wave,
  index,
  ink,
}: {
  wave: SharedValue<number[]>;
  index: number;
  /** Çubuk rengi — zemine göre çağıran seçiyor (bkz. VoiceRecordingRow). */
  ink: string;
}) {
  const style = useAnimatedStyle(() => {
    const raw = wave.value[index] ?? WAVE_EMPTY;
    const v = Math.min(1, Math.max(0, raw));
    return {
      height:
        raw < 0 ? 0 : Math.max(BAR_MIN_H, Math.pow(v, BAR_GAMMA) * BAR_MAX_H),
    };
  });
  return (
    <Animated.View
      style={[
        {
          width: BAR_W,
          // Çubuklar taşarken küçülmesin: taşan uç KIRPILMALI (aşağıdaki
          // overflow), daralmamalı — yoksa adım bozulur, şerit titrer.
          flexShrink: 0,
          borderRadius: BAR_W / 2,
          // Renk ZEMİNE bağlı, sabit DEĞİL: düz turuncu dolgunun üstünde medya
          // mürekkebi (iki modda da beyaz — `textSecondary` orada
          // kayboluyordu), renksiz camın üstünde tema mürekkebi. Kararı
          // composer veriyor, o hangi yüzeyin çizildiğini bilen tek yer.
          backgroundColor: ink,
        },
        style,
      ]}
    />
  );
}

/**
 * UÇLARDAKİ çubuk — sağ bantta sıfırdan büyüyerek girer, sol bantta eriyerek
 * çıkar. Aradaki çubuklar bu sarmalayıcıyı hiç kullanmaz.
 *
 * Sönüm çarpanı çubuğun EKRAN konumundan hesaplanıyor (`x + slide`), tampon
 * indeksinden değil. Kritik olan bu: kayma anında dizi bir slot sola kayarken
 * şerit bir adım sağa alınıyor, yani bir örneğin ekrandaki yeri kesintisiz
 * sola gidiyor. Sönüm de o konumun fonksiyonu olunca örnek, banda girerken
 * kare kare büyüyor, çıkarken kare kare küçülüyor — indekse bağlasaydık örnek
 * başına bir basamak zıplardı.
 *
 * İKİ KATMAN bilinçli: dıştaki yalnız `slide`i okuyup scaleY yazıyor (her
 * karede, transform → layout'a dokunmuyor), içteki yalnız `wave`i okuyup boy
 * yazıyor (örnek başına). Tek katmanda birleşseydi boy da her karede yeniden
 * yazılır, saniyede 120 layout commit'i çıkardı.
 */
function FadingWaveBar({
  wave,
  index,
  slide,
  x,
  width,
  ink,
}: {
  wave: SharedValue<number[]>;
  index: number;
  ink: string;
  slide: SharedValue<number>;
  /** Çubuğun kap içindeki (kayma hariç) sol kenarı. */
  x: number;
  /** Kabın genişliği — sağ bandın nerede başladığını bu belirliyor. */
  width: number;
}) {
  const fade = useAnimatedStyle(() => {
    // Çubuğun ekrandaki ORTASI: iki uca olan uzaklığın küçüğü çarpanı verir.
    const c = x + BAR_W / 2 + slide.value;
    const ramp = Math.min(c, width - c) / FADE_W;
    return { transform: [{ scaleY: Math.min(1, Math.max(0, ramp)) }] };
  });
  return (
    <Animated.View
      style={[
        {
          width: BAR_W,
          height: BAR_MAX_H,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
        },
        fade,
      ]}
    >
      <WaveBar wave={wave} index={index} ink={ink} />
    </Animated.View>
  );
}

/**
 * Canlı dalga formu — çubuk yükseklikleri shared value'dan okunur, React her
 * örnekte yeniden render ETMEZ (saniyede 20 render = klavye açıkken görülebilir
 * bir takılma demekti).
 *
 * Çubuk SAYISI ölçülen genişlikten geliyor: sabit sayı, geniş cihazda şeridi
 * kısa bırakıp süre sayacıyla dalga arasında ölü boşluk açıyordu. Sığan sayı
 * yukarı yuvarlanıp üstüne iki çubuk ekleniyor (taşan uçlar kırpılıyor)
 * → şerit her telefonda süreye kadar dayanır ve kayma sırasında sol uçta
 * boşluk açılmaz. Kap tamponun kaldıramayacağı kadar genişse (iPad) şerit sağa
 * yaslanır; kalabalık ekranın hatırına çubuk aralarını açmıyoruz, adımın sabit
 * olması kaymanın koşulu.
 *
 * ŞERİT AKAR: her yeni örnekte dizi bir slot sola kayıyor, aynı anda şerit bir
 * adım SAĞA alınıp 0'a süzülüyor. İkisi birbirinin tam karşılığı olduğu için
 * kaymanın olduğu kare bir öncekiyle aynı görünür — göz sıçrama değil, sağdan
 * sola akan bir bant görür. Kaydın ilk saniyesinde de böyle: tampon WAVE_EMPTY
 * dolu, çubuklar sağ uçtan tek tek girer. Sol uçtakiler ise kesilmeden, bandın
 * içinde küçülerek çıkar (bkz. FADE_W / FadingWaveBar).
 */
export const LiveWaveform = memo(function LiveWaveform({
  wave,
  tickMs,
  ink,
}: {
  wave: SharedValue<number[]>;
  tickMs: SharedValue<number>;
  /** Çubuk rengi — zemine göre (bkz. VoiceRecordingRow). */
  ink: string;
}) {
  const [width, setWidth] = useState(0);
  // Ölçüm gelmeden çubuk sayısı bilinmiyor. GERİ ÇEKİLME: tamponun tamamını
  // çiz, sönümlemeyi atla. Ölçüm bir sebeple hiç gelmezse (onLayout kaçarsa)
  // şerit BOŞ kalmasın — sağa yaslı, solu kırpılmış eski hâli çalışır.
  const measured = width > 0;
  // Sığan sayı + 2: fazladan iki çubuk, şeridi kaymanın tavanı (2 adım) kadar
  // kaptan geniş tutuyor — sola kayarken sol uçta boşluk açılmıyor.
  const fits = measured
    ? Math.ceil((width + BAR_GAP) / BAR_PITCH) + 2
    : WAVE_BARS;
  const count = Math.min(WAVE_BARS, fits);

  const slide = useSharedValue(0);
  useAnimatedReaction(
    () => wave.value,
    () => {
      // Sıfırlamak yerine ÜSTÜNE eklemek şart: ticker gecikirse önceki kayma
      // henüz bitmemiş olabiliyor, mutlak atama o karede geriye zıplatırdı.
      // Tavan iki adım — sürekli geciken bir ticker'da şerit sağa kaçmasın.
      slide.value = Math.min(SLIDE_MAX, slide.value + BAR_PITCH);
      // `tickMs` burada, `prepare`da DEĞİL okunuyor: mapper'ın bağımlılıkları
      // yalnız prepare'ın closure'ından çıkıyor (Reanimated), yani bu okuma
      // reaksiyonu tetiklemiyor — tetikleseydi tek örnek için iki kayma
      // başlar ve şerit sıçrardı.
      slide.value = withTiming(0, {
        duration: tickMs.value * SLIDE_RATIO,
        easing: Easing.linear,
      });
    },
  );
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
  }));

  return (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        // Sadece çubuk sayısını değiştiren ölçüde render: onLayout dönüş
        // ekranı/klavye açılışında birden çok kez tetiklenebiliyor.
        setWidth((prev) =>
          Math.round(prev / BAR_PITCH) === Math.round(w / BAR_PITCH) ? prev : w,
        );
      }}
      style={{
        flex: 1,
        height: BAR_MAX_H,
        justifyContent: "center",
        // Kayan şeridin iki ucu da burada kırpılıyor: yeni çubuk sağ kenardan
        // girer, en eski sol kenardan çıkar.
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            flexDirection: "row",
            // Şerit SABİT yükseklikte: çubuk boyları değiştikçe kutu büyüyüp
            // küçülmesin, çubuklar 26pt'lik bandın ortasına hizalansın.
            height: BAR_MAX_H,
            alignItems: "center",
            // En YENİ çubuk sağ uca dayanır, en eskiler soldan taşar.
            justifyContent: "flex-end",
            gap: BAR_GAP,
          },
          stripStyle,
        ]}
      >
        {Array.from({ length: count }, (_, i) => {
          // Tamponun SON `count` örneği: en yenisi daima sağda kalsın.
          const barIndex = WAVE_BARS - count + i;
          // Şerit sağa yaslı ve kaptan geniş → ilk çubuğun sol kenarı eksiye
          // düşer. Sönümleme bandına giren çubuklar konumlarını biliyor.
          const x = width - (count * BAR_PITCH - BAR_GAP) + i * BAR_PITCH;
          const c = x + BAR_W / 2;
          // Sol bant: kayma çarpanı YALNIZ büyüttüğü için sınır tam FADE_W.
          // Sağ bant: kayma çubuğu sağa ittiğinden bir kayma tavanı kadar
          // erken başlamalı, yoksa bandın dışında kalan çubuk kırpılırdı.
          return measured && (c < FADE_W || c > width - FADE_W - SLIDE_MAX) ? (
            <FadingWaveBar
              key={i}
              wave={wave}
              index={barIndex}
              slide={slide}
              x={x}
              width={width}
              ink={ink}
            />
          ) : (
            <WaveBar key={i} wave={wave} index={barIndex} ink={ink} />
          );
        })}
      </Animated.View>
    </View>
  );
});

/** Kapsülün dikey iç boşluğu ve ikonlar arası — ölçüyü bunlar belirliyor. */
const LOCK_PILL_PAD_V = 14;
const LOCK_PILL_GAP = 8;
/** Parmak eşiği geçtikten SONRA da kapsülün çıkabileceği en yüksek nokta. */
const LOCK_LIFT_MAX = 52;
/** Parmağın yolunun ne kadarını kapsül izliyor (1 = birebir). */
const LOCK_LIFT_RATIO = 0.45;

/**
 * Parmağın ÜSTÜNDE beliren kilit tutamağı (WhatsApp'taki dikey kapsül).
 * Parmak mikrofonun üstünde durduğu için kapsül de oraya, bardan hemen yukarıya
 * hizalanır — yani basılı tutan parmağın hemen üstünde. Parmak yukarı çıktıkça
 * kapsül de yükselir ama ondan YAVAŞ (aradaki mesafe kapanır).
 *
 * KİLİTLENDİKTEN SONRA KAYBOLMAZ: ikon açık kilitten kapalıya döner ve kapsül
 * parmak ekranda kaldığı sürece durur, parmakla yükselmeye de devam eder.
 * Eskiden eşik geçilir geçilmez bir anda yok oluyordu — jestin karşılığı
 * görünmüyor, "oldu mu olmadı mı" belli olmuyordu. Görünürlük artık kaydın
 * kilitli olup olmadığına değil PARMAĞIN EKRANDA olup olmadığına bağlı
 * (bkz. MessageComposer > holdActive).
 *
 * YÜKSELME translateY DEĞİL marginBottom ile: içeride cam (GlassView) var ve
 * ata zincirindeki kimliksel olmayan bir transform camı sessizce hiç render
 * ettirmiyor (aynı sebeple kapsülün opaklığı da animasyonsuz — bkz.
 * shared/theme/glass.ts ve GlassView tuzağı notları).
 */
export const VoiceLockPill = memo(function VoiceLockPill({
  dragY,
  right,
  locked,
}: {
  dragY: SharedValue<number>;
  right: number;
  /** Eşik geçildi — parmak hâlâ ekranda ama kayıt artık kilitli. */
  locked?: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    marginBottom:
      8 + Math.min(LOCK_LIFT_MAX, Math.max(0, -dragY.value) * LOCK_LIFT_RATIO),
  }));
  // Ok kilitlenince söner ama KUTUSU KALIR: sökseydik kapsül aynı anda
  // kısalıp zıplardı. Sönme animasyonlu — kilit anında iki ikon birden
  // değişmesin, önce kilit kapanıp sonra ok çekilsin.
  const chevronStyle = useAnimatedStyle(() => ({
    opacity: withTiming(
      locked ? 0 : interpolate(-dragY.value, [0, LOCK_DY], [1, 0.25], "clamp"),
      { duration: 160 },
    ),
  }));

  const glass = hasLiquidGlassSurface();
  const inner = {
    width: LOCK_PILL_W,
    alignItems: "center" as const,
    paddingVertical: LOCK_PILL_PAD_V,
    gap: LOCK_PILL_GAP,
    // Yarıçap genişliğin yarısı ve eğri DAİRESEL: `continuous` squircle'ı
    // uçları hafifçe düzleştirip kapsülü tam yuvarlak olmaktan çıkarıyor.
    borderRadius: LOCK_PILL_W / 2,
  };
  const icons = (
    <>
      <SFIcon
        // Açık kilit "yukarı çek, kilitlenecek" diyor; eşik geçilince kapanıyor
        // ve dolu hâline dönüyor — jestin karşılığı ikonun kendisi.
        name={locked ? "lock.fill" : "lock.open"}
        fallback={locked ? Lock : LockOpen}
        size={22}
        strokeWidth={2}
        weight={locked ? "semibold" : "regular"}
        color={colors.text}
        fill={locked ? colors.text : undefined}
      />
      <Animated.View style={chevronStyle}>
        <SFIcon
          name="chevron.up"
          fallback={ChevronUp}
          size={16}
          strokeWidth={2.5}
          color={colors.textSecondary}
        />
      </Animated.View>
    </>
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          right,
          // Kapsül, kayıt panelinin (çubuk + alt aksiyon sırası) TAM ÜSTÜNDE
          // yüzer. Yüzde: panelin yüksekliği duruma göre değişiyor (alt sıra
          // basılı tutarken de açık), sabit bir `bottom` her değişiklikte
          // elle güncellenmek zorunda kalırdı.
          bottom: "100%",
        },
        style,
      ]}
    >
      {glass ? (
        // Cam yolunda dolgu/kenarlık YOK ve `overflow: hidden` YOK: ikisi de
        // kırılmayı öldürüp kapsülü düz bir dikdörtgene çeviriyor, köşeyi zaten
        // native cornerConfiguration çiziyor (bkz. ToastShell).
        <GlassView
          glassEffectStyle="regular"
          tintColor={lockGlassTint()}
          colorScheme={glassColorScheme()}
          style={inner}
        >
          {icons}
        </GlassView>
      ) : (
        <BlurView
          intensity={60}
          tint={composerBlurTint()}
          style={{
            ...inner,
            overflow: "hidden",
            backgroundColor: composerBarBg(),
          }}
        >
          {icons}
        </BlurView>
      )}
    </Animated.View>
  );
});

/**
 * Camın tint'i — dolgu DEĞİL, camın kendi rengine verilen hafif eğim. Kapsül
 * sohbet listesinin (fotoğraflı balonlar) üstünde duruyor; sıfır tint'te ikon
 * yıkanıyor. Kontrast sorununu dolgu ekleyerek değil bu alfayı oynatarak çöz.
 */
function lockGlassTint() {
  return isLight() ? withAlpha(colors.surface, 0.2) : withAlpha(colors.bg, 0.2);
}

/** Diskin açılma/kapanma süreleri — açılış bilerek daha uzun. */
const HALO_IN_MS = 220;
const HALO_OUT_MS = 140;

/**
 * "Bırakırsan silinir" uyarısı — çöp kutusunun üstünde büyüyen kırmızı disk.
 *
 * Kapsülün İÇİNDE değil ÜSTÜNDE, kardeş katman olarak: kapsülün `overflow`u
 * (BlurView'ın köşesi ona bağlı, kaldırılamaz) diski kenarlarından kırpıyordu,
 * oysa uyarının sürükleyen parmağın altından taşacak kadar büyük olması
 * gerekiyor. Diskin merkezi çöp kutusununkiyle aynı eksende (kapsül dolgusu +
 * kutu genişliğinin yarısı), dikeyde yüzdeyle ortalı — kapsül yükselse de
 * hizalı kalır.
 *
 * DAİMA MONTE, görünürlük animasyonla: koşullu render'da disk bir anda
 * beliriyordu ve kapanışı hiç animasyonlanmıyordu. Ölçekle+opaklıkla açılıyor
 * (cam değil, düz bir View — alfa serbest). Jestten tamamen soyut
 * (pointerEvents none): çöp kutusunun ölçülen sürükleme dikdörtgenine
 * karışsaydı hedef, uyarı belirdiği anda kendi kendine kayardı.
 */
const TrashHalo = memo(function TrashHalo({ active }: { active?: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(active ? 1 : 0, {
      duration: active ? HALO_IN_MS : HALO_OUT_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    // Sıfırdan değil 0.55'ten: sıfır ölçek "patlayarak" açılıyor, buradan
    // başlayınca disk çöp kutusunun etrafında büyüyormuş gibi duruyor.
    transform: [{ scale: 0.55 + p.value * 0.45 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: COMPOSER_BAR_PAD_H + COMPOSER_ACTION_W / 2 - TRASH_HALO / 2,
          top: "50%",
          marginTop: -TRASH_HALO / 2,
          width: TRASH_HALO,
          height: TRASH_HALO,
          borderRadius: TRASH_HALO / 2,
          backgroundColor: colors.errorStrong,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {/* Kırmızı diskin üstünde ikon MEDYA mürekkebiyle: açık modda da beyaz
          kalır, yoksa koyu ikon kırmızıda okunmuyor. */}
      <SFIcon
        name="trash"
        fallback={Trash2}
        size={26}
        strokeWidth={2}
        color={colors.onMedia}
      />
    </Animated.View>
  );
});

/**
 * Kayıttaki alt sıra: sil / duraklat / gönder. Kayıt başlar başlamaz açılır;
 * parmak ekrandayken dokunulamaz (bkz. MessageComposer) ama çöp kutusu o sırada
 * SÜRÜKLEME HEDEFİ olarak çalışır — jest parmağın oraya girip girmediğini
 * ekran koordinatından anlıyor, bu yüzden kutunun pencere içindeki dikdörtgeni
 * ölçülüp yukarı bildiriliyor.
 */
export const VoiceLockedActions = memo(function VoiceLockedActions({
  durationText,
  onCancel,
  onSend,
  cancelLabel,
  sendLabel,
  onTrashRect,
  trashActive,
}: {
  /** Kayıt süresi — kayıt çubuğunda DEĞİL burada, ortadaki yuvada. */
  durationText: string;
  onCancel: () => void;
  onSend: () => void;
  cancelLabel: string;
  sendLabel: string;
  /** Çöp kutusunun PENCERE koordinatındaki dikdörtgeni (sürükleme hedefi). */
  onTrashRect?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  /** Parmak şu an çöp kutusunun üstünde — bırakırsa kayıt silinir. */
  trashActive?: boolean;
}) {
  const trashRef = useRef<View>(null);
  // Ölçüm bir kez onLayout'ta alınıyor ama ilk denemede 0 dönebiliyor (view
  // henüz pencereye bağlanmamış olabilir) — o durumda birkaç kez tekrar denenir.
  // Ölçüm gelmezse çöp kutusu sürükleme hedefi olarak ÇALIŞMAZ, sessizce.
  useEffect(() => {
    if (!onTrashRect) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      if (cancelled) return;
      trashRef.current?.measureInWindow?.((x, y, width, height) => {
        if (cancelled) return;
        if (width > 0 && height > 0) {
          onTrashRect({ x, y, width, height });
        } else if (++tries < 5) {
          timer = setTimeout(measure, 60);
        }
      });
    };
    measure();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onTrashRect]);
  return (
    // Sarmalayıcı KIRPMIYOR: çöp diski kapsülün dışına taşabilsin diye. Kapsülün
    // kendi overflow'u köşeyi yuvarlamak için duruyor, o yüzden disk kapsülün
    // İÇİNDE değil ÜSTÜNDE, kardeş katman olarak çiziliyor.
    <View style={{ marginTop: COMPOSER_GAP }}>
      <View
        style={{
          // YÜZEY YOK: ne dolgu ne cam. Sıra doğrudan sohbetin üstünde duruyor,
          // yalnız ikonlarıyla görünüyor. Kayıt çubuğu zaten dolu bir renk;
          // altına ikinci bir yüzey koyunca panel iki katı ağırlıkta bir blok
          // gibi okunuyordu (açık modda beyaz bir kutu, camda ise bulanık bir
          // şerit). Ölçüler yazma çubuğuyla aynı kalıyor ki iki sıra hizalı
          // dursun.
          minHeight: 44,
          paddingHorizontal: COMPOSER_BAR_PAD_H,
          paddingVertical: COMPOSER_BAR_PAD_V,
          flexDirection: "row",
          alignItems: "center",
          // Uçtaki iki kutu, çubuktaki emoji/gönder butonlarıyla AYNI eksenlere
          // oturur (ikisi de kenar boşluğuna dayalı).
          justifyContent: "space-between",
        }}
      >
        <View
          ref={trashRef}
          // Ölçüm onLayout'ta DEĞİL measureInWindow ile: jest ekran koordinatı
          // üretiyor, onLayout ise ebeveyne göreli konum veriyor.
          onLayout={() => {
            trashRef.current?.measureInWindow?.((x, y, width, height) => {
              if (width > 0 && height > 0)
                onTrashRect?.({ x, y, width, height });
            });
          }}
        >
          <Pressable
            onPress={onCancel}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            {({ pressed }) => (
              <View
                style={{
                  // Çubuktaki emoji/gönder kutularıyla aynı ölçü.
                  width: COMPOSER_ACTION_W,
                  height: ACTION_H,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.6 : 1,
                }}
              >
                {/* Parmak hedefin üstündeyken bu ikonun üstünü kırmızı disk
                  tamamen kapatıyor (aşağıdaki katman) — burada bir "sıcak" hâl
                  YOK, iki yerde ayrı ayrı boyamak ikisini ayrıştırırdı. */}
                <SFIcon
                  name="trash"
                  fallback={Trash2}
                  size={22}
                  strokeWidth={2}
                  color={colors.text}
                />
              </View>
            )}
          </Pressable>
        </View>

        {/* Sıranın ortası: DURAKLAT DEĞİL süre. Duraklatma kaldırıldı —
            60 saniyelik bir kayıtta ara vermenin karşılığı yoktu ve buton,
            gönderle aynı ağırlıkta üçüncü bir hedef olarak sırayı
            kalabalıklaştırıyordu. Sayaç buraya taşındı: kayıt çubuğunun
            içinde hem sayaç hem dalga varken dalgaya kalan yer daralıyordu. */}
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontVariant: ["tabular-nums"],
            minWidth: DURATION_W,
            textAlign: "center",
          }}
        >
          {durationText}
        </Text>

        <Pressable
          onPress={onSend}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
        >
          {({ pressed }) => (
            <View
              style={{
                width: COMPOSER_ACTION_W,
                height: ACTION_H,
                borderRadius: 16,
                backgroundColor: colors.messageOwn,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              }}
            >
              <SFIcon
                name="arrow.up"
                fallback={ArrowUp}
                size={20}
                strokeWidth={2}
                weight="semibold"
                color={colors.onMedia}
              />
            </View>
          )}
        </Pressable>
      </View>

      {/* Kapsülün DIŞINA taşan silme uyarısı — konum/animasyon TrashHalo'da. */}
      <TrashHalo active={trashActive} />
    </View>
  );
});

/**
 * "Kayıt sürüyor" nabzı — dalga şeridinin solunda atan nokta.
 *
 * Rengi MEDYA mürekkebi (iki modda da beyaz): kayıt çubuğunun zemini kayıt
 * boyunca dolu balon rengi, yani nokta da o yüzeyin üstündeki her şey gibi
 * `onMedia`. Renk render'da okunuyor, modül seviyesinde DEĞİL — palet tema ile
 * mutasyona uğruyor (bkz. theme/colors.ts).
 *
 * Duraklatınca nabız durur ve nokta sabit kalır: hareket "kayıt akıyor" demek,
 * duraklamış kayıtta yalan söylerdi. Duraklatma şu an UI'da açık DEĞİL (alt
 * sıradaki buton kalktı, yerini sayaç aldı) — kanca hâlâ destekliyor, geri
 * gelirse burası hazır.
 */
export const VoicePulseDot = memo(function VoicePulseDot({
  paused,
  ink,
}: {
  paused?: boolean;
  /** Nokta rengi — dalga çubuklarıyla AYNI mürekkep (bkz. VoiceRecordingRow). */
  ink: string;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (paused) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 180 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    // Sonsuz döngü kayıt bitince MUTLAKA kesilir: opaklık/ölçek layout'a
    // dokunmuyor ama boşuna dönen bir animasyon UI thread'inde kalır.
    return () => cancelAnimation(pulse);
  }, [paused, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value * 0.6,
    transform: [{ scale: 1 - pulse.value * 0.22 }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: PULSE_DOT,
          height: PULSE_DOT,
          borderRadius: PULSE_DOT / 2,
          backgroundColor: ink,
          marginRight: DOT_GAP,
        },
        style,
      ]}
    />
  );
});

/**
 * Kapsülün içindeki kayıt satırı: nabız noktası + süre + canlı dalga formu.
 *
 * TEK görünüm — parmak ekranda olsun (holding) ya da kilitlenmiş olsun aynı
 * satır çiziliyor. Eskiden basılı tutarken ayrı bir "ilk hal" vardı (nabız atan
 * mikrofon + "iptal için kaydır" ipucu) ve kilide geçince satır tamamen
 * değişiyordu; kayıt görsel olarak iki kez kuruluyor gibi okunuyordu. Artık
 * kilit sadece parmağın kalkıp kalkmadığını belirliyor, kaydın görüntüsünü
 * değil.
 *
 * İptal artık kaydırma eşiğiyle değil, parmağı çöp kutusunun üstünde bırakarak
 * yapılıyor (bkz. VoiceLockedActions > onTrashRect) — o yüzden burada "iptal
 * için kaydır" ipucu yok.
 */
export const VoiceRecordingRow = memo(function VoiceRecordingRow({
  wave,
  tickMs,
  paused,
  ink,
}: {
  wave: SharedValue<number[]>;
  tickMs: SharedValue<number>;
  paused?: boolean;
  /**
   * Nabız + dalga mürekkebi. ZEMİNİ ÇİZEN KARAR VERİR (bkz. MessageComposer):
   * kayıt zemini 26+'da renksiz cam, altında düz turuncu dolgu. Turuncu bir
   * MEDYA yüzeyi olduğu için orada mürekkep `onMedia` (iki modda da beyaz);
   * camda tema mürekkebi (`text`) şart — beyaz çubuklar açık modda camın
   * içinde siliniyordu. Burada `colors`tan seçmiyoruz: bu bileşen hangi
   * yüzeyin çizildiğini bilmiyor.
   */
  ink: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: ROW_INSET,
      }}
    >
      {/* Nabız şeridin EN SOLUNDA; dalga onun hemen sağından başlıyor ve
          sonuna kadar gidiyor. Sayaç bu satırda DEĞİL, alt sırada (bkz.
          VoiceLockedActions) — çubuğun içinde hem sayaç hem dalga varken
          dalgaya kalan yer görünür biçimde daralıyordu. */}
      <VoicePulseDot paused={paused} ink={ink} />
      <LiveWaveform wave={wave} tickMs={tickMs} ink={ink} />
    </View>
  );
});
