/**
 * Haversine — iki tüketicisi olduğu için ortak modüle taşındı
 * (`locationHeartbeat` debounce'u + kampüs sınırı hesapları).
 *
 * Test edilen şey hassasiyet değil, TAŞIMANIN DAVRANIŞI DEĞİŞTİRMEMESİ:
 * heartbeat'in 1 km eşiği ve kampüs ölçeğindeki metreler aynı sayıları üretmeye
 * devam etmeli.
 */

import { haversineKm, haversineMeters } from '@/shared/utils/geo';

describe('haversineKm', () => {
  it('aynı nokta sıfır', () => {
    expect(haversineKm(41.0082, 28.9784, 41.0082, 28.9784)).toBe(0);
  });

  it('İstanbul → Ankara ≈ 349 km', () => {
    const d = haversineKm(41.0082, 28.9784, 39.9334, 32.8597);
    expect(d).toBeGreaterThan(345);
    expect(d).toBeLessThan(354);
  });

  it('simetrik', () => {
    const a = haversineKm(41.08448, 29.05359, 41.1055, 29.024);
    const b = haversineKm(41.1055, 29.024, 41.08448, 29.05359);
    expect(a).toBeCloseTo(b, 9);
  });

  it('Boğaziçi → İTÜ ≈ 3.4 km (kampüsler arası ölçek)', () => {
    const d = haversineKm(41.08448, 29.05359, 41.1055, 29.024);
    expect(d).toBeGreaterThan(3.2);
    expect(d).toBeLessThan(3.6);
  });

  it('heartbeat eşiği: 1 km altı/üstü doğru ayrışıyor', () => {
    // ~0.005 derece enlem ≈ 555 m → eşiğin altında.
    expect(haversineKm(41.0, 29.0, 41.005, 29.0)).toBeLessThan(1);
    // ~0.02 derece enlem ≈ 2.2 km → eşiğin üstünde.
    expect(haversineKm(41.0, 29.0, 41.02, 29.0)).toBeGreaterThan(1);
  });
});

describe('haversineMeters', () => {
  it('km ile bin kat farklı', () => {
    const km = haversineKm(41.0, 29.0, 41.005, 29.0);
    expect(haversineMeters(41.0, 29.0, 41.005, 29.0)).toBeCloseTo(km * 1000, 6);
  });

  it('kampüs ölçeğinde metre veriyor', () => {
    // 0.0045 derece enlem ≈ 500 m.
    const m = haversineMeters(41.0845, 29.05, 41.089, 29.05);
    expect(m).toBeGreaterThan(480);
    expect(m).toBeLessThan(520);
  });
});
