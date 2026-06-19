import { forwardRef } from "react";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Lib'in resmi chat rehberindeki VirtualizedListScrollView pattern'i.
// offset semantiği: "scroll-view bottom ile screen bottom arasındaki sabit mesafe".
// FlatList full-screen + MessageInput KSV ile keyboard - insets.bottom kadar lift
// ediliyor → KSV piecewise mantığı insets.bottom'ı keyboard ile yutuyor; lib'in de
// aynısını yapması için offset = insets.bottom.
// Sonuç: keyboard açıkken contentInset.top = keyboard - insets.bottom → mesajların
// klavye altına geçmesi engellenir, bar opak tepesi ile hizalanır.
const ChatScrollComponent = forwardRef((props, ref) => {
  const { bottom } = useSafeAreaInsets();
  return (
    <KeyboardChatScrollView
      ref={ref}
      {...props}
      inverted
      keyboardLiftBehavior="always"
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={bottom}
    />
  );
});

export default ChatScrollComponent;
