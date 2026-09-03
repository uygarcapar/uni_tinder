import { useEffect, useMemo, useState } from "react";
import { PixelRatio, Platform } from "react-native";
import {
  ClipOp,
  FilterMode,
  ImageFormat,
  MipmapMode,
  PaintStyle,
  Skia,
} from "@shopify/react-native-skia";
import { Directory, File, Paths } from "expo-file-system";
import profileService from "@/features/profile/profileService";
import uiBus from "@/shared/services/uiBus";
import { resolveMainPhotoUri } from "@/shared/utils/photoUri";
import { devLog } from "@/shared/utils/devLog";

/**
 * Profil sekmesinin ikonu: `person` SF Symbol'ü değil, kullanıcının kendi ana
 * fotoğrafı — yuvarlak, ince çerçeveli. Çerçeve seçili sekmede `colors.text`
 * (açıkta siyah, koyuda beyaz — diğer sekmelerin aktif tint'iyle aynı ton),
 * seçili değilken sönük gri.
 *
 * NEDEN RASTERİZE EDİYORUZ: native tab bar (createNativeBottomTabNavigator →
 * RNSTabsScreen) ikon olarak yalnız SF Symbol ya da bir IMAGE SOURCE kabul
 * ediyor; React component/View geçilemiyor. Yani "Image + borderRadius" diye
 * bir seçenek YOK — daireyi ve çerçeveyi biz piksellere basmak zorundayız.
 * UITabBarItem görüntüyü de kırpmıyor/ölçeklemiyor: kare bir foto verirsek kare
 * çizilir.
 *
 * Zincir: fotoğrafı Skia ile indir → daireye kırp → çerçeveyi çiz → PNG olarak
 * cache'e yaz → `{ uri }` image source olarak tab bar'a ver.
 * `tinted: false` ŞART (bkz. TabNavigator): aksi halde iOS görüntüyü template
 * olarak alıp aktif/pasif tint rengine boyar, foto tek renk lekeye döner.
 *
 * Dosya yolu içeriğin HASH'i: RCTImageLoader çözdüğü görüntüyü URL ile
 * anahtarlıyor, aynı yola yeni byte yazsak bayat ikon çizilirdi.
 */

/**
 * FOTOĞRAFIN çapı — halka kalınlığından BAĞIMSIZ. Halka bunun DIŞINA çiziliyor,
 * üstünü örtmüyor: kalınlık arttıkça foto küçülmez, ikon büyür.
 *
 * 24 → 26: kardeş sekmelerin glyph'i de 22'den 24'e çıktı (gen-tab-icons.js
 * GLYPH_PT), daire aynı ölçüde büyümezse profil sekmesi geride kalıyordu.
 * Daha fazlası zor: seçili halkayla dış siluet 30pt, kutu 31pt — HIG'in tab
 * ikonu için verdiği 32pt tavanına dayanıyor.
 */
const AVATAR_PT = 26;
/** Seçili DEĞİLKEN halka kalınlığı (pt). En az 1 FİZİKSEL piksele çıkarılır:
 * @2x'te 1px, @3x'te 1.5px — antialias'ın yutmayacağı en ince çizgi. */
const IDLE_BORDER_PT = 0.5;
/** Seçiliyken. Halka dışarı büyüdüğü için dış siluet de büyüyor (25pt → 28pt);
 * fotoğraf iki durumda da 24pt kalıyor — istenen bu. */
const ACTIVE_BORDER_PT = 2;

/**
 * İkon kutusu. Kardeş sekmelerin PNG'leri 28pt (gen-tab-icons.js CANVAS_PT) ama
 * TABAN o değil, "en kalın halka + AA payı" — foto 24pt + 2×2pt halka zaten
 * 28pt'yi tam dolduruyordu ve dış yarım piksel kutu kenarında kırpılıyordu.
 * İçerik ortalandığı için 1pt'lik büyüme ikonu kaydırmaz, yalnız bounding box'ı
 * büyütür.
 */
const BOX_PT = Math.max(28, AVATAR_PT + 2 * ACTIVE_BORDER_PT + 1);

/** Halkanın fotoğrafın AA kenarına binmesi gereken pay — piksel, pt değil. */
const SEAM_PX = 0.5;

/**
 * Dosya adı anahtarına giren geometri sürümü. Ölçüler aynı kalıp ÇİZİM KURALI
 * değişirse (halka içeri→dışarı gibi) anahtar kendiliğinden değişmez; bu sayaç
 * o durumda elle artırılır, yoksa cache'teki eski görsel servis edilir.
 */
const GEOMETRY_VERSION = 2;

const DIR_NAME = "tab-avatar";

type AvatarVariant = { color: string; widthPt: number };

/** Dosya adı için kısa, çakışması pratikte imkânsız anahtar (djb2). */
const hashKey = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const variantFileName = (photoUri: string, variant: AvatarVariant, scale: number) =>
  `${hashKey(
    `v${GEOMETRY_VERSION}|${photoUri}|${variant.color}|` +
      `${BOX_PT}/${AVATAR_PT}/${variant.widthPt}@${scale}`,
  )}.png`;

/**
 * Fotoğrafı, verilen her çerçeve varyantı için bir kez yuvarlak PNG olarak
 * cache'e basar; sırayla `file://` URI'leri döner.
 *
 * Varyantlar TEK ÇAĞRIDA isteniyor çünkü kaynak fotoğraf bir kez indirilip bir
 * kez decode ediliyor — varyant başına ayrı çağrı aynı fotoğrafı iki kez
 * çekerdi. Zaten diskte duran varyant yeniden çizilmez.
 *
 * FAIL-SOFT: her hata `null` döner, çağıran SF Symbol'e düşer.
 */
async function rasterizeCircularAvatars(
  photoUri: string,
  variants: readonly AvatarVariant[],
): Promise<string[] | null> {
  const scale = PixelRatio.get();
  const sizePx = Math.round(BOX_PT * scale);
  const radiusPx = (AVATAR_PT * scale) / 2;
  const center = sizePx / 2;

  const dir = new Directory(Paths.cache, DIR_NAME);
  const targets = variants.map((variant) => ({
    variant,
    file: new File(dir, variantFileName(photoUri, variant, scale)),
  }));

  // Hepsi hazırsa ne indirme ne çizim: doğrudan diskten.
  if (targets.every((target) => target.file.exists)) {
    return targets.map((target) => target.file.uri);
  }

  let source: ReturnType<typeof Skia.Image.MakeImageFromEncoded> = null;
  try {
    // fromURI hem http(s) hem file:// okuyor; indirme JS thread'ini bloklamıyor.
    const data = await Skia.Data.fromURI(photoUri);
    source = Skia.Image.MakeImageFromEncoded(data);
    if (!source) return null;

    // Merkezden kare kırpma: portre fotoğraf daireye sığdırılırken ezilmesin.
    const srcW = source.width();
    const srcH = source.height();
    const side = Math.min(srcW, srcH);
    const src = Skia.XYWHRect((srcW - side) / 2, (srcH - side) / 2, side, side);
    const dest = Skia.XYWHRect(
      center - radiusPx,
      center - radiusPx,
      radiusPx * 2,
      radiusPx * 2,
    );

    dir.create({ intermediates: true, idempotent: true });

    for (const target of targets) {
      if (target.file.exists) continue;

      const surface = Skia.Surface.MakeOffscreen(sizePx, sizePx);
      if (!surface) return null;
      let snapshot: ReturnType<typeof surface.makeImageSnapshot> | null = null;
      try {
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color("transparent"));

        const clip = Skia.Path.Make();
        clip.addCircle(center, center, radiusPx);
        canvas.save();
        canvas.clipPath(clip, ClipOp.Intersect, true);
        // MipmapMode.Linear: kaynak 1080px, hedef ~72px. Sadece Linear filtre
        // bu küçültme oranında ağır aliasing (tırtıklı saç/kenar) üretiyor.
        canvas.drawImageRectOptions(
          source,
          src,
          dest,
          FilterMode.Linear,
          MipmapMode.Linear,
        );
        canvas.restore();

        const strokePx = Math.max(1, target.variant.widthPt * scale);
        const ring = Skia.Paint();
        ring.setStyle(PaintStyle.Stroke);
        ring.setStrokeWidth(strokePx);
        ring.setAntiAlias(true);
        ring.setColor(Skia.Color(target.variant.color));
        // DIŞ halka: yarıçap strokePx/2 DIŞARIDA, yani halkanın iç kenarı tam
        // fotoğrafın kenarına değiyor, üstünü örtmüyor. Kalınlık arttıkça foto
        // değil dış siluet büyür (kutu payı için bkz. AVATAR_PT).
        //
        // SEAM_PX kadar (yarım FİZİKSEL piksel) içeri alınıyor: clip'in ve
        // halkanın antialias bantları tam olarak R'de üst üste gelirse ikisinin
        // de alfası ~%50 kalıyor ve aralarında soluk bir saç teli beliriyor.
        // Gözle "içini kaplamak" değil — @3x'te 1/6 point.
        canvas.drawCircle(center, center, radiusPx + strokePx / 2 - SEAM_PX, ring);

        surface.flush();
        snapshot = surface.makeImageSnapshot();
        const bytes = snapshot.encodeToBytes(ImageFormat.PNG, 100);
        if (!bytes) return null;

        target.file.create({ overwrite: true, intermediates: true });
        target.file.write(bytes);
      } finally {
        snapshot?.dispose?.();
        surface.dispose?.();
      }
    }

    // Eski sürümler (foto değişti, tema döndü) birikmesin.
    pruneExcept(dir, targets.map((target) => target.file.name));
    return targets.map((target) => target.file.uri);
  } catch (error) {
    devLog("👤 [tabAvatar] ikon üretilemedi", error);
    return null;
  } finally {
    source?.dispose?.();
  }
}

/** `keep` dışındaki her şeyi sil. Best-effort — asla fırlatmaz. */
function pruneExcept(dir: Directory, keep: readonly string[]): void {
  try {
    if (!dir.exists) return;
    const kept = new Set(keep);
    dir.list().forEach((entry) => {
      if (entry instanceof Directory) return;
      if (kept.has(entry.name)) return;
      try {
        entry.delete();
      } catch {
        // Tek dosyanın silinememesi ikonu üretmeyi engellemesin.
      }
    });
  } catch {
    // Dizin okunamadı; temizlik atlanır.
  }
}

const toIcon = (uri: string) => ({
  type: "image" as const,
  // scale ŞART: verilmezse RCTImageSource 1 varsayar, 84px'lik PNG 84
  // POINT'lik dev bir ikon olarak çizilir.
  source: { uri, scale: PixelRatio.get() },
  // Foto template'e çevrilmesin (bkz. dosya başı).
  tinted: false,
});

/**
 * Profil sekmesi için hazır `tabBarIcon` fonksiyonu (yoksa `null` → çağıran SF
 * Symbol'e düşer).
 *
 * İKİ VARYANT üretiliyor, tek fark halka: seçiliyken `activeColor` + 2pt,
 * diğerinde `idleColor` + 0.5pt. Foto zaten `tinted:false` olduğu için tab
 * bar'ın aktif tint'i ona DEĞMİYOR — seçili olma hissini taşıyan tek şey bu
 * halka. İkisi birlikte set ediliyor: yalnız biri hazırken karışık (image +
 * sfSymbol) bir çift verirsek react-native-screens `icon and selectedIcon must
 * be same type` diye fırlatıyor.
 *
 * `getMyProfile()` TTL + in-flight dedupe'lu: AppNavigator aynı isteği açılışta
 * zaten yapıyor, buradaki çağrı ona binir, ikinci ağ isteği olmaz.
 * `profileDirty` (ProfileScreen kaydetti / moderasyon değişti) ikonu tazeler.
 *
 * ANDROID: native tab bar orada image ikonlara `tabBarItemIconColor` tint'ini
 * uyguluyor — foto tek renk lekeye döner. Cihazda doğrulanana kadar Android
 * material `person` ikonunda kalıyor.
 */
export function useProfileTabAvatarIcon(idleColor: string, activeColor: string) {
  const [uris, setUris] = useState<{ idle: string; active: string } | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let cancelled = false;

    const load = () =>
      profileService
        .getMyProfile()
        .then(async (profile: any) => {
          if (cancelled) return;
          const photo = resolveMainPhotoUri(profile);
          if (!photo) {
            setUris(null);
            return;
          }
          const built = await rasterizeCircularAvatars(photo, [
            { color: idleColor, widthPt: IDLE_BORDER_PT },
            { color: activeColor, widthPt: ACTIVE_BORDER_PT },
          ]);
          if (cancelled) return;
          setUris(built ? { idle: built[0], active: built[1] } : null);
        })
        .catch(() => {
          // Profil çekilemedi (çevrimdışı açılış) — SF Symbol'de kal.
        });

    load();
    const unsub = uiBus.on("profileDirty", load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [idleColor, activeColor]);

  return useMemo(() => {
    if (!uris) return null;
    const idle = toIcon(uris.idle);
    const active = toIcon(uris.active);
    return ({ focused }: { focused: boolean }) => (focused ? active : idle);
  }, [uris]);
}
