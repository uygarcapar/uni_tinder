import { memo, useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/shared/theme/colors";
import { feedLinkDisplay, parseFeedLinks } from "../feedLinks";
import { confirmAndOpenFeedLink, copyFeedPostBody } from "../feedLinkPress";
import {
  BLOCK_GAP,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
} from "../feedPostMetrics";

/**
 * Gönderi gövdesi — metin + tıklanabilir adresler.
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
};

function FeedPostBodyBase({ body }: Props) {
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
      </Text>
    </View>
  );
}

export default memo(FeedPostBodyBase);
