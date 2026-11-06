/**
 * Kamera ekranı yerleşimi ve chrome kararı — SAF fonksiyonlar, RN import'u yok.
 *
 * İki pencere şekli: `fill` (güvenli alanın altından deklanşöre kadar — kampüs
 * anları VE kayıt fotoğraf adımı) ve `photo` (aynı tepeden 3:4). Bu dosya yalnız
 * "hangi kutu" ve "hangi düğme" sorusunu cevaplar, çizim bileşene aittir.
 *
 * ⚠️ `photo`yu ŞU AN HİÇBİR ÇAĞIRAN KULLANMIYOR. Kayıt yolu onunla başladı
 * (önizleme = yüklenen kare, birebir), cihazda "çok kare gibi oluyor, görüntü
 * çekme tuşuna kadar uzansın" denince 2026-11-06'da `fill`e döndü. Seçenek
 * testleriyle duruyor: geri dönmek tek satır (`photoPicker`daki `frame`).
 */

export type PreviewFrame = 'fill' | 'photo';

/**
 * Önizleme penceresi. `insetTop`/`footerH` KAMERA ekranının kendi ölçüleri.
 *
 * İKİ PENCERE DE ÜSTE DAYALI ve aynı tepeden (güvenli alanın hemen altı)
 * başlıyor — fark yalnız yükseklik. İstek birebir: "kampüsteki gibi üst tarafa
 * dayalı gelsin, fotonun gösterildiği yer değişmesin". `photo` kampüsün kutusunu
 * alıp altını 3:4'e kadar yukarı çekiyor; deklanşör şeridiyle arasında kalan
 * şerit siyah zemin.
 *
 * ⚠️ `photo` ESKİDEN EKRANIN ORTASINDAYDI (kırpıcının penceresiyle çakışsın
 * diye). Bedeli kabul edildi: tipik telefonda iki pencere AYNI BOYUTTA (393×524)
 * ama kırpıcınınki ortalı — kırp'a basınca kare aşağı kayıyor, ölçeği değişmiyor.
 *
 * `headerH` imzada duruyor (çağıran hep geçiyor) ama artık okunmuyor: başlık
 * düğmeleri kampüsteki gibi pencerenin ÜSTÜNE biniyor, pencere onlardan kaçmıyor.
 */
export function previewWindow(a: {
  frame: PreviewFrame;
  screenW: number;
  screenH: number;
  insetTop: number;
  headerH: number;
  footerH: number;
}): { left: number; top: number; winW: number; winH: number } {
  const { frame, screenW, screenH, insetTop, footerH } = a;
  // Tepe ile deklanşör şeridi arasındaki kutu — iki dalın ORTAK sınırı.
  // Alt sınır 160: çok kısa bir ekranda önizleme kaybolmasın.
  const availH = Math.max(160, screenH - insetTop - footerH);

  if (frame === 'fill') {
    // Kampüs: kutunun tamamı — güvenli alanın altından deklanşöre kadar, tam
    // genişlik (eski `CameraCaptureOverlay` layout hesabı, birebir).
    return { left: 0, top: insetTop, winW: screenW, winH: availH };
  }

  // 3:4, aynı tepeden. Tam genişlik sığmıyorsa (kısa ekran) yükseklik
  // kutuya oturuyor, en ona göre daralıyor ve kare yatayda ortalanıyor —
  // pencere deklanşör şeridine HİÇBİR cihazda taşmıyor.
  const winW = Math.min(screenW, (availH * 3) / 4);
  return {
    left: (screenW - winW) / 2,
    top: insetTop,
    winW,
    winH: (winW * 4) / 3,
  };
}

/**
 * Önizleme anındaki düğmeler. `previewOnly` = galeri/kamera fotoğrafı (canlı
 * akış yok); `frozen` = bir kare ekranda donmuş ve onay bekliyor; `allowCrop`
 * = çağıranın kırpma kancası var mı.
 *
 * Kırpma düğmesi yalnız kanca varsa çizilir — kampüs akışında kırpıcı yok ve
 * boş bir düğme kullanıcıyı yanıltır.
 */
export function cameraChrome(a: {
  previewOnly: boolean;
  frozen: boolean;
  allowCrop: boolean;
}): {
  shutter: boolean;
  flash: boolean;
  flip: boolean;
  retake: boolean;
  crop: boolean;
  confirm: boolean;
} {
  const { previewOnly, frozen, allowCrop } = a;
  // Canlı akış: deklanşör, flaş, kamera çevirme. Yalnız kare canlıyken.
  const live = !previewOnly && !frozen;
  return {
    shutter: live,
    flash: live,
    flip: live,
    // Yeniden çekim yalnız canlı kameradan donmuş kareye özgü; galeri
    // fotoğrafının "yeniden çek"i yok.
    retake: !previewOnly && frozen,
    crop: allowCrop && frozen,
    confirm: frozen,
  };
}
