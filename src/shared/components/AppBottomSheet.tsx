import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Keyboard } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFooter,
} from "@gorhom/bottom-sheet";
import { useSharedValue } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { colors, scrimAt } from "../theme/colors";
import { plainBlurTint } from "@/shared/theme/blur";

/**
 * Genel amaçlı bottom sheet wrapper'ı. Tüm modal'larda ortak gorhom config'i,
 * backdrop/background defaults'u tek yerde toplar.
 *
 * Declarative API: `visible` boolean'ı ile aç/kapa, ref kullanmaya gerek yok.
 *
 *   <AppBottomSheet visible={open} onClose={() => setOpen(false)} snapPoints={['90%']}>
 *     <SettingsContent />
 *   </AppBottomSheet>
 *
 * Props:
 *   visible — açık/kapalı state
 *   onClose — modal dismiss olduğunda (swipe/backdrop tap/programatik) çağrılır
 *   snapPoints — ['90%'] gibi gorhom snapPoints
 *   footer — sticky bottom footer içeriği (BottomSheetFooter ile sarılır)
 *   backdrop — 'default' (siyah opak) | 'blur' (BlurView dark) | 'none'
 *   enablePanDownToClose, enableOverDrag, enableContentPanningGesture,
 *   enableHandlePanningGesture — gorhom passthrough
 *   handleComponent — null verirsen drag handle kaybolur
 *   backgroundStyle — defaultlara merge edilir (dark + rounded)
 *   cornerRadius / cornerCurve — üst köşenin yarıçapı ve eğri tipi; içeride
 *     köşesi olan bir yüzey taşıyan sheet'ler (kart önizlemeleri) ikisini de
 *     o yüzeyle eşitlemek zorunda
 *
 * Internal: present() çağrısı bir frame ertelenir (requestAnimationFrame).
 * gorhom v5.2.14 + reanimated 4.3.1'de useEffect tick'inde present() çağırmak
 * BottomSheetModal'ın internal animated value'larının initialize olmasından
 * önce geliyor → no-op veya kararsız state. Bir frame beklemek, mount commit'i
 * + reanimated UI thread sync tamamlandığı için güvenli timing sağlar.
 *
 * Köprü TEK YÖNLÜ DEĞİL: sheet kapandığında (kullanıcı, stack ya da
 * kilitlenme) parent'a `onClose` ile haber verilir. Verilmezse `visible`
 * true'da kilitleniyor ve modal bir daha açılmıyor — bkz. watchdog notu.
 */

// present() sonrası sheet'in bir detent'e oturması için tanınan süre. Giriş
// animasyonu ~300ms; 1.5sn hem yavaş cihazda hem `enableDynamicSizing`in
// ölçüm turunda rahat sığıyor, kilitlenmiş modal'ı da kullanıcı ikinci kez
// denemeden önce çözüyor.
const PRESENT_WATCHDOG_MS = 1500;

export default function AppBottomSheet({
  visible,
  onClose,
  onPresented,
  snapPoints: snapPointsProp,
  children,
  footer,
  footerComponent: customFooterComponent,
  backdrop = "default",
  backdropComponent: customBackdropComponent,
  enablePanDownToClose = true,
  enableOverDrag = false,
  enableContentPanningGesture,
  enableHandlePanningGesture,
  activeOffsetX,
  activeOffsetY,
  failOffsetX,
  failOffsetY,
  handleComponent,
  handleIndicatorStyle,
  backgroundStyle,
  // Üst köşe yarıçapı. Varsayılan 36 uygulamanın sheet dili; kartı taşıyan
  // sheet'ler (PreviewModal / LikerSwipeModal) bunu KARTIN yarıçapına
  // (CARD_CORNER_RADIUS) çekiyor — iki eğri üst üste binince köşeler
  // uyuşmuyordu. Hem clip'e hem zemine birden uygulanıyor.
  cornerRadius = 36,
  // Köşe eğrisinin TİPİ. Yarıçapı eşitlemek tek başına yetmiyor: kart ve
  // içindeki sticky şerit `continuous` (squircle) çiziyor, RN'in varsayılanı
  // ise `circular`. Aynı yarıçapta bile iki eğri kenar boyunca birbirini
  // kesiyor ve şeffaf zeminli sheet'te aradan ince hilaller sızıyor.
  cornerCurve = "circular",
  // Sheet içeriğini sheet'in kendi çerçevesine KIRPSIN MI. Varsayılan true —
  // sheet'lerin köşesi buradan geliyor.
  //
  // İçinde DÖNEN bir yüzey taşıyan sheet kapatmak ZORUNDA (LikerSwipeModal):
  // kırpma kutusu eksenlere sabit, kart ise yana kayarken eğiliyor. İkisi
  // ayrıştığı anda kartın üst köşeleri düz bir çizgiyle dilimleniyor ve kart
  // "bir çerçevenin içinde sıkışmış" gibi görünüyor. Kapatan taraf yarıçapı
  // DÖNEN view'in kendisine taşımak zorunda — kırpma o view'in kendi
  // koordinatında olduğu için köşeler kartla birlikte eğilir (Keşif'teki
  // SwipeCard da tam olarak böyle: kartın kabuğu kendini kırpıyor, ekranda
  // onu kırpan bir çerçeve yok).
  clipContent = true,
  stackBehavior,
  topInset,
  enableDynamicSizing = false,
  maxDynamicContentSize,
  keyboardBehavior = "extend",
}: any) {
  const ref = useRef(null);
  // gorhom'un `handleDismiss` bir state machine bug'ı taşıyor:
  //   - status === INITIAL veya DISMISSED iken dismiss() çağrılırsa
  //     erken çıkmıyor, status'u DISMISSING'e zehirliyor (sheet henüz mount
  //     olmadığı için forceClose no-op olsa da).
  //   - Sonraki present() çağrısında Portal mount olurken handlePortalRender
  //     status === DISMISSING görüp render'ı iptal ediyor → modal görünmez.
  // Bu yüzden sadece *gerçekten present edilmiş* bir modal'ı dismiss ederiz:
  // `presentedRef` gorhom'un onChange(index >= 0) bildirimiyle (yani sheet
  // gerçekten bir detent'e oturduğunda) doluyor — "present() çağırdık" ile
  // DEĞİL. present() işini rAF'a ertelediği için o ikisi aynı şey değil.
  const presentedRef = useRef(false);
  // Bu açılış turunda parent'a kapanış bildirildi mi. gorhom kapanışı iki
  // ayrı yoldan haber veriyor (onChange(-1) ve onDismiss); ikisi de aynı turda
  // gelebildiği için onClose tam bir kez çağrılsın diye kilit.
  const closeNotifiedRef = useRef(false);
  const snapPoints = useMemo(() => snapPointsProp, [snapPointsProp]);

  // Sheet'in GERÇEK konumu (detent indeksi; -1 = kapalı). gorhom bunu
  // `animatedPosition`dan türetiyor, yani animasyon tamamlansın tamamlanmasın
  // her an doğru. `presentedRef`in dayandığı `onChange` bu garantiyi VERMİYOR
  // (bkz. aşağıdaki watchdog notu), o yüzden "sheet ekranda mı" sorusunun
  // nihai cevabı burası.
  const animatedIndex = useSharedValue(-1);
  const isOnScreen = useCallback(
    () => animatedIndex.value > -0.5,
    [animatedIndex],
  );

  // Handler'lar ref üzerinden okunuyor: çağıran tarafların çoğu inline arrow
  // veriyor (`onClose={() => setX(null)}`), bunlar effect deps'ine girseydi
  // her parent render'ında present timer'ı ve watchdog yeniden kurulurdu.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPresentedRef = useRef(onPresented);
  onPresentedRef.current = onPresented;

  // Kilitlenmiş bir gorhom örneğini sıfırdan kurmak için remount anahtarı
  // (aşağıdaki watchdog'a bakın).
  const [instanceKey, setInstanceKey] = useState(0);

  const notifyClose = useCallback(() => {
    if (closeNotifiedRef.current) return;
    closeNotifiedRef.current = true;
    presentedRef.current = false;
    onCloseRef.current?.();
  }, []);

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    notifyClose();
  }, [notifyClose]);

  useEffect(() => {
    if (!visible) {
      // Sadece gerçekten açılmış VE kapanışı henüz bildirilmemiş bir modal'ı
      // dismiss et. İlk mount'ta (visible=false) veya kullanıcı zaten
      // kapattığında dismiss() çağırmak gorhom status'unu INITIAL/DISMISSED →
      // DISMISSING'e zehirleyip sonraki present()'i kalıcı olarak block ediyor.
      //
      // `isOnScreen()` ikinci bir kapı: `presentedRef` yalnız onChange ile
      // doluyor ve o bildirim atlanabiliyor (watchdog notu). Ekranda duran bir
      // sheet'i dismiss etmek her koşulda doğru — zehirlenme riski yok, çünkü
      // görünür olması zaten present edilmiş olduğunu kanıtlıyor.
      if ((presentedRef.current || isOnScreen()) && !closeNotifiedRef.current) {
        ref.current?.dismiss?.();
      }
      return;
    }

    closeNotifiedRef.current = false;
    presentedRef.current = false;

    // present()'i bir frame değil ~6 frame ertele — gorhom'un içsel mount +
    // provider registration + portal sync hızlı JS'te tek-rAF ile settle
    // olamıyor (devtools açıkken çalışıp kapalıyken çalışmama paterni).
    const presentId = setTimeout(() => {
      ref.current?.present?.();
    }, 100);

    // WATCHDOG — "açılmayan modal" kilidinin tek çıkış kapısı.
    //
    // gorhom sheet'i BİLDİRİMSİZ kapatabiliyor, yani `visible` true'da
    // kalırken ekranda hiçbir şey olmuyor. İki bilinen yol:
    //   1. Stack minimize: üstüne default stackBehavior ("switch") ile başka
    //      bir modal present edilirse bu sheet minimize ediliyor. Minimize
    //      giriş animasyonu BİTMEDEN gelirse currentIndex hâlâ -1 olduğu için
    //      gorhom onChange'i atlıyor, modal katmanı da status MINIMIZING
    //      gördüğü için unmount/onDismiss ETMİYOR.
    //   2. Yukarıdaki DISMISSING zehirlenmesi: portal render'ı kalıcı iptal.
    // Her ikisinde de `visible` true kilitleniyor; effect yalnız boolean'ın
    // KENARINDA çalıştığı için bir daha present() atılmıyor → kullanıcı aynı
    // satıra tekrar bassa da modal bir daha AÇILMIYOR (kalıcı bug).
    //
    // Çare: açılış bildirilmediyse gorhom örneğini remount ederek state
    // machine'i tazele ve parent'a kapandı de — `visible` false'a döndüğü için
    // kullanıcının bir sonraki dokunuşu yeniden bir açılış kenarı üretir.
    //
    // ⚠️ AMA ÖNCE KONUMA BAK. "onChange gelmedi" ile "sheet açılmadı" AYNI ŞEY
    // DEĞİL: gorhom onChange'i yalnız animasyon TAMAMLANINCA atıyor
    // (animateToPositionCompleted, isFinished=false'ta erken çıkıyor).
    // Kullanıcı giriş animasyonu sürerken içeriğe dokunursa sheet'in content
    // pan'i ilk iş `stopAnimation()` çağırıp animasyonu İPTAL ediyor; sheet
    // parmakla anında en üst detent'e oturuyor ama tamamlanmış bir animasyon
    // olmadığı için onChange HİÇ gelmiyor. Sonuç: uzun bir modal açılır açılmaz
    // hızlıca kaydırıldığında watchdog onu "açılmadı" sanıp 1.5sn sonra
    // kapatıyordu — kullanıcı için modal bir anda yok oluyordu (FilterModal).
    //
    // Sheet fiilen ekrandaysa kapatmak yerine SAHİPLENİYORUZ: presentedRef'i
    // dolduruyoruz (dismiss yolu buna bakıyor) ve gecikmeli de olsa onPresented
    // atıyoruz — ağır içeriğini bu sinyale bağlamış ekranlar boş kalmasın.
    const watchdogId = setTimeout(() => {
      if (!visibleRef.current || presentedRef.current) return;
      if (isOnScreen()) {
        presentedRef.current = true;
        onPresentedRef.current?.();
        return;
      }
      setInstanceKey((k) => k + 1);
      notifyClose();
    }, PRESENT_WATCHDOG_MS);

    return () => {
      clearTimeout(presentId);
      clearTimeout(watchdogId);
    };
  }, [visible, notifyClose, isOnScreen]);

  const renderBackdrop = useCallback(
    (props) => {
      if (backdrop === "none") return null;
      if (backdrop === "blur") {
        return (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={1}
            pressBehavior={enablePanDownToClose ? "close" : "none"}
            style={[props.style, { backgroundColor: "transparent" }]}
          >
            <BlurView
              intensity={30}
              tint={plainBlurTint()}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            {/* Blur tek başına arkayı yeterince geri itmiyor: içerik bulanık
                ama AYNI parlaklıkta kalıyor, sheet zeminiyle (colors.bg)
                kontrast oluşmuyor. Blur'un ÜSTÜNE ince bir perde çekiyoruz —
                `scrimAt` her iki modda da siyah, açık modda da karartır. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: scrimAt(0.28),
              }}
            />
          </BottomSheetBackdrop>
        );
      }
      return (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
          pressBehavior={enablePanDownToClose ? "close" : "none"}
        />
      );
    },
    [backdrop, enablePanDownToClose],
  );

  const renderFooter = useCallback(
    (props) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        {footer}
      </BottomSheetFooter>
    ),
    [footer],
  );

  return (
    <BottomSheetModal
      // Watchdog kilitlenme gördüğünde bu anahtar artıyor: gorhom örneği
      // (statusRef + portal kaydı dahil) sıfırdan kuruluyor. Normal akışta hiç
      // değişmiyor, yani ek maliyeti yok.
      key={instanceKey}
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      // Watchdog'un ve dismiss yolunun okuduğu "sheet gerçekten ekranda mı"
      // kaynağı (bkz. yukarıdaki animatedIndex notu).
      animatedIndex={animatedIndex}
      // gorhom v5 default'u true → sheet kendini içeriğe göre büyütür ve
      // snapPoints sadece "max" gibi davranır. Bu yüzden uzun içerikli
      // modal'lar (FilterModal vb.) snap'i geçip ekranı kaplıyordu. Varsayılan
      // KAPALI: snapPoints katı kalsın, içerik scroll'la sığsın.
      //
      // İçeriği kısa ve sabit olan sheet'ler (not composer'ı gibi) prop'la
      // açabilir: o zaman snapPoints VERİLMEZ, tek detent ölçülen içerik
      // yüksekliğidir (`maxDynamicContentSize` tavanıyla).
      enableDynamicSizing={enableDynamicSizing}
      maxDynamicContentSize={maxDynamicContentSize}
      // "extend": klavye açılınca sheet en yüksek detent'e gider, KLAVYENİN
      // ÜSTÜNE ÇIKMAZ — içerik alanı klavye kadar kısalır ve içerik scroll'a
      // kalır. Input'u klavyenin üstünde TUTMASI gereken sheet'ler
      // "interactive" geçer: sheet klavye kadar yukarı ötelenir.
      keyboardBehavior={keyboardBehavior}
      enablePanDownToClose={enablePanDownToClose}
      enableOverDrag={enableOverDrag}
      enableContentPanningGesture={enableContentPanningGesture}
      enableHandlePanningGesture={enableHandlePanningGesture}
      // Sheet'in kendi pan gesture'ının aktivasyon eşikleri. İçeriğinde yatay
      // swipe olan sheet'ler (LikerSwipeModal) failOffsetX vererek yatay
      // sürüklemeyi sheet'e kaptırmaz, karta bırakır.
      activeOffsetX={activeOffsetX}
      activeOffsetY={activeOffsetY}
      failOffsetX={failOffsetX}
      failOffsetY={failOffsetY}
      // ⚠️ BURADA "AYRIK SHEET" İSTEMİYORUZ, KIRPMAYI KAPATIYORUZ.
      //
      // `style`e overflow:visible vermek TEK BAŞINA yetmiyor: gorhom içeriği
      // ÜÇ katmanda kırpıyor ve alttaki ikisi sabit —
      //   1. BottomSheetBody      → bizim `style`ımız (yukarıdaki clipContent),
      //   2. BottomSheetContent   → overflow: detached ? visible : hidden,
      //   3. HostingContainer     → overflow: detached ? visible : hidden.
      // 2 ve 3'ün tek anahtarı `detached`. Yarıçapsız düz birer dikdörtgen
      // olduklarından, açık kaldıklarında dönen kartı köşesiz düz bir çizgiyle
      // kesiyorlar — yani kapatılmazsa problem çözülmüyor, sadece köşesi
      // yuvarlak bir dilimleme köşesizle yer değiştiriyor.
      //
      // `detached`in bu sürümde (v5.2.14) yaptığı BAŞKA İŞLER ve neden zararsız:
      //   - closedDetentPosition'a bottomInset ekliyor: BottomSheetModal'da o
      //     dal `$modal` ile ZATEN alınıyor, fark yok.
      //   - içeriğin over-drag payını (paddingBottom) 0'a çekiyor: bu sheet
      //     `enableOverDrag={false}` ile geliyor ve klavye taşımıyor, o pay
      //     hiç görünmüyordu.
      // Yani görünür yerleşim aynı kalıyor, sadece kırpma kalkıyor.
      detached={!clipContent}
      onDismiss={handleDismiss}
      // Kapanış animasyonu BAŞLARKEN klavyeyi de indir. gorhom klavyeyi kendisi
      // kapatmıyor: input unmount olana (yani sheet tamamen gidene) kadar açık
      // kalıyor → sheet iniyor, klavye ARDINDAN ayrı bir animasyonla iniyor.
      // `onAnimate` üç kapanış yolunu da kapsıyor (programatik dismiss, aşağı
      // swipe, backdrop tap) — `onDismiss` ise animasyon BİTİNCE geldiği için
      // burada geç kalırdı.
      onAnimate={(_from: number, to: number) => {
        if (to === -1) Keyboard.dismiss();
      }}
      onChange={(index: number) => {
        // index >= 0: modal slide-up animasyonu tamamlandı, snap'lendi.
        // JS thread serbest, parent ağır mount'unu burada güvenle tetikleyebilir.
        // setTimeout'a göre çok daha güvenilir — gorhom callback'i UI thread
        // animasyon bitince fire eder, JS event loop park'lanmasından etkilenmez.
        if (index >= 0) {
          presentedRef.current = true;
          onPresentedRef.current?.();
          return;
        }
        // index === -1: sheet kapalı konuma indi. onDismiss'i BEKLEMEDEN
        // parent'a haber ver — gorhom bazı yollarda (stack minimize) hiç
        // onDismiss atmıyor ve `visible` true'da kilitleniyor. notifyClose
        // idempotent: arkadan gelen onDismiss ikinci kez onClose çağırmaz.
        if (presentedRef.current) notifyClose();
      }}
      backdropComponent={customBackdropComponent || renderBackdrop}
      footerComponent={
        customFooterComponent || (footer ? renderFooter : undefined)
      }
      handleComponent={handleComponent}
      handleIndicatorStyle={handleIndicatorStyle}
      stackBehavior={stackBehavior}
      topInset={topInset}
      backgroundStyle={{
        backgroundColor: colors.bg,
        borderTopLeftRadius: cornerRadius,
        borderTopRightRadius: cornerRadius,
        borderCurve: cornerCurve,
        ...backgroundStyle,
      }}
      // Sheet'in OUTER container'ı default'ta rectangular — sadece backgroundStyle
      // rounded olduğu için içerik (blur, scroll, vs) yuvarlak köşelerin üstüne
      // taşıyordu. Container'a overflow:hidden + matching radius vererek tüm
      // child'ları sheet'in rounded shape'ine clip'liyoruz.
      //
      // `clipContent={false}` ile kapatılabiliyor: köşeyi içeriğin kendisi
      // çiziyorsa (dönen kart) buradaki sabit kırpma onu dilimler.
      style={
        clipContent
          ? {
              overflow: "hidden",
              borderTopLeftRadius: cornerRadius,
              borderTopRightRadius: cornerRadius,
              borderCurve: cornerCurve,
            }
          : { overflow: "visible" }
      }
    >
      {children}
    </BottomSheetModal>
  );
}
