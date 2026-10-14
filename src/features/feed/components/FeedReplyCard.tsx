import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MemoLikeCard } from "@/features/discover/components/LikeCard";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import type { FeedReceivedReplyDto } from "../feedTypes";

/**
 * Gelen yanıt kartı — "gönderine şu kişi şunu yazdı, kabul mü?".
 *
 * TASARIM BU DOSYAYA AİT DEĞİL: kart, Beğeniler'deki NOT KARTININ ta kendisi
 * (bkz. discover/components/LikeCard). Burada yapılan tek şey yanıtı o kartın
 * beklediği şekle çevirmek — fotoğraf kartı, kimlik bloğu, cam not kutusu,
 * açılma animasyonu, perdeler, hepsi oradan geliyor.
 *
 * NEDEN AYNI KART: ürün açısından ikisi tek cümle — "biri sana bir şey YAZDI".
 * Not Beğeniler'de, yanıt Akış'ta doğuyor ama kullanıcı ikisini de aynı listede
 * (Beğeniler'in akış yanıtları sekmesi) yan yana görüyor; iki ayrı görsel dil
 * orada iki ayrı ürün gibi okunuyordu.
 *
 * EŞLEME:
 *   • yanıtlayanın fotoğrafı → kartın fotoğrafı
 *   • isim, yaş, üniversite  → kartın kimlik bloğu
 *   • yorum                  → notun metni
 *   • gönderi alıntısı       → not kutusunun hedef bloğu ("FeedPost" hedefi)
 *   • Kabul / Geç / ⋯        → kartın köşe butonları
 *
 * ⚠️ Yanıt VEREN her zaman görünür, anonimlik burada YOK: anonim olan gönderi
 * SAHİBİ (yani bu kartı gören kişi), yanıtlayan değil. `postIsAnonymous` sadece
 * hedef satırının metnini değiştiriyor ("Anonim gönderine yanıt").
 *
 * ⚠️ Beğeniler ekranındaki blur/unlock kuralı (isUnlockedLike) BURAYA
 * UYGULANMIYOR: akış yanıtları free kullanıcıya da açık. Kart `isPremium`
 * ALMASA bile net çiziliyor, çünkü `isUnlockedLike` notu olan kartı zaten
 * açıyor — yanıtın kendisi bir not. Buraya premium bayrağı BAĞLAMA: bağlanırsa
 * free kullanıcıda yanıt bulanıklaşır.
 */

export interface FeedReplyCardProps {
  reply: FeedReceivedReplyDto;
  onPress?: (reply: FeedReceivedReplyDto) => void;
  onAccept?: (reply: FeedReceivedReplyDto) => void;
  onDismiss?: (reply: FeedReceivedReplyDto) => void;
  onMenu?: (reply: FeedReceivedReplyDto) => void;
  /** İstek uçarken ikinci basışı yut — kart kendi başına bekleme hâli tutmuyor. */
  busy?: boolean;
}

function FeedReplyCardBase({
  reply,
  onPress,
  onAccept,
  onDismiss,
  onMenu,
  busy = false,
}: FeedReplyCardProps) {
  const { t } = useTranslation();

  /**
   * Yanıt → kart nesnesi.
   *
   * `useMemo` ŞART: kart `memo`lu ve prop'ları sığ karşılaştırılıyor (bkz.
   * MemoLikeCard'ın başındaki not). Her render'da yeni bir nesne üretilirse
   * memo hiç tutmaz ve listedeki bütün kartlar yeniden çizilir — bu kartın
   * içinde kare kare yükseklik süren bir not kutusu var.
   *
   * Hedef etiketi BURADA birleşiyor: akışın cümlesi + zaman damgası. Kart i18n
   * kararı vermiyor (etiketleri prop'la alıyor) ve zamanı yazacak ayrı bir
   * satırı da yok — Beğeniler'deki not kartında zaman hiç görünmüyor.
   * "Gönderine yanıt · 42 dk önce" ikisini tek gri satırda veriyor.
   */
  const item = useMemo(
    () => ({
      userId: reply.replier?.userId,
      name: reply.replier?.name,
      age: reply.replier?.age,
      mainPhoto: reply.replier?.mainPhotoUrl ?? null,
      // Kartın alanı `universityName` ama beklediği şey GÖRÜNTÜLENECEK ad
      // (gerekçe kartın içinde, `universityLabel`'ın yanında).
      universityName: reply.replier?.universityDisplay ?? null,
      // Rozetler ÇİZİLMİYOR: yanıt DTO'su premium/selfie bilgisi taşımıyor
      // (bkz. FeedAuthorDto). `false` "bu kişi premium değil" demek değil,
      // "bilmiyoruz" demek — uydurma bir rozet çizmekten iyisi.
      isPremium: false,
      isSelfieVerified: false,
      isSuperLike: false,
      note: {
        comment: reply.comment,
        target: {
          kind: "FeedPost" as const,
          label: `${
            reply.postIsAnonymous
              ? t("feed.received.onYourAnonymousPost")
              : t("feed.received.onYourPost")
          } · ${formatRelativeTime(reply.sentAt, t)}`,
          excerpt: reply.postExcerpt,
        },
      },
    }),
    [reply, t],
  );

  // Kart `onX(item)` çağırıyor (kartı parametre alıyor), bu dosyanın dışa
  // verdiği sözleşme ise YANITI veriyor — sarmalayıcılar o çeviriyi yapıyor.
  // `busy` kapısı da burada: kartın kendi bekleme hâli yok.
  const handlePress = useCallback(() => onPress?.(reply), [onPress, reply]);
  const handleAccept = useCallback(() => {
    if (busy) return;
    onAccept?.(reply);
  }, [busy, onAccept, reply]);
  const handleDismiss = useCallback(() => {
    if (busy) return;
    onDismiss?.(reply);
  }, [busy, onDismiss, reply]);
  const handleMenu = useCallback(() => onMenu?.(reply), [onMenu, reply]);

  return (
    <MemoLikeCard
      item={item}
      // Bilerek `false` — gerekçe dosyanın başındaki uyarıda.
      isPremium={false}
      onPress={onPress ? handlePress : undefined}
      // Köşedeki prominent tik: Beğeniler'de "beğen", burada "kabul et".
      onLike={onAccept ? handleAccept : undefined}
      likeLabel={t("feed.received.accept")}
      // Sade cam X — yalnız bu kartta çiziliyor (bkz. LikeCard > onSkip).
      onSkip={onDismiss ? handleDismiss : undefined}
      skipLabel={t("feed.received.skip")}
      onMenu={onMenu ? handleMenu : undefined}
      // Buton metin taşımıyor, bu yalnız VoiceOver etiketi — akışa özel bir
      // çeviri anahtarı yok, ortak "Menü" doğru olanı.
      menuLabel={t("common.menu")}
    />
  );
}

export default memo(FeedReplyCardBase);
