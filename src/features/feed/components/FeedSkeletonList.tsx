import { memo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import HeartGlyph from "@/shared/components/HeartGlyph";
import { colors } from "@/shared/theme/colors";
import { feedRowShell } from "../feedRowShell";
import { AVATAR, BLOCK_GAP, BODY_LINE_HEIGHT } from "../feedPostMetrics";
import { LIKE_COUNT_MARGIN, LIKE_HEART_BOX } from "./FeedPostCard";

/**
 * Akış yükleme iskeleti.
 *
 * Üç yollu boş-durum makinesinin ilk hali (iskelet → gecikme penceresinde
 * `null` → EmptyState). Hepsi AYNI FlatList'in `ListEmptyComponent`'inde
 * duruyor ki ağaç şekil değiştirmesin — LikesScreen'de ayrı container'a
 * alınmış bir iskelet sekmelerin yeniden mount olmasına yol açmıştı.
 *
 * ⚠️ İSKELET GERÇEK SATIRIN ÖLÇÜSÜNÜ TAKLİT ETMEK ZORUNDA, ama ölçüler BURADA
 * TANIMLI DEĞİL: kabuk `feedRowShell`den, dikey hiza/kalp/kapsül ise
 * FeedPostCard'ın `export`larından geliyor. Sayıları buraya kopyalamak iki kez
 * geri tepti (üniversite satırı karttan kalkmıştı ama iskelet adın altına
 * ikinci çubuğu çizmeye devam ediyordu; gövde 16.5'e çıkınca satır boyu eski
 * kalmıştı) — yükleme bitince liste zıplıyordu. Buradaki tek serbest değer
 * çubukların GENİŞLİĞİ: karttaki karşılığı metnin kendisi, yani sabit bir
 * ölçüsü yok.
 *
 * ⚠️ Çubukların rengi (`colors.shimmer`) ALFA-TABANLI, bu yüzden baloncuğun
 * `surface` zemini üstünde kendiliğinden doğru tona oturuyor. Opak bir gri
 * yazılırsa kutunun içinde ya kaybolur ya da leke gibi okunur.
 */

/**
 * Başlık satırındaki ad VE tarih ikisi de 15 punto, o yüzden iki çubuk da tek
 * yükseklikte. Beğeni sayısı da 15/600 ama kendi sabitini kullanıyor — başlıkla
 * birlikte değişmemesi için ayrı.
 */
const HEAD_BAR_H = 12;
const COUNT_BAR_H = 12;

/**
 * Gövde çubuğu + altındaki boşluk TOPLAMI kartın satır boyuna eşit
 * (`BODY_LINE_HEIGHT`), yani üç satırlık iskelet üç satırlık yazıyla birebir
 * aynı yeri kaplıyor.
 */
const BODY_BAR_H = 13;
const BODY_BAR_GAP = BODY_LINE_HEIGHT - BODY_BAR_H;

/**
 * Üç noktanın yer tutucusu — glif 18pt geniş, ink'i yatay bir şerit kadar.
 * Üç ayrı daire çizmek iskeleti "yüklenen" değil "çizilmiş" gösteriyordu.
 */
const MENU_BAR_W = 18;
const MENU_BAR_H = 4;

/**
 * Ad çubuğunun genişliği SATIRA GÖRE DEĞİŞİYOR: gerçek liste "irem, 21" ile
 * "Anonim Kadın"ı yan yana taşıyor, hepsi tek boyda olunca iskelet form gibi
 * okunuyordu. Tarih çubuğu sabit — "salı"/"dün" arasındaki fark gözle
 * ayırt edilmiyor.
 */
const NAME_BAR_W = [96, 72, 112];
const DATE_BAR_W = 38;
/** Beğeni sayısı tek/çift haneli — kartta da 15/600 iki karakterlik bir kutu. */
const COUNT_BAR_W = 18;
/**
 * Gönderilerim'deki yanıt sayısı ("3 yanıt") — kapsül DEĞİL düz metin, o yüzden
 * yer tutucusu da çubuk. 13.5 punto → çubuk 11.
 */
const REPLY_COUNT_BAR_W = 56;
const REPLY_COUNT_BAR_H = 11;

function Bar({
  width,
  height,
  marginLeft,
  marginTop,
  marginBottom,
}: {
  width: number | `${number}%`;
  height: number;
  marginLeft?: number;
  marginTop?: number;
  marginBottom?: number;
}) {
  return (
    <View
      style={{
        width,
        height,
        // Yarıçap yüksekliğin yarısı: çubuk her ölçüde kapsül kalıyor.
        borderRadius: height / 2,
        backgroundColor: colors.shimmer,
        marginLeft,
        marginTop,
        marginBottom,
      }}
    />
  );
}


function Row({
  lines,
  nameWidth,
  variant,
}: {
  lines: number;
  nameWidth: number;
  variant: FeedSkeletonVariant;
}) {
  // Kabuk gönderi satırıyla TEK nesneden (bkz. feedRowShell): iskeletin
  // baloncuğu, köşesi, payları ve satır arası boşluğu gerçek satırla aynı.
  return (
    <View style={feedRowShell()}>
      {/* ── Başlık: avatar · ad · tarih ··· üç nokta ──
          ⚠️ Adın ALTINDA İKİNCİ ÇUBUK YOK: üniversite satırı karttan kaldırıldı
          (bkz. FeedPostCard), iskelet onu çizmeye devam ederse yükleme sonrası
          başlık bloğu bir satır kısalıp liste zıplıyor. */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: AVATAR,
            height: AVATAR,
            borderRadius: AVATAR / 2,
            backgroundColor: colors.shimmer,
          }}
        />
        {/* 10 = kartta adın avatara olan marjı. */}
        <Bar width={nameWidth} height={HEAD_BAR_H} marginLeft={10} />
        {/* 8 = kartta tarihin ada olan marjı. */}
        <Bar width={DATE_BAR_W} height={HEAD_BAR_H} marginLeft={8} />
        <View style={{ flex: 1 }} />
        <Bar width={MENU_BAR_W} height={MENU_BAR_H} marginLeft={8} />
      </View>

      {/* ── Gövde ── İlk satırın üst payı kartın blok payı. */}
      {Array.from({ length: lines }).map((_, i) => (
        <Bar
          key={i}
          height={BODY_BAR_H}
          marginTop={i === 0 ? BLOCK_GAP : BODY_BAR_GAP}
          // ⚠️ SON ÇUBUĞUN ALT PAYI: gerçek metin bloğunun yüksekliği
          // `satır × BODY_LINE_HEIGHT` ve son satırın da altında kendi satır
          // boşluğu var. Bu pay olmadan iskelet her gönderide ~9pt kısa kalıyor.
          marginBottom={i === lines - 1 ? BODY_BAR_GAP : undefined}
          // Son satır kısa — gerçek metin gibi okunsun.
          width={i === lines - 1 ? "55%" : "100%"}
        />
      ))}

      {/* ── Alt satır: kalp + sayı ··· yanıt kapsülü ──
          Satırın yüksekliği KARTTA DA olduğu gibi kapsülden türüyor; sabit bir
          `height` verilmiyor ki kapsülün ölçüsü değişince ikisi ayrışmasın. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: BLOCK_GAP,
        }}
      >
        {/* Kalp YUVARLAK KUTU DEĞİL, kartın GERÇEK glyph'i düz shimmer dolguyla:
            yeni tasarımın alt satırındaki en tanınır şekil o ve kare bir blok
            yükleme bitince başka bir ikona dönüşüyormuş gibi okunuyordu.
            Glyph'in iki yanındaki şeffaf optik pay da kartla aynı, yani
            shimmer kalp gerçek kalbin tam üstüne oturuyor. */}
        <HeartGlyph size={LIKE_HEART_BOX} color={colors.shimmer} />
        <Bar width={COUNT_BAR_W} height={COUNT_BAR_H} marginLeft={LIKE_COUNT_MARGIN} />
        <View style={{ flex: 1 }} />
        {/* YANIT KAPSÜLÜ YER TUTUCUSU KALDIRILDI: buton üründen çıktı (bkz.
            FeedPostCard). Gönderilerim'de yanıt SAYISI duruyor, akış
            sekmesinde sağ uç artık boş — iki sayfanın satır yüksekliği de bu
            yüzden artık aynı. */}
        {variant === "mine" ? (
          <Bar width={REPLY_COUNT_BAR_W} height={REPLY_COUNT_BAR_H} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Hangi gönderi sayfasının iskeleti — FeedPostCard'ın `variant`ıyla AYNI
 * sözlük. Alt satırın sağ ucu ikisinde farklı (kapsül ↔ yanıt sayısı).
 */
export type FeedSkeletonVariant = "feed" | "mine";

/**
 * İSKELET SATIR SAYILARI — yükleme bitince listenin ne kadar zıpladığını
 * belirleyen tek şey.
 *
 * ⚠️ ESKİ DEĞER 3 ve 2'YDİ ve bu ÇOK AZDI. Gövde tavanı 400 kodnokta
 * (`feedText.FEED_POST_MAX_LENGTH`) ve kartın gövde genişliği ekran − 52pt
 * (`feedRowShell`: 2×ROW_BLEED + 2×ROW_PAD_H), yani 16.5pt fontta satır başına
 * ≈38-42 karakter: dolu bir gönderi 10-11 satır. İskelet 2-3 satır varsayınca
 * gerçek kartlar gelince liste AŞAĞI doğru sıçrıyordu.
 *
 * ⚠️ TAVANI TAKLİT ETMEK DE YANLIŞ olurdu: 10 satırlık bir iskelet, kısa
 * gönderilerin çoğunlukta olduğu bir akışta listeyi YUKARI sıçratır — ve boş
 * ekranın kendisi "burada çok şey var" diye yanlış bir söz verir.
 *
 * Seçilen aralık orta yol: kırpma YAPMADIĞIMIZ için zıplama sıfırlanamaz
 * (gerekçe: uzunluk kararı, "tamamı görünsün"), amaç ORTALAMA sapmayı
 * küçültmek. Dizinin kendisi değişken kalıyor — eşit satırlar iskeleti
 * "yükleniyor" yerine "bozuk" gösteriyor.
 */
const BODY_LINES = [4, 6, 3] as const;

function FeedSkeletonListBase({
  count = 3,
  variant = "feed",
}: {
  count?: number;
  variant?: FeedSkeletonVariant;
}) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        // Satır uzunlukları sabit ama DEĞİŞKEN: hepsi aynı olsaydı liste
        // "yükleniyor" yerine "bozuk" okunurdu.
        <Row
          key={i}
          lines={BODY_LINES[i % BODY_LINES.length]}
          nameWidth={NAME_BAR_W[i % NAME_BAR_W.length]}
          variant={variant}
        />
      ))}
    </View>
  );
}

export default memo(FeedSkeletonListBase);
