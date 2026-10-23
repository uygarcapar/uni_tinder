import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/shared/hooks/redux";
import { appPrefs } from "@/shared/utils/appPrefs";
import { devLog } from "@/shared/utils/devLog";
import { pickAndCropPhotos, captureAndCropPhoto } from "@/shared/utils/photoPicker";
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
import { resolveCampusPresence } from "./campusPresence";
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
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [primingOpen, setPrimingOpen] = useState(false);

  /** Paylaşım kapısı: açık + kampüste + bugün paylaşmamış. */
  const canShare = available && inside && !me?.postedToday;

  const openSourceSheet = useCallback(() => {
    setShareError(null);
    setSourceSheetOpen(true);
  }, []);

  const handlePicked = useCallback((picked: { uri: string; mime: string } | null) => {
    if (!picked) return;
    setPhoto(picked);
    setComposerOpen(true);
  }, []);

  /**
   * ⚠️ Seçiciler sheet KAPANDIKTAN SONRA açılıyor (PhotoSourceSheet'in kuralı):
   * gorhom kapanma animasyonundayken PHPicker sunmak iOS'ta "already
   * presenting" no-op'una düşüyor.
   */
  const pickFromGallery = useCallback(async () => {
    try {
      const photos = await pickAndCropPhotos(1);
      handlePicked(photos?.[0] ?? null);
    } catch (err) {
      devLog("[campus] gallery pick failed:", err);
    }
  }, [handlePicked]);

  const pickFromCamera = useCallback(async () => {
    try {
      const picked = await captureAndCropPhoto();
      handlePicked(picked);
    } catch (err) {
      devLog("[campus] camera capture failed:", err);
    }
  }, [handlePicked]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setShareError(null);
    if (photo?.uri) forgetPhoto(photo.uri);
    setPhoto(null);
  }, [photo?.uri]);

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

  const share = useCallback(async () => {
    if (!photo?.uri) return;
    setShareError(null);
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
        setShareError(t(`campus.codes.${CAMPUS_CODES.OUT_OF_CAMPUS}`));
        setInside(false);
        return;
      }

      const file = new File(photo.uri);
      const sizeBytes = Number(file.size ?? 0);
      if (!sizeBytes) {
        setShareError(t("campus.codes.generic"));
        return;
      }
      /**
       * Boyut kapısı İSTEMCİDE DE var.
       *
       * Sunucu zaten 1. adımda (upload-url) reddediyor, yani bant genişliği
       * çöpe gitmiyor — ama kullanıcının EMEĞİ gidiyor: fotoğrafı seçti,
       * kırptı, "paylaş"a bastı ve ancak o anda "çok büyük" duydu. Sınır
       * `/me`den geliyor; alan yoksa kontrol YAPILMIYOR (uydurma bir tavan
       * koymaktansa sunucunun reddetmesi doğru).
       */
      const maxBytes = me?.photoMaxBytes ?? null;
      if (maxBytes && sizeBytes > maxBytes) {
        setShareError(t(`campus.codes.${CAMPUS_CODES.PHOTO_TOO_LARGE}`));
        return;
      }

      await createMoment.mutateAsync({
        fileUri: photo.uri,
        contentType: photo.mime || "image/jpeg",
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

      closeComposer();

      /**
       * "Her zaman" iznini TAM BURADA soruyoruz — kullanıcı az önce bir an
       * paylaştı, yani yüzeyi kullandığını gösterdi. Açılışta ya da "+"ya
       * basar basmaz sormak hem niyet anından uzak hem de paylaşım akışını
       * kesiyor. Bir kez soruluyor (latch), reddedilirse bir daha sorulmuyor.
       */
      if (userId) {
        const key = `${ASKED_KEY_PREFIX}${userId}`;
        if (!appPrefs.getBoolean(key)) {
          appPrefs.set(key, true);
          setPrimingOpen(true);
        }
      }
    } catch (err) {
      setShareError(errorTextOf(err));
    }
  }, [
    boundary,
    closeComposer,
    createMoment,
    domain,
    errorTextOf,
    me?.photoMaxBytes,
    mode,
    photo,
    t,
    userId,
  ]);

  // ── Karar yolu ────────────────────────────────────────────────────────────
  const [busyMomentId, setBusyMomentId] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  /**
   * BEĞEN — `/api/swipe/Like` + `source`. Kartlardaki beğeninin birebir
   * aynısı; eşleşme yanıtta gelmiyor, SignalR `MatchNotification` üzerinden
   * mevcut `MatchModal` açılıyor (bu yola hiç dokunulmuyor).
   */
  const like = useCallback(
    async (moment: CampusMomentDto) => {
      if (decisionsExhausted) {
        onPaywall();
        return;
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
    moments,
    loading: momentsQuery.isLoading,
    decisionsRemaining,
    busyMomentId,
    /** Sheet'in sonsuz listesi. */
    fetchNextPage: momentsQuery.hasNextPage
      ? momentsQuery.fetchNextPage
      : undefined,

    // Akışlar
    openSourceSheet,
    sourceSheetOpen,
    closeSourceSheet: useCallback(() => setSourceSheetOpen(false), []),
    pickFromGallery,
    pickFromCamera,

    composerOpen,
    closeComposer,
    photoUri: photo?.uri ?? null,
    sharing: createMoment.isPending,
    shareError,
    share,

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
