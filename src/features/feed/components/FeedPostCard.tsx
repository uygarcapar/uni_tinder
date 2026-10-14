import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, User } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import HeartGlyph from "@/shared/components/HeartGlyph";
import { colors } from "@/shared/theme/colors";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import toDisplayLowercase from "@/shared/utils/textCase";
import { anonymousLabelKey, replyActionFor } from "../feedPolicy";
import { feedRowShell } from "../feedRowShell";
import type { FeedPostDto } from "../feedTypes";

/**
 * Akış gönderi kartı — sadece YAZI (fotoğraf yok, gönderi altında yorum yok).
 *
 * Yanıt butonunun durumu TAMAMEN `feedPolicy.replyActionFor`dan geliyor; burada
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
export const REPLY_PILL_PAD_H = 14;
export const REPLY_PILL_PAD_V = 10;
export const REPLY_PILL_FONT = 13.5;

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
}: FeedPostCardProps) {
  const { t } = useTranslation();
  const action = replyActionFor(post);

  const handleLike = useCallback(() => onToggleLike?.(post), [onToggleLike, post]);
  const handleMenu = useCallback(() => onMenu?.(post), [onMenu, post]);
  const handleAuthor = useCallback(() => {
    // Anonim gönderide açılacak profil YOK — sunucu da `author: null` yolluyor.
    if (post.isAnonymous) return;
    onPressAuthor?.(post);
  }, [onPressAuthor, post]);

  const handleReplyPress = useCallback(() => {
    switch (action.kind) {
      case "compose":
        onReply?.(post);
        return;
      case "openChat":
        onOpenChat?.(action.conversationId);
        return;
      case "paywall":
        onReplyPaywall?.(post);
        return;
      default:
        // hidden / disabled: buton zaten basılamaz halde çiziliyor.
        return;
    }
  }, [action, onReply, onOpenChat, onReplyPaywall, post]);

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
            <HeartGlyph size={LIKE_HEART_BOX} color={colors.errorStrong} />
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

        {/* Esnek boşluk BURADA, yanıt sayısının SOLUNDA: sayı satırın SAĞ
            ucuna dayanıyor (istek). Gönderilerim'de yanıt butonu zaten gizli
            (replyActionFor > OwnPost → hidden), yani sağ uç boş kalıyordu;
            akış sekmesinde ise aynı boşluk yanıt butonunu sağa itmeye devam
            ediyor. */}
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

        {/* İkinci esnek boşluk YOK: tek boşluk yukarıda, beğeninin hemen
            sağında. İkisi birden olsa sağa dayanan şey ortaya kayardı. */}
        <ReplyButton
          action={action}
          onPress={handleReplyPress}
          t={t}
        />
      </View>
    </View>
  );
}

/**
 * Yanıt butonu — `ReplyAction` → görünüm. Ayrı bileşen, çünkü kartın geri
 * kalanından BAĞIMSIZ değişiyor (beğeni optimistic'i kartı yeniden çiziyor,
 * buton durumu ise yalnız mutasyon sonrası değişiyor).
 */
function ReplyButton({
  action,
  onPress,
  t,
}: {
  action: ReturnType<typeof replyActionFor>;
  onPress: () => void;
  t: (k: string) => string;
}) {
  if (action.kind === "hidden") return null;

  const disabled = action.kind === "disabled";
  const label =
    action.kind === "openChat"
      ? t("feed.reply.goToChat")
      : action.kind === "disabled"
        ? t(action.labelKey)
        : t("feed.reply.button");

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        // Uzun etiket küçük ekranda satırı taşırmak yerine kısalsın: kapsül
        // esneyebilir, metin tek satıra kilitli (aşağıda numberOfLines).
        flexShrink: 1,
        paddingHorizontal: REPLY_PILL_PAD_H,
        // Etiket "Yanıtla"dan "Eşleşmek için yanıtla"ya uzadığı için kapsül
        // artık geniş bir kutu: 7'lik dikey boşlukta metne göre basık
        // kalıyordu.
        paddingVertical: REPLY_PILL_PAD_V,
        borderRadius: 999,
        borderCurve: "continuous",
        // Dolgu `litPlus` — Beğeniler ekranındaki "Keşfetmeye başla" butonuyla
        // AYNI (bkz. EmptyState'in `buttonLabel` pill'i: litPlus zemin, 999
        // yarıçap). `inverseSurface` nötrdü ve satırın tek aksiyonu olduğunu
        // söylemiyordu.
        // PASİF DAL DEĞİŞMEDİ: "Yanıtladın"/"Kısıtlı" ürünün renginde çizilse
        // basılabilir görünürdü — orası nötr `surface3`te kalıyor.
        backgroundColor: disabled ? colors.surface3 : colors.litPlus,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Kilit YALNIZ paywall dalında — "bilinmiyor" ya da pasif durumda kilit
          çizmek kullanıcıya olmayan bir satın alma ima ederdi. */}
      {action.kind === "paywall" ? (
        <Text style={{ fontSize: 12, marginRight: 5 }}>🔒</Text>
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          fontSize: REPLY_PILL_FONT,
          fontWeight: "600",
          // ⚠️ `onMediaInverse` — koyu modda DA SİYAH. `text`/`onInverseSurface`
          // koyuda beyaza dönüp litPlus dolgunun üstünde kayboluyor; Beğeniler
          // ekranındaki aynı buton da tam bu gerekçeyle sabit mürekkep
          // kullanıyor (bkz. LikesScreen > buttonLabelColor).
          color: disabled ? colors.textMuted : colors.onMediaInverse,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * `memo` — liste satırı. Beğeni optimistic'i tek gönderiyi yamalıyor ve
 * `patchPostInCaches` isabet olmayan satırların REFERANSINI koruyor, yani
 * memo burada gerçekten iş görüyor.
 */
export default memo(FeedPostCardBase);
