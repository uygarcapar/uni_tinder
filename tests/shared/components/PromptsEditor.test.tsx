// Soru seçici modalı bu suite'in konusu değil (katalog + bottom sheet çekiyor);
// editörün kendi state akışı test ediliyor.
jest.mock('@/shared/components/PromptPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));
// Katalog ağdan geliyor; test sabit üç soruyla çalışıyor.
jest.mock('@/shared/queries/commonQueries', () => {
  const CATALOG = [
    {
      category: 'Test',
      prompts: [
        { enumName: 'A', display: { tr: 'Soru A' }, name: 'A' },
        { enumName: 'B', display: { tr: 'Soru B' }, name: 'B' },
        { enumName: 'C', display: { tr: 'Soru C' }, name: 'C' },
      ],
    },
  ];
  return {
    __esModule: true,
    usePrompts: () => ({ data: CATALOG }),
    findPrompt: (_groups: any, key: string) =>
      CATALOG[0].prompts.find((p) => p.enumName === key),
    resolveLocalized: (value: any, _lang: string, fallback = '') =>
      typeof value === 'string' ? value : value?.tr ?? fallback,
  };
});

import React, { useState } from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react-native';
import PromptsEditor from '@/shared/components/PromptsEditor';
import tr from '@/shared/i18n/translations/tr';
import type { ProfilePromptAnswer } from '@/shared/types';

const copy = tr.profile.prompts;

/**
 * Step17/EditProfileForm'un yaptığının aynısı: editör kontrollü, yayılan dizi
 * üst state'e yazılıp geri veriliyor.
 */
function Harness({
  initial,
  onEmit,
}: {
  initial: ProfilePromptAnswer[];
  onEmit: (next: ProfilePromptAnswer[]) => void;
}) {
  const [value, setValue] = useState<ProfilePromptAnswer[]>(initial);
  return (
    <PromptsEditor
      value={value}
      onChange={(next) => {
        onEmit(next);
        setValue(next);
      }}
    />
  );
}

const answersOf = (list: ProfilePromptAnswer[]) => list.map((p) => p.answer);

describe('PromptsEditor', () => {
  it('"Bitir" dokunuşunda blur ve press aynı karede gelse de cevabı kaybetmez', () => {
    const emitted: ProfilePromptAnswer[][] = [];
    render(
      <Harness
        initial={[
          { promptKey: 'A', answer: 'selam' },
          { promptKey: 'B', answer: 'okeys' },
          { promptKey: 'C', answer: '' },
        ]}
        onEmit={(next) => emitted.push(next)}
      />,
    );

    // Son slotu düzenlemeye aç ve cevabı yaz.
    fireEvent.press(screen.getAllByText(copy.editAnswer)[2]);
    fireEvent.changeText(
      screen.getAllByPlaceholderText(copy.answerPlaceholder)[2],
      'adam',
    );

    // KRİTİK: butona dokunmak önce input'u blur ediyor, sonra onPress düşüyor.
    // İkisi TEK act içinde — araya render girerse hata reprodüklenmez.
    const input = screen.getAllByPlaceholderText(copy.answerPlaceholder)[2];
    const finish = screen.getByText(copy.finishAnswer);
    act(() => {
      fireEvent(input, 'blur');
      fireEvent.press(finish);
    });

    expect(emitted.length).toBeGreaterThan(0);
    expect(answersOf(emitted[emitted.length - 1])).toEqual([
      'selam',
      'okeys',
      'adam',
    ]);
  });

  it('art arda düzenlenen slotlar birbirinin cevabını ezmiyor', () => {
    const emitted: ProfilePromptAnswer[][] = [];
    render(
      <Harness
        initial={[
          { promptKey: 'A', answer: '' },
          { promptKey: 'B', answer: '' },
          { promptKey: 'C', answer: '' },
        ]}
        onEmit={(next) => emitted.push(next)}
      />,
    );

    // Her tur başında hiçbir slot açık değil, yani üç pil de "Düzenle" —
    // index'i doğrudan slot sırasına karşılık geliyor.
    ['selam', 'okeys', 'adam'].forEach((text, index) => {
      fireEvent.press(screen.getAllByText(copy.editAnswer)[index]);
      fireEvent.changeText(
        screen.getAllByPlaceholderText(copy.answerPlaceholder)[index],
        text,
      );
      const input = screen.getAllByPlaceholderText(copy.answerPlaceholder)[index];
      const finish = screen.getByText(copy.finishAnswer);
      act(() => {
        fireEvent(input, 'blur');
        fireEvent.press(finish);
      });
    });

    expect(answersOf(emitted[emitted.length - 1])).toEqual([
      'selam',
      'okeys',
      'adam',
    ]);
  });

  // Sahadaki hata bu yoldan geldi: kullanıcı son cevabı yazıp "Bitir" yerine
  // başka bir slota geçince cevap sessizce kayboluyor, kayıt adımı da
  // "cevaplarından biri kaydedilemedi" diyordu.
  it('başka bir slota geçildiğinde "Bitir"e basılmamış cevabı kaybetmez', () => {
    const emitted: ProfilePromptAnswer[][] = [];
    render(
      <Harness
        initial={[
          { promptKey: 'A', answer: 'selam' },
          { promptKey: 'B', answer: 'okeys' },
          { promptKey: 'C', answer: '' },
        ]}
        onEmit={(next) => emitted.push(next)}
      />,
    );

    fireEvent.press(screen.getAllByText(copy.editAnswer)[2]);
    fireEvent.changeText(
      screen.getAllByPlaceholderText(copy.answerPlaceholder)[2],
      'adam',
    );

    // "Bitir"e BASILMADAN ilk slotun düzenlemesine geçiliyor. Dokunuş input'u
    // blur etmiyor (keyboardShouldPersistTaps="handled"); blur ancak odak
    // devredildikten, yani slot çoktan kapandıktan sonra geliyor.
    fireEvent.press(screen.getAllByText(copy.editAnswer)[0]);
    const closedInput = screen.getAllByPlaceholderText(
      copy.answerPlaceholder,
    )[2];
    act(() => {
      // fireEvent kullanılamıyor: slot artık editable=false, RNTL olayı yutar.
      closedInput.props.onBlur?.();
    });

    expect(answersOf(emitted[emitted.length - 1])).toEqual([
      'selam',
      'okeys',
      'adam',
    ]);
    // Cevap ekranda da duruyor (reset ile silinmedi).
    expect(
      screen.getAllByPlaceholderText(copy.answerPlaceholder)[2].props.value,
    ).toBe('adam');
    // Geç gelen blur, kullanıcının yeni açtığı slotu kapatmamalı.
    expect(screen.queryByText(copy.finishAnswer)).not.toBeNull();
  });

  it('düzenleme açıkken silme, aynı karedeki commit ile birlikte doğru slotu kaldırır', () => {
    const emitted: ProfilePromptAnswer[][] = [];
    render(
      <Harness
        initial={[
          { promptKey: 'A', answer: 'selam' },
          { promptKey: 'B', answer: 'okeys' },
          { promptKey: 'C', answer: '' },
        ]}
        onEmit={(next) => emitted.push(next)}
      />,
    );

    fireEvent.press(screen.getAllByText(copy.editAnswer)[2]);
    fireEvent.changeText(
      screen.getAllByPlaceholderText(copy.answerPlaceholder)[2],
      'adam',
    );

    const input = screen.getAllByPlaceholderText(copy.answerPlaceholder)[2];
    const remove = screen.getByLabelText(copy.remove);
    act(() => {
      fireEvent(input, 'blur');
      fireEvent.press(remove);
    });

    expect(answersOf(emitted[emitted.length - 1])).toEqual(['selam', 'okeys']);
  });
});
