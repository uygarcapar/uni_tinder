import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, User } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import HeartGlyph from "@/shared/components/HeartGlyph";
import { colors } from "@/shared/theme/colors";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import toDisplayLowercase from "@/shared/utils/textCase";
import { anonymousLabelKey } from "../feedPolicy";
// Kart `/api/feed/me`yi GÖRMÜYOR (prop olarak inmesi listedeki her satıra bir
// nesne daha taşımak olurdu), o yüzden etiket i18n yedeğinden çözülüyor —
// `topicHashtag(key, null)` tam bunun için null kabul ediyor. Sunucunun kendi
// etiketi composer ve filtrede kullanılıyor; oralarda `me` zaten elde.
import { topicHashtag } from "../feedTopics";
import { feedRowShell } from "../feedRowShell";
import type { FeedPostDto, FeedTopic } from "../feedTypes";

/**
 * Akış gönderi kartı — sadece YAZI (fotoğraf yok, gönderi altında yorum yok).
 *
 * YANIT BUTONU YOK (iki modlu yapı): eşleşme kanalı yazarın profil kartı.
 * Eski kuralın izi — buton durumu TAMAMEN `feedPolicy.replyActionFor`dan geliyordu; burada
 * hiçbir kural yeniden hesaplanmıyor. En kritik sonucu: ANONİM gönderide
 * eşleştiğin kişi bile olsa sunucu `Ok` döndüğü için "Yanıtla" çiziliyor —
 * "Sohbete git" göstermek anonim yazarın kimliğini ifşa ederdi.
 */

export interface FeedPostCardProps {
  post: FeedPostDto;
  /** Gönderilerim sayfasında durum rozeti + yanıt sayısı gösterilir. */
  variant?: "feed" | "mine";
  /**
   * Kendi ana fotoğrafım — sunucu KENDİ gönderimin `author.mainPhotoUrl`unu
   * null bırakırsa kullanılacak yedek (bkz. feedQueries > useOwnFeedAvatar).
   * Ekran düzeyinde bir kez çözülüyor, satır başına değil.
   */
  ownPhotoUrl?: string | null;
  onToggleLike?: (post: FeedPostDto) => void;
  onReply?: (post: FeedPostDto) => void;
  onOpenChat?: (conversationId: string | null) => void;
  onReplyPaywall?: (post: FeedPostDto) => void;
  /** Normal gönderide yazara dokunma → aksiyonsuz profil önizlemesi. */
  onPressAuthor?: (post: FeedPostDto) => void;
  onMenu?: (post: FeedPostDto) => void;
  /** Gönderilerim'de yanıt sayısına dokunma → Yanıtlar sayfası. */
  onPressReplyCount?: (post: FeedPostDto) => void;
  /** Durum rozeti metni (Gönderilerim) — sayfanın `postPresentation`ı çözüyor. */
  statusLabel?: string | null;
  statusTone?: "neutral" | "warning" | "danger";
  /**
   * BEĞENİLMİŞ kalbin dolgusu — seçili modun vurgusu (`modeAccent`).
   *
   * Gönderi beğenisi kişi beğenisi DEĞİL (içeriğe tepki, eşleşme üretmiyor) ama
   * ekranda duran yüzey yine moda ait: Arkadaş modunda yeşil bir akışta kırmızı
   * kalp, ekranın tek dating işareti olarak kalıyordu. Verilmezse (iskelet /
   * modu bilmeyen çağıran) bugünkü kırmızı.
   */
  likedAccent?: string;
}

/**
 * ⚠️ AŞAĞIDAKİ ÖLÇÜLERİN BİR KISMI DIŞA AÇIK ÇÜNKÜ İSKELET DE ONLARI OKUYOR
 * (bkz. FeedSkeletonList). Bir dönem iki dosyada elle kopyalıydılar ve kart
 * değiştikçe iskelet geride kaldı: üniversite satırı kalkmıştı ama iskelet
 * adın altına ikinci çubuğu çizmeye devam ediyordu, gövde 15.5 → 16.5'e
 * çıkınca da satır boyu eski kalmıştı — yükleme bitince liste zıplıyordu.
 * Yeni bir ölçü iskeletin de bilmesi gerekiyorsa buraya `export` olarak
 * yazılmalı, oraya elle kopyalanmamalı.
 */
export const AVATAR = 34;

/**
 * Kartın üç bloğu (başlık · gövde · aksiyon satırı) arasındaki TEK pay.
 * İkisi de 12'ydi ve ayrı ayrı yazılıydı; tek sayı olması iskeletin dikey
 * hizasını kartla kilitliyor.
 */
export const BLOCK_GAP = 12;

/**
 * Gövde metninin ölçüsü.
 *
 * 15.5 → 16.5 (istek: "bi tık artır"). Gövde artık başlık satırından (15)
 * BÜYÜK ve bu bilinçli: kartın asıl içeriği yazının kendisi, isim/tarih onun
 * künyesi. `lineHeight` birlikte büyüdü — oran 1.36'da sabit tutuldu, yoksa
 * çok satırlı gövde sıkışık okunuyor.
 */
export const BODY_FONT_SIZE = 16.5;
export const BODY_LINE_HEIGHT = 22.5;

/**
 * Beğeni kalbinin ölçüleri.
 *
 * ⚠️ `size` KALBİN KENDİSİ DEĞİL, glyph'in KARE KUTUSU: kalp 24'lük grid'de 20
 * birim geniş, iki yanında 2 birim şeffaf optik pay var (bkz. icons/HeartGlyph).
 * Yani "24pt kalp" için kutu 24 değil, 24 × 24/20 olmalı — `size={24}` verince
 * çizilen kalp 20pt'de kalıyor (eski 18'lik SF kalbinden yalnız 2pt büyük).
 */
const HEART_GRID = 24;
const HEART_GLYPH_SPAN = 20;
/**
 * Çizilen kalbin genişliği. 24 (Instagram'ın akış kalbinin ölçüsü) kartın
 * dolgusu kalkıp satır çizgiye indikten sonra fazla ağır kaldı; 19 dolgusuz
 * satırda isim (15) ve sayı (15) ile dengede duruyor.
 */
const LIKE_HEART_WIDTH = 19;
export const LIKE_HEART_BOX = LIKE_HEART_WIDTH * (HEART_GRID / HEART_GLYPH_SPAN);

/**
 * Sayının kalbe GÖRÜNEN uzaklığı — glyph kutusunun sağındaki şeffaf pay da o
 * aralığın parçası olduğu için marjdan düşülüyor. Düz `marginLeft: 5` yazılsa
 * gerçek aralık 5 + 2.4 = 7.4 olurdu, yani eski (6 + optik pay) hâlinden
 * neredeyse hiç farkı kalmazdı.
 */
const LIKE_COUNT_GAP = 5;
export const LIKE_COUNT_MARGIN =
  LIKE_COUNT_GAP - LIKE_HEART_BOX * ((HEART_GRID - HEART_GLYPH_SPAN) / 2 / HEART_GRID);

/**
 * Yanıt kapsülünün ölçüleri — AKSİYON SATIRININ YÜKSEKLİĞİNİ VEREN ŞEY.
 * Kalbin kutusu (≈22.8) ve sayı (15 punto) kapsülün içinde kalıyor.
 *
 * İskelet bu üçünü de okuyup kapsülü GÖRÜNMEZ ETİKETLE çiziyor, yani yer
 * tutucunun genişliği her dilde gerçek butonun genişliği oluyor; sabit bir
 * sayı "Eşleşmek için yanıtla" ile "Reply to match" arasında kayıyordu.
 */
// REPLY_PILL_* sabitleri KALDIRILDI: tek tüketicisi FeedSkeletonList'in
// yanıt pill'i yer tutucusuydu (etiketi gerçek metinle ölçüyordu), o da
// butonla birlikte düştü.

function FeedPostCardBase({
  post,
  variant = "feed",
  ownPhotoUrl = null,
  onToggleLike,
  onReply,
  onOpenChat,
  onReplyPaywall,
  onPressAuthor,
  onMenu,
  onPressReplyCount,
  statusLabel,
  statusTone = "neutral",
  likedAccent = colors.errorStrong,
}: FeedPostCardProps) {
  const { t } = useTranslation();

  const handleLike = useCallback(() => onToggleLike?.(post), [onToggleLike, post]);
  const handleMenu = useCallback(() => onMenu?.(post), [onMenu, post]);
  const handleAuthor = useCallback(() => {
    // Anonim gönderide açılacak profil YOK — sunucu da `author: null` yolluyor.
    if (post.isAnonymous) return;
    onPressAuthor?.(post);
  }, [onPressAuthor, post]);


  const anonLabel = t(anonymousLabelKey(post.authorCategory));

  /**
   * Çizilecek avatar — sunucunun değeri, yoksa KENDİ fotoğrafım.
   *
   * ⚠️ Sıra bozulmamalı: sunucunun `mainPhotoUrl`u HER ZAMAN önce. Yedek
   * yalnız o boşken devreye giriyor, yani sunucu alanı doldurmaya başlarsa bu
   * satır kendiliğinden eski davranışa döner.
   *
   * ⚠️ `!post.isAnonymous` KAPISI KALDIRILAMAZ. Anonim gönderide sunucu
   * `author`ı null yolluyor ve kart yer tutucu çiziyor; buraya kendi fotoğrafımı
   * koymak anonimliği KENDİ ekranımda bozar — listeyi ekran görüntüsüyle
   * paylaşan biri için gerçek bir sızıntı. `isMine` de şart: başkasının
   * fotoğrafını tahmin etmiyoruz, yalnız kendimizinkini biliyoruz.
   */
  const authorPhotoUrl = post.isAnonymous
    ? null
    : (post.author?.mainPhotoUrl ?? (post.isMine ? ownPhotoUrl : null));

  // Nötr ton `textMuted`: rozet başlık satırında, tarihin ve üç noktanın
  // yanında — üçü aynı griden olmalı, yoksa aynı satırda iki farklı gri
  // okunuyor. Bir ara bu üçlü `ink(0.55)` ile yazılıydı çünkü `textSecondary`
  // başka bir griydi; iki token paletten birleşti (bkz. colors.ts).
  // "warning" dalı duruyor ama şu an ÜRETİCİSİ YOK (bkz. statusToneFor:
  // inceleme nötre çevrildi). Kart genel amaçlı bir sunum bileşeni, tonlar da
  // onun sözlüğü — ileride turuncu gereken bir durum çıkarsa hazır.
  const statusColor =
    statusTone === "danger"
      ? colors.errorStrong
      : statusTone === "warning"
        ? colors.warning
        : colors.textMuted;

  /**
   * Çizilecek konular — `topics` varsa O, yoksa tek `topic`.
   *
   * ⚠️ İKİ ALAN BİRDEN OKUNUYOR ve sıra önemli: composer çoklu seçimi
   * gönderiyor ama BUGÜNKÜ sunucu yanıtta yalnız `topic` dolduruyor
   * (feedTypes > FeedPostDto.topics). `topics` açıldığında kart kendiliğinden
   * hepsini çiziyor, istemci sürümü beklenmiyor.
   *
   * Boş/undefined alanlar süzülüyor: ikisi de yoksa blok hiç çizilmiyor
   * (varsayılan "Genel" UYDURULMUYOR).
   */
  const topics = useMemo(() => {
    const list = post.topics?.length ? post.topics : [post.topic];
    return list.filter((key): key is FeedTopic => typeof key === "string" && !!key);
  }, [post.topics, post.topic]);

  return (
    <View style={feedRowShell()}>
      {/* BALONCUĞUN ZEMİNİ DÜZ DOLGU (feedRowShell > colors.surface). Bir tur
          yazarın fotoğrafının bulanık hâli denendi (ayrı bir FeedCardBackdrop
          bileşeni, CardGlassBackdrop'ın matematiğini ithal ediyordu) ve GERİ
          ALINDI (istek). Tekrar denenecekse iki şey kayıt için:
            • Zemin `authorPhotoUrl` ile AYNI değerden beslenmeli, ayrı bir
              anonimlik kapısı yazılmamalı — iki kapı zamanla ayrışır ve o
              katman, blur'lu olsa bile anonim yazarın fotoğrafını ekrana koyar.
            • Kabuğa `overflow: hidden` gerekiyordu (mutlak zemin yuvarlak
              köşelerin dışına taşıyor) ve çerçeve o yüzden kalkmıştı. */}

      {/* ── Başlık: yazar ya da anonim etiketi ── */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={handleAuthor}
          disabled={post.isAnonymous || !onPressAuthor}
          // `flex: 1` DEĞİL `flexShrink: 1`: flex:1 bloğu satırın kalan tüm
          // genişliğine yayıyordu ve tarih onun ÖBÜR UCUNA, ekranın sağ
          // kenarına düşüyordu. Shrink ile blok içeriği kadar — tarih ismin
          // hemen sağında. Uzun isimde kırpılacak olan yine bu blok.
          style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}
          hitSlop={6}
        >
          {!authorPhotoUrl ? (
            <View
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: AVATAR / 2,
                backgroundColor: colors.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SFIcon
                name="person.fill"
                fallback={User}
                size={16}
                color={colors.textMuted}
                strokeWidth={1.8}
              />
            </View>
          ) : (
            // ⚠️ `expo-image`, react-native'in `Image`ı DEĞİL: disk+bellek
            // önbelleği (`memory-disk`) sayesinde aynı yazarın avatarı sekme
            // dönüşlerinde ve liste geri sarmalarında yeniden indirilmiyor.
            // `recyclingKey` FlatList satır geri dönüşümü için şart — o
            // olmadan geri dönüşen hücrede bir an ÖNCEKİ yazarın fotoğrafı
            // kalıyor. `borderCurve` YOK: expo-image'ın ImageStyle'ı kabul
            // etmiyor (bkz. LikesScreen'deki aynı not).
            <Image
              // Kartta çizilen TEK fotoğraf bu, ama testID yine de duruyor:
              // kimlik sızdırmama testleri "fotoğraf çizildi mi" sorusunu tipe
              // göre değil katmana göre soruyor ve bu kart bir dönem iki ayrı
              // `Image` taşımıştı (bkz. yukarıdaki zemin notu).
              testID="feed-post-avatar"
              source={{ uri: authorPhotoUrl }}
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: AVATAR / 2,
                backgroundColor: colors.surface3,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={authorPhotoUrl}
              transition={150}
            />
          )}

          {/* ÜNİVERSİTE SATIRI KALDIRILDI (istek). Blok artık TEK satır, yani
              satırın `alignItems: center`ı tarihi ve üç noktayı doğrudan isim/
              yaşla aynı hizaya oturtuyor — iki satırlık blokta ikisi de adla
              üniversitenin ARASINA denk geliyordu.
              `author.universityDisplay` DTO'da duruyor ve kasıtlı: profil
              önizlemesi (PreviewModal) onu hâlâ gösteriyor. */}
          <Text
            numberOfLines={1}
            style={{
              // 16 → 15 (istek: "bi tık küçült"). Mesajlar listesindeki isim
              // satırı 16'da kalıyor ve ÖLÇÜ ARTIK TEK DEĞİL — bilerek: satır
              // orada ekranın tüm genişliğinde duruyor, burada baloncuğun iç
              // dolgusu kadar daralmış bir kutunun içinde.
              marginLeft: 10,
              flexShrink: 1,
              fontSize: 15,
              fontWeight: "600",
              color: colors.text,
            }}
          >
            {/* ZORUNLU küçük harf (istek) — ve `textTransform` ile DEĞİL.
                Gerekçe utils/textCase.ts'de: RN'in iOS uygulaması locale'den
                bağımsız `lowercaseString` olduğu için "İrem" → "i̇rem", yani
                iki noktalı bir i çiziyor. Türkçe adlarda bu kural değil
                İSTİSNA değil, en sık hâl.
                ANONİM ETİKETİ DE küçülüyor: ikisi aynı slot ve aynı listede
                yan yana duruyor — "irem, 21" ile "Anonim Kadın" karışık bir
                liste veriyordu. */}
            {toDisplayLowercase(
              post.isAnonymous
                ? anonLabel
                : [post.author?.name, post.author?.age]
                    .filter((v) => v != null && v !== "")
                    .join(", "),
            )}
          </Text>
        </Pressable>

        {/* Tarih İSMİN HEMEN SAĞINDA (istek), satırın öbür ucunda değil.
            `flexShrink: 0` — yer daraldığında kısalan isim olmalı, tarih değil
            (kırpılmış bir tarih yanlış bilgi).
            Renk ProfileScreen'in ikincil grisiyle AYNI token: o sayfadaki
            "{n} hakkın kaldı" / accordion sayacı satırı da `textMuted`. */}
        <Text
          style={{
            // İsimle AYNI ölçüde küçüldü (16 → 15): ikisi tek satırın iki
            // parçası, biri küçülüp öbürü kalırsa taban hizası bozulmuyor ama
            // satır dengesiz okunuyor. Ağırlık yine normal — isimle aynı boyda
            // ama aynı ağırlıkta değil.
            flexShrink: 0,
            fontSize: 15,
            fontWeight: "400",
            color: colors.textMuted,
            marginLeft: 8,
          }}
        >
          {/* İsimle aynı dil: zorunlu küçük harf (istek). Gün adları ("Salı",
              "Dün") ve uzun tarih ayları buradan geçiyor; saat ve "14.03"
              biçimleri harf taşımadığı için dokunulmamış gibi kalıyor. */}
          {toDisplayLowercase(formatRelativeTime(post.createdAt, t))}
        </Text>

        {/* Esnek boşluk — üç noktayı satırın sağ ucuna iten tek şey bu.
            Tarih artık o işi yapmıyor. */}
        <View style={{ flex: 1 }} />

        {/* Durum rozeti ("İnceleniyor", "Süresi doldu"…) — ÜÇ NOKTANIN SOLUNDA
            (istek). Eskiden gövdenin altında kendi satırındaydı; gönderinin
            durumu başlık satırının bilgisi, metnin arasına giren ayrı bir
            şerit değil. Yalnız Gönderilerim'de dolu geliyor. */}
        {statusLabel ? (
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 0,
              fontSize: 12.5,
              fontWeight: "600",
              color: statusColor,
              marginLeft: 8,
            }}
          >
            {statusLabel}
          </Text>
        ) : null}

        {onMenu ? (
          <Pressable onPress={handleMenu} hitSlop={10} style={{ marginLeft: 8 }}>
            <SFIcon
              name="ellipsis"
              fallback={MoreHorizontal}
              size={18}
              // Tarih ve rozetle AYNI gri — üçü tek satırın parçası.
              color={colors.textMuted}
              strokeWidth={2}
            />
          </Pressable>
        ) : null}
      </View>

      {/* ── Gövde ── Satır sonları KORUNUYOR (sunucu en fazla 2 boş satıra
          normalize ediyor), o yüzden metin olduğu gibi basılıyor. */}
      <Text
        style={{
          // Ölçüler dosyanın başında, `export` olarak: iskelet de aynı
          // sayılardan çiziliyor (bkz. dosya başındaki not).
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
          color: colors.text,
          marginTop: BLOCK_GAP,
        }}
      >
        {post.body}
      </Text>

      {/* GÖVDENİN ALTINDAKİ DURUM SATIRI KALDIRILDI: durum rozeti başlık
          satırına, üç noktanın soluna taşındı; "kalan gün" etiketi ise tümden
          çıktı (istek). `formatExpiresIn` feedText'te duruyor ve testleri de —
          gönderinin ömrü hâlâ ürünün bir kuralı, yalnız kartta yazmıyor. */}

      {/* ── Konu etiketleri ───────────────────────────────────────────────
          Gövdenin ALTINDA, aksiyon satırının üstünde — YERİ DEĞİŞMEDİ.
          Dokunulabilir DEĞİL: kartta bir filtre kısayolu olsaydı kullanıcı
          listeyi istemeden daraltır ve geri dönmenin yolunu aramak zorunda
          kalırdı — konu seçimi filtrenin işi.

          ⚠️ KAPSÜL KALDIRILDI (istek). Eskiden `surface2` dolgulu bir çipti ve
          9'luk yatay payı etiketi gövde metninden 9pt içeri itiyordu: kartın
          sol kenarı üç farklı hizada başlıyordu (avatar · gövde · çip). Artık
          düz metin, yani sol kenarı gövdeyle BİREBİR aynı — hizayı kuran şey
          dolgunun yokluğu, negatif bir pay değil.

          Punto da gövdeyle AYNI (BODY_FONT_SIZE, 12 değil): etiket kartın
          künyesi değil, yazının bir parçası gibi okunsun. Ayrımı `#` ve
          `textSecondary` grisi taşıyor — gövde metni `text`.

          Alan gelmezse çizilmiyor (varsayılan "Genel" UYDURULMUYOR: konusuz
          bir gönderiyi etiketlemek yanlış bilgi olurdu). */}
      {topics.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            // Etiketler arası pay GÖVDE PUNTOSUNA göre: aynı satırda iki
            // hashtag yan yana dururken 8 onları tek bir kelime öbeği gibi
            // gösteriyordu, 12 ayırıyor ama satır sarmasını da bozmuyor.
            columnGap: 12,
            rowGap: 2,
            marginTop: 10,
          }}
        >
          {topics.map((key) => (
            <Text
              key={key}
              style={{
                color: colors.textSecondary,
                fontSize: BODY_FONT_SIZE,
                lineHeight: BODY_LINE_HEIGHT,
                // Gövdeyle aynı puntoda ama aynı AĞIRLIKTA değil (500 / 400):
                // etiket satırı gövdenin devamı gibi okunmasın.
                fontWeight: "500",
              }}
            >
              {topicHashtag(key, null)}
            </Text>
          ))}
        </View>
      ) : null}

      {/* ── Alt satır: beğeni + yanıt ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: BLOCK_GAP,
        }}
      >
        {/* Kendi gönderini beğenemezsin (UT-7330) → buton hiç çizilmiyor,
            yalnız sayı duruyor. */}
        <Pressable
          onPress={handleLike}
          disabled={post.isMine || !onToggleLike}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          {/* Beğeniler SEKMESİNİN ikonuyla aynı şekil: SF `heart`/`heart.fill`
              değil, uygulama ikonundan sökülen kalp (bkz. HeartGlyph). Dolu/
              outline ayrımı aynı glyph'in iki hâli — şekil değişmiyor, yalnız
              dolgu ile kontur yer değiştiriyor. */}
          {post.likedByMe ? (
            <HeartGlyph size={LIKE_HEART_BOX} color={likedAccent} />
          ) : (
            <HeartGlyph
              size={LIKE_HEART_BOX}
              // Tab ikonunun kalınlığı (gen-tab-icons.js > STROKE_PT) 2 ama
              // orası İÇ kontur: siluetin tamamı mürekkebin içinde kalıyor.
              // Buradaki ORTALANMIŞ kontur aynı sayıda yarısını dışa taşırıyor
              // ve 24pt'ye büyüyen kalpte bu fazlalık kalın okunuyordu.
              // 1.6 → 1.3 (istek: "biraz azalt").
              //
              // ⚠️ BU SAYI PT DEĞİL, VIEWBOX BİRİMİ. Kutu 24'lük grid'de
              // (HEART_VIEWBOX) çiziliyor ve ekrana `LIKE_HEART_BOX` (≈22.8pt)
              // olarak iniyor, yani birim ≈0.95pt — ekranda görünen kalınlık
              // yazılan sayıdan bir tık İNCE. Glyph'in ölçüsü değişirse bu da
              // değişir; "ince göründü" diye sayıyı büyütmeden önce
              // LIKE_HEART_WIDTH'e bak.
              stroke={colors.textMuted}
              strokeWidth={1.3}
            />
          )}
          <Text
            style={{
              marginLeft: LIKE_COUNT_MARGIN,
              // 13.5 → 15: satırın geri kalanı (yanıt sayısı, yanıt butonu)
              // 13.5'te duruyor ama bu sayı artık 24pt'lik bir kalbin yanında
              // ve o ölçüde ufak kalıyordu.
              fontSize: 15,
              fontWeight: "600",
              // ⚠️ Sayı KALBİN RENGİNDE, kendi grisinde değil (istek): boş
              // kalpte kontur `textMuted` çiziliyor, `textSecondary` onun
              // yanında daha koyu bir ikinci gri olarak okunuyordu. İki eleman
              // tek bir ölçüyü söylüyor, tek renkten olmalı — dolu dalda da
              // ikisi birlikte kırmızıya geçiyor.
              color: post.likedByMe ? colors.errorStrong : colors.textMuted,
            }}
          >
            {post.likeCount}
          </Text>
        </Pressable>

        {/* Esnek boşluk: beğeni solda, (Gönderilerim'de) yanıt sayısı sağ uçta.
            Yanıt butonu kalktığı için akış sekmesinde sağ uç artık boş —
            boşluk yine duruyor ki beğeni sola yapışsın. */}
        <View style={{ flex: 1 }} />

        {/* Gönderilerim: yanıt sayısı — dokununca Yanıtlar sayfası. */}
        {variant === "mine" && typeof post.replyCount === "number" ? (
          <Pressable
            onPress={() => onPressReplyCount?.(post)}
            disabled={!onPressReplyCount || post.replyCount === 0}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", marginLeft: 18 }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: "600",
                color: post.replyCount > 0 ? colors.text : colors.textMuted,
              }}
            >
              {t("feed.mine.replyCount", { count: post.replyCount })}
            </Text>
          </Pressable>
        ) : null}

        {/* YANIT BUTONU KALDIRILDI (iki modlu yapı).
            Eşleşme kanalı artık yanıt değil: yazarın adına/avatarına dokunup
            profil kartını açmak ve orada beğeni/not/Spark atmak (bkz.
            FeedScreen > handlePressAuthor). Anonim gönderide kart hiç
            açılmıyor — kimliği ifşa ederdi — ve o gönderiler yalnız beğeni
            alıyor.

            `replyActionFor` ve ReplyButton bileşeni de düştü; sunucu uçları
            eski istemciler için ayakta ama bu sürüm hiç çağırmıyor. */}
      </View>
    </View>
  );
}


/**
 * `memo` — liste satırı. Beğeni optimistic'i tek gönderiyi yamalıyor ve
 * `patchPostInCaches` isabet olmayan satırların REFERANSINI koruyor, yani
 * memo burada gerçekten iş görüyor.
 */
export default memo(FeedPostCardBase);
