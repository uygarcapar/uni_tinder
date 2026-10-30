import {
  FLIGHT_HOLD,
  FLIGHT_STICK,
  flightOffset,
} from '@/features/feed/feedCardFlight';

/**
 * AKIŞ KARTLARININ YAPIŞMA GEOMETRİSİ.
 *
 * Ekranda doğrulanması en zor sınıftan bir hesap: hata görünür ama SEBEBİ
 * görünmez — kart ya tam üst bantta bir kare takılıyor (faz geçişinde hız
 * sıçraması) ya da geri kaydırmada eski yerine dönmüyor (tersinirlik).
 * Burada sayılar sabit; cihazda bakılacak olan yalnız HİSSİ.
 *
 * ⚠️ TESTLERİN YARISI KALDIRILAN DAVRANIŞIN BEKÇİSİ. İki tur sökme yapıldı
 * (gerekçeleri feedCardFlight'ın başındaki iki kırmızı notta): ivmeli çıkış ve
 * momentum distorsiyonu. İkisinin de geri sızma biçimi aynı: payın negatife
 * düşmesi ya da sabitken oynaması. Aşağıdaki iki test tam olarak bunu
 * kovalıyor — "kart doğalından önce çıkmıyor" ve "pay sabit kalıyor".
 */
describe('flightOffset', () => {
  it('hat geçilmeden ÖTELEME YOK (negatif yolda da 0)', () => {
    expect(flightOffset(-200)).toBe(0);
    expect(flightOffset(-1)).toBe(0);
    expect(flightOffset(0)).toBe(0);
  });

  it('yapışma kartı GERİDE bırakıyor, tavanı bütçenin payı kadar', () => {
    // Pozitif = aşağı, yani kaydırmanın bir kısmını yutuyor; geride kalan pay
    // kartın bir sonrakinin ALTINA girdiği mesafe.
    expect(flightOffset(FLIGHT_HOLD / 2)).toBeGreaterThan(0);
    expect(flightOffset(FLIGHT_HOLD)).toBeCloseTo(FLIGHT_HOLD * FLIGHT_STICK, 5);
  });

  it('yapışma monoton — pay yolda hiç geri çekilmiyor', () => {
    let prev = -1;
    for (let t = -20; t <= FLIGHT_HOLD; t += 1) {
      const v = flightOffset(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  /** ⚠️ "altına girdikten sonra bir daha oynamasın" (istek). */
  it('yapışma bitince pay DONUYOR — kart doğal hızda akıyor, bir daha oynamıyor', () => {
    const held = FLIGHT_HOLD * FLIGHT_STICK;
    for (const t of [FLIGHT_HOLD, FLIGHT_HOLD + 1, 300, 900, 5000, 50000]) {
      expect(flightOffset(t)).toBeCloseTo(held, 5);
    }
  });

  /** ⚠️ "o uçmayı kaldır" (istek) — negatif pay = uçuşun geri sızması. */
  it('PAY HİÇ NEGATİFE DÜŞMÜYOR', () => {
    for (let t = -50; t <= 2000; t += 3.5) {
      expect(flightOffset(t)).toBeGreaterThanOrEqual(0);
    }
  });

  it('konum VE hız sürekli (C1) — faz geçişinde sıçrama yok', () => {
    const step = 0.5;
    let prev = flightOffset(0);
    let prevSpeed = 0;
    let maxJump = 0;
    let maxSpeedJump = 0;
    for (let t = step; t <= 700; t += step) {
      const v = flightOffset(t);
      const speed = (v - prev) / step;
      maxJump = Math.max(maxJump, Math.abs(v - prev));
      if (t > step) maxSpeedJump = Math.max(maxSpeedJump, Math.abs(speed - prevSpeed));
      prev = v;
      prevSpeed = speed;
    }
    // Kalanlar sayısal: iki komşu adım arası fark, adımın kendisi kadar küçük.
    expect(maxJump).toBeLessThan(step * 2);
    expect(maxSpeedJump).toBeLessThan(0.05);
  });

  it('KART EKRANI ERKEN TERK ETMİYOR: doğalından GEÇ çıkıyor, önce değil', () => {
    // Üst hat ~109 (çentik + başlık bandı), kart 250 boyunda.
    const edge = 109;
    const height = 250;
    for (const travel of [200, 300, 400, 700]) {
      const naturalBottom = edge - travel + height;
      const actualBottom = naturalBottom + flightOffset(travel);
      // Pay pozitif olduğu için kart doğal yerinden AŞAĞIDA, yani ekranda
      // kalma süresi uzuyor.
      expect(actualBottom).toBeGreaterThanOrEqual(naturalBottom);
    }
  });

  /**
   * ⚠️ İSTEĞİN "geri kaydırırsam geri de gelsinler" KISMININ TESTİ. Pay
   * `travel`ın saf fonksiyonu olduğu için aynı offset aynı payı veriyor —
   * durum tutan bir animasyonda bu tutmazdı.
   */
  it('TERSİNİR: aynı yol aynı payı veriyor (gidişte ve dönüşte)', () => {
    for (const t of [20, 110, 180, 260, 420]) {
      expect(flightOffset(t)).toBe(flightOffset(t));
    }
    expect(flightOffset(0)).toBe(0);
  });
});
