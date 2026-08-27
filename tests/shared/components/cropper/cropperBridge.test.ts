import {
  bindCropper,
  isCropperAvailable,
  presentCropper,
} from '@/shared/components/cropper/cropperBridge';

const request = (uri: string) => ({ uri, srcWidth: 100, srcHeight: 200 });
const photo = { uri: 'file:///c.jpg', mime: 'image/jpeg', fileName: 'c.jpg' };

afterEach(() => bindCropper(null));

describe('cropperBridge', () => {
  it('host bağlı değilken ANINDA aborted çözer (asla asılı kalmaz)', async () => {
    expect(isCropperAvailable()).toBe(false);
    await expect(presentCropper(request('file:///a.jpg'))).resolves.toEqual({ status: 'aborted' });
  });

  it('bağlı host isteği alır ve sonucu geri verir', async () => {
    bindCropper((req, settle) => {
      expect(req.uri).toBe('file:///a.jpg');
      settle({ status: 'done', photo });
    });

    await expect(presentCropper(request('file:///a.jpg'))).resolves.toEqual({
      status: 'done',
      photo,
    });
  });

  it('istekleri TEK TEK işler (aynı anda iki kırpma ekranı açılmaz)', async () => {
    const settlers: ((o: any) => void)[] = [];
    bindCropper((_req, settle) => settlers.push(settle));

    const first = presentCropper(request('file:///a.jpg'));
    const second = presentCropper(request('file:///b.jpg'));

    expect(settlers).toHaveLength(1);
    settlers[0]({ status: 'skipped' });
    await expect(first).resolves.toEqual({ status: 'skipped' });

    // İlk istek kapanınca kuyruk bir adım ilerler.
    expect(settlers).toHaveLength(2);
    settlers[1]({ status: 'done', photo });
    await expect(second).resolves.toEqual({ status: 'done', photo });
  });

  it('aynı isteği iki kez sonuçlandırmak kuyruğu kaydırmaz', async () => {
    const settlers: ((o: any) => void)[] = [];
    bindCropper((_req, settle) => settlers.push(settle));

    const first = presentCropper(request('file:///a.jpg'));
    const second = presentCropper(request('file:///b.jpg'));

    settlers[0]({ status: 'skipped' });
    settlers[0]({ status: 'done', photo }); // yinelenen çağrı — yok sayılmalı
    await expect(first).resolves.toEqual({ status: 'skipped' });

    expect(settlers).toHaveLength(2);
    settlers[1]({ status: 'skipped' });
    await expect(second).resolves.toEqual({ status: 'skipped' });
  });

  it('host sökülünce uçuştaki VE kuyruktaki her şeyi aborted ile kapatır', async () => {
    bindCropper(() => {
      // Kasten hiç sonuçlandırmıyor: ekran açıkken unmount olma senaryosu.
    });

    const first = presentCropper(request('file:///a.jpg'));
    const second = presentCropper(request('file:///b.jpg'));

    bindCropper(null);

    await expect(first).resolves.toEqual({ status: 'aborted' });
    await expect(second).resolves.toEqual({ status: 'aborted' });
  });

  it('host sonradan bağlanınca bekleyen kuyruğu boşaltır', async () => {
    // Bu yol yalnızca host zaten bağlıyken kuyruğa girmiş istekler için
    // geçerli; bağlı değilken presentCropper anında aborted döner.
    const settlers: ((o: any) => void)[] = [];
    bindCropper((_req, settle) => settlers.push(settle));

    const pending = presentCropper(request('file:///a.jpg'));
    settlers[0]({ status: 'done', photo });

    await expect(pending).resolves.toEqual({ status: 'done', photo });
    expect(isCropperAvailable()).toBe(true);
  });
});
