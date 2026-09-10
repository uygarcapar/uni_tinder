import {
  buildVisibilityUpdates,
  isDirty,
  maxDomainsFor,
  resolveVisibilityDraft,
  type VisibilityDraft,
} from '@/features/profile/universityVisibility';

/**
 * "Beni kimler görsün / görmesin" — 2026-09-10'dan beri TEK MOD.
 *
 * Backend ikisi birden dolu gelen isteğe 400 dönüyor (`f61d4c0`), yani burada
 * test edilen kurallar sözleşmenin parçası: biri kullanıcıya 403 yedirir, biri
 * listesini silememesine yol açar, biri de isteği doğrudan 400'e düşürür.
 */
describe('resolveVisibilityDraft', () => {
  it('iki liste de boşsa herkes görebilir', () => {
    expect(resolveVisibilityDraft({})).toEqual({ mode: 'everyone', domains: [] });
    expect(resolveVisibilityDraft(null)).toEqual({ mode: 'everyone', domains: [] });
  });

  it('dolu olan listeden modu çıkarır', () => {
    expect(
      resolveVisibilityDraft({ visibleOnlyToUniversityDomains: ['itu.edu.tr'] }),
    ).toEqual({ mode: 'allow', domains: ['itu.edu.tr'] });

    expect(
      resolveVisibilityDraft({ hiddenFromUniversityDomains: ['metu.edu.tr'] }),
    ).toEqual({ mode: 'block', domains: ['metu.edu.tr'] });
  });

  it('🔴 eski kayıtlarda ikisi birden doluysa ALLOW kazanır', () => {
    // Backend migration'ı da bu yönü seçti. Ters yön (Block'u kazandırmak)
    // kullanıcıyı bir anda yüzlerce üniversiteye görünür kılardı — gizlilik
    // ayarında kabul edilemez.
    expect(
      resolveVisibilityDraft({
        visibleOnlyToUniversityDomains: ['itu.edu.tr'],
        hiddenFromUniversityDomains: ['metu.edu.tr'],
      }),
    ).toEqual({ mode: 'allow', domains: ['itu.edu.tr'] });
  });

  it('block listesi 5, allow listesi 3 domainde kırpılır', () => {
    expect(maxDomainsFor('allow')).toBe(3);
    expect(maxDomainsFor('block')).toBe(5);

    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `${x}.edu.tr`);
    expect(
      resolveVisibilityDraft({ hiddenFromUniversityDomains: six }).domains,
    ).toHaveLength(5);
    expect(
      resolveVisibilityDraft({ visibleOnlyToUniversityDomains: six }).domains,
    ).toHaveLength(3);
  });
});

describe('buildVisibilityUpdates', () => {
  const allow: VisibilityDraft = { mode: 'allow', domains: ['itu.edu.tr'] };

  it('hiçbir şey değişmediyse boş payload üretir', () => {
    // Değişmeyeni göndermek, premium'u biten kullanıcıda dokunmadığı bir kuralı
    // yeniden yazmaya çalışmak demek → tüm istek 403.
    expect(buildVisibilityUpdates(allow, { ...allow })).toEqual({});
    expect(isDirty(allow, { ...allow })).toBe(false);
  });

  it('🔴 İKİ ALAN ASLA aynı anda dolu gitmez — backend 400 döner', () => {
    const updates = buildVisibilityUpdates(allow, {
      mode: 'block',
      domains: ['metu.edu.tr'],
    });

    expect(updates).toEqual({
      VisibleOnlyToUniversityDomains: [''],
      HiddenFromUniversityDomains: ['metu.edu.tr'],
    });
  });

  it('mod değişince karşı mod AÇIKÇA temizlenir', () => {
    const updates = buildVisibilityUpdates(
      { mode: 'block', domains: ['metu.edu.tr'] },
      allow,
    );

    expect(updates.VisibleOnlyToUniversityDomains).toEqual(['itu.edu.tr']);
    // Sentinel: boş dizi FormData'da hiçbir alan üretmiyor, sunucu da alanı
    // "değiştirme" sayıyordu — eski block kuralı ayakta kalırdı.
    expect(updates.HiddenFromUniversityDomains).toEqual(['']);
  });

  it('herkes görebilsin: iki alan da temizleme sentinel\'ı ile gider', () => {
    expect(buildVisibilityUpdates(allow, { mode: 'everyone', domains: [] })).toEqual({
      VisibleOnlyToUniversityDomains: [''],
      HiddenFromUniversityDomains: [''],
    });
  });

  it('mod seçili ama liste boşsa "herkes görebilsin" ile aynı sonuca varır', () => {
    // Kullanıcı listeyi X ile boşaltıp kaydedebiliyor; bu da kısıtlamayı kaldırmak.
    expect(buildVisibilityUpdates(allow, { mode: 'allow', domains: [] })).toEqual({
      VisibleOnlyToUniversityDomains: [''],
      HiddenFromUniversityDomains: [''],
    });
    // Ama zaten kısıtlaması olmayan kullanıcıda boş bir tur attırmıyoruz.
    expect(
      buildVisibilityUpdates(
        { mode: 'everyone', domains: [] },
        { mode: 'allow', domains: [] },
      ),
    ).toEqual({});
  });

  it('tavanı aşan seçim payload\'da ikinci kez kırpılır', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `${x}.edu.tr`);
    const updates = buildVisibilityUpdates(
      { mode: 'everyone', domains: [] },
      { mode: 'block', domains: six },
    );
    expect(updates.HiddenFromUniversityDomains).toHaveLength(5);
  });

  it('sıra aynı kalmak kaydıyla eşit listeleri değişmemiş sayar', () => {
    const d: VisibilityDraft = { mode: 'allow', domains: ['a.edu.tr', 'b.edu.tr'] };
    expect(buildVisibilityUpdates(d, { ...d, domains: [...d.domains] })).toEqual({});
  });
});
