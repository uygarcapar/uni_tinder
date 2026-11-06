/**
 * Profil fotoğraf ızgarasının geometrisi.
 *
 * ⚠️ BU TESTLERİN VARLIK SEBEBİ: ızgara bugüne kadar `EditProfileForm` içinde
 * (3500 satır, SIFIR test) gömülü yaşadı. Mod başına fotoğrafla birlikte ikinci
 * bir çağıran geliyor (mod kurulum sheet'i), yani hesap paylaşılacak — paylaşılan
 * ve test edilmeyen matematik, iki yüzeyin sessizce ayrışması demek.
 *
 * Kilitlenen şey SAYILAR DEĞİL, DEĞİŞMEZLER: ekran genişliğine bağlı değerleri
 * (ITEM_WIDTH, GAP) sabitlemek testi cihaz boyutuna bağımlı kılardı. Test edilen
 * şey ızgaranın kendi tutarlılığı.
 */

import {
  GAP,
  ITEM_HEIGHT,
  ITEM_WIDTH,
  PHOTO_GRID_COLUMNS,
  ROW_GAP,
  getContainerHeight,
  getOrder,
  getPosition,
} from '@/features/profile/components/photoGridGeometry';

const MAX_PHOTOS = 6;

describe('getPosition — slot → konum', () => {
  it('ilk slot başlangıç noktasında', () => {
    expect(getPosition(0)).toEqual({ x: 0, y: 0 });
  });

  it('ilk satır yalnız YATAY ilerliyor', () => {
    for (let i = 0; i < PHOTO_GRID_COLUMNS; i++) {
      expect(getPosition(i).y).toBe(0);
    }
    expect(getPosition(1).x).toBeCloseTo(ITEM_WIDTH + GAP);
    expect(getPosition(2).x).toBeCloseTo(2 * (ITEM_WIDTH + GAP));
  });

  it('sütun sayısı dolunca ikinci satıra SARIYOR', () => {
    const wrapped = getPosition(PHOTO_GRID_COLUMNS);
    expect(wrapped.x).toBe(0);
    expect(wrapped.y).toBeCloseTo(ITEM_HEIGHT + ROW_GAP);
  });

  it('aynı sütundaki slotlar aynı x’te', () => {
    expect(getPosition(0).x).toBeCloseTo(getPosition(PHOTO_GRID_COLUMNS).x);
    expect(getPosition(1).x).toBeCloseTo(getPosition(PHOTO_GRID_COLUMNS + 1).x);
  });

  it('karolar ÜST ÜSTE BİNMİYOR — komşu aralığı karo genişliğinden büyük', () => {
    // Aralık karo genişliğinden küçük olsaydı karolar çakışırdı; eşit olsaydı
    // boşluk hiç kalmazdı.
    expect(getPosition(1).x - getPosition(0).x).toBeGreaterThan(ITEM_WIDTH);
  });

  it('son sütun kabın içinde kalıyor (taşma yok)', () => {
    const lastCol = getPosition(PHOTO_GRID_COLUMNS - 1);
    const available = PHOTO_GRID_COLUMNS * ITEM_WIDTH + (PHOTO_GRID_COLUMNS - 1) * GAP;
    expect(lastCol.x + ITEM_WIDTH).toBeCloseTo(available);
  });
});

describe('getOrder — konum → slot (getPosition’ın TERSİ)', () => {
  it('her slot için getPosition ile gidip getOrder ile dönülüyor', () => {
    // Asıl değişmez bu: ileri ve geri eşleme aynı ızgarayı tarif etmeli.
    for (let i = 0; i < MAX_PHOTOS; i++) {
      const p = getPosition(i);
      expect(getOrder(p.x, p.y, MAX_PHOTOS - 1)).toBe(i);
    }
  });

  it('hücrenin YARISINI aşınca sonraki slota geçiyor', () => {
    const step = ITEM_WIDTH + GAP;
    // Yarının az altı: hâlâ 0. Az üstü: 1. Eşik `Math.round`un kendisi.
    expect(getOrder(step * 0.49, 0, MAX_PHOTOS - 1)).toBe(0);
    expect(getOrder(step * 0.51, 0, MAX_PHOTOS - 1)).toBe(1);
  });

  it('ızgaranın DIŞINA sürüklenen parmak kenetleniyor', () => {
    // Kenetlenmeseydi sıra dizisinde olmayan bir indeks üretilir, liste delinirdi.
    expect(getOrder(-9999, -9999, MAX_PHOTOS - 1)).toBe(0);
    expect(getOrder(9999, 9999, MAX_PHOTOS - 1)).toBe(MAX_PHOTOS - 1);
  });

  it('tavan ÇAĞIRANIN verdiği maxIndex — daha az fotoğrafta daha dar', () => {
    // Üç fotoğraflı bir ızgarada dördüncü slot YOK.
    expect(getOrder(9999, 9999, 2)).toBe(2);
  });
});

describe('getContainerHeight — EKLE karosunu da sayıyor', () => {
  /**
   * ⚠️ Eşik 2, sütun sayısı 3 olmasına rağmen: ızgarada fotoğrafların yanında
   * bir de EKLE karosu var. 2 foto + ekle = 3 öğe = tek satır; 3 foto + ekle =
   * 4 öğe = iki satır. "3 fotoğraf tek satıra sığıyor" diye sadeleştiren biri
   * ekle karosunu ızgaradan taşırır.
   */
  it('0-2 fotoğraf tek satır', () => {
    for (const n of [0, 1, 2]) {
      expect(getContainerHeight(n)).toBeCloseTo(ITEM_HEIGHT);
    }
  });

  it('3 fotoğraftan itibaren iki satır (ekle karosu ikinci satıra düşüyor)', () => {
    for (const n of [3, 4, 5]) {
      expect(getContainerHeight(n)).toBeCloseTo(2 * ITEM_HEIGHT + ROW_GAP);
    }
  });

  it('tavanda (ekle karosu YOK) yine iki satır', () => {
    // 6 öğe = 2 satır; ekle karosu çizilmediği için formül burada da doğru.
    expect(getContainerHeight(MAX_PHOTOS)).toBeCloseTo(2 * ITEM_HEIGHT + ROW_GAP);
  });

  it('kap, en alttaki slotu KIRPMIYOR', () => {
    const lastRowBottom = getPosition(MAX_PHOTOS - 1).y + ITEM_HEIGHT;
    expect(getContainerHeight(MAX_PHOTOS)).toBeGreaterThanOrEqual(lastRowBottom);
  });
});

describe('ölçüler', () => {
  it('karo oranı 3:4 — kırpıcı çıktısıyla aynı', () => {
    expect(ITEM_HEIGHT / ITEM_WIDTH).toBeCloseTo(4 / 3);
  });

  it('pozitif ve sonlu', () => {
    for (const v of [ITEM_WIDTH, ITEM_HEIGHT, GAP]) {
      expect(v).toBeGreaterThan(0);
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
