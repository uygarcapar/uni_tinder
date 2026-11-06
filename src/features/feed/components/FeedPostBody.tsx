import { Fragment, memo, useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, ink } from "@/shared/theme/colors";
import { feedLinkDisplay, parseFeedLinks } from "../feedLinks";
import { confirmAndOpenFeedLink, copyFeedPostBody } from "../feedLinkPress";
import { TOPIC_FILL_ALPHA, TOPIC_TEXT, topicPillInk } from "./feedTopicPill";
import {
  BLOCK_GAP,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
} from "../feedPostMetrics";

/**
 * Gönderi gövdesi — metin + tıklanabilir adresler + satır içi konu etiketleri.
 *
 * ⚠️ SATIR SONLARI KORUNUYOR (sunucu en fazla 2 boş satıra normalize ediyor),
 * o yüzden metin olduğu gibi basılıyor.
 *
 * ⚠️ PARÇALAR İÇ İÇE `<Text>`: link segmentlerini ayrı `View`'lara bölmek
 * satır akışını bitirirdi — her parça kendi satırına düşer, yazı sarmaz.
 * Düz metin segmentleri ise `<Text>`e bile sarılmıyor, doğrudan dize olarak
 * basılıyor; linksiz gövde (çoğunluk) tek bir metin düğümü olarak kalıyor.
 *
 * ⚠️ ÖLÇÜLER `FeedPostCard`TAN GELİYOR, buraya kopyalanmıyor: iskelet de aynı
 * sayılardan çiziliyor (gerekçe FeedPostCard'ın başındaki notta). Bu dosya
 * onların ÜÇÜNCÜ okuyucusu, yeni bir kaynağı değil.
 */

type Props = {
  body: string;
  /**
   * Konu etiketleri, "#küçük harf" hâlinde HAZIR (kart `topicHashtag` ile
   * çözüyor; gövde i18n/konu kataloğunu bilmiyor).
   *
   * GÖVDENİN DEVAMINA basılıyorlar (istek: "hashtagler yazılan textin altında
   * değil devamında olsun direkt") AMA KAPSÜLDEN ÇIKMADAN (ikinci istek:
   * "pillden çıkarma ama hashtagi"): her etiket paragrafa gömülü satır içi
   * bir kapsül, son kelimenin peşinden akıyor ve yazıyla birlikte sarıyor.
   * Gövdenin altındaki eski ayrı satır FeedPostCard'dan kaldırıldı.
   */
  topicLabels?: readonly string[];
};

/**
 * KAPSÜLÜN YATAY PAYI — ayrı satırdaki hâlinden (istek, üç tur: 9 → 6 → 4)
 * aynen taşındı. Eski "negatif marginle gövdeye hizala" dansı ARTIK YOK:
 * kapsül paragrafın ortasında akıyor, hizalanacak bir sol kenarı yok.
 */
const TOPIC_PAD_H = 4;
const TOPIC_PAD_V = 1.5;

/**
 * KAPSÜL İÇİ YAZININ SATIRI — TOPIC_TEXT'in 20.5'i DEĞİL, bilerek.
 *
 * ⚠️🔴 KAPSÜL GÖVDENİN SATIR KUTUSUNA SIĞMAK ZORUNDA: RN iOS'ta `lineHeight`
 * `maximumLineHeight` olarak iner, yani satır içi bir kutu satırdan büyükse
 * TextKit satırı BÜYÜTMÜYOR — kutu komşu satıra taşıyor/kırpılıyor ("textle
 * bozuluyo" diye görünen şeyin yarısı buydu). 20.5 + 2×1.5 = 23.5 > 22.5
 * (BODY_LINE_HEIGHT) taşıyordu; 18 + 3 = 21 sığıyor. 18, 15pt SF için
 * ascent+descent'i (~18) hâlâ karşılıyor — glifler kırpılmıyor.
 */
const TOPIC_PILL_LINE = 18;

/**
 * TABAN ÇİZGİSİNDEN OPTİK ORTAYA İNİŞ (istek: "ortadan hizala ama textle
 * bozuluyo üsttü").
 *
 * ⚠️ iOS satır içi View'ın TABANINI metnin taban çizgisine oturtuyor
 * (NSTextAttachment sözleşmesi) — kapsül bu yüzden satırın üstüne biniyordu.
 *
 * Hedef: kapsülün ortası ≈ gövde yazısının optik ortası (taban çizgisinin
 * ~6pt üstü: 16.5pt SF'te cap yüksekliği ~11.8, yarısı ~5.9). Kapsül 21pt
 * (18 + 2×1.5): tabanda dururken ortası taban − 10.5'te → 10.5 − 6 ≈ 4.5pt
 * AŞAĞI inmeli.
 *
 * ⚠️ `transform` LAYOUT'A DOKUNMUYOR, yalnız boyama kayıyor: kapsülün
 * satır içindeki yeri/akışı değişmiyor, metin yeniden dizilmiyor. İniş payı
 * descent'in (~4pt) biraz üstünde — kapsülün alt 0.5pt'i descender bölgesine
 * sarkıyor, satır arasına değil.
 *
 * ⚠️ GÖZLE AYAR SAYISI: formül başlangıç noktası, cihazda "bi tık" oynarsa
 * oynatılacak tek yer burası.
 */
const TOPIC_PILL_NUDGE = 4.5;

function FeedPostBodyBase({ body, topicLabels }: Props) {
  const { t } = useTranslation();

  // Liste `FlatList` + inline `renderItem` ile çiziliyor; gövde değişmedikçe
  // her karede yeniden parse etmek fuzuli.
  const segments = useMemo(() => parseFeedLinks(body), [body]);

  const handleLongPress = useCallback(() => {
    copyFeedPostBody(body, t);
  }, [body, t]);

  return (
    /**
     * ⚠️ TAŞMA KAPISI BURADA. RN kırılmasız uzun bir token'ı (400 karakterlik
     * tek kelime) satır sonunda KIRMIYOR; kart kabuğunda da `overflow: hidden`
     * bilerek yok (gölge oradan çiziliyor, gerekçe feedRowShell'de). Kapıyı
     * gövdenin kendi sarmalına koymak ikisini birbirine dokundurmuyor:
     * burada gölge ya da cam yok, kırpılacak bir şey de yok.
     */
    <View style={{ marginTop: BLOCK_GAP, overflow: "hidden" }}>
      <Text
        style={{
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
          color: colors.text,
        }}
        onLongPress={handleLongPress}
      >
        {segments.map((segment, index) =>
          segment.type === "text" ? (
            segment.text
          ) : (
            <Text
              // Segmentlerin kendi kimliği yok (aynı link iki kez geçebilir);
              // sıra indeksi burada kararlı, çünkü liste `body`yle birlikte
              // bütün olarak yeniden üretiliyor.
              key={index}
              style={{
                // Tema tokenı: `info` iki palette de var (koyu/açık).
                color: colors.info,
                textDecorationLine: "underline",
              }}
              onPress={() =>
                confirmAndOpenFeedLink(segment.url, segment.host, t)
              }
            >
              {/**
               * ⚠️ GÖSTERİLEN METİN ≠ AÇILAN HEDEF. Burada kısaltılmış adres
               * yazıyor, `onPress` ise tam `segment.url`i açıyor. İkisi
               * karışırsa kullanıcı dokunduğu yerden başka bir yere gider.
               */}
              {feedLinkDisplay(segment.url)}
            </Text>
          ),
        )}
        {topicLabels?.map((label, index) => (
          /**
           * Etiketler paragrafın KUYRUĞUNDA, her biri tek boşlukla ayrılıyor
           * (boşluk kapsülün dışında düz dize — `getByText('#…')` tam eşleşsin
           * ve etiket sarunca boşluk önceki satırın sonunda kalsın).
           *
           * ⚠️ İNDEKS ANAHTAR, segmentlerle aynı gerekçe: liste `post`la
           * birlikte bütün olarak yeniden üretiliyor ve aynı etiket (teoride)
           * iki kez gelebilir.
           */
          <Fragment key={index}>
            {" "}
            {/**
              * ── KAPSÜL = SATIR İÇİ <View> (istek: "pillden çıkarma ama
              * hashtagi") ─────────────────────────────────────────────────
              *
              * iOS iç içe <Text>'te pay ve köşe yarıçapı ÇİZMİYOR: dolgu tek
              * başına keskin köşeli bir "fosforlu kalem" lekesi olurdu. Metne
              * gömülü bir View ise paragrafın akışında TEK PARÇA duruyor
              * (kapsül satır sonunda bölünmüyor) ve dolgusu/yarıçapı gerçek.
              *
              * Dolgu/alfa/deri eski ayrı satırdaki kapsülün AYNISI — uzun
              * gerekçeler feedTopicPill'de ve git tarihinde (FeedPostCard'ın
              * silinen bloğu). Burada yalnız satır içine taşınma notları:
              *
              * ⚠️ `ink()` RENDER SIRASINDA: palet mutable (colors.ts).
              */}
            <View
              style={{
                backgroundColor: ink(TOPIC_FILL_ALPHA),
                // 12, 21pt'lik kutuda yarı yüksekliğin (10.5) üstünde →
                // native tarafta kapsüle kıstırılıyor; görünüş tam kapsül.
                borderRadius: 12,
                borderCurve: "continuous",
                paddingHorizontal: TOPIC_PAD_H,
                paddingVertical: TOPIC_PAD_V,
                // Taban çizgisi tünemesinden optik ortaya (gerekçe yukarıda,
                // TOPIC_PILL_NUDGE).
                transform: [{ translateY: TOPIC_PILL_NUDGE }],
              }}
            >
              <Text
                style={{
                  /**
                   * Deri ORTAK kapsül derisinden (feedTopicPill): punto 15 +
                   * ağırlık 500 + tarihin grisi. Gövde 16.5 — etiket bilerek
                   * ondan küçük ve gri, "yazının parçası değil künyesi"
                   * okunuşu satır içinde de korunuyor.
                   *
                   * ⚠️ `lineHeight` DERİDEN DEĞİL: satır içi kapsül gövdenin
                   * satır kutusuna sığmak zorunda (TOPIC_PILL_LINE'ın
                   * gerekçesi) — TOPIC_TEXT'in 20.5'i burada fazla geliyor.
                   */
                  color: topicPillInk(),
                  ...TOPIC_TEXT,
                  lineHeight: TOPIC_PILL_LINE,
                }}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        ))}
      </Text>
    </View>
  );
}

export default memo(FeedPostBodyBase);
