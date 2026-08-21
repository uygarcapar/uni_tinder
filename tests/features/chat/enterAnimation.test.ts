import {
  consumeMessageEntering,
  markMessageEntering,
} from '@/features/chat/enterAnimation';

/**
 * Gönderim balonunun giriş animasyonu kaydı. Kritik davranış TEK KEZ tüketim:
 * balon hub echo'sunda (temp id → sunucu id) ve recycle'da yeniden render
 * oluyor; kayıt kalıcı olsaydı aynı mesaj her seferinde yeniden süzülürdü.
 */

describe('markMessageEntering / consumeMessageEntering', () => {
  it('işaretlenen id bir kez true, sonrasında false döner', () => {
    markMessageEntering('cid-1');
    expect(consumeMessageEntering('cid-1')).toBe(true);
    expect(consumeMessageEntering('cid-1')).toBe(false);
  });

  it('işaretlenmemiş / boş id false döner (gelen mesaj animasyona girmez)', () => {
    expect(consumeMessageEntering('cid-yok')).toBe(false);
    expect(consumeMessageEntering(undefined)).toBe(false);
    expect(consumeMessageEntering(null)).toBe(false);
  });

  it('boş id işaretlenmez', () => {
    markMessageEntering(undefined);
    markMessageEntering('');
    expect(consumeMessageEntering('')).toBe(false);
  });

  it('kayıt sınırı aşılınca en eski düşer, yenisi korunur', () => {
    for (let i = 0; i < 25; i++) markMessageEntering(`bulk-${i}`);
    // İlk kayıtlar (render'a hiç girmemiş gönderimler) sınır dolunca atılır.
    expect(consumeMessageEntering('bulk-0')).toBe(false);
    expect(consumeMessageEntering('bulk-24')).toBe(true);
  });
});
