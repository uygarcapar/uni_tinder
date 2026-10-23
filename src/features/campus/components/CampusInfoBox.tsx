import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { campusInfoArtFor } from "@/features/campus/campusInfoArt";
import { Plus } from "@/shared/icons";
import { colors, withAlpha } from "@/shared/theme/colors";

/**
 * KAMPÜS ŞERİDİNİN "DOLGU" KUTULARI — poster kutusu ve paylaşma kutusu.
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
 * ── İkisi AYNI KABUK, iki zemin ────────────────────────────────────────────
 * Kabuk — ölçü, yarıçap, köşe eğrisi — tek yerde duruyor: iki ayrı dosyaya
 * bölünse şeritte yan yana duran iki kutu kaçınılmaz olarak ayrışırdı.
 * Zeminleri AYRI: poster kutusunda fotoğraf, paylaşma kutusunda temanın düz
 * rengi (gerekçe `CampusAddBox`ta).
 */

/** Kutunun köşesi — `CampusMomentCard` ile AYNI olmak zorunda (yan yana). */
const BOX_RADIUS = 28;

/**
 * PAYLAŞMA KUTUSUNUN ÇERÇEVESİ — Profil'deki avatar halkasının kuralı.
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
 * Dışa eklenseydi paylaşma kutusu şeritte poster karelerinden birkaç pt
 * büyük olur ve `snapToInterval` ile kayardı.
 *
 * Sayılar avatarınkinden (3/3) büyük: orada halka 80pt'lik bir dairede,
 * burada 200–300pt'lik bir karede duruyor ve aynı oran gözle görünmüyordu.
 * Ayar üç turda geldi: 2/14 → 4/8 → 6/5 → 7/4 (istek, üç kez "boşluğu azalt
 * kenarı kalınlaştır"). Çizgi artık boşluktan KALIN — avatardaki eşit orandan
 * bilerek ayrışıyor: orada halka 80pt'lik bir dairenin dekoru, burada 200pt+
 * bir kutunun haritanın üstünde kendini taşıyan kenarı.
 *
 * ⚠️ BOŞLUK 4'ÜN ALTINA İNMESİN: 3'te çizgi ile blok arasındaki hava bir
 * render artefaktı gibi okunmaya başlıyor (ölçü @3x'te 9px) ve çerçeve
 * yeniden "kutunun kendi kenarı" hâline dönüyor — bu düzenin tamamı o
 * okunuşu kırmak için var. Daha kalın bir kenar isteniyorsa boşluğu değil
 * `RING_WIDTH`i büyüt; 10 civarı iç bloğu artı + yazıya dar getiriyor.
 *
 * ⚠️ RENK `colors.border` DEĞİL `colors.textMuted` (istek: "gri olsun").
 * `border` temanın yüzey ailesinden türüyor ve koyu temada #3A3A3A —
 * haritanın üstünde fiilen görünmüyordu. `textMuted` İKİ TEMADA DA aynı
 * nötr gri (#8E8E93), yani çerçeve açık ve koyu modda aynı güçte duruyor.
 * Bir metin rengi olması tesadüf değil: tabloda tek "tema ile dönmeyen
 * gri" o.
 *
 * ⚠️ Renk SABİTE alınmıyor — palet mutable ve modül seviyesinde türetilen
 * bir renk tema değişiminde bayat kalıyor (colors.ts'in iki kuralından
 * biri). Ölçüler sabit, renk inline okunuyor.
 */
const RING_WIDTH = 7;
const RING_GAP = 4;

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

interface ShellProps {
  width: number;
  height: number;
  children: React.ReactNode;
  /**
   * DOLU DEĞİL, ÇERÇEVELİ: kabuk zeminsiz kalıyor ve dış kenarına gri bir
   * çizgi çiziliyor. Paylaşma kutusunun kabuğu bu — gerekçe `CampusAddBox`ta.
   */
  outlined?: boolean;
  /**
   * Kutunun kendi metni YOK (kelime karede yazılı) — kuralı taşıyan tek yer
   * burası. Verilmezse kabuk erişilebilirlik ağacında görünmüyor.
   */
  accessibilityLabel?: string;
}

/** Ortak kabuk: ölçü + köşe. Zemini çağıran koyuyor. */
function BoxShell({
  width,
  height,
  children,
  outlined,
  accessibilityLabel,
}: ShellProps) {
  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{
        width,
        height,
        borderRadius: BOX_RADIUS,
        borderCurve: "continuous",
        overflow: "hidden",
        ...(outlined
          ? {
              // ZEMİN YOK: çerçeve ile içerideki blok arasından HARİTA
              // görünüyor (istek). `transparent` yazmak yerine alan hiç
              // verilmiyor — RN'de zemin zaten varsayılan olarak yok.
              borderWidth: RING_WIDTH,
              borderColor: colors.textMuted,
            }
          : {
              // Fotoğraf çözülene kadar görünen tek şey — kutu o bir karede
              // beyaz/boş parlamıyor.
              backgroundColor: colors.surface2,
            }),
      }}
    >
      {children}
    </View>
  );
}

export interface CampusInfoBoxProps {
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

/** POSTER KUTUSU — kare + sol üstte imza, başka hiçbir şey. */
export const CampusInfoBox = memo(function CampusInfoBox({
  width,
  height,
  infoKey,
  text,
}: CampusInfoBoxProps) {
  const source = campusInfoArtFor(infoKey);

  return (
    <BoxShell width={width} height={height} accessibilityLabel={text}>
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
    </BoxShell>
  );
});

export interface CampusAddBoxProps {
  width: number;
  height: number;
  onPress: () => void;
  label: string;
}

/**
 * PAYLAŞMA KUTUSU — şeridin BAŞINDA: ORTADA artı, ALTINDA tek satır.
 *
 * ⚠️ Eskiden bu bir sağ üst köşe cam butonuydu ("+"). Şeride taşındı: aksiyon
 * artık desteyle aynı hatta ve "ilk kutu sensin" okunuşunu veriyor.
 *
 * ⚠️ ZEMİN DÜZ TEK RENK (istek) — modun aksanından türeyen gradyan KALKTI.
 * Gradyan şeridin tek "boş" yüzeyini de renkli bir lekeye çeviriyordu ve
 * yanındaki üç poster zaten renk taşıyor; aksiyon kutusunun işi dikkat
 * çekmek değil, DURMAK.
 *
 * ⚠️ KUTUDA MOD RENGİ HİÇ KALMADI ve bu yüzden `mode` prop'u da kalktı:
 * önce zemin gradyanı, sonra artının arkasındaki aksan dairesi, en son da
 * glifin kendi aksan rengi gitti (yerine `colors.text`). Mod bağı şeridin
 * geri kalanında duruyor — gerçek anların karar butonları ve başlık.
 *
 * ⚠️ ÖLÜ BUTON ÇİZİLMİYOR — çağıran yalnız `canShare` iken mount ediyor
 * (kampüs dışındaysa, bugün paylaşmışsa ya da özellik kapalıysa kutu HİÇ yok).
 * Basınca hata veren bir artı kullanıcıyı her seferinde kandırırdı.
 */
export const CampusAddBox = memo(function CampusAddBox({
  width,
  height,
  onPress,
  label,
}: CampusAddBoxProps) {
  return (
    <AnimatedPressable
      pressScale={0.97}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <BoxShell width={width} height={height} outlined>
        {/* BOŞLUK KATMANI — çerçeve ile içerideki blok arasındaki hava.
            Zemini YOK: Profil'de avatarın halkası ile fotoğrafı arasındaki
            boşluk "arkada ne varsa" onunla çiziliyor; burada arkada HARİTA
            var, yani boşluk gerçekten boş (istek). Kabuğun `overflow:
            hidden`ı sayesinde içerideki blok köşelerden taşmıyor. */}
        <View
          style={{
            flex: 1,
            padding: RING_GAP,
            alignItems: "stretch",
            justifyContent: "center",
          }}
        >
          {/* İÇERİDEKİ BLOK — kutunun tek dolu yüzeyi, çerçeveyle aynı
              griden (gerekçe FILL_ALPHA'da). */}
          <View
            style={{
              flex: 1,
              backgroundColor: withAlpha(colors.textMuted, FILL_ALPHA),
              // ⚠️ İç yarıçap, bloğun dış kenardan TOPLAM uzaklığı kadar
              // düşüyor: çizgi RN'de kutunun İÇİNE çiziliyor, yani çocuk
              // zaten `RING_WIDTH` içeriden başlıyor, üstüne `RING_GAP`
              // padding biniyor. Yalnız boşluk çıkarılsaydı iç köşe dış
              // kenarla kesişirdi (iç içe iki eğri kuralı).
              borderRadius: BOX_RADIUS - (RING_WIDTH + RING_GAP),
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* ÇIPLAK ARTI, BÜYÜK (istek).
              ⚠️ Arkasında 62pt'lik aksan rengi bir daire vardı ve gerekçesi
              "kutunun ortasındaki çıplak bir glif dokunulabilir olduğunu
              söylemiyor"du. Düz zemine geçince o kapsül kutunun içinde ikinci
              bir kutuya dönüştü; dokunulabilirliği artık BÜYÜKLÜK taşıyor —
              76pt'lik bir artı yüzeyin tek odağı ve altındaki satır onu
              adlandırıyor.

              ⚠️ RENK AKSAN DEĞİL `colors.text` (istek: "siyah veya beyaz"):
              koyu temada beyaz, açık temada siyah. Glif bir dönem modun
              aksanındaydı; çerçeve gelince kutuda iki ayrı vurgu oluyordu ve
              mod bağı zaten şeridin geri kalanında (gerçek anların karar
              butonları, başlık) duruyor. */}
            <Plus size={76} color={colors.text} strokeWidth={2} />
            <Text
              numberOfLines={2}
              style={{
                marginTop: 14,
                paddingHorizontal: 14,
                textAlign: "center",
                color: colors.text,
                fontSize: 14.5,
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </View>
        </View>
      </BoxShell>
    </AnimatedPressable>
  );
});
