/**
 * DEV — uygulamanın gösterebildiği TÜM toast'ların kataloğu.
 *
 * Neden var: toast'lar gerçek akışların içinde doğuyor (kota bitmesi, hub
 * olayı, satın alma, moderasyon kararı). Bir metin ya da simge değişince
 * hepsini canlı görmenin tek yolu o akışları tek tek tetiklemekti — çoğu
 * sunucu durumu gerektirdiği için pratikte imkânsız. Burası o kapıyı açıyor:
 * Ayarlar → "LIT · dev" satırına BASIŞ (uzun basış teşhis raporu, o duruyor).
 *
 * Kurallar:
 * - Metinler i18n'den GERÇEK anahtarlarla geliyor, elle yazılmış kopya yok:
 *   dil değiştirip galeriyi tekrar açınca çeviriler de denenmiş oluyor.
 *   Tek istisna `notices` grubu — o metinler backend'den geliyor, burada
 *   temsilî örnek duruyor.
 * - Çağrı biçimi de gerçeğin aynısı (aynı `icon`/`variant`/başlık kombinasyonu),
 *   yani burada doğru görünen bir toast sahada da doğru görünür.
 * - Bir çağrı yeri eklendiğinde buraya da bir satır eklenmeli; katalog eksikse
 *   "hepsini gördüm" yanılgısı üretir.
 *
 * ⚠️ `__DEV__` dışında kimse import etmiyor (ekran de öyle) — release
 * bundle'ında ölü kod.
 */
import { Image as RNImage } from 'react-native';
import i18n from '@/shared/i18n';
import {
  showInfoToast,
  showLikeToast,
  showMessageToast,
  showMissedMatchToast,
} from '@/shared/services/toaster';
import type { ToastIconKind } from '@/shared/components/toaster/toastIcons';

const t = (key: string, params?: Record<string, unknown>) => i18n.t(key, params) as string;

/**
 * Avatarlı varyantların fotoğrafı — UZAK URL DEĞİL, paketin içindeki görsel.
 * Simülatör ağsızken uzak avatar hiç yüklenmez ve "fotoğraflı" varyant sessizce
 * "fotoğrafsız" varyanta dönüşürdü; ikisini ayırt edemezdin.
 */
const DEMO_PHOTO: string = RNImage.resolveAssetSource(
  require('../../../assets/icon.png'),
).uri;

const NAME = 'Deniz';

/**
 * Mesaj toast'ına dokunmak GERÇEKTEN Chat'e gidiyor (kapı notifier seviyesinde,
 * bkz. toaster.ts) — katalogdaki sahte id ile açılan sohbet boş görünür, normal.
 */
const DEMO_CONVERSATION_ID = 'dev-toast-gallery';

export type ToastCase = {
  id: string;
  /** Listede görünen ad — hangi varyant olduğunu söylemeli, metni tekrar etmemeli. */
  label: string;
  /** Toast'ı doğuran gerçek çağrı yeri (dosya) — değişiklikte nereye bakılacağı. */
  from: string;
  run: () => void;
};

export type ToastGroup = {
  title: string;
  cases: ToastCase[];
};

/** InfoToast'ın simge ailesi — hepsi tek grupta, iki temada yan yana bakılsın diye. */
const ICON_KINDS: ToastIconKind[] = [
  'like',
  'fire',
  'note',
  'recovery',
  'message',
  'check',
  'premium',
];

export const TOAST_CATALOG: ToastGroup[] = [
  {
    title: 'Mesaj (MessageToast)',
    cases: [
      {
        id: 'msg.photo',
        label: 'Fotoğraflı · kısa metin',
        from: 'AppNavigator · ReceiveMessage',
        run: () =>
          showMessageToast({
            senderName: NAME,
            photoUrl: DEMO_PHOTO,
            preview: 'Bugün kampüste miydin?',
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.noPhoto',
        label: 'Fotoğrafsız (person.fill dairesi)',
        from: 'AppNavigator · ReceiveMessage',
        run: () =>
          showMessageToast({
            senderName: NAME,
            photoUrl: null,
            preview: 'Bugün kampüste miydin?',
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.long',
        label: 'Uzun metin (satır kırpma)',
        from: 'AppNavigator · ReceiveMessage',
        run: () =>
          showMessageToast({
            senderName: 'Deniz Kaya Yılmazoğlu',
            photoUrl: DEMO_PHOTO,
            preview:
              'Az önce yazdığım şeyi unut, aslında şöyle demek istemiştim: yarın akşam müsaitsen kütüphanenin önünde buluşalım, sonra da bir şeyler içeriz.',
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.voice',
        label: 'Sesli mesaj · mikrofon + süre',
        from: 'AppNavigator · contentType 2',
        run: () =>
          showMessageToast({
            senderName: NAME,
            photoUrl: DEMO_PHOTO,
            preview: t('chat.media.voice'),
            voiceDuration: '0:12',
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.voiceLong',
        label: 'Sesli mesaj · dakikalı süre',
        from: 'AppNavigator · contentType 2',
        run: () =>
          showMessageToast({
            senderName: NAME,
            photoUrl: DEMO_PHOTO,
            preview: t('chat.media.voice'),
            voiceDuration: '1:07',
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.voiceNoDuration',
        label: 'Sesli mesaj · süre yok (metne düşüş)',
        from: 'AppNavigator · durationMs boş',
        run: () =>
          showMessageToast({
            senderName: NAME,
            photoUrl: DEMO_PHOTO,
            preview: t('chat.media.voice'),
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.photoPreview',
        label: 'Fotoğraf önizlemesi',
        from: 'AppNavigator · contentType 1',
        run: () =>
          showMessageToast({
            senderName: NAME,
            photoUrl: DEMO_PHOTO,
            preview: t('chat.media.photo'),
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
      {
        id: 'msg.noName',
        label: 'İsimsiz gönderen (fallback)',
        from: 'AppNavigator · partnerDisplayName boş',
        run: () =>
          showMessageToast({
            senderName: 'Yeni mesaj',
            photoUrl: null,
            preview: t('chat.media.newMessage'),
            conversationId: DEMO_CONVERSATION_ID,
          }),
      },
    ],
  },
  {
    title: 'Beğeni (LikeToast)',
    cases: [
      {
        id: 'like.named',
        label: 'Beğeni · isimli + fotoğraflı',
        from: 'AppNavigator · LikeReceived',
        run: () => showLikeToast({ kind: 'like', senderName: NAME, photoUrl: DEMO_PHOTO }),
      },
      {
        id: 'like.locked',
        label: 'Beğeni · kimlik kilitli (isimsiz, fotoğrafsız)',
        from: 'AppNavigator · identityLocked',
        run: () => showLikeToast({ kind: 'like', senderName: null, photoUrl: null }),
      },
      {
        id: 'like.fire',
        label: 'Fire · isimli + fotoğraflı',
        from: 'AppNavigator · isSuperLike',
        run: () => showLikeToast({ kind: 'fire', senderName: NAME, photoUrl: DEMO_PHOTO }),
      },
      {
        id: 'like.fireNoPhoto',
        label: 'Fire · isimsiz, fotoğrafsız (alev dairesi)',
        from: 'AppNavigator · isSuperLike',
        run: () => showLikeToast({ kind: 'fire', senderName: null, photoUrl: null }),
      },
      {
        id: 'like.note',
        label: 'Not · önizlemeli',
        from: 'AppNavigator · notePreview',
        run: () =>
          showLikeToast({
            kind: 'note',
            senderName: NAME,
            photoUrl: DEMO_PHOTO,
            preview: 'Bu fotoğraftaki kitap benim de favorim, nereden aldın?',
          }),
      },
      {
        id: 'like.noteNoPreview',
        label: 'Not · önizlemesiz, fotoğrafsız (CTA satırı)',
        from: 'AppNavigator · notePreview null',
        run: () => showLikeToast({ kind: 'note', senderName: null, photoUrl: null, preview: null }),
      },
    ],
  },
  {
    title: 'Kaçırılan eşleşme (MissedMatchToast)',
    cases: [
      {
        id: 'missed.named',
        label: 'İsimli + fotoğraflı',
        from: 'DiscoverScreen / LikesScreen · pass',
        run: () => showMissedMatchToast({ name: NAME, photoUrl: DEMO_PHOTO }),
      },
      {
        id: 'missed.noName',
        label: 'İsimsiz, fotoğrafsız (heart.slash dairesi)',
        from: 'DiscoverScreen · pass',
        run: () => showMissedMatchToast({ name: null, photoUrl: null }),
      },
    ],
  },
  {
    title: 'Oturum düşme (hepsi error)',
    cases: [
      {
        id: 'session.closed',
        label: 'Başka cihazdan giriş',
        from: 'AppNavigator · ForceLogout other_device',
        run: () =>
          showInfoToast({
            title: t('auth.session.closedTitle'),
            message: t('auth.session.closedMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'session.passwordChanged',
        label: 'Şifre değişti',
        from: 'AppNavigator · password_changed',
        run: () =>
          showInfoToast({
            title: t('auth.session.passwordChangedTitle'),
            message: t('auth.session.passwordChangedMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'session.emailChanged',
        label: 'E-posta değişti',
        from: 'AppNavigator · email_changed',
        run: () =>
          showInfoToast({
            title: t('auth.session.emailChangedTitle'),
            message: t('auth.session.emailChangedMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'session.expired',
        label: 'Refresh süresi doldu',
        from: 'AppNavigator · refresh_expired',
        run: () =>
          showInfoToast({
            title: t('auth.session.expiredTitle'),
            message: t('auth.session.expiredMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'session.loggedOut',
        label: 'Bu hesaptan çıkılmış',
        from: 'AppNavigator · session_logout',
        run: () =>
          showInfoToast({
            title: t('auth.session.loggedOutTitle'),
            message: t('auth.session.loggedOutMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'session.ended',
        label: 'Token yeniden kullanımı / bilinmeyen reason',
        from: 'AppNavigator · token_reuse',
        run: () =>
          showInfoToast({
            title: t('auth.session.endedTitle'),
            message: t('auth.session.endedMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'session.reverify',
        label: 'E-posta yeniden doğrulaması',
        from: 'AppNavigator · reverify',
        run: () =>
          showInfoToast({
            title: t('auth.session.reverifyTitle'),
            message: t('auth.session.reverifyMessage'),
            variant: 'error',
          }),
      },
    ],
  },
  {
    title: 'Premium / abonelik',
    cases: [
      {
        id: 'premium.purchased',
        label: 'Satın alındı (simge: premium)',
        from: 'usePurchaseFlow',
        run: () =>
          showInfoToast({
            title: t('purchase.purchasedTitle'),
            message: t('purchase.purchasedMessage'),
            icon: 'premium',
          }),
      },
      {
        id: 'premium.granted',
        label: 'Admin tanımladı (success)',
        from: 'AppNavigator · SubscriptionChanged admin_grant',
        run: () =>
          showInfoToast({
            title: t('purchase.grantedTitle'),
            message: t('purchase.grantedMessage'),
            variant: 'success',
          }),
      },
      {
        id: 'premium.revoked',
        label: 'Admin geri aldı (error)',
        from: 'AppNavigator · SubscriptionChanged admin_revoke',
        run: () =>
          showInfoToast({
            title: t('purchase.revokedTitle'),
            message: t('purchase.revokedMessage'),
            variant: 'error',
          }),
      },
    ],
  },
  {
    title: 'Fire',
    cases: [
      {
        id: 'fire.cooldown',
        label: 'Hak doldu · yenilenme süreli',
        from: 'DiscoverScreen',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.fireCooldownTitle'),
            message: t('discover.swipe.fireCooldownMessage', { time: '3 gün sonra yenilenir' }),
            icon: 'fire',
          }),
      },
      {
        id: 'fire.exhausted',
        label: 'Ücretsiz üyelikte tek hak bitti',
        from: 'DiscoverScreen',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.fireExhaustedTitle'),
            message: t('discover.swipe.fireExhaustedMessage'),
            icon: 'fire',
          }),
      },
      {
        id: 'fire.sent',
        label: 'Gönderildi · isimli',
        from: 'DiscoverScreen · flameSweep',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.fireSentTitle'),
            message: t('discover.swipe.fireSentMessage', { name: NAME }),
            icon: 'fire',
          }),
      },
      {
        id: 'fire.sentNoName',
        label: 'Gönderildi · isimsiz',
        from: 'DiscoverScreen · flameSweep',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.fireSentTitle'),
            message: t('discover.swipe.fireSentMessageNoName'),
            icon: 'fire',
          }),
      },
      {
        id: 'fire.packSuccess',
        label: 'Paket satın alındı',
        from: 'ConsumablePurchaseSheet · firePurchase',
        run: () =>
          showInfoToast({
            title: t('firePurchase.successTitle'),
            message: t('firePurchase.successMessage', { count: 5 }),
            icon: 'fire',
          }),
      },
      {
        id: 'fire.packPending',
        label: 'Paket beklemede (redeem kuyruğu)',
        from: 'ConsumablePurchaseSheet · firePurchase',
        run: () =>
          showInfoToast({
            title: t('firePurchase.pendingTitle'),
            message: t('firePurchase.pendingMessage'),
            icon: 'fire',
          }),
      },
      {
        id: 'fire.packSynced',
        label: 'Paket zaten işlenmişti',
        from: 'ConsumablePurchaseSheet · firePurchase',
        run: () =>
          showInfoToast({
            title: t('firePurchase.syncedTitle'),
            message: t('firePurchase.syncedMessage'),
            icon: 'fire',
          }),
      },
    ],
  },
  {
    title: 'Not',
    cases: [
      {
        id: 'note.sent',
        label: 'Gönderildi',
        from: 'DiscoverScreen · not gönderimi',
        run: () =>
          showInfoToast({
            title: t('note.sentTitle'),
            message: t('note.sentMessage', { name: NAME }),
            icon: 'note',
          }),
      },
      {
        id: 'note.failedGeneric',
        label: 'Gönderilemedi · jenerik',
        from: 'DiscoverScreen · noteSendCodeI18nKey',
        run: () =>
          showInfoToast({
            title: t('note.failedTitle'),
            message: t('note.codes.generic'),
            icon: 'note',
          }),
      },
      {
        id: 'note.failedNoCredit',
        label: 'Gönderilemedi · hak kalmadı (UT-6401)',
        from: 'DiscoverScreen · noteSendCodeI18nKey',
        run: () =>
          showInfoToast({
            title: t('note.failedTitle'),
            message: t('note.codes.UT-6401'),
            icon: 'note',
          }),
      },
      {
        id: 'note.packSuccess',
        label: 'Paket satın alındı',
        from: 'ConsumablePurchaseSheet · notePurchase',
        run: () =>
          showInfoToast({
            title: t('notePurchase.successTitle'),
            message: t('notePurchase.successMessage', { count: 3 }),
            icon: 'note',
          }),
      },
      {
        id: 'note.packPending',
        label: 'Paket beklemede',
        from: 'ConsumablePurchaseSheet · notePurchase',
        run: () =>
          showInfoToast({
            title: t('notePurchase.pendingTitle'),
            message: t('notePurchase.pendingMessage'),
            icon: 'note',
          }),
      },
      {
        id: 'note.packSynced',
        label: 'Paket zaten işlenmişti',
        from: 'ConsumablePurchaseSheet · notePurchase',
        run: () =>
          showInfoToast({
            title: t('notePurchase.syncedTitle'),
            message: t('notePurchase.syncedMessage'),
            icon: 'note',
          }),
      },
    ],
  },
  {
    title: 'Beğeni kotası',
    cases: [
      {
        id: 'quota.low',
        label: 'Azalıyor · süresiz',
        from: 'DiscoverScreen',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.quotaLowTitle'),
            message: t('discover.swipe.quotaLowMessage', { count: 3 }),
            icon: 'check',
          }),
      },
      {
        id: 'quota.lowTime',
        label: 'Azalıyor · süreli',
        from: 'DiscoverScreen',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.quotaLowTitle'),
            message: t('discover.swipe.quotaLowMessageWithTime', { count: 3, time: '4 sa 20 dk' }),
            icon: 'check',
          }),
      },
      {
        id: 'quota.exhausted',
        label: 'Bitti · süresiz',
        from: 'DiscoverScreen',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.quotaExhaustedTitle'),
            message: t('discover.swipe.quotaExhaustedMessage'),
            icon: 'check',
          }),
      },
      {
        id: 'quota.exhaustedTime',
        label: 'Bitti · süreli',
        from: 'DiscoverScreen',
        run: () =>
          showInfoToast({
            title: t('discover.swipe.quotaExhaustedTitle'),
            message: t('discover.swipe.quotaExhaustedMessageWithTime', { time: '4 sa 20 dk' }),
            icon: 'check',
          }),
      },
    ],
  },
  {
    title: 'Kurtarma',
    cases: [
      {
        id: 'recovery.success',
        label: 'Kurtarıldı (simge: recovery)',
        from: 'LikesScreen',
        run: () =>
          showInfoToast({
            title: t('likes.recoverSuccessTitle'),
            message: t('likes.recoverSuccessMessage'),
            icon: 'recovery',
          }),
      },
      {
        id: 'recovery.failed',
        label: 'Kurtarılamadı (mesaj sunucudan)',
        from: 'LikesScreen',
        run: () =>
          showInfoToast({
            title: t('likes.recoverFailed'),
            message: 'Bu kişiye artık ulaşılamıyor.',
            icon: 'recovery',
          }),
      },
    ],
  },
  {
    title: 'Sohbet',
    cases: [
      {
        id: 'chat.quotaMilestone',
        label: 'Mesaj hakkı eşiği (simge: message)',
        from: 'ChatScreen · milestone',
        run: () =>
          showInfoToast({
            icon: 'message',
            title: t('chat.quota.title'),
            message: t('chat.quota.message', { remaining: 5 }),
          }),
      },
      {
        id: 'chat.quotaExhausted',
        label: 'Mesaj hakkı bitti',
        from: 'ChatScreen',
        run: () =>
          showInfoToast({
            icon: 'message',
            title: t('chat.quota.exhausted'),
            message: t('chat.quota.exhaustedMessage'),
          }),
      },
      {
        id: 'chat.unmatchRestorable',
        label: 'Eşleşme kaldırıldı · geri alınabilir',
        from: 'ChatScreen / MessagesScreen',
        run: () =>
          showInfoToast({
            title: t('chat.unmatch.removedTitle'),
            message: t('chat.unmatch.removedRestorable', { time: '30 gün' }),
          }),
      },
      {
        id: 'chat.unmatchPermanent',
        label: 'Eşleşme kaldırıldı · kalıcı',
        from: 'ChatScreen / MessagesScreen',
        run: () =>
          showInfoToast({
            title: t('chat.unmatch.removedTitle'),
            message: t('chat.unmatch.removedPermanent'),
          }),
      },
      {
        id: 'chat.sendFailed',
        label: 'Gönderilemedi · başlıksız error',
        from: 'outbox.ts · gönderim hatası',
        run: () =>
          showInfoToast({ message: t('chat.send.failed'), variant: 'error' }),
      },
    ],
  },
  {
    title: 'Sesli mesaj',
    cases: [
      {
        id: 'voice.holdHint',
        label: 'Basılı tut ipucu (düz, başlıksız)',
        from: 'MessageComposer',
        run: () => showInfoToast({ message: t('chat.voice.holdHint') }),
      },
      {
        id: 'voice.maxDuration',
        label: 'Süre sınırı',
        from: 'MessageComposer',
        run: () => showInfoToast({ message: t('chat.voice.maxDuration') }),
      },
      {
        id: 'voice.permission',
        label: 'Mikrofon izni (başlıklı error)',
        from: 'MessageComposer',
        run: () =>
          showInfoToast({
            title: t('chat.voice.permissionTitle'),
            message: t('chat.voice.permissionBody'),
            variant: 'error',
          }),
      },
      {
        id: 'voice.failed',
        label: 'Kayıt başlatılamadı',
        from: 'MessageComposer',
        run: () => showInfoToast({ message: t('chat.voice.failed'), variant: 'error' }),
      },
      {
        id: 'voice.sendFailed',
        label: 'Gönderilemedi',
        from: 'outbox.ts',
        run: () => showInfoToast({ message: t('chat.voice.sendFailed'), variant: 'error' }),
      },
    ],
  },
  {
    title: 'Profil düzenleme',
    cases: [
      {
        id: 'profile.limit',
        label: 'Seçim sınırı (başlıklı error)',
        from: 'EditProfileForm',
        run: () =>
          showInfoToast({
            title: t('profile.edit.limitTitle'),
            message: t('profile.edit.limitHobbies'),
            variant: 'error',
          }),
      },
      {
        id: 'profile.nameRequired',
        label: 'Eksik bilgi · isim',
        from: 'EditProfileForm',
        run: () =>
          showInfoToast({
            title: t('profile.edit.missingInfoTitle'),
            message: t('profile.edit.nameRequired'),
            variant: 'error',
          }),
      },
      {
        id: 'profile.reorderBlocked',
        label: 'Ana foto sıralaması engellendi (moderasyon)',
        from: 'EditProfileForm',
        run: () =>
          showInfoToast({
            title: t('profile.photoModeration.reorderMainBlockedTitle'),
            message: t('profile.photoModeration.reorderMainBlockedMessage'),
            variant: 'error',
          }),
      },
      {
        id: 'profile.longError',
        label: 'Uzun hata metni (3 satır kırpma sınırı)',
        from: 'EditProfileForm · catch',
        run: () =>
          showInfoToast({
            title: t('common.error'),
            message: t('profile.edit.profileIncompleteError'),
            variant: 'error',
          }),
      },
    ],
  },
  {
    title: 'Selfie doğrulama',
    cases: [
      {
        id: 'selfie.generic',
        label: 'Jenerik hata',
        from: 'SelfieVerificationOverlay',
        run: () =>
          showInfoToast({ message: t('profile.selfie.errors.generic'), variant: 'error' }),
      },
      {
        id: 'selfie.rateLimited',
        label: 'Çok fazla deneme (UT-6504)',
        from: 'SelfieVerificationOverlay',
        run: () => showInfoToast({ message: t('profile.selfie.codes.UT-6504'), variant: 'error' }),
      },
      {
        id: 'selfie.consent',
        label: 'Rıza eksik (UT-6501, uzun metin)',
        from: 'SelfieVerificationOverlay',
        run: () => showInfoToast({ message: t('profile.selfie.codes.UT-6501'), variant: 'error' }),
      },
    ],
  },
  {
    title: 'Davet & kayıt',
    cases: [
      {
        id: 'referral.valid',
        label: 'Kod geçerli (simge: note)',
        from: 'RegisterReferralScreen',
        run: () =>
          showInfoToast({
            title: t('auth.referral.validTitle'),
            message: t('auth.referral.valid'),
            icon: 'note',
          }),
      },
      {
        id: 'referral.invalid',
        label: 'Kod bulunamadı (error)',
        from: 'RegisterReferralScreen',
        run: () =>
          showInfoToast({
            title: t('auth.referral.invalidTitle'),
            message: t('auth.referral.invalid'),
            variant: 'error',
          }),
      },
      {
        id: 'referral.copied',
        label: 'Kod kopyalandı (success)',
        from: 'referralShare.ts',
        run: () => showInfoToast({ message: t('referral.copied'), variant: 'success' }),
      },
      {
        id: 'referral.welcomeGift',
        label: 'Davet hediyesi işlendi',
        from: 'RegisterStep15Screen',
        run: () => showInfoToast({ message: t('referral.welcomeGift'), variant: 'success' }),
      },
      {
        id: 'register.required',
        label: 'Zorunlu alan (başlıklı error)',
        from: 'RegisterStep14Screen',
        run: () =>
          showInfoToast({
            title: t('common.error'),
            message: t('auth.step14.requiredError'),
            variant: 'error',
          }),
      },
      {
        id: 'register.prompts',
        label: 'Sorular zorunlu (başlıksız, düz)',
        from: 'RegisterStep17Screen',
        run: () => showInfoToast({ message: t('profile.prompts.requiredForRegister') }),
      },
    ],
  },
  {
    title: 'Şifre / e-posta',
    cases: [
      {
        id: 'auth.resend',
        label: 'Yeni kod gönderildi (success)',
        from: 'ChangePasswordScreen / ChangeEmailScreen',
        run: () =>
          showInfoToast({ message: t('auth.password.change.resendSuccess'), variant: 'success' }),
      },
      {
        id: 'auth.passwordChanged',
        label: 'Şifre güncellendi (başlıklı success)',
        from: 'ChangePasswordScreen',
        run: () =>
          showInfoToast({
            title: t('auth.password.change.successTitle'),
            message: t('auth.password.change.successMessage'),
            variant: 'success',
          }),
      },
    ],
  },
  {
    title: 'Filtreler',
    cases: [
      {
        id: 'filter.hobbyLimit',
        label: 'Tercih edilen hobi sınırı',
        from: 'FilterModal',
        run: () =>
          showInfoToast({
            title: t('discover.filters.preferredHobbies.limitTitle'),
            message: t('discover.filters.preferredHobbies.limitMsg', { max: 5 }),
            variant: 'error',
          }),
      },
    ],
  },
  {
    title: 'Bekleyen haberler (metin backend’den)',
    cases: [
      {
        id: 'notice.premiumGift',
        // Sahada dokunma Lit Plus'ı açıyor; katalogda hedef bilerek boş —
        // galeriden çıkmadan "dokunulabilir toast" halini görmek için.
        label: 'Premium hediyesi · dokunulabilir (hedef boş)',
        from: 'pendingNoticesService',
        run: () =>
          showInfoToast({
            title: 'Premium hediyen hazır',
            message: 'Sana 7 günlük Lit Plus tanımlandı. Dokun ve neler açıldığına bak.',
            icon: 'premium',
            onPress: () => {},
          }),
      },
      {
        id: 'notice.fire',
        label: 'Yokken gelen Fire',
        from: 'pendingNoticesService',
        run: () =>
          showInfoToast({
            title: 'Sen yokken Fire aldın',
            message: '2 kişi sana Fire gönderdi.',
            icon: 'fire',
          }),
      },
      {
        id: 'notice.note',
        label: 'Yokken gelen not',
        from: 'pendingNoticesService',
        run: () =>
          showInfoToast({
            title: 'Sana not bırakıldı',
            message: 'Fotoğrafına bir not yazıldı.',
            icon: 'note',
          }),
      },
    ],
  },
  {
    title: 'Simge kapsamı (ToastIconKind)',
    cases: ICON_KINDS.map((kind) => ({
      id: `icon.${kind}`,
      label: `icon: ${kind}`,
      from: 'toastIcons.tsx',
      // Metin bilerek aynı: daireler ve glifler yan yana karşılaştırılabilsin,
      // fark yalnızca simgeden gelsin.
      run: () =>
        showInfoToast({
          title: `Simge: ${kind}`,
          message: 'Daire dolgusu ve glif bu simge için böyle çiziliyor.',
          icon: kind,
        }),
    })),
  },
];

/** Düz liste — "hepsini oynat" ve sayaç için. */
export const ALL_TOAST_CASES: ToastCase[] = TOAST_CATALOG.flatMap((g) => g.cases);
