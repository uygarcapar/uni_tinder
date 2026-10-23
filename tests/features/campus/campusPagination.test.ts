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
