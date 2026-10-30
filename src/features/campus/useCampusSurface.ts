import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/shared/hooks/redux";
import { appPrefs } from "@/shared/utils/appPrefs";
import { devLog } from "@/shared/utils/devLog";
// ⚠️ `pickAndCropPhotos` / `captureAndCropPhoto` ARTIK KULLANILMIYOR: kampüs
// anında galeri yolu da kırpma ekranı da kaldırıldı (gerekçe `captureMoment`te).
// `captureRawPhoto` da düştü: kare artık kamera ekranında duruyor ve gönderim
// oradan tetikleniyor (`captureAndSendPhoto`).
import {
  captureAndSendPhoto,
  fitPhotoForUpload,
  type RawShot,
} from "@/shared/utils/photoPicker";
import { forgetPhoto } from "@/shared/utils/photoStore";
import { useSwipeMutation } from "@/features/discover/swipeQueries";
import type { AppMode } from "@/features/discover/modeTheme";
import { UNLIMITED } from "@/shared/constants/limits";
import {
  CAMPUS_CODES,
  CAMPUS_DROP_CARD_CODES,
  campusCodeI18nKey,
} from "./campusCodes";
import { campusCodeOf, campusMessageOf } from "./campusService";
import {
  removeMomentFromCaches,
  useCampusMe,
  useCampusBoundary,
  useCampusMoments,
  useCreateCampusMoment,
  useDeleteCampusMoment,
  usePassCampusMoment,
  useRefreshCampus,
} from "./campusQueries";
import {
  resolveCampusPresence,
  resolveCampusPresenceHint,
} from "./campusPresence";
import { syncCampusGeofence } from "./campusGeofence";
import type { CampusMomentDto } from "./campusTypes";

/**
 * KAMPÜS ANLARI — ekranın TEK giriş kancası.
 *
 * `FeedScreen` bu özelliği birkaç satırda bağlıyor: sorgular, konum kapısı,
 * paylaşım akışı ve karar yolu burada. Ekran zaten 1800+ satır ve akışın
 * kendi mantığını taşıyor; kampüs mantığı oraya dağılsaydı iki özellik tek
 * dosyada birbirine karışırdı (LikesScreen'in 4000 satırı bu şekilde oluştu).
 *
 * ── Sorgular YALNIZ yüzey açıkken ──────────────────────────────────────────
 * `enabled` tam ekran haritaya bağlı. Akış sekmesinde oturan bir kullanıcı
 * için kampüs listesi çekmek boşuna istek; harita açılınca veri geliyor.
 *
 * ⚠️ TEK İSTİSNA `/campus/me` — `prewarm` ile önceden ısıtılıyor. O yanıt
 * sheet'in AÇILIP AÇILMAYACAĞINA karar veriyor (`available`), yani kapı
 * kapalıyken sheet'in `visible`i ağ cevabını bekliyordu: kullanıcı banda
 * dokunuyor, harita açılıyor, modal yüzlerce ms sonra arkadan geliyordu.
 * Kapının cevabı dokunuş anında elde olmak zorunda (bkz. feedMapMotion).
 */

/** "Her zaman" izni bir kez soruldu mu — kullanıcı başına, logout'ta silinmiyor. */
const ASKED_KEY_PREFIX = "campusAlwaysAsked:";

export interface UseCampusSurfaceArgs {
  /** Tam ekran harita açık mı — sorguların ve konum okumasının kapısı. */
  enabled: boolean;
  /**
   * Yüzey henüz KAPALIYKEN `/campus/me` çekilsin mi — yalnız o sorgu için.
   *
   * Ekran, kullanıcı banda dokunabildiği sürece true geçiyor. Maliyeti 30sn
   * tazelik penceresinde tek bir GET; karşılığı açılışta eşzamanlı bir modal
   * (gerekçe dosya başında).
   *
   * ⚠️ ANLAR LİSTESİ DE ISITILIYOR ve kapısı `available`: sheet açıldığında
   * içeriğin ORADA olması istendi (istek: "sayfaya girince beklemesin,
   * doğrudan gönderiler ya da boş durum gelsin"). Yüzeyi kapalı kampüslerde
   * istek atılmıyor, yani ısıtma bayrağı açık olan kullanıcılarla sınırlı.
   *
   * ⚠️ KONUM ISITILMIYOR, bilerek: `resolveCampusPresence` yüksek hassasiyetli
   * bir GPS okuması (12sn tavan) ve onu her akış mount'unda tetiklemek pili
   * yakar — o dosyanın kendi uyarısı da bu. Boş durumun CTA'sı konum cevabıyla
   * birlikte geliyor.
   */
  prewarm?: boolean;
  mode: AppMode;
  /** Kullanıcının kendi kampüs domain'i. */
  domain: string | null;
  /** Kota dolduğunda açılacak paywall — ekranın "önce tazele sonra sat" yolu. */
  onPaywall: () => void;
}

export function useCampusSurface({
  enabled,
  prewarm = false,
  mode,
  domain,
  onPaywall,
}: UseCampusSurfaceArgs) {
  const { t } = useTranslation();
  const userId = useAppSelector(
    (s: any) => s?.auth?.user?.userId ?? s?.auth?.user?.id ?? null,
  );

  // ⚠️ Yüzey kapalıyken de koşabiliyor: `available` kapısının cevabı dokunuş
  // anında elde olmak zorunda (gerekçe `prewarm`de).
  const meQuery = useCampusMe({ enabled: enabled || prewarm });
  const boundaryQuery = useCampusBoundary(domain, { enabled: enabled || prewarm });
  const refreshCampus = useRefreshCampus();
  const qc = useQueryClient();

  const createMoment = useCreateCampusMoment();
  const deleteMoment = useDeleteCampusMoment();
  const passMoment = usePassCampusMoment();
  const swipe = useSwipeMutation();

  const me = meQuery.data;
  const boundary = boundaryQuery.data ?? null;

  /**
   * Özellik bu kampüste AÇIK MI — TEK OKUMA NOKTASI `/campus/me`.
   *
   * ⚠️ `isApproximate`/`polygon`tan TÜRETİLMİYOR (backend rehberi §0.2): o alan
   * iki kapıyı birden özetliyor — özellik bayrağı (kademeli açılıyor) VE
   * kampüsün sınır verisi. İstemci kendi türetirse ikisinden biri değiştiğinde
   * sessizce ayrışır.
   *
   * `polygon` yine de gerekiyor ama BAŞKA bir iş için: konum kararı. Poligonsuz
   * `isInsideCampus` zaten her zaman `false` döndürüyor, yani "+" kapısı
   * kendiliğinden kapalı.
   */
  const available = me?.enabled === true;

  /**
   * ANLAR LİSTESİ — `available` kapısının ARDINDA, o yüzden burada tanımlı.
   *
   * Yüzey açıkken her hâlükârda koşuyor; kapalıyken yalnız ISITMA için ve
   * yalnız özellik bu kampüste açıksa (gerekçe `prewarm`de). Sheet'in
   * açıldığında boş/spinner durmaması buna bağlı.
   */
  const momentsQuery = useCampusMoments(mode, {
    enabled: (enabled || prewarm) && available,
  });

  // ── Konum kapısı ──────────────────────────────────────────────────────────
  const [inside, setInside] = useState(false);
  const refreshPresence = useCallback(
    async (force = false) => {
      if (!available) {
        setInside(false);
        return false;
      }
      const presence = await resolveCampusPresence({
        domain,
        boundary,
        force,
      });
      setInside(presence.inside);
      return presence.inside;
    },
    [available, boundary, domain],
  );

  /** Harita açıldığında bir kez oku — "+" butonunun kapısı bu. */
  useEffect(() => {
    if (!enabled) return;
    refreshPresence(false);
  }, [enabled, refreshPresence]);

  /**
   * UCUZ İPUCU — akışın bandındaki "paylaşabilirsin" kartı için.
   *
   * ⚠️ YÜZEY KAPALIYKEN DE KOŞUYOR ve bu, konumu ısıtmama kuralını BOZMUYOR:
   * `resolveCampusPresenceHint` GPS'i uyandırmıyor, işletim sisteminin son
   * bilinen konumunu okuyor (gerekçe orada). Yüksek doğruluklu okuma hâlâ
   * yalnız harita açıldığında ve paylaşım anında.
   *
   * ⚠️ `inside`la BİRLEŞTİRİLMİYOR, ayrı tutuluyor: `inside` paylaşımın
   * kapısı ve onu bir tahminle doldurmak sunucunun reddedeceği bir "+"
   * butonu çizerdi. İpucu yalnız bandın küçük kartını açıyor.
   */
  const [insideHint, setInsideHint] = useState(false);
  useEffect(() => {
    if (!available) {
      setInsideHint(false);
      return;
    }
    let alive = true;
    resolveCampusPresenceHint({ domain, boundary })
      .then((hint) => {
        if (alive) setInsideHint(hint);
      })
      .catch(() => {
        /* no-op — ipucu yoksa kart da yok. */
      });
    return () => {
      alive = false;
    };
  }, [available, boundary, domain]);

  /** Sınır indiğinde/değiştiğinde geofence'i senkronla (izin varsa). */
  useEffect(() => {
    if (!boundary) return;
    syncCampusGeofence(boundary).catch(() => {
      /* no-op — izin yoksa Kademe B zaten çalışıyor. */
    });
  }, [boundary]);

  // ── Kota ──────────────────────────────────────────────────────────────────
  const decisionsRemaining = useMemo(() => {
    const value = me?.quota?.decisionsRemaining;
    // ⚠️ `null` = "bilmiyoruz" (/me gelmedi) — `0` ile aynı şey DEĞİL.
    return typeof value === "number" ? value : null;
  }, [me?.quota?.decisionsRemaining]);

  const decisionsExhausted =
    decisionsRemaining !== null &&
    decisionsRemaining !== UNLIMITED &&
    decisionsRemaining <= 0;

  // ── Paylaşım akışı ────────────────────────────────────────────────────────
  /**
   * ⚠️ ELDE KARE TUTAN STATE KALMADI (`shot`) ve ONAY SHEET'İ DE (`composerOpen`,
   * `shareError`) — ikisi de kamera ekranına taşındı.
   *
   * İstek birebir: "direkt çektiğim ekranda foto static kalsın, oradan göndere
   * basınca göndereyim, ekstra modal filan açma". Kare artık kamera ekranının
   * penceresinde donuyor, paylaş düğmesi ve satır içi hata da orada
   * (bkz. photoPicker > `captureAndSendPhoto` ve cameraBridge > `commit`).
   *
   * Yani bu kanca artık kareyi SAKLAMIYOR, yalnız gönderme işini veriyor:
   * `shareShot` bir kez koşan saf bir iş, hata metnini DÖNDÜRÜYOR (state'e
   * yazmıyor) çünkü o metni gösterecek yüzey kamera ekranı.
   */
  const [primingOpen, setPrimingOpen] = useState(false);

  /** Paylaşım kapısı: açık + kampüste + bugün paylaşmamış. */
  const canShare = available && inside && !me?.postedToday;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * "+" DOĞRUDAN KAMERAYI AÇIYOR — KAYNAK SEÇİMİ VE KIRPICI YOK (istek).
   * ══════════════════════════════════════════════════════════════════════════
   * İstek birebir: "artıya basınca galeri filan sunmasın, direkt kamerayı
   * açsın ve ön kamerayla açılsın ilk; çekince de preview olarak dursun
   * ekranda, loading'e girmesin; sonra da yollayayım".
   *
   * Akış artık TEK dokunuş + TEK onay: `+` → kamera (ön) → önizleme sheet'i →
   * paylaş. Kaldırılan iki adım:
   *   • `PhotoSourceSheet` (kamera/galeri seçimi) — bir kampüs anı "şu anda
   *     burada olmanın" kanıtı, galeriden seçilen eski bir fotoğraf o cümleyi
   *     kuramıyor. Seçenek sunmak kuralı da zayıflatıyordu.
   *   • kırpma ekranı — kamera zaten 3:4 çekiyor ve kullanıcının deklanşöre
   *     basarken gördüğü pencere TAM OLARAK o kare, yani kırpıcı aynı kareyi
   *     ikinci kez onaylatmaktan başka bir şey yapmıyordu.
   *
   * ⚠️ GALERİ YOLU TAMAMEN KALKTI (`pickAndCropPhotos` çağrısı yok): geri
   * isteniyorsa kuralın kendisi (yalnız anlık çekim) yeniden tartışılmalı.
   */
  /** Kod → gösterilecek metin. SUNUCU MESAJI ÖNCE, i18n yedek. */
  const errorTextOf = useCallback(
    (err: unknown): string => {
      const serverMessage = campusMessageOf(err);
      if (serverMessage) return serverMessage;
      const key = campusCodeI18nKey(campusCodeOf(err));
      return key ? t(key) : t("campus.codes.generic");
    },
    [t],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * KAREYİ GÖNDER — kamera ekranının "Paylaş" düğmesinin arkasındaki iş.
   * ══════════════════════════════════════════════════════════════════════════
   * ⚠️ HATA METNİNİ DÖNDÜRÜYOR, state'e YAZMIYOR: metni gösterecek yüzey artık
   * bu kancanın değil, kamera ekranının (donmuş karenin altındaki satır).
   * Sözleşme `cameraBridge > commit`te: `null` = başarılı, string = hata.
   *
   * ⚠️ EKRAN AÇIK KALDIĞI İÇİN hata DALLARININ HEPSİ "tekrar denenebilir"
   * olmak zorunda: kare elde duruyor, kullanıcı aynı kareyle tekrar basabilir
   * ya da yeniden çekebilir. Bu yüzden hiçbir dalda ham kare unutulmuyor —
   * silinen tek dosya ölçeklenmiş KOPYA (onu her deneme yeniden üretiyor).
   */
  const shareShot = useCallback(
    async (shot: RawShot): Promise<string | null> => {
    try {
      /**
       * ⚠️ KONUM TAM BURADA ve TAZE okunuyor (`force: true`).
       *
       * Kullanıcı fotoğrafı seçip kırparken dakikalar geçebiliyor; önbellekteki
       * okuma o sırada bayatlıyor ve sunucu `UT-7413` ile reddediyor. Kapıyı
       * açan okuma ile gövdeye giren okuma AYNI olmak zorunda.
       */
      const presence = await resolveCampusPresence({
        domain,
        boundary,
        force: true,
      });
      if (!presence.inside || !presence.fix) {
        setInside(false);
        return t(`campus.codes.${CAMPUS_CODES.OUT_OF_CAMPUS}`);
      }

      /**
       * ⚠️ ÖLÇEKLEME TAM BURADA — çekimden hemen sonra DEĞİL (istek:
       * "çekince loading'e girmesin").
       *
       * Ham kare 12MP'e kadar çıkıyor ve yüklemeye o hâliyle gidemez; kırpıcı
       * kaldırıldığı için küçültmeyi yapan tek yer bu. Deklanşörle önizleme
       * arasına konsaydı kullanıcı tam o anda bir yükleme görürdü; burada
       * zaten bir yükleme durumu var (gönder düğmesinin göstergesi, S3 PUT).
       *
       * `null` = manipülatör hatası. Mesaj genel: kullanıcının yapabileceği
       * bir şey yok, fotoğraf elde duruyor ve tekrar basabilir.
       */
      const photo = await fitPhotoForUpload(shot);
      if (!photo) return t("campus.codes.generic");

      const file = new File(photo.uri);
      const sizeBytes = Number(file.size ?? 0);
      if (!sizeBytes) {
        forgetPhoto(photo.uri);
        return t("campus.codes.generic");
      }
      /**
       * Boyut kapısı İSTEMCİDE DE var.
       *
       * Sunucu zaten 1. adımda (upload-url) reddediyor, yani bant genişliği
       * çöpe gitmiyor — ama kullanıcının EMEĞİ gidiyor: fotoğrafı çekti,
       * "paylaş"a bastı ve ancak o anda "çok büyük" duydu. Sınır `/me`den
       * geliyor; alan yoksa kontrol YAPILMIYOR (uydurma bir tavan koymaktansa
       * sunucunun reddetmesi doğru).
       *
       * ⚠️ KONTROL ÖLÇEKLENMİŞ DOSYADA: ham kare neredeyse her zaman tavanı
       * aşıyor (12MP JPEG birkaç MB), yani ham boyuta bakmak kullanıcıyı
       * yükleyebileceği bir fotoğraf için reddetmek olurdu.
       */
      const maxBytes = me?.photoMaxBytes ?? null;
      if (maxBytes && sizeBytes > maxBytes) {
        forgetPhoto(photo.uri);
        return t(`campus.codes.${CAMPUS_CODES.PHOTO_TOO_LARGE}`);
      }

      await createMoment.mutateAsync({
        fileUri: photo.uri,
        contentType: photo.mime,
        sizeBytes,
        body: {
          mode,
          latitude: presence.fix.latitude,
          longitude: presence.fix.longitude,
          accuracyMeters: presence.fix.accuracyMeters,
          isMocked: presence.fix.isMocked,
          capturedAt: presence.fix.capturedAt,
        },
      });

      /**
       * ⚠️ İKİ DOSYA DA TÜKETİLDİ: yükleme bitti.
       *   • ölçeklenmiş kopya — yüklenen dosyanın kendisi,
       *   • HAM kare — eskiden onay sheet'i kapanırken unutuluyordu
       *     (`closeComposer`), o sheet kalkınca sahipsiz kaldı. Yalnız BAŞARI
       *     dalında: hata dallarında kare elde durmak zorunda (kullanıcı aynı
       *     kareyle tekrar deneyebiliyor, gerekçe fonksiyonun başında).
       */
      forgetPhoto(photo.uri);
      forgetPhoto(shot.uri);
      return null;
    } catch (err) {
      return errorTextOf(err);
    }
    },
    [
      boundary,
      createMoment,
      domain,
      errorTextOf,
      me?.photoMaxBytes,
      mode,
      t,
    ],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * "+" DOĞRUDAN KAMERAYI AÇIYOR — ve AKIŞIN TAMAMI O EKRANDA BİTİYOR.
   * ══════════════════════════════════════════════════════════════════════════
   * İstek birebir: "direkt çektiğim ekranda foto static kalsın, orada çekince
   * sonra oradan göndere basınca göndereyim, ekstra modal filan açma".
   *
   * Akış TEK ekran: `+` → kamera (ön) → deklanşör → kare pencerede DONUYOR →
   * Paylaş. Üç adım sırayla kaldırıldı:
   *   • `PhotoSourceSheet` (kamera/galeri seçimi),
   *   • kırpma ekranı (kamera zaten 3:4 çekiyor, pencere tam o kare),
   *   • onay sheet'i `CampusMomentComposer` — önizlemesi, paylaş düğmesi ve
   *     satır içi hatası kamera ekranına taşındı.
   *
   * ⚠️ GALERİ YOLU TAMAMEN KALKTI (`pickAndCropPhotos` çağrısı yok): geri
   * isteniyorsa kuralın kendisi (yalnız anlık çekim) yeniden tartışılmalı.
   */
  const captureMoment = useCallback(async () => {
    try {
      const result = await captureAndSendPhoto({
        facing: "front",
        commitLabel: t("campus.composer.share"),
        commit: shareShot,
      });

      /**
       * ⚠️ HATA YALNIZ YEDEK YOLDAN gelir (sistem kamerası — simülatör ya da
       * overlay sökülmüş). Uygulama içi kamerada metin ZATEN karenin altında
       * gösterildi; burada ikinci kez söylemek aynı hatayı iki yerde yazmak
       * olurdu. Gerekçe photoPicker > `SendShotResult`ta.
       */
      if (result.error) {
        devLog("[campus] paylaşım başarısız (yedek yol)", result.error);
        return;
      }
      if (!result.sent) return;

      /**
       * "Her zaman" iznini TAM BURADA soruyoruz — kullanıcı az önce bir an
       * paylaştı, yani yüzeyi kullandığını gösterdi. Açılışta ya da "+"ya
       * basar basmaz sormak hem niyet anından uzak hem de paylaşım akışını
       * kesiyor. Bir kez soruluyor (latch), reddedilirse bir daha sorulmuyor.
       *
       * ⚠️ KAMERA EKRANI KAPANDIKTAN SONRA: sheet, kamera katmanının ALTINDA
       * kalırdı (o katman NotifierWrapper'ın bile üstünde çiziliyor). Paylaşım
       * işinin içinde değil, bu yüzden burada.
       */
      if (userId) {
        const key = `${ASKED_KEY_PREFIX}${userId}`;
        if (!appPrefs.getBoolean(key)) {
          appPrefs.set(key, true);
          setPrimingOpen(true);
        }
      }
    } catch (err) {
      devLog("[campus] camera capture failed:", err);
    }
  }, [shareShot, t, userId]);

  // ── Karar yolu ────────────────────────────────────────────────────────────
  const [busyMomentId, setBusyMomentId] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  /**
   * BEĞEN — `/api/swipe/Like` + `source`. Kartlardaki beğeninin birebir
   * aynısı; eşleşme yanıtta gelmiyor, SignalR `MatchNotification` üzerinden
   * mevcut `MatchModal` açılıyor (bu yola hiç dokunulmuyor).
   */
  /**
   * ⚠️ SONUÇ DÖNDÜRÜYOR (`true` = karar KAYDEDİLDİ).
   *
   * Çağıran kutlamayı buna bağlıyor: istemcinin kota bayrağı yetmiyor, çünkü
   * `/campus/me` tazelenmeden atılan ikinci bir beğeniyi SUNUCU reddediyor
   * (`UT-7420`) ve kutlama o reddi göremezse kullanıcı kaydedilmemiş bir
   * kararı kaydedilmiş sanıyor (gerekçe campusMomentLikeSweep > `abort`).
   */
  const like = useCallback(
    async (moment: CampusMomentDto): Promise<boolean> => {
      if (decisionsExhausted) {
        onPaywall();
        return false;
      }
      setBusyMomentId(moment.id);
      try {
        await swipe.mutateAsync({
          direction: "right",
          userId: moment.userId,
          mode,
          source: "CampusMoment",
          momentId: moment.id,
        });
        // Kota sunucu doğrusundan gelsin — istemci düşürmüyor.
        refreshCampus();
        return true;
      } catch (err) {
        const code = campusCodeOf(err);
        lastErrorRef.current = errorTextOf(err);
        if (code === CAMPUS_CODES.DECISION_QUOTA) {
          onPaywall();
        } else if (code && CAMPUS_DROP_CARD_CODES.includes(code)) {
          /**
           * Kart SESSİZCE düşüyor, kota harcanmadı.
           *
           * `UT-7424` (zaten karar verilmiş) burada en olası kod: liste
           * süzülüyor ama kullanıcı başka bir cihazda ya da Keşif'te aynı
           * kişiyi beğenmiş olabilir. "Zaten beğenmiştin" demek gereksiz bir
           * ayrıntı; kartın gitmesi yeterli.
           */
          removeMomentFromCaches(qc, moment.id);
        }
        return false;
      } finally {
        setBusyMomentId(null);
      }
    },
    [decisionsExhausted, errorTextOf, mode, onPaywall, qc, refreshCampus, swipe],
  );

  /** GEÇ — kampüs-yerel uç; Keşif destesine DOKUNMUYOR. */
  const pass = useCallback(
    (moment: CampusMomentDto) => {
      // ⚠️ `mode` ANIN MODU, ekranın seçili modu değil: liste zaten moda göre
      // geliyor ama kart elde bayatlamışsa ikisi ayrışabilir ve sunucu
      // kararı yanlış modun altına yazardı.
      passMoment.mutate({ momentId: moment.id, mode: moment.mode ?? mode });
    },
    [mode, passMoment],
  );

  const remove = useCallback(
    (moment: CampusMomentDto) => {
      deleteMoment.mutate(moment.id);
    },
    [deleteMoment],
  );

  /**
   * ⚠️🔴 SAHTE ANLAR KALDIRILDI (istek: "test verilerini kaldır moments'ten").
   *
   * Burada `devCampusMoments(mode)` gerçek anların ARDINA ekleniyordu —
   * `__DEV__` kapılı, prod'da boş dizi dönen bir yerleşim iskelesi
   * (`campusDevMoments.ts`, dosyasıyla birlikte silindi). Tek noktadan
   * girmesinin sebebi yüzeyin çok tüketicisi olmasıydı: anların kare satırı,
   * tam ekran şerit ve haritanın sayacı hepsi BU diziyi okuyor — mock'u
   * bileşenlerden birine koymak diğerlerini boş bırakıyordu.
   *
   * Geri gerekirse kural aynı: tek nokta BURASI, gerçek anların ARDINA, ve
   * `__DEV__` kapısı şart (kalıcı bir anahtara bağlanmamalı — aylar sonra
   * "kampüste 5 kişi var" diye bakıp gerçek sanma riski).
   */
  const moments = momentsQuery.data?.items ?? [];

  return {
    /** Yüzey bu kampüste açık mı. */
    available,
    /** Kampüsün sınırı — harita poligonu bundan çiziyor (varsa). */
    boundary,
    /** Konum kampüste mi (belirsizlik kontrolünden geçmiş). */
    inside,
    /** "+" çizilsin mi. */
    canShare,
    /**
     * AKIŞIN BANDINDAKİ ipucu kartı çizilsin mi — `canShare`ın UCUZ kardeşi.
     *
     * ⚠️ İkisi karıştırılmamalı: bu, son bilinen konuma dayanan bir TAHMİN ve
     * yalnız "kampüsteysen paylaşabilirsin" ipucunu açıyor. Gerçek paylaşım
     * kapısı `canShare` (taze, yüksek doğruluklu okuma).
     */
    canShareHint: available && insideHint && !me?.postedToday,
    moments,
    loading: momentsQuery.isLoading,
    decisionsRemaining,
    /**
     * GÜNLÜK KARAR HAKKI BİTTİ Mİ.
     *
     * ⚠️ DIŞA VERİLİYOR çünkü ALEVİN KAPISI bu: hak bitmişken `like` yalnız
     * paywall açıp dönüyor, yani gönderilmiş bir beğeni yok — kutlama
     * oynasaydı kullanıcı geri alınamaz kararını harcadığını sanırdı
     * (bkz. campusMomentLikeSweep).
     */
    decisionsExhausted,
    busyMomentId,
    /** Sheet'in sonsuz listesi. */
    fetchNextPage: momentsQuery.hasNextPage
      ? momentsQuery.fetchNextPage
      : undefined,

    // Akışlar
    /**
     * "+" → DOĞRUDAN KAMERA (ön), kaynak sheet'i ve kırpıcı YOK.
     *
     * ⚠️ `openSourceSheet` / `pickFromGallery` / `pickFromCamera` üçlüsü
     * KALDIRILDI: kampüs anı anlık bir çekim olmak zorunda (gerekçe
     * `captureMoment`te). Ekranda `PhotoSourceSheet` de artık mount
     * edilmiyor.
     */
    captureMoment,

    /**
     * ⚠️ ONAY SHEET'İNİN BEŞ PROP'U KALDIRILDI: `composerOpen`,
     * `closeComposer`, `photoUri`, `shareError`, `share`.
     *
     * Hepsi kamera ekranına taşındı (istek: "ekstra modal filan açma"):
     * önizleme donmuş kare, paylaş düğmesi alt barda, hata karenin altında,
     * gönderim göstergesi düğmenin kendisinde. `CampusMomentComposer` artık
     * mount EDİLMİYOR; geri isteniyorsa `shareShot`un hata metnini DÖNDÜRDÜĞÜNÜ
     * (state'e yazmadığını) unutma.
     *
     * `sharing` de gitti: tek müşterisi o sheet'in düğmesiydi ve `createMoment
     * .isPending`i artık kamera ekranının `busy`si temsil ediyor.
     */

    primingOpen,
    closePriming: useCallback(() => setPrimingOpen(false), []),
    onPrimingGranted: useCallback(() => {
      if (boundary) {
        syncCampusGeofence(boundary).catch(() => {
          /* no-op */
        });
      }
    }, [boundary]),

    like,
    pass,
    remove,
    refreshPresence,
  };
}
