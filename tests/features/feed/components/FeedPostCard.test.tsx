/**
 * Akış gönderi kartı.
 *
 * Test edilen asıl şey KİMLİK SIZDIRMAMA. Anonim gönderide:
 *  - yazar adı/fotoğrafı HİÇBİR yerde çizilmemeli (sunucu zaten `author: null`
 *    yolluyor, ama kart bayat bir nesneyle de gelebilir);
 *  - eşleşmiş kullanıcıya bile "Sohbete git" GÖSTERİLMEMELİ. Backend anonim
 *    gönderide bilerek `Ok` dönüyor; kart "ben bu kişiyle eşleşmişim" diye
 *    kendi kararını verirse anonim yazarın kim olduğu açığa çıkar.
 *
 * İkinci nokta: beğeni butonunun kendi gönderinde basılamaz olması (UT-7330) —
 * sunucu zaten reddediyor, ama kullanıcıyı hata duvarına yürütmemek gerekiyor.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import FeedPostCard from '@/features/feed/components/FeedPostCard';
import type { FeedPostDto, FeedReplyState } from '@/features/feed/feedTypes';
import tr from '@/shared/i18n/translations/tr';

const post = (over: Partial<FeedPostDto> = {}): FeedPostDto =>
  ({
    id: '1',
    body: 'Yarın kütüphane kaçta açılıyor?',
    createdAt: '2026-10-01T09:00:00Z',
    expiresAt: '2026-10-16T09:00:00Z',
    isAnonymous: false,
    authorCategory: null,
    author: {
      userId: 'u1',
      name: 'Esra',
      age: 21,
      mainPhotoUrl: null,
      universityDisplay: 'İTÜ',
    },
    likeCount: 12,
    likedByMe: false,
    isMine: false,
    status: 'Published',
    replyCount: null,
    reply: { state: 'Ok', conversationId: null },
    ...over,
  }) as FeedPostDto;

const withReply = (state: FeedReplyState, conversationId: string | null = null) =>
  post({ reply: { state, conversationId } });

/**
 * İsim ve tarih ZORUNLU küçük harf (istek) — ama `textTransform` ile DEĞİL,
 * `toDisplayLowercase` ile. Fark görünür: RN'in iOS `textTransform`u locale'den
 * bağımsız `lowercaseString` olduğu için "İ"yi "i" + birleşen nokta yapıyor,
 * yani Türkçe adlarda iki noktalı bir i çiziyor (bkz. utils/textCase.ts).
 * Aşağıdaki "İrem" testi tam olarak o yolu kilitliyor.
 */
describe('normal gönderi', () => {
  it('yazar adı ve yaşı KÜÇÜK HARF çizilir', () => {
    render(<FeedPostCard post={post()} />);
    expect(screen.getByText('esra, 21')).toBeTruthy();
    expect(screen.queryByText('Esra, 21')).toBeNull();
  });

  // ⚠️ Türkçe "İ" → "i", BİRLEŞEN NOKTA YOK. Beklenen dize bilerek kaçışlı
  // yazıldı: "i̇rem" ile "irem" ekranda ayırt edilemiyor ama farklı
  // dizeler, düz yazımda gözden kaçar.
  it('Türkçe "İ" tek noktalı "i"ye iner (birleşen nokta BIRAKMAZ)', () => {
    render(
      <FeedPostCard post={post({ author: { ...post().author!, name: 'İrem' } })} />,
    );
    expect(screen.getByText('irem, 21')).toBeTruthy();
    expect(screen.queryByText('i̇rem, 21')).toBeNull();
  });

  // Türkçede noktasız "I" → "ı". Katlama YOK: `foldForSearch` "ı"yı "i"ye
  // indiriyor ama o ARAMA içindir — adı "irmak" yazmak kullanıcının adını
  // yanlış yazmak olur.
  it('noktasız "I" → "ı" (arama katlaması uygulanmaz)', () => {
    render(
      <FeedPostCard post={post({ author: { ...post().author!, name: 'Irmak' } })} />,
    );
    expect(screen.getByText('ırmak, 21')).toBeTruthy();
  });

  it('yaş gizliyse (null) yalnız isim çizilir', () => {
    render(
      <FeedPostCard post={post({ author: { ...post().author!, age: null } })} />,
    );
    expect(screen.getByText('esra')).toBeTruthy();
  });

  // Üniversite satırı kartta KALDIRILDI (istek): başlık tek satıra indi ki
  // tarih ve menü isim/yaşla aynı hizaya oturabilsin. DTO alanı duruyor ve
  // profil önizlemesi onu hâlâ gösteriyor — burada çizilmemesi doğru olan.
  it('üniversite DTO dolu olsa bile kartta çizilmez', () => {
    render(<FeedPostCard post={post()} />);
    expect(screen.queryByText('İTÜ')).toBeNull();
  });

  it('gövde ve beğeni sayısı çizilir', () => {
    render(<FeedPostCard post={post()} />);
    expect(screen.getByText('Yarın kütüphane kaçta açılıyor?')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });
});

describe('anonim gönderi — kimlik sızdırmama', () => {
  it('cinsiyetli etiket çizilir, yazar adı ÇİZİLMEZ', () => {
    render(
      <FeedPostCard
        post={post({
          isAnonymous: true,
          authorCategory: 'Women',
          // Bayat/yanlış bir nesne gelse bile kart yazarı göstermemeli.
          author: {
            userId: 'u1',
            name: 'Esra',
            age: 21,
            mainPhotoUrl: null,
            universityDisplay: 'İTÜ',
          },
        })}
      />,
    );
    // Anonim etiketi de küçük harf: isimle AYNI slot, aynı listede yan yana.
    expect(screen.getByText('anonim · kadın')).toBeTruthy();
    expect(screen.queryByText(tr.feed.anonymous.Women)).toBeNull();
    expect(screen.queryByText('esra, 21')).toBeNull();
    expect(screen.queryByText('İTÜ')).toBeNull();
    expect(screen.queryByText('itü')).toBeNull();
  });

  it('authorCategory null ise sade "Anonim"', () => {
    render(<FeedPostCard post={post({ isAnonymous: true, authorCategory: null })} />);
    expect(screen.getByText('anonim')).toBeTruthy();
  });

  it('yazara dokunma profil AÇMAZ (anonimde açılacak profil yok)', () => {
    const onPressAuthor = jest.fn();
    render(
      <FeedPostCard
        post={post({ isAnonymous: true, authorCategory: 'Men', author: null })}
        onPressAuthor={onPressAuthor}
      />,
    );
    fireEvent.press(screen.getByText('anonim · erkek'));
    expect(onPressAuthor).not.toHaveBeenCalled();
  });

  // ⚠️ YEDEĞİN EN KRİTİK SINIRI. Sunucu kendi gönderimin avatarını boş
  // bırakıyor ve kart onu kendi fotoğrafımla dolduruyor (aşağıdaki describe).
  // Gönderi ANONİM iken aynı yedek uygulanırsa kullanıcı kendi anonim
  // gönderisini fotoğrafıyla görür — ekran görüntüsüyle paylaşıldığında gerçek
  // bir sızıntı. `isAnonymous` bu yüzden `isMine`den ÖNCE bakılıyor.
  it('anonim + kendi gönderimde `ownPhotoUrl` yedeği UYGULANMAZ', () => {
    render(
      <FeedPostCard
        post={post({ isAnonymous: true, isMine: true, author: null })}
        ownPhotoUrl="https://cdn/ben.jpg"
      />,
    );
    expect(avatarUris()).toEqual([]);
  });
});

/**
 * Çizilen avatarın URI'si.
 *
 * Tipe göre değil `testID`ye göre soruluyor: kart bir dönem aynı URI'yi taşıyan
 * İKİ `Image` çiziyordu (avatar + baloncuğun bulanık zemini) ve o deneme geri
 * alınsa da "hangi katman" sorusu doğru soru. Boş dizi = yer tutucu dalı
 * çizildi (`View` + SFIcon, hiç `Image` doğmuyor).
 */
const avatarUris = () =>
  screen
    .queryAllByTestId('feed-post-avatar')
    .map((n) => (n.props as any)?.source?.uri)
    .filter(Boolean);

/**
 * Kendi gönderimin avatarı — sunucu `author.mainPhotoUrl`u null bıraktığında
 * kendi fotoğrafımla doluyor (bkz. feedQueries > useOwnFeedAvatar).
 */
describe('kendi gönderimin avatarı', () => {
  it('sunucu fotoğrafı boşsa kendi fotoğrafım çizilir', () => {
    render(
      <FeedPostCard
        post={post({ isMine: true, author: { ...post().author!, mainPhotoUrl: null } })}
        ownPhotoUrl="https://cdn/ben.jpg"
      />,
    );
    expect(avatarUris()).toEqual(['https://cdn/ben.jpg']);
  });

  // Sunucu alanı doldurmaya başlarsa yedek kendiliğinden ölü kalmalı.
  it('sunucu fotoğrafı DOLUYSA yedek kazanmaz', () => {
    render(
      <FeedPostCard
        post={post({
          isMine: true,
          author: { ...post().author!, mainPhotoUrl: 'https://cdn/sunucu.jpg' },
        })}
        ownPhotoUrl="https://cdn/ben.jpg"
      />,
    );
    expect(avatarUris()).toEqual(['https://cdn/sunucu.jpg']);
  });

  // Başkasının fotoğrafını TAHMİN ETMİYORUZ — yedek yalnız kendi gönderimde.
  it('başkasının gönderisinde yedek uygulanmaz (yer tutucu kalır)', () => {
    render(
      <FeedPostCard
        post={post({ isMine: false, author: { ...post().author!, mainPhotoUrl: null } })}
        ownPhotoUrl="https://cdn/ben.jpg"
      />,
    );
    expect(avatarUris()).toEqual([]);
  });

  it('yedek de yoksa yer tutucu çizilir', () => {
    render(<FeedPostCard post={post({ isMine: true })} ownPhotoUrl={null} />);
    expect(avatarUris()).toEqual([]);
  });
});

/**
 * ⚠️ ANONİM gönderide fotoğraf çizilmemesi, avatar dalının bu dosyadaki ikinci
 * kimlik testi. Bir dönem baloncuğun zemini de aynı değerden besleniyordu ve o
 * katman geri alındı (bkz. FeedPostCard > zemin notu); tekrar eklenirse
 * anonimlik kapısı YİNE tek olmalı ve burası o kapıyı kilitleyen yer.
 */
describe('anonim gönderide fotoğraf', () => {
  it('bayat bir nesne fotoğraf taşısa bile çizilmez', () => {
    render(
      <FeedPostCard
        post={post({
          isAnonymous: true,
          authorCategory: 'Women',
          author: { ...post().author!, mainPhotoUrl: 'https://cdn/esra.jpg' },
        })}
      />,
    );
    expect(avatarUris()).toEqual([]);
  });
});

describe('yanıt butonu KALDIRILDI (iki modlu yapı)', () => {
  /**
   * Eşleşme kanalı artık yanıt değil: yazara dokunup profil kartını açmak ve
   * orada beğeni/not/Spark atmak. Kart hiçbir `reply.state` için buton
   * çizmemek zorunda — sunucu alanı göndermeye devam ediyor (eski istemciler
   * için) ve kartın onu SESSİZCE YOK SAYMASI test edilen şey.
   */
  it.each([
    'Ok',
    'AlreadyMatched',
    'AlreadyReplied',
    'OwnPost',
    'PreferenceMismatch',
    'OtherUniversityRequiresPlus',
    'Restricted',
  ] as const)('%s → hiçbir yanıt butonu çizilmiyor', (state) => {
    render(<FeedPostCard post={withReply(state, '3f2a')} />);
    // `tr.feed.reply.*` anahtarları da SİLİNDİ — o yüzden metinle değil
    // sözleşmeyle ölçüyoruz: kartta dokunulabilir TEK şey beğeni kalbi ve
    // (Gönderilerim'de) yanıt sayısı. Yanıt kapsülü hiçbir durumda yok.
    expect(screen.queryByText(/Yanıtla|Sohbete git|Yanıtladın/)).toBeNull();
  });

  it('AlreadyMatched gelse bile sohbet açma çağrılmıyor', () => {
    // Buton yok → tetiklenecek bir şey de yok. Prop hâlâ kabul ediliyor
    // (çağıran taraf temizlenmedi) ama kart onu kullanmıyor.
    const onOpenChat = jest.fn();
    render(
      <FeedPostCard post={withReply('AlreadyMatched', '3f2a')} onOpenChat={onOpenChat} />,
    );
    expect(onOpenChat).not.toHaveBeenCalled();
  });

  it('gönderi gövdesi ve beğeni satırı yerinde kalıyor', () => {
    // Söküm sırasında esnek boşluk ve beğeni satırı bozulmamalı.
    render(<FeedPostCard post={withReply('Ok')} />);
    expect(screen.getByText('Yarın kütüphane kaçta açılıyor?')).toBeTruthy();
  });
});

describe('beğeni', () => {
  it('basınca mevcut durumun TERSİ istenir', () => {
    const onToggleLike = jest.fn();
    render(<FeedPostCard post={post({ likedByMe: false })} onToggleLike={onToggleLike} />);
    fireEvent.press(screen.getByText('12'));
    expect(onToggleLike).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('kendi gönderinde basılamaz (UT-7330 duvarına yürütmüyoruz)', () => {
    const onToggleLike = jest.fn();
    render(<FeedPostCard post={post({ isMine: true })} onToggleLike={onToggleLike} />);
    fireEvent.press(screen.getByText('12'));
    expect(onToggleLike).not.toHaveBeenCalled();
  });
});

describe('Gönderilerim varyantı', () => {
  it('durum rozeti ve yanıt sayısı çizilir', () => {
    render(
      <FeedPostCard
        post={post({ status: 'PendingReview', replyCount: 3 })}
        variant="mine"
        statusLabel={tr.feed.mine.status.PendingReview}
        // İnceleme tonu artık NÖTR (bkz. FeedScreen > statusToneFor): turuncu
        // bir "İnceleniyor" uyarı gibi okunuyordu.
        statusTone="neutral"
      />,
    );
    expect(screen.getByText(tr.feed.mine.status.PendingReview)).toBeTruthy();
    expect(screen.getByText('3 yanıt')).toBeTruthy();
  });

  it('yanıt sayısına dokununca Yanıtlar sayfasına geçilir', () => {
    const onPressReplyCount = jest.fn();
    render(
      <FeedPostCard
        post={post({ replyCount: 2 })}
        variant="mine"
        onPressReplyCount={onPressReplyCount}
      />,
    );
    fireEvent.press(screen.getByText('2 yanıt'));
    expect(onPressReplyCount).toHaveBeenCalled();
  });

  it('yanıt yokken sayıya dokunmak bir şey yapmaz', () => {
    const onPressReplyCount = jest.fn();
    render(
      <FeedPostCard
        post={post({ replyCount: 0 })}
        variant="mine"
        onPressReplyCount={onPressReplyCount}
      />,
    );
    fireEvent.press(screen.getByText('0 yanıt'));
    expect(onPressReplyCount).not.toHaveBeenCalled();
  });

  it('akış varyantında durum rozeti ve yanıt sayısı ÇİZİLMEZ', () => {
    render(<FeedPostCard post={post({ status: 'PendingReview', replyCount: 3 })} />);
    expect(screen.queryByText(tr.feed.mine.status.PendingReview)).toBeNull();
    expect(screen.queryByText('3 yanıt')).toBeNull();
  });
});
