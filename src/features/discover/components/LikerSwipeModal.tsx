import { useCallback, useEffect, useMemo, useState } from "react";
import SheetBlurBackdrop from "@/shared/components/SheetBlurBackdrop";
import { View, Alert, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SwipeCard from "@/features/discover/components/SwipeCard";
import { previewCoverHeight } from "@/features/discover/components/cardPreviewGeometry";
import CardGlassBackdrop from "@/features/discover/components/CardGlassBackdrop";
import CardSheetScrollView from "@/features/discover/components/CardSheetScrollView";
import CardStickyHeader, {
  CARD_CHROME_TOP_DROP,
  CARD_EXPANDED_CORNER_RADIUS,
} from "@/features/discover/components/CardStickyHeader";
import ProfileOptionsSheet from "@/features/discover/components/ProfileOptionsSheet";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import { useSwipeMutation } from "@/features/discover/swipeQueries";

/**
 * ── YATAY SWIPE JESTİ KALDIRILDI (istek: "artık swipe yok") ─────────────────
 *
 * Kart buradan da parmakla savrulmuyor. Keşif'teki destede 2026-10-13'te
 * yapılan temizliğin aynısı (bkz. SwipeWrapper > "YATAY SWIPE JESTİ
 * KALDIRILDI"): karar KAPAKTAKİ tik/X cam butonlarında — fotoğrafın sağ alt
 * kolonunda, Keşif'tekiyle birebir aynı bileşen ve aynı sıra.
 *
 * Birlikte giden parçalar:
 *   • `tx` + `rotate` (kartın eğilerek kayması) ve yana UÇUŞ animasyonu
 *     (`EXIT_DISTANCE`): karar anında kart yerinde duruyor, sheet kapanıyor.
 *   • `SwipeOverlay` (sürükleme oranıyla yanan büyük tik/çarpı rozeti) —
 *     sürüklenecek bir şey yok, rozetin sürecek sinyali de.
 *   • Pinch sırasında yatay sürüklemeyi geri alan `cancelDragForPinch` +
 *     `photoPinchActive` reaksiyonu: artık iki jest çakışmıyor.
 *   • Eşik haptic'i (`SWIPE_THRESHOLD`) ve sheet'in `failOffsetX` ayarı —
 *     ikincisi yalnız yatay jestin sheet'ten önce davranabilmesi için vardı,
 *     kalkınca aşağı çekerek kapatma varsayılan davranışına döndü.
 *   • İLK AÇILIŞ DEMOSU (`likerSwipeTutorialShown` bayrağı, perde + sağa/sola
 *     salınan oklar): öğrettiği hareket ortada yok. MMKV'de kalan eski bayrak
 *     artık okunmuyor, zararsız.
 *
 * @param swipeDisabled Kart yalnız OKUNUR açılır: X/tik satırı ve Fire yok;
 *   şikayet/engelle kalır. "Kaçırdıkların" sekmesi için —
 *   orada verilebilecek tek yanıt KURTARMA (hak harcar, bkz. LikesScreen'deki
 *   `handleRecover`) ve liste kartı da zaten sadece o butonu çiziyor. Detay
 *   açıldığında swipe'ın canlı kalması, listede olmayan bir aksiyonu (pas /
 *   beğen) kotasız bir arka kapıdan sunuyordu.
 *
 * @param onDecide Yatay kararı ÇAĞIRANA devreder: verildiğinde keşif swipe
 *   ucuna istek ATILMIYOR (`useSwipeMutation` atlanıyor) ve `onSwipe` de
 *   çağrılmıyor — modal yalnız "sağa mı sola mı" bilgisini verip kapanıyor.
 *
 *   AKIŞ YANITLARI İÇİN: orada karar bir beğeni değil, yanıtın KABULÜ ya da
 *   REDDİ (ayrı uçlar, ayrı kotalar — bkz. feedQueries > useAcceptReply /
 *   useDismissReply). Sağ (tik) = kabul, sol (X) = geç. Kapaktaki butonlar,
 *   X/tik satırı ve moderasyon aynen çalışıyor; değişen tek şey kararın
 *   gittiği yer.
 *
 *   ⚠️ `onSwipe` yolundaki ENGELLEME dalı bundan etkilenmiyor: engelleme her
 *   iki modda da moderasyon servisinden geçiyor ve `onSwipe?.(userId,
 *   "block")` ile haber veriliyor. Yanıt tarafında o haberi dinleyen listeyi
 *   tazeleme işi çağıranda.
 *
 * @param mode Aksiyonun hangi uygulama modunda yapıldığı ("Dating"/"Friends").
 *   Swipe isteğine iliştiriliyor (sunucu satırı o modun altına yazıyor ve
 *   karşılıklı beğeniyi AYNI modda arıyor) ve kartın Fire/Spark rengini
 *   belirliyor. Verilmezse sunucu Dating sayıyor.
 *
 * @param allowFire Fire/Spark butonu ÇİZİLSİN Mİ. Varsayılan KAPALI ve bu
 *   bilinçli: bu modalın asıl kullanıcısı "seni beğenenler" listesi ve orada
 *   Fire anlamsız — karşı taraf seni zaten beğenmiş, yükseltecek bir şey yok.
 *   AKIŞ KARTINDA açık: orada karşı tarafın seni beğenip beğenmediğini
 *   bilmiyorsun, yani Fire gerçek bir sinyal.
 *
 * @param onNote Not kutularını açan kapı. `SwipeCard` sözleşmesi gereği
 *   VERİLMEZSE not kutuları HİÇ çizilmiyor — "seni beğenenler"de not zaten
 *   gönderilmiş olabiliyor ve ikinci bir not kanalı kafa karıştırırdı.
 *
 * @param allowLike DÜZ BEĞENİ (tik) çizilsin mi. Varsayılan AÇIK: "seni
 *   beğenenler"de kartın tek anlamlı cevabı o. Akışta tik yalnız BEĞENİLMİŞ
 *   kartta var (karşı taraf seni zaten beğenmişse kabul/reddet çiftini
 *   kuruyor, bkz. feedCardActions); akışın NORMAL kartında kapalı — orada
 *   sinyal ya Fire ya not olmak zorunda. Kapalıyken `onLike` SwipeCard'a hiç
 *   verilmiyor, yani ne kapaktaki cam tik ne de panelin dibindeki büyük tik
 *   çiziliyor; X (geç) ve moderasyon aynen duruyor.
 *
 * @param allowPass X (geç) çizilsin mi. Varsayılan AÇIK: "seni beğenenler"de
 *   kartın iki anlamlı cevabından biri o (diğeri `allowLike`). Akışın NORMAL
 *   kartı bunu kapatıyor — kart karşı taraftan gelen bir sinyale cevap değil,
 *   kendi açtığın profil; reddedilecek bir şey yok. Akışın BEĞENİLMİŞ kartı
 *   açık bırakıyor, orada `allowLike` ile birlikte kabul/reddet çiftini
 *   kuruyor. Kapalıyken `onPass` SwipeCard'a `undefined` geçiyor —
 *   `allowLike`'ın aynı kuralı: `undefined` ŞART, "çizilsin ama basılmasın"
 *   DEĞİL, ölü buton kullanıcıya olmayan bir yol gösterir.
 *
 * @param fireBlocked Fire kotası/bakiyesi TÜKENMİŞ. Buton çizilmeye devam
 *   ediyor ama basıldığında istek ATILMIYOR: `onFireBlocked` çağrılıyor ve
 *   kararı çağıran veriyor (Keşif'te toast + paket sheet'i — bkz. DiscoverScreen
 *   > showFireLimitUi). Butonu gizlemek yanlış olurdu: satın alınabilir bir
 *   ürünün kapısı o.
 *
 *   ⚠️ Kapı BURADA ŞART, çünkü sunucunun reddi `uiBus` ile duyuruluyor ve o
 *   olayı YALNIZ Keşif dinliyor; Keşif lazy mount olduğu için akıştan atılan
 *   Fire tükenmişken hiçbir geri bildirim üretmiyordu (feedEntry.ts'teki aynı
 *   tuzak).
 */
export default function LikerSwipeModal({
  visible,
  profile,
  onClose,
  onSwipe,
  onDecide,
  swipeDisabled = false,
  mode,
  allowFire = false,
  allowLike = true,
  allowPass = true,
  fireBlocked = false,
  onFireBlocked,
  onNote,
  superLikesRemaining,
}: any) {
  const swipeMutation = useSwipeMutation();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  /**
   * DETENTLER: ① yalnız ana fotoğraf ② tam ekran (istek: "ilk açıldığında
   * snappoint sadece ana foto kadarı açılsın").
   *
   * İlk durak ana fotoğraf bloğunun boyunun TA KENDİSİ (bkz.
   * previewCoverHeight): kart "kapak kadar" açılıyor, kararın iki butonu
   * (fotoğrafın sağ altındaki tik/X) ilk karede elin altında ve detaylar yukarı
   * çekilince geliyor. Sayı elle yazılmıyor — fotoğrafın oranından türüyor,
   * yoksa sheet'in dibi ile fotoğrafın dibi birbirinden kayıyor.
   *
   * İçerik en üstteyken yukarı çekiş sheet'i ikinci durağa taşıyor (gorhom'un
   * scrollable koordinasyonu, bkz. CardSheetScrollView); aşağı çekiş ilk
   * duraktan kapatıyor.
   *
   * SABİT İKİ ELEMAN, fotoğrafın varlığına göre DEĞİŞMİYOR: dizi açıkken
   * uzunluk değiştirirse gorhom mevcut index'i başka bir yüksekliğe eşliyor ve
   * sheet kendiliğinden zıplıyor. Fotoğrafsız profilde de aynı ilk durak
   * kullanılıyor (orada "kapak" yok ama aynı yükseklik makul bir ön bakış).
   *
   * Dar/alçak ekranda ilk durak tam ekranı aşabiliyor (oran 1.43w): o zaman tek
   * detente düşülüyor — artan snapPoints şartı gorhom'un sözleşmesi.
   */
  const snapPoints = useMemo(() => {
    const full = windowHeight - insets.top;
    const cover = Math.round(previewCoverHeight(windowWidth));
    return cover < full ? [cover, full] : [full];
  }, [windowWidth, windowHeight, insets.top]);
  // Şikayet edilen kullanıcı — sheet kapandıktan SONRA açılan ReportModal'ın
  // hedefi. Sheet'in `profile`'ı o an null'lanabildiği için ayrı tutulur.
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  // Şeridin sağ üstündeki üç noktanın açtığı menü (bkz. ProfileOptionsSheet).
  // Kart sheet'inin ÜSTÜNE biniyor, onu kapatmıyor.
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Top'a çarpma zoom'u — scroll CardSheetScrollView'da, foto katmanı SwipeCard'da.
  const photoZoom = useSharedValue(0);
  /*
   * `scrollY` KALDIRILDI — PreviewModal'daki ikiziyle aynı gerekçe: tek
   * müşterisi sticky şeritteki "24 saat içerisinde aktif" satırının sönme
   * eşiğiydi, satır şeritten tamamen çıktı (bkz. CardStickyHeader).
   */

  /*
   * ŞERİDİN KAPANIŞTA SÖNMESİ KALDIRILDI (istek: "kapatırken header yok
   * olmasın") — PreviewModal'daki ikiziyle birebir aynı, uzun gerekçe orada.
   *
   * Kısası: `sheetY` + `sheetIndex` + `useCardSheetHeaderReveal` üçlüsü şeridin
   * `progress`ini sürüyordu; prop artık verilmiyor, şerit kartla birlikte
   * kayıyor. `animatedPosition` / `animatedIndex` de geçilmiyor — AppBottomSheet
   * ikisini de kendi üretiyor. Hook'un dosyası silindi.
   */

  /**
   * Kartın zemini: ana fotoğrafın blur'lu hali (bkz. CardGlassBackdrop).
   * Sheet çiziyor, kart değil — gerekçe aşağıda, çizildiği yerde.
   *
   * Kapı fotoğraf: fotoğrafsız profilde SwipeCard da eski gri paneline düşüyor
   * (`glassPanel`), zemin çizmek onun altında görünmez bir katman olurdu.
   */
  const backdropUri: string | undefined = profile?.photos?.[0];

  useEffect(() => {
    // Kart kapandıysa üstündeki menü de kapanır: sheet kapanışı menüden
    // geçmeyen yollardan da gelebiliyor (buton kararı, backdrop, liste
    // tazelemesi).
    if (!visible) setOptionsOpen(false);
  }, [visible]);

  const handleSwipe = (direction: "left" | "right") => {
    // Karar devredilmişse keşif ucuna HİÇ dokunulmuyor (bkz. `onDecide`):
    // yanıt kabul/reddi ayrı uçlar ve buradan bir de swipe atmak kullanıcının
    // kotasından sessizce yiyordu.
    if (onDecide) {
      onDecide(direction);
      onClose?.();
      return;
    }
    const userId = profile?.userId;
    if (userId) {
      // `mode`: sunucu swipe satırını o modun altına yazıyor; karşılıklı
      // beğeni kontrolü AYNI modda yapılıyor (çapraz-mod eşleşme üretmiyor).
      swipeMutation.mutate({ direction, userId, mode });
      onSwipe?.(userId, direction);
    }
    onClose?.();
  };

  // ── Moderasyon (kart altındaki kırmızı satırlar) ─────────────────────────
  // Şikayet sheet'i kartın ÜSTÜNE açılıyor, kart AÇIK KALIYOR — üç noktanın
  // menüsüyle (ProfileOptionsSheet) birebir aynı düzen.
  //
  // ⚠️ Eskiden burada `onClose?.()` vardı: kart önce kapanıyor, şikayet sonra
  // açılıyordu. İki bottom sheet'in üst üste binmesinden kaçınmak içindi ama
  // bedeli, şikayetten vazgeçen kullanıcının kartı kaybetmesiydi — geri
  // dönecek bir yer kalmıyordu, listeden yeniden bulup açmak gerekiyordu.
  // Üst üste binme sorunu `stackBehavior="push"` ile çözülüyor (aşağıda):
  // gorhom'un varsayılanı "switch" ve alttaki sheet'i MİNİMİZE ediyor, yani
  // kart yine gözden kayboluyor.
  const handleReportPress = useCallback(() => {
    setReportTarget(profile?.userId ?? null);
  }, [profile?.userId]);

  const handleBlockPress = useCallback(() => {
    const userId = profile?.userId;
    if (!userId) return;
    Alert.alert(
      t('moderation.block.confirmTitle'),
      t('moderation.block.confirmMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('moderation.block.confirmButton'),
          style: "destructive",
          onPress: async () => {
            try {
              await moderationService.blockUser(userId);
              // direction "block": LikesScreen bunu listeden düşürmek için
              // kullanır ama "kaçırdın" toast'ını ATMAZ — o yalnız pass'e özel.
              onSwipe?.(userId, "block");
              onClose?.();
              Alert.alert(
                t('moderation.block.successTitle'),
                t('moderation.block.successMessage'),
              );
            } catch {
              Alert.alert(t('common.error'), t('moderation.block.error'));
            }
          },
        },
      ],
    );
  }, [profile?.userId, onClose, onSwipe, t]);

  /**
   * Fire/Spark — ÇIKIŞ ANİMASYONU YOK; tik/X ile aynı sessizlik.
   *
   * Fire'ın yönü "up" ve görsel karşılığı kartın hareketi DEĞİL, alev
   * kutlaması — o da global (MatchModal / FireFlame, bkz. flameSweep).
   *
   * Modal kapanıyor: karar verildi, kartta yapacak bir şey kalmadı.
   */
  const triggerFire = () => {
    // Kota/bakiye bitmiş: istek ATILMIYOR. Kart da KAPANMIYOR — kararı çağıran
    // veriyor (toast + paket sheet'i) ve kullanıcı vazgeçerse kaldığı kartta
    // kalıyor. Sunucuya gönderip reddi beklemek, geri bildirimi `uiBus`a (yani
    // yalnız Keşif'in dinlediği bir kanala) bırakmak olurdu.
    if (fireBlocked) {
      onFireBlocked?.();
      return;
    }
    const userId = profile?.userId;
    if (userId) {
      swipeMutation.mutate({ direction: "up", userId, mode });
      onSwipe?.(userId, "up");
    }
    onClose?.();
  };

  /**
   * Tik / X — kararın TEK yolu (jest yok, bkz. dosyanın başındaki not).
   *
   * Kapaktaki cam butonlar ve panelin dibindeki büyük X/tik satırı aynı
   * fonksiyona bağlı: kart yerinde kalıyor, istek atılıyor ve sheet kapanıyor.
   * Keşif'teki jestsiz deste de aynı şekilde davranıyor.
   */
  const triggerAction = (direction: "left" | "right") => {
    handleSwipe(direction);
  };

  const renderBackdrop = useCallback(
    (props: any) => <SheetBlurBackdrop {...props} />,
    [],
  );

  return (
    <>
      <AppBottomSheet
        visible={visible}
        onClose={onClose}
        // İKİ DETENT: ana fotoğraf → tam ekran (yukarıda `snapPoints`).
        // Üst durak safe-area çizgisinde, Keşif'te expand edilen kartın
        // oturduğu yerde (bkz. SwipeWrapper > HEADER_COVER) ve uygulamanın tam
        // ekran sheet'leriyle (AppModal `fullScreen`) aynı tepede.
        //
        // TARİHÇE: bir dönem [ekranın %85'i, tam ekran] idi ve alt durak elle
        // seçilmiş bir yüzdeydi; "kartı okumak için ikinci bir jest gerekiyor"
        // diye tek detente indirildi. Alt durak şimdi geri geldi ama artık
        // KEYFİ DEĞİL — ana fotoğrafın boyu (istek).
        snapPoints={snapPoints}
        topInset={insets.top}
        handleComponent={null}
        backdropComponent={renderBackdrop}
        // Kartın ve sticky şeridin köşesiyle AYNI — varsayılan 36, kartın
        // köşesiyle üst üste binip uyumsuz iki eğri gösteriyordu. (Burada
        // yalnız sheet'in kendi zeminini etkiliyor: clipContent kapalı,
        // kırpmayı kartın kabuğu yapıyor.)
        cornerRadius={CARD_EXPANDED_CORNER_RADIUS}
        cornerCurve="continuous"
        // Sheet KIRPMASIN — köşeyi aşağıdaki kart kabuğu kendi çiziyor
        // (gerekçe kabuğun style'ında).
        clipContent={false}
        backgroundStyle={{ backgroundColor: "transparent" }}
        enablePanDownToClose
        enableContentPanningGesture
        enableHandlePanningGesture
        // Sheet'in kendi pan'i eşiksiz çalışıyordu: iki parmak fotoğrafın
        // üstünde birbirinden uzaklaşırken en ufak dikey kayma bile "aşağı
        // çekip kapat" olarak yakalanıp pinch'i (PinchZoomable) kesebiliyordu.
        // 10px pay büyütmenin önce aktive olmasına yetiyor; kapatma ve üst
        // detente çekme jestleri o eşikten sonra aynen çalışıyor (PreviewModal
        // ile aynı ayar).
        //
        // ⚠️ `failOffsetX` BURADA YOK ARTIK: o, yatay swipe jestinin sheet'ten
        // önce davranabilmesi içindi (jest kalktı, bkz. dosyanın başı). Geri
        // koyma — diyagonal bir çekişte sheet'in pan'ini öldürüp kapatmayı
        // engelliyor.
        activeOffsetY={[-10, 10]}
      >
        <View style={{ flex: 1, position: "relative" }}>
          {profile && (
            <View
              style={{
                flex: 1,
                // KART KABUĞU BURADA KAPANIYOR, sheet'te değil
                // (bkz. yukarıdaki `clipContent={false}`).
                //
                // Yarıçap = KEŞİF KARTININ YÜZÜ: sheet safe-area
                // çizgisinde açılıyor, yani üst köşeler donanım
                // maskesinden uzak ve kartın Keşif'teki köşesinden
                // ayrılması için bir sebep yok (bkz.
                // CARD_EXPANDED_CORNER_RADIUS'un tarihçesi). Kabuk,
                // şeridin kırpması ve sheet clip'i aynı sayıyı okumak
                // zorunda — üçüncü kopya için bkz. CARD_CORNER_RADIUS notu.
                //
                // `borderCurve: "continuous"` aşağıda ve ŞART: zincirdeki
                // her yüzey squircle çizmeli, yoksa aynı yarıçapta bile
                // eğriler kenar boyunca birbirini kesiyor.
                //
                // ALT KÖŞELER KARE, bilerek: kartın dibi ekranın dibi,
                // orayı yuvarlatmak duran kartta ekranın alt köşelerinden
                // arkadaki perdeyi sızdırırdı.
                borderTopLeftRadius: CARD_EXPANDED_CORNER_RADIUS,
                borderTopRightRadius: CARD_EXPANDED_CORNER_RADIUS,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              {/* Kartın sabit zemini — ana fotoğrafın blur'lu hali.
                  SHEET ÇİZİYOR, kart değil: burada scroll kartın DIŞINDA ve
                  kayan şey kartın kendisi, zemin kartın içinde olsaydı
                  içerikle birlikte kayardı (bkz. CardGlassBackdrop ve
                  SwipeCard'daki `glassPanel` notu). Scroll'un DIŞINDA: dikey
                  scroll'da yerinde kalır — sticky şeritle aynı kural.
                  Sırası önemli: scroll'un ÖNÜNDE, her şeyin altında. */}
              {backdropUri && <CardGlassBackdrop uri={backdropUri} />}

              {/* Scroll'u CardSheetScrollView yapar — sheet'in scrollable
                  koordinasyonu buna bağlı: içerik en üstteyken aşağı çekince
                  sheet sürüklenip kapanır. SwipeCard'ın kendi ScrollView'ı
                  (expanded={false}) kapalı; ikisi birden açık olsa içteki
                  native scroll dikey jesti yutup kapatmayı bloke ediyordu.
                  Bounce/zoom davranışı Discover'daki kartla aynı. */}
              <CardSheetScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 0 }}
                zoomImpact={photoZoom}
                // Zemin varken alt uçtaki bounce boşluğunu o dolduruyor;
                // kuyruk onun üstüne opak bir şerit çizerdi.
                fillOverscroll={!backdropUri}
              >
                <SwipeCard
                  profile={profile}
                  previewMode
                  expanded={false}
                  // Fire varsayılan olarak KAPALI (gerekçe yukarıda);
                  // akış kartı onu açıyor.
                  hideFire={!allowFire}
                  // Kartın Fire/Spark rengi ve adı moda göre.
                  mode={mode}
                  // `onNote` verilmezse SwipeCard not kutularını hiç
                  // çizmiyor — kapı tek yerde.
                  onNote={onNote}
                  superLikesRemaining={superLikesRemaining}
                  // Okunur kartta (swipeDisabled) kapaktaki tik/X ve
                  // panelin dibindeki X/tik satırı birlikte kalkar: ikisi
                  // AYNI aksiyonun iki yolu, birini bırakmak kapıyı
                  // kapatmamak olurdu. Moderasyon ikonları kalır — SwipeCard
                  // `hideActions` halinde onları kendi ortalanmış satırında
                  // çiziyor (bkz. showModeration).
                  hideActions={swipeDisabled}
                  zoomImpact={photoZoom}
                  // X opt-out: akışın NORMAL kartında reddedilecek bir sinyal
                  // yok (kendi açtığın profil), `allowPass` onu kapatıyor.
                  // `undefined` vermek ŞART — aynı gerekçe `allowLike` ile.
                  onPass={allowPass ? () => triggerAction("left") : undefined}
                  // DÜZ BEĞENİ opt-out: `allowLike` kapalıyken prop hiç
                  // verilmiyor → SwipeCard tiki ne kapakta ne panelin dibinde
                  // çiziyor (bkz. prop'un notu). `undefined` vermek ŞART,
                  // "çizilsin ama basılmasın" DEĞİL: ölü buton kullanıcıya
                  // olmayan bir yol gösterir.
                  onLike={allowLike ? () => triggerAction("right") : undefined}
                  // Fire keşifteki ile AYNI yön: "up". `allowFire` kapalıysa
                  // buton hiç çizilmiyor, bu kol da ölü kalıyor.
                  onFire={allowFire ? triggerFire : undefined}
                  onReport={handleReportPress}
                  onBlock={handleBlockPress}
                />
              </CardSheetScrollView>

              {/* Kartın sabit başlığı: isim/yaş YALNIZ burada — kartın
                  içinde ayrıca çizilmiyor, o yüzden scroll beklemeden açık
                  duruyor. Scroll'un DIŞINDA: dikey scroll'da yerinde
                  kalır. */}
              <CardStickyHeader
                profile={profile}
                alwaysOpen
                // Keşif'teki köşe butonlarıyla AYNI pay. Sheet artık
                // safe-area'nın altında başladığı için sıfır — sabit yine de
                // okunuyor ki iki bağlam ayrışmasın (bkz.
                // CARD_CHROME_TOP_DROP).
                topInset={CARD_CHROME_TOP_DROP}
                // Bandın kendi kırpması — sarmalayıcı kabukla AYNI sayı ve
                // aynı eğri. Kabuktan yuvarlak kalırsa üst köşelerde kabuğun
                // içinde kalan ama bandın dışına düşen, camsız bir dilim
                // görünür.
                radius={CARD_EXPANDED_CORNER_RADIUS}
                // Sohbetten açılan profil önizlemesindeki üç noktanın aynısı
                // — kart tam ekranı kapladığı için ekranın kendi başlığı
                // erişilemez oluyor. Açtığı menü orada dört satır, burada
                // İKİ: henüz eşleşme yok (bkz. ProfileOptionsSheet).
                onMenu={() => setOptionsOpen(true)}
                // Sol uçtaki cam "kapat" — sohbet/profil önizlemesindekinin
                // aynısı. Sheet'in kendi kapanış yolundan geçiyor (`onClose`
                // parent'ın `visible`ını düşürüyor); aşağı çekerek kapatma
                // jesti de aynen duruyor.
                onClose={onClose}
                // `progress` VERİLMİYOR → şerit hiç sönmüyor; gerekçe
                // yukarıda, kaldırılan hook'un yerinde.
              />
            </View>
          )}
        </View>
      </AppBottomSheet>

      {/* Üç noktanın menüsü — kart sheet'inin ÜSTÜNE biniyor (`push`), kart
          açık kalıyor. Seçilen aksiyonlar kartın altındaki kırmızı satırlarla
          AYNI handler'lar: şikayet kartı kapatıp ReportModal'ı açıyor, engelle
          onayı kendi soruyor. */}
      <ProfileOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        stackBehavior="push"
        onReport={handleReportPress}
        onBlock={handleBlockPress}
      />

      {/* Şikayet akışı — üç noktanın menüsü gibi kartın ÜSTÜNE biniyor
          (`push`), kart açık kalıyor. Vazgeçen kullanıcı swipe-down/backdrop
          ile kartın kendisine dönüyor.
          ⚠️ `stackBehavior` ŞART: gorhom varsayılanı "switch" ve alttaki
          sheet'i minimize ediyor — kart "önce kapandı" görüntüsü aynen geri
          gelirdi. */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget}
        stackBehavior="push"
        onSuccess={(result: any) => {
          // Şikayetle birlikte engellediyse bu kişi listede kalmasın.
          if (result?.blocked && reportTarget) {
            onSwipe?.(reportTarget, "block");
          }
          // Şikayet GÖNDERİLDİ → kart da kapanır. Açık bırakmak, az önce
          // şikayet edilen (ve çoğu zaman engellenmiş) profilin üstünde
          // bırakırdı; engellenmişse kart zaten listeden düşmüş oluyor.
          // Vazgeçme yolu bundan AYRI: orada `onSuccess` hiç çağrılmıyor,
          // yalnız şikayet sheet'i kapanıp kart ortaya çıkıyor.
          onClose?.();
        }}
      />
    </>
  );
}
