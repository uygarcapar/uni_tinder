/**
 * Bekleyen bir beğeni free kullanıcıya AÇIK mı — kilidi belirleyen TEK kural.
 *
 * ⚠️ AYRI MODÜLDE (2026-11-04), `LikeCard.tsx`in içinde DEĞİL. Orada yaşarken
 * kuralı yalnız Beğeniler ekranı okuyabiliyordu: akış yazar kartının karar
 * yolu (`feedCardMode`) saf bir modül ve koca bir bileşene bağlanamaz, bu
 * yüzden akış düz `isPremium &&` ile kapalı kalmıştı. Sonuç tam da aşağıdaki
 * "kuralı ÇATALLAMAYIN" uyarısının tarif ettiği sızıntının aynasıydı: sana
 * Fire atan biri Beğeniler'de blur'suz ve yanıtlanabilir dururken, AYNI
 * kişinin akış gönderisinde kabul/reddet çizilmiyordu.
 *
 * ⚠️ EKRANDAKİ HER SEKME BUNU KULLANIR, "Kaçırdıkların" DAHİL. Kaçırdıkların
 * 2026-08-31'e kadar kuralın DIŞINDAYDI (kart `alwaysClear` ile blur'suz
 * çiziliyordu) ve bu açık bir sızıntıydı: "Seni Beğenenler"de bulanıklaştırdığımız
 * kişi, keşifte pas geçilip kaçırdıklarına düştüğünde NET görünüyordu. Aynı kişi,
 * iki ekran, iki farklı kural — free kullanıcı paralı bilgiyi bedava alıyordu.
 * Kuralı ÇATALLAMAYIN; ikinci bir kopya yazılırsa aynı bug geri gelir.
 *
 * TEK sinyal ailesi: Fire / NOT — ayrı ürünler, sözleşmeleri aynı:
 * gönderen, karşı taraf kendisini görebilsin diye ödüyor. Premium'a bağlamak
 * satın alınan şeyi teslim etmemek olurdu.
 *
 * ⚠️ İKİNCİ BİR SİNYAL VARDI VE KALDIRILDI (2026-09-03): `hasLikedMe`.
 * Gerekçesi "sunucunun kanonik görünürlük bayrağı; free'de normal beğenide HER
 * ZAMAN `false`, yani ödenmiş görünürlüğü backend tarafından doğruluyor"du. O
 * maskeleme GERÇEK ama YALNIZ KEŞİF DESTESİNDE (`GetPotentialMatches`, bkz.
 * ProfileCardDto). Beğeniler ekranının beslendiği iki liste de tanımı gereği
 * "seni beğenenler" (`WhoLikedMe`, `MissedMatches`): orada bayrağın kısılacak
 * bir bilgisi yok, backend doğal değeriyle — yani HER KART İÇİN `true` —
 * dolduruyor. Kural böylece totolojiye düşüyordu ("seni beğenenler
 * listesindeki kişi seni beğenmiş → kilidi aç") ve free kullanıcı listenin
 * TAMAMINI blur'suz görüyordu. Cihaz logu: `isPremium:false`, üç kartın
 * üçünde de `hasLikedMe:true`, ikisi düz beğeni.
 * Alan kartlarda hâlâ taşınıyor ama KİLİT KARARINA GİRMİYOR — geri eklenirse
 * blur bu iki listede tümden açılır. (Akış kartında da aynı tuzak: orada
 * `hasLikedMe` BEKLEYENLİK sorusunu cevaplıyor, GÖRÜNÜRLÜK sorusunu değil.)
 *
 * ⚠️ Kural GÖRSELİ ve ETKİLEŞİMİ birlikte belirliyor (blur + kart dokunuşu +
 * geç/beğen butonları). Önceden yalnız blur'da not istisnası vardı; kart
 * blur'suz çiziliyor ama dokununca paywall açılıyordu — free kullanıcı kendisine
 * not bırakanı görüyor, açamıyor, yanıtlayamıyordu.
 *
 * ✅ Sunucu maskeleme YAPMIYOR (sözleşme §3.3): `displayName`/`photos` free
 * kullanıcıya da gerçek değerleriyle geliyor — blur TAMAMEN istemci tarafında
 * bir katman. Kartı blur'suz çizen bir kod yolu bırakılırsa açık geri açılır.
 * ⚠️ AMA "açık" ≠ "tüm alanlar dolu" (§3.4): gönderenin KENDİ gizlilik
 * tercihleri (yaş/konum/mesafe) sert kural, notu alan da bypass edemez —
 * `age: 0` / `city: null` gelen bir not kartı bug DEĞİL.
 *
 * ⚠️ Üç alan da okunuyor çünkü iki kaynak iki ad kullanıyor: liste kartı
 * `note` (metnin kendisi), swipe kartı `isNote` (bayrak). Akış yazar kartında
 * `note` bugün BOŞ geliyor (sunucuda yeri hazır) — alan dolarsa kural
 * kendiliğinden devreye girer.
 */
export function isUnlockedLike(item: any): boolean {
  return !!item?.isSuperLike || !!item?.note || !!item?.isNote;
}

export default isUnlockedLike;
