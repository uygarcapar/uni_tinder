/**
 * ANLAR ŞERİDİNİN DİZİLİMİ — saf hesap.
 *
 * Kendi modülünde çünkü şeridin içeriği dört ayrı duruma göre değişiyor
 * (paylaşabiliyor mu, yükleniyor mu, kaç gerçek an var, neden paylaşamıyor) ve
 * bu dallar bir `useMemo`nun içinde gözle doğrulanamıyor. Ekranda bırakıldığı
 * sürece her değişiklik "bir durumda kutu kayboldu" riski taşıyor.
 *
 * Modül İKON ya da ÇEVİRİ bilmiyor, yalnız anahtar taşıyor: ikonlar bileşenin
 * havuzunda, metinler i18n'de. Saf kalmasının bedeli bu, karşılığı test.
 */

/** Şeritteki en az kutu sayısı — artı kutusu HARİÇ (gerekçe bileşende). */
export const MIN_STRIP_BOXES = 3;

export interface StripBox<T> {
  /** FlatList anahtarı — üç tür arasında çakışmayacak biçimde üretiliyor. */
  key: string;
  /** Gerçek an (varsa). */
  moment: T | null;
  /** Dolgu kutusunun i18n anahtarı (varsa). */
  infoKey: string | null;
  /** Şeridin başındaki artı kutusu mu. */
  add: boolean;
  /** Yükleme turundaki iskelet kutusu mu. */
  skeleton: boolean;
}

export interface BuildStripBoxesArgs<T> {
  /** Gerçek anlar — süresi dolanlar ÇAĞIRAN tarafından ayıklanmış olmalı. */
  moments: T[];
  /** Anın kimliği — FlatList anahtarı buradan. */
  idOf: (moment: T) => string;
  /** Artı kutusu çizilsin mi (kampüste ve bugün paylaşmamış). */
  canShare: boolean;
  /** Anlar sorgusu hâlâ uçuyor mu. */
  loading: boolean;
  /** Dolgu için kullanılacak bilgi anahtarları — SIRASI önemli. */
  infoKeys: string[];
  /** Tavan test edilebilsin diye dışarıdan; varsayılan `MIN_STRIP_BOXES`. */
  minBoxes?: number;
}

/**
 * Şeridin kutuları, soldan sağa.
 *
 * Sıra: [artı] + [gerçek anlar] + [dolgu]. Dolgu yalnız `minBoxes`e kadar
 * ekleniyor; gerçek an sayısı yetiyorsa hiç eklenmiyor.
 *
 * ⚠️ YÜKLEME TURUNDA DOLGU DEĞİL İSKELET: dolgu kutuları "kampüste kimse
 * paylaşmamış" demek, oysa o anda daha bilmiyoruz. Veri gelince iskeletlerin
 * yerine gerçek anlar ya da dolgu geçiyor.
 *
 * ⚠️ ELİNDE VERİ VARKEN İSKELET YOK: `loading` arka plan tazelemelerinde de
 * true olabiliyor; gösterilecek an varken onları iskeletle değiştirmek ekranı
 * sebepsiz boşaltırdı.
 */
export function buildStripBoxes<T>({
  moments,
  idOf,
  canShare,
  loading,
  infoKeys,
  minBoxes = MIN_STRIP_BOXES,
}: BuildStripBoxesArgs<T>): StripBox<T>[] {
  const boxes: StripBox<T>[] = [];

  if (canShare) {
    boxes.push({
      key: "add",
      moment: null,
      infoKey: null,
      add: true,
      skeleton: false,
    });
  }

  if (loading && moments.length === 0) {
    for (let i = 0; i < minBoxes; i += 1) {
      boxes.push({
        key: `skeleton-${i}`,
        moment: null,
        infoKey: null,
        add: false,
        skeleton: true,
      });
    }
    return boxes;
  }

  for (const moment of moments) {
    boxes.push({
      key: `moment-${idOf(moment)}`,
      moment,
      infoKey: null,
      add: false,
      skeleton: false,
    });
  }

  // Havuz boşsa dolgu da yok — sonsuz döngüye düşmeden sessizce atlanıyor.
  if (infoKeys.length === 0) return boxes;

  const fill = Math.max(minBoxes - moments.length, 0);
  for (let i = 0; i < fill; i += 1) {
    const infoKey = infoKeys[i % infoKeys.length];
    boxes.push({
      key: `info-${infoKey}-${i}`,
      moment: null,
      infoKey,
      add: false,
      skeleton: false,
    });
  }

  return boxes;
}

/**
 * Bilgi anahtarlarının sırası — biri BAŞA sabitlenerek.
 *
 * Kaldırılan boş durumun bir işi vardı: paylaşamıyorsan NEDEN
 * paylaşamadığını söylemek. Sıra rastgele olduğu için o cümle bazen hiç
 * görünmezdi; ilgili anahtar öne alınıyor, kalanların sırası bozulmuyor.
 *
 * `pinned` null ya da havuzda yoksa sıra olduğu gibi dönüyor.
 */
export function orderInfoKeys(keys: string[], pinned: string | null): string[] {
  if (!pinned) return keys;
  if (!keys.includes(pinned)) return keys;
  return [pinned, ...keys.filter((k) => k !== pinned)];
}
