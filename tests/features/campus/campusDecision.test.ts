/**
 * KAMPÜS KARARI — sözleşmenin sessizce kırılabilecek üç yeri.
 *
 * 1. Kampüs BEĞENİSİ Keşif sayaçlarına DOKUNMAMALI. Sunucu `remainingSwipes`i
 *    tüketmiyor; istemci düşürseydi kullanıcı Keşif'e geçtiğinde sayacın gözle
 *    azaldığını görür ve hakkını kaybettiğini sanardı.
 * 2. `source`/`momentId` gövdeye DOLU gitmeli (mod sözleşmesinin aynısı: alan
 *    ya dolu gider ya hiç gitmez).
 * 3. `source` VERİLMEDİĞİNDE bugünkü davranış birebir korunmalı — sahadaki
 *    bütün Keşif kararları bu yoldan geçiyor.
 */

import api from '@/shared/services/api';
import swipeService from '@/features/discover/swipeService';
import { API_ENDPOINTS } from '@/shared/constants/api';

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve({ isSuccess: true, result: {} })) },
}));

const post = api.post as jest.Mock;

describe('swipeService.likeUser — kaynak alanları', () => {
  beforeEach(() => post.mockClear());

  it('kampüsten gelen beğenide source ve momentId gövdede', async () => {
    await swipeService.likeUser('8812', null, 'Dating', {
      source: 'CampusMoment',
      momentId: '4471',
    });
    expect(post).toHaveBeenCalledWith(API_ENDPOINTS.SWIPE_LIKE, {
      targetUserId: '8812',
      swipeType: 'like',
      mode: 'Dating',
      source: 'CampusMoment',
      momentId: '4471',
    });
  });

  it('kaynak verilmezse alanlar HİÇ gönderilmiyor (eski davranış birebir)', async () => {
    await swipeService.likeUser('8812', null, 'Friends');
    const body = post.mock.calls[0][1];
    expect(body).toEqual({
      targetUserId: '8812',
      swipeType: 'like',
      mode: 'Friends',
    });
    expect('source' in body).toBe(false);
    expect('momentId' in body).toBe(false);
  });

  it('momentId yoksa yalnız source gidiyor — boş alan gönderilmiyor', async () => {
    await swipeService.likeUser('8812', null, null, { source: 'CampusMoment' });
    const body = post.mock.calls[0][1];
    expect(body.source).toBe('CampusMoment');
    expect('momentId' in body).toBe(false);
    // Mod boşsa o da hiç gitmiyor (sunucuda enum çözümlemesini patlatıyor).
    expect('mode' in body).toBe(false);
  });

  it('GEÇME swipe ucuna GİTMİYOR — kampüsün kendi ucu var', () => {
    // Sözleşmenin en kolay yanlış hatırlanan yeri: geçme ortak swipe satırı
    // yazsaydı kampüste geçilen kişi Keşif destesinden de 3 gün düşerdi.
    expect(API_ENDPOINTS.CAMPUS_MOMENT_PASS('4471')).toBe(
      '/api/campus/moments/4471/pass',
    );
    expect(API_ENDPOINTS.CAMPUS_MOMENT_PASS('4471')).not.toContain('swipe');
  });
});
