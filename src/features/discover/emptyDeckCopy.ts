/**
 * Boş destede gösterilecek metin + aksiyonun çözümü.
 *
 * Ayrı dosya olmasının sebebi dallanma sayısı: karar dört girdiye birden
 * bakıyor (backend sebebi, mesafe anahtarının hâli, sebebin kendi aksiyonu,
 * destenin oturmuş olup olmadığı) ve yanlış dal kullanıcıyı aksiyonsuz bir boş
 * ekranda bırakıyor — ekranın içinde inline dururken bunu test etmenin yolu
 * yoktu.
 *
 * ── Kural (2026-08-27): mesafe teklifi HER boş destede ────────────────────
 * Mesafe sınırı açıkken (`ignoreDistanceFilter` kapalı) "Mesafe sınırını
 * kaldır" yalnız backend `NoCandidatesInRadius` dediğinde değil, deste hangi
 * sebeple boşalırsa boşalsın teklif edilir. Gerekçe: sebep sınıflandırması
 * yaklaşık — "hepsini gördün" de, "filtrelerin dar" da, hiç sebep gelmemesi de
 * pratikte aynı yere çıkıyor: yarıçapın DIŞINDA bakılmamış profiller var ve
 * sınır kalkar kalkmaz deste doluyor.
 *
 * Teklif sebebin kendi aksiyonunu EZMİYOR: birincil buton sebebin butonu
 * olarak kalıyor, teklif altına ikincil satır olarak biniyor. Tek istisna
 * sebebin hiç butonu olmaması (`dismiss`) — o zaman ekranda başka aksiyon
 * yok, teklif birincil butona oturuyor.
 */

import type { CodeAction, CodeEntry } from "@/shared/constants/responseCodes";

/**
 * Mesafe teklifinin GÖSTERİLMEDİĞİ sebepler: mesafenin çözemeyeceği kapılar.
 * Bunlarda sınırı kaldırmak tek bir kart bile getirmez, teklif yalan olur.
 */
export const DISTANCE_IRRELEVANT_REASONS: readonly string[] = [
  "SwipeLimitReached", // günlük hak bitti, havuzla ilgisi yok
  "ProfileIncomplete", // kullanıcının kendi profili eksik
  "AccountRestricted", // hesap yaptırımı
];

export interface EmptyDeckCopy {
  title: string;
  /** `null` = birincil buton çizilmez (yalnız `dismiss` sebeplerinde). */
  actionLabel: string | null;
  actionKind: CodeAction["kind"];
  /** Birincil butonun ALTINDAKİ ikincil satır — pratikte hep mesafe teklifi. */
  secondaryLabel: string | null;
}

export interface EmptyDeckCopyInput {
  /** Çözülmüş `emptyReasonCode`/`emptyReason` girdisi; yoksa `null`. */
  entry: CodeEntry | null;
  /** Backend'in lokalize `emptyReasonMessage`'ı — i18n'de karşılık yoksa. */
  backendMessage?: string | null;
  /** `ignoreDistanceFilter` AÇIK mı (yani mesafe sınırı kalkmış mı). */
  distanceLimitOff: boolean;
  /**
   * Deste gerçekten boş mu — ilk yükleme bitmiş ve elde kart kalmamış.
   * Sebepsiz durumda metin göstermeden önce bu bekleniyor: yükleme sürerken
   * "kimse yok" yazmak yanlış, deste bir saniye sonra dolabilir.
   */
  deckSettled: boolean;
  t: (key: string, opts?: { defaultValue?: string }) => string;
}

/** `NoCandidatesInRadius` → `noCandidatesInRadius` (i18n anahtarı). */
const reasonToKey = (reason: string) =>
  reason.charAt(0).toLowerCase() + reason.slice(1);

/**
 * Metin sırası: uygulama dilindeki i18n karşılığı → backend'in lokalize
 * `emptyReasonMessage`'ı → sözlükteki TR fallback. i18n önce geliyor çünkü
 * kullanıcının uygulama içi dil tercihi tek doğru kaynak; backend metni yalnız
 * FE'nin tanımadığı yeni bir kod geldiğinde devreye girer.
 *
 * `null` dönerse ekranda yalnız radar animasyonu kalır (metin/buton yok).
 */
export function resolveEmptyDeckCopy({
  entry,
  backendMessage,
  distanceLimitOff,
  deckSettled,
  t,
}: EmptyDeckCopyInput): EmptyDeckCopy | null {
  const distanceOfferLabel = () =>
    t("discover.empty.noCandidatesInRadius.action");

  // Sebep hiç çözülemedi (bilinmeyen kod / alan hiç gelmiyor) ama deste boş.
  // Eskiden bu yol yalnız radar döndürüyordu: kullanıcıya tek bir çıkış yolu
  // bile verilmiyordu. Anahtar kapalıysa teklif BİRİNCİL aksiyon olur.
  if (!entry?.emptyReason) {
    if (distanceLimitOff || !deckSettled) return null;
    return {
      // Sebebe dair bir şey İDDİA ETMEYEN nötr başlık.
      title: t("discover.empty.unknown.title"),
      actionLabel: distanceOfferLabel(),
      actionKind: "removeDistanceLimit",
      secondaryLabel: null,
    };
  }

  const reasonKey = reasonToKey(entry.emptyReason);
  const title = t(`discover.empty.${reasonKey}.title`, {
    defaultValue: backendMessage || entry.title,
  });

  // Mesafe sınırı ZATEN kapalıyken "Mesafe Sınırını Kaldır" ÇİZİLMEZ — basmak
  // hiçbir şeyi değiştirmez, kullanıcı aynı boş desteye bakmaya devam eder.
  // Aksiyonsuz bir çıkmazda da bırakmıyoruz: eleme kalkmış ve hâlâ kimse yoksa
  // yapılabilecek tek şey diğer filtreleri gevşetmek.
  if (entry.action.kind === "removeDistanceLimit" && distanceLimitOff) {
    return {
      title,
      actionLabel: t("discover.empty.filtersTooStrict.action"),
      actionKind: "openFilters",
      secondaryLabel: null,
    };
  }

  const actionLabel =
    entry.action.kind === "dismiss"
      ? null
      : t(`discover.empty.${reasonKey}.action`, {
          defaultValue: entry.actionLabel,
        });

  const offerDistance =
    !distanceLimitOff &&
    // Sebebin kendi aksiyonu zaten buysa ikinci kez teklif etme.
    entry.action.kind !== "removeDistanceLimit" &&
    !DISTANCE_IRRELEVANT_REASONS.includes(entry.emptyReason);

  // Sebebin butonu yoksa (`dismiss` → "Görebileceklerinin hepsini gördün")
  // teklif ikincil satırda kaybolmasın, doğrudan birincil butona otursun.
  if (offerDistance && !actionLabel) {
    return {
      title,
      actionLabel: distanceOfferLabel(),
      actionKind: "removeDistanceLimit",
      secondaryLabel: null,
    };
  }

  return {
    title,
    actionLabel,
    actionKind: entry.action.kind,
    secondaryLabel: offerDistance ? distanceOfferLabel() : null,
  };
}
