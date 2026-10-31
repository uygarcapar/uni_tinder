import { useEffect, useState } from "react";
import { devLog } from "@/shared/utils/devLog";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FOTOĞRAFIN KENDİ RENGİ — kartın arkasındaki gölgenin tonu.
 * ══════════════════════════════════════════════════════════════════════════
 * İstek: "arkadaki gölge temaya göre değil FOTONUN RENKLERİNE göre olsun."
 *
 * Yani kart, altına kendi fotoğrafının rengini yayıyor (Apple Music'in albüm
 * kapağı halesi, Spotify'ın kart arka planı — aynı fikir).
 *
 * ── Neden YENİ PAKET YOK ───────────────────────────────────────────────────
 * Hazır yol `react-native-image-colors` (iOS `UIImageColors`, Android
 * `Palette`). Eklenmedi: aynı işi YAPAN bir motor projede ZATEN var
 * (`@shopify/react-native-skia`, akış destesindeki ışık onu kullanıyor) ve
 * bağımlılık bütçesi bilinçli olarak dar tutuluyor (2026-07 denetiminde 14
 * paket söküldü). Skia yolu üstelik iki platformda da AYNI sayıyı veriyor —
 * `UIImageColors` ile `Palette` farklı algoritmalar, yani aynı fotoğraf iki
 * telefonda iki ayrı renk üretirdi.
 *
 * ⚠️ SKIA sRGB'ye KİLİTLİ: geniş gamut (P3) bir fotoğrafın rengi burada bir
 * tık sönük çıkıyor. Gölge için sorun değil — zaten doygunluğu aşağıdaki
 * `boost` yeniden kuruyor.
 *
 * ── Boru hattı ─────────────────────────────────────────────────────────────
 *   1. foto ikinci kez indiriliyor (`Skia.Data.fromURI`) — ağ önbelleğinden
 *      geliyor, üstelik sonuç URL başına BİR KEZ hesaplanıyor (modül
 *      önbelleği);
 *   2. 12×12'lik bir offscreen yüzeye küçültülüp çiziliyor — tam boy bir
 *      fotoğrafın pikselini okumak milyonlarca bayt demek;
 *   3. pikseller doygunluk ağırlıklı ortalanıyor (`glowFromPixels`);
 *   4. sonuç bir gölge rengine dönüştürülüyor (`boost`).
 *
 * ⚠️ SAF KISIM AYRI (`glowFromPixels`): renk matematiği gözle doğrulanamıyor
 * ve testi node'da koşuyor; Skia çağrıları ise yalnız bayt üretiyor.
 */

/** Örnekleme ızgarası — 144 piksel, baskın tonu vermeye fazlasıyla yeter. */
const SAMPLE = 12;

/**
 * ⚠️ URL BAŞINA TEK HESAP, OTURUM BOYUNCA. Şeritte N kart var ve aynı kart
 * kaydırmada birçok kez mount oluyor; önbellek olmasa her mount yeni bir
 * indirme + çözme turu açardı.
 *
 * ⚠️ `null` DEĞER DE ÖNBELLEKTE: çözülemeyen bir fotoğraf her seferinde
 * yeniden denenmemeli (bozuk URL'de sonsuz istek).
 */
const cache = new Map<string, string | null>();
/** Aynı URL için uçuşan ikinci bir hesap açılmasın. */
const inflight = new Map<string, Promise<string | null>>();

/**
 * PİKSELLERDEN GÖLGE RENGİ — saf, testli.
 *
 * ⚠️ DÜZ ORTALAMA DEĞİL, DOYGUNLUK AĞIRLIKLI: bir fotoğrafın çoğu gri
 * (asfalt, duvar, gökyüzü) ve düz ortalama her kartı aynı çamur griye
 * düşürüyor. Ağırlık `doygunluk²` — yani kırmızı bir mont, arkasındaki gri
 * duvara rağmen rengi belirliyor.
 *
 * ⚠️ ÇOK KOYU PİKSELLER DIŞARIDA (`val` kapısı): gölgenin kendisi koyu bir
 * yüzeyde duruyor, siyahtan türetilen bir gölge görünmez olurdu.
 *
 * ⚠️ YEDEK DÜZ ORTALAMA: gerçekten renksiz bir fotoğrafta (siyah-beyaz)
 * ağırlık toplamı sıfıra iniyor; o dalda gri bir hâle doğru cevap — `null`
 * dönmek kartı tamamen gölgesiz bırakırdı.
 */
export function glowFromPixels(pixels: Uint8Array | null): string | null {
  if (!pixels || pixels.length < 4) return null;

  let wr = 0;
  let wg = 0;
  let wb = 0;
  let weight = 0;
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let count = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    // Saydam pikseller hiç sayılmıyor (kenar yumuşatması, boş alan).
    if (pixels[i + 3] < 8) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    ar += r;
    ag += g;
    ab += b;
    count += 1;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const val = max / 255;
    const w = val < 0.12 ? 0 : sat * sat * val;
    wr += r * w;
    wg += g * w;
    wb += b * w;
    weight += w;
  }

  if (count === 0) return null;
  const r = weight > 1e-4 ? wr / weight : ar / count;
  const g = weight > 1e-4 ? wg / weight : ag / count;
  const b = weight > 1e-4 ? wb / weight : ab / count;
  return boost(r, g, b);
}

/**
 * HÂLEYE ÇEVİR — doygunluğu ve parlaklığı tabanla.
 *
 * Ham ortalama çoğu fotoğrafta soluk bir pastel çıkıyor ve %35 alfayla
 * çizilen bir gölgede fiilen görünmüyor. Taban iki sayı:
 *   • doygunluk en az 0.5 — rengin HANGİ renk olduğu okunsun,
 *   • parlaklık 0.65–0.95 arası — koyu fotoğrafın gölgesi siyah bir lekeye,
 *     çok açık olanınki beyaz bir sise dönmesin.
 */
function boost(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;

  const nextS = Math.max(s, 0.5);
  const nextV = Math.min(Math.max(v, 0.65), 0.95);

  // Ton (hue) korunuyor: yalnız doygunluk/parlaklık yeniden kuruluyor.
  const hue = hueOf(r, g, b, max, min);
  return hsvToHex(hue, nextS, nextV);
}

function hueOf(
  r: number,
  g: number,
  b: number,
  max: number,
  min: number,
): number {
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rp)}${to(gp)}${to(bp)}`;
}

/**
 * FOTOĞRAFI ÖRNEKLE — Skia tarafı.
 *
 * ⚠️🔴 SKIA TEMBEL YÜKLENİYOR (`require`, modül başında `import` DEĞİL):
 * native modül testte yok ve erken açılışta hazır olmayabiliyor; modül
 * düzeyinde bir import, kampüs yüzeyinin TAMAMINI o riske bağlardı (aynı
 * kural FireFlameCanvas ve FeedMomentsPeek'te de yazılı: `Skia.*` native
 * hazır olmadan çağrılırsa patlıyor).
 */
async function samplePhoto(uri: string): Promise<string | null> {
  try {
    const skia = require("@shopify/react-native-skia");
    const { Skia, AlphaType, ColorType } = skia;

    const data = await Skia.Data.fromURI(uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return null;

    /**
     * ⚠️ KÜÇÜLTEREK OKUYORUZ: `readPixels` ölçeklemiyor, kırpıyor. Tam boy
     * bir fotoğrafın pikselini okumak hem onlarca MB hem de boşuna — baskın
     * ton 12×12'de zaten var.
     */
    const surface = Skia.Surface.MakeOffscreen(SAMPLE, SAMPLE);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: image.width(), height: image.height() },
      { x: 0, y: 0, width: SAMPLE, height: SAMPLE },
      Skia.Paint(),
    );
    surface.flush();

    const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
      width: SAMPLE,
      height: SAMPLE,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    return glowFromPixels(pixels as Uint8Array | null);
  } catch (err) {
    // Sessiz degradasyon: gölge rengi bir SÜS, kart onsuz da doğru çiziliyor.
    devLog("[campus] foto rengi örneklenemedi", { uri, err });
    return null;
  }
}

/**
 * FOTOĞRAFIN GÖLGE RENGİ — `null` iken çağıran kendi yedeğine düşüyor.
 *
 * ⚠️ ÖNBELLEKTEN GELEN DEĞER İLK RENDER'DA VERİLİYOR (`useState`
 * başlatıcısı): kart her mount'ta bir kare gri gölgeyle doğup sonra renge
 * atlamıyor.
 */
export function useCampusPhotoGlow(uri: string | null | undefined): string | null {
  const [glow, setGlow] = useState<string | null>(() =>
    uri ? (cache.get(uri) ?? null) : null,
  );

  useEffect(() => {
    if (!uri) {
      setGlow(null);
      return;
    }
    const cached = cache.get(uri);
    if (cached !== undefined) {
      setGlow(cached);
      return;
    }

    let alive = true;
    const pending =
      inflight.get(uri) ??
      samplePhoto(uri).then((color) => {
        cache.set(uri, color);
        inflight.delete(uri);
        return color;
      });
    inflight.set(uri, pending);
    pending.then((color) => {
      if (alive) setGlow(color);
    });
    return () => {
      alive = false;
    };
  }, [uri]);

  return glow;
}
