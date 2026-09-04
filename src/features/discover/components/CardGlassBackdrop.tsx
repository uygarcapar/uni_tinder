import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { colors as theme } from "@/shared/theme/colors";
import { ultraThinBlurTint } from "@/shared/theme/blur";
import { hasLiquidGlassSurface } from "@/shared/theme/glass";

/**
 * Açık kartın ZEMİNİ — ana fotoğrafın blur'lanmış hali.
 *
 * Eskiden panel düz gri bir yüzeydi (surface3) ve dibinde sayfa zeminine inen
 * bir rampa vardı; ikisi de kalktı. Zemin artık kartın kendi kapak fotoğrafı,
 * kırılmış hâliyle.
 *
 * SCROLL'UN DIŞINDA çiziliyor, kart kabuğuna mutlak (bkz. SwipeCard —
 * ScrollWrapper'ın hemen öncesindeki çağrı): içerik üstünden akıp giderken
 * zemin KIPIRDAMIYOR. Bir dönem panelin içindeydi ve panel scroll içeriğinin
 * parçası olduğu için zemin de içerikle birlikte kayıyordu; istenen tam tersi,
 * ekrana çakılı duran bir duvar kâğıdı. Buranın kabı bu yüzden panelin değil
 * KARTIN ölçüsü — fotoğrafın nereye oturduğunu (bkz. ölçek notu) o belirliyor.
 *
 * Kapak fotoğrafı collapsed'ken bu katmanı zaten TAMAMEN örtüyor (kabukla kapak
 * aynı köşe yarıçapını okuyor, arada hilal bile kalmıyor — bkz.
 * CARD_FACE_CORNER_RADIUS); görünür olduğu tek yer panelin başladığı yerden
 * sonrası. Bu yüzden ayrı bir görünürlük animasyonu YOK.
 *
 * KABI HER KARE YENİDEN BOYUTLANDIRMA. Aşağıdaki opak taban (theme.bg — açık
 * modda beyaz) ve onun üstündeki `absoluteFill` fotoğraf ayrı layout
 * adımlarında iniyor: kap scroll'a bağlı büyüyüp küçüldüğünde fotoğraf bir kare
 * geriden geliyor ve momentumla scroll edilirken taban alt kenardan BEYAZ bir
 * bant olarak sızıyordu. Kap artık sabit (SwipeCard'da `absoluteFill`) ve öyle
 * kalmalı.
 *
 * ── İKİ AYRI YOL, AYIRAN ŞEY iOS 26 ───────────────────────────────────────
 *
 * YENİ YOL (iOS 26+, cam yüzey var):
 *   1. Fotoğraf — contentFit="cover", kırpması tepeye hizalı (bkz. ölçek
 *      notu). KENDİ blur'u YOK.
 *   2. `BlurView` — hem bulanıklık hem perde; malzemenin kendi tülü metnin
 *      kontrastını taşıyor, üstüne ayrı bir renk perdesi konmuyor.
 *
 * ESKİ YOL (iOS 26 ALTI + Android):
 *   1. Aynı fotoğraf, aynı yerleşim, ama bulanıklık KENDİ `blurRadius`'undan.
 *   2. Üstünde katman YOK — perde kaldırıldı (bkz. perde notu).
 *
 * Ayrımın sebebi tek ve yapısal: bu zeminin üstündeki bölüm kutuları yalnız
 * 26+'da CAM (bkz. SwipeCard > glassPanel, CardSectionBox). Cam yokken ortada
 * korunacak bir cam örneklemesi de yok, ama `BlurView`in bedeli duruyor —
 * 26 altında zemin ESKİ hâlinde kalıyor. Bu ikisi tek bir karar: kutular cam
 * değilse zemin de `BlurView` olmasın.
 *
 * ── AMA GÖRÜNÜŞ AYNI OLMALI ───────────────────────────────────────────────
 * Farklı olan MEKANİZMA, sonuç değil. Üç şey iki yolda da eşleşiyor ve öyle
 * kalmalı:
 *   • YERLEŞİM — tek bir `Image`, iki dalda da aynı stil/`contentFit`/ölçek.
 *     Yolların ayrıştığı yer yalnızca `blurRadius` ve üstteki katman; kutu ve
 *     kırpma ortak. Yerleşimi bir dala özel yapma.
 *   • BULANIKLIK MİKTARI — bkz. BACKDROP_BLUR_SCREEN_RADIUS (eski yol yeni
 *     yolun yayılmasını taklit ediyor, ve ölçeği hesaba katıyor).
 *   • ÜSTTE AYRI RENK KATMANI YOKLUĞU — iki yolda da fotoğrafın kendisi
 *     görünüyor (bkz. perde notu). Tek fark 26+'daki malzemenin kendi tülü;
 *     eski yolda onun karşılığı yok, oradaki tek "yoğunluk" bulanıklığın
 *     kendisi.
 */

/**
 * ── BULANIKLIK `BlurView` İLE (2026-09-04, istek) ──────────────────────────
 *
 * Bir dönem bulanıklık fotoğrafın KENDİ `blurRadius`'undan geliyordu ve bu
 * dosyada "buraya BlurView geri koyma" yazıyordu. Gerekçesi hâlâ geçerli, o
 * yüzden siliniyor değil buraya taşınıyor:
 *
 *   `BlurView` bir `UIVisualEffectView` ve bu zeminin ÜSTÜNDE cam bölüm
 *   kutuları (CardSectionBox) duruyor. Bir efekt view'in arkasında başka bir
 *   efekt view olması iOS'ta tanımsız: cam örneklemesi kimi karede boş
 *   dönüyordu ve kutular "bir görünüp bir kaybolan" katmanlara dönüşmüştü.
 *   Fotoğrafın kendi blur'u (SDImageBlurTransformer) DÜZ bir bitmap üretiyor →
 *   camın örnekleyeceği sağlam bir zemin.
 *
 * Bu yüzden yeni yolda ikisi BİRLİKTE çalışıyor ama ROLLERİ AYRI: fotoğrafın
 * `blurRadius`'u bitmap'i yumuşatıyor (efekt view eklemeden, bkz.
 * BACKDROP_EXTRA_SCREEN_RADIUS), `BlurView` ise üstüne malzemeyi koyuyor.
 * Efekt view sayısı hâlâ BİR — ikinci bir `BlurView` ekleme.
 *
 * BÖLÜM KUTULARI YİNE KAYBOLMAYA BAŞLARSA İLK ŞÜPHELİ BURASI, ve teşhis
 * "bazı kartlarda/bazı bölümlerde cam yok" biçiminde gelir — kutuların kendi
 * kodunda arama, önce `blurViewPath`i kapat (tüm sürümler eski yola düşer).
 */
/**
 * ── BU SAYI BULANIKLIK KNOB'U DEĞİL, TÜL KNOB'U ───────────────────────────
 *
 * `intensity` malzemenin ne kadar "geldiğini" ayarlıyor ve malzeme İKİ ŞEYİ
 * BİRDEN taşıyor: bulanıklık ve kendi rengi (açık modda sütlü beyaz bir tül).
 * Yani intensity'i büyütmek "daha bulanık" değil, "daha beyaz" demek.
 *
 * 100 → 40 → 55 (istek): 100'de zemin hangi fotoğrafta olursa olsun beyaz
 * görünüyordu, 40 fazla ince kaldı. Kaybedilen bulanıklık her seferinde
 * ön-blur'dan geri alındı (bkz. BACKDROP_EXTRA_SCREEN_RADIUS) — EKRANDAKİ
 * TOPLAM YAYILMA DEĞİŞMİYOR, yalnız payı malzemeyle bitmap arasında kayıyor.
 *
 * İKİSİNİ BİRLİKTE OYNAT: bu sayıyı değiştirirsen MATERIAL_SCREEN_RADIUS'u da
 * güncelle, yoksa 26 altı yol (aynı toplamı tek başına taşıyor) sessizce
 * ayrışır.
 */
export const BACKDROP_BLUR_INTENSITY = 55;

/**
 * Malzemenin TEK BAŞINA verdiği yayılma (pt) — ölçülmüş değil, GÖZLENMİŞ.
 *
 * Sistem malzemesinin yarıçapı sabit ve JS'ten okunmuyor; bu sayı yaklaşık ve
 * `BACKDROP_BLUR_INTENSITY` ile birlikte ölçekleniyor (100'de ~30, 55'te ~17).
 * Yalnız iki yolu hizalamak için var (bkz. BACKDROP_BLUR_SCREEN_RADIUS);
 * doğrudan bir knob DEĞİL.
 */
const MATERIAL_SCREEN_RADIUS = 17;

/**
 * ── ASIL BULANIKLIK KNOB'U ────────────────────────────────────────────────
 *
 * Bulanıklığın büyük kısmı buradan geliyor: fotoğrafın KENDİ ön-blur'u,
 * malzemenin altına bitmap üzerinde uygulanıyor. "Daha bulanık olsun" isteğinin
 * karşılığı bu sayı — intensity DEĞİL, o tülü kalınlaştırır (bkz. yukarısı).
 *
 * BUNUN İÇİN İKİNCİ BİR `BlurView` KOYMA. Üst üste iki efekt view, cam bölüm
 * kutularının kaybolma hikâyesinin ta kendisi (bkz. yukarıdaki not) — ön-blur
 * ise düz bir bitmap üretiyor, ağaca yeni bir efekt view eklemiyor. Ayrıca
 * malzeme kademesini kalınlaştırmak da çözüm DEĞİL: o bulanıklığı değil TÜLÜ
 * artırır, yani fotoğrafı beyazlatır (bkz. perde notu).
 *
 * 16 → 34 → 29: malzemenin yoğunluğu her değiştiğinde (100 → 40 → 55) onun
 * bıraktığı yayılma buradan telafi ediliyor. Toplam HER ZAMAN 46:
 * 30+16 → 12+34 → 17+29.
 *
 * Bedeli: blur'lu hâl ayrı bir cache girdisi (transformer anahtarı), yani kapak
 * cache'te olsa bile kart başına bir dönüşüm karesi. `priority="low"` ve opak
 * taban bu pencereyi zaten örtüyor.
 */
const BACKDROP_EXTRA_SCREEN_RADIUS = 29;

/**
 * Eski yolun (26 altı) hedefi: EKRANDA yeni yolla aynı miktarda bulanıklık.
 * Orada malzeme yok, dolayısıyla toplamın tamamını fotoğrafın kendi blur'u
 * taşıyor. İki yol arasındaki tek görünür fark bulanıklığın MİKTARI olmamalı.
 */
const BACKDROP_BLUR_SCREEN_RADIUS =
  MATERIAL_SCREEN_RADIUS + BACKDROP_EXTRA_SCREEN_RADIUS;

/**
 * `BlurView` yolu YALNIZ iOS 26+'da.
 *
 * `Platform.OS === "ios"` DEĞİL, `hasLiquidGlassSurface()`: ayıran şey işletim
 * sistemi değil, üstteki kutuların cam OLUP OLMAMASI — ve o karar aynı kapıdan
 * geçiyor (bkz. CardSectionBox). Bayrak `UIDesignRequiresCompatibility`yi de
 * hesaba katıyor, yani cam kapatılmış bir binary'de 26'da da eski yol.
 *
 * Android bu kapıdan zaten geçemiyor, ve orada ayrıca `BlurView`
 * BULANIKLAŞTIRMIYOR (`experimentalBlurMethod` verilmedi, varsayılan 'none' →
 * yalnızca tint'li düz bir katman). İki gerekçe aynı yere çıkıyor.
 *
 * İki yol ASLA ÜST ÜSTE binmiyor: blur üstüne blur hem bedava değil hem de
 * zemini gereksiz ölü bir levhaya çeviriyor.
 *
 * RENDER ANINDA ÇAĞRILIYOR, modül seviyesinde sabitlenmiyor: bayrağın kaynağı
 * native modülün kendi sabiti, modül import sırasına bağlanmasın.
 */
const blurViewPath = (): boolean => hasLiquidGlassSurface();

/**
 * ── ÖLÇEK: ÇERÇEVEYİ DOLDURAN EN KÜÇÜK BÜYÜTME ────────────────────────────
 *
 * İşi `contentFit="cover"` yapıyor, elle bir `scale` YOK (BACKDROP_ZOOM = 1).
 * "cover" tanımı gereği boşluk bırakmayan EN KÜÇÜK ölçek, yani "gerektiği kadar
 * yakınlaştır, fazlası değil" tam olarak bu.
 *
 * BİR TUR "contain" DENENDİ VE GERİ ALINDI. Fikir "fotoğraf genişliğe sığsın,
 * hiç büyütülmesin"di; kart çerçevesi dar ve çok uzun olduğu için sonuç şuydu:
 * fotoğraf üst ~%55'te bitiyor, altında kalan bant düz opak taban (koyu modda
 * kapkara) olarak duruyordu. Zemin "duvar kâğıdı" değil, yarısı kesilmiş bir
 * levha gibi okunuyordu. Ölçüyü elle bir `scale` ile kapatmaya çalışma: boşluğu
 * tam kapatan sayı fotoğrafın EN-BOY ORANINA göre değişir (3:4 için ~1.5, 9:16
 * için ~1.05), yani sabit bir çarpan kimi fotoğrafta boşluk bırakır kimini
 * gereksiz büyütür. "cover" bunu fotoğraf başına kendisi hesaplıyor.
 *
 * ELLE `scale` GEÇMİŞİ, kayıt için: bir dönem 6.5'e kadar çıkıp 3.5 → 3 → 2.2
 * → 2 → 1 diye indi. Sebebi zeminin panel boyunca RENK DEĞİŞTİRMESİYDİ (saç →
 * ten → arka plan) ve büyütmek merkezdeki tek rengi yayarak bunu bastırıyordu.
 * O sorunun kendisi kalktı: zemin artık scroll ile kaymıyor (bkz. SwipeCard,
 * kabuk seviyesindeki not), içerik akarken yerinde duruyor — dolayısıyla
 * "bölümden bölüme renk yürüyüşü" diye bir şey de yok. Yani buraya yeniden bir
 * çarpan koymadan önce hangi sorunu çözdüğünü söyleyebiliyor olman lazım.
 *
 * BUNU BULANIKLIKLA KARIŞTIRMA: yumuşaklık knob'u `BACKDROP_BLUR_INTENSITY`
 * (eski yolda `BACKDROP_BLUR_SCREEN_RADIUS`), bu değil.
 *
 * Değer 1'den ayrılırsa: transform bu YAPRAK Image'in kendisinde, cam
 * katmanların (GlassView) ATA zincirinde değil — kimliksel olmayan transform'un
 * camı sessizce öldürdüğü kural burada tetiklenmiyor. Ölçeği yukarıdaki kaba
 * TAŞIMA. (Eski yolun `blurRadius`'u da bu değere bağlı, bkz. aşağısı.)
 */
const BACKDROP_ZOOM = 1;

/**
 * EKRANDA istenen yayılmayı `blurRadius` PROP'una çeviren dönüşüm — SABİT SAYI
 * YAZMA, bunu kullan (bu yüzden `BACKDROP_ZOOM`dan SONRA duruyor; yukarı
 * taşırsan TDZ'ye düşer).
 *
 * İki çarpan var ve ikisi de gözden kaçıyor:
 *   1. Native taraf prop'u İKİYE BÖLÜYOR (ImageModule.swift:
 *      `view.blurRadius = radius / 2.0`) → prop'u iki katına çıkar.
 *   2. Blur fotoğrafın BİTMAP'ine uygulanıyor, ölçek ise o bitmap'i ekranda
 *      büyütüyor → blur da ölçek kadar büyüyor. `BlurView` yolunda bu YOK,
 *      orası ekrana çizilmiş pikselleri bulanıklaştırıyor, yani ölçekten
 *      etkilenmiyor. Ölçeğe BÖL.
 *
 * Bir dönem sabit 90'dı ve zoom 2'yken ekranda ~90pt ediyordu — hedefin üç
 * katı. İki yol yan yana konunca fark tam buradaydı: 26 altında zemin
 * "tanınmaz bulanık", 26+'da "yumuşak ama okunur".
 */
const toBlurProp = (screenRadius: number): number =>
  (screenRadius * 2) / BACKDROP_ZOOM;

/**
 * ── AYRI PERDE KATMANI YOK, İKİ YOLDA DA (2026-09-04, istek) ───────────────
 *
 * Eski yolda (26 altı) fotoğrafın üstünde düz bir dolgu vardı — `backdropScrim`:
 * açık modda `theme.bg` (BEYAZ) @0.5, koyu modda siyah @0.58. Açık modda yaptığı
 * iş fotoğrafı BEYAZLATMAKTI ve kaldırıldı. Yeni yolda (26+) zaten yoktu;
 * oradaki tül `BlurView`in kendi malzemesinden geliyor.
 *
 * MALZEME DE EN İNCESİNE İNDİ (`ultraThinBlurTint`). Perde kalktıktan sonra açık
 * modda hâlâ "fotoğrafın üstünde beyaz bir tül var" görüntüsü kalıyordu ve
 * kaynağı buydu: chrome malzemesi kalın, kendi tülü sütlü beyaz ve altındaki
 * fotoğrafın rengini yutuyor. Ultra-thin bulanıklığı bırakıp tülü en aza
 * indiriyor. HEDEF: fotoğraf KENDİ RENKLERİNDE, sadece bulanık.
 *
 * KADEMEYİ KALINLAŞTIRMA (ultraThin → thin → chrome). Yönü her kalınlaştırma
 * beyazlatmaya geri götürür; bu yol bilerek en incede duruyor.
 *
 * PERDEYİ GERİ EKLEMEDEN ÖNCE OKU. Perde daha önce de bir kez kaldırılıp geri
 * konmuştu ve geri konma sebebi hâlâ geçerli bir risk: perdesiz zeminde panel
 * yazısı doğrudan fotoğrafın rengiyle yarışıyor, o renk de kart başına değişiyor
 * — koyu kapakta açık modun koyu mürekkebi, parlak kapakta koyu modun açık
 * mürekkebi kayboluyor. Zemin bu yolda en canlı hâlinde olduğu için risk de en
 * yüksek burada. Kontrast şikâyeti gelirse doğru sıra:
 *   1. Yazının KENDİ yüzeyi — bölüm kutularının cam tint'i
 *      (CardSectionBox > sectionGlassTint). Okunurluk oranın işi, zeminin değil.
 *   2. 26 altı için `BACKDROP_BLUR_SCREEN_RADIUS`.
 * Perde en son çare; geri gelirse de açık modda BEYAZLATTIĞI bilinerek gelir.
 *
 * ── AŞAĞIDAKİ ESKİ GEREKÇE, KAYIT İÇİN ─────────────────────────────────────
 *
 * İKİSİ DE MODLA DÖNÜYOR (perde `theme.bg`/siyah, malzeme
 * systemChromeMaterialLight/Dark) ve bu, "foto üstündeki blur'lar açık modda da
 * koyu kalır" kuralının (bkz. theme/blur.ts) bilinçli istisnası. Gerekçe: bu
 * katman bir fotoğraf perdesi değil, PANELİN ZEMİNİ — üstündeki bölüm kutuları
 * ve içlerindeki yazı tema mürekkebini okuyor. Açık modda koyu perde "az
 * karartmak" değil YANLIŞ YÖN olurdu, yazıyı ve zemini birlikte koyultur.
 *
 * Sabit `dark` bir tur denendi ve geri alındı (istek). Denemenin dayanağı
 * aksiyon gliflerinin `onMedia` (sabit beyaz) olmasıydı (bkz. SwipeCard >
 * actionGlyphColor) — o glifler için doğru, ama panelin GERİ KALANI için değil.
 *
 * Perde bir dönem TAMAMEN kaldırılıp geri konmuştu; o denemede yerine bir şey
 * konmamıştı, panel yazısı doğrudan fotoğrafın rengiyle yarışıyordu.
 *
 * Perde geri gelirse alfaları malzemeyi TAKLİT ETMELİ (hedef: iki yolun aynı
 * yoğunlukta durması), ve iki alfa AYRI ayarlanır — renkleri zıt olduğu için
 * aynı sayı iki modda apayrı iş yapıyor. Son değerler 0.5 (açık) / 0.58 (koyu)
 * idi; ondan önce 0.35 / 0.52 vardı ve malzemenin altında kalıyordu.
 */

/**
 * ALT UÇTA SÖNME YOK, bilerek: bir ara buraya "kart dibe doğru sayfaya
 * karışsın" diye rampa konmuştu, ama bounce'ta görünen sert bitiş bu katman
 * DEĞİL — üstündeki panelin yuvarlak alt kenarı (bkz. SwipeCard >
 * PANEL_FADE_HEIGHT). Zemin sabit ve kartı baştan sona kaplamalı; buraya rampa
 * koymak ekranın alt bandındaki cam kutuların kıracağı zemini de siliyordu.
 */

/**
 * KAPAĞIN DİBİNDEKİ GEÇİŞ BURADA DEĞİL, ve bir kopya olarak da yazılmamalı:
 * bu zeminin blur'lu kopyasını kapağın üstüne çizip söndürmek denendi ve
 * TUTMADI — kopya kapağın dikdörtgeninde, zemin kartın çerçevesinde
 * ölçeklendiği için `contentFit="cover"` eşlemesi farklı çıkıyor ve dikişte
 * tonlar kaymış duruyor. Doğru yol kopya değil, KAPAĞIN DİBİNİ SÖNDÜRÜP bu
 * zemini olduğu gibi göstermek (bkz. SwipeCard > COVER_BOTTOM_FADE_HEIGHT).
 */

export default function CardGlassBackdrop({ uri }: { uri: string }) {
  const blurView = blurViewPath();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        // Opak taban — fotoğraf gelene kadarki pencere için. Sheet'lerde bu
        // taban olmazsa o karede kartın altındaki karartılmış ekran görünürdü:
        // orada kartın kendi zemini de şeffaf (bkz. SwipeCard kart kabuğu).
        { backgroundColor: theme.bg },
      ]}
    >
      <Image
        source={{ uri }}
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ scale: BACKDROP_ZOOM }] },
        ]}
        // "cover": çerçeveyi BOŞLUKSUZ dolduran EN KÜÇÜK ölçek. Elle bir
        // `scale` ile taklit etmeye çalışma — doğru sayı fotoğrafın en-boy
        // oranına göre değişir (bkz. ölçek notu).
        contentFit="cover"
        // Kırpma TEPEDEN hizalı: kapak fotoğrafında görünen kadraj burada da
        // üstte kalsın, kesilen yer fotoğrafın dibi olsun.
        contentPosition="top"
        // İKİ YOLDA DA VAR, ama farklı işi yapıyor:
        //   • Yeni yolda malzemenin ÜSTÜNE eklenen pay (intensity tavanda
        //     olduğu için bulanıklığın tek knob'u bu).
        //   • Eski yolda bulanıklığın TAMAMI.
        blurRadius={toBlurProp(
          blurView ? BACKDROP_EXTRA_SCREEN_RADIUS : BACKDROP_BLUR_SCREEN_RADIUS,
        )}
        cachePolicy="memory-disk"
        // Öncelik düşük: kapak önce çizilsin.
        priority="low"
        transition={200}
      />
      {/* 26 ALTINDA BURAYA HİÇBİR ŞEY GELMİYOR: orada bulanıklık fotoğrafın
          kendi `blurRadius`'undan ve üstünde ayrı bir katman YOK. Bir dönem düz
          bir renk perdesi vardı, kaldırıldı (bkz. perde notu). */}
      {blurView && (
        <BlurView
          intensity={BACKDROP_BLUR_INTENSITY}
          // EN İNCE KADEME, bilerek: kalın malzemeler açık modda sütlü beyaz
          // bir tül basıp fotoğrafın rengini yutuyordu. Kademeyi kalınlaştırma
          // (bkz. perde notu). Modla dönüyor — foto üstü kuralının istisnası.
          tint={ultraThinBlurTint()}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}
