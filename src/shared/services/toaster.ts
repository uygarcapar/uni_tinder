import { Notifier } from 'react-native-notifier';
import i18n from '@/shared/i18n';
import { navigationRef } from '@/shared/services/navigationRef';
import MessageToast, { MessageToastProps } from '@/shared/components/toaster/MessageToast';
import LikeToast, { LikeToastProps } from '@/shared/components/toaster/LikeToast';
import InfoToast, { InfoToastProps } from '@/shared/components/toaster/InfoToast';
import MissedMatchToast, {
  MissedMatchToastProps,
} from '@/shared/components/toaster/MissedMatchToast';

const DEFAULT_DURATION = 4000;

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
    duration: DEFAULT_DURATION,
    swipeEnabled: true,
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
    duration: DEFAULT_DURATION,
    swipeEnabled: true,
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
    duration: DEFAULT_DURATION,
    swipeEnabled: true,
  });
}

export function showInfoToast(arg: InfoToastProps) {
  Notifier.showNotification({
    Component: InfoToast,
    componentProps: arg,
    duration: DEFAULT_DURATION,
    swipeEnabled: true,
  });
}
