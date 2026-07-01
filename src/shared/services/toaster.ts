import { Notifier } from 'react-native-notifier';
import { navigationRef } from '@/shared/services/navigationRef';
import MessageToast, { MessageToastProps } from '@/shared/components/toaster/MessageToast';
import LikeToast, { LikeToastProps } from '@/shared/components/toaster/LikeToast';
import InfoToast, { InfoToastProps } from '@/shared/components/toaster/InfoToast';

const DEFAULT_DURATION = 4000;

type ShowMessageToastArg = Omit<MessageToastProps, 'onPress'> & {
  conversationId: string;
};

export function showMessageToast({ senderName, photoUrl, preview, conversationId }: ShowMessageToastArg) {
  const goToChat = () => {
    if (!navigationRef.isReady()) return;
    Notifier.hideNotification();
    navigationRef.navigate('Chat' as never, {
      conversationId,
      partner: undefined,
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

export function showInfoToast(arg: InfoToastProps) {
  Notifier.showNotification({
    Component: InfoToast,
    componentProps: arg,
    duration: DEFAULT_DURATION,
    swipeEnabled: true,
  });
}
