import type { ImageSourcePropType } from "react-native";

/**
 * KAMPÜS ŞERİDİNDEKİ BİLGİ KUTULARININ ZEMİN FOTOĞRAFLARI.
 *
 * Kutular gerçek anlarla YAN YANA duruyor ve o kartların tamamı fotoğraf;
 * düz gradyanlı kutular desteyi iki ayrı malzemeye bölüyordu. Bu dosya o
 * boşluğu kapatan katmanı taşıyor — `plusCardArt`/`modeCardArt` ile aynı
 * sözleşme:
 *
 * ⚠️ HARİTA KISMİ OLABİLİR. Var olmayan bir yolu `require` etmek Metro'yu
 * bundle anında düşürür. Fotoğrafı olmayan anahtar modun gradyanıyla
 * çiziliyor (gradyan foto VARKEN DE altta duruyor — yüklenme anındaki
 * boşluğu o kapatıyor), yani eksik satır bir hata değil, bir ara durum.
 *
 * ── Neden İNDEKS değil ANAHTAR ────────────────────────────────────────────
 * Kare kutunun METNİNE eşlik ediyor — `lettered` karelerde kelime fiilen
 * karenin İÇİNDE yazılı. Fotoğraf indeksle dönseydi "24 SAAT" duvarı bir
 * açılışta "Konum gizli" kutusuna düşerdi; bilgi havuzunun sırası zaten
 * karıştırılıyor (bkz. CampusMomentsStrip > shuffledKeys).
 *
 * ⚠️ Aynı kareyi iki anahtara BAĞLAMA: şeritte aynı anda en fazla üç bilgi
 * kutusu var (MIN_STRIP_BOXES) ve üçü de farklı anahtar, yani paylaşılan bir
 * kare yan yana iki kez görünebilir.
 */
/**
 * ⚠️ KELİME KARENİN İÇİNDE YAZILI — her kare için, istisnasız.
 *
 * Kutu bu yüzden KENDİ metnini çizmiyor: duvardaki "24 SAAT"in üstüne bir de
 * 29pt'lik "24 saat" binerdi. i18n dizesi o kutuda yalnız erişilebilirlik
 * etiketi olarak yaşıyor, yani dize ile karedeki yazı AYNI olmak zorunda —
 * biri değiştirilirse diğeri de değişmeli.
 *
 * ⚠️ YAZISIZ KARE EKLEME. Bir dönem iki tanesi yazısızdı ve kutu onlar için
 * dipte bir okuma bandı + kendi metnini çiziyordu; şeritte yan yana iki ayrı
 * tasarım oluyordu ve yazısız olanlar havuzdan çıkarıldı (istek: "sadece
 * fotolu olanlar olsun"). Yeni bir kural eklenecekse kelimesi de karenin
 * içine basılmalı.
 *
 * Yeni bir kare eklerken:
 *   1. Dosyayı `assets/campus/<anahtar>.jpg` olarak koy — KARE, 900×900,
 *      JPEG q60. Kutu kare ve en fazla 300pt (bkz. CARD_HEIGHT_MAX), yani
 *      @3x'te tam 900px. Kalite q55 değil q60: bulanıklık yok ve harf
 *      kenarları JPEG artefaktını görünür yapıyor.
 *   2. Satırını aşağıya, locales'e de aynı kelimeyi ekle.
 *   3. `CampusMomentsStrip > INFO_KEYS`e anahtarı yaz — havuz oradan okunuyor,
 *      buradan DEĞİL (sıra ürün kararı, bu dosya yalnız eşleme).
 *
 * ⚠️ Kareler neyi anlattıklarına göre eşleşiyor: alacakaranlıkta duvara
 * yazılmış 24 SAAT (geçicilik), kampüs kemerinin yanındaki YALNIZ KAMPUSTE
 * (sınır), avluda GÜNDE BİR (günün tek anı). Bir dosyayı değiştirirken
 * kelimesini de oku.
 */
export const CAMPUS_INFO_ART: Record<string, ImageSourcePropType | undefined> =
  {
    "campus.info.expiry": require("../../../assets/campus/expiry.jpg"),
    "campus.info.insideOnly": require("../../../assets/campus/inside-only.jpg"),
    "campus.info.daily": require("../../../assets/campus/daily.jpg"),
  };

/** Anahtara düşen kare — yoksa `undefined` (kutu düz zeminde kalır). */
export function campusInfoArtFor(
  infoKey: string,
): ImageSourcePropType | undefined {
  return CAMPUS_INFO_ART[infoKey];
}
