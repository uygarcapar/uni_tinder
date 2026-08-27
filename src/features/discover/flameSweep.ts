import uiBus from "@/shared/services/uiBus";

/**
 * Ekranı kaplayan alev kutlaması + desteyi ÖRTÜNÜN ALTINDA ilerletme.
 *
 * Süper beğeni ve not aynı akış: kart fırlamıyor, yerinde duruyor; dalga
 * alttan yukarı süpürürken ekranı tam kapattığı anda deste bir adım ilerliyor.
 * Kullanıcı ne kartın gidişini ne yenisinin gelişini görüyor — yalnız
 * kutlamayı. Zamanlama ölçülüyor, tahmin edilmiyor: canvas kendi animasyon
 * saatinden "kapandım" diyor (bkz. flameWaveGeometry / coverMs).
 *
 * Kutlama iki eylemde de BİREBİR aynı: ortada duran premium alev rozeti hangi
 * eylemden geldiğini söylemiyor, o yüzden burada bir "tür" parametresi de yok.
 * Ayrışması gerekirse olaya bir alan eklenip rozet ona göre seçilir.
 *
 * `onCovered` TAM BİR KEZ çalışır. Örtme olayının iki kaynağı var — canvas'ın
 * kendisi ve canvas hiç çizemezse devreye giren yedek zamanlayıcı (bkz.
 * SuperLikeFlame) — ilki alınıp abonelik hemen bırakılıyor.
 *
 * @returns Aboneliği iptal eden fonksiyon. Çağıran, örtme anından ÖNCE
 * ağaçtan düşebiliyorsa (deste tazelendi, ekran değişti, tema remount'u)
 * temizlikte bunu çağırmalı; yoksa `onCovered` sökülmüş bir ağaca yazar.
 */
export function runFlameSweep(onCovered: () => void): () => void {
  let done = false;
  const unsub = uiBus.on("flameSweepCover", () => {
    if (done) return;
    done = true;
    unsub();
    onCovered();
  });
  uiBus.emit("flameSweep");
  return () => {
    done = true;
    unsub();
  };
}
