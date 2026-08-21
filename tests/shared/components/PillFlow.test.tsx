import React from 'react';
import { Text, View } from 'react-native';
import { act, render, within } from '@testing-library/react-native';
import PillFlow, { packRows } from '@/shared/components/PillFlow';

// onLayout'u elle tetiklemek için: container ve pil sarmalayıcıları
// PillFlow'un render ettiği View'lar; UNSAFE_getAllByType ile sırayla
// bulup layout event'i gönderiyoruz.
function layout(node: any, width: number) {
  node.props.onLayout?.({ nativeEvent: { layout: { width, height: 40 } } });
}

describe('packRows', () => {
  it('sığmayan pili atlayıp arkasındaki sığanı boşluğa çeker', () => {
    // Kullanıcı senaryosu: 1. pilden sonra 120px boşluk var; 2. pil (200)
    // sığmıyor, 3. pil (100) sığıyor → 3. pil yukarı gelir.
    expect(packRows([180, 200, 100], 300, 8)).toEqual([[0, 2], [1]]);
  });

  it('her şey sığıyorsa sırayı bozmaz', () => {
    expect(packRows([80, 80, 80], 300, 8)).toEqual([[0, 1, 2]]);
  });

  it('fillWidth kapalıyken verilen sırayı önceler', () => {
    // İlk item dar olsa bile başta kalır. Şu an tüm çağrı noktaları
    // fillWidth kullanıyor; varsayılan sıra-koruyan davranış, sırası anlam
    // taşıyan bir liste (ör. burçlar) PillFlow'a taşınırsa diye sabitleniyor.
    expect(packRows([60, 200, 90], 300, 8)).toEqual([[0, 1], [2]]);
  });

  it('fillWidth en geniş pili başa alır', () => {
    // Verilen sıra 180, 200, 100 olsa da satır en geniş pille (200) açılır.
    expect(packRows([180, 200, 100], 300, 8, true)).toEqual([[1], [0, 2]]);
  });

  it('fillWidth en genişin yanına sığan EN GENİŞ pili koyar', () => {
    // 200'ün yanında 300-200-8 = 92px kalıyor: 150 ve 100 sığmaz, 90 sığar.
    // Sonraki satır da aynı kuralla: 150 başa, yanına 100.
    expect(packRows([100, 150, 90, 200], 300, 8, true)).toEqual([
      [3, 2],
      [1, 0],
    ]);
  });

  it('fillWidth eşit genişliklerde özgün sırayı korur', () => {
    expect(packRows([80, 80, 80], 300, 8, true)).toEqual([[0, 1, 2]]);
  });

  it('pinned pil, dar olsa bile fillWidth sıralamasına girmeden başta kalır', () => {
    // Rozet (index 0, 60px) en dar; fillWidth normalde onu sona atardı.
    // pinned ile ilk satırın başında kalıyor, kalan 234px'e sığan EN GENİŞ
    // pil (200) yanına geliyor, 150 alt satıra düşüyor.
    expect(packRows([60, 150, 200], 300, 8, true, [true, false, false])).toEqual([
      [0, 2],
      [1],
    ]);
  });

  it('pinned pil fillWidth kapalıyken de öne alınır', () => {
    // Verilen sırada sonda olsa bile başa geçer; kalanlar özgün sırada.
    expect(packRows([100, 90, 60], 300, 8, false, [false, false, true])).toEqual([
      [2, 0, 1],
    ]);
  });

  it('birden fazla pinned pil kendi aralarında verilen sırayı korur', () => {
    // 2 ve 3 başta ve kendi sıralarında; arkalarına en geniş (1) geliyor.
    expect(
      packRows([50, 300, 40, 40], 400, 8, true, [false, false, true, true]),
    ).toEqual([[2, 3, 1], [0]]);
  });

  it('boşluk (gap) genişliği hesaba katılır', () => {
    // 2 x 100 + gap 8 = 208 > 200 → ikinci pil alt satıra.
    expect(packRows([100, 100], 200, 8)).toEqual([[0], [1]]);
  });

  it('container’dan geniş pil tek başına satıra girer, döngü takılmaz', () => {
    expect(packRows([400, 50], 300, 8)).toEqual([[0], [1]]);
  });

  it('boş liste boş satır üretmez', () => {
    expect(packRows([], 300, 8)).toEqual([]);
  });
});

describe('PillFlow', () => {
  const items = [
    { id: 'a', element: <Text>a</Text> },
    { id: 'b', element: <Text>b</Text> },
    { id: 'c', element: <Text>c</Text> },
  ];

  it('ölçüm tamamlanana kadar flexWrap ile render eder', () => {
    const tree = render(<PillFlow items={items} gap={8} />);
    const container = tree.UNSAFE_getAllByType(View)[0];
    expect(container.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flexWrap: 'wrap', columnGap: 8 }),
      ])
    );
  });

  it('ölçümler gelince pilleri satırlara paketler', () => {
    const tree = render(<PillFlow items={items} gap={8} />);
    const views = tree.UNSAFE_getAllByType(View);
    const [container, ...wrappers] = views;

    act(() => {
      layout(container, 300);
      layout(wrappers[0], 180);
      layout(wrappers[1], 200);
      layout(wrappers[2], 100);
    });

    // Paketlenmiş halde container satırların kapsayıcısı olur; satırlar
    // flexDirection: "row" taşıyan View'lar.
    const rows = tree.UNSAFE_getAllByType(View).filter(
      (node: any) => node.props.style?.flexDirection === 'row'
    );
    expect(rows).toHaveLength(2);
    // İlk satır: a + c (b sığmadığı için atlandı), ikinci satır: b.
    expect(within(rows[0]).getAllByText(/a|c/).map((n) => n.props.children))
      .toEqual(['a', 'c']);
    expect(within(rows[1]).getByText('b')).toBeTruthy();
  });

  it('fillWidth ile en geniş pili başa alarak paketler', () => {
    const tree = render(<PillFlow items={items} gap={8} fillWidth />);
    const views = tree.UNSAFE_getAllByType(View);
    const [container, ...wrappers] = views;

    act(() => {
      layout(container, 300);
      layout(wrappers[0], 180);
      layout(wrappers[1], 200);
      layout(wrappers[2], 100);
    });

    const rows = tree.UNSAFE_getAllByType(View).filter(
      (node: any) => node.props.style?.flexDirection === 'row'
    );
    expect(rows).toHaveLength(2);
    // En geniş pil (b, 200) başa geçer; a (180) + c (100) alt satıra sığar.
    expect(within(rows[0]).getByText('b')).toBeTruthy();
    expect(within(rows[1]).getAllByText(/a|c/).map((n) => n.props.children))
      .toEqual(['a', 'c']);
  });
});
