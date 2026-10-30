import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  Host,
  RNHostView,
  Button as SwiftUIButton,
} from "@expo/ui/swift-ui";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import { devLog } from "@/shared/utils/devLog";
import { colors, scrimAt } from "@/shared/theme/colors";
import {
  CampusOutlinedBox,
  type CampusBoxMetrics,
} from "./CampusInfoBox";
import type { ExpandRect } from "../campusExpandGeometry";
import { campusPhotoUri } from "../campusPhotoUri";
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
 * ── DİPTEKİ RAMPA: ARTIK PROGRESSIVE BLUR (istek) ──────────────────────────
 *
 * Fotoğrafın dibi düz bir siyah gradyanla (%38 yükseklik, alfa 0 → 0.78)
 * kararıyordu. Yerine Keşif kapağının reçetesi geldi (bkz. SwipeCard >
 * "KAPAĞIN DİBİNDEKİ RAMPA"): maskeli `BlurView` + hafif progressive siyahlık,
 * yani bulanıklık YUKARI DOĞRU AZALARAK sönüyor.
 *
 * Neden blur: düz alfa fotoğrafın DESENİNİ bırakıyor ve 222pt'lik bir karede
 * desen yazının harflerinin arasından geçiyor (aynı gerekçe CampusMapScrim'in
 * başında, orada harita çizgileri için yazılı). Blur deseni çözüyor, yani aynı
 * okunurluk DAHA AZ karartmayla geliyor — fotoğraf da bastırılmıyor.
 *
 * ⚠️ BANT YAZI BLOĞUNDAN TÜRÜYOR, kutu boyundan DEĞİL: istek "isim/yaşa kadar"
 * ve blok artık iki satır (ad + zaman). Orana bağlı kalsaydı 200pt'lik kutuda
 * bant bloğun ortasında biter, 300pt'lik kutuda fotoğrafın yarısını yerdi.
 */

/** Yazı bloğunun yan ve alt payı. */
const TEXT_INSET = 16;
const TEXT_BOTTOM = 16;
/** Ad satırı (22/700) ve zaman satırı (13) — bandın hesabı bunları okuyor. */
const NAME_LINE = 26;
const TIME_LINE = 16;
/**
 * BANT TAM YAZI BLOĞU KADAR — ADIN TEPESİ TAVAN (istek: "blur daha az yukarı
 * çıksın, alttaki ismin tepesine kadar max").
 *
 * ⚠️ KUYRUK KALDIRILDI: bandın yazı bloğunun 28pt ÜSTÜNDE bittiği bir hâli
 * vardı (sönüm boş fotoğrafta erisin diye) ve bu, bulanıklığı istenenden
 * yukarı taşıyordu. Bant artık adın tepesinde BİTİYOR, yani sönüm bandın
 * KENDİ İÇİNDE tamamlanmak zorunda — gerekçe `RAMP_FADE_SHARE`de.
 */
const RAMP_HEIGHT = TEXT_BOTTOM + TIME_LINE + NAME_LINE;
/**
 * SÖNÜM AD SATIRININ BOYU KADAR — yani maske tam adın hizasında şeffaflaşıyor.
 *
 * Böylece zaman satırı ve altındaki pay bandın DOLU kısmında (küçük, soluk
 * gri yazının okunurluğu oraya bağlı), ad ise sönümün içinde: 22/700 bir yazı
 * yarı güçte bir perdede de rahat okunuyor, üstelik en üst ucunda perde
 * neredeyse yok — kesim gözle seçilmiyor.
 *
 * ⚠️ Bandın yarısı (Keşif kapağının reçetesi) BURADA YANLIŞ: 58pt'lik bir
 * bantta yarı sönüm 29pt, yani sönüm zaman satırının ortasında başlıyor ve o
 * satır perdesiz kalıyordu.
 */
const RAMP_FADE_SHARE = NAME_LINE / RAMP_HEIGHT;

/**
 * ⚠️🔴 DEV TEŞHİSİ — 403'ün İKİ AYRI SEBEBİNİ AYIRIYOR.
 *
 * Cihazda görülen hata: `invalid response status code 403` + çıplak bir S3
 * adresi. 403'ün iki okuması var ve İKİSİNİN ÇÖZÜMÜ AYNI TARAFTA DEĞİL:
 *   • İMZA YOK   → kova gizli, sunucu imzasız bir adres veriyor. Sözleşmenin
 *                  §4'ü bunu zaten yasaklıyor (imzalı URL ya da opak CDN yolu).
 *   • İMZA VAR ama ömrü kısa/geçmiş → yine §4: imza anın `expiresAt`ini
 *     AŞMALI (≥25 saat), yoksa kart birkaç saat sonra kendiliğinden kararıyor.
 *
 * Ham URL'i basmak bunu söylemiyordu: adres uzun, etikette kırpılıyor ve imza
 * parametreleri tam kuyruğunda kalıyor. Bu yüzden URL'in KENDİSİ değil ÖZETİ
 * yazılıyor — host + imza var mı + ne kadar ömür verilmiş.
 */
function describeSignature(url: string): string {
  try {
    const parsed = new URL(url);
    const expiresIn = parsed.searchParams.get("X-Amz-Expires");
    const signed = parsed.searchParams.has("X-Amz-Signature");
    return [
      parsed.host,
      signed ? `imza VAR (X-Amz-Expires=${expiresIn ?? "?"}sn)` : "İMZA YOK",
    ].join("\n");
  } catch {
    return url;
  }
}

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
   * PAYLAŞIM ZAMANI — Mesajlar ekranının BİREBİR formatı (istek).
   *
   * ⚠️ "2 saat önce" DEĞİL ve bu bilinçli: istek açıkça "timestampleri de
   * MessagesScreen'deki gibi yap" dedi ve o reçete (bkz.
   * shared/utils/formatRelativeTime) bugün için SAATİ yazıyor ("14:32"), dün
   * için "Dün". Anlar 24 saat yaşadığı için pratikte bu iki dalın dışına
   * çıkılmıyor. Uygulamada ikinci bir zaman dili açmamak kendi başına bir
   * değer: aynı kullanıcı aynı oturumda Mesajlar, Akış ve burada aynı biçimi
   * görüyor (akışın kartı da bunu kullanıyor).
   *
   * ⚠️ `nowMs` BAĞIMLILIK: dakikalık tik yalnız geri sayımı değil bu satırı da
   * tazeliyor (gece yarısını geçen bir an "Dün"e dönmek zorunda) ve etiket
   * kartın kendi zamanlayıcısı olmadan güncelleniyor.
   */
  const postedAt = useMemo(
    () => formatRelativeTime(moment.createdAt, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moment.createdAt, t, nowMs],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * GÖSTERİLECEK ADRES — göreli yol gelirse API tabanına bağlanıyor.
   * ══════════════════════════════════════════════════════════════════════════
   * Sözleşme `photoUrl`i MUTLAK bekliyor (bkz. backend_campus_moments_2026-10
   * §4: anın ömrünü aşan imzalı URL ya da opak CDN yolu) ve uygulamanın başka
   * hiçbir yerinde foto adresi istemcide KURULMUYOR — profil fotoları da mutlak
   * geliyor, o yüzden ortak bir yardımcı yok.
   *
   * Buradaki tek iş bir YEDEK: alan göreli bir yol (`/uploads/…`) ya da çıplak
   * bir `objectKey` ile gelirse `expo-image` isteği hiç kurmuyor ve kart sessizce
   * gri kalıyor — "foto gözükmüyor"un en olası sebeplerinden biri bu ve istemci
   * tarafında kapatılabilir olan tek dal.
   *
   * ⚠️ TAHMİN ÜRETMİYOR: şema varsa dokunulmuyor, `/` ile başlıyorsa tabana
   * ekleniyor, ne o ne bu ise (çıplak key) `null` dönüyor — uydurma bir yol
   * kurup 404'e düşmek, boş kalmaktan daha kötü (teşhisi de gizler).
   */
  const photoUri = useMemo(() => campusPhotoUri(moment), [moment]);

  /**
   * ⚠️🔴 KULLANILAMAZ URL'İ DEV'DE DUYULUR YAP — `onError`in GÖRMEDİĞİ dal.
   *
   * `expo-image` boş ya da şema taşımayan bir kaynakta isteği hiç kurmuyor,
   * yani hata olayı da ATILMIYOR: kutu sessizce kendi gri zemininde kalıyor.
   * Teşhiste tam olarak bu yüzden tıkanıldı — "foto gelmedi" ile "URL hiç
   * yoktu" ekranda aynı görünüyor.
   *
   * Sunucu sözleşmesi `photoUrl`i mutlak bir http(s) adresi olarak veriyor
   * (bkz. backend_campus_moments_2026-10 §4: imzalı URL ya da opak CDN yolu).
   * Göreli bir yol ya da çıplak `objectKey` gelirse kart ÇİZİLİYOR ama boş —
   * ve o hâli yalnız bu log söylüyor.
   */
  useEffect(() => {
    if (photoUri) return;
    devLog("[campus] an fotoğrafının URL'i kullanılamaz", {
      momentId: moment.id,
      isMine: moment.isMine,
      photoUrl: moment.photoUrl,
    });
  }, [moment.id, moment.isMine, moment.photoUrl, photoUri]);

  /**
   * ⚠️🔴 GÖRÜNÜR TEŞHİS — ÜÇ TUR TAHMİNDEN SONRA KONDU.
   *
   * "Foto gözükmüyor, gri gözüküyor" üç kez bildirildi ve ekranda ayırt
   * edilemedi: boş URL, 403 veren imzasız adres, ölçü hatası ve "foto gerçekten
   * yok" HEPSİ aynı gri kutu. Metro log'u da elde olmayınca teşhis tıkandı.
   *
   * Artık sebep KARTIN ÜSTÜNDE yazıyor (yalnız DEV): kullanıcı ekrana bakıp
   * söyleyebiliyor. Release'de tek bir piksel bile çizilmiyor (`__DEV__`).
   *
   * ⚠️ `isMine` AYRIMI YOK: başkasının anı da aynı sebepten boş kalabiliyor ve
   * o hâlde de görmek gerekiyor (iki kartı karşılaştırmak teşhisin yarısı).
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const diagnostic = !__DEV__
    ? null
    : !photoUri
      ? `URL YOK/GÖRELİ\n${String(moment.photoUrl)}`
      : loadError
        ? `YÜKLENEMEDİ\n${loadError}\n${describeSignature(photoUri)}`
        : null;

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
        fire(width_ > 0 && height_ > 0 ? { x, y, width: width_, height: height_ } : null);
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
   * DİPTEKİ RAMPANIN MASKESİ — yukarı doğru şeffaflaşıyor.
   *
   * `easeGradient` olmadan iki duraklı doğrusal bir maske blur'un bittiği
   * yerde gözle seçilen bir kesim bırakıyor (aynı gerekçe CampusMapScrim'de).
   */
  const rampMask = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "transparent" },
          [RAMP_FADE_SHARE]: { color: "black" },
          1: { color: "rgba(0,0,0,0.99)" },
        },
      }),
    [],
  );

  /**
   * KARTIN YÜZEYİ — çerçeve, fotoğraf, rampa, kapsüller, isim + zaman.
   *
   * ⚠️ DOKUNUŞ EN DIŞTA ve yüzeyin İÇİNDE: iOS'ta bu ağaç `RNHostView` ile
   * SwiftUI'ın içine gömülüyor (uzun basışta kalkan şey bu). Profil kapısı
   * kardeş bir katman olsaydı natif menünün uzun basışını yutardı.
   *
   * ── ÇERÇEVE (istek: "etrafına aynı şekilde border da ekleyelim, boşluk
   * filan da") ───────────────────────────────────────────────────────────────
   * Kart kendi köşesini/kırpmasını artık ÇİZMİYOR; ikisi de `CampusOutlinedBox`
   * reçetesinden geliyor — dıştan içe GRİ ÇİZGİ → BOŞLUK → fotoğraf. Aynı kutu
   * akış başlığındaki anlar destesinde de duruyor (FeedMomentsPeek), yani iki
   * yüzey TEK uygulamayı paylaşıyor.
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
      style={{ width, height }}
    >
      <CampusOutlinedBox
        width={width}
        height={height}
        ring={ring}
        gap={gap}
        radius={radius}
        /**
         * Fotoğraf çözülene (ya da hiç gelmeyene) kadar görünen tek şey.
         *
         * ⚠️ `surface2` DEĞİL `surface4` (istek: "foto gözükmüyorsa kart içinde
         * beyaz değil de gri olsun, hafif"). Açık paletteki surface2 (#EAEAEE)
         * kâğıt üstünde gri ama kendi çerçevesinin ve altındaki haritanın
         * yanında BEYAZ okunuyordu — foto gelmeyen kart boş bir kart değil
         * delik gibi duruyordu. surface4 iki modda da yükseltilmiş yüzey
         * (açıkta #DDDDE2 → koyulaşıyor, koyuda #2A2A2A → açılıyor), yani
         * "hafif gri" ikisinde de aynı yönden geliyor.
         *
         * ⚠️ ÇERÇEVENİN KENDİ GRİ DOLGUSU (FILL_ALPHA) BURADA HÂLÂ YANLIŞ: o
         * YARI SAYDAM ve blok burada bir yüzey değil, fotoğrafın ZEMİNİ — foto
         * çözülürken haritayı kutunun içinden gösterirdi. Opak kalmak zorunda.
         */
        fill={colors.surface4}
      >
        <Image
          // ⚠️ `moment.photoUrl` DEĞİL `photoUri`: göreli yol tabana bağlanıyor,
          // kullanılamaz alan `null`a düşüyor (gerekçe `photoUri`de). `null`
          // kaynak expo-image'da sessiz — zaten istenen o, kutu kendi zemininde
          // kalıyor ve DEV'de sebebi üstünde yazıyor.
          source={photoUri ? { uri: photoUri } : null}
          /**
           * ⚠️ MUTLAK SERİLİYOR, yüzde ÖLÇÜYLE DEĞİL.
           *
           * Fotoğraf artık çerçevenin iki kat iç içe kutusunun (boşluk katmanı
           * → iç blok) çocuğu ve o blok `alignItems/justifyContent: center`:
           * yüzde ölçü orada ebeveynin KESİN boyuna bağlı, mutlak seriliş ise
           * hizalamadan ve yüzde çözümlemesinden tamamen bağımsız. Poster
           * kutusunun afişi de aynı yolu kullanıyor (CampusInfoBox) ve o yol
           * bu kabuğun içinde kanıtlanmış olan.
           */
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // `photoUrl` 24 saat SABİT (imzasız, opak anahtar) → cache anahtarı
          // olarak güvenilir. İmzalı bir URL olsaydı her yenilemede değişir ve
          // disk cache'i işe yaramazdı.
          cachePolicy="memory-disk"
          recyclingKey={moment.photoUrl}
          transition={160}
          /**
           * ⚠️🔴 SESSİZ BAŞARISIZLIĞI DUYULUR YAPAN SATIR.
           *
           * `expo-image` yüklenemeyen bir kaynakta HİÇBİR ŞEY söylemiyor: kutu
           * kendi zemininde (gri) kalıyor ve ekranda "foto yok" ile "foto
           * gelmedi" birbirinden ayırt edilemiyor. Teşhis tam burada tıkandı —
           * gri bir kart hem benim çerçeve değişikliğimle hem bozuk bir URL
           * ile aynı görünüyor.
           *
           * Log DEV-only (`devLog` release'de no-op) ve URL'i AÇIK basıyor:
           * boş/göreli bir yol, imzasız bir S3 adresi (403) ve süresi geçmiş
           * bir imza (404/403) birbirinden ancak böyle ayrılıyor.
           */
          onError={({ error }) => {
            devLog("[campus] an fotoğrafı yüklenemedi", {
              momentId: moment.id,
              isMine: moment.isMine,
              photoUrl: moment.photoUrl,
              error,
            });
            // Metro'ya değil EKRANA da yazılıyor (gerekçe `diagnostic`te).
            if (__DEV__) setLoadError(String(error ?? "bilinmeyen hata"));
          }}
        />

        {/* ⚠️🔴 YALNIZ DEV: fotoğrafın NEDEN olmadığı kartın üstünde.
            Release'de bu düğüm hiç doğmuyor — gerekçe `diagnostic`te. */}
        {diagnostic ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: 6,
              padding: 6,
              borderRadius: 8,
              backgroundColor: scrimAt(0.72),
            }}
          >
            <Text
              numberOfLines={6}
              style={{
                color: colors.onMedia,
                fontSize: 9,
                lineHeight: 11,
                fontWeight: "600",
              }}
            >
              {diagnostic}
            </Text>
          </View>
        ) : null}

        {/* DİPTEKİ RAMPA — yukarı doğru AZALAN progressive blur + hafif
            progressive siyahlık (istek). Üstünde ad + yaş ve zaman satırı
            duruyor; ikisi de medya mürekkebi, yani altında açık bir fotoğraf
            olabilir. Reçete ve ölçüler dosyanın başındaki blokta. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: RAMP_HEIGHT,
          }}
        >
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={rampMask.colors as any}
                locations={rampMask.locations as any}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            {/* Perde İKİ TEMADA DA KOYU: fotoğraf açık modda da fotoğraftır ve
                beyaz bir perde altındaki fotoyu yıkıyor (aynı gerekçe
                CampusMapScrim'in başında uzun uzun yazılı). Sayılar Keşif
                kapağının dibiyle birebir — 0.10 → 0.42. */}
            <LinearGradient
              colors={[scrimAt(0.1), scrimAt(0.42)]}
              style={StyleSheet.absoluteFill}
            />
            <BlurView
              intensity={22}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        </View>

        {/* ⚠️ SOL ÜSTTEKİ GERİ SAYIM KAPSÜLÜ KALDIRILDI (istek: "sol üstteki
            pilli kaldır"). "3 saat kaldı" yazan medya kapsülü buradaydı ve
            `campusCountdownText` ile dakikalık tikten besleniyordu.

            Geri konulacaksa iki şey biliniyor olsun: (1) metin üreteci duruyor
            (`campusCountdown.ts`, testli) ve dizeleri sözlükte
            (`campus.expiresIn*`); (2) süresi dolan anların listeden düşmesi bu
            kapsüle BAĞLI DEĞİL, ayrı bir süzgeç (`filterLiveMoments`) — kapsül
            gitti, 24 saat kuralı yerinde. Kuralı hâlâ söyleyen bir yüzey var:
            dolgu kutularından biri "24 SAAT" yazıyor. */}

        {/* ROZET YALNIZ "İNCELENİYOR" — "Senin anın" KALDIRILDI (istek).
            ⚠️ MODERASYON DURUMU BURADA GÖRÜNÜR OLMALI: sağlayıcı cevap
            vermediğinde an YAZILIYOR ama kimseye görünmüyor (`Pending` +
            `isVisibleToOthers: false`) ve kota da harcanmış sayılıyor. Kullanıcı
            "yayında" sanmasın diye rozet "inceleniyor" diyor.

            ⚠️ İKİ DURUMLU BİR ROZETTİ ve ikinci durumu ("Senin anın") gitti:
            kendi anı olduğunu kullanıcı ZATEN biliyor (fotoğraf kendisinin) ve
            etiket her kendi anında kalıcı olarak duruyordu. Rozet artık yalnız
            kullanıcının göremediği bir şeyi söylüyor — bir ŞART, süs değil.
            Kendi anımın diğer iki ayırt edici yanı yerinde: profil açılmıyor
            (UT-7422) ve uzun basışta menüde "Kaldır" çıkıyor.

            ⚠️ `isMine` KAPISI DURUYOR: moderasyon bloğu başkalarının anında da
            dolu gelebiliyor ve "inceleniyor" yalnız SAHİBİNİ ilgilendiriyor.
            ⚠️ `isVisibleToOthers` SUNUCUDAN; `status === "Approved"` kontrolü
            silinmiş/kaldırılmış/süresi dolmuş hâlleri kaçırıyor.

            ⚠️🔴 İKİ DURUM AYRIŞTI (2026-10-29): rozet bir süre `isVisibleToOthers
            === false` olan HER hâle "İnceleniyor" diyordu ve REDDEDİLMİŞ an da o
            dala düşüyordu — yani karar verilmiş bir ana "bekliyor" deniyordu.
            Backend teyidi: redde S3 nesnesi siliniyor, yani o kart bir daha ASLA
            dolmayacak; kullanıcıya bekleme değil sonuç söylenmeli. Ayrım
            `status` üzerinden, `isVisibleToOthers` üzerinden DEĞİL: ikisi de
            false ve ikisini ayıran tek alan o. */}
        {moment.isMine &&
        moment.moderation &&
        moment.moderation.isVisibleToOthers === false ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: colors.mediaChipBg,
            }}
          >
            <Text
              style={{ color: colors.onMedia, fontSize: 12.5, fontWeight: "600" }}
            >
              {moment.moderation.status === "Rejected"
                ? t("campus.photoRemoved")
                : t("campus.underReview")}
            </Text>
          </View>
        ) : null}

        {/* İSİM, YAŞ — ALTINDA PAYLAŞIM ZAMANI (istek).
            Yaş `null` ise HİÇ yazılmıyor (kullanıcı gizlemiş) — "0" ya da tire
            yazmak gizliliği bozulmuş gibi okunurdu. Ayraç VİRGÜL (istek):
            arada iki boşluk vardı ve Keşif kartının dilinden geliyordu; orada
            ad 33pt, burada 22pt ve o ölçekte boşluk "iki ayrı satır" gibi
            okunuyordu. Virgül yaşı adın bir parçası yapıyor.
            ⚠️ Virgül `age` dalının İÇİNDE: yaş gizliyse ortada sahipsiz bir
            virgül kalırdı.

            ⚠️ SAĞ PAY ARTIK YAN PAYLA AYNI (16): blok bir dönem `right: 100` ile
            duruyordu çünkü sağ altta karar çifti vardı. Butonlar kalkınca o pay
            uzun adları sebepsiz kırpıyordu. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: TEXT_INSET,
            right: TEXT_INSET,
            bottom: TEXT_BOTTOM,
          }}
        >
          {/* ⚠️ YAŞ ADIN KALINLIĞINI PAYLAŞIYOR (istek: "isim ve yaş, fontların
              aynı yap"). İç içe `<Text>` artık kendi `fontWeight`ini
              getirmiyor; tek fark virgül. Ayrı bir kalınlık Keşif kartından
              devralınmıştı — orada ad 33pt ve ağırlık farkı bir hiyerarşi
              kuruyor; 20pt'de aynı fark "iki ayrı alan" gibi okunuyordu.
              ⚠️ İç `<Text>` yine de DURUYOR: silinirse virgül yaş gizliyken
              sahipsiz kalır (bkz. aşağıdaki not). */}
          <Text
            numberOfLines={1}
            style={{
              color: colors.onMedia,
              // 22 → 20 (istek: "bir tık küçült"). `NAME_LINE` SABİT kaldı:
              // dipteki rampanın boyu ondan türüyor (RAMP_HEIGHT) ve satır
              // yüksekliği puntoyla birlikte düşseydi perde de kısalırdı.
              fontSize: 20,
              lineHeight: NAME_LINE,
              fontWeight: "700",
            }}
          >
            {moment.displayName}
            {typeof moment.age === "number" ? `, ${moment.age}` : null}
          </Text>
          {/* ZAMAN GRİ (istek) — `onMediaMuted`, `textMuted` DEĞİL: satır
              fotoğrafın üstünde duruyor ve tema ile dönen bir gri açık modda
              kendi perdesinin içinde kayboluyor (medya mürekkebi kuralı). */}
          {postedAt ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.onMediaMuted,
                fontSize: 13,
                lineHeight: TIME_LINE,
                fontWeight: "500",
              }}
            >
              {postedAt}
            </Text>
          ) : null}
        </View>
      </CampusOutlinedBox>
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
      <View ref={frameRef} style={{ width, height }}>
        {surface}
        {removePill}
      </View>
    );
  }

  return (
    <View ref={frameRef} style={{ width, height }}>
      {/* ⚠️ Host'a SABİT ölçü (CardActionGlassButton'daki kural): `matchContents`
          ilk karede 0×0 bırakıyor ve şeritte bir kare boşluk görünürdü.

          ⚠️ `ignoreSafeArea="all"` ŞART — ilk açılışın "üstü kesik, altı
          boşluklu" hatası buradaydı. `Host` bir `UIHostingController` ve
          güvenli alanı KENDİ konumundan hesaplıyor; şerit ekranın ALTINDAN
          `translateY` ile geliyor, yani kart ilk layout anında home
          indicator'ın bandının İÇİNDE doğuyor. O anda uygulanan alt inset
          SwiftUI'ın içerik alanını kısaltıyor, kart yukarı sıkışıyor ve şerit
          yerine oturduğunda düzelmiyor — bir kerelik olmasının sebebi bu. */}
      <Host style={{ width, height }} ignoreSafeArea="all">
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
