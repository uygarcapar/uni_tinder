/**
 * ANLAR ŞERİDİNİN DİZİLİMİ — saf hesap.
 *
 * Kendi modülünde çünkü şeridin içeriği üç ayrı duruma göre değişiyor
 * (yükleniyor mu, kaç gerçek an var, hangi bilgi kutusu başta) ve bu dallar bir
 * `useMemo`nun içinde gözle doğrulanamıyor. Ekranda bırakıldığı sürece her
 * değişiklik "bir durumda kutu kayboldu" riski taşıyor.
 *
 * Modül İKON ya da ÇEVİRİ bilmiyor, yalnız anahtar taşıyor: ikonlar bileşenin
 * havuzunda, metinler i18n'de. Saf kalmasının bedeli bu, karşılığı test.
 *
 * ── ARTI KUTUSU BURADAN ÇIKTI (istek) ──────────────────────────────────────
 * Şeridin başında "Share yours" yazan tam boy bir paylaşma kutusu vardı ve
 * KALDIRILDI: aksiyon artık BAŞLIK SATIRINDA, "7 an · Kampüs" yazısının
 * sağındaki küçük kutuda (bkz. CampusAddChip). Yani dizilim artık yalnız
 * gösterilecek içerikten oluşuyor — `canShare` bu hesabın girdisi değil,
 * başlık satırının.
 *
 * ⚠️ Akışın bandındaki satır AYRI bir hesap (`feedBandBoxes.ts`) ve onun artı
 * karesi DURUYOR: orada şerit yok, başlık yok, kutudan başka bir yüzey de yok.
 */

/** Şeritteki en az kutu sayısı. */
export const MIN_STRIP_BOXES = 3;

export interface StripBox<T> {
  /** FlatList anahtarı — üç tür arasında çakışmayacak biçimde üretiliyor. */
  key: string;
  /** Gerçek an (varsa). */
  moment: T | null;
  /** Dolgu kutusunun i18n anahtarı (varsa). */
  infoKey: string | null;
  /** Yükleme turundaki iskelet kutusu mu. */
  skeleton: boolean;
}

export interface BuildStripBoxesArgs<T> {
  /** Gerçek anlar — süresi dolanlar ÇAĞIRAN tarafından ayıklanmış olmalı. */
  moments: T[];
  /** Anın kimliği — FlatList anahtarı buradan. */
  idOf: (moment: T) => string;
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
 * Sıra: [gerçek anlar] YA DA [dolgu]. İkisi aynı şeritte DURMUYOR.
 *
 * ── ⚠️🔴 DOLGU ARTIK "HEPSİ YA DA HİÇBİRİ" (istek: "bir an varsa bizim 3
 * default empty state kartları gözükmesin") ────────────────────────────────
 * Önce dolgu TAVANA KADAR tamamlıyordu: 1 an varsa yanına 2, 2 an varsa 1
 * dolgu kutusu giriyordu ve gerekçesi "şerit hiçbir zaman yarım kalmasın"dı.
 * Yanlış olan taraf şu: dolgu kutuları KURAL anlatıyor ("24 SAAT", "YALNIZ
 * KAMPUSTE") ve gerçek anların yanında o kurallar içeriğin DEVAMI gibi
 * okunuyordu — kullanıcı üç kutuyu yana kaydırıp iki tanesinin an olmadığını
 * fark ediyor. Kuralları hâlâ söyleyen bir yüzey var: başlığın altındaki
 * açıklama satırı (bkz. CampusMomentsStrip > `campus.headerSubtitle`).
 *
 * Yani dolgu tam olarak BİR durumda çiziliyor: ortada gösterilecek HİÇ an
 * yokken. O zaman da `minBoxes` kadar, yani şerit yine boş kalmıyor.
 *
 * ⚠️ `minBoxes` ARTIK BİR TAVAN DEĞİL, DOLGUNUN SAYISI: adı "en az kutu"
 * olarak kaldı çünkü boş şeritte hâlâ o kadar kutu doğuyor, ama an varken
 * kutu sayısını belirleyen tek şey an sayısı.
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
  loading,
  infoKeys,
  minBoxes = MIN_STRIP_BOXES,
}: BuildStripBoxesArgs<T>): StripBox<T>[] {
  const boxes: StripBox<T>[] = [];

  if (loading && moments.length === 0) {
    for (let i = 0; i < minBoxes; i += 1) {
      boxes.push({
        key: `skeleton-${i}`,
        moment: null,
        infoKey: null,
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
      skeleton: false,
    });
  }

  // Havuz boşsa dolgu da yok — sonsuz döngüye düşmeden sessizce atlanıyor.
  if (infoKeys.length === 0) return boxes;

  /**
   * ⚠️ TEK AN BİLE DOLGUYU TAMAMEN KAPATIYOR (istek) — `minBoxes - uzunluk`
   * DEĞİL. Kıyas `> 0` üzerinden, uzunluk üzerinden değil: tavana kadar
   * tamamlayan eski hesap buraya bir daha yazılmasın.
   */
  const fill = moments.length > 0 ? 0 : minBoxes;
  for (let i = 0; i < fill; i += 1) {
    const infoKey = infoKeys[i % infoKeys.length];
    boxes.push({
      key: `info-${infoKey}-${i}`,
      moment: null,
      infoKey,
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
