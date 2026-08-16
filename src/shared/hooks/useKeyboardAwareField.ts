import { useCallback, useContext, useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import { runOnJS } from "react-native-reanimated";
import { useGenericKeyboardHandler } from "react-native-keyboard-controller";
import { AppModalScrollContext } from "@/shared/components/AppModal";
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
 * Zamanlama: keyboard-controller'ın `onStart`'ı klavye animasyonunun başında
 * hedef yükseklikle geliyor → scroll klavyeyle aynı anda başlar ("hemen"),
 * ScrollView'ın animated scroll'u da onu yumuşak taşır ("yavaşça").
 *
 * NOT: input'un `BottomSheetTextInput` olması şart. Düz RN TextInput'ta gorhom
 * klavye "target"ını hiç set etmiyor (useAnimatedKeyboard event'i cache'leyip
 * çıkıyor) ve sheet klavye davranışını — içerik yüksekliğini klavye kadar
 * kısaltmayı — tamamen atlıyor.
 */
export function useKeyboardAwareField(gap = 24) {
  const ctx = useContext(AppModalScrollContext);
  const anchorRef = useRef<any>(null);
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
      const node = anchorRef.current;
      const scroller = resolveScroller(ctx?.scrollRef.current);
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
      if (isFocused.current && height > 0) reveal(height, 1);
    },
    [reveal, clearRecheck],
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

  const onFocus = useCallback(() => {
    isFocused.current = true;
    // Klavye zaten açıksa (başka input'tan geçiş) yeni bir keyboard event'i
    // gelmez; ölçümü hemen kendimiz yapıyoruz.
    if (keyboardHeight.current > 0) reveal(keyboardHeight.current, 1);
  }, [reveal]);

  const onBlur = useCallback(() => {
    isFocused.current = false;
    clearRecheck();
  }, [clearRecheck]);

  useEffect(() => clearRecheck, [clearRecheck]);

  return { anchorRef, onFocus, onBlur };
}
