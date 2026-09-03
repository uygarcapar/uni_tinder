import { Easing } from 'react-native';
import { Notifier } from 'react-native-notifier';
import i18n from '@/shared/i18n';
import { navigationRef } from '@/shared/services/navigationRef';
import MessageToast, { MessageToastProps } from '@/shared/components/toaster/MessageToast';
import LikeToast, { LikeToastProps } from '@/shared/components/toaster/LikeToast';
import InfoToast, { InfoToastProps } from '@/shared/components/toaster/InfoToast';
import MissedMatchToast, {
  MissedMatchToastProps,
} from '@/shared/components/toaster/MissedMatchToast';

/**
 * Toast hareketi — iOS bildirim banner'ının ölçüleri. TEK KAYNAK: dört toast da
 * bunu yayıyor, tek tek `duration` geçmiyor.
 *
 * DİKKAT — bu değerler Apple'ın YAYIMLANMIŞ sabitleri değil (öyle bir belge
 * yok); sistem banner'ına bakarak yaklaştırıldı. Ayarlarken de referans o:
 * yan yana bir bildirim düşür, farkı gözle karşılaştır.
 *
 * Giriş eğrisi neden bir yay DEĞİL: notifier `translateY`'yi
 * `[MIN_TRANSLATE_Y, MAX_TRANSLATE_Y]` = `[-1000, 0]` aralığına interpolate
 * ederken `extrapolate: 'clamp'` uyguluyor (bkz. Notifier.js). Yani `Easing.back`
 * gibi hedefi AŞAN bir eğri verirsen taşan kısım çizilmiyor — banner 0'da
 * sertçe duruyor ve yay hissi yerine bir "takılma" oluyor. Sistem banner'ı da
 * zaten kritik sönümlü: aşmadan, uzun bir yavaşlamayla yerine oturuyor.
 * Bezier (0.32, 0.72, 0, 1) Apple'ın kendi malzemelerinde kullandığı bu
 * hissin eğrisi.
 *
 * Çıkış girişten HIZLI ve ters yönde: banner geri çekilirken oyalanmıyor,
 * hızlanarak ekranın dışına akıyor.
 */
const BANNER_MOTION = {
  /** Ekranda kalma süresi. Sistem banner'ı ~5sn duruyor; bizde 4sn'ydi. */
  duration: 5000,
  showAnimationDuration: 450,
  showEasing: Easing.bezier(0.32, 0.72, 0, 1),
  hideAnimationDuration: 300,
  hideEasing: Easing.bezier(0.4, 0, 1, 1),
  /** Parmakla yukarı atınca: kendi kendine kapanmaktan daha çevik. */
  swipeAnimationDuration: 220,
  swipeEasing: Easing.bezier(0.4, 0, 1, 1),
} as const;

type ShowMessageToastArg = Omit<MessageToastProps, 'onPress'> & {
  conversationId: string;
  partnerUserId?: string;
};

export function showMessageToast({
  senderName,
  photoUrl,
  preview,
  conversationId,
  partnerUserId,
}: ShowMessageToastArg) {
  const goToChat = () => {
    if (!navigationRef.isReady()) return;
    Notifier.hideNotification();
    navigationRef.navigate('Chat' as never, {
      conversationId,
      partner: partnerUserId
        ? { userId: partnerUserId, displayName: senderName, profileImageUrl: photoUrl ?? undefined }
        : undefined,
      isActive: true,
    } as never);
  };

  Notifier.showNotification({
    Component: MessageToast,
    componentProps: { senderName, photoUrl, preview, onPress: goToChat } as MessageToastProps,
    swipeEnabled: true,
    ...BANNER_MOTION,
  });
}

type ShowLikeToastArg = Omit<LikeToastProps, 'onPress'>;

export function showLikeToast(arg: ShowLikeToastArg) {
  const goToLikes = () => {
    if (!navigationRef.isReady()) return;
    Notifier.hideNotification();
    navigationRef.navigate('HomeTabs' as never, { screen: 'Likes' } as never);
  };

  Notifier.showNotification({
    Component: LikeToast,
    componentProps: { ...arg, onPress: goToLikes } as LikeToastProps,
    swipeEnabled: true,
    ...BANNER_MOTION,
  });
}

/**
 * Seni beğenmiş birini pass'ledin → "bir eşleşmeyi kaçırdın".
 * Metin burada çözülüyor: çağıranlar (swipe handler'ları) hook context'inde
 * olmayabiliyor, `t` yerine i18n instance'ı kullanılıyor.
 */
export function showMissedMatchToast({
  name,
  photoUrl,
}: Pick<MissedMatchToastProps, 'name' | 'photoUrl'>) {
  Notifier.showNotification({
    Component: MissedMatchToast,
    componentProps: {
      name,
      photoUrl,
      title: i18n.t('missedMatch.title'),
      body: name
        ? i18n.t('missedMatch.body', { name })
        : i18n.t('missedMatch.bodyNoName'),
    } as MissedMatchToastProps,
    swipeEnabled: true,
    ...BANNER_MOTION,
  });
}

export function showInfoToast(arg: InfoToastProps) {
  Notifier.showNotification({
    Component: InfoToast,
    componentProps: arg,
    swipeEnabled: true,
    ...BANNER_MOTION,
  });
}
