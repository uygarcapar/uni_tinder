/**
 * Not composer'ının HEDEF ÖNİZLEMESİ.
 *
 * Test edilen şey "neye yazdığımı bilmiyorum": composer kartı kapatarak
 * açılıyor (akışta kart hiç açılmıyor bile), yani ekranda notun hedefini
 * söyleyen tek şey bu önizleme. Üç hedefin üçü de kutunun AYNI köşesinde,
 * AYNI kadar içine girerek duruyor — yazının başladığı yer hedefe göre
 * kaymamalı, yoksa her hedefte farklı bir kutu hissi doğuyor.
 */

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any, _cfg?: any, cb?: any) => {
      cb?.(true);
      return v;
    },
    runOnJS: (fn: any) => fn,
    Easing: { out: (fn: any) => fn, quad: (t: any) => t },
  };
});
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
    Path: () => null,
    Circle: () => null,
  };
});
jest.mock('@/shared/components/SFIcon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => React.createElement(View, { testID: `sficon-${name}` }),
  };
});
// ⚠️ `AppModalScrollContext` de mock'lanmak ZORUNDA: `useKeyboardAwareField`
// onu `useContext`e veriyor ve mock'ta yoksa `useContext(undefined)` patlıyor.
// Değeri null — composer klavye kaydırmasını test etmiyor.
jest.mock('@/shared/components/AppModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    SHEET_TOP_RADIUS_LARGE: 44,
    AppModalScrollContext: React.createContext(null),
    default: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'app-modal' }, children) : null,
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const { TextInput } = require('react-native');
  return { BottomSheetTextInput: TextInput };
});

import { render, screen } from '@testing-library/react-native';
import NoteComposerModal from '@/features/discover/components/NoteComposerModal';
import {
  photoNoteTarget,
  postNoteTarget,
} from '@/features/discover/noteTarget';

const POST_BODY = 'Yarın kütüphane kaçta açılıyor?';

const inputBoxPadding = () => {
  const box = screen.getByTestId('note-input-box');
  return (box.props.style as { paddingTop: number }).paddingTop;
};

describe('gönderi hedefi', () => {
  it('gönderi chip’i çiziliyor ve gönderi metnini taşıyor', () => {
    render(
      <NoteComposerModal
        visible
        target={postNoteTarget('p1')}
        postPreview={{ body: POST_BODY }}
        onClose={jest.fn()}
        onSend={jest.fn()}
      />,
    );
    expect(screen.getByTestId('note-post-chip')).toBeTruthy();
    expect(screen.getByText(POST_BODY)).toBeTruthy();
  });

  it('foto hedefinde gönderi chip’i çizilmiyor', () => {
    render(
      <NoteComposerModal
        visible
        target={photoNoteTarget(0)}
        photoUri="https://example.test/a.jpg"
        onClose={jest.fn()}
        onSend={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('note-post-chip')).toBeNull();
  });

  it('gönderi hedefinde yazı alanı ÖNİZLEMELİ üst payı alıyor (foto hedefiyle aynı)', () => {
    render(
      <NoteComposerModal
        visible
        target={postNoteTarget('p1')}
        postPreview={{ body: POST_BODY }}
        onClose={jest.fn()}
        onSend={jest.fn()}
      />,
    );
    const withPost = inputBoxPadding();

    screen.unmount();
    render(
      <NoteComposerModal
        visible
        target={photoNoteTarget(0)}
        photoUri="https://example.test/a.jpg"
        onClose={jest.fn()}
        onSend={jest.fn()}
      />,
    );
    expect(withPost).toBe(inputBoxPadding());
  });

  it('önizleme verilmezse chip çizilmiyor — boş bir kutu taşması olmuyor', () => {
    render(
      <NoteComposerModal
        visible
        target={postNoteTarget('p1')}
        onClose={jest.fn()}
        onSend={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('note-post-chip')).toBeNull();
  });
});
