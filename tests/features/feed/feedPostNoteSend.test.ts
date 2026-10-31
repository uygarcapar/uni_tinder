/**
 * Akıştan not gönderimi — BAĞLANTI testi.
 *
 * ⚠️ `FeedScreen` bu projede hiçbir testte RENDER EDİLMİYOR (3300+ satır, ağır
 * mock yüzeyi); o ekranın testleri kaynak metnini okuyup değişmezlerini
 * doğruluyor — kalıp `feedMapExpandState.test.ts`ten geliyor. Kararın KENDİSİ
 * saf modülde test edildi (`feedPostNote.test.ts`); burada doğrulanan şey
 * ekranın o modüle BAĞLI olduğu ve kapıyı ikinci kez elle kurmadığı.
 *
 * ⚠️ `fs` TİP TANIMI OLMADAN: projede `@types/node` yok ve `tsconfig.types`
 * yalnız `["jest"]`. `require` jest ortamında çalışıyor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

const src = readFileSync('src/features/feed/screens/FeedScreen.tsx', 'utf8');

describe('akıştan not gönderimi', () => {
  it('karar saf modülden geliyor, ekranda yeniden hesaplanmıyor', () => {
    expect(src).toMatch(/postNoteRequest\(/);
    // Gönderi dalında bakiye karşılaştırması ELLE kurulmasın: kapı
    // `postNoteRequest`in içinde ve sırası (yazar/mod → bakiye) orada kilitli.
    // ⚠️ KIRILGAN: bu negatif eşleşme MESAFEYE dayanıyor — yazar kartı dalı
    // zaten `notesRemaining <= 0` içeriyor ve test onun ~110 satır uzakta
    // olmasına güveniyor. Dosya büyüyüp küçüldükçe yanlışlıkla geçebilir ya
    // da boşuna düşebilir; kapı asıl olarak `feedPostNote.test.ts`te saf
    // fonksiyon üzerinden kilitleniyor.
    expect(src).not.toMatch(/notesRemaining\s*<=\s*0[\s\S]{0,400}postNoteTarget/);
  });

  it('hedef postNoteTarget ile kuruluyor', () => {
    expect(src).toMatch(/postNoteTarget\(\s*post\.id/);
  });

  // ⚠️ Yama TEK SATIRA DEĞİL, YAZARIN TÜM GÖNDERİLERİNE: not kişi başına tek
  // (sunucuda modsuz UNIQUE(ActorId, TargetId) — backend tasarımı K1). Tek
  // satır yamalansaydı aynı yazarın bir alttaki gönderisinde buton kalır ve
  // basınca UT-6404 yerdi.
  //
  // ⚠️ Değer `AlreadySwiped` — sunucunun göndereceği kelimenin aynısı.
  // `AlreadySent` sözleşmeden DÜŞTÜ (K2): "bu gönderiye not attın" hâli
  // kişi-başına-tek kuralı yüzünden hiç oluşmuyor.
  it('başarılı gönderim YAZARIN TÜM satırlarını AlreadySwiped’e yamıyor', () => {
    expect(src).toMatch(/patchAuthorPostsInCaches[\s\S]{0,400}AlreadySwiped/);
    // Tek-satır yamasına geri dönülmesin: gönderi dalında o fonksiyon YOK.
    expect(src).not.toMatch(/patchPostInCaches\(\s*qc,\s*post\.id[\s\S]{0,200}AlreadySwiped/);
  });

  it('UT-6401 paket sheet’ini açıyor', () => {
    expect(src).toMatch(
      /NOTE_SEND_CODES\.NO_BALANCE[\s\S]{0,300}setNotePurchaseVisible\(true\)/,
    );
  });

  // ⚠️ Bulgu (gözden geçirme I1): UT-6404 bu YÜZEYİN en olası hatası —
  // satırdaki kapı sayfa çekildiğinde donmuş bir anlık görüntü ve kişi o
  // arada Keşif'ten ya da yazar kartından beğenilmiş olabiliyor. Dalı
  // olmayınca kullanıcı "zaten karar verdin" yazan ama Gönder'i asla
  // çalışmayacak bir composer'da sıkışıyordu. Keşif'teki karşılığı:
  // DiscoverScreen > ALREADY_SWIPED (kredi harcanmaz, kart düşer).
  it('UT-6404 composer’ı kapatıp yazarın satırlarını kapatıyor', () => {
    expect(src).toMatch(
      /NOTE_SEND_CODES\.ALREADY_SWIPED[\s\S]{0,500}patchAuthorPostsInCaches/,
    );
  });

  // ⚠️ Bulgu (gözden geçirme I2): yazar KARTINDAN atılan not da kişi
  // seviyesinde sonuç doğuruyor — o yazarın akıştaki tüm satırları kapanmalı.
  // Yoksa kart kapandıktan sonra listede duran butonlar basılıp UT-6404 yiyor.
  it('yazar kartından gönderilen not da yazarın satırlarını kapatıyor', () => {
    expect(src).toMatch(
      /handleSendAuthorNote[\s\S]{0,2000}patchAuthorPostsInCaches/,
    );
  });

  it('UT-6403 gönderi dalında akış listesini tazeliyor', () => {
    expect(src).toMatch(
      /NOTE_SEND_CODES\.INVALID_TARGET[\s\S]{0,600}feedKeys\.postsRoot/,
    );
  });

  it('gönderi dalında yazar profili ÇEKİLMİYOR — kart açılmıyor', () => {
    expect(src).not.toMatch(/handlePostNote[\s\S]{0,700}authorProfile/);
  });

  it('analitik yüzeyi feed_post', () => {
    expect(src).toMatch(/surface:\s*["']feed_post["']/);
  });

  /**
   * Composer BAĞLANTISI — bu özelliğin tek çökme noktası.
   *
   * ⚠️ Bulgu (gözden geçirme I6): aşağıdaki üçlü ayrışırsa gönderi hedefli bir
   * gönderim `handleSendAuthorNote`a düşer, o da `req.profile.userId` okur —
   * gönderi dalında `profile` BİLEREK `null`, yani async handler'ın içinde
   * TypeError. Kullanıcı hiçbir şey görmez, not gitmez.
   *
   * ⚠️ Bunlar KARAKTERİZASYON testleri: yazıldıklarında kod zaten doğruydu,
   * işleri regresyonu yakalamak (RED→GREEN döngüsünden geçmediler).
   */
  it('gönderim dalı hedefin türüne göre seçiliyor', () => {
    expect(src).toMatch(
      /onSend=\{noteRequest\?\.post \? handleSendPostNote : handleSendAuthorNote\}/,
    );
  });

  it('composer gönderi önizlemesini ve gönderinin modunu alıyor', () => {
    expect(src).toMatch(/postPreview=\{/);
    expect(src).toMatch(/noteRequest\?\.post \? noteRequest\.mode : cardMode/);
  });

  // ⚠️ `onNote={` tek başına YETMEZ: yazar kartı (`LikerSwipeModal`) de aynı
  // adlı bir prop alıyor ve test boş geçerdi.
  it('satır kartı handlePostNote ile bağlanmış', () => {
    expect(src).toMatch(/onNote=\{handlePostNote\}/);
  });
});
