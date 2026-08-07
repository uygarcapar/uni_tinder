import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { KeyboardAwareLegendList } from "@legendapp/list/keyboard";
import { REVEAL_MAX } from "@/features/chat/components/RevealContext";
import { DATE_SEPARATOR_HEIGHT } from "@/features/chat/components/DateSeparator";
import { chatListItemsEqual } from "@/features/chat/messageEquality";

const LIST_STYLE = { flex: 1 } as const;

// maintainScrollAtEnd çıplak `true` verilMEZ: çıplak hali TÜM tetikleyicileri açar
// (dataChange + itemLayout + layout + footerLayout). Yukarı sayfalamada prepend
// edilen mesajlar ölçüldükçe itemLayout olayları "dibe pin'le"yi tetikleyip
// maintainVisibleContentPosition düzeltmesiyle geri-besleme döngüsü kuruyor →
// render storm + Fabric ShadowTree::commit assert (SIGABRT, .ips ile kanıtlı).
// Yalnız dataChange: yeni mesaj dipteyken hâlâ dibe pin'ler, prepend churn'ü pin
// tetiklemez.
const MAINTAIN_SCROLL_AT_END = { on: { dataChange: true } } as const;

// Balon/separator ayrı container tipi + ayrı boyut ortalaması alır — karışık
// tipli pool tek tipe göre tahmin yapıp blank hücre üretmesin.
const getItemType = (item: any) => (item.__separator ? "sep" : "msg");
// Separator yüksekliği YAPISAL olarak sabit (DateSeparator height:42) — fixed-size
// item'lar LegendList'te hiç ölçülmediği için buradaki değer gerçek render'dan
// saparsa fark kalıcıdır (prepend'de px kayması). İkisi tek sabitten beslenir.
const getFixedItemSize = (item: any) =>
  item.__separator ? DATE_SEPARATOR_HEIGHT : undefined;

type Props = {
  listRef: any;
  data: any[];
  keyExtractor: (item: any) => string;
  renderItem: (info: { item: any }) => any;
  revealX: SharedValue<number>;
  listGesture: any;
  contentInsetEndAdjustment: SharedValue<number>;
  // true iken KeyboardChatScrollView klavye kaynaklı padding/contentOffset
  // işlerini atlar → liste klavye inip binerken hiç oynamaz. ChatScreen bunu
  // yalnız uzun-bas menüsü açıkken elle set eder (otomatik freeze KULLANILMIYOR).
  freeze?: SharedValue<boolean>;
  keyboardOffset: number;
  contentContainerStyle: any;
  onScrollBeginDrag: () => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: () => void;
  onStartReached: () => void;
  onLoad?: () => void;
  ListEmptyComponent: any;
  ListFooterComponent: any;
};

/**
 * Chat mesaj listesi — LegendList (KeyboardAwareLegendList), NON-inverted.
 *
 * REVEAL MİMARİSİ (storm-güvenli): balon başına useAnimatedStyle YOK — teşhisle
 * kanıtlandı ki per-balon reanimated attach/detach hızlı scroll'da commit-storm +
 * blank balon üretiyordu. Bunun yerine TÜM liste, ekrandan REVEAL_MAX kadar geniş
 * TEK bir Animated.View içinde durur ve sola çekişte bu wrapper TEK transform ile
 * kayar. Her satırın saat/okundu kolonu satırın sağ İÇİNDE (ekran dışında park)
 * durur; wrapper kayınca ekrana girer. Görsel, eski per-balon tasarımla birebir
 * aynı (zaten tüm satırlar aynı revealX ile kayıyordu).
 *
 * recycleItems AÇIK: balon artık TAMAMEN statik (reanimated/context state yok) —
 * recycling'i eskiden kıran sızıntı kaynakları kalktı. Kapalıyken her container
 * reuse'u tam subtree REMOUNT'uydu (native view create + css-interop işleme);
 * hızlı scroll'da saniyede onlarca remount FPS'i düşürüyordu. Açıkken reuse =
 * ucuz in-place prop reconcile. Tek kalan state (pressed) id değişiminde
 * MessageBubble içinde sıfırlanıyor.
 *
 * freeze BİLEREK YOK: useKeyboardScrollToEnd'in freeze'i animated scrollToEnd
 * promise'i resolve olmayınca (no-op scroll / touch-cancel) TRUE'da kilitleniyor,
 * tüm klavye handler'ları susuyordu ("parmağımla donuyor"). closeKeyboard:true
 * kullanmadığımız için freeze'e ihtiyaç da yok.
 */
function ChatMessageList({
  listRef,
  data,
  keyExtractor,
  renderItem,
  revealX,
  listGesture,
  contentInsetEndAdjustment,
  freeze,
  keyboardOffset,
  contentContainerStyle,
  onScrollBeginDrag,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onStartReached,
  onLoad,
  ListEmptyComponent,
  ListFooterComponent,
}: Props) {
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();

  // Ekrandaki TEK reveal animasyonu — balonlar tamamen statik.
  const listRevealStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -revealX.value }],
  }));

  const wrapperStyle = useMemo(
    () => ({ flex: 1, width: screenWidth + REVEAL_MAX }),
    [screenWidth],
  );

  // İlk render'da Fabric'te scrollLength=0 — initialScrollAtEnd seed offset'i
  // ~1 viewport fazla hesaplanıp bootstrap'ı uzatıyordu. Ekran boyutu hint'i
  // seed'i doğru banda düşürür (mount'taki senkron measure gerçek değerle ezer).
  const estimatedListSize = useMemo(
    () => ({ width: screenWidth + REVEAL_MAX, height: windowHeight }),
    [screenWidth, windowHeight],
  );

  const list = useMemo(
    () => (
      <KeyboardAwareLegendList
        ref={listRef}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        getFixedItemSize={getFixedItemSize}
        // CİHAZDA ÖLÇÜLDÜ: gerçek msg ortalaması 41.3 ([chat] avg item sizes
        // dev logu, 30 örnek). Estimate ölçüme sabitlendi — pool doğru boyutlanır,
        // prepend pozisyon haritası isabetli olur.
        estimatedItemSize={42}
        estimatedListSize={estimatedListSize}
        // Reconcile/prepend'de referansı değişen ama İÇERİĞİ aynı item'lar yapısal
        // değişim SAYILMASIN: separator objeleri her useMemo'da yeniden yaratılıyor,
        // reconcile merge kaçırırsa mesaj referansları tazelenebiliyor. Bu comparator
        // olmadan tek referans farkı tüm container'ları resetleyip (rerender +
        // remeasure + MVCP recalc) girişte/scroll'da görünür flash üretiyordu.
        // Alan seti MessageBubble memo'suyla AYNI kaynaktan (messageEquality.ts).
        itemsAreEqual={chatListItemsEqual}
        recycleItems
        style={LIST_STYLE}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        initialScrollAtEnd
        alignItemsAtEnd
        maintainScrollAtEnd={MAINTAIN_SCROLL_AT_END}
        // { data:true, size:true }: size:true prepend edilen itemlar ölçülüp
        // tahminden saptıkça scroll'u TELAFİ eder — size:false'ta bu düzeltmeler
        // telafisiz kalıp görünür titreme yapıyordu. TARİHÇE: size:true bir kez
        // storm/crash ile ilişkilendirildi ama o crash'ler rAF-coalesce patch'inden
        // ÖNCEYDİ ve per-balon reanimated + fling-ortası prepend + estimate=72
        // varken oldu. Şimdi: patch aktif (frame başına 1 recalc) + balon statik +
        // momentum kapısı (prepend durgunken) + ölçülmüş estimate 42 → güvenli.
        // Storm belirtisi geri gelirse İLK geri alınacak ayar budur.
        maintainVisibleContentPosition={{ data: true, size: true }}
        drawDistance={600}
        keyboardDismissMode="interactive"
        keyboardOffset={keyboardOffset}
        contentInsetEndAdjustment={contentInsetEndAdjustment}
        freeze={freeze}
        // RN 0.81+ contentInset hit-test regresyonu (facebook/react-native#54123):
        // klavye/composer inset şeridi dokunmaya ÖLÜ kalıyor — composer üstünden
        // scroll/interactive-dismiss başlatılamıyordu. Kütüphanenin workaround'u:
        applyWorkaroundForContentInsetHitTestBug={Platform.OS === "ios"}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        onScrollBeginDrag={onScrollBeginDrag}
        // Momentum takibi: fling sürerken prepend ertelenir (ChatScreen) — fling
        // ortasında sayfa düşmesi MVCP çapasını şaşırtıp void üretiyordu.
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onStartReached={onStartReached}
        // 2.5 ekran önceden tetikle → sayfa, kullanıcı tepeye yaklaşmadan çok önce
        // gelsin. Guard'lar: userScrolled gate + in-flight + 400ms cooldown +
        // momentum erteleme + retry timer (bloklanan tetik kaybolmaz).
        onStartReachedThreshold={2.5}
        // "Liste oturdu" sinyali (readyToRender): ChatScreen bunu skeleton
        // overlay'ini kaldırmak için kullanır — LegendList ilk yerleşim oturana
        // kadar içeriği kendi içinde gizliyor (boş-arkaplan fazı).
        onLoad={onLoad}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={ListEmptyComponent}
      />
    ),
    [
      listRef,
      data,
      keyExtractor,
      renderItem,
      contentContainerStyle,
      estimatedListSize,
      keyboardOffset,
      contentInsetEndAdjustment,
      freeze,
      onScrollBeginDrag,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      onStartReached,
      onLoad,
      ListFooterComponent,
      ListEmptyComponent,
    ],
  );

  return (
    <GestureDetector gesture={listGesture}>
      <Animated.View style={[wrapperStyle, listRevealStyle]}>{list}</Animated.View>
    </GestureDetector>
  );
}

export default ChatMessageList;
