import { ImageManipulator } from 'expo-image-manipulator';

import { applyCrop } from '@/shared/components/cropper/applyCrop';

const rect = { originX: 10, originY: 20, width: 2400, height: 3200 };

// Her test kendi spy'larını kurar: global mock'u (jest.setup.ts) yalnız bu
// çağrı için ezilir, böylece crop/resize/release çağrıları doğrulanabilir.
function arrange(opts: { renderError?: Error; saveError?: Error } = {}) {
  const ctx = {
    crop: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    renderAsync: jest.fn(),
    release: jest.fn(),
  };
  const ref = {
    saveAsync: jest.fn(async () => {
      if (opts.saveError) throw opts.saveError;
      return { uri: 'file:///step.jpg', width: 2400, height: 3200 };
    }),
    release: jest.fn(),
  };
  ctx.renderAsync.mockImplementation(async () => {
    if (opts.renderError) throw opts.renderError;
    return ref;
  });
  (ImageManipulator.manipulate as jest.Mock).mockImplementationOnce(() => ctx);
  return { ctx, ref };
}

afterEach(() => {
  jest.clearAllMocks();
});

it('dikdörtgeni keser, ölçeklemez, 0.95 JPEG kaydeder, ölçüyü sonuçtan okur', async () => {
  const { ctx, ref } = arrange();

  const out = await applyCrop('file:///src.jpg', rect);

  expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///src.jpg');
  expect(ctx.crop).toHaveBeenCalledWith(rect);
  expect(ctx.resize).not.toHaveBeenCalled();
  expect(ref.saveAsync).toHaveBeenCalledWith({ compress: 0.95, format: 'jpeg' });
  expect(out).toEqual({ uri: 'file:///step.jpg', width: 2400, height: 3200 });
  expect(ref.release).toHaveBeenCalled();
  expect(ctx.release).toHaveBeenCalled();
});

// Review Focus 4
it('render patlarsa fırlatır ve context yine bırakılır', async () => {
  const { ctx } = arrange({ renderError: new Error('render failed') });

  await expect(applyCrop('file:///src.jpg', rect)).rejects.toThrow('render failed');
  expect(ctx.release).toHaveBeenCalled();
});

it('kaydetme patlarsa fırlatır ve hem ref hem context bırakılır', async () => {
  const { ctx, ref } = arrange({ saveError: new Error('save failed') });

  await expect(applyCrop('file:///src.jpg', rect)).rejects.toThrow('save failed');
  expect(ref.release).toHaveBeenCalled();
  expect(ctx.release).toHaveBeenCalled();
});
