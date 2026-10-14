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

import {
  MODE_CODES,
  type CodeAction,
  type CodeEntry,
} from "@/shared/constants/responseCodes";

/**
 * Mesafe teklifinin GÖSTERİLMEDİĞİ sebepler: mesafenin çözemeyeceği kapılar.
 * Bunlarda sınırı kaldırmak tek bir kart bile getirmez, teklif yalan olur.
 */
export const DISTANCE_IRRELEVANT_REASONS: readonly string[] = [
  "SwipeLimitReached", // günlük hak bitti, havuzla ilgisi yok
  "ProfileIncomplete", // kullanıcının kendi profili eksik
  "AccountRestricted", // hesap yaptırımı
];

/**
 * Mod kapısı aksiyonları — `CodeAction["kind"]` ailesinin DIŞINDA iki değer.
 *
 * Ayrı tutuluyor çünkü ikisi de kod kataloğundaki jenerik aksiyonlardan
 * farklı bir şey yapıyor: biri hiçbir şey (özellik kapalı, kullanıcının
 * yapabileceği yok), öbürü MOD KURULUM AKIŞINI açıyor.
 */
export type ModeGateAction = "openModeSetup" | "none";

export interface EmptyDeckCopy {
  title: string;
  /** `null` = birincil buton çizilmez (yalnız `dismiss` sebeplerinde). */
  actionLabel: string | null;
  actionKind: CodeAction["kind"];
  /** Birincil butonun ALTINDAKİ ikincil satır — pratikte hep mesafe teklifi. */
  secondaryLabel: string | null;
  /**
   * Mod kapısı aksiyonu. `undefined` = normal boş deste (aksiyon `actionKind`
   * üzerinden). Doluysa `actionKind` YOK SAYILIR.
   */
  modeAction?: ModeGateAction;
}

export interface EmptyDeckCopyInput {
  /**
   * Deste yanıtındaki ham kod (`UT-2302` / `UT-2304`).
   *
   * MOD KAPISI EN ÖNCE değerlendiriliyor: mesafe/filtre tavsiyesi vermek
   * anlamsız, çünkü deste boş değil — o modun HAVUZU YOK (özellik kapalı ya
   * da kullanıcı profilini açmamış).
   */
  modeCode?: string | null;
  /** Seçili mod — kapalı mod başlığını isimlendirmek için. */
  mode?: string | null;
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
  modeCode,
  mode,
  t,
}: EmptyDeckCopyInput): EmptyDeckCopy | null {
  const distanceOfferLabel = () =>
    t("discover.empty.noCandidatesInRadius.action");

  // ── MOD KAPISI — HER ŞEYDEN ÖNCE ────────────────────────────────────────
  // Bu iki kodda deste "boşalmadı", o modun havuzu HİÇ YOK. Mesafe sınırını
  // kaldırmayı teklif etmek yalan olurdu: sınır kalksa da tek kart gelmez.
  //
  // İki kod AYRI mesaj ve AYRI aksiyon taşıyor (ikisi de "Friends yok"
  // demiyor): 2302 özellik kapalı → yapılacak bir şey yok; 2304 kullanıcı
  // profilini açmamış → açabilir.
  if (modeCode === MODE_CODES.MODE_DISABLED) {
    return {
      title: t("discover.empty.modeDisabled.title"),
      actionLabel: null,
      actionKind: "dismiss",
      secondaryLabel: null,
      modeAction: "none",
    };
  }
  if (modeCode === MODE_CODES.MODE_NOT_OPENED) {
    return {
      title: t(`discover.mode.lockedTitle.${mode ?? "Friends"}`),
      actionLabel: t("discover.mode.openCta"),
      actionKind: "dismiss",
      secondaryLabel: null,
      modeAction: "openModeSetup",
    };
  }

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
