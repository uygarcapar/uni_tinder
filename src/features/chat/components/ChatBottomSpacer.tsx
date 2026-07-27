import { View } from "react-native";
import { useAppSelector } from "@/shared/hooks/redux";
import TypingIndicator from "@/features/chat/components/TypingIndicator";
import { colors } from "../../../shared/theme/colors";

type Props = {
  conversationId: string;
  myUserId?: string;
};

/**
 * Typing göstergesi satırı. Selector'ı ChatScreen'de değil BURADA tutuyoruz:
 * karşı taraf yazmaya başlayıp bıraktıkça sadece bu küçük satır re-render olur,
 * ChatScreen + FlashList değil.
 */
export function ChatTypingRow({ conversationId, myUserId }: Props) {
  const partnerTyping = useAppSelector((s: any) => {
    const map = s.chat.typingByConv[conversationId];
    if (!map) return false;
    for (const uid in map) if (uid !== myUserId) return true;
    return false;
  });

  if (!partnerTyping) return null;

  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
      <TypingIndicator color={colors.text} />
    </View>
  );
}

/**
 * Listenin son item'ı: input bar'ın kapladığı alan kadar boşluk (+ üstünde typing
 * göstergesi).
 *
 * Bu boşluk BİLEREK `contentContainerStyle.paddingBottom` yerine gerçek bir liste
 * item'ı olarak duruyor. FlashList v2'nin `maintainVisibleContentPosition.
 * startRenderingFromBottom` hizalaması içeriği şu marjinle aşağı itiyor:
 *
 *   marginTop = max(0, listeYüksekliği − itemlarınYüksekliği − paddingTop)
 *
 * Bu hesap contentContainer'ın paddingBottom'ını (ve ListFooterComponent'i) HESABA
 * KATMIYOR. Boşluk padding olarak verilince az mesajlı sohbette itemlar ekranın en
 * dibine hizalanıyordu → son mesaj input bar'ın altında kalıyor, üstelik padding
 * kadar (66 + safe area) sahte scroll boşluğu doğduğu için parmakla aşağı çekilince
 * orada takılı kalıyordu. Item olarak verilince boşluk itemlarınYüksekliği'ne dahil
 * oluyor: son mesaj bar'ın tam üstünde duruyor ve kısa içerikte liste hiç kaymıyor.
 */
export default function ChatBottomSpacer({
  conversationId,
  myUserId,
  height,
}: Props & { height: number }) {
  return (
    <View style={{ paddingBottom: height }}>
      <ChatTypingRow conversationId={conversationId} myUserId={myUserId} />
    </View>
  );
}
