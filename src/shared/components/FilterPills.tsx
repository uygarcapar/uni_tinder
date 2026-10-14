import { useCallback, useRef } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  type LayoutRectangle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import SFIcon from "@/shared/components/SFIcon";
import { ChevronDown } from "@/shared/icons";
import { colors, ink } from "@/shared/theme/colors";

// Tab filtre pilleri — MessagesScreen ve LikesScreen aynı görünümü paylaşıyor.
// tabs: [{ key, label, count? }], activeTab: seçili key, onChange: (key) => void.
// `count` isteğe bağlı: verildiyse ve 0'dan büyükse etiketin sağında sayı
// çizilir. Dış boşluk/animasyon çağıran ekranda yönetilir; burası sadece pill
// satırını render eder.
//
// Pill'de ÜRÜN İKONU YOK ve bilerek yok: denendi, ürün işaretleri (fire kalbi /
// not balonu) bu ölçekte kapsülü şişirip satırı kalabalıklaştırıyordu. Sekmenin
// ne olduğunu etiket zaten söylüyor.
//
// `chevron` BAŞKA BİR ŞEY ve opt-in: pill bir SEKME değil, bir açılır seçici
// olduğunda (akışın kampüs/sıralama/filtre satırı — her pill kendi sheet'ini
// açıyor) etiketin sağına chevron.down giriyor. Sekme şeritlerinde (Mesajlar,
// Beğeniler) KAPALI kalmalı: orada basış sayfa değiştiriyor, aşağı açılan bir
// şey yok ve chevron olmayan bir menü vaat ederdi.
//
// `maxLabelWidth` (tab başına): uzun etiket — ör. üniversite adı — kapsülü
// ekran dışına taşırmasın, kırpılsın. Verilmeyen pill'ler eskisi gibi
// içeriklerine göre büyüyor.
//
// Satır YATAY KAYDIRILABİLİR. Sabit `flex-row` iken 4. sekme ("Kaçırdıkların")
// dar ekranlarda taşıyordu — pill genişliği etiket uzunluğuna ve kullanıcının
// yazı tipi ölçeğine bağlı olduğu için bu, sekme sayısıyla sınırlı bir sorun
// da değil (Beğeniler artık 5 sekme taşıyor). İçerik sığdığında görünüm birebir
// aynı, sığmadığında pill'ler kırpılmak yerine serbestçe sürüklenebiliyor.
//
// `bounces` + `alwaysBounceHorizontal={false}` İKİSİ BİRDEN: bu ikili "yalnız
// içerik taşıyorsa yaylan" demek. Tek başına `bounces={false}` satırı uçlarda
// sert durduruyordu (sürükleme yarıda kesiliyormuş gibi); tek başına `bounces`
// ise sığan bir satırı da sağa sola oynatır, sekmeler kaydırılabilirmiş gibi
// yanlış bir ipucu verirdi.
//
// `bleed`: satırı SAYFANIN yan padding'inden kurtarır. Bu bileşen genelde
// padding'li bir liste/kabın içinde duruyor; o padding kaydırma alanını da
// daraltıyor, yani pill'ler ekranın kenarına varmadan 16px içeride kesiliyor ve
// satır "kırpılmış" gibi duruyordu. Çağıran kendi yan payını veriyor: kutu
// negatif marjla TAM GENİŞLİĞE açılıyor, aynı pay contentContainer'a padding
// olarak geri konuyor. Sonuç: duruşta hiza birebir aynı (pill'ler kartlarla
// aynı hattan başlar), sürüklerken pill'ler ekran kenarına kadar gider.
//
// `inset`: duruştaki hizayı `bleed`den AYIRIR. İkisi normalde aynı sayıdır ama
// kabın yan payı içerikten dar olabiliyor (ör. Beğeniler'de kartlar kenara
// yakın, satır ise sayfa başlığıyla hizalı). Bu durumda `bleed` hâlâ kabın payı
// olmalı — satırın çerçevesi tam ekran genişliğinde açılsın diye; `inset` ise
// pill'lerin nerede durduğunu söyler. Verilmezse `bleed` kullanılır.
//
// Basılan pill EKRANA ÇEKİLİYOR: kenarda yarısı görünen bir sekmeye basmak onu
// seçiyor ama yerinde bırakıyordu — seçili kapsül yarısı kırpılmış duruyor ve
// hangi sekmede olunduğu ancak sürükleyince görülüyordu. Hareket EN AZ: pill
// zaten tamamen görünüyorsa satır kıpırdamıyor, taşıyorsa yalnız sığacak kadar
// kayıyor (ortalamak, sığan pill'lerde bile satırı oynatırdı).
const PILL_SCROLL_PEEK = 12;

export default function FilterPills({
  tabs,
  activeTab,
  onChange,
  style,
  bleed = 0,
  inset,
  chevron = false,
}: any) {
  // Duruş payı: verilmediyse bleed'in kendisi (eski davranış birebir korunur).
  const restInset = inset ?? bleed;
  const scrollRef = useRef<ScrollView>(null);
  // Ölçüler ref'te, state'te DEĞİL: hiçbiri render'ı etkilemiyor (yalnız basışta
  // okunuyorlar) ve her kaydırma karesinde state yazmak satırı yeniden çizerdi.
  const pillLayouts = useRef<Record<string, LayoutRectangle>>({});
  const scrollX = useRef(0);
  const viewportW = useRef(0);
  const contentW = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );

  const revealPill = useCallback((key: string) => {
    const box = pillLayouts.current[key];
    const viewport = viewportW.current;
    // Ölçüler daha gelmediyse (ilk karede basış) hiç kaydırmıyoruz: yanlış bir
    // yere sıçramaktansa yerinde kalmak doğru.
    if (!box || !viewport) return;
    // Uçlarda takılmasın: içerik sığıyorsa `max` 0 olur ve her hedef 0'a
    // kırpılır, yani satır hiç oynamaz.
    const max = Math.max(0, contentW.current - viewport);
    const from = scrollX.current;
    // Pill kenara YAPIŞMASIN: bir tık pay bırakınca komşusunun ucu görünüyor ve
    // satırın devamı olduğu belli oluyor.
    const needLeft = box.x - PILL_SCROLL_PEEK;
    const needRight = box.x + box.width + PILL_SCROLL_PEEK - viewport;
    const to = Math.min(
      max,
      Math.max(0, needLeft < from ? needLeft : needRight > from ? needRight : from),
    );
    // Bir pikselin altındaki fark için animasyon başlatmak, duran satırı
    // titretmekten başka bir şey yapmıyor.
    if (Math.abs(to - from) < 1) return;
    scrollRef.current?.scrollTo({ x: to, animated: true });
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces
      alwaysBounceHorizontal={false}
      overScrollMode="never"
      // Kaydırma konumu basışta okunacak: hedef pill'in görünür olup olmadığı
      // ancak o an nerede olduğumuzu bilerek hesaplanıyor.
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={(e) => {
        viewportW.current = e.nativeEvent.layout.width;
      }}
      onContentSizeChange={(w) => {
        contentW.current = w;
      }}
      // Negatif marj ÖNCE, çağıranın style'ı SONRA: ekran kendi marjını
      // (ör. marginBottom) yazabilsin.
      style={[bleed ? { marginHorizontal: -bleed } : null, style]}
      contentContainerStyle={{
        flexDirection: "row",
        // ⚠️ `center` ŞART, varsayılan `stretch` DEĞİL. Yatay ScrollView'da
        // içerik kabı, ScrollView'ın çerçevesi kadar yükseliyor; `stretch` ile
        // pill'ler o çerçeveye GERİLİYOR ve kendi paylarından (9) daha uzun
        // çiziliyorlar. Beğeniler'de fark yoktu (kap serbest yükseklikte,
        // çerçeve zaten pill boyunda), Mesajlar'da satır SABİT yükseklikli bir
        // kutunun içinde (bkz. PILLS_HEIGHT) — aynı bileşen iki ekranda farklı
        // boyda pill çiziyordu. Ortalanınca pill her yerde kendi ölçüsünde.
        alignItems: "center",
        gap: 8,
        paddingLeft: restInset,
        // Sağda birkaç px fazladan: son pill sürüklemenin sonunda ekran
        // kenarına yapışmasın, satırın bittiği yer belli olsun.
        paddingRight: restInset + 4,
      }}
    >
      {tabs.map((tab: any) => {
        // `tab.filled`: pill SEÇİLİ OLMADAN da dolu çizilsin. Tek seçimli bir
        // şerit olmayan satırlarda (akışın kampüs/sıralama/filtre pill'leri —
        // `activeTab` boş geçiliyor) hiçbir pill dolu çizilmiyordu; kampüs
        // pill'i ise sayfanın hangi akışa baktığını söyleyen DURUM bilgisi,
        // komşularıyla aynı dolgusuz kabukta kalması onu bir seçenek gibi
        // gösteriyordu.
        const isActive = activeTab === tab.key || !!tab.filled;
        // Etiket ve sayı TEK mürekkepten: dolu pill'in zemini `inverseSurface`
        // (açık modda siyah, koyuda beyaz), yazı da onun üstüne yazılan
        // `onInverseSurface` — yani ters mod. İkisi aynı çiftten geldiği için
        // kontrast her iki temada kendiliğinden doğru.
        const inkColor = isActive ? colors.onInverseSurface : colors.text;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={1}
            onPress={() => {
              onChange(tab.key);
              revealPill(tab.key);
            }}
            // `layout.x` içerik kabına göre — kabın kendi `paddingLeft`i
            // (bleed) de içinde, yani kaydırma offset'iyle aynı eksende.
            onLayout={(e) => {
              pillLayouts.current[tab.key] = e.nativeEvent.layout;
            }}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              flexDirection: "row",
              alignItems: "center",
              // Dikey pay yataydan belirgin KÜÇÜK: 13/14 iken pill'ler neredeyse
              // kare oranındaydı ve 12px etiketin etrafında şişkin duruyorlardı.
              // Kapsül biçimi (borderRadius 999) yatayda uzun, dikeyde dar bir
              // kutuda okunur.
              paddingHorizontal: 12,
              paddingVertical: 9,
              backgroundColor: isActive ? colors.inverseSurface : "transparent",
              borderWidth: 1,
              borderColor: ink(0.25),
            }}
          >
            <Text
              // Kırpma YALNIZ `maxLabelWidth` verilen pill'de: tek satıra
              // kilitlemek genel kural olsaydı, yazı tipi ölçeğini büyüten
              // kullanıcıda sığmayan etiket sessizce kesilirdi — oysa satır
              // zaten yatay kaydırılabilir, orada doğrusu büyümek.
              numberOfLines={tab.maxLabelWidth ? 1 : undefined}
              style={{
                color: inkColor,
                // "600" = semibold (sistem yazı tipi; bu satırda özel bir
                // fontFamily yok, yani ağırlık doğrudan eşleşiyor).
                fontWeight: "600",
                // Pay küçülünce etiket kapsülün içinde ufak kalıyordu: 14px
                // sekme adını okunur yapıyor ve pill yüksekliğini payların
                // kırptığı kadarını geri veriyor.
                fontSize: 14,
                ...(tab.maxLabelWidth
                  ? { maxWidth: tab.maxLabelWidth, flexShrink: 1 }
                  : null),
              }}
            >
              {tab.label}
            </Text>
            {/* Adet — etiketin sağında, YALNIZ dolu sekmede. Sıfır yazmıyoruz:
                boş sekmeyi "0" ile işaretlemek her satıra bilgi taşımayan bir
                rakam eklerdi; sayının yokluğu zaten "burada bir şey yok" demek.
                Sayı bilinmiyorsa (sekme daha çekilmediyse `count` verilmez)
                yine çizilmiyor — 0 göstermek yanlış bilgi olurdu.

                Etiketle AYNI mürekkep ve AYNI ağırlık — soluk değil: sayı
                etiketin bir parçası, ayrı bir dipnot değil. */}
            {typeof tab.count === "number" && tab.count > 0 && (
              <Text
                style={{
                  marginLeft: 5,
                  color: inkColor,
                  fontWeight: "600",
                  fontSize: 14,
                }}
              >
                {tab.count}
              </Text>
            )}
            {/* Chevron EN SAĞDA — sayının da sağında: okuma sırası "ne / kaç
                tane / açılır". Mürekkep etiketle AYNI `inkColor`, yani seçili
                kapsülün ters zemininde de okunuyor.
                Ölçü 13: 14px etiketin yanında 16 (sayfa satırlarındaki glif
                ölçüsü) kapsülü dikeyde şişiriyordu. */}
            {chevron && (
              <SFIcon
                name="chevron.down"
                fallback={ChevronDown}
                size={13}
                color={inkColor}
                strokeWidth={2.5}
                weight="semibold"
                style={{ marginLeft: 5 }}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
