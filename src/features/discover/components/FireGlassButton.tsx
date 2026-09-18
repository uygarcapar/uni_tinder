import { memo } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { Host, Button as SwiftUIButton, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityLabel as a11yLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import FireGlyph from "@/shared/components/FireGlyph";
import { colors as theme, gradients, withAlpha } from "@/shared/theme/colors";
import { glassFallback, GLASS_ICON_BUTTON } from "@/shared/theme/glass";

/**
 * SwipeCard expanded'ken sağ üstte ASILI KALAN Fire butonu.
 *
 * Kapaktaki serbest alevden farkı kabuğu: burada glyph iOS 26'nın native liquid
 * glass butonunun İÇİNDE duruyor. Gerekçe: sticky duruşta işaret artık
 * fotoğrafın değil, yukarı akan panel zemininin üstünde de kalabiliyor — kendi
 * başına duran bir glyph orada okunmuyordu. Cam kabuk arkasındaki her şeyi
 * kırıp bulanıklaştırdığı için hem foto hem panel üstünde aynı kontrastı verir.
 *
 * Stil `.glass` DEĞİL `.glassProminent`: sade cam neredeyse berrak kalıyor ve
 * tint'i ancak bir ton olarak gösteriyor — buton renkli okunmuyor, beyaz glyph
 * de parlak fotoğraf üstünde yıkanıyordu. Prominent, camın kırılmasını koruyup
 * dolguyu tint'e boyuyor: sıcak kırmızı kabuk + beyaz alev.
 *
 * Tint glyph'in KENDİ kırmızısı (gradients.swipeHeart'ın ilk durağı, #fc1919) —
 * bkz. fireTint(). Önce `accentOrange` denendi, turuncu temsil ettiği
 * işaretin ailesinden kopuyordu; sonra marka `primary`'sine (#ff4d3d) geçildi
 * ama o da kırmızıdan çok mercan/turuncu okunuyordu. Artık buton, kapaktaki
 * alev (FireBurnCanvas) ve kutlama alevi (FireFlameCanvas ısı
 * rampası) aynı kırmızıdan besleniyor. accentOrange zaten kırpma ekranının
 * kendi aksanı — o ayrı kalsın.
 *
 * Glyph SF `flame.fill` DEĞİL, uygulamanın kendi alevi (bkz. FireGlyph —
 * ürünün Fire işareti KALPTEN ALEVE geçti): butonun label'ı RNHostView
 * ile SwiftUI'ın içine gömülen bir RN alt ağacı. Böylece iOS 26'nın basış
 * animasyonunda cam ile glyph BİRLİKTE ölçekleniyor — camın üstüne RN katmanı
 * bindirseydik glyph yerinde donardı.
 *
 * KAPAKTAKİ YANMA BURAYA GELMİYOR, bilerek: alev orada her karede silüetini
 * değiştiren bir Skia canvas'ı (bkz. FireBurnCanvas) ve onu RNHostView'ın
 * içine, SwiftUI'ın cam katmanının altına sokmak hem gereksiz hem riskli —
 * yanma ÇEKME jestinin geri bildirimi, bu duruşta çekme diye bir şey yok,
 * yalnız dokunma var. Burada glyph düz beyaz duruyor.
 *
 * Kapaktaki gradyan ve shimmer da buraya TAŞINMADI: dolgu düz beyaz — kırmızı
 * gradyan kendi ailesinden bir kabuğun üstünde okunmuyordu. Parıltıyı camın
 * kendi spekülar hareketi veriyor.
 */

/**
 * KART üstündeki cam butonların ortak büyütme payı — ekran başlıklarındaki
 * (sohbet, profil, bildirimler, ayarlar) cam ikon butonlarının üstüne eklenir.
 *
 * Kartın iki köşe butonu tam ekran bir fotoğrafın üstünde, chrome'daki
 * kardeşleri ise dar bir başlık şeridinde duruyor: aynı çap orada dengeli,
 * burada ufak kalıyordu. Pay TEK YERDE, çünkü ortak sabiti (GLASS_ICON_BUTTON)
 * büyütmek bütün ekranların başlık butonlarını da büyütürdü.
 *
 * KUTUYA DA EKLENMEK ZORUNDA (aşağıdaki FIRE_GLASS_LABEL_BOX): dairenin
 * GÖRÜNEN çapı `frame()`ten değil label + controlSize payından geliyor —
 * yalnız frame'i büyütmek kabuğu değil, kabuğun içinde durduğu boşluğu
 * büyütür.
 */
const CARD_GLASS_BUMP = 4;

/**
 * Cam kabuğun dış ölçüsü: ortak cam ikon butonu + kartın payı (bkz.
 * GLASS_ICON_BUTTON ve CARD_GLASS_BUMP). Sohbet başlığındaki geri/menü ve
 * profil başlığındaki çan/ayarlar butonlarıyla aynı DİLDEN, bir tık büyük.
 *
 * ŞERİDİN İKİ UCU BU SAYIYI PAYLAŞIYOR: soldaki isim satırının payı da buradan
 * okunuyor (bkz. CardStickyHeader > TITLE_LEFT_INSET) — sağdaki daireyle aynı
 * köşe boşluğunda başlasın.
 * Şeridin kendi ölçüleri de (TITLE_TOP / TITLE_HEIGHT / CARD_HEADER_HEIGHT,
 * bkz. CardStickyHeader) buradan türüyor, yani değiştirmek bandı da küçültür.
 * Başlık satırının MERKEZİ bundan etkilenmiyor: TITLE_TOP =
 * FIRE_GLASS_INSET ve inset farkın yarısını geri aldığı için satır
 * kısalırken merkezi yerinde kalıyor.
 *
 * 80 → 64 → 50 → 58 → 40 → 44 (48 denendi, geri alındı: kabuk gliflerin
 * yanında fazla boş kalıyordu). Kapaktaki serbest alevden (FIRE_SIZE 55)
 * hâlâ KÜÇÜK; iki şeklin merkezi de çakışmaya devam ediyor
 * (FIRE_GLASS_INSET farkı işaretiyle birlikte götürüyor, yani kabuk
 * büyürken buton köşeye yaklaşıyor ama MERKEZİ kıpırdamıyor — alev→cam
 * geçişi ve şeridin başlık hizası bundan etkilenmiyor). 55'e kadar çıkarsa
 * kabuk serbest alevle aynı çapa gelir ve inset de onunkine (28) eşitlenir;
 * ötesi geçişi ters çevirir (kabuk glyph'ten büyük).
 *
 * Glifler kabukla BİRLİKTE büyümüyor: alev (29) ve ok (19) kendi sabitlerinde
 * kaldı, büyüyen pay cam kenara gitti (glyph'in kabuğa oranı 0.73 → 0.66).
 * Buradan daha da büyütülecekse glifler de büyümeli, yoksa işaret kabuğun
 * içinde kaybolur — 48'de olan buydu.
 */
export const FIRE_GLASS_SIZE = GLASS_ICON_BUTTON.size + CARD_GLASS_BUMP;

/**
 * Kabuğun içindeki alev. Cam kenarın nefes payı kalsın diye kabuktan küçük.
 *
 * KABUĞUN ÖLÇÜSÜNÜ BU BELİRLEMİYOR (artık): iOS 26'nın cam butonu label'ın
 * kutusunu sarıyor, o yüzden çapı FIRE_GLASS_LABEL_BOX taşıyor. Bu sabit
 * yalnızca çizilen glyph'in kendi ölçüsü — kutunun içinde ortalı duruyor.
 *
 * Şeridin solundaki ok glifi bundan KÜÇÜK ve ayrı bir sabit (bkz.
 * CardCollapseGlassButton): kabuklar aynı çapta, glifler bilerek değil —
 * gerekçe orada.
 *
 * GEÇİŞ ARTIK ÖLÇEĞE DOKUNMUYOR: serbest glyph ile kabuk aynı boyda kalıp
 * birbirine çapraz SÖNÜYOR (bkz. SwipeCard > fireMorphStyle). Eskiden
 * burada bir ölçek uyarısı vardı ve okuduğu sabit (HEART_MORPH_SCALE) çoktan
 * silinmişti.
 *
 * Label kutusundan (FIRE_GLASS_LABEL_BOX = 17) BÜYÜK olabilir ve öyle:
 * kutu yalnızca kabuğun çapını ölçen bir ölçüm kutusu, kırpma sınırı DEĞİL
 * (RNHostView'ın altındaki View clipsToBounds yapmıyor). Glif kutunun içinde
 * ortalı çizildiği için taşma simetrik ve 40'lık kabuğun içinde kalıyor.
 * Yani: kabuğu büyütmeden glifi büyütmek = SADECE bu sabiti oynat.
 *
 * 30 → 18 → 15 → 20 → 26 → 29: kabuk 58'den 40'a inerken kutuya sığdırmak için
 * düşürüldü, sonra "işaret çok ufak kaldı" diye kutudan bağımsız olarak geri
 * büyütüldü. 29, 40'lık kabuğun içinde her yanda ~5.5pt cam kenar bırakıyor —
 * TAVANA YAKIN, daha fazlası glyph'i kabuğun kenarına dayar.
 *
 * KALPTEN ALEVE GEÇİŞ BU SAYIYI OYNATMADI ve oynatmamalı: iki glyph de aynı
 * 24'lük grid'e UZUN KENARI 20 olacak şekilde bakelendi (kalpte genişlik,
 * alevde yükseklik), yani aynı `size`ta kapladıkları optik boy eşit — yalnız
 * doldurdukları eksen değişti (bkz. FireGlyph).
 */
export const FIRE_GLASS_GLYPH_SIZE = 29;

/**
 * SwiftUI butonunun LABEL kutusu — kabuğun GÖRÜNEN çapını bu taşıyor.
 * `frame()` tek başına yetmiyor: cam stil label'ı kendi payıyla sarıp
 * ölçüsünü ondan alıyor, frame ise o kabuğu daha büyük bir kutunun içinde
 * ortalamaktan başka bir şey yapmıyor. Kabuğu büyütmek = bu kutuyu büyütmek.
 *
 * Bu yüzden glif ölçüsünden AYRI (ikisi tek sabitken kabuğu büyütmek glifi de
 * büyütüyordu — FIRE_GLASS_GLYPH_SIZE ve CardCollapseGlassButton >
 * ICON_SIZE artık sadece çizilen işareti ölçüyor).
 *
 * Kutu ARTIK SIZE'dan sabit bir pay düşerek hesaplanmıyor, ortak sabitten
 * geliyor: label'ın çevresine kabuğun kattığı pay controlSize'a bağlı, yani
 * "SIZE - 20" varsayımı yalnız varsayılan (regular) kontrol boyunda tutuyordu.
 * Kart butonları header'dakilerle aynı çapa ancak AYNI İKİLİYLE geliyor —
 * bu kutu + `controlSize("extraLarge")`. Biri değişip diğeri kalırsa kabuklar
 * yine ayrışır.
 */
export const FIRE_GLASS_LABEL_BOX =
  GLASS_ICON_BUTTON.label + CARD_GLASS_BUMP;

/**
 * Kapaktaki SERBEST alevin ölçüsü — cam kabuğun içindeki değil, kartın
 * fotoğrafında tek başına duranın (bkz. SwipeCard). Aynı şeklin iki duruşu
 * olduğu için ölçüleri de tek dosyada: geçişin (morph) matematiği ikisini
 * birden okuyor.
 */
export const FIRE_SIZE = 55;

/**
 * Glyph'in kapaktaki köşe boşluğu. Cam buton ondan BÜYÜK olduğu için aynı
 * boşluğu kullanamaz: kutuları değil MERKEZLERİ çakışmalı, yoksa geçiş
 * sırasında şekil köşeye doğru kayıyor. Fark yarı yarıya geri alınıyor.
 *
 * Kartın sticky başlığı da bu boşluğa hizalanıyor (bkz. CardStickyHeader):
 * şeritteki isim satırı ile buton aynı merkezde durur.
 */
export const FIRE_INSET = 28;
export const FIRE_GLASS_INSET =
  FIRE_INSET - (FIRE_GLASS_SIZE - FIRE_SIZE) / 2;

/**
 * Kabuğun rengi — Fire glyph'inin gradyanının İLK durağı (#fc1919).
 * Gradyanın adı (`swipeHeart`) kalp döneminden kalma; rengin kendisi değişmedi.
 * Cam tint'i, iOS 26 altı fallback dolgusu ve Android dairesi bunu paylaşıyor:
 * üçü ayrı ayrı yazılırsa biri güncellenip diğerleri kalır.
 *
 * RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi): `gradients` mod
 * değişince yerinde güncelleniyor, modül seviyesinde bir `const` ilk modun
 * değerini dondururdu.
 */
function fireTint() {
  return gradients.swipeHeart[0];
}

/**
 * Butonun içindeki alev — düz beyaz dolgu. `onMedia` (SABİT beyaz, açık modda
 * da dönmez): kırmızı kabuk her iki temada aynı ton, üstündeki glyph de öyle.
 */
function WhiteFlame({ size = FIRE_GLASS_GLYPH_SIZE }: { size?: number }) {
  return (
    // pointerEvents none: dokunmayı SwiftUI butonu karşılasın, RNHostView'ın
    // iliştirdiği touch handler araya girmesin.
    <View
      // Kutu kabuğun ölçüsünü taşıyor (bkz. FIRE_GLASS_LABEL_BOX), alev
      // onun içinde ortalı ve kendi ölçüsünde kalıyor.
      style={{
        width: FIRE_GLASS_LABEL_BOX,
        height: FIRE_GLASS_LABEL_BOX,
        alignItems: "center",
        justifyContent: "center",
      }}
      pointerEvents="none"
    >
      <FireGlyph size={size} color={theme.onMedia} />
    </View>
  );
}

type Props = {
  onPress: () => void;
  /** VoiceOver etiketi — buton metin taşımıyor, sadece glyph var. */
  label: string;
};

function FireGlassButton({ onPress, label }: Props) {
  if (Platform.OS === "ios") {
    return (
      // Host'a SABİT ölçü — `matchContents` DEĞİL: intrinsic ölçü native
      // taraftan bir kare sonra geliyor ve o ilk karede host 0×0 kalıyor
      // (bkz. RegisterBackButton'daki aynı not). Ölçü zaten frame() ile sabit.
      <Host
        // KABUĞUN DURUM ÇUBUĞUNA GİRMESİ ŞART: açık kart ekranın en tepesine
        // biniyor ve buton safe-area çizgisinin birkaç px üstünde duruyor
        // (bkz. SwipeCard > EXPANDED_CORNER_DROP). Bu prop olmadan SwiftUI
        // hosting view'ı kendi safe-area payını uyguluyor ve camı o payın
        // kadarı aşağı itiyor: kart açıkken buton çizginin altına yapışıyor,
        // parmakla azıcık aşağı çekilince (kart inip host safe-area'dan
        // çıkınca) pay sıfırlanıyor ve buton kartın içinde birkaç px YUKARI
        // sıçrıyordu. YALNIZ iOS 26'da görünüyordu: 26 altındaki fallback
        // kabuğu `frame`e bağlı bir background olarak çiziliyor, payı
        // yemiyor. `container`: çentik/durum çubuğu evet, klavye hayır.
        ignoreSafeArea="container"
        style={{
          width: FIRE_GLASS_SIZE,
          height: FIRE_GLASS_SIZE,
        }}
      >
        <SwiftUIButton
          onPress={onPress}
          modifiers={[
            buttonStyle("glassProminent"),
            buttonBorderShape("circle"),
            // Header'daki cam ikon butonlarıyla AYNI kontrol boyu: kabuğun label
            // çevresine kattığı pay buna bağlı, varsayılan (regular) bırakılınca
            // aynı frame'e rağmen daire belirgin şekilde küçük çiziliyor.
            controlSize("extraLarge"),
            tint(fireTint()),
            frame({
              width: FIRE_GLASS_SIZE,
              height: FIRE_GLASS_SIZE,
            }),
            a11yLabel(label),
            // iOS 26 altında glassProminent de sessizce .automatic'e düşüyor
            // (bkz. ViewModifierRegistry) → kabuğu biz çiziyoruz: aynı kırmızı,
            // camsız düz daire. strokeBorder frame'den SONRA gelmeli.
            ...glassFallback({
              shape: "circle",
              backgroundColor: fireTint(),
              borderColor: withAlpha(theme.onMedia, 0.35),
            }),
          ]}
        >
          <RNHostView matchContents>
            <WhiteFlame />
          </RNHostView>
        </SwiftUIButton>
      </Host>
    );
  }

  // Android: cam yok → iOS 26 altındaki fallback'in aynısı, düz kırmızı daire.
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: FIRE_GLASS_SIZE,
        height: FIRE_GLASS_SIZE,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: fireTint(),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withAlpha(theme.onMedia, 0.35),
      }}
    >
      <WhiteFlame />
    </TouchableOpacity>
  );
}

export default memo(FireGlassButton);
