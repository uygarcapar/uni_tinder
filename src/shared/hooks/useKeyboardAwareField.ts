import { useCallback, useContext, useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import { runOnJS } from "react-native-reanimated";
import { useGenericKeyboardHandler } from "react-native-keyboard-controller";
import {
  AppModalScrollContext,
  type AppModalScrollHost,
} from "@/shared/components/AppModal";
import { resolveScroller } from "@/shared/hooks/useAppModalScroll";

/**
 * AppModal içindeki bir input'un, klavye açılınca klavyenin hemen üstüne
 * oturmasını sağlar. Modal'ın BottomSheetScrollView'ı context'ten alınır ve
 * input'un alt kenarı klavyeden `gap` kadar yukarıda olacak şekilde yumuşakça
 * scroll edilir — input klavyenin altında kaldıysa yukarı, klavyenin çok
 * yukarısında kaldıysa aşağı doğru.
 *
 *   const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();
 *   <View ref={anchorRef} collapsable={false}>
 *     <BottomSheetTextInput onFocus={onFocus} onBlur={onBlur} ... />
 *   </View>
 *
 * Ölçüm input yerine sarmalayan View üzerinden yapılır — RNGH TextInput'un
 * ref'i measure API'sini garanti etmiyor, View her zaman veriyor.
 *
 * ⚠️ ANCHOR = BİR ALAN, hepsi değil. `anchorRef` birden çok alanı (örn. bütün
 * prompt slotlarını) sarıyorsa hesap yanlış olur: ölçülen kutunun ALT kenarı
 * klavyeye yaslanır, yani odaktaki alan odağın altındaki slotların yüksekliği
 * kadar YUKARIDA kalır — üstteki bir slot düzenlenirken ekranın dışına bile
 * çıkabilir. Çok alanlı listelerde `onFocus`/`onBlur`a o alanın düğümü
 * geçilir (`onFocus(node)`); hook o düğümü ölçer, anchor yalnız yedektir.
 *
 * ⚠️ SCROLL HATTI: context Provider AppModal'ın İÇİNDE. Hook'u modal'ı RENDER
 * EDEN bileşende çağırıyorsan context null gelir ve hook sessizce hiçbir şey
 * yapmaz — o durumda hattı `useAppModalScrollHost()` ile dışarıda kurup hem
 * modal'a (`scrollHost`) hem buraya (ikinci argüman) ver.
 *
 * Zamanlama: keyboard-controller'ın `onStart`'ı klavye animasyonunun başında
 * hedef yükseklikle geliyor → scroll klavyeyle aynı anda başlar ("hemen"),
 * ScrollView'ın animated scroll'u da onu yumuşak taşır ("yavaşça").
 *
 * NOT: input'un `BottomSheetTextInput` olması şart. Düz RN TextInput'ta gorhom
 * klavye "target"ını hiç set etmiyor (useAnimatedKeyboard event'i cache'leyip
 * çıkıyor) ve sheet klavye davranışını — içerik yüksekliğini klavye kadar
 * kısaltmayı — tamamen atlıyor.
 */
export function useKeyboardAwareField(
  gap = 24,
  host?: AppModalScrollHost | null,
) {
  const inherited = useContext(AppModalScrollContext);
  const ctx = host ?? inherited;
  const anchorRef = useRef<any>(null);
  // Odaktaki alanın KENDİ düğümü — `onFocus(node)` ile bildirilir. Yoksa
  // anchor ölçülür (tek alanlı kullanım).
  const targetRef = useRef<any>(null);
  const keyboardHeight = useRef(0);
  const isFocused = useRef(false);
  const recheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hedef: alanın alt kenarı her zaman klavyenin `gap` kadar üstünde dursun —
  // iki yönlü. delta > 0 → alan klavyenin altında kalmış, yukarı kaydır.
  // delta < 0 → alan klavyenin çok yukarısında, aşağı kaydırıp klavyeye yasla.
  // Aşağı kaydırma alanın üstünü gizlemez: alt kenar klavyeye sabitlenirken üst
  // kenar da aşağı iner, yani görünürlük ancak artar; içerik başındaysak
  // Math.max(0, …) zaten 0'a clamp'liyor.
  //
  // tolerance: bu eşiğin altındaki |delta| için scroll etmiyoruz. İlk denemede
  // 1px (input tam otursun), doğrulama geçişinde daha toleranslı — ölçüm
  // gürültüsü yüzünden gereksiz ikinci animasyon tetiklenmesin.
  const reveal = useCallback(
    (height: number, tolerance: number) => {
      const node = targetRef.current ?? anchorRef.current;
      const scroller = resolveScroller(ctx?.scrollRef.current);
      if (__DEV__ && !ctx) {
        console.warn(
          "[useKeyboardAwareField] scroll hattı yok: hook AppModal'ın " +
            "children'ı DIŞINDA çağrılmış olabilir. useAppModalScrollHost() ile " +
            "hattı dışarıda kurup hem <AppModal scrollHost=…> hem de bu hook'a ver.",
        );
      }
      if (height <= 0 || !node?.measureInWindow || !scroller) return;

      node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        if (typeof y !== "number" || typeof h !== "number") return;
        const keyboardTop = Dimensions.get("window").height - height;
        const delta = y + h + gap - keyboardTop;
        if (Math.abs(delta) <= tolerance) return;
        const current = ctx?.scrollY?.value ?? 0;
        scroller.scrollTo({ y: Math.max(0, current + delta), animated: true });
      });
    },
    [ctx, gap],
  );

  /**
   * İlk hizalama BİR KARE sonra: odakla birlikte içerik değişebiliyor (ör.
   * kurulum sheet'i formun dibine klavye payı ekliyor) ve o pay henüz layout'a
   * girmemişken kaydırırsak scroll içeriğin eski sonuna çarpıp yarım kalıyor;
   * kalanını 350ms'lik doğrulama tamamlıyor → alan İKİ ADIMDA iniyordu. Bir
   * kare (≈16ms) klavye animasyonunun yanında fark edilmiyor.
   */
  const revealFrame = useRef<number | null>(null);
  const clearRevealFrame = useCallback(() => {
    if (revealFrame.current !== null) {
      cancelAnimationFrame(revealFrame.current);
      revealFrame.current = null;
    }
  }, []);
  const scheduleReveal = useCallback(
    (height: number) => {
      clearRevealFrame();
      revealFrame.current = requestAnimationFrame(() => {
        revealFrame.current = null;
        if (isFocused.current) reveal(height, 1);
      });
    },
    [reveal, clearRevealFrame],
  );

  const clearRecheck = useCallback(() => {
    if (recheckTimer.current) {
      clearTimeout(recheckTimer.current);
      recheckTimer.current = null;
    }
  }, []);

  const handleKeyboardStart = useCallback(
    (height: number) => {
      keyboardHeight.current = height;
      clearRecheck();
      if (isFocused.current && height > 0) scheduleReveal(height);
    },
    [scheduleReveal, clearRecheck],
  );

  // Klavye tam açıldıktan sonraki doğrulama: ilk scroll, içerik sonuna (veya
  // 0'a) clamp'lendiği için eksik kalmış olabilir. Scroll animasyonunun
  // bitmesini bekleyip tek sefer düzeltiyoruz.
  const handleKeyboardEnd = useCallback(
    (height: number) => {
      clearRecheck();
      if (!isFocused.current || height <= 0) return;
      recheckTimer.current = setTimeout(() => {
        recheckTimer.current = null;
        if (isFocused.current) reveal(height, 8);
      }, 350);
    },
    [reveal, clearRecheck],
  );

  // useKeyboardHandler değil: o, mount'ta Android soft input mode'unu
  // adjustResize'a çevirip unmount'ta geri alıyor — global davranış değişmesin.
  // Generic varyantı yalnızca event dinler.
  useGenericKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";
        runOnJS(handleKeyboardStart)(e.height);
      },
      onEnd: (e) => {
        "worklet";
        runOnJS(handleKeyboardEnd)(e.height);
      },
    },
    [handleKeyboardStart, handleKeyboardEnd],
  );

  // `node`: odaklanan alanın ölçülebilir düğümü (çok alanlı listelerde ŞART,
  // bkz. başlıktaki "ANCHOR = BİR ALAN" notu). Doğrudan bir TextInput'un
  // `onFocus`una bağlandığında argüman native event olur — `measureInWindow`u
  // olmadığı için yok sayılır ve anchor ölçülür.
  const onFocus = useCallback(
    (node?: any) => {
      targetRef.current = node?.measureInWindow ? node : null;
      isFocused.current = true;
      // Klavye zaten açıksa (başka input'tan geçiş) yeni bir keyboard event'i
      // gelmez; ölçümü hemen kendimiz yapıyoruz.
      if (keyboardHeight.current > 0) scheduleReveal(keyboardHeight.current);
    },
    [scheduleReveal],
  );

  const onBlur = useCallback(
    (node?: any) => {
      // GEÇ GELEN BLUR: `keyboardShouldPersistTaps="handled"` altında bir
      // alandan diğerine dokunmak eski alanı o dokunuşta blur ETMİYOR — blur
      // ancak odak yeni alana geçtikten SONRA geliyor. O olayı işlersek daha
      // yeni odağı "kapalı" sayar, doğrulama geçişini (handleKeyboardEnd)
      // iptal eder ve hedefi kaybederiz. Düğüm bildirildiyse eskimiş blur'u
      // tanıyıp atlıyoruz.
      if (node?.measureInWindow && targetRef.current && node !== targetRef.current)
        return;
      isFocused.current = false;
      targetRef.current = null;
      clearRecheck();
      clearRevealFrame();
    },
    [clearRecheck, clearRevealFrame],
  );

  useEffect(
    () => () => {
      clearRecheck();
      clearRevealFrame();
    },
    [clearRecheck, clearRevealFrame],
  );

  return { anchorRef, onFocus, onBlur };
}
