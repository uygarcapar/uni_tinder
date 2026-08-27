import { useReducer, useRef, useState, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type PillFlowItem = {
  /** Ölçüm önbelleği anahtarı + React key tabanı. Etiket metni iyi bir id. */
  id: string;
  element: ReactNode;
  /**
   * Bu pili başa sabitle: `fillWidth` genişliğe göre yeniden sıralarken bu
   * item sıralamaya GİRMEZ, verilen sırada en başta kalır. Birden fazla
   * pinned item varsa kendi aralarında da verilen sırayı korurlar.
   * Kullanımı: bir rozet ("Burada yeni") her zaman ilk sırada görünmeli.
   */
  pinned?: boolean;
};

type Props = {
  items: PillFlowItem[];
  /** Yatay boşluk (flexWrap'teki `gap` karşılığı). */
  gap?: number;
  /** Dikey boşluk; verilmezse `gap`. */
  rowGap?: number;
  /**
   * Satır genişliğini olabildiğince doldur: en geniş pil başa, yanına kalan
   * boşluğa sığan en geniş pil. VERİLEN SIRA BOZULUR — sırası anlam taşıyan
   * listelerde kapalı bırak. Tek bir pili sıralamadan muaf tutmak yeterliyse
   * `fillWidth`i kapatmak yerine o item'a `pinned` ver.
   */
  fillWidth?: boolean;
  /**
   * Ölçüm turunu GÖRÜNMEZ yap, yalnız paketlenmiş hâli çiz. Etiketleri ilk kez
   * görülen listelerde (önbellek soğukken) piller önce verilen sırada çizilip
   * bir kare sonra paketlenmiş yerlerine atlıyor; `fillWidth` sırayı da
   * değiştirdiği için sıçrama gözle görülür oluyor.
   *
   * Önbellek sıcakken (aynı etiketler daha önce ölçüldüyse) ilk render zaten
   * paketlenmiş geliyor, bu bayrak hiçbir şeyi geciktirmez.
   */
  hideUntilPacked?: boolean;
  /**
   * `hideUntilPacked` turunda pillerin yerine çizilecek iskelet.
   *
   * Verilmezse o tur BOŞ görünür: etiketler ilk kez ölçülüyorsa (soğuk önbellek
   * + uzak veri) kategori başlığı ekranda durur, altındaki pil alanı bir süre
   * boş kalır. İskelet o boşluğu dolduruyor.
   *
   * Ölçüm turunun layout'u KORUNUYOR (gerçek piller çizilmeden ölçülemezler);
   * iskelet onun üstüne absolute konuyor.
   */
  placeholder?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// onLayout genişlikleri fiziksel piksel ızgarasına yuvarlanıyor; sınırda kalan
// bir pili satıra sokup taşırmaktansa alt satıra bırakıyoruz.
const FIT_EPSILON = 0.5;

// Genişlik yalnızca içeriğe + font ölçeğine bağlı olduğu için aynı etiketi her
// kartta yeniden ölçmeye gerek yok. Etiketler backend enum'larından geldiği
// için küme sınırlı; önbellek sınırsız büyümüyor.
const widthCache = new Map<string, number>();

/**
 * first-fit paketleme: sırayla ilerler, satıra sığmayan pili atlar, arkasından
 * gelen ilk sığan pil boşluğa girer. Sıra yalnızca sığmayanlar için bozulur.
 *
 * `fillWidth` ile first-fit **decreasing**'e döner: piller önce genişliğe göre
 * azalan sıraya dizilir, böylece her satır en geniş pille açılır ve yanına
 * kalan boşluğa sığan EN GENİŞ pil gelir. Bu modda verilen sıra korunmaz.
 *
 * `pinned[i]` işaretli pil'ler sıralamaya girmez: verilen sıralarıyla listenin
 * EN BAŞINA alınırlar, dolayısıyla ilk satırın başında çizilirler. Kalanlar
 * arkalarından normal kuralla paketlenir.
 *
 * Dönen değer: her satırdaki item index'leri (özgün items dizisine göre).
 */
export function packRows(
  widths: number[],
  containerWidth: number,
  gap: number,
  fillWidth = false,
  pinned?: readonly boolean[],
): number[][] {
  const all = widths.map((_, index) => index);
  const head = pinned ? all.filter((i) => pinned[i]) : [];
  const tail = pinned ? all.filter((i) => !pinned[i]) : all;
  // Eşit genişlikte özgün sıra korunsun diye index ile açık tiebreak —
  // Array#sort kararlı olsa da niyeti koda yazıyoruz.
  if (fillWidth) tail.sort((a, b) => widths[b] - widths[a] || a - b);
  // head sıralanmıyor: pinned'ın tüm amacı verilen sırayı korumak.
  const pending = [...head, ...tail];
  const rows: number[][] = [];

  while (pending.length > 0) {
    const row: number[] = [];
    let used = 0;

    for (let i = 0; i < pending.length; ) {
      const width = widths[pending[i]];
      const next = row.length === 0 ? width : used + gap + width;
      // fillWidth'te pending azalan sırada olduğu için "sığan ilk pil" =
      // "sığan EN GENİŞ pil"; ayrı bir en-iyi-uyum taraması gerekmiyor.
      // Satırın ilk elemanı koşulsuz girer: container'dan geniş tek bir pil
      // varsa döngü yine de ilerlesin, sonsuza sarmasın.
      if (row.length === 0 || next <= containerWidth - FIT_EPSILON) {
        row.push(pending[i]);
        used = next;
        pending.splice(i, 1);
      } else {
        i += 1;
      }
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Pilleri boşluk bırakmadan dizen satır kapsayıcısı.
 *
 * `flexWrap: "wrap"` pilleri katı bir sırayla yerleştirir: 2. pil satıra
 * sığmıyorsa satır orada biter ve 1. pilin sağında, 3. pilin rahatça sığacağı
 * bir boşluk kalır. Burada satırlar first-fit ile doldurulduğu için o boşluğa
 * sığan ilk pil yukarı çekilir.
 *
 * `fillWidth` açıkken sıralama da genişliğe göre yeniden yapılır (en geniş
 * başa, yanına boşluğu en çok dolduran pil). Sırası anlam taşıyan listelerde
 * kapalı bırak — bkz. prop dokümanı. Tek bir pili başa sabitlemek yeterliyse
 * `fillWidth`i kapatma, o item'a `pinned` ver.
 *
 * İki turlu çalışır: ilk render'da piller ölçülür (görüntü bu turda `flexWrap`
 * ile birebir aynı, yani verilen sırada), ölçüm tamamlanınca paketlenmiş
 * satırlara geçilir. Ölçümler etiket bazında modül önbelleğine yazıldığından
 * sonraki kartlar ilk render'da paketlenmiş gelir — fazladan commit çıkmaz.
 */
export default function PillFlow({
  items,
  gap = 8,
  rowGap,
  fillWidth = false,
  hideUntilPacked = false,
  placeholder,
  style,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const containerWidthRef = useRef(0);
  const widthsRef = useRef<Record<string, number>>({});
  const pendingRef = useRef(new Map<string, number>());

  const keys = items.map((item) => `${fontScale}:${item.id}`);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const readWidth = (key: string) => widthsRef.current[key] ?? widthCache.get(key);

  const handleItemLayout = (key: string) => (event: LayoutChangeEvent) => {
    const laidOut = event.nativeEvent.layout.width;
    const known = readWidth(key);
    if (known != null) {
      // BİLİNEN ölçü ile ÇİZİLEN ölçü ayrıştı → önbellek bayat. Sebebi genelde
      // pilin stilinin değişmesi (padding/font/ikon): önbellek anahtarı yalnız
      // etiket + font ölçeği, modül seviyesinde yaşadığı için Fast Refresh'i de
      // aşıyor. Bayat (dar) ölçüyle paketlenen satır artık sığmıyor ve piller
      // kutunun sağından taşıyordu. Ölçüyü tazeleyip bir kez yeniden paketliyoruz.
      if (Math.abs(known - laidOut) <= FIT_EPSILON) return;
      // Kapsayıcıyı dolduran pil kapsayıcıya CLAMP'lenmiş olabilir; o ölçü
      // içeriği değil kabı anlatır, önbelleğe girerse kalıcı yanlış olur.
      if (
        containerWidthRef.current > 0 &&
        laidOut >= containerWidthRef.current - FIT_EPSILON
      ) {
        return;
      }
      widthsRef.current[key] = laidOut;
      widthCache.set(key, laidOut);
      bumpVersion();
      return;
    }
    pendingRef.current.set(key, laidOut);

    // Hepsi ölçülmeden paketlemeye geçmiyoruz: her pil için ayrı bir render
    // (ve ayrı bir Fabric commit'i) çıkarmanın anlamı yok.
    const allMeasured = keysRef.current.every(
      (k) => readWidth(k) != null || pendingRef.current.has(k),
    );
    if (!allMeasured) return;

    pendingRef.current.forEach((width, k) => {
      widthsRef.current[k] = width;
      // Kapsayıcıyı dolduran (içindeki metin sarmalanmış olabilir) pilin
      // genişliği içeriğe değil kapsayıcıya bağlı — onu önbelleğe yazma,
      // yoksa daha geniş bir kapsayıcıda yanlış ölçüyle paketleriz.
      if (
        containerWidthRef.current > 0 &&
        width < containerWidthRef.current - FIT_EPSILON
      ) {
        widthCache.set(k, width);
      }
    });
    pendingRef.current.clear();
    bumpVersion();
  };

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (containerWidthRef.current === width) return;
    containerWidthRef.current = width;
    // Genişlik değişince (rotasyon, split view) yeniden ölçüm gerekmez;
    // paketleme önbellekteki genişliklerle baştan hesaplanır.
    setContainerWidth(width);
  };

  const measured = keys.map((key) => readWidth(key));
  const rows =
    containerWidth > 0 && measured.every((width) => width != null)
      ? packRows(
          measured as number[],
          containerWidth,
          gap,
          fillWidth,
          items.map((item) => !!item.pinned),
        )
      : null;

  // Ölçüm turu ile paketlenmiş tur aynı sarmalayıcıyı kullanır; ölçülen
  // genişlik birebir render edilen genişlik olsun.
  const wrapped = items.map((item, index) => (
    <View
      key={`${item.id}-${index}`}
      onLayout={handleItemLayout(keys[index])}
      style={{ alignSelf: "flex-start" }}
    >
      {item.element}
    </View>
  ));

  if (!rows) {
    const measuringRound = (
      <View
        onLayout={handleContainerLayout}
        // DİKKAT: burada `pointerEvents="none"` VERME. Görünmez turda dokunmayı
        // kapatmak mantıklı görünüyor ama onLayout'un çalışmadığı ortamlarda
        // (jest) bu tur kalıcı hâle geliyor ve piller hiç basılamıyor.
        // Görünmezlik zaten tek kare sürüyor.
        style={[
          {
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: gap,
            rowGap: rowGap ?? gap,
          },
          // opacity ölçümü engellemez — layout normal çalışır, onLayout fire eder.
          hideUntilPacked ? { opacity: 0 } : null,
          style,
        ]}
      >
        {wrapped}
      </View>
    );

    if (!hideUntilPacked || !placeholder) return measuringRound;

    // İskelet ölçüm turunun ÜSTÜNE biniyor: alttaki tur yerinde kalmalı, yoksa
    // ölçüm hiç yapılamaz. overflow: iskelet turdan uzun çıkarsa taşmasın.
    return (
      <View style={{ overflow: "hidden" }}>
        {measuringRound}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {placeholder}
        </View>
      </View>
    );
  }

  return (
    <View
      onLayout={handleContainerLayout}
      style={[{ rowGap: rowGap ?? gap }, style]}
    >
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            columnGap: gap,
          }}
        >
          {row.map((itemIndex) => wrapped[itemIndex])}
        </View>
      ))}
    </View>
  );
}
