import { memo, useCallback, useRef } from "react";
import { Platform, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  Host,
  RNHostView,
  Button as SwiftUIButton,
} from "@expo/ui/swift-ui";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors } from "@/shared/theme/colors";
import type { CampusBoxMetrics } from "./CampusInfoBox";
import CampusMomentFace, { CAMPUS_FACE_CAPTION } from "./CampusMomentFace";
import type { ExpandRect } from "../campusExpandGeometry";
import type { CampusMomentDto } from "../campusTypes";

/**
 * Kampüs anı KUTUSU — yana kayan listenin bir elemanı.
 *
 * 3:4 kutu (istek: "akış ana sayfasındaki sağ üstteki dikdörtgenler gibi"),
 * dış kenarında gri çerçeve + boşluk (`CampusOutlinedBox`), içinde fotoğraf
 * `cover` ile oturuyor; dibinde isim + yaş ve altında paylaşım zamanı.
 *
 * ⚠️ BİR TUR KARE OLDU, GERİ DÖNÜLDÜ: oran ve çerçeve artık akış başlığındaki
 * anlar destesiyle (FeedMomentsPeek) aynı — iki yüzey tek kutu ailesi.
 * En/boy/çerçeve ÜÇÜ DE dışarıdan (şerit veriyor), burada hiçbiri türetilmiyor.
 *
 * ── KARAR ÇİFTİ KALDIRILDI, KART BİR KAPI OLDU (istek) ─────────────────────
 * Fotoğrafın sağ altında cam tik/X duruyordu ve ikisi de gitti. Karta dokunmak
 * artık kişinin PROFİL KARTINI açıyor (`onPress`) ve karar orada veriliyor —
 * akışın yazar kartındaki düzenin birebir aynısı (bkz. FeedScreen >
 * `LikerSwipeModal` + `onDecide`).
 *
 * Gerekçe iki katmanlı:
 *   • 222pt'lik bir karede ad, geri sayım ve iki cam buton aynı anda
 *     duruyordu; kutu "bak" yüzeyi olmaktan çıkıp küçük bir kontrol paneline
 *     dönüşmüştü.
 *   • free kullanıcının günlük tek beğenisi GERİ ALINAMIYOR (sunucuda Rewind
 *     yalnız Keşif satırlarını seçiyor). Kararın profil kartına taşınması
 *     araya bir adım koyuyor: kullanıcı kime "evet" dediğini görmeden
 *     harcamıyor.
 *
 * ⚠️ `onLike`/`onPass`/`busy` prop'ları da bu yüzden YOK. Kararın yolu şerit
 * üzerinden GEÇMİYOR; ekran onu profil kartından alıyor.
 *
 * ── Kendi anım farklı çiziliyor ────────────────────────────────────────────
 * Geri sayım ikisinde de var ama kendi anımda asıl bilgi o: kullanıcı yayında
 * olup olmadığını ve ne kadar kaldığını buradan görüyor. Kendi anıma dokunmak
 * da profil açmıyor (kendine karar veremezsin — UT-7422).
 *
 * ── BASILI TUT → NATİF CONTEXT MENÜ ────────────────────────────────────────
 * Kaldırma ve şikayet kartın üstünde BUTON DEĞİL, uzun basışta açılan iOS
 * menüsünde (istek: "chatscreen'deki balona basılı tutunca olanın aynısı, ama
 * menü natif olsun"). Kart iOS'un kendi "lift" animasyonuyla kalkıp zemin
 * bulanıklaşıyor; menüyü sistem çiziyor.
 *
 * ⚠️ SOHBETTEKİ MENÜNÜN KOPYASI DEĞİL: `MessageActionSheet` elle yazılmış bir
 * `Modal` + klon + Reanimated (natif değil, sadece natif gibi). Burada istenen
 * natif menü olduğu için SwiftUI'ın `.contextMenu`'sü kullanılıyor
 * (`@expo/ui`). Hareketi, zemini, basış sesi/haptiği sistemin.
 *
 * ⚠️ KART SwiftUI'IN İÇİNDE, menü kartın üstünde DEĞİL: `.contextMenu`
 * tetikleyici görünümü kendisi kaldırıyor, yani kaldırılacak şeyin SwiftUI
 * ağacında olması gerekiyor (`RNHostView` RN kartını oraya gömüyor).
 *   • `Host`a SABİT ölçü — `matchContents` ilk karede 0×0 bırakıyor
 *     (CardActionGlassButton'daki aynı kural).
 *   • `Preview` slotu BİLEREK YOK: preview verilince sistem tetikleyiciyi
 *     kaldırmak yerine ayrı bir görünüm çiziyor ve o görünüm için fotoğrafın
 *     İKİNCİ bir kopyası mount edilmek zorunda kalırdı (şeritte N kart × 2).
 *     Preview'suz yol kartın kendisini kaldırıyor — istenen de bu.
 *   • DOKUNUŞ HOST'UN İÇİNDE (yeni): profil kapısı yüzeyin kendisinde, yani
 *     `RNHostView`ın içindeki `AnimatedPressable`da. Üstüne kardeş bir
 *     dokunma katmanı konulamaz — o katman SwiftUI'ın uzun basışını da
 *     yutar ve natif menü hiç açılmaz.
 *
 * ⚠️ iOS DIŞINDA menü YOK: `@expo/ui/swift-ui` iOS'a özel. Android/eski
 * sürümlerde kart düz RN kalıyor ve kendi anım için eski "Kaldır" pill'i geri
 * geliyor — yoksa o platformda anı kaldırmanın HİÇBİR yolu kalmazdı.
 */

/**
 * ── ⚠️ YÜZÜN KENDİSİ ARTIK BU DOSYADA DEĞİL ────────────────────────────────
 *
 * Çerçeve, fotoğraf, moderasyon rozeti ve kutunun ALTINDAKİ isim/yaş/saat
 * bloğu `CampusMomentFace`e taşındı. Sebep orada uzun uzun
 * yazılı, kısası: BÜYÜYEN kart (CampusMomentExpandOverlay) aynı yüzü çizmek
 * zorunda ve iki uygulama ayrı durdukça kaçınılmaz olarak ayrışıyordu —
 * cihazda "basınca kart oynuyor" diye görüldü.
 *
 * Bu dosyada kalan şey kartın DAVRANIŞI: dokunuş (büyütme kapısı), kendi
 * penceresini ölçmesi ve natif uzun basış menüsü.
 */

export interface CampusMomentCardProps extends CampusBoxMetrics {
  moment: CampusMomentDto;
  /** Kutu genişliği — liste veriyor (yandaki kutunun kenarı görünsün diye). */
  width: number;
  /**
   * Kutu yüksekliği — liste veriyor.
   *
   * ⚠️ ORAN BURADA YAZILMIYOR (kutu 3:4 ama en/boy İKİSİ DE dışarıdan):
   * ölçü şeridin kendi hesabından geliyor (`campusCardHeight` + CARD_ASPECT).
   * Burada bir oran yazılsaydı dolgu kutularıyla (CampusInfoBox) yan yana iki
   * farklı yükseklik olurdu.
   */
  height: number;
  /** Şu anın zamanı; geri sayım dakikada bir TEK yerden tazeleniyor. */
  nowMs: number;
  /**
   * KARTA DOKUNULDU — kişinin profil kartını AÇAN tek kapı (istek).
   *
   * Opsiyonel: verilmezse kart dokunulamaz bir yüzey (kendi anım bu dalda).
   * Kararın kendisi burada DEĞİL, açılan profil kartında (gerekçe dosya
   * başında).
   */
  /**
   * KARTA DOKUNULDU — ikinci argüman kartın ÖLÇÜLEN penceresi.
   *
   * Kare büyüyen kartın başlangıç noktası; `null` gelirse hareket uçma
   * fazını atlayıp yerinde büyümeye düşüyor (gerekçe `handlePress`te).
   */
  onPress?: (moment: CampusMomentDto, frame: ExpandRect | null) => void;
  onRemove: (moment: CampusMomentDto) => void;
  /**
   * Başkasının anını şikayet et — uzun basış menüsünden.
   *
   * Opsiyonel: verilmezse menüde şikayet satırı HİÇ çizilmiyor. Ölü bir satır
   * çizmek yerine yok saymak, kabuğun kendi kuralı (bkz. CampusAddChip'in
   * "ölü buton çizilmiyor" notu).
   */
  onReport?: (moment: CampusMomentDto) => void;
}

/**
 * Menü iOS'ta natif, başka yerde YOK (gerekçe dosya başında).
 *
 * ⚠️ Kapı `HAS_LIQUID_GLASS` DEĞİL: cam butonların kapısı iOS 26 çünkü 26
 * altında kazanç yok; `.contextMenu` ise iOS 16'dan beri var ve 26 beklemek
 * için sebep yok.
 */
const HAS_NATIVE_MENU = Platform.OS === "ios";

const CampusMomentCard = memo(function CampusMomentCard({
  moment,
  width,
  height,
  ring,
  gap,
  radius,
  nowMs,
  onPress,
  onRemove,
  onReport,
}: CampusMomentCardProps) {
  const { t } = useTranslation();

  /**
   * ÖĞENİN TOPLAM BOYU — fotoğraf + ALTINDAKİ yazı (istek).
   *
   * ⚠️ ÜÇ YER BUNU OKUMAK ZORUNDA ve üçü de aynı sayıyı: dokunma hedefi
   * (`AnimatedPressable`), ÖLÇÜLEN kare (`frameRef` → büyüyen kartın
   * başlangıcı) ve SwiftUI `Host`un sabit ölçüsü. Biri fotoğraf boyunda
   * kalırsa yazı ya dokunulamaz olur, ya natif menüde kırpılır, ya da büyüme
   * yanlış kareden başlar.
   */
  const itemHeight = height + CAMPUS_FACE_CAPTION;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * BASIŞTA KENDİ PENCERESİNİ ÖLÇÜYOR — büyüyen kart o kareden başlıyor.
   * ══════════════════════════════════════════════════════════════════════════
   * Karta dokunmak kartı ekranın ortasına uçurup büyütüyor; hareketin BAŞLANGIÇ
   * karesi kartın o anda ekranda durduğu yer. Ölçüm burada alınıyor çünkü tek
   * bilen burası: şerit yatay kaydırılıyor, yani kartın yeri her an farklı.
   *
   * ⚠️ ÖLÇÜM BİR KAPI DEĞİL. `measureInWindow` asenkron ve geri çağırmayabilir
   * (jest ortamı, sökülmüş görünüm). Geri çağırmazsa kart yine açılıyor —
   * `frame: null` ile, yani uçma fazı düşüyor ve kart yerinde büyüyor (gerekçe
   * `campusExpandGeometry > start`). Ölçüme bağlı bir kapı, ölçüm gelmediğinde
   * yüzeyi tamamen ölü bırakırdı.
   *
   * ⚠️ BİR KEZ ÇAĞRILIYOR: `settled` bayrağı hem ölçümün hem zaman aşımının
   * ikinci kez çağırmasını engelliyor. İki çağrı iki overlay açardı.
   */
  /**
   * ⚠️ REF KARTIN EN DIŞ KUTUSUNDA, yüzeyin kendisinde DEĞİL: yüzey
   * `AnimatedPressable`ın içinde ve basıldığında 0.97'ye ölçekleniyor —
   * o anda ölçülen kare gerçek kareden küçük çıkardı ve büyüme bir sıçramayla
   * başlardı. Dış kutu basışta kıpırdamıyor.
   */
  const frameRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    let settled = false;
    const fire = (frame: ExpandRect | null) => {
      if (settled) return;
      settled = true;
      onPress(moment, frame);
    };
    const node = frameRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width_, height_) => {
        // Ölçü sıfırsa kare yok sayılıyor: 0×0 bir başlangıçtan büyümek
        // "bir noktadan patlama" gibi okunuyor, oysa kart bir yerden geliyor.
        /**
         * ⚠️🔴 ÖLÇÜLEN KARE YAZIYI İÇERMİYOR: en dış kutu fotoğraf + alt
         * yazı, ama büyüyen kartın hareketi YALNIZ FOTOĞRAFI ölçekliyor
         * (yazı orada kartın kardeşi, taban puntosunda — bkz.
         * CampusMomentFace > `caption`). Yazının payı da gönderilseydi
         * başlangıç karesi gerçekte olduğundan uzun olur ve kart uçuşa
         * fotoğrafın ortasından değil öğenin ortasından başlardı: dokunulan
         * yerden birkaç pt aşağıdan.
         */
        const photoH = height_ - CAMPUS_FACE_CAPTION;
        fire(
          width_ > 0 && photoH > 0
            ? { x, y, width: width_, height: photoH }
            : null,
        );
      });
    }
    /**
     * ⚠️🔴 GÜVENCE GECİKMELİ OLMAK ZORUNDA — `0` YARIŞI KAZANIYORDU.
     *
     * `measureInWindow` sonucu natif taraftan bir sonraki UI tick'inde
     * geliyor; `setTimeout(…, 0)` ise JS kuyruğunun hemen başında koşuyor.
     * Yani güvence neredeyse HER ZAMAN önce ateşleniyordu: kare hep `null`
     * geçiyor, büyüyen kart uçmadan doğrudan hedef boyunda açılıyordu
     * (cihazda "kopya gibi duruyor" diye görüldü).
     *
     * 120ms: ölçümün normalde bir kare sürdüğü düşünülürse fazlasıyla cömert
     * ve yalnız ölçüm HİÇ dönmediğinde ödeniyor — o dalda kart 120ms geç
     * açılıyor, ki alternatifi hiç açılmaması.
     */
    setTimeout(() => fire(null), 120);
  }, [moment, onPress]);

  /**
   * KARTIN YÜZEYİ — çerçeve + fotoğraf, ALTINDA isim/yaş ve saat.
   *
   * ⚠️ DOKUNMA HEDEFİ YAZIYI DA KAPSIYOR (`itemHeight`): yazı kutunun dışında
   * ama kartın parçası — altına basınca da kart açılmalı.
   *
   * ⚠️ DOKUNUŞ EN DIŞTA ve yüzeyin İÇİNDE: iOS'ta bu ağaç `RNHostView` ile
   * SwiftUI'ın içine gömülüyor (uzun basışta kalkan şey bu). Profil kapısı
   * kardeş bir katman olsaydı natif menünün uzun basışını yutardı.
   *
   * ── ÇERÇEVE (istek: "etrafına aynı şekilde border da ekleyelim, boşluk
   * filan da") ───────────────────────────────────────────────────────────────
   * Kart kendi köşesini/kırpmasını ÇİZMİYOR; ikisi de `CampusOutlinedBox`
   * reçetesinden geliyor (yüzün içinden — bkz. CampusMomentFace). Çizgi son
   * turda bir KIL ÇİZGİYE indi ve boşluk kalktı (istek: "borderlarını 0.5px
   * yap ve border ile foto arasındaki boşluğu kaldır") — sayılar ve gerekçe
   * `campusBoxMetrics`te. Aynı reçeteyi şeridin poster kareleri de okuyor.
   *
   * ⚠️ ÇERÇEVE DOKUNUŞUN İÇİNDE, dışında değil: dokunma hedefi kutunun tamamı
   * (çizgiye basmak da profili açıyor) ve basış ölçeği çerçeveyi fotoğrafla
   * birlikte küçültüyor — çizgi sabit kalsa kart camın altından kayıyormuş gibi
   * okunuyordu.
   *
   * ⚠️ BOŞLUK ZEMİNSİZ (kabuğun varsayılanı): arkadan HARİTA görünüyor. Akış
   * destesi oraya sayfa zeminini koyuyor ve gerekçesi orada yazılı — burada
   * arkada harita VAR, yani boşluk gerçekten boş kalmalı.
   */
  const surface = (
    <AnimatedPressable
      pressScale={onPress ? 0.97 : 1}
      onPress={onPress ? handlePress : undefined}
      // ⚠️ Kendi anımda rol/dokunuş YOK: `onPress` verilmiyor ve kabuk
      // erişilebilirlik ağacında buton gibi görünmemeli.
      accessibilityRole={onPress ? "button" : undefined}
      // ⚠️ ETİKET ARTIK "PROFİLİ AÇ" DEMİYOR: dokunuş profil kartını değil
      // kartın kendisini büyütüyor. Eski dize (`campus.openProfile`) sözlükte
      // duruyor — profil ucu (`/campus/moments/{id}/profile`) gelince o yol
      // geri açılacak.
      accessibilityLabel={
        onPress ? t("campus.openCard", { name: moment.displayName }) : undefined
      }
      disabled={!onPress}
      style={{ width, height: itemHeight }}
    >
      <CampusMomentFace
        moment={moment}
        width={width}
        height={height}
        ring={ring}
        gap={gap}
        radius={radius}
        nowMs={nowMs}
        /* Ölçek 1 = şeridin kartı; büyüyen kart 1'den büyük geçiyor (gerekçe
           CampusMomentFace'in başında). */
      />
    </AnimatedPressable>
  );

  /**
   * UZUN BASIŞ MENÜSÜNÜN SATIRLARI — kendi anımda kaldır, başkasınınkinde
   * şikayet. İkisi de `role="destructive"`, yani sistem onları kırmızı
   * çiziyor; renk burada ELLE verilmiyor.
   */
  const menuItems = moment.isMine ? (
    <SwiftUIButton
      role="destructive"
      systemImage="trash"
      label={t("campus.remove")}
      onPress={() => onRemove(moment)}
    />
  ) : onReport ? (
    <SwiftUIButton
      role="destructive"
      systemImage="exclamationmark.bubble"
      label={t("moderation.options.report")}
      onPress={() => onReport(moment)}
    />
  ) : null;

  /**
   * ⚠️ KARAR ÇİFTİ BURADAN KALDIRILDI (istek) — fotoğrafın sağ altındaki cam
   * tik/X satırı artık YOK. Geri konulacaksa iki şey biliniyor olsun:
   *   1. Butonlar `Host`un DIŞINDA, kardeşi olmak zorundaydı (ikisi de birer
   *      SwiftUI `Host`u ve iç içe host denenmedi; üstelik menü açıldığında
   *      kalkan yüzeyde butonların görünmemesi doğru okunuş).
   *   2. Cam ancak şerit YERİNE OTURDUKTAN sonra mount edilebiliyordu
   *      (`actionsReady` kapısı): animasyonlu bir atanın altında doğan cam
   *      sessizce hiç render edilmiyor ve sonradan düzelmiyor. O kapı da
   *      butonlarla birlikte kalktı — şeridin tek müşterisi onlardı.
   * Karar artık profil kartında (bkz. `onPress`).
   */

  /**
   * MENÜSÜZ PLATFORMLARDA eski "Kaldır" pill'i geri geliyor — yoksa anı
   * kaldırmanın hiçbir yolu kalmaz. iOS'ta çizilmiyor: aynı işi yapan iki
   * yüzey kartı kalabalıklaştırır ve istek açıkça uzun basıştı.
   */
  const removePill =
    !HAS_NATIVE_MENU && moment.isMine ? (
      <View style={{ position: "absolute", right: 16, bottom: 16 }}>
        <AnimatedPressable
          pressScale={0.96}
          onPress={() => onRemove(moment)}
          accessibilityRole="button"
          accessibilityLabel={t("campus.remove")}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: colors.mediaChipBg,
          }}
        >
          <Text
            style={{ color: colors.onMedia, fontSize: 14, fontWeight: "600" }}
          >
            {t("campus.remove")}
          </Text>
        </AnimatedPressable>
      </View>
    ) : null;

  /**
   * ⚠️ MENÜSÜ OLMAYAN KART SwiftUI'A HİÇ GİRMİYOR: menüde tek satır bile
   * yoksa (başkasının anı + `onReport` verilmemiş) boş bir menü açan bir
   * tetikleyici kalırdı. O durumda kart düz RN.
   */
  if (!HAS_NATIVE_MENU || !menuItems) {
    return (
      <View ref={frameRef} style={{ width, height: itemHeight }}>
        {surface}
        {removePill}
      </View>
    );
  }

  return (
    <View ref={frameRef} style={{ width, height: itemHeight }}>
      {/* ⚠️ Host'a SABİT ölçü (CardActionGlassButton'daki kural): `matchContents`
          ilk karede 0×0 bırakıyor ve şeritte bir kare boşluk görünürdü.

          ⚠️ `ignoreSafeArea="all"` ŞART — ilk açılışın "üstü kesik, altı
          boşluklu" hatası buradaydı. `Host` bir `UIHostingController` ve
          güvenli alanı KENDİ konumundan hesaplıyor; şerit ekranın ALTINDAN
          `translateY` ile geliyor, yani kart ilk layout anında home
          indicator'ın bandının İÇİNDE doğuyor. O anda uygulanan alt inset
          SwiftUI'ın içerik alanını kısaltıyor, kart yukarı sıkışıyor ve şerit
          yerine oturduğunda düzelmiyor — bir kerelik olmasının sebebi bu. */}
      <Host style={{ width, height: itemHeight }} ignoreSafeArea="all">
        <ContextMenu>
          <ContextMenu.Trigger>
            {/* Kalkan şey BU: RN kartı SwiftUI ağacının içinde.

                ⚠️ `matchContents` BİLEREK YOK. Açık olduğunda `RNHostView`
                SwiftUI çerçevesini RN görünümünün `bounds`unu KVO ile izleyip
                kuruyor (`ApplySizeFromYogaNode`): ilk değer görünüm daha
                ölçülmeden okunuyor, yani bir kare yanlış/0 çerçeve oluşuyor ve
                menü o çerçeveyi kaldırdığı için kart kesik görünüyordu.
                Kapalıyken çerçeve Host'un SABİT ölçüsü oluyor ve RN kartı onu
                dolduruyor — ölçüm turu hiç yok. Kartın kendi `width/height`i
                de aynı sayı, yani iki taraf tanım gereği eşit. */}
            {/* ⚠️ DOKUNUŞ DA BU AĞACIN İÇİNDE: `surface`ın en dışı bir
                `TouchableOpacity` (profil kapısı). Kartın üstüne kardeş bir
                dokunma katmanı konulamaz — o katman sistemin uzun basışını da
                yutar ve natif menü hiç açılmaz. İki jest birlikte çalışıyor:
                `UIContextMenuInteraction` eşiği geçtiğinde RN'in dokunuşunu
                iptal ediyor (kısa basış profili, uzun basış menüyü açıyor).
                CİHAZDA DOĞRULANMALI — bu ağaçta ilk kez iç içe duruyorlar. */}
            <RNHostView>{surface}</RNHostView>
          </ContextMenu.Trigger>
          <ContextMenu.Items>{menuItems}</ContextMenu.Items>
        </ContextMenu>
      </Host>
    </View>
  );
});

export default CampusMomentCard;
