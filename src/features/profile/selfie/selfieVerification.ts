import i18n from '@/shared/i18n';

/**
 * Selfie doğrulama — kullanıcı ön kameradan sunucunun SEÇTİĞİ 2 hareketi yapar,
 * hareket başına TEK kare gönderilir, backend kareleri ana fotoğrafla
 * karşılaştırıp `isSelfieVerified` rozetini verir.
 *
 * 🔴 BU BİR KİMLİK DOĞRULAMASI DEĞİL. Çözdüğü şey "başkasının fotoğraflarıyla
 * profil açan kişi"; kararlı bir saldırgan hedefin videosunu kameraya tutarak
 * geçebilir. Bu ayrım metinlere de yansıyor: her yerde "Fotoğraf Doğrulandı",
 * hiçbir yerde "Kimlik Doğrulandı" — bkz. i18n `profile.selfie.*`.
 *
 * Sözleşme kuralları photoModeration.ts ile aynı:
 *   • alan gelmediyse `null` = BİLİNMİYOR, `false` DEĞİL
 *   • metin HER ZAMAN koddan üretilir; sunucu metni yalnız bilinmeyen kodda
 *   • durum TÜRETİLMEZ, sunucudan okunur
 */

// ── Hareketler ───────────────────────────────────────────────────────────────
// Hangi hareketlerin isteneceğini SUNUCU seçer ve saklar; istemci bunu
// değiştiremez. `code` yalnız ikon/animasyon seçmek için — ekranda gösterilen
// metin sunucudan gelen `instruction`'dır (zaten Accept-Language'e göre
// yerelleşmiş).
// ⚠️ Bu liste artık AKTİF HAVUZDAN GENİŞ. Backend'in havuzu (2026-09-09
// itibarıyla `SelfieChallengePool.Active`) YALNIZ İKİ MİMİK: `Smile` ve
// `MouthOpen`. Poz hareketleri (`TurnRight`/`TurnLeft`/`LookUp`) emekliye
// ayrıldı: `face_occluded` ortak kapısı baş çevrilince/yukarı bakılınca gölge
// ve perspektif yüzünden yüzü "kapalı" sayıp doğrulamayı tamamen bloke
// ediyordu (bkz. docs/frontend_selfie_challenge_pool_change.md).
//
// 🔴 BURADAN SİLMİYORUZ: havuz yeniden genişleyebilir (occlusion eşiği 98'e
// gevşetildi, poz hareketleri o hâlde yeniden kalibre edilecek) ve kod zaten
// bilinmeyen kodu `unknown`a düşürüyor — silmek hiçbir şey kazandırmıyor.
// Pratik sonucu: `kind === 'pose'` dalı ve `camera.hintPose` metni şu an ÖLÜ,
// her adımda `hintExpression` görünüyor.
//
// 2026-09-01 kalibrasyonunda çıkarılan ve enum'da duran diğer dört hareket:
//
//   LookDown   — selfie açısı yüzünden pitch nötrü ~+8; "aşağı bak" −5.4'te
//                kaldı, nötrden ayrışmıyor
//   TiltHead   — baş çevirmeyle aynı roll'ü üretiyor, iki hareket ayrışmıyor
//   Neutral    — "hiçbir şey yapma" bir hareket değil, herkes geçiyor
//   EyesClosed — göz kırpmayla karışıyor, yanlış-negatif riski büyük
//
// Enum'dan silinmediler (DB'de eski attempt kayıtları var) ama havuza girmiyorlar;
// bu yüzden burada da yoklar — olmayan bir koda ikon/ipucu yazmak boşa emek.
// Havuz ileride genişleyebilir, o yüzden `code` her yerde `string` kalıyor ve
// çözücülerin `default` dalı var.
export const SELFIE_CHALLENGE_CODES = [
  'TurnRight',
  'TurnLeft',
  'LookUp',
  'Smile',
  'MouthOpen',
] as const;

export type SelfieChallengeCode = (typeof SELFIE_CHALLENGE_CODES)[number];

/**
 * Hareketin türü — kamera ekranındaki ikinci ipucu satırını seçer.
 *
 * 🔴 AYRIM BACKEND'İN DEĞERLENDİRME YOLUNDAN GELİYOR, keyfi değil
 * (`SelfieChallengeEvaluator`):
 *
 *   pose (TurnRight/TurnLeft/LookUp) → `EvaluatePose`
 *     Karşı-eksen kapıları var, aşırı savrulma `challenge_too_much` döndürüyor.
 *     Yani "belirgin yap AMA ABARTMA" doğru tavsiye.
 *
 *   expression (Smile/MouthOpen)     → `EvaluateBoolSignal`
 *     `challenge_too_much` dalı HİÇ YOK — fazla gülümsemek diye bir şey yok,
 *     güven skoru artıyor sadece. Burada "abartma" demek kullanıcıyı
 *     `challenge_too_weak`e iter, yani metin zararlı olurdu.
 */
export type SelfieChallengeKind = 'pose' | 'expression' | 'unknown';

const POSE_CODES: ReadonlySet<string> = new Set(['TurnRight', 'TurnLeft', 'LookUp']);
const EXPRESSION_CODES: ReadonlySet<string> = new Set(['Smile', 'MouthOpen']);

export function selfieChallengeKind(code: string | null | undefined): SelfieChallengeKind {
  if (!code) return 'unknown';
  if (POSE_CODES.has(code)) return 'pose';
  if (EXPRESSION_CODES.has(code)) return 'expression';
  // Havuz genişlerse bilinmeyen kod gelir; genel ipucuna düşülür, ekran çökmez.
  return 'unknown';
}

/**
 * Talimatın altındaki ikinci satırın i18n anahtarı. Talimatın KENDİSİ sunucudan
 * geliyor (`challenge.instruction`) — bu yalnızca ona eşlik eden ipucu.
 *
 * Kalibrasyon `challenge_too_weak` ve `challenge_too_much`u en sık iki
 * başarısızlık olarak ölçtü; ikisi de bu satırla önlenebilir hatalar.
 *
 * Bilinmeyen kodda `null` — genel ipucu satırı zaten çiziliyor, ona düşmek aynı
 * metni iki kez göstermek olurdu. Uydurma tavsiye vermektense sessiz kalmak
 * doğru: havuz genişlediğinde yeni hareketin nasıl değerlendirildiğini bilmiyoruz.
 */
export function selfieChallengeHintKey(code: string | null | undefined): string | null {
  switch (selfieChallengeKind(code)) {
    case 'pose':
      return 'profile.selfie.camera.hintPose';
    case 'expression':
      return 'profile.selfie.camera.hintExpression';
    default:
      return null;
  }
}

export interface SelfieChallenge {
  /** Bilinmeyen kod gelebilir (backend yeni hareket ekleyebilir) — string kalıyor. */
  code: SelfieChallengeCode | string;
  /** Sunucudan yerelleştirilmiş gelir. DOĞRUDAN gösterilir, kendi tablomuz yok. */
  instruction: string;
}

export interface SelfieAttempt {
  attemptId: string;
  challenges: SelfieChallenge[];
  /** ISO, ~5 dk. Geçmişse submit `attempt_expired` döner → yeni /start. */
  expiresAt: string | null;
}

// ── Sonuç ────────────────────────────────────────────────────────────────────

// ⚠️ Backend 11 kod gönderiyor (`SelfieFailureReasons`) — listenin eksik kalması
// sessiz bir bozulma: `KNOWN_REASON_CODES.has()` false döner, gövde metni sunucu
// `message`'ına düşer (doğru metin) ama BAŞLIK jenerik "Doğrulama tamamlanamadı"
// olur ve gövdeyi yalanlar. Backend'e kod eklendiğinde buraya da eklenmeli.
export const SELFIE_REASON_CODES = [
  'challenge_not_met',
  // Poz/mimik hatasının üç yönlendirici alt sebebi (2026-09-01 kalibrasyonu):
  // hepsine "algılayamadık" demek kullanıcıyı aynı hatayı tekrarlamaya itiyordu.
  'challenge_too_weak',
  'challenge_wrong_move',
  'challenge_too_much',
  'no_face',
  'multiple_faces',
  'face_occluded',
  'low_quality',
  'face_mismatch',
  'attempt_expired',
  'analysis_failed',
  // Ana fotoğrafta (KARŞILAŞTIRMA REFERANSINDA) yüz yok — kullanıcının çektiği
  // karede değil. Backend bunu CompareFaces'ten ÖNCE ayırıyor: eskiden bu durum
  // `analysis_failed`e düşüyor ve kullanıcıya "bizden kaynaklı bir sorun,
  // birazdan tekrar dene" deniyordu. İkisi de yanlıştı — sorun bizde değildi ve
  // ana fotoğraf değişmediği sürece doğrulama HİÇBİR ZAMAN tamamlanamazdı.
  // Tek `canRetry: false` dönen başarısızlık türü.
  'reference_photo_no_face',
] as const;

export type SelfieReasonCode = (typeof SELFIE_REASON_CODES)[number];

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<string>(
  SELFIE_REASON_CODES,
);

export interface SelfieResult {
  verified: boolean;
  verifiedAt: string | null;
  reasonCode: SelfieReasonCode | string | null;
  canRetry: boolean;
  /** 1 tabanlı adım numarası; null olabilir. */
  failedAtStep: number | null;
  /**
   * Sunucunun yerelleştirilmiş metni. Gösterilebilir ama switch HER ZAMAN
   * `reasonCode` üzerinden yapılır — bu yalnız bilinmeyen kodda devreye girer
   * (bkz. selfieReasonText).
   */
  message: string | null;
}

/**
 * `/start` yanıtını okur. Şekil beklenenden farklıysa (challenge yok, id yok)
 * `null` döner — çağıran taraf akışı başlatmamalı, uydurmamalı.
 */
export function normalizeSelfieAttempt(raw: any): SelfieAttempt | null {
  const attemptId = raw?.attemptId;
  if (!attemptId || typeof attemptId !== 'string') return null;

  const rawChallenges = Array.isArray(raw?.challenges) ? raw.challenges : [];
  const challenges: SelfieChallenge[] = rawChallenges
    .map((c: any) => ({
      code: typeof c?.code === 'string' ? c.code : '',
      instruction: typeof c?.instruction === 'string' ? c.instruction : '',
    }))
    // Talimatsız bir hareket gösterilemez; kullanıcı ne yapacağını bilemez.
    .filter((c: SelfieChallenge) => c.instruction.length > 0);

  if (challenges.length === 0) return null;

  return {
    attemptId,
    challenges,
    expiresAt: typeof raw?.expiresAt === 'string' ? raw.expiresAt : null,
  };
}

/**
 * `/submit` yanıtını okur.
 *
 * 🔴 `verified: false` HATA DEĞİL — istek `200 + isSuccess: true` döner.
 * Bu fonksiyon da bu yüzden asla fırlatmaz; çağıran taraf sonucu `catch`
 * bloğunda değil normal akışta ele alır.
 */
export function normalizeSelfieResult(raw: any, message?: unknown): SelfieResult {
  const verified = raw?.verified === true;
  return {
    verified,
    verifiedAt: typeof raw?.verifiedAt === 'string' ? raw.verifiedAt : null,
    reasonCode: typeof raw?.reasonCode === 'string' ? raw.reasonCode : null,
    // Alan gelmezse: başarıda tekrar denemenin anlamı yok, başarısızlıkta var.
    canRetry: typeof raw?.canRetry === 'boolean' ? raw.canRetry : !verified,
    failedAtStep:
      typeof raw?.failedAtStep === 'number' ? raw.failedAtStep : null,
    message: typeof message === 'string' && message ? message : null,
  };
}

/**
 * `isSelfieVerified` — UserDto / GetMyProfile alanı.
 *
 * `null` = alan hiç gelmedi, yani backend'in bu sürümü YOK. Çağıran taraf
 * `false` sanmamalı: rozeti çizmemek ile "doğrulanmamış" göstermek farklı
 * şeyler, ikincisi henüz var olmayan bir özelliğe davet eder.
 *
 * ⚠️ İKİ SEVİYE de okunuyor. `GetMyProfile` bir ProfileDto döndürüyor ve
 * kullanıcı alanlarının bir kısmı (`age`, `universityName`, …) iç içe `user`
 * nesnesinde duruyor. Alan UserDto'da tanımlıysa profilin köküne çıkmıyor;
 * yalnız kökü okumak "backend'in bu sürümü yok" sonucunu veriyor ve satır
 * sessizce hiç çizilmiyor. Hangi seviyede geldiği sözleşmede sabitlenene kadar
 * ikisi de kabul: kök önce, sonra `user`.
 *
 * ⚠️ Bu alan `isVerified`'a DAHİL DEĞİL ve olmayacak — ayrı rozet.
 */
export function resolveSelfieVerified(raw: any): boolean | null {
  // 🔴 ALAN İKİ FARKLI YERDE GELİYOR, ikisi de okunmalı:
  //
  //   ProfileCardDto / UserDto  → KÖKTE     (keşif kartı, beğenenler, kaçırdıkların)
  //   ProfileDto                → `user` ALTINDA  (GET /api/profile/me)
  //
  // ProfileDto kökünde `isMailVerified` ve `isPhotoVerified` var ama
  // `isSelfieVerified` YOK — o yalnızca `User` alt nesnesinde. Yalnız kökü
  // okumak kendi profilinde her zaman `undefined` üretiyordu, yani doğrulama
  // satırı HİÇ çizilmiyordu (bkz. SelfieVerificationRow'daki `verified === null`
  // kapısı) ve akışa giriş noktası yoktu.
  //
  // `??` bilerek: kökteki `false` gerçek bir cevaptır, `user`a düşülmemeli.
  const value = raw?.isSelfieVerified ?? raw?.user?.isSelfieVerified;
  return typeof value === 'boolean' ? value : null;
}

/**
 * `selfieResetAt` — doğrulama SIFIRLANDI mı, sunucunun cevabı.
 *
 * `isSelfieVerified === false` ÜÇ durumu aynı değere düşürüyor:
 *   1. hiç doğrulanmadı
 *   2. doğrulanmıştı, ana fotoğraf değişince düştü
 *   3. doğrulandı ama elimizdeki profil henüz tazelenmedi
 *
 * Ayrımı eskiden `wasSelfieVerifiedBefore` yerel bayrağı TAHMİN ediyordu ve (3)
 * durumunu (2) sanıyordu: doğrulamayı yeni geçen kullanıcıya "ana fotoğrafın
 * değiştiği için rozet kalktı" yazıyordu — fotoğrafa hiç dokunmamışken. Ayrımı
 * artık sunucu yapıyor.
 *
 * Dönüş:
 *   string    → sıfırlandı (ISO tarih)
 *   null      → sıfırlanmadı (sunucu AÇIKÇA söyledi)
 *   undefined → alan hiç gelmedi (eski backend) → çağıran yerel bayrağa düşer
 *
 * 🔴 `??` KULLANILMAZ. `resolveSelfieVerified`'da doğru çünkü orada `false`
 * gerçek cevap. Burada `null` DA gerçek cevap; `??` onu atlayıp `user`daki eski
 * tarihe düşerdi ve kökte "sıfırlanmadı" yazarken satır "sıfırlandı" gösterirdi.
 * Bu yüzden açık `root !== undefined` kontrolü.
 */
export function resolveSelfieResetAt(raw: any): string | null | undefined {
  const root = raw?.selfieResetAt;
  const nested = raw?.user?.selfieResetAt;

  const value = root !== undefined ? root : nested;

  if (typeof value === 'string' && value.length > 0) return value;
  if (value === null) return null;
  return undefined;
}

// ── i18n ─────────────────────────────────────────────────────────────────────

/**
 * Başarısızlık metni. Sıra: bilinen kod → sunucunun yerelleştirilmiş metni →
 * jenerik. (photoModeration.moderationReasonText ile aynı desen.)
 *
 * `analysis_failed` BİZİM hatamız — metni kullanıcıyı suçlamaz.
 */
export function selfieReasonText(
  reasonCode: string | null | undefined,
  serverMessage?: string | null,
): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    return i18n.t(`profile.selfie.reason.${reasonCode}`);
  }
  if (serverMessage) return serverMessage;
  return i18n.t('profile.selfie.reason.fallback');
}

/** Sonuç ekranının başlığı. Bilinmeyen kodda jenerik başlığa düşer. */
export function selfieReasonTitle(reasonCode: string | null | undefined): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    const key = `profile.selfie.reasonTitle.${reasonCode}`;
    const translated = i18n.t(key);
    if (translated !== key) return translated;
  }
  return i18n.t('profile.selfie.reasonTitle.fallback');
}

/**
 * Kullanıcıya sormadan yeni bir `/start` alınmalı mı?
 *
 * Yalnız `attempt_expired`: kullanıcı bir şey yanlış yapmadı, süre doldu —
 * "tekrar dene" butonu göstermek gereksiz bir tık. Diğer tüm kodlarda karar
 * kullanıcınındır (her yeniden deneme saatlik 5 haktan birini yakıyor).
 */
export function isSelfieRetryAuto(reasonCode: string | null | undefined): boolean {
  return reasonCode === 'attempt_expired';
}

// ── Analytics ────────────────────────────────────────────────────────────────

/**
 * Sonucun analytics yükü. Rehber §14.3: eşik ayarının asıl girdisi "hangi
 * hareket hangi kodla düştü" — bu yüzden `reasonCode` ve `challengeCode`
 * birlikte gidiyor.
 *
 * 🔴 KARE, `similarity` VE HAM POZ DEĞERİ GÖNDERİLMEZ. `similarity` yanıtta
 * zaten yok; kare hiçbir telemetri kanalına (analytics, Sentry, crash) eklenmez.
 * Buradan çıkan her alan bir KOD ya da sayaçtır.
 *
 * ⚠️ Metin de gönderilmez: sunucu `message`'ı dile göre değişir, aynı olayı iki
 * ayrı satır gibi gösterir.
 */
export interface SelfieResultAnalytics {
  verified: boolean;
  reasonCode: string | null;
  failedAtStep: number | null;
  /** Takılınan adımdaki hareketin kodu; adım bilinmiyorsa null. */
  challengeCode: string | null;
}

export function selfieResultAnalytics(
  result: SelfieResult,
  attempt: SelfieAttempt | null,
): SelfieResultAnalytics {
  const step = result.failedAtStep;

  // `failedAtStep` 1 TABANLI. face_mismatch / analysis_failed / attempt_expired
  // durumlarında null geliyor (hata belirli bir harekete ait değil) — o zaman
  // hareket kodu da gönderilmez, uydurulmaz.
  const challenge =
    step != null && step >= 1 ? attempt?.challenges[step - 1] : undefined;

  return {
    verified: result.verified,
    reasonCode: result.reasonCode ?? null,
    failedAtStep: step,
    challengeCode: challenge?.code ?? null,
  };
}

/** `expiresAt` geçti mi. Alan yoksa `false` — sunucu nihai söz sahibi. */
export function isAttemptExpired(attempt: SelfieAttempt | null): boolean {
  if (!attempt?.expiresAt) return false;
  const at = Date.parse(attempt.expiresAt);
  return Number.isFinite(at) && at <= Date.now();
}
