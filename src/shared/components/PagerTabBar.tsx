import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useEvent,
  useHandler,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import PagerView from "react-native-pager-view";
import { colors } from "@/shared/theme/colors";

/**
 * Alt çizgili sekme şeridi — çizgi PAGER'IN KENDİSİYLE sürülüyor.
 *
 * Girdi `offset` bir sayfa indeksi ama tam sayı DEĞİL: pager kaydırılırken
 * 1.0 → 1.37 → 2.0 diye akıyor. Çizgi bu ara değerlerden çizildiği için parmakla
 * yarım sayfa çekip bırakıldığında da doğru yerde: sekmeye "vardıktan sonra"
 * atlamıyor, yolun kendisini takip ediyor.
 *
 * ⚠️ Çizginin GENİŞLİĞİ de sekmeye göre değişiyor ("Tümü" ile "Kaçırdıkların"
 * aynı uzunlukta değil) ama `width` ANİMASYONLA DEĞİŞMİYOR: her karede layout
 * commit'i doğururdu. Bunun yerine 1px'lik bir çubuk `scaleX` ile geriliyor —
 * saf transform, layout'a dokunmuyor.
 *
 * Şeridin KENDİ KAYDIRMASI da aynı `offset`ten sürülüyor: sekmeler ekrana
 * sığmadığında (Beğeniler'de beş sekme var) aktif sekme şeridin ortasına
 * çekiliyor ve bu da parmakla birlikte akıyor — bkz. aşağıdaki reaction.
 */

/**
 * Reanimated'a bağlanmış pager. Şeridin alt çizgisi pager'ın ANLIK konumundan
 * sürülüyor, yani ikisi hep birlikte kullanılıyor — bu yüzden aynı dosyada.
 */
export const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

/**
 * Pager'ın `onPageScroll`'unu WORKLET olarak dinler — reanimated'ın hazır
 * `useAnimatedScrollHandler`'ı yalnız ScrollView olaylarını tanıyor.
 *
 * ⚠️ Olay adı `endsWith` ile kontrol ediliyor: yeni mimaride ad "top" önekiyle
 * geliyor (`topOnPageScroll`), eskisinde önek yok. Eşitlik araması iki
 * mimariden birinde sessizce hiç eşleşmezdi.
 *
 * JS tarafındaki `onPageScroll` prop'uyla yapılmaması şart: alt çizgi parmakla
 * birlikte her karede hareket ediyor, olay köprüden geçseydi kayış takılırdı.
 */
export function usePagerScrollHandler(handlers: any, dependencies?: any) {
  const { context, doDependenciesDiffer } = useHandler(handlers, dependencies);
  return useEvent(
    (event: any) => {
      "worklet";
      const { onPageScroll } = handlers;
      if (onPageScroll && event.eventName.endsWith("onPageScroll")) {
        onPageScroll(event, context);
      }
    },
    ["onPageScroll"],
    doDependenciesDiffer,
  );
}

/**
 * `onPageSelected` geldikten sonra "idle" için beklenecek son süre. Yalnız
 * emniyet freni (bkz. usePagerTabCommit); normal akışta hiç dolmuyor.
 */
const PAGER_COMMIT_FALLBACK_MS = 700;

/**
 * Sekme state'ini pager DURUNCA yazar, sayfa "seçildiği" anda değil.
 *
 * iOS'ta pager artık bir SwiftUI `TabView(.page)` ve `onPageSelected` onun
 * seçim binding'inden çıkıyor — yani parmak yarı yolu geçer geçmez, geçişin
 * TAM ORTASINDA. State oraya yazıldığında ekranın React commit'i kaymanın
 * ortasına düşüyordu ve iki ayrı yoldan aynı takılmayı üretiyordu:
 *   • Fabric'te mount işi ANA THREAD'de: o karede pager'ın kendi kayması
 *     duruyor (Beğeniler'de büyük başlık listenin içinde, yani sayfayla
 *     birlikte native kayıyor — takılan da oydu).
 *   • Reanimated her re-render'da animasyonlu stilin yerine İLK render'da
 *     yakalanan değeri basıyor (PropsFilter._initialPropsMap) ve doğrusunu bir
 *     kare sonra geri yazıyor: pager'la birlikte kayan şeritler (Mesajlar'ın
 *     başlık/arama şeridi) o karede yanlış yere sıçrıyordu.
 *
 * Seçilen sayfa ref'te bekliyor, `onPageScrollStateChanged` "idle" dediğinde
 * yazılıyor. O an pager oturmuş ve offset tam sayı — commit hiçbir hareketin
 * ortasına düşmüyor, taban stiller de (settledSlideStyle / settledUnderline)
 * animasyon değeriyle birebir aynı yeri gösteriyor.
 *
 * ⚠️ Emniyet freni: "idle" scroll delegesinden geliyor, `onPageSelected` ise
 * SwiftUI'ın binding'inden — ikisi ayrı kaynak. Programatik `setPage`te delege
 * hiç konuşmazsa sekme state'i asılı kalırdı; bu yüzden seçim sonrası kısa bir
 * zamanlayıcı kuruluyor ve pager o an hareketsizse state'i o yazıyor. Jest
 * sürerken (dragging/settling) hiçbir şey yapmıyor: "idle" nasılsa gelecek.
 */
export function usePagerTabCommit(onCommit: (index: number) => void) {
  const pendingRef = useRef<number | null>(null);
  const scrollStateRef = useRef<"idle" | "dragging" | "settling">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Her render'da tazeleniyor: handler'ların KİMLİĞİ sabit kalsın (pager'a prop
  // olarak iniyorlar) ama yazan fonksiyon bayat kapanış olmasın.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const index = pendingRef.current;
    pendingRef.current = null;
    if (index != null) commitRef.current(index);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onPageSelected = useCallback(
    (e: any) => {
      const position = e?.nativeEvent?.position;
      pendingRef.current = typeof position === "number" ? position : null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Jest / animasyon sürüyorsa dokunma: bitişinde "idle" zaten yazacak.
        if (scrollStateRef.current !== "idle") return;
        flush();
      }, PAGER_COMMIT_FALLBACK_MS);
    },
    [flush],
  );

  const onPageScrollStateChanged = useCallback(
    (e: any) => {
      const state = e?.nativeEvent?.pageScrollState ?? "idle";
      scrollStateRef.current = state;
      if (state === "idle") flush();
    },
    [flush],
  );

  return { onPageSelected, onPageScrollStateChanged };
}

/**
 * Şeridin yüksekliği — çağıran listenin üst payını buna göre ayırıyor.
 *
 * Etiketler şeridin ALTINA yaslı (`alignItems: "flex-end"`), yani bu sayının
 * etiket + alt payını aşan kısmı doğrudan durum çubuğuyla yazının arasında ölü
 * boşluk olarak duruyordu. Ölçü sekmelerin kendi yüksekliğine indirildi.
 */
export const PAGER_TAB_BAR_HEIGHT = 36;

const UNDERLINE_HEIGHT = 3;
const TAB_GAP = 22;
/** `scaleX` bunun üstüne uygulanıyor; 1 seçilmesi ölçeği doğrudan px yapıyor. */
const UNDERLINE_BASE_W = 1;

/**
 * Şeridin kaydırmasını yumuşatan yay (bkz. aşağıdaki iki reaction).
 *
 * AŞIRI SÖNÜMLÜ seçildi: kritik sönüm mass=1, stiffness=90 için 2·√90 ≈ 19;
 * 22 onun üstünde, yani şerit hedefe hiç sekmeden — sonuna doğru yavaşlayarak —
 * oturuyor. Sekmeler zaten yazı; salınan bir şerit okunaksız.
 *
 * Yumuşaklığın asıl sebebi HIZ değil GECİKME: pager'ın anlık konumu her karede
 * yeni bir hedef veriyor, yay onu ~0.15sn geriden takip ediyor. Şerit böylece
 * parmağın her titremesini birebir taşımıyor, kayışın genel yönünü taşıyor.
 * Daha yumuşağı denenebilir ama sınır belli: yay yavaşladıkça şerit kayış
 * bittikten sonra da sürünüyor ve sekme yerine oturmamış gibi duruyor.
 *
 * `overshootClamping`: hedef zaten [0, içerik - görüntü] aralığına kırpılı;
 * yayın ucu aşması şeridi kısa süre boşluğa çekerdi.
 */
const SCROLL_SPRING = {
  damping: 22,
  stiffness: 90,
  mass: 1,
  overshootClamping: true,
} as const;

/** Bunun altındaki hedef değişimi için yeni yay kurulmuyor (bkz. reaction). */
const SCROLL_TARGET_EPSILON = 0.5;

type Tab = { key: string; label: string; count?: number | null };

/**
 * Sekmenin etiketi — VURGU RENGİ pager'ın anlık konumundan sürülüyor, `activeTab`
 * state'inden değil.
 *
 * Sebep: state ancak pager DURUNCA yazılıyor (bkz. usePagerTabCommit) ve bu bilerek
 * böyle. Ama renk de ona bağlıyken vurgu kaymanın SONUNDA geliyordu: parmak yarıyı
 * çoktan geçmiş, alt çizgi yeni sekmenin altına varmış, etiket hâlâ soluktu.
 * Burada eşik `Math.round` ile yarım sayfa: 1.5'i geçen kare vurguyu diğer sekmeye
 * veriyor — çizgiyle aynı anda, React commit'i olmadan.
 *
 * Ayrı component olmasının sebebi `useAnimatedStyle`: sekmeler map'le çiziliyor,
 * hook döngü içinde çağrılamaz. Bir stil sonucu birden çok view'a da bağlanamıyor.
 */
function TabLabel({
  label,
  index,
  offset,
  isActive,
}: {
  label: string;
  index: number;
  offset: SharedValue<number>;
  isActive: boolean;
}) {
  // Renkler worklet'e PRİMİTİF olarak giriyor: palet mutable (tema değişimi kökü
  // remount ediyor), tüm `colors` nesnesini UI runtime'ına klonlatmanın anlamı yok.
  const activeColor = colors.text;
  const inactiveColor = colors.textSecondary;
  const colorStyle = useAnimatedStyle(
    () => ({
      color: Math.round(offset.value) === index ? activeColor : inactiveColor,
    }),
    [index, activeColor, inactiveColor],
  );

  return (
    <Animated.Text
      style={[
        {
          fontSize: 16,
          // ⚠️ AĞIRLIK SABİT, seçiliyken kalınlaşmıyor. Görsel tercih olmasının
          // dışında bir de ölçüm sebebi var: kalınlaşan etiket GENİŞLİYOR,
          // `onLayout` yeni ölçüyü bildiriyor ve alt çizgi kayarken hedefi
          // altından değişiyordu — çizgi varış noktasına oturduktan sonra bir tık
          // daha kayıyordu. Seçili olduğunu renk söylüyor.
          fontWeight: "600",
        },
        colorStyle,
        // Oturmuş renk — alt çizgideki `settledUnderlineStyle` ile aynı gerekçe:
        // Reanimated re-render'da animasyonlu değerin yerine İLK render'ınkini
        // basıyor. Taban doğru olunca o kare de doğru. SIRA ÖNEMLİ: animasyon
        // stilinden SONRA.
        { color: isActive ? activeColor : inactiveColor },
      ]}
    >
      {label}
    </Animated.Text>
  );
}

type Props = {
  tabs: Tab[];
  /** Aktif sekme — oturmuş haldeki vurgu rengi ve alt çizgi bunu okuyor. */
  activeTab: string;
  /** Pager'ın anlık konumu (position + offset). Çizgiyi VE şeridin kaydırmasını bu sürüyor. */
  offset: SharedValue<number>;
  onPress: (key: string, index: number) => void;
  /** Şeridin sol/sağ payı — çağıranın sayfa payıyla aynı hattan başlasın diye. */
  inset?: number;
  /**
   * Şerit sola yaslı ve kaydırılabilir değil, ekranın ORTASINDA sabit.
   * Profil ekranında sekmeler header'da logonun yerinde duruyor — orada iki
   * sekme var, kaydırılacak bir şey yok ve hizanın x ekseninin tam ortası
   * olması gerekiyor (iki yandaki header butonlarından bağımsız).
   */
  centered?: boolean;
};

export default function PagerTabBar({
  tabs,
  activeTab,
  offset,
  onPress,
  inset = 16,
  centered = false,
}: Props) {
  // Animated ref: şeridi UI thread'den kaydırıyoruz (bkz. aşağıdaki reaction),
  // JS tarafından `scrollTo` çağrılmıyor.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Kaydırma hesabının iki ölçüsü — worklet'ten okunacakları için shared value.
  // Prepare fonksiyonunda okunuyorlar, yani ölçü değişimi (dönme, dil, adet
  // rakamının belirmesi) reaction'ı kendiliğinden yeniden çalıştırıyor.
  const viewportW = useSharedValue(0);
  const contentW = useSharedValue(0);
  // Şeridin ANLIK kaydırma konumu (yayın çıktısı) ve pager'ın verdiği HAM hedef.
  // İkisi ayrı: hedef her karede değişiyor, konum ona geriden yetişiyor.
  const scrollX = useSharedValue(0);
  const scrollTargetX = useSharedValue(0);
  // Şeridin GERÇEKTEN durduğu yer. Yay kendi çıktısını biliyor ama kullanıcı
  // şeridi parmağıyla da sürükleyebiliyor; o hareket `scrollX`e uğramıyor.
  const realX = useSharedValue(0);
  // Yay oturmuş mu? Oturmuşsa aradaki fark kullanıcının kendi kaydırmasıdır ve
  // bir sonraki yay oradan başlamalı — yoksa şerit önce eski yerine sıçrardı.
  const springIdle = useSharedValue(true);

  const stripScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      realX.value = e.contentOffset.x;
    },
    // Kullanıcı şeridi kendi tutuyorsa yay susuyor: aksi halde her karede
    // scrollTo ile parmağın çektiği şeridi geri çekerdi.
    onBeginDrag: () => {
      cancelAnimation(scrollX);
      springIdle.value = true;
    },
  });
  // Ölçüler state'te, ref'te DEĞİL: çizginin stili bunlara bağlı ve `useAnimatedStyle`
  // yeniden kurulmalı. Yalnız ilk yerleşimde (ve dil değişiminde) yazılıyor.
  const [layouts, setLayouts] = useState<
    Record<string, { x: number; w: number }>
  >({});

  const onTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const cur = prev[key];
      // Aynı ölçü tekrar gelirse state'e dokunma: `onLayout` her yeniden
      // çizimde tetiklenebiliyor ve her seferinde yazmak sonsuz döngü olurdu.
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.w - w) < 0.5) {
        return prev;
      }
      return { ...prev, [key]: { x, w } };
    });
  }, []);

  // Ölçüler sekme SIRASIYLA diziye çevriliyor — interpolasyonun girdisi sayfa
  // indeksi, dolayısıyla sıra pager'ınkiyle birebir olmalı.
  const measured = useMemo(() => {
    const xs: number[] = [];
    const ws: number[] = [];
    for (const tab of tabs) {
      const l = layouts[tab.key];
      if (!l) return null; // biri bile ölçülmediyse çizgi henüz çizilmiyor
      xs.push(l.x);
      ws.push(l.w);
    }
    return { xs, ws };
  }, [tabs, layouts]);

  const underlineStyle = useAnimatedStyle(() => {
    if (!measured || measured.xs.length < 2) return { opacity: 0 };
    const input = measured.xs.map((_, i) => i);
    const w = interpolate(offset.value, input, measured.ws, "clamp");
    const x = interpolate(offset.value, input, measured.xs, "clamp");
    return {
      opacity: 1,
      // scaleX merkeze göre gerdiği için sol kenarı hizalamak adına yarım
      // genişlik ekleniyor.
      //
      // `as const`: RN'in transform tipi her elemanın TEK anahtarlı olmasını
      // istiyor, TS ise heterojen diziyi birleşim olarak çıkarıyor (aynı kaçış
      // LikeCard'ın exitStyle'ında da var).
      transform: [
        { translateX: x + w / 2 - UNDERLINE_BASE_W / 2 },
        { scaleX: w },
      ] as const,
    };
  }, [measured]);

  // Çizginin OTURMUŞ yeri — animasyon stilinin taban değeri.
  //
  // ⚠️ Reanimated her re-render'da animasyonlu stilin yerine İLK render'da
  // yakalanan değeri basıyor (bkz. PropsFilter._initialPropsMap), doğrusunu
  // ancak bir kare sonra `componentDidUpdate` geri yazıyor. Burada o ilk değer
  // `{ opacity: 0 }` (ölçüler henüz yoktu), yani sekme değişiminin geldiği
  // render'da çizgi bir kare kayboluyordu. Taban stil oturmuş sekmeyi
  // taşıdığı için o kare artık doğru. Sıra önemli: animasyon stilinden SONRA.
  const settledUnderlineStyle = useMemo(() => {
    const l = layouts[activeTab];
    if (!l) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [
        { translateX: l.x + l.w / 2 - UNDERLINE_BASE_W / 2 },
        { scaleX: l.w },
      ] as const,
    };
  }, [layouts, activeTab]);

  // Sekmelerin İÇERİK koordinatındaki merkezleri. `onLayout`un verdiği `x`
  // `strip` kabına göre; şerit ise contentContainer'ın `paddingLeft`inden sonra
  // başlıyor — kaydırma offset'iyle aynı eksene gelmesi için `inset` ekleniyor.
  const centers = useMemo(() => {
    if (!measured || measured.xs.length < 2) return null;
    return measured.xs.map((x, i) => inset + x + measured.ws[i] / 2);
  }, [measured, inset]);
  // `interpolate`ın girdi aralığı = sayfa indeksleri. Worklet'in içinde her
  // karede yeniden kurmamak için dışarıda.
  const centerInput = useMemo(
    () => centers?.map((_, i) => i) ?? null,
    [centers],
  );

  // Seçili sekme ŞERİDİN ORTASINA çekiliyor ve bunu PAGER SÜRÜYOR — alt çizgiyle
  // aynı gerekçe (bkz. dosya başı): `activeTab` ancak pager durunca yazılıyor,
  // ona bağlanan bir kaydırma sekmeye "vardıktan sonra" oynardı. Girdi aynı ara
  // değerler olduğu için şerit parmakla birlikte akıyor: sağdaki sekmeye
  // geçerken şerit de sola kayıyor ve sekme kenarda yarım kalmıyor.
  //
  // Önce yalnız BASIŞTA ve yalnız "sığmıyorsa sığacak kadar" kaydırılıyordu;
  // parmakla geçildiğinde şerit hiç oynamıyor, son sekmeler ekranın kenarında
  // kırpık kalıyordu.
  //
  // Uçlarda ortalama YOK: hedef [0, içerik - görüntü] aralığına kırpılıyor, yani
  // ilk/son sekmede şerit kendi ucunda duruyor (aksi halde kenarlarda boşluk
  // açılırdı). Kırpma interpolasyondan SONRA: sıra tersine çevrilirse şerit uçta
  // duracağına ara değerlerde de oynardı.
  //
  // Hesap iki kademeli: pager HEDEFİ veriyor, şeridi bir yay oraya taşıyor.
  // Doğrudan sürülürken şerit parmakla birebir gidiyordu — teknik olarak
  // pürüzsüz ama sert: kaymanın her ufak titremesi ve pager'ın oturduğu andaki
  // son sıçraması aynen şeride geçiyordu. Yay araya girince şerit kayışı bir tık
  // geriden, yavaşlayarak takip ediyor (bkz. SCROLL_SPRING).
  //
  // Programatik `setPage`te (sekmeye basış) pager oturmadan önce son bir
  // onPageScroll daha atıyor (offset tam sayı), yani ara olaylar düşse bile
  // hedef doğru — yay onu yumuşatarak kapatıyor.
  useAnimatedReaction(
    () => ({ pos: offset.value, vw: viewportW.value, cw: contentW.value }),
    ({ pos, vw, cw }) => {
      if (!centers || !centerInput) return;
      const max = cw - vw;
      // Şerit sığıyorsa kaydırılacak bir şey yok. `centered` şeridi de buraya
      // düşüyor: ScrollView hiç kurulmuyor, ölçüler 0 kalıyor.
      if (vw <= 0 || max <= 0) return;
      const center = interpolate(pos, centerInput, centers, "clamp");
      const x = Math.min(Math.max(center - vw / 2, 0), max);
      // Hedef kıpırdamadıysa yayı YENİDEN KURMUYORUZ: her karede yeni bir
      // animasyon nesnesi doğar ve pager dururken (ölçü olayları) süren yay
      // baştan başlardı.
      if (Math.abs(x - scrollTargetX.value) < SCROLL_TARGET_EPSILON) return;
      scrollTargetX.value = x;
      // Duran bir yaydan sonra şerit ELLE kaydırılmış olabilir: yeni hareket
      // ekranda GÖRÜNEN yerden başlasın (bkz. realX). Koşan yayın ortasındaysak
      // dokunulmuyor — orada `scrollX` zaten gerçeğin kendisi.
      if (springIdle.value) scrollX.value = realX.value;
      springIdle.value = false;
      // Yay HER KAREDE yeni hedefe çevriliyor: reanimated koşan animasyonun
      // hızını koruyarak yeniden hedefliyor, yani kayış boyunca tek bir
      // kesintisiz hareket oluyor.
      //
      // Geri çağrı yalnız BİTİŞTE (finished) idle diyor; yeniden hedeflenen veya
      // iptal edilen yay `false` ile geliyor ve o hâlâ süren bir hareket.
      scrollX.value = withSpring(x, SCROLL_SPRING, (finished) => {
        if (finished) springIdle.value = true;
      });
    },
    [centers, centerInput],
  );

  // Yayın çıktısı şeride basılıyor. `animated: false` ŞART: yumuşaklık zaten
  // yaydan geliyor, üstüne bir de kaydırma animasyonu başlatmak iki ayrı
  // yumuşatmayı üst üste bindirip hareketi lastikleştirirdi.
  useAnimatedReaction(
    () => scrollX.value,
    (x) => {
      if (viewportW.value <= 0) return;
      scrollTo(scrollRef, x, 0, false);
    },
    [],
  );

  // Sekmeler + alt çizgi. Kaydırılabilir şeritte ScrollView'ın, ortalanmış
  // şeritte düz bir satırın içine giriyor — ölçüler (`x`) her iki durumda da
  // BU kabın koordinatlarında olduğu için çizgi aynı yere düşüyor.
  const strip = (
    <View>
      <View style={{ flexDirection: "row", gap: TAB_GAP }}>
        {tabs.map((tab, index) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              onLayout={(e) => onTabLayout(tab.key, e)}
              // Şeridi burada kaydırmıyoruz: basış pager'ı çeviriyor, şerit de
              // pager'ın konumundan sürülüyor (bkz. yukarıdaki reaction). İki
              // ayrı kaydırma birbirini keserdi.
              onPress={() => onPress(tab.key, index)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingBottom: 8,
              }}
            >
              <TabLabel
                label={tab.label}
                index={index}
                offset={offset}
                isActive={isActive}
              />
              {tab.count != null && tab.count > 0 && (
                // Adet etiketin mürekkebini PAYLAŞMIYOR: seçili sekmede bile
                // ikincil bilgi, başlıkla aynı ağırlıkta okunmamalı.
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.textSecondary,
                  }}
                >
                  {tab.count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Çizgi sekmelerle AYNI kapta ve mutlak konumlu: ölçüler (`x`) bu kabın
          koordinatlarında, aynı yerde çizilmesi için aynı kapta durmalı. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 0,
            bottom: 0,
            width: UNDERLINE_BASE_W,
            height: UNDERLINE_HEIGHT,
            borderRadius: UNDERLINE_HEIGHT / 2,
            backgroundColor: colors.text,
          },
          underlineStyle,
          settledUnderlineStyle,
        ]}
      />
    </View>
  );

  if (centered) {
    return (
      <View
        style={{
          height: PAGER_TAB_BAR_HEIGHT,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-end",
        }}
      >
        {strip}
      </View>
    );
  }

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Sığan bir şeridi sağa sola oynatmak "kaydırılabilir" diye yanlış bir
      // ipucu verirdi (FilterPills'teki aynı ikili).
      bounces
      alwaysBounceHorizontal={false}
      // Şeridin gerçek konumu + kullanıcının kendi sürüklemesi (bkz. realX).
      // Worklet handler: her kaydırma karesinde köprüden geçen bir olay olsaydı
      // pager'la birlikte akan şerit takılırdı.
      onScroll={stripScrollHandler}
      scrollEventThrottle={16}
      // Ortalama hesabının iki ölçüsü. Kaydırma UI thread'de yapıldığı için
      // ikisi de shared value: state olsalardı her ölçüde şerit yeniden çizilirdi.
      onLayout={(e) => {
        viewportW.value = e.nativeEvent.layout.width;
      }}
      onContentSizeChange={(w) => {
        contentW.value = w;
      }}
      style={{ flexGrow: 0, height: PAGER_TAB_BAR_HEIGHT }}
      contentContainerStyle={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: TAB_GAP,
        paddingLeft: inset,
        paddingRight: inset + 4,
      }}
    >
      {strip}
    </Animated.ScrollView>
  );
}
