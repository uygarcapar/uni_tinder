import { memo, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type AnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { modeAccent } from "@/features/discover/modeTheme";
import { campusPostedAgoText } from "../campusCountdown";
import { useCampusPhotoGlow } from "../campusPhotoGlow";
import { devLog } from "@/shared/utils/devLog";
import { colors, scrimAt } from "@/shared/theme/colors";
import { CampusOutlinedBox, type CampusBoxMetrics } from "./CampusInfoBox";
import { campusPhotoUri } from "../campusPhotoUri";
import type { CampusMomentDto } from "../campusTypes";

/**
 * KAMPÜS ANININ YÜZÜ — çerçeve + fotoğraf, ALTINDA isim/yaş ve saat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NİYE AYRI DOSYA: İKİ YÜZEY AYNI KARTI ÇİZMEK ZORUNDA.
 * ══════════════════════════════════════════════════════════════════════════
 * Yüz iki yerde görünüyor:
 *   • şeritteki kart (`CampusMomentCard` — dokunuş + natif context menü),
 *   • karta basınca BÜYÜYEN kart (`CampusMomentExpandOverlay`).
 *
 * İkincisi teknik olarak AYRI bir görünüm (RN'de bir görünümü ağaçtan ağaca
 * taşımak mümkün değil) ve büyüme bir `scale` transformu: kart şeritteki
 * karesine küçültülmüş hâlde doğuyor, oradan hedefe açılıyor. Yani hareketin
 * İLK KARESİ, şeritte duran kartın birebir aynısı olmak ZORUNDA.
 *
 * ⚠️🔴 CİHAZDA GÖRÜLEN HATA TAM BURADAN GELİYORDU: büyüyen kart kendi
 * düzenini çiziyordu — yalnız ad (28pt, pay 20), SAAT SATIRI YOK, çerçeve
 * yok. Ölçek 0'da o düzen şeridin kartıyla hizalanmıyor ve dokunduğun anda
 * kart "oynuyor" (kullanıcı tarifi): yazı bir kademe küçülüp aşağı kayıyor,
 * saat satırı yok oluyor, kenar çizgisi kayboluyordu. İki uygulama ayrı
 * durdukça bu kaçınılmaz — o yüzden tek uygulama.
 *
 * ── ⚠️ `scale`: YAZI KARTLA AYNI ORANDA BÜYÜYÜP KÜÇÜLÜYOR ──────────────────
 * Büyüyen kart HEDEF ölçüsünde doğuyor ve `scale` transformuyla şeritteki
 * karesine iniyor (bkz. campusExpandTransform). Yüzün içindeki sayılar hedef
 * ölçüsünde yazılırsa küçültülmüş hâlde şeridin kartından İNCE kalıyor; çarpan
 * o farkı kapatıyor: hedefte `target/start` kadar büyük yazılıyor, ekrana
 * küçültülürken tam şeridin ölçüsüne iniyor. Yani
 *   • p=0'da şeritteki kartla BİREBİR (dokunuşta kart "oynamıyor"),
 *   • p=1'de kartla AYNI ORANDA büyümüş yazı (istek).
 *
 * ── ⚠️🔴 TERS ÖLÇEK DENENDİ VE GERİ ALINDI ─────────────────────────────────
 * Bir tur yazı TABAN ölçüsünde yazılıp kartın ölçeği bir `chromeStyle` ile
 * GERİ ALINIYORDU (net dönüşüm 1 → yazı her karede keskin ve ekranda sabit
 * ölçüde). Üç sebeple kalktı:
 *   1. İSTEK: "isim, yaş ve saat kartla beraber aynı oranda büyüyüp küçülsün."
 *   2. Sabit ölçüdeki yazı büyük kartta ufacık ve kenara yapışık duruyordu
 *      ("çok solda kalıyor") — paylar da taban ölçüsünde kalıyordu.
 *   3. Pivotu `transformOrigin` ile kurmak CİHAZDA BOZULDU (animasyonlu
 *      transform ile statik origin güvenilir birleşmiyor) ve el hesabı telafi
 *      ötelemesi gerekiyordu; iki ayrı transformun aynı karede buluşması da
 *      kendi başına bir risk.
 * Bedeli kabul edildi: ölçeklenen bir katmanda yazı yeniden örnekleniyor, yani
 * 320ms'lik hareket boyunca harfler bir tık yumuşak. İki ucun ikisinde de
 * (şerit ve dinlenme) ölçek tam 1 olduğu için DURAN kart her zaman keskin.
 *
 * ⚠️ ÖLÇEKLENEN ŞEY YALNIZ GÖRSEL SAYILAR — punto, satır, pay, rampa boyu,
 * blur gücü. En/boy dışarıdan geliyor (kutu ailesinin kuralı, bkz.
 * CampusMomentCard > `height`), çizgi/köşe de `ring`/`radius` prop'u olarak
 * ÇARPILMIŞ geliyor.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════
 * YAZI KARTIN İÇİNDE DEĞİL, ALTINDA (istek) — ve RAMPA TAMAMEN KALKTI.
 * ══════════════════════════════════════════════════════════════════════════
 * İstek birebir: "blur kaldır, küçük kartta da isim/yaş kartın altında olsun —
 * dışında ama altında, yakın bir şekilde; onun altında da saat. Kart büyüyünce
 * de altında olur, yine dışında."
 *
 * ── Neyin yerine geldi ─────────────────────────────────────────────────────
 * Ad ve saat fotoğrafın DİBİNDE duruyordu ve okunurluğu maskeli bir
 * progressive blur bandı taşıyordu (Keşif kapağının reçetesi: `scrimAt(0.1)
 * → 0.42` + `BlurView` 22 dark, maske `easeGradient` ile adın tepesinde
 * şeffaflaşıyor). Üçü birden kaldırıldı: yazı fotoğrafın dışına çıkınca
 * perdeye gerek kalmadı.
 *
 * ⚠️🔴 BLUR'UN GİTMESİNİN İKİNCİ BİR SEBEBİ VAR, geri koyacak olan okusun:
 * `BlurView` bir `UIVisualEffectView` ve ÖLÇEKLENEN bir katmanda bulanıklığı
 * hesaplayamayıp düz koyu bir dikdörtgen çiziyor. Büyüyen kart bir `scale`
 * transformu olduğu için cihazda "büyürken kartın en altı siyah oluyor" diye
 * görüldü. Hareket boyunca düz gradyana düşen bir kapı (`scaled` prop'u)
 * denendi, o da "blur yolda kayboluyor" diye geri alındı. Yani bu yüzeyde
 * blur'un çalıştığı tek hâl DURAN karttı; yazı dışarı çıkınca sorunun kendisi
 * ortadan kalktı.
 *
 * ── Ölçüler ────────────────────────────────────────────────────────────────
 * Blok fotoğrafın hemen altında ("yakın bir şekilde"): `CAPTION_GAP` kadar
 * ara, sonra ad (20/700) ve onun altında saat (13/500).
 *
 * ⚠️ YÜZÜN TOPLAM BOYU = fotoğraf + `CAPTION_BLOCK`. Çağıranların İKİSİ DE bu
 * toplamı biliyor olmak zorunda — şerit kutu başına yer ayırıyor
 * (`campusStripHeight`), büyüyen kartın hedef karesi de bu toplamdan türüyor
 * (`campusExpandGeometry > captionHeight`). Sayı o yüzden DIŞA AÇIK.
 *
 * ⚠️ MÜREKKEP HÂLÂ MEDYA MÜREKKEBİ (`onMedia`/`onMediaMuted`), tema mürekkebi
 * DEĞİL: yazı artık fotoğrafın üstünde değil ama altındaki yüzey de kâğıt
 * değil — şeritte haritanın KOYU alt perdesi, büyüyen kartta 0.82 siyah perde.
 * Tema ile dönen bir gri açık modda o perdenin içinde kayboluyor.
 */
const CAPTION_GAP = 8;
/** Satırın fotoğrafın sol kenarından payı — "bir tık sağ" (istek). */
const CAPTION_LEFT = 4;
/**
 * ⚠️ 20 → 17 (istek: "kart küçükken olan text size'ı biraz düşür"). Satır
 * yüksekliği 26'da KALDI: `CAMPUS_FACE_CAPTION` ondan türüyor ve üç yer birden
 * okuyor (şerit boyu, hedef kare, dokunma hedefi) — punto ile birlikte
 * düşseydi hepsi kayardı. 17/26 bir tık havalı bir satır, sıkışık değil.
 */
const NAME_FONT = 17;
const NAME_LINE = 26;
/** Zaman etiketi — addan KÜÇÜK (istek) ve ondan bir boşluk sonra. */
const TIME_FONT = 12;
const CAPTION_TIME_GAP = 6;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * KALAN SÜRE YİNE YAZI — ADIN SAĞINDA (istek).
 * ══════════════════════════════════════════════════════════════════════════
 * İstek: "border'ın etrafındaki renkli şeridi kaldır, sadece fotoğraf olsun;
 * moment'ın kalkma süresini tekrar TEXT olarak yazdır, isim-yaşın sağında,
 * gri ve daha küçük puntoyla."
 *
 * ⚠️ ÜÇÜNCÜ TUR: süre önce fotoğrafın dibinde saat olarak ("14:32") duruyordu,
 * sonra köşede bir HALKA, sonra kartın KENARINI saran renkli bir şerit oldu.
 * Üçü de kaldırıldı; bugünkü hâl bir ORAN değil, "ne kadar kaldı"yı doğrudan
 * söyleyen bir etiket ("18 sa", "41 dk").
 *
 * Kaldırılanlarla birlikte giden şeyler (geri isteyen okusun):
 *   • `LifeBorder` + SVG yol/çevre hesabı (`outlinePath`, `outlinePerimeter`,
 *     `lifeDash`) — kenarı saran gösterge,
 *   • `momentLifeRemaining` (campusCountdown) — kalan ÖMÜR ORANI; metin
 *     üreteci (`campusCountdownText`) ondan ayrı ve DURUYOR,
 *   • kenardaki boşluk (`campusBoxMetrics > RING_GAP` yine 0).
 *
 * ⚠️ METİN ÜRETECİ MEVCUT OLANDAN: `campusCountdownText` — rozet dilinde
 * ("18 sa"), akışın "3 gün sonra siliniyor" cümlesinden bilerek ayrı
 * (gerekçe o dosyanın başında). Süre dolmuşsa `null` dönüyor ve etiket HİÇ
 * çizilmiyor; süresi geçen an zaten listeden düşüyor.
 */

/**
 * FOTOĞRAFIN ARKASINDAKİ HÂLE — RENGİ FOTOĞRAFIN KENDİSİNDEN.
 *
 * İstek iki turda şekillendi: önce "mod rengine göre hafif gölge, ufak ama",
 * sonra "gölge temaya göre değil FOTONUN RENKLERİNE göre olsun". Yani kart
 * altına kendi fotoğrafının tonunu yayıyor (bkz. campusPhotoGlow — örnekleme
 * Skia ile, yeni paket yok).
 *
 * ⚠️ MOD RENGİ YEDEK OLARAK DURUYOR: örnekleme bitene kadar (bir ağ turu) ve
 * başarısızsa gölge yine de çiziliyor — gölgesiz kart, geç gelen bir renkten
 * daha göze batıyor.
 *
 * Alfa düşük ve ofset küçük — gölge okunur hâle gelirse kart haritanın
 * üstünde yüzen bir levhaya dönüyor.
 *
 * ⚠️ YARIÇAP ÖLÇEKLE BÜYÜYOR, ALFA SABİT: büyüyen kartta aynı 10pt'lik hâle
 * kartın yanında yok oluyor; alfayı da büyütmek gölgeyi bir çerçeveye
 * çeviriyor.
 */
const SHADOW_ALPHA = 0.35;
const SHADOW_RADIUS = 10;
const SHADOW_DY = 4;
const SHADOW_ELEVATION = 6;

/** Fotoğrafın ALTINA eklenen toplam yükseklik (ölçek 1'de). *//** Fotoğrafın ALTINA eklenen toplam yükseklik (ölçek 1'de). */
export const CAMPUS_FACE_CAPTION = CAPTION_GAP + NAME_LINE;

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

export interface CampusMomentFaceProps extends CampusBoxMetrics {
  moment: CampusMomentDto;
  /** Kutu genişliği — çağıran veriyor (şerit: yandaki kutunun kenarı için). */
  width: number;
  /**
   * Kutu yüksekliği — çağıran veriyor.
   *
   * ⚠️ ORAN BURADA YAZILMIYOR (kutu 3:4 ama en/boy İKİSİ DE dışarıdan): ölçü
   * şeridin kendi hesabından geliyor (`campusCardHeight` + CARD_ASPECT).
   * Burada bir oran yazılsaydı dolgu kutularıyla (CampusInfoBox) yan yana iki
   * farklı yükseklik olurdu.
   */
  height: number;
  /** Şu anın zamanı; geri sayım dakikada bir TEK yerden tazeleniyor. */
  nowMs: number;
  /**
   * GÖRSEL SAYILARIN ÇARPANI — 1 = şeridin kartı (gerekçe dosya başında).
   *
   * ⚠️ FOTOĞRAFIN EN/BOYUNU ETKİLEMİYOR (onlar prop): yalnız alttaki yazı
   * bloğunun puntosu, satırı ve payı. Yani yüzün TOPLAM boyu
   * `height + CAMPUS_FACE_CAPTION * scale`.
   */
  scale?: number;
  /**
   * ALT YAZI (ad + yaş) BU AĞAÇTA ÇİZİLSİN Mİ — varsayılan EVET (şerit).
   *
   * ⚠️🔴 BÜYÜYEN KART `false` GEÇİYOR, iki sebeple:
   *   1. yazı ölçeklenmemeli (istek) ve ölçeklenen bir görünümün İÇİNDE
   *      kalırsa bu imkânsız — RN'de alt ağacı ebeveyn ölçeğinden muaf
   *      tutmanın yolu yok (ters ölçek denendi, cihazda bozuldu);
   *   2. satır orada KENDİSİ YOL ALIYOR (istek: "opasite azalmasın, kendisi
   *      olması gereken yere yavaşça gitsin"): şeritteki yerinden büyük
   *      kartın altına, kapanışta geri. Kartın içindeki bir düğüm kartla
   *      birlikte hareket ederdi, oysa yazının YOLU kartınkinden farklı
   *      (sola hizalıdan ortalanmışa).
   * Uygulama yine tek (`CampusMomentCaption`), mount noktası iki.
   */
  caption?: boolean;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * KÖŞENİN ANİMASYONU — `radiusStart` + `progress` İKİSİ BİRDEN verilir.
   * ══════════════════════════════════════════════════════════════════════════
   * ⚠️🔴 CİHAZDA GÖRÜLEN HATA: "basıyorum, bir anda köşeleri değişiyor; sonra
   * kart büyüyor. Küçülürken de kart küçülüyor, sonra bir anda köşeleri
   * küçülüyor."
   *
   * Sebebi: ekrandaki köşe `çizilen × kartın ölçeği`. Şerit 28 çizip 1 ile
   * gösteriyor (28); büyüyen kart 35 çizip 0.47 ile gösteriyor (≈16). İki
   * DURAN hâl aynı köşeyi paylaşamadığı için dokunma ve kapanma anlarında
   * sıçrama oluyor — hareketin kendisi pürüzsüz olsa bile.
   *
   * Çözüm: ÇİZİLEN yarıçap da animasyonlu. `radiusStart` p=0'da çizilecek
   * değer (çağıran `şeridin köşesi / başlangıç ölçeği` olarak veriyor), `radius`
   * p=1'deki değer. Ekrandaki köşe böylece şeridinkinden başlayıp hedefe
   * yavaşça açılıyor; kapanışta tersi.
   *
   * ⚠️ ŞERİT İKİSİNİ DE VERMİYOR: orada kart ölçeklenmiyor, köşe sabit.
   */
  radiusStart?: number;
  progress?: SharedValue<number>;
  /**
   * KARTIN p=0'DAKİ ÖLÇEĞİ — kenar çizgisinin ekranda SABİT kalması için.
   *
   * ⚠️🔴 CİHAZDA GÖRÜLEN HATA: "border kırılma yapıyor, büyürken kendini
   * korumuyor." Sebebi kıl çizginin ÖLÇEKLENMESİ: 0.5pt'lik bir kenar kartın
   * p=0 ölçeğinde (≈0.47) ekranda 0.23pt'ye iniyor — yarım pikselin altı,
   * yani cihaz onu yer yer çiziyor yer yer atlıyor (kırık/kesikli kenar).
   * Büyürken de ters yönde kalınlaşıyordu.
   *
   * Çözüm: ÇİZİLEN kalınlık her karede `ring / ölçek`. Ekrandaki çizgi
   * böylece her ölçekte tam `ring` (0.5pt) — ne kırılıyor ne kalınlaşıyor.
   *
   * ⚠️ ŞERİT VERMİYOR: orada kart ölçeklenmiyor, 0.5 doğrudan 0.5.
   */
  cardScaleStart?: number;
}

/**
 * ADIN BAŞ HARFİ KÜÇÜK (istek) — uygulamanın küçük harfli dilinin parçası.
 *
 * ⚠️ TÜRKÇE YEREL AYARI ŞART: `toLowerCase()` İngilizce kurallarla çalışıyor
 * ve "İ" → "i̇" (birleşik nokta) veriyor; Türkçe yerelinde doğru karşılık
 * "i". Aynı şekilde "I" → "ı". Ad alanı kullanıcı girdisi ve Türkçe isimler
 * bu iki harfle dolu.
 *
 * ⚠️ YALNIZ İLK HARF: adın geri kalanına dokunulmuyor (çift adlar, kısaltma
 * ve özel yazımlar kullanıcının kendi yazdığı gibi kalıyor).
 */
function lowerFirst(name: string): string {
  if (!name) return name;
  return name.charAt(0).toLocaleLowerCase("tr-TR") + name.slice(1);
}

/**
 * AD + YAŞ — kutunun ALTINDAKİ tek satır.
 *
 * ⚠️🔴 AYRI BİLEŞEN, ÇÜNKÜ İKİ YERDE MOUNT EDİLİYOR: şeritte yüzün İÇİNDE,
 * büyüyen kartta kartın KARDEŞİ (istek: "isim/yaş büyümesin, kartın altına
 * gelsin"). Ölçeklenen bir görünümün içindeki yazı kaçınılmaz olarak
 * ölçekleniyor; muafiyetin tek yolu ağacın dışına çıkmak.
 *
 * İki kopya yazılsaydı kaçınılmaz olarak ayrışırlardı — bu dosyanın tamamı
 * zaten o hatanın (şerit kartı ile büyüyen kartın ayrı düzenleri) sonucu.
 *
 * ⚠️ PUNTO SABİT: `scale` ALMIYOR. Şeritte de büyüyen kartta da aynı 20pt.
 *
 * Yaş `null` ise HİÇ yazılmıyor (kullanıcı gizlemiş) — "0" ya da tire yazmak
 * gizliliği bozulmuş gibi okunurdu. Ayraç VİRGÜL (istek) ve virgül `age`
 * dalının İÇİNDE: yaş gizliyse ortada sahipsiz bir virgül kalırdı.
 *
 * ⚠️ YAN PAY YOK: satır fotoğrafla aynı hizada başlıyor. Kutunun içindeyken
 * 16pt pay vardı çünkü yazı fotoğrafın üstündeydi; dışarıda o pay satırı
 * kutudan içeri kaçık gösteriyor.
 *
 * ⚠️ MÜREKKEP MEDYA MÜREKKEBİ: altındaki yüzey kâğıt değil — şeritte
 * haritanın koyu alt perdesi, büyüyen kartta 0.82 siyah perde.
 */
export const CampusMomentCaption = memo(function CampusMomentCaption({
  moment,
  nowMs,
  onMedia = false,
  scale = 1,
  center = false,
  style,
  maxWidth,
}: {
  moment: CampusMomentDto;
  /** Zaman etiketini besleyen tik — kart başına zamanlayıcı YOK. */
  nowMs: number;
  /**
   * YAZI MEDYA MÜREKKEBİNDE Mİ (beyaz) yoksa TEMA mürekkebinde mi.
   *
   * ⚠️🔴 ALTINDAKİ YÜZEYE GÖRE: şeritte satır haritanın alt perdesinin
   * üstünde ve o perde artık AÇIK MODDA BEYAZ (istek) — orada beyaz yazı
   * kaybolur, tema mürekkebi gerekiyor. Büyüyen kartta ise perde her iki
   * temada da 0.82 siyah, yani medya mürekkebi şart.
   */
  onMedia?: boolean;
  /**
   * Büyüyen kartın UÇUŞ kopyası bunu kartın ölçeğiyle alıyor (şeritteki
   * satırla birebir aynı görünsün diye); DİNLENME kopyası almıyor (istek:
   * "isim/yaş büyümesin").
   */
  scale?: number;
  /** Kartın ORTA altında mı (istek: büyüyen kartta ortalanıyor). */
  center?: boolean;
  /** Hareket/sönüm — büyüyen kartta satır kendi yolunu alıyor. */
  style?: AnimatedStyle<ViewStyle>;
  /**
   * ADIN KIRPILMA GENİŞLİĞİ — büyüyen kartta ANİMASYONLU (istek).
   *
   * ⚠️ "Kart küçükken isim truncate olsun, büyüyünce uzayabilir": kutu
   * genişliği kartın büyümesiyle birlikte açılmak zorunda, yoksa uzun bir ad
   * ya küçük kartta taşar ya büyük kartta gereksiz kırpılır.
   */
  maxWidth?: AnimatedStyle<ViewStyle>;
}) {
  const { t } = useTranslation();
  const ago = campusPostedAgoText(moment.createdAt, nowMs, t);
  const ink = onMedia ? colors.onMedia : colors.text;
  const inkMuted = onMedia ? colors.onMediaMuted : colors.textSecondary;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          marginTop: CAPTION_GAP * scale,
          // ⚠️ BİR TIK SAĞDA (istek): satır fotoğrafın sol kenarına yapışıkken
          // kutudan dışarı taşmış gibi okunuyordu. Pay küçük — büyüseydi yazı
          // kutuyla bağını koparırdı.
          paddingLeft: CAPTION_LEFT * scale,
          flexDirection: "row",
          alignItems: "baseline",
        },
        maxWidth,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          // ⚠️ `flexShrink` ŞART: uzun bir ad süre etiketini satırdan iter.
          flexShrink: 1,
          color: ink,
          fontSize: NAME_FONT * scale,
          lineHeight: NAME_LINE * scale,
          fontWeight: "700",
          textAlign: center ? "center" : "left",
        }}
      >
        {lowerFirst(moment.displayName)}
        {typeof moment.age === "number" ? `, ${moment.age}` : null}
      </Text>
      {/* GEÇEN SÜRE — adın SAĞINDA, gri ve daha küçük (istek: "x saat önce").
          ⚠️ TABAN HİZASI (`alignItems: "baseline"`): iki farklı punto
          ortalanınca küçük yazı büyüğün ortasında yüzüyor gibi duruyor.
          ⚠️ KIRPILMIYOR (`flexShrink: 0`): uzun bir ad kısalsın, zaman
          etiketi değil — o zaten en fazla birkaç karakter. */}
      {ago ? (
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 0,
            marginLeft: CAPTION_TIME_GAP * scale,
            color: inkMuted,
            fontSize: TIME_FONT * scale,
            lineHeight: NAME_LINE * scale,
            fontWeight: "500",
          }}
        >
          {ago}
        </Text>
      ) : null}
    </Animated.View>
  );
});

/** Kartın yüzü — dokunuş, menü ve hareket ÇAĞIRANIN işi. */
const CampusMomentFace = memo(function CampusMomentFace({
  moment,
  width,
  height,
  ring,
  gap,
  radius,
  nowMs,
  scale = 1,
  caption = true,
  radiusStart,
  progress,
  cardScaleStart,
}: CampusMomentFaceProps) {
  const { t } = useTranslation();

  /**
   * GÖLGENİN YEDEK RENGİ — ANIN modundan.
   *
   * ⚠️ EKRANIN SEÇİLİ MODU DEĞİL: liste moda göre geliyor ama kart elde
   * bayatlamışsa ikisi ayrışabiliyor; aynı kural büyüyen kartın cam tikinde de
   * var (FeedScreen > `mode={openMoment?.mode ?? selectedMode}`).
   */
  const accent = modeAccent(moment.mode);


  /**
   * ══════════════════════════════════════════════════════════════════════════
   * GÖSTERİLECEK ADRES — göreli yol gelirse API tabanına bağlanıyor.
   * ══════════════════════════════════════════════════════════════════════════
   * Sözleşme `photoUrl`i MUTLAK bekliyor (bkz. backend_campus_moments_2026-10
   * §4: anın ömrünü aşan imzalı URL ya da opak CDN yolu) ve uygulamanın başka
   * hiçbir yerinde foto adresi istemcide KURULMUYOR. Buradaki tek iş bir YEDEK
   * ve gerekçesi `campusPhotoUri`de.
   */
  const photoUri = useMemo(() => campusPhotoUri(moment), [moment]);

  /**
   * FOTOĞRAFIN BASKIN TONU — gölgenin rengi (istek). `null` iken mod rengine
   * düşülüyor; uzun gerekçe `campusPhotoGlow`da.
   *
   * ⚠️ `photoUri`DEN SONRA: ham `photoUrl` değil çözülmüş adres örnekleniyor
   * (göreli yol tabana bağlanıyor, kullanılamaz alan `null`a düşüyor).
   */
  const glow = useCampusPhotoGlow(photoUri);

  /**
   * KÖŞENİN ANİMASYONLU HÂLİ — gerekçe `radiusStart` prop'unda.
   *
   * ⚠️ İKİ STİL, ÇÜNKÜ İKİ KÖŞE VAR: dış kabuk (çerçeve + kırpma) ve iç blok
   * (boşluk varken fotoğrafı KIRPAN kutu). İç yarıçap dıştan `ring + gap`
   * kadar düşüyor — iki eğri iç içe (aynı kural `CampusOutlinedBox`ta yazılı).
   *
   * ⚠️ `progress` YOKSA STİL BOŞ: şeritte kart ölçeklenmiyor, köşe statik
   * kalmalı. Boş nesne döndürmek statik stili olduğu gibi bırakıyor.
   */
  const boxStyle = useAnimatedStyle(() => {
    if (!progress || radiusStart === undefined) return {};
    const p = progress.value;
    /**
     * ⚠️ ÇİZGİ ÖLÇEĞİN TERSİYLE ÇARPILIYOR: ekranda sabit `ring` kalsın
     * (gerekçe `cardScaleStart`ta). Ölçek bilinmiyorsa kalınlığa
     * dokunulmuyor — yanlış bir telafi, telafisizlikten kötü.
     */
    const cardScale = cardScaleStart
      ? cardScaleStart + (1 - cardScaleStart) * p
      : 1;
    return {
      borderRadius: radiusStart + (radius - radiusStart) * p,
      borderWidth: ring / cardScale,
    };
  });
  const innerStyle = useAnimatedStyle(() => {
    if (!progress || radiusStart === undefined) return {};
    const p = progress.value;
    const cardScale = cardScaleStart
      ? cardScaleStart + (1 - cardScaleStart) * p
      : 1;
    const r = radiusStart + (radius - radiusStart) * p;
    // İç köşe, dış kenardan TOPLAM uzaklık kadar düşüyor (çizgi + boşluk) —
    // çizgi animasyonlu olduğu için bu da her karede yeniden.
    return { borderRadius: Math.max(0, r - (ring / cardScale + gap)) };
  });

  /**
   * ⚠️🔴 KULLANILAMAZ URL'İ DEV'DE DUYULUR YAP — `onError`in GÖRMEDİĞİ dal.
   *
   * `expo-image` boş ya da şema taşımayan bir kaynakta isteği hiç kurmuyor,
   * yani hata olayı da ATILMIYOR: kutu sessizce kendi gri zemininde kalıyor.
   * Teşhiste tam bu yüzden tıkanıldı — "foto gelmedi" ile "URL hiç yoktu"
   * ekranda aynı görünüyor.
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
   * edilemedi: boş URL, 403 veren imzasız adres, ölçü hatası ve "foto
   * gerçekten yok" HEPSİ aynı gri kutu. Artık sebep KARTIN ÜSTÜNDE yazıyor
   * (yalnız DEV); release'de tek bir piksel bile çizilmiyor.
   *
   * ⚠️ ÖLÇEKLENMİYOR: bir teşhis etiketi, kartın tipografisinin parçası değil.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const diagnostic = !__DEV__
    ? null
    : !photoUri
      ? `URL YOK/GÖRELİ\n${String(moment.photoUrl)}`
      : loadError
        ? `YÜKLENEMEDİ\n${loadError}\n${describeSignature(photoUri)}`
        : null;

  return (
    /**
     * SÜTUN: fotoğraf kutusu + ALTINDA yazı (istek).
     *
     * ⚠️ GENİŞLİK KUTUNUN GENİŞLİĞİ: yazı fotoğrafın dışında ama hizasında —
     * sola taşan ya da ortalanan bir satır kutuyla bağını koparıyor.
     */
    <View style={{ width }}>
      {/* ⚠️ GÖLGE AYRI BİR KAPTA, kutunun ÜSTÜNDE DEĞİL: `CampusOutlinedBox`
          `overflow: hidden` taşıyor ve iOS'ta o bayrak (layer
          `masksToBounds`) görünümün KENDİ gölgesini de kırpıyor — aynı
          görünüme hem kırpma hem gölge verilemiyor.

          ⚠️ ZEMİN OPAK OLMAK ZORUNDA: iOS gölgenin şeklini görünümün
          arka planından + köşesinden türetiyor. Şeffaf bırakılsaydı sistem
          katmanın alfa kanalını taramak zorunda kalır (pahalı) ya da hiç
          gölge çizmezdi. Kutu zaten opak, yani bu zemin görünmüyor.

          ⚠️ UFAK (istek: "hafif gölge... ufak ama"): yarıçap kutunun
          ölçeğiyle büyüyor ama alfa sabit — mod rengini kartın ARKASINDAN
          sezdiren bir hâle, altına konmuş ikinci bir kart değil. */}
      <View
        style={{
          borderRadius: radius,
          borderCurve: "continuous",
          backgroundColor: colors.surface4,
          /**
           * ⚠️ ÖNCE FOTOĞRAFIN RENGİ, YOKSA MODUN: örnekleme asenkron ve
           * başarısız olabiliyor (bkz. `useCampusPhotoGlow`). Yedek, rengin
           * hiç gelmediği durumda kartı gölgesiz bırakmıyor.
           */
          shadowColor: glow ?? accent,
          shadowOpacity: SHADOW_ALPHA,
          shadowRadius: SHADOW_RADIUS * scale,
          shadowOffset: { width: 0, height: SHADOW_DY * scale },
          // Android: renkli gölge yalnız API 28+ (`outlineSpotShadowColor`
          // RN'de `shadowColor`dan türüyor); altında sessizce gri çiziliyor.
          elevation: SHADOW_ELEVATION,
        }}
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
       * kâğıt üstünde gri ama kendi çerçevesinin ve altındaki haritanın yanında
       * BEYAZ okunuyordu — foto gelmeyen kart boş bir kart değil delik gibi
       * duruyordu. surface4 iki modda da yükseltilmiş yüzey.
       *
       * ⚠️ ÇERÇEVENİN KENDİ GRİ DOLGUSU (FILL_ALPHA) BURADA YANLIŞ: o yarı
       * saydam ve blok burada bir yüzey değil, fotoğrafın ZEMİNİ — foto
       * çözülürken haritayı kutunun içinden gösterirdi. Opak kalmak zorunda.
       */
        fill={colors.surface4}
        /* Köşe büyümeyle birlikte açılıyor — gerekçe `radiusStart`ta. */
        boxStyle={boxStyle}
        innerStyle={innerStyle}
      >
        <Image
        // ⚠️ `moment.photoUrl` DEĞİL `photoUri`: göreli yol tabana bağlanıyor,
        // kullanılamaz alan `null`a düşüyor. `null` kaynak expo-image'da
        // sessiz — zaten istenen o, kutu kendi zemininde kalıyor ve DEV'de
        // sebebi üstünde yazıyor.
        source={photoUri ? { uri: photoUri } : null}
        /**
         * ⚠️ MUTLAK SERİLİYOR, yüzde ÖLÇÜYLE DEĞİL: fotoğraf çerçevenin iç içe
         * kutusunun çocuğu ve o blok `alignItems/justifyContent: center` —
         * yüzde ölçü orada ebeveynin KESİN boyuna bağlı.
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
         * ⚠️🔴 SESSİZ BAŞARISIZLIĞI DUYULUR YAPAN SATIR — gerekçe
         * `diagnostic`te. Log DEV-only (`devLog` release'de no-op).
         */
        onError={({ error }) => {
          devLog("[campus] an fotoğrafı yüklenemedi", {
            momentId: moment.id,
            isMine: moment.isMine,
            photoUrl: moment.photoUrl,
            error,
          });
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

        {/* ROZET YALNIZ "İNCELENİYOR" — "Senin anın" KALDIRILDI (istek).
            ⚠️ MODERASYON DURUMU BURADA GÖRÜNÜR OLMALI: sağlayıcı cevap
            vermediğinde an YAZILIYOR ama kimseye görünmüyor (`Pending` +
            `isVisibleToOthers: false`) ve kota da harcanmış sayılıyor. Kullanıcı
            "yayında" sanmasın diye rozet "inceleniyor" diyor.

            ⚠️ `isMine` KAPISI DURUYOR: moderasyon bloğu başkalarının anında da
            dolu gelebiliyor ve "inceleniyor" yalnız SAHİBİNİ ilgilendiriyor.
            ⚠️ `isVisibleToOthers` SUNUCUDAN; `status === "Approved"` kontrolü
            silinmiş/kaldırılmış/süresi dolmuş hâlleri kaçırıyor.

            ⚠️🔴 İKİ DURUM AYRIŞTI (2026-10-29): rozet bir süre `isVisibleToOthers
            === false` olan HER hâle "İnceleniyor" diyordu ve REDDEDİLMİŞ an da o
            dala düşüyordu — yani karar verilmiş bir ana "bekliyor" deniyordu.
            Backend teyidi: redde S3 nesnesi siliniyor, yani o kart bir daha ASLA
            dolmayacak; kullanıcıya bekleme değil sonuç söylenmeli. */}
        {moment.isMine &&
        moment.moderation &&
        moment.moderation.isVisibleToOthers === false ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 12 * scale,
              right: 12 * scale,
              paddingHorizontal: 10 * scale,
              paddingVertical: 5 * scale,
              borderRadius: 999,
              backgroundColor: colors.mediaChipBg,
            }}
          >
            <Text
              style={{
                color: colors.onMedia,
                fontSize: 12.5 * scale,
                fontWeight: "600",
              }}
            >
              {moment.moderation.status === "Rejected"
                ? t("campus.photoRemoved")
                : t("campus.underReview")}
            </Text>
          </View>
        ) : null}
      </CampusOutlinedBox>
      </View>

        {/* AD + YAŞ — KUTUNUN DIŞINDA, hemen altında (istek).
            ⚠️ Büyüyen kart bunu ÇİZMİYOR (`caption={false}`): orada yazı
            kartın kardeşi, çünkü ölçeklenmemesi isteniyor — gerekçe prop'ta. */}
        {/* ⚠️ BÜYÜYEN KART BUNU ÇİZMİYOR (`caption={false}`): orada satır TEK
            ve KARTIN KARDEŞİ — şeritteki yerinden hedefine kendisi gidiyor
            (gerekçe `caption` prop'unda). */}
        {caption ? (
          <CampusMomentCaption moment={moment} nowMs={nowMs} />
        ) : null}
    </View>
  );
});

export default CampusMomentFace;
