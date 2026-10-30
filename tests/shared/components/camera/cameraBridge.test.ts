import {
  bindCamera,
  isCameraCaptureAvailable,
  presentCameraCapture,
} from '@/shared/components/camera/cameraBridge';

const shot = { uri: 'file:///shot.jpg', width: 3024, height: 4032 };

afterEach(() => bindCamera(null));

describe('cameraBridge', () => {
  it('host bağlı değilken ANINDA unavailable çözer (çağıran sistem kamerasına düşer)', async () => {
    expect(isCameraCaptureAvailable()).toBe(false);
    await expect(presentCameraCapture()).resolves.toEqual({ status: 'unavailable' });
  });

  it('bağlı host çekimi geri verir', async () => {
    bindCamera((_request, settle) => settle({ status: 'captured', shot }));

    await expect(presentCameraCapture()).resolves.toEqual({
      status: 'captured',
      shot,
    });
  });

  it('BAŞLANGIÇ KAMERASI isteği host\'a geçiyor — ve kuyrukta taşınıyor', () => {
    // Kampüs anı ön kamerayla açılıyor (istek). Ayar modül seviyesinde bir
    // "son istek" değişkeninde tutulsaydı, üst üste gelen iki çağrıda
    // ikincisinin ayarı birincinin oturumuna sızardı.
    const seen: unknown[] = [];
    bindCamera((request) => seen.push(request));

    presentCameraCapture({ facing: 'front' });
    presentCameraCapture();

    expect(seen).toEqual([{ facing: 'front' }]);
  });

  it('istekleri TEK TEK işler (aynı anda iki kamera açılmaz)', async () => {
    const settlers: ((o: any) => void)[] = [];
    bindCamera((_request, settle) => settlers.push(settle));

    const first = presentCameraCapture();
    const second = presentCameraCapture();

    expect(settlers).toHaveLength(1);
    settlers[0]({ status: 'cancelled' });
    await expect(first).resolves.toEqual({ status: 'cancelled' });

    expect(settlers).toHaveLength(2);
    settlers[1]({ status: 'captured', shot });
    await expect(second).resolves.toEqual({ status: 'captured', shot });
  });

  it('aynı isteği iki kez sonuçlandırmak kuyruğu kaydırmaz', async () => {
    const settlers: ((o: any) => void)[] = [];
    bindCamera((_request, settle) => settlers.push(settle));

    const first = presentCameraCapture();
    const second = presentCameraCapture();

    settlers[0]({ status: 'cancelled' });
    settlers[0]({ status: 'captured', shot }); // yinelenen çağrı — yok sayılmalı
    await expect(first).resolves.toEqual({ status: 'cancelled' });

    expect(settlers).toHaveLength(2);
    settlers[1]({ status: 'cancelled' });
    await expect(second).resolves.toEqual({ status: 'cancelled' });
  });

  it('host sökülünce uçuştaki VE kuyruktaki her şeyi unavailable ile kapatır', async () => {
    bindCamera(() => {
      // Kasten hiç sonuçlandırmıyor: kamera açıkken unmount olma senaryosu.
    });

    const first = presentCameraCapture();
    const second = presentCameraCapture();

    bindCamera(null);

    await expect(first).resolves.toEqual({ status: 'unavailable' });
    await expect(second).resolves.toEqual({ status: 'unavailable' });
  });
});
