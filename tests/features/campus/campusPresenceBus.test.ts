import {
  emitCampusPresenceDirty,
  onCampusPresenceDirty,
} from '@/features/campus/campusPresenceBus';

/**
 * KAMPÜS VARLIK OTOBÜSÜ — "konum-durumu değişti" sinyalinin tek yolu.
 *
 * Yayıncılar (sim aç/kapat, geofence task'ı) ile abone (useCampusSurface)
 * arasındaki tek bağlantı bu modül. uiBus KULLANILAMAZDI: reanimated import
 * ediyor ve geofence task'ı headless JS context'te ÇIPLAK koşmak zorunda —
 * bu yüzden buradaki en kritik test bir KAYNAK KURALI (sıfır import).
 */

it('emit aboneyi çağırıyor, bırakınca çağırmıyor', () => {
  const calls: number[] = [];
  const off = onCampusPresenceDirty(() => calls.push(1));
  emitCampusPresenceDirty();
  expect(calls).toHaveLength(1);
  off();
  emitCampusPresenceDirty();
  expect(calls).toHaveLength(1);
});

it('dinleyici yokken emit no-op (headless geofence bağlamı)', () => {
  expect(() => emitCampusPresenceDirty()).not.toThrow();
});

it('fırlatan dinleyici diğerlerini düşürmüyor', () => {
  const calls: string[] = [];
  onCampusPresenceDirty(() => {
    throw new Error('boom');
  });
  onCampusPresenceDirty(() => calls.push('ok'));
  expect(() => emitCampusPresenceDirty()).not.toThrow();
  expect(calls).toEqual(['ok']);
});

it('🔴 KAYNAK KURALI: modül SIFIR import — geofence task grafiğine girebilmeli', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as {
    readFileSync: (p: string, e: string) => string;
  };
  const src = readFileSync('src/features/campus/campusPresenceBus.ts', 'utf8');
  expect(src).not.toMatch(/^import /m);
  expect(src).not.toMatch(/require\(/);
});
