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
    expect(src).not.toMatch(/notesRemaining\s*<=\s*0[\s\S]{0,400}postNoteTarget/);
  });

  it('hedef postNoteTarget ile kuruluyor', () => {
    expect(src).toMatch(/postNoteTarget\(\s*post\.id/);
  });

  it('başarılı gönderim satırı AlreadySent’e yamıyor', () => {
    expect(src).toMatch(/patchPostInCaches[\s\S]{0,300}AlreadySent/);
  });

  it('UT-6401 paket sheet’ini açıyor', () => {
    expect(src).toMatch(
      /NOTE_SEND_CODES\.NO_BALANCE[\s\S]{0,300}setNotePurchaseVisible\(true\)/,
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

  // ⚠️ `onNote={` tek başına YETMEZ: yazar kartı (`LikerSwipeModal`) de aynı
  // adlı bir prop alıyor ve test boş geçerdi.
  it('satır kartı handlePostNote ile bağlanmış', () => {
    expect(src).toMatch(/onNote=\{handlePostNote\}/);
  });
});
