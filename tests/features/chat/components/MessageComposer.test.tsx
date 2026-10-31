/**
 * `MessageComposer` düzenleme modu — Review Kritik-2'nin "gerçek bileşen
 * pini eksik" bulgusunu kapatıyor: `chatScreenEdit.test.tsx`in composer mock'u
 * YALNIZ ÇAĞRI NOKTASINI (`ChatScreen` `editing` prop'unu geçiyor mu) pinliyor,
 * `MessageComposer`in o prop'u GERÇEKTEN onurlandırdığını (gönderim sonrası
 * kendi temizliğini atladığını) hiçbir test doğrulamıyordu — aynı tür risk
 * iki kez bu dalda gerçek bir regresyona dönüştü (bkz. rapor, Kritik 1/2).
 *
 * Her şey zaten jest.setup.ts'te GLOBAL mock'lu (expo-blur, expo-glass-effect,
 * expo-haptics, react-native-keyboard-controller, masked-view, linear-gradient,
 * reanimated, `@/shared/icons`, expo-audio, expo-file-system) ve MMKV'nin kök
 * manuel mock'u (`__mocks__/react-native-mmkv.ts`) var — YENİ bir mock
 * GEREKMİYOR.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MessageComposer, {
  type ComposerApi,
} from '@/features/chat/components/MessageComposer';

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 47, left: 0, right: 0, bottom: 34 };

function renderComposer(props: any) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <MessageComposer {...props} />
    </SafeAreaProvider>,
  );
}

describe('MessageComposer — düzenleme modu (editing prop, gerçek bileşen)', () => {
  it('editing=true: gönderince kendi temizliğini ATLAR — apiRef metni korur, onDraftChange ("") ÇAĞRILMAZ', () => {
    const apiRef = { current: null as ComposerApi | null };
    const onDraftChange = jest.fn();
    // `onSend`in İÇİNDEN `ComposerApi.setText` çağrısı — `ChatScreen.
    // handleSubmitEdit`in gerçek sırasının BİREBİR aynısı: `onSend` çağrılır
    // çağrılmaz (hâlâ `handleSend`in içindeyken) ekran `preEditDraft`i geri
    // basar. Review Kritik-1'in yarıştığı iki yazı da bu TEK senkron çağrı
    // yığınında oluyor.
    const onSend = jest.fn(() => {
      apiRef.current?.setText('preEditDraft metni');
    });

    const tree = renderComposer({
      apiRef,
      editing: true,
      onSend,
      onDraftChange,
      initialText: 'düzenlenen mesaj içeriği',
    });

    fireEvent.press(tree.getByTestId('chat-btn-send'));

    expect(onSend).toHaveBeenCalledTimes(1);
    // `handleSend`in gönderim-sonrası temizliği (setText(""), draftRef->"",
    // flushDraft) ÇALIŞMADI — `onSend` içinde basılan değer AYAKTA kaldı.
    expect(apiRef.current?.getText()).toBe('preEditDraft metni');
    // `flushDraft` hiç çağrılmadı: draft'ı asla "" ile EZMEDİ.
    expect(onDraftChange).not.toHaveBeenCalledWith('');
  });

  it('kontrol grubu — editing YOKKEN (normal gönderim): metin TEMİZLENİR ve onDraftChange("") ÇAĞRILIR', () => {
    const apiRef = { current: null as ComposerApi | null };
    const onDraftChange = jest.fn();
    const onSend = jest.fn();

    const tree = renderComposer({
      apiRef,
      onSend,
      onDraftChange,
      initialText: 'yarım yazılmış mesaj',
    });

    fireEvent.press(tree.getByTestId('chat-btn-send'));

    expect(onSend).toHaveBeenCalledTimes(1);
    // Normal gönderimde composer KENDİ metnini temizler — düzenleme modunun
    // DIŞINDA bu davranış AYNI kalmalı (regresyon kontrolü).
    expect(apiRef.current?.getText()).toBe('');
    expect(onDraftChange).toHaveBeenCalledWith('');
  });
});
