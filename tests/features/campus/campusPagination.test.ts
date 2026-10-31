/**
 * LİSTE SÖZLEŞMESİ — sayfalama, tekilleştirme ve süzme.
 *
 * Akışta bir kez yaşanan SONSUZ FETCH DÖNGÜSÜ burada tekrar etmesin diye var:
 * `hasMore` true gelse bile cursor yoksa ya da sayfa boşsa devam etmek,
 * aynı sayfayı sonsuza kadar eklemek demek.
 *
 * Tekilleştirme de ekranda değil veri katmanında: kendi anım listenin başına
 * SABİTLENİYOR ve cursor penceresinin dışında — sunucu tarafında bir kez
 * sızarsa kart iki kez görünürdü.
 */

import {
  dedupeMoments,
  filterLiveMoments,
  isMomentDecided,
  mergeKeptMoments,
} from '@/features/campus/campusQueries';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

const NOW = Date.parse('2026-10-21T12:00:00Z');

const moment = (over: Partial<CampusMomentDto>): CampusMomentDto =>
  ({
    id: '1',
    userId: 'u1',
    displayName: 'Elif',
    age: 21,
    photoUrl: 'https://example/1.jpg',
    createdAt: '2026-10-21T09:00:00Z',
    expiresAt: '2026-10-22T09:00:00Z',
    mode: 'Dating',
    isMine: false,
    ...over,
  }) as CampusMomentDto;

describe('dedupeMoments', () => {
  it('aynı id iki kez gelirse İLKİ kalıyor', () => {
    const out = dedupeMoments([
      moment({ id: '1', displayName: 'İlk' }),
      moment({ id: '2' }),
      moment({ id: '1', displayName: 'Tekrar' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].displayName).toBe('İlk');
  });

  it('idsiz kayıt eleniyor — anahtarsız kart listede çökme sebebi', () => {
    const out = dedupeMoments([
      moment({ id: '' }),
      moment({ id: '2' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('2');
  });

  it('sıra korunuyor (kendi anım başta sabitleniyor)', () => {
    const out = dedupeMoments([
      moment({ id: '9', isMine: true }),
      moment({ id: '1' }),
      moment({ id: '2' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['9', '1', '2']);
  });
});

describe('filterLiveMoments', () => {
  it('süresi dolan düşüyor, yayında olan kalıyor', () => {
    const out = filterLiveMoments(
      [
        moment({ id: '1', expiresAt: '2026-10-21T11:59:00Z' }),
        moment({ id: '2', expiresAt: '2026-10-21T12:30:00Z' }),
      ],
      NOW,
    );
    expect(out.map((m) => m.id)).toEqual(['2']);
  });

  it('bozuk tarih listede KALIYOR', () => {
    const out = filterLiveMoments([moment({ id: '1', expiresAt: 'bozuk' })], NOW);
    expect(out).toHaveLength(1);
  });
});


/**
 * BEĞENİLEN AN ŞERİTTE KALIYOR (istek: "beğendikten sonra birinin kartı
 * kaybolmasın, kalsın orada hep").
 *
 * ⚠️🔴 ÇİVİLENEN ASIL ŞEY SIRA: sunucu listeyi yeniden-eskiye veriyor
 * (sözleşme §3) ve tutulan kart kuyruğa eklenirse ESKİ bir an şeridin en
 * sağına, yeni anların arkasına düşer — kullanıcı onu "kayboldu" sanar.
 * İkinci çivi: sunucu kartı GERİ VERMEYE başlarsa (ör. §2'deki süzme
 * değişirse) kart iki kez çizilmemeli.
 */
describe('mergeKeptMoments', () => {
  it('sunucunun düşürdüğü an GERİ GELİYOR — ve yerinde', () => {
    const out = mergeKeptMoments(
      [
        moment({ id: 'yeni', createdAt: '2026-10-21T11:00:00Z' }),
        moment({ id: 'eski', createdAt: '2026-10-21T08:00:00Z' }),
      ],
      [moment({ id: 'begenilen', createdAt: '2026-10-21T10:00:00Z' })],
    );
    expect(out.map((m) => m.id)).toEqual(['yeni', 'begenilen', 'eski']);
  });

  it('sunucu kartı yine veriyorsa KOPYA çıkmıyor', () => {
    const out = mergeKeptMoments(
      [moment({ id: 'a' }), moment({ id: 'b' })],
      [moment({ id: 'a' })],
    );
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('tutulan yoksa liste AYNI dizi — sıralama bedeli ödenmiyor', () => {
    const items = [moment({ id: 'a' }), moment({ id: 'b' })];
    expect(mergeKeptMoments(items, [])).toBe(items);
    expect(mergeKeptMoments(items, [moment({ id: 'a' })])).toBe(items);
  });

  it('süresi dolan tutulan an da SÜZÜLÜYOR — 24 saat kuralı delinmiyor', () => {
    const merged = mergeKeptMoments(
      [moment({ id: 'canli', expiresAt: '2026-10-22T09:00:00Z' })],
      [moment({ id: 'olmus', expiresAt: '2026-10-21T09:00:00Z' })],
    );
    expect(filterLiveMoments(merged, NOW).map((m) => m.id)).toEqual(['canli']);
  });
});


/**
 * KARAR KAPISI — cam tikin çizilip çizilmemesi.
 *
 * ⚠️🔴 ÇİVİLENEN ASIL ŞEY `canLike === false` KONTROLÜ. Alan sunucuda zorunlu
 * (backend 2026-10-30) ama istemcide OPSİYONEL kalıyor — diskte/bellekte onu
 * taşımayan eski yanıtlar olabiliyor. Düz bir olumsuzlama (`!moment.canLike`)
 * o yanıtlarda HER kartı "karar verilmiş" sayıp beğeni butonunu her yerden
 * kaldırırdı: yüzeyin tamamı sessizce ölürdü.
 */
describe('isMomentDecided', () => {
  it('alan GELMEDİĞİNDE karar verilmemiş sayılıyor — tik çizilmeye devam', () => {
    expect(isMomentDecided(moment({ id: 'a' }))).toBe(false);
    expect(isMomentDecided(moment({ id: 'a' }), new Set())).toBe(false);
  });

  it('sunucu `canLike: false` dediyse KARAR VERİLMİŞ', () => {
    expect(isMomentDecided(moment({ id: 'a', canLike: false }))).toBe(true);
  });

  it('`canLike: true` oturum kümesine RAĞMEN… kümeye bakıyor (yedek dal)', () => {
    // Sunucu "beğenebilirsin" diyorsa normalde küme boş olur; ikisi çelişirse
    // kümeyi dinlemek güvenli taraf — bu cihazda karar verildiği KESİN.
    const m = moment({ id: 'a', canLike: true });
    expect(isMomentDecided(m, new Set(['a']))).toBe(true);
  });

  it('oturum kümesi yedek: alan yokken bu cihazın kararını biliyor', () => {
    expect(isMomentDecided(moment({ id: 'a' }), new Set(['a']))).toBe(true);
    expect(isMomentDecided(moment({ id: 'b' }), new Set(['a']))).toBe(false);
  });

  it('an yoksa karar da yok', () => {
    expect(isMomentDecided(null)).toBe(false);
    expect(isMomentDecided(undefined, new Set(['a']))).toBe(false);
  });
});
