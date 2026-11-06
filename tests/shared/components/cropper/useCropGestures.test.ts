import { act, renderHook } from '@testing-library/react-native';

import { useCropGestures } from '@/shared/components/cropper/useCropGestures';

describe('useCropGestures', () => {
  it('resetTransform hedefe çeker ve JS aynasını günceller', () => {
    const { result } = renderHook(() => useCropGestures({ cropping: true, peek: false, srcW: 3000, srcH: 4000,
      baseScale: 0.131, maxScale: 3, clampW: 393, clampH: 524, focusX: 196.5, focusY: 326.5 }));
    act(() => result.current.resetTransform(false, { s: 1.25, tx: 0, ty: 0 }));
    expect(result.current.latest.current).toEqual({ s: 1.25, tx: 0, ty: 0 });
    act(() => result.current.resetTransform(false));
    expect(result.current.latest.current).toEqual({ s: 1, tx: 0, ty: 0 });
  });
});
