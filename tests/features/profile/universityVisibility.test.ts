import { buildVisibilityUpdates } from '@/features/profile/universityVisibility';

/**
 * "Beni kimler görsün / görmesin" — filtre ekranından profil ekranına taşındı.
 * Burada test edilen iki kural da SESSİZ bozulan cinsten: biri kullanıcıya 403
 * yedirir, diğeri listesini silememesine yol açar.
 */
describe('buildVisibilityUpdates', () => {
  const initial = {
    visibleOnly: ['itu.edu.tr'],
    hiddenFrom: ['ogr.deu.edu.tr'],
  };

  it('hiçbir şey değişmediyse boş payload üretir', () => {
    // Değişmeyen alanı göndermek, premium'u biten kullanıcıda dokunmadığı bir
    // listeyi yeniden yazmaya çalışmak demek → tüm istek 403.
    expect(buildVisibilityUpdates(initial, { ...initial })).toEqual({});
  });

  it('yalnızca GERÇEKTEN değişen alanı gönderir', () => {
    const updates = buildVisibilityUpdates(initial, {
      visibleOnly: ['itu.edu.tr'],
      hiddenFrom: ['metu.edu.tr'],
    });

    expect(updates).toEqual({ HiddenFromUniversityDomains: ['metu.edu.tr'] });
    expect(updates).not.toHaveProperty('VisibleOnlyToUniversityDomains');
  });

  it('liste boşaltıldığında tek boş string gönderir (temizleme sentinel\'ı)', () => {
    // 🔴 Boş dizi FormData'da HİÇBİR alan üretmiyor, sunucu da alanı `null`
    // (= değiştirme) görüyordu — yani "temizle" isteği sessizce kayboluyordu.
    // Tek boş string alanı var ediyor; backend'in Normalize'ı boşları atınca
    // sunucuda boş liste kalıyor = kısıtlama kalkıyor.
    const updates = buildVisibilityUpdates(initial, {
      visibleOnly: [],
      hiddenFrom: [],
    });

    expect(updates).toEqual({
      VisibleOnlyToUniversityDomains: [''],
      HiddenFromUniversityDomains: [''],
    });
  });

  it('sıra aynı kalmak kaydıyla eşit listeleri değişmemiş sayar', () => {
    const updates = buildVisibilityUpdates(
      { visibleOnly: ['a.edu.tr', 'b.edu.tr'], hiddenFrom: [] },
      { visibleOnly: ['a.edu.tr', 'b.edu.tr'], hiddenFrom: [] },
    );
    expect(updates).toEqual({});
  });
});
