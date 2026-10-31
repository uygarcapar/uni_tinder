import { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import { Image } from "expo-image";
import { campusInfoArtFor } from "@/features/campus/campusInfoArt";
import { colors, withAlpha } from "@/shared/theme/colors";

/**
 * KAMPÜS ŞERİDİNİN "DOLGU" KUTULARI — poster karesi ve ÇERÇEVELİ KUTU reçetesi
 * (şeridin anı kartı da onu çiziyor).
 *
 * ── Neden boş durum YERİNE kutular ─────────────────────────────────────────
 * Şeritte önce klasik bir boş durum vardı (büyük glif + başlık + alt satır) ve
 * kampüste kimse paylaşmamışsa şerit tamamen boşalıyordu: yüzey "burada bir
 * şey yok" diyordu, oysa anlatması gereken şey NE OLDUĞU. Kutular aynı ölçüde
 * (gerçek anlarla birebir aynı kutu) ve şerit hiçbir zaman boş kalmıyor —
 * kullanıcı ilk kez girdiğinde bile yana kaydırılabilir bir deste görüyor.
 *
 * ── `CampusInfoBox` ARTIK SADECE BİR FOTOĞRAF ──────────────────────────────
 * Kuralı anlatan kelime karenin İÇİNDE yazılı (duvarda "24 SAAT", kemerde
 * "YALNIZ KAMPUSTE"). Kutu bu yüzden üstüne HİÇBİR ŞEY çizmiyor: ne metin, ne
 * okuma bandı, ne ikon.
 *
 * ⚠️ BUNLARIN HEPSİ SIRAYLA DENENDİ VE GERİ ALINDI — tekrar eklemeden önce
 * oku:
 *   • 30pt ikon → zeminde fotoğraf varken ikinci bir odak, deste "foto + glif
 *     + yazı" diye okunuyordu;
 *   • dipte 29pt etiket → karedeki yazının üstüne ikinci bir yazı biniyordu;
 *   • o etiketin arkasındaki maskeli blur bandı → etiket gidince taşıyacağı
 *     bir şey kalmadı.
 * Kalan tek çizim sol üstteki lit imzası, gerekçesi LOGO sabitlerinde.
 *
 * ── AYNI REÇETENİN İKİ ÖLÇEĞİ ──────────────────────────────────────────────
 * Çerçeveli kabuk — ölçü, çizgi, boşluk, yarıçap, köşe eğrisi — tek yerde
 * duruyor: ayrı dosyalara bölünse yan yana duran kutular kaçınılmaz olarak
 * ayrışırdı. ÜÇ okuyucu var (`CampusOutlinedBox` + `campusBoxMetrics`):
 *   • şeridin anı kartları (`CampusMomentCard`, 222pt boyunda),
 *   • şeridin poster kareleri (`CampusInfoBox`, aynı boy),
 *   • akış başlığındaki anlar destesi (FeedMomentsPeek, 42pt — ölçüleri
 *     reçeteden DEĞİL elle, gerekçesi orada).
 *
 * ⚠️ `BoxShell` KALDIRILDI: kart çerçeveye alınırken (istek) poster karesi de
 * aynı kabuğa taşındı, yani bu dosyada artık TEK kutu uygulaması var.
 *
 * ⚠️ PAYLAŞMA KUTUSU BU DOSYADAN TAMAMEN ÇIKTI (istek): önce tam boy
 * "Share yours" kutusu, sonra onun yerine konan küçük çerçevesiz kutu
 * kaldırıldı. Aksiyon haritanın sağ üstündeki cam yuvarlak butonda —
 * tarihçesi ve geri koyma reçetesi dosyanın SONUNDAKİ notta.
 */

/** Kutunun köşesi — `CampusMomentCard` ile AYNI olmak zorunda (yan yana). */
const BOX_RADIUS = 28;

/**
 * KUTUNUN ÇERÇEVESİ — Profil'deki avatar halkasının kuralı.
 *
 * Üç katman, dıştan içe: GRİ ÇİZGİ → BOŞLUK → dolu blok. Avatarda da aynı
 * sıra var (gradyan halka → boşluk → fotoğraf) ve oradaki ders şu: boşluk
 * kapanırsa halka fotoğrafın kenarı gibi okunuyor, yani çerçeveyi ayrı bir
 * şey yapan tek şey aradaki hava.
 *
 * ⚠️ ÇİZGİ KUTUNUN EN DIŞ KENARINDA, içeride DEĞİL. Bir ara içeride
 * çizilmişti ve boşluk kutunun kendi zemini ile dolduruluyordu — çizgi
 * havada duran bir dikdörtgene benziyordu. Doğrusu avatardaki gibi: çizgi
 * en dışta, BOŞLUK ZEMİNSİZ, yani arkadan HARİTA görünüyor (istek).
 *
 * ⚠️ DIŞ ÖLÇÜ DEĞİŞMİYOR — çizgi de boşluk da kutunun içinden yer alıyor.
 * Dışa eklenseydi çerçeveli kutu şeritte komşularından birkaç pt büyük olur
 * ve yan yana dizilen kutular hizasını kaybederdi.
 *
 * ── ⚠️🔴 SAYILAR İNCELDİ: 7/4 → 3/2 (istek: "borderi incelt, ufak") ────────
 * Tarihçe önce ters yöne gitmişti: 2/14 → 4/8 → 6/5 → 7/4, üç tur boyunca
 * "boşluğu azalt kenarı kalınlaştır". O ayar KARE ve 222pt'lik bir kutuda
 * yapıldı; kutu 3:4'e geçip 167pt'ye daralınca aynı çizgi kartın içini yemeye
 * başladı ve kutu "çerçevenin içindeki küçük fotoğraf" gibi okundu.
 *
 * 3/2, akış başlığındaki anlar destesinin (FeedMomentsPeek > BOX_RING/BOX_GAP)
 * BİREBİR AYNI sayıları: iki yüzeyin oranı da (3:4) çizgi kalınlığı da aynı
 * olunca deste şeridin küçültülmüş hâli gibi okunuyor. Kalınlaştırılacaksa
 * iki yer birden düşünülmeli.
 *
 * ── ⚠️🔴 SON HÂLİ: 0.5 / 0 — ÇERÇEVE ARTIK BİR KIL ÇİZGİ (istek) ───────────
 * "borderlarını 0.5px yap ve border ile foto arasındaki boşluğu kaldır."
 *
 * Yukarıdaki üç turun (2/14 → … → 7/4 → 3/2) tamamı aynı soruyu soruyordu:
 * çerçeve ne kadar kalın olmalı. Cevap sıfıra yakın çıktı — kutu artık
 * "çerçeveli bir kutu" değil, kenarı KESİLMİŞ bir fotoğraf: çizgi yalnız
 * fotoğrafın haritadan ayrıldığı yeri işaretliyor.
 *
 * ⚠️ BOŞLUK SIFIR OLDUĞU İÇİN ÜÇ KATMANLI DÜZEN FİİLEN İKİYE İNDİ: çizgi →
 * fotoğraf. Aşağıdaki "boşluk katmanı" yine duruyor (padding 0) ve `gap`
 * geri verilirse hava da geri geliyor — ama artık ÇİZGİYİ AYRI BİR ŞEY YAPAN
 * havadan vazgeçildi, yani bu dosyanın eski gerekçesi (avatar halkası:
 * "boşluk kapanırsa halka fotoğrafın kenarı gibi okunur") BİLEREK TERK EDİLDİ.
 * Okunuşu da tam olarak o: fotoğrafın kenarı.
 *
 * ⚠️ ÇİZGİ ÖLÇEKLENMİYOR, SABİT 0.5 (aşağıdaki `campusBoxMetrics`): 0.5pt
 * @3x'te 1.5px, yani zaten en ince görünür çizginin sınırında. Ölçekle
 * çarpılsaydı 42pt'lik bir kutuda 0.1pt'ye iner ve kenar sessizce KAYBOLURDU.
 *
 * ⚠️ ESKİ "ÇİZGİ BOŞLUKTAN KALIN" KURALI DA BU YÜZDEN DÜŞTÜ: boşluk 0, yani
 * karşılaştırılacak bir şey yok. Hava geri konacaksa o kural da geri gelmeli
 * (çizgi 0.5 kalıp boşluk 2 olursa çerçeve "kutunun kendi kenarı"na döner).
 *
 * ── Tarihçe, çünkü sayılar üç kez ters yöne gitti ──────────────────────────
 *
 * ⚠️ RENK `colors.border` DEĞİL `colors.textMuted` (istek: "gri olsun").
 * `border` temanın yüzey ailesinden türüyor ve koyu temada #3A3A3A —
 * haritanın üstünde fiilen görünmüyordu. `textMuted` İKİ TEMADA DA aynı
 * nötr gri (#8E8E93), yani çerçeve açık ve koyu modda aynı güçte duruyor.
 * Bir metin rengi olması tesadüf değil: tabloda tek "tema ile dönmeyen
 * gri" o.
 *
 * ── ⚠️ ÇİZGİ SEYRELTİLDİ: ALFA 0.45 (istek: "borderları daha az belirgin
 * yap") ────────────────────────────────────────────────────────────────────
 * Kalınlık zaten tabanda (0.5pt) — daha ince bir çizgi @3x'te 1px'in altına
 * iner ve cihaza göre ya kaybolur ya aynı kalır. Belirginlik bu yüzden
 * ALFADAN alınıyor: aynı kıl çizgi, yarı güçte mürekkep.
 *
 * ⚠️ İKİ TEMADA DA ÇALIŞIYOR çünkü taban renk tema ile dönmeyen nötr gri:
 * alfa koyu zeminde de açık zeminde de aynı oranda seyreltiyor. Tema ile
 * dönen bir mürekkep seyreltildiğinde iki moddan birinde tamamen kaybolurdu.
 *
 * ⚠️ ALT SINIR PRATİKTE BURADA: 0.3'ün altında çizgi fotoğrafın açık
 * bölgelerinde hiç okunmuyor, yani kenar "bazı kartlarda var bazılarında yok"
 * gibi davranıyor — yokluğundan daha kötüsü o.
 *
 * ⚠️ Renk SABİTE alınmıyor — palet mutable ve modül seviyesinde türetilen
 * bir renk tema değişiminde bayat kalıyor (colors.ts'in iki kuralından
 * biri). Ölçüler sabit, renk inline okunuyor.
 */
const RING_WIDTH = 0.5;
/**
 * ⚠️🔴 BOŞLUK İKİ KEZ YÖN DEĞİŞTİRDİ, SON HÂLİ YİNE 0 (istek: "sadece
 * fotoğraf olsun; border da olsun ama 0.5px, gri").
 *
 * Tarihçe kısa ve gerekçeleri birbirine bağlı:
 *   • 2 → 0: çizgi bir kıl çizgiye indi, hava gereksizdi;
 *   • 0 → 5: kenar bir ÖMÜR GÖSTERGESİNE dönüştü (kalan süre mod renginde) ve
 *     fotoğrafa yapışık bir gösterge fotonun kenarı gibi okunuyordu;
 *   • 5 → 0: gösterge KALDIRILDI (kalan süre yine YAZI oldu, adın sağında),
 *     yani kenarın tek işi yine fotoğrafı zeminden ayırmak.
 *
 * Yani boşluk, çizginin İŞİNE bağlı bir karar: çerçeveyse 0, göstergeyse hava.
 */
const RING_GAP = 0;
/** Çizginin mürekkebi — gerekçe yukarıdaki "SEYRELTİLDİ" notunda. */
const RING_ALPHA = 0.45;

/**
 * Yukarıdaki üç sayının ölçüldüğü BOY — 222pt (şeritteki kutunun tipik
 * YÜKSEKLİĞİ, bkz. CampusMomentsStrip > CARD_HEIGHT_RATIO).
 *
 * ⚠️ ÖLÇÜ ARTIK BOY, kutunun kenarı değil: kutu 3:4 olduğu için kare bir
 * referans kalmadı ve çağıran yükseklik geçiyor (gerekçe şeritte,
 * `boxMetrics`in yanında).
 *
 * Reçete başka bir ölçüde kullanılacaksa sayılar ORANLA taşınıyor, elle
 * yeniden seçilmiyor: iki yerde ayrı ayrı ayarlanan bir çerçeve kaçınılmaz
 * olarak ayrışır ve küçük kutu "aynı kart değil" gibi okunur.
 */
const CAMPUS_BOX_REF_SIZE = 222;

export interface CampusBoxMetrics {
  ring: number;
  gap: number;
  radius: number;
}

/**
 * Çerçeve reçetesinin verilen ölçüdeki karşılığı.
 *
 * ⚠️ ARTIK TEK SAYI ÖLÇEKLENİYOR — KÖŞE. Çizgi (0.5) ve boşluk (0) ölçekten
 * BAĞIMSIZ sabitler ve gerekçesi `RING_WIDTH`in yanında: 0.5pt zaten görünür
 * çizginin dibi, oranla çarpılsa küçük kutuda kaybolur; boşluk da kaldırıldı,
 * yani çarpacak bir şey yok.
 *
 * ⚠️ TABANLAR (`Math.max(2, …)`) BU YÜZDEN KALKTI: ikisi de kıl çizgiyi
 * 2pt'ye geri kalınlaştırıyordu — tam olarak isteğin tersi.
 */
export function campusBoxMetrics(size: number): CampusBoxMetrics {
  const scale = size / CAMPUS_BOX_REF_SIZE;
  return {
    ring: RING_WIDTH,
    gap: RING_GAP,
    radius: Math.round(BOX_RADIUS * scale),
  };
}

/**
 * İÇERİDEKİ BLOĞUN ZEMİNİ — GRİ (istek).
 *
 * ⚠️ `colors.surface3` DEĞİL ve sebebi şu: yüzey tokenları tema ailesinden
 * türüyor, yani koyu temada neredeyse siyah (#262626), açık temada
 * neredeyse beyaz (#EAEAEE) — ikisi de "gri" değil. Çerçevenin grisiyle
 * (`textMuted`, iki temada da #8E8E93) aynı aileden bir dolgu isteniyor;
 * o griyi alfayla seyreltmek iki temada da GRİ bırakıyor.
 *
 * Alfa 0.45: altındaki harita hâlâ seziliyor (boşluktan görünen haritayla
 * aynı yüzey olduğunu okutan şey bu), ama artı ve yazı için yeterince
 * oturmuş bir zemin. Tam opak yapılırsa kutu haritadan kopuyor ve bir
 * dönem şikâyet edilen "düz levha" hissine dönüyor.
 */
const FILL_ALPHA = 0.45;

/**
 * SOL ÜSTTEKİ LİT İMZASI — karenin içindeymiş gibi.
 *
 * ⚠️ KAREYE GÖMÜLMEDİ, kodda duruyor. Gömülse her yeni fotoğraf tek tek aynı
 * işlemden geçmek zorunda kalırdı ve üç karede üç farklı konum/ölçü olurdu;
 * burada tek kural üçünü birden bağlıyor ve logo @3x keskin kalıyor.
 *
 * ⚠️ GÖLGE YOK (istek). Bir dönem harflerin altında yumuşak koyu bir gölge
 * vardı — "logoyu sahnenin ışığına bağlasın" diye. Karşılığı olmadı: gölge
 * logoyu karenin üstünde YÜZEN bir katman gibi gösteriyor, oysa istenen şey
 * onun fotoğrafın İÇİNDE olması. Düz beyaz mürekkep posterin kendi yazısıyla
 * aynı düzlemde duruyor.
 *
 * Asset 500×500 kare ve mürekkep onun içinde bir şeride oturuyor (bkz.
 * logoMetrics); `contain` ile 54×24'lük kutuda gerçek yükseklik ~18pt.
 */
const LOGO = require("../../../../assets/lit_name_white.png");
const LOGO_W = 54;
const LOGO_H = 24;
const LOGO_INSET = 16;

/**
 * ⚠️ ORTAK KABUK (`BoxShell`) KALDIRILDI. Dolgu kutusu artık şeridin kartıyla
 * AYNI çerçeveyi çiziyor (`CampusOutlinedBox`, istek: "etrafına aynı şekilde
 * border da ekleyelim") ve kabuğun iki dalı da (çerçeveli / düz zeminli) onun
 * içinde zaten var — ikinci bir uygulama tutmak iki yüzeyi ayrıştırmaktan
 * başka bir şey yapmıyordu. Çerçevesiz bir kutu geri gerekirse `ring`/`gap`
 * 0 geçilir, kabuğu geri yazmaya gerek yok.
 */

export interface CampusInfoBoxProps extends CampusBoxMetrics {
  width: number;
  height: number;
  /** Zemin fotoğrafını seçen anahtar — metnin i18n anahtarıyla AYNI. */
  infoKey: string;
  /**
   * Karedeki yazının metin karşılığı. ÇİZİLMİYOR — VoiceOver'ın okuduğu şey
   * bu. Ekran okuyucu duvardaki yazıyı okuyamaz; kutuyu tamamen sessiz
   * bırakmak kuralı erişilemez kılardı. Dize ile karedeki yazı AYNI olmak
   * zorunda (bkz. locales'teki not).
   */
  text: string;
}

/** POSTER KUTUSU — çerçeve + afiş + sol üstte imza, başka hiçbir şey. */
export const CampusInfoBox = memo(function CampusInfoBox({
  width,
  height,
  ring,
  gap,
  radius,
  infoKey,
  text,
}: CampusInfoBoxProps) {
  const source = campusInfoArtFor(infoKey);

  return (
    <CampusOutlinedBox
      width={width}
      height={height}
      ring={ring}
      gap={gap}
      radius={radius}
      // Afiş çözülene kadar görünen tek şey — kutu o bir karede beyaz/boş
      // parlamıyor. ⚠️ Çerçevenin gri dolgusu (FILL_ALPHA) BURADA YANLIŞ:
      // altında bir fotoğraf var, yani blok yüzeyin kendisi değil zemini.
      // ⚠️ ANI KARTIYLA AYNI TOKEN (`surface4`) — uzun gerekçe orada
      // (CampusMomentCard > `fill`). Pratikte görünmüyor (kare gömülü bir
      // varlık, ilk karede hazır) ama iki foto zemininin ayrışmasına gerek yok.
      fill={colors.surface4}
      accessibilityLabel={text}
    >
      {source ? (
        <>
          {/* Kareye HİÇBİR MÜDAHALE YOK: ne bulanıklık, ne perde, ne renk.
              Üçü de denendi ve geri alındı (gerekçe dosyanın başında). */}
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // Paketli asset anında geliyor; geçiş yine de var — önbellekten
            // çözülürken tek karelik sıçramayı yumuşatıyor.
            transition={200}
            accessible={false}
          />

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: LOGO_INSET,
              left: LOGO_INSET,
              width: LOGO_W,
              height: LOGO_H,
            }}
          >
            <Image
              source={LOGO}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
              contentPosition="left center"
              accessible={false}
            />
          </View>
        </>
      ) : null}
    </CampusOutlinedBox>
  );
});

export interface CampusOutlinedBoxProps extends CampusBoxMetrics {
  width: number;
  height: number;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  /**
   * İÇ BLOĞUN ZEMİNİ — verilmezse ortak gri (`FILL_ALPHA`).
   *
   * ⚠️ ORTAK GRİ, FOTOĞRAF TAŞIYAN KUTUDA YANLIŞ: blok orada bir yüzey değil,
   * fotoğrafın ALTINDAKİ zemin ve yarı saydam gri, foto çözülürken haritayı
   * kutunun içinden gösteriyor. O yüzden şeridin anı kartı da poster karesi de
   * `colors.surface2` geçiyor — "o bir karede beyaz/boş parlamasın" zemini.
   *
   * ⚠️ VARSAYILAN BİLEREK `undefined`: zemin kararı buraya TAŞINMADI. Prop
   * verilmeyen tek çağrı akış destesinin kutuları ve onlar ortak gride
   * KALIYOR — boş kutu orada "burada bir şey yok ama koyabilirsin" demek
   * zorunda, yani gri dolgunun kendisi bilgi.
   */
  fill?: string;
  /**
   * ÇİZGİ İLE İÇ BLOK ARASINDAKİ BOŞLUĞUN ZEMİNİ — verilmezse ŞEFFAF.
   *
   * ⚠️ VARSAYILANI DEĞİŞTİRME: boşluğun şeffaflığı bu çerçevenin tasarım
   * kararı (gerekçe `RING_WIDTH`te) — Profil'deki avatar halkasının kuralı,
   * "arkada ne varsa" onunla çiziliyor ve şeritte arkada HARİTA var.
   *
   * ⚠️ TEK MÜŞTERİSİ: akış başlığındaki anlar destesi (istek: "ana kare ile
   * border'ı arasındaki boşlukta boşluk yerine arkaplan rengi olsun direkt o
   * sayfanın"). Orada kutular haritanın üstünde DEĞİL sayfanın başlık
   * satırında duruyor ve şeffaf boşluk, arkadan geçen bulanık haritayı iki
   * çizgi arasında bir şerit olarak gösteriyordu.
   */
  gapFill?: string;
  /**
   * ÇİZGİNİN MÜREKKEP GÜCÜ — verilmezse seyreltilmiş (`RING_ALPHA`).
   *
   * ⚠️ TEK MÜŞTERİSİ AKIŞ BAŞLIĞINDAKİ DESTE: çizgi seyreltilirken (istek
   * "borderları daha az belirgin yap") istenen yüzey şeridin KARTLARIYDI.
   * Deste aynı kabuğu çiziyor ama ölçüleri kendi (3/2, gerekçe
   * FeedMomentsPeek > BOX_RING) ve 42pt'lik bir kutuda 3pt'lik bir çizgi
   * seyreltilince kutu "soluk" okunuyor — orada çizgi kutunun tek yapısı.
   * Yani seyreltme ölçüye bağlı bir karar, kabuğun sözleşmesi değil.
   */
  ringAlpha?: number;
  /**
   * DIŞ KUTUNUN ANİMASYONLU STİLİ — tek müşterisi BÜYÜYEN KARTIN KÖŞESİ.
   *
   * ⚠️🔴 KÖŞE NİYE ANİMASYONLU: kart bir `scale` ile büyüyor ve ekrandaki
   * köşe `çizilen × ölçek`. Çizilen sabit kalırsa iki DURAN hâl aynı köşeyi
   * paylaşamıyor — şerit 28 çiziyor, büyüyen kart 35 çizip 0.47 ile
   * küçültüyor (≈16). Dokunma anında köşe SIÇRIYOR; cihazdaki şikâyet
   * birebir buydu ("bir anda köşeleri değişiyor"). Çizilen yarıçap p ile
   * birlikte animasyonlanınca ekrandaki köşe iki ucu da tutuyor.
   */
  boxStyle?: AnimatedStyle<ViewStyle>;
  /**
   * İÇ BLOĞUN ANİMASYONLU STİLİ — aynı sebep, iç köşe için.
   *
   * ⚠️ BOŞLUK VARKEN FOTOĞRAFI KIRPAN ŞEY BU BLOK (`overflow: hidden`), yani
   * dış köşe animasyonlanıp bu sabit kalırsa fotoğrafın köşesi kabuğunkinden
   * ayrışıyor.
   */
  innerStyle?: AnimatedStyle<ViewStyle>;
}

/**
 * ÇERÇEVELİ KUTU — üç katman, dıştan içe: GRİ ÇİZGİ → BOŞLUK → dolu blok.
 * Gerekçeler `RING_WIDTH`/`FILL_ALPHA`da.
 *
 * ⚠️ TEK UYGULAMA: şeridin anı kartı, şeridin poster karesi ve akış
 * başlığındaki deste ÜÇÜ DE bunu çiziyor. Ölçüler dışarıdan geliyor
 * (`campusBoxMetrics` ya da elle), yani iki boy aynı reçetenin iki ölçeği —
 * kopyalanmış iki kutu değil.
 *
 * ⚠️ KARTIN İÇİNDE DOKUNUŞUN ALTINDA duruyor, üstünde değil: şeridin kartı
 * basılı tutulduğunda iOS natif context menüsüyle KALKIYOR ve kalkan şeyin
 * çerçeveyi de taşıması gerekiyor (bkz. CampusMomentCard > `surface`).
 */
export const CampusOutlinedBox = memo(function CampusOutlinedBox({
  width,
  height,
  ring,
  gap,
  radius,
  children,
  accessibilityLabel,
  fill,
  gapFill,
  ringAlpha = RING_ALPHA,
  boxStyle,
  innerStyle,
}: CampusOutlinedBoxProps) {
  return (
    <Animated.View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
        width,
        height,
        borderRadius: radius,
        borderCurve: "continuous",
        overflow: "hidden",
        // ZEMİN YOK: çerçeve ile içerideki blok arasından HARİTA görünüyor
        // (istek). `transparent` yazmak yerine alan hiç verilmiyor.
        borderWidth: ring,
        // ⚠️ RENK RENDER SIRASINDA türetiliyor (palet mutable): modül
        // sabitine alınsa tema çevrildiğinde bayat kalır.
        borderColor: withAlpha(colors.textMuted, ringAlpha),
        },
        // Köşe animasyonu — gerekçe prop'un yanında.
        boxStyle,
      ]}
    >
      {/* BOŞLUK KATMANI — çerçeve ile içerideki blok arasındaki hava.
          Zemini YOK: Profil'de avatarın halkası ile fotoğrafı arasındaki
          boşluk "arkada ne varsa" onunla çiziliyor; burada arkada HARİTA
          var, yani boşluk gerçekten boş (istek). Kabuğun `overflow: hidden`ı
          sayesinde içerideki blok köşelerden taşmıyor. */}
      <View
        style={{
          flex: 1,
          padding: gap,
          // ⚠️ `undefined` = ŞEFFAF ve varsayılan o (gerekçe prop'un notunda).
          backgroundColor: gapFill,
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        {/* İÇERİDEKİ BLOK — kutunun tek dolu yüzeyi, çerçeveyle aynı griden
            (gerekçe FILL_ALPHA'da). `fill` verilirse o kazanıyor — tek
            müşterisi ve gerekçesi prop'un yanında. */}
        <Animated.View
          style={[
            {
            flex: 1,
            backgroundColor: fill ?? withAlpha(colors.textMuted, FILL_ALPHA),
            // ⚠️ İç yarıçap, bloğun dış kenardan TOPLAM uzaklığı kadar
            // düşüyor: çizgi RN'de kutunun İÇİNE çiziliyor, yani çocuk zaten
            // `ring` içeriden başlıyor, üstüne `gap` padding biniyor. Yalnız
            // boşluk çıkarılsaydı iç köşe dış kenarla kesişirdi (iç içe iki
            // eğri kuralı).
            borderRadius: radius - (ring + gap),
            borderCurve: "continuous",
            /**
             * ⚠️🔴 KIRPMA YALNIZ BOŞLUK VARKEN — animasyonlu kutuda ikinci
             * maske KIRILMAYA yol açıyor.
             *
             * Boşluk varken (şeridin 222pt'lik kutusu, gap 4) iç köşe dış
             * köşeden belirgin biçimde farklı ve bloğu dolduran çocuk ona
             * oturmak zorunda: kabuğun kendi `overflow: hidden`ı yalnız DIŞ
             * köşeyi kırpıyor, iç köşeyi değil.
             *
             * Boşluk SIFIRKEN (akışın bandındaki kareler) iki maske pratikte
             * AYNI eğri — aralarında yalnız `ring` kadar, yani bir saç teli
             * kadar fark var. İkisi birden kırptığında neredeyse üst üste
             * binen iki antialias kenarı oluşuyor ve kutu her karede yeniden
             * rasterize edilirken (süzülme) köşeler titreyip kopuyor.
             * Tek maske bırakılınca kırpma işini dıştaki yapıyor ve çocuk
             * aynı köşeye zaten doğru oturuyor.
             *
             * ⚠️ `borderRadius` DURUYOR: bloğun gri dolgusunun şekli ondan
             * geliyor. Kalkan tek şey KIRPMA.
             */
            overflow: gap > 0 ? "hidden" : "visible",
            alignItems: "center",
            justifyContent: "center",
            },
            innerStyle,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
});

/**
 * ⚠️ `CampusAddChip` KALDIRILDI (istek) — başlık satırının sağındaki küçük
 * çerçevesiz paylaşma kutusu buradaydı ve bir tur bile yaşadı. Aksiyon
 * haritanın SAĞ ÜST köşesindeki cam yuvarlak butona döndü (ilk hâli de o
 * ydu; bkz. FeedScreen > kampüs paylaş butonu).
 *
 * Geri istenirse reçete şuydu: kare, `campusBoxMetrics(size).radius`,
 * `withAlpha(colors.textMuted, FILL_ALPHA)` dolgu, ÇERÇEVE YOK ve artı glifi
 * karenin ~%58'i — tam boy kutunun 0.34 oranı küçük ölçekte glifi NOKTA gibi
 * gösteriyordu. Dikey dokunma payı da satırın boyuyla sınırlıydı: iOS
 * hit-test'i atanın sınırları dışına çıkan `hitSlop`u denemiyor.
 */
