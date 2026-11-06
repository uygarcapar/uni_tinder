import { Image } from 'react-native';

import { resolveShotSize } from '@/shared/components/camera/shotSize';

jest.mock('@/shared/utils/devLog', () => ({ devLog: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

describe('resolveShotSize', () => {
  it('ölçü varsa okumaz', async () => {
    const getSize = jest.spyOn(Image, 'getSize');
    await expect(
      resolveShotSize({ uri: 'a', width: 3000, height: 4000 }),
    ).resolves.toEqual({ width: 3000, height: 4000 });
    expect(getSize).not.toHaveBeenCalled();
  });

  it('ölçü 0 ise Image.getSize okur', async () => {
    const getSize = jest
      .spyOn(Image, 'getSize')
      .mockImplementation(((_uri: string, success: any) => success(1200, 1600)) as any);
    await expect(
      resolveShotSize({ uri: 'file:///a.jpg', width: 0, height: 0 }),
    ).resolves.toEqual({ width: 1200, height: 1600 });
    expect(getSize.mock.calls[0][0]).toBe('file:///a.jpg');
  });

  it('ölçülerden yalnız biri 0 ise de okur', async () => {
    jest
      .spyOn(Image, 'getSize')
      .mockImplementation(((_uri: string, success: any) => success(900, 1200)) as any);
    await expect(
      resolveShotSize({ uri: 'b', width: 3000, height: 0 }),
    ).resolves.toEqual({ width: 900, height: 1200 });
  });

  it('okunamazsa null', async () => {
    jest
      .spyOn(Image, 'getSize')
      .mockImplementation(((_uri: string, _ok: any, fail: any) =>
        fail(new Error('decode'))) as any);
    await expect(
      resolveShotSize({ uri: 'c', width: 0, height: 0 }),
    ).resolves.toBeNull();
  });

  it('okunan ölçü 0 ise null', async () => {
    jest
      .spyOn(Image, 'getSize')
      .mockImplementation(((_uri: string, success: any) => success(0, 0)) as any);
    await expect(
      resolveShotSize({ uri: 'd', width: 0, height: 0 }),
    ).resolves.toBeNull();
  });
});
