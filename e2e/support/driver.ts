/**
 * Sürücü yardımcıları — W3C pointer eylemleri, klavye, zaman aşımı sarmalı.
 *
 * `browser.pause` bu katmanın DIŞINDA yasak (ESLint çiti). Burada iki istisna
 * var ve ikisi de yorumunda gerekçeli.
 */
import { BUNDLE_ID } from './env';

export interface Point {
  x: number;
  y: number;
}

/**
 * `$()`in döndürdüğü zincirlenebilir referans.
 *
 * `await` edilmiyor ve edilmemeli: `getLocation`/`getSize`/`waitForDisplayed`
 * zincir üzerinde DOĞRUDAN çağrılabiliyor. (Union tipi denendi ve TS `Awaited`
 * çözümünü bozuyor — `Element` kendisi de thenable olduğu için.)
 */
export type ElementRef = ChainablePromiseElement;

/** Elemanın merkez noktası (pt — WDA logical koordinat kullanıyor). */
export async function centerOf(element: ElementRef): Promise<Point> {
  const [{ x, y }, { width, height }] = await Promise.all([
    element.getLocation(),
    element.getSize(),
  ]);
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
}

async function performTouch(
  actions: Array<Record<string, unknown>>
): Promise<void> {
  await browser.performActions([
    { type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions },
  ]);
  await browser.releaseActions();
}

/**
 * Basılı tutma. `mobile: touchAndHold` yerine W3C `pause` kullanılıyor çünkü
 * süreyi BİZ kontrol etmek zorundayız: Ayarlar'daki gizli teşhis menüsü
 * `delayLongPress={1200}` istiyor ve altında kalan her süre normal basış olur
 * (DEV'de Toast galerisini açar — yanlış dal).
 */
export async function longPressAt(point: Point, durationMs: number): Promise<void> {
  await performTouch([
    { type: 'pointerMove', duration: 0, x: point.x, y: point.y },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: durationMs },
    { type: 'pointerUp', button: 0 },
  ]);
}

export async function longPress(element: ElementRef, durationMs = 1_000): Promise<void> {
  await element.waitForDisplayed({ timeout: 15_000 });
  await longPressAt(await centerOf(element), durationMs);
}

/**
 * Parmakla sürükleme — ara adımlarla.
 *
 * Ara adımlar şart olduğu yerler: PanResponder'ın responder'ı sahiplenmesi
 * (boy cetveli) ve Reanimated'ın jest aktifleşme eşiğini geçmesi (Fire için
 * aşağı çekiş). Tek hamlede de "çalışıyor" ama ürünün jest yolundan geçmiyor.
 */
export async function dragBy(
  from: Point,
  delta: Point,
  { steps = 12, stepMs = 25, holdBeforeMs = 80, holdAfterMs = 120 } = {}
): Promise<void> {
  const moves = Array.from({ length: steps }, (_, i) => ({
    type: 'pointerMove' as const,
    duration: stepMs,
    x: from.x + Math.round((delta.x * (i + 1)) / steps),
    y: from.y + Math.round((delta.y * (i + 1)) / steps),
  }));
  await performTouch([
    { type: 'pointerMove', duration: 0, x: from.x, y: from.y },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: holdBeforeMs },
    ...moves,
    { type: 'pause', duration: holdAfterMs },
    { type: 'pointerUp', button: 0 },
  ]);
}

export const Keyboard = {
  async isShown(): Promise<boolean> {
    return browser.$('-ios class chain:**/XCUIElementTypeKeyboard').isExisting();
  },

  /**
   * Klavyeyi kapatır. WDA'nın `hideKeyboard()`u iOS'ta güvenilmez; ekranların
   * çoğu `TouchableWithoutFeedback onPress={Keyboard.dismiss}` ile sarılı
   * (RegisterStep1Screen.tsx:186, RegisterStep12Screen.tsx:136) → üst bölgeye
   * dokunmak çalışıyor.
   */
  async dismissIfOpen(): Promise<void> {
    if (!(await this.isShown())) return;
    const done = browser.$(
      '-ios class chain:**/XCUIElementTypeButton[`label == "Done" OR label == "Bitti" OR label == "return"`]'
    );
    if (await done.isExisting()) {
      await done.click();
    } else {
      const { width, height } = await browser.getWindowSize();
      await performTouch([
        { type: 'pointerMove', duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.12) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 40 },
        { type: 'pointerUp', button: 0 },
      ]);
    }
    await browser
      .$('-ios class chain:**/XCUIElementTypeKeyboard')
      .waitForExist({ timeout: 3_000, reverse: true })
      .catch(() => {});
  },
};

/**
 * Deep link ile dolaşma — BİRİNCİL yol.
 *
 * Native tab bar'ın UITabBarItem'ları etiketsiz (TabNavigator.tsx:192
 * `tabBarLabel: Platform.select({ ios: '' })`) ve `unstable` API'de
 * testID/accessibilityLabel kolu YOK → `~` ile erişilemiyorlar. Tab'a gerçekten
 * dokunmak ayrı bir spec'in konusu (03-tabbar-reachability).
 */
export async function deepLink(path: string): Promise<void> {
  await browser.execute('mobile: deepLink', { url: `lit://${path}`, bundleId: BUNDLE_ID });
}

/** XCUITest uygulama durumu 4 = ön planda çalışıyor. */
export const APP_STATE_FOREGROUND = 4;

export async function appState(): Promise<number> {
  return browser.queryAppState(BUNDLE_ID);
}

/** Promise'e sert zaman aşımı — `getPageSource` kilitlenme dedektörü için. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
