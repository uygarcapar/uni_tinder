import type { ToastIconKind } from "@/shared/components/toaster/toastIcons";

/**
 * Uygulama içi "hakkın geldi" haberleri — SAF MANTIK.
 *
 * Neden var: ödüller ve hediyeler kullanıcı uygulamadayken verilmiyor (davet
 * edilen kayıt olduğu an ödül; admin'in kayıttan sonra verdiği ön kayıt Lit Plus
 * hediyesi). Push tek kanal olsaydı izni kapalı ya da bildirimi kaçırmış kullanıcı
 * hakkının geldiğini hiç öğrenmezdi. Backend "görüldü" işaretini tutuyor;
 * uygulama her açılışta `GET /api/notices/unseen` sorup bir kez gösteriyor ve
 * işaretliyor. İşaret sunucuda: hangi cihazdan girilirse girilsin haber tek sefer.
 *
 * Bağımlılıklar DIŞARIDAN (api, toast, navigasyon, zamanlayıcı): bu modül jest'te
 * axios/notifier zincirini çekmeden test edilebilsin. Gerçek bağlantı
 * `pendingNoticesService.ts`te. Sözleşme: docs/frontend_pending_notices_guide.md.
 */

export type PendingNoticeKind = "ReferralReward" | "PremiumGift";

export interface PendingNotice {
  kind: PendingNoticeKind;
  /** Tür içinde kimlik — işaretlerken aynen geri gider. */
  key: string;
  /** Simge: "Premium" ya da ödül türü (VisibilityFilter/SuperLike/Note). */
  type: string;
  /** Sunucuda, kullanıcının dilinde üretiliyor. */
  title: string;
  body: string;
  occurredAt: string;
}

export interface PendingNoticeRef {
  kind: PendingNoticeKind;
  key: string;
}

const KINDS: readonly PendingNoticeKind[] = ["ReferralReward", "PremiumGift"];

/**
 * Sunucu cevabını alan alan okur. Bilinmeyen tür ve bozuk satır ATILIYOR, tüm
 * cevap değil: ileride yeni bir tür geldiğinde eski sürüm onu sessizce geçmeli,
 * bir haberin metni eksik diye diğerleri kaybolmamalı.
 */
export function parsePendingNotices(raw: any): PendingNotice[] {
  const list = raw?.isSuccess && Array.isArray(raw.result) ? raw.result : [];
  return list
    .filter(
      (n: any) =>
        KINDS.includes(n?.kind) &&
        typeof n?.key === "string" &&
        n.key.length > 0 &&
        typeof n?.title === "string" &&
        n.title.length > 0 &&
        typeof n?.body === "string" &&
        n.body.length > 0,
    )
    .map((n: any) => ({
      kind: n.kind,
      key: n.key,
      type: typeof n.type === "string" ? n.type : "",
      title: n.title,
      body: n.body,
      occurredAt: typeof n.occurredAt === "string" ? n.occurredAt : "",
    }));
}

/** Haberin ürün simgesi — toast diğer SuperLike/not/premium bildirimleriyle aynı dili konuşsun. */
export function noticeToastIcon(notice: PendingNotice): ToastIconKind {
  if (notice.kind === "PremiumGift") return "premium";
  switch (notice.type) {
    case "SuperLike":
      return "superLike";
    case "Note":
      return "note";
    default:
      // Görünürlük filtresi premium bir ayrıcalık; simgesi de o.
      return "premium";
  }
}

export interface NoticeBanner {
  /** Ekranda gösterilecek haber. */
  display: PendingNotice;
  /** Bu banner'la görüldü sayılacak kayıtlar. */
  refs: PendingNoticeRef[];
}

/**
 * Haberleri banner'lara böler:
 *  - Her hediye kendi banner'ı.
 *  - Davet ödülleri TEK banner: en yüksek kademe gösterilir, hepsi işaretlenir
 *    (ayrıntı davet sayfasındaki ödül listesinde).
 * Sıra: hediyeler önce, sonra davet — sunucunun sırasıyla aynı.
 */
export function toBanners(notices: PendingNotice[]): NoticeBanner[] {
  const banners: NoticeBanner[] = notices
    .filter((n) => n.kind === "PremiumGift")
    .map((n) => ({ display: n, refs: [{ kind: n.kind, key: n.key }] }));

  const rewards = notices.filter((n) => n.kind === "ReferralReward");
  if (rewards.length > 0) {
    const tierOf = (n: PendingNotice) => Number.parseInt(n.key, 10) || 0;
    const top = rewards.reduce((a, b) => (tierOf(b) > tierOf(a) ? b : a));
    banners.push({ display: top, refs: rewards.map((n) => ({ kind: n.kind, key: n.key })) });
  }

  return banners;
}

export interface PendingNoticeDeps {
  fetchUnseen: () => Promise<unknown>;
  markSeen: (items: PendingNoticeRef[]) => Promise<unknown>;
  show: (notice: PendingNotice, onPress: () => void) => void;
  /** Banner'a dokununca: hediye → Lit Plus sayfası, ödül → davet sayfası. */
  open: (notice: PendingNotice) => void;
  /** Hediye/ödül bakiye, premium ve profil durumunu değiştiriyor — tazelenmeli. */
  refresh: () => void;
  /** Sonraki banner'ı geciktirmek için (testte sahte zamanlayıcı). */
  schedule: (fn: () => void, ms: number) => void;
}

/**
 * Banner'lar arası boşluk: toast ekranda ~5 sn duruyor (toaster BANNER_MOTION),
 * ikincisi birincinin üstüne binip onu kesmesin.
 */
export const BANNER_GAP_MS = 5500;

/**
 * Kontrol + push'tan açılan haber için işaretleme.
 *
 * Kurallar:
 *  - Aynı anda TEK kontrol: soğuk açılış ile ön plana gelme üst üste binebiliyor.
 *  - Her banner için ÖNCE göster, SONRA işaretle. İşaretleme ağda düşerse haber
 *    bir sonraki açılışta tekrar gösterilir — hiç görmemekten iyi.
 *  - Bu oturumda gösterilen ya da push'tan açılan (`markSeen`) kayıt tekrar
 *    gösterilmez; aynı anda koşan kontrol ikinci bir banner çıkarmasın.
 */
export function createPendingNotices(deps: PendingNoticeDeps, gapMs = BANNER_GAP_MS) {
  const seenThisSession = new Set<string>();
  const id = (kind: string, key: string) => `${kind}:${key}`;
  let inFlight = false;

  const markSeen = (kind: PendingNoticeKind, rawKey: unknown) => {
    const key = rawKey == null ? "" : String(rawKey).trim();
    if (!key) return;
    seenThisSession.add(id(kind, key));
    deps.markSeen([{ kind, key }]).catch(() => {});
  };

  const check = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const pending = parsePendingNotices(await deps.fetchUnseen()).filter(
        (n) => !seenThisSession.has(id(n.kind, n.key)),
      );
      if (pending.length === 0) return;

      const banners = toBanners(pending);
      banners.forEach((b) => b.refs.forEach((r) => seenThisSession.add(id(r.kind, r.key))));
      deps.refresh();

      banners.forEach((banner, index) => {
        const present = () => {
          deps.show(banner.display, () => deps.open(banner.display));
          deps.markSeen(banner.refs).catch(() => {});
        };
        if (index === 0) present();
        else deps.schedule(present, gapMs * index);
      });
    } catch {
      // Sessiz: bu bir kutlama haberi, akışı kesecek bir hata değil. Bir sonraki
      // açılış yeniden sorar.
    } finally {
      inFlight = false;
    }
  };

  return { check, markSeen };
}
