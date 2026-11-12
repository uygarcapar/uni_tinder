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
import FeedPostCard, {
  BODY_FONT_SIZE,
} from '@/features/feed/components/FeedPostCard';
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
  it('sade "anonim" çizilir, yazar adı ÇİZİLMEZ', () => {
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
    expect(screen.getByText('anonim')).toBeTruthy();
    expect(screen.queryByText('esra, 21')).toBeNull();
    expect(screen.queryByText('İTÜ')).toBeNull();
    expect(screen.queryByText('itü')).toBeNull();
  });

  /**
   * ⚠️ CİNSİYET SIZDIRMAMA (istek). `authorCategory` wire'da duruyor ama kart
   * onu HİÇBİR hâlde çizmiyor: "anonim · kadın" etiketi, küçük bir kampüs
   * akışında cinsiyet+konu+saat üçlüsüyle kişiyi teşhis edilebilir yapıyordu.
   * Üç kategori de ayrı ayrı sorgulanıyor ki tek bir dal geri sızmasın.
   */
  it.each(['Men', 'Women', 'NonBinary'] as const)(
    'authorCategory=%s olsa bile cinsiyet YAZMIYOR',
    (category) => {
      render(<FeedPostCard post={post({ isAnonymous: true, authorCategory: category })} />);
      expect(screen.getByText('anonim')).toBeTruthy();
      expect(screen.queryByText(/erkek|kadın|non-binary/i)).toBeNull();
    },
  );

  it('authorCategory null ise de sade "Anonim"', () => {
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
    fireEvent.press(screen.getByText('anonim'));
    expect(onPressAuthor).not.toHaveBeenCalled();
  });

  // ⚠️ KENDİ GÖNDERİM DE AÇMAZ. Yazar kartı yolu (FeedScreen >
  // handlePressAuthor → LikerSwipeModal) yazarı "karşı taraf" varsayıyor:
  // kart NORMAL hâlde doğar ve kendi profiline Fire/not çizer (feedCardActions
  // "kendi gönderi" hâlini bilmiyor, bilmesi de gerekmiyor — kapı burada).
  // "Benim" sekmesi bu yüzden `onPressAuthor`u hiç geçirmiyor (FeedScreen'de
  // sekme kapısı); ana akışta kendi gönderin de görünüyor ve oradaki tek kapı bu.
  it('KENDİ gönderimde yazara dokunma profil AÇMAZ (karta Fire/not çizilirdi)', () => {
    const onPressAuthor = jest.fn();
    render(<FeedPostCard post={post({ isMine: true })} onPressAuthor={onPressAuthor} />);
    fireEvent.press(screen.getByText('esra, 21'));
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

  // ⚠️ Beğenisi olmayan gönderide SAYI HİÇ ÇİZİLMİYOR (istek): kalbin yanındaki
  // "0" bir ölçü yerine boş bir sonuç bildirisi gibi okunuyordu. Kalp yerinde
  // kalıyor — kaybolan yalnız metin.
  it('beğeni yokken sayı çizilmez ("0" yazmıyor)', () => {
    render(<FeedPostCard post={post({ likeCount: 0 })} />);
    expect(screen.queryByText('0')).toBeNull();
    // Kart ve satırın geri kalanı yerinde.
    expect(screen.getByText('Yarın kütüphane kaçta açılıyor?')).toBeTruthy();
  });

  // ⚠️ KURAL TERSİNE DÖNDÜ (istek). Eskiden kart `isMine`da butonu kilitliyordu
  // ("UT-7330 duvarına yürütmüyoruz"); artık kendi gönderini de beğenebiliyorsun
  // ve kapı TEK YERDE — sunucuda. Reddedilirse hata kullanıcıya söyleniyor
  // (feedQueries > useTogglePostLike.onError), sessizce yutulmuyor.
  it('kendi gönderinde de basılabilir', () => {
    const onToggleLike = jest.fn();
    render(<FeedPostCard post={post({ isMine: true })} onToggleLike={onToggleLike} />);
    fireEvent.press(screen.getByText('12'));
    expect(onToggleLike).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
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

  /**
   * Süresi dolmuş gönderinin rozeti YALNIZ kırmızı saat ikonu, üç noktanın
   * SOLUNDA (istek; pill ve metin denendi, geri alındı). Metin HİÇ çizilmiyor
   * — etiket ikonun erişilebilirlik adı. Sıra ağaçtan okunuyor: ikon menü
   * düğümünden ÖNCE gelmeli.
   */
  it('expired rozeti METİNSİZ kırmızı saat ikonu, üç noktanın SOLUNDA', () => {
    render(
      <FeedPostCard
        post={post({ expiresAt: '2026-09-20T09:00:00Z' })}
        variant="mine"
        statusLabel={tr.feed.mine.expired}
        statusTone="danger"
        statusIcon="clock"
        onMenu={jest.fn()}
      />,
    );
    expect(screen.queryByText(tr.feed.mine.expired)).toBeNull();
    const icon = screen.getByTestId('feed-post-status-icon');
    expect(icon.props.accessibilityLabel).toBe(tr.feed.mine.expired);

    const flat = JSON.stringify(screen.toJSON());
    const menuAt = flat.indexOf('feed-post-menu');
    const iconAt = flat.indexOf('feed-post-status-icon');
    expect(iconAt).toBeGreaterThan(-1);
    expect(menuAt).toBeGreaterThan(iconAt);
  });

  it('ikonsuz rozet düz metin kalır', () => {
    render(
      <FeedPostCard
        post={post({ status: 'PendingReview' })}
        variant="mine"
        statusLabel={tr.feed.mine.status.PendingReview}
        statusTone="neutral"
        onMenu={jest.fn()}
      />,
    );
    const badge = screen.getByText(tr.feed.mine.status.PendingReview);
    expect(badge.props.style.backgroundColor).toBeUndefined();
    expect(screen.queryByTestId('feed-post-status-icon')).toBeNull();
  });
});

/**
 * KONU ETİKETLERİ (istek, 2026-10-15; 2026-11-04'te SATIR İÇİNE taşındı).
 *
 * Üç kural birlikte test ediliyor:
 *  1. `#` + KÜÇÜK HARF — ve küçük harf `textTransform` ile değil
 *     `toDisplayLowercase` ile (Türkçe "İ" tuzağı, bkz. utils/textCase.ts).
 *  2. GÖVDENİN DEVAMINDA (istek: "hashtagler yazılan textin altında değil
 *     devamında olsun direkt"): etiketler gövdeyle AYNI paragrafın içinde,
 *     son kelimenin peşinden akıyor ve onunla birlikte sarıyor. Eski ayrı
 *     satır (flexWrap'li sıra) ve kapsül dolgusu YOK.
 *  3. ÇOKLU: `topics` doluysa hepsi, yoksa tek `topic`. İkisi de yoksa etiket
 *     HİÇ çizilmiyor (varsayılan "Genel" uydurulmuyor).
 */
describe('konu etiketleri', () => {
  /** Düğümün altındaki metin yapraklarını render sırasıyla topla. */
  const textLeaves = (node: any): string[] => {
    if (node == null) return [];
    if (typeof node === 'string') return [node];
    const kids = Array.isArray(node.children) ? node.children : [];
    return kids.flatMap(textLeaves);
  };

  /**
   * `parts`ı BU SIRAYLA içeren tek bir <Text> paragrafı var mı? "Devamında"
   * olmanın tanımı tam olarak bu: etiket gövdeyle aynı metin düğümünün
   * içinde ve ondan SONRA geliyor — altında ayrı bir blokta değil.
   */
  const hasInlineParagraph = (node: any, parts: string[]): boolean => {
    if (!node || typeof node === 'string') return false;
    if (node.type === 'Text') {
      const joined = textLeaves(node).join('');
      let at = 0;
      const inOrder = parts.every((part) => {
        const i = joined.indexOf(part, at);
        if (i < 0) return false;
        at = i + part.length;
        return true;
      });
      if (inOrder) return true;
    }
    const kids = Array.isArray(node.children) ? node.children : [];
    return kids.some((kid) => hasInlineParagraph(kid, parts));
  };

  it('tek konu "#küçük harf" GÖVDENİN DEVAMINDA çizilir', () => {
    render(<FeedPostCard post={post({ topic: 'Roommate' })} />);
    // tr sözlüğünde "Ev arkadaşı".
    expect(screen.getByText('#ev arkadaşı')).toBeTruthy();
    expect(screen.queryByText('Ev arkadaşı')).toBeNull();
    expect(
      hasInlineParagraph(screen.toJSON(), [
        'Yarın kütüphane kaçta açılıyor?',
        '#ev arkadaşı',
      ]),
    ).toBe(true);
  });

  /**
   * ⚠️🔴 ÖLÇÜ ARTIK GÖVDEDEN DEĞİL TARİHTEN (istek: "hashtag rengi tarihle
   * aynı olsun, boyutu da"). Etiket gövdenin bir parçası değil, satırın
   * KÜNYESİ: isim/tarih satırıyla aynı punto (15) ve aynı gri.
   *
   * ⚠️ AĞIRLIK TARİHTEN AYRI (500, 400 DEĞİL) — sonraki bir istek: "bi tık
   * daha bold yap, 400'se 500 yap". Gri yazı 400'de silik okunuyordu; satır
   * içine taşındıktan sonra da 500 etiketi gövdeden ayıran tek şey (dolgu
   * artık yok). Punto ve renk hâlâ tarihin ölçüsü.
   *
   * ⚠️ ÜÇ YÜZEY TEK SAYIYI OKUYOR (`feedTopicPill > TOPIC_TEXT`): kart,
   * filtre sheet'inin çipi ve composer'ın çipi. Buradaki sayı değişecekse
   * orası değişmeli.
   *
   * ⚠️ `BODY_FONT_SIZE` İLE EŞLEŞTİRME GERİ GELMEMELİ: gövde "bi tık artır"
   * istekleriyle büyüyor (15.5 → 16.5) ve etiket onunla birlikte büyümemeli.
   */
  it('TARİHLE aynı ölçüde', () => {
    render(<FeedPostCard post={post({ topic: 'Event' })} />);
    const label = screen.getByText('#etkinlik');
    const style = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style)
      : label.props.style;
    expect(style.fontSize).toBe(15);
    expect(style.fontSize).not.toBe(BODY_FONT_SIZE);
    expect(style.fontWeight).toBe('500');
    // Tarihin token'ı (`textMuted`) — ikisi bir gün ayrışırsa birlikte
    // ayrışmaları gerekiyor.
    expect(style.color).toBe('#8E8E93');
  });

  /**
   * ── KAPSÜL DURUYOR, SATIR DURMUYOR (istekler sırayla: "devamında olsun
   * direkt" + "pillden çıkarma ama hashtagi") ──────────────────────────────
   *
   * Etiket gövdenin devamında AMA hâlâ kapsülün içinde: iOS iç içe <Text>'te
   * pay/yarıçap çizmediği için kapsül paragrafa gömülü satır içi bir <View>
   * (dolgu/pay/yarıçap onda, yazı derisi içindeki <Text>'te — ikisi
   * FeedPostBody'de). Gövdenin ALTINDAKİ eski ayrı satır (flexWrap'li sıra +
   * negatif payla hiza dansı) ise tümden kalktı.
   */
  it('kapsül satır İÇİNDE duruyor; ayrı etiket satırı YOK', () => {
    render(<FeedPostCard post={post({ topic: 'Event' })} />);

    // Etiketi saran dolgulu kutu — yaprakları YALNIZ etiket.
    const findPillBox = (node: any): any => {
      if (!node || typeof node === 'string') return null;
      const s = Array.isArray(node.props?.style)
        ? Object.assign({}, ...node.props.style)
        : node.props?.style;
      if (
        node.type === 'View' &&
        textLeaves(node).join('') === '#etkinlik' &&
        s?.backgroundColor
      ) {
        return s;
      }
      const kids = Array.isArray(node.children) ? node.children : [];
      for (const kid of kids) {
        const hit = findPillBox(kid);
        if (hit) return hit;
      }
      return null;
    };
    expect(findPillBox(screen.toJSON())).toBeTruthy();

    // Eski etiket satırının imzası (sarabilen tek kap oydu) ARTIK YOK.
    const findRow = (node: any): any => {
      if (!node) return null;
      const s = Array.isArray(node.props?.style)
        ? Object.assign({}, ...node.props.style)
        : node.props?.style;
      if (s?.flexWrap === 'wrap' && s?.flexDirection === 'row') return s;
      const kids = Array.isArray(node.children) ? node.children : [];
      for (const kid of kids) {
        const hit = findRow(kid);
        if (hit) return hit;
      }
      return null;
    };
    expect(findRow(screen.toJSON())).toBeNull();
  });

  it('`topics` doluysa HEPSİ, gövdenin peşinde SIRAYLA çizilir', () => {
    render(
      <FeedPostCard post={post({ topic: 'Event', topics: ['Event', 'Advice'] })} />,
    );
    expect(
      hasInlineParagraph(screen.toJSON(), [
        'Yarın kütüphane kaçta açılıyor?',
        '#etkinlik',
        '#tavsiye',
      ]),
    ).toBe(true);
  });

  it('`topics` yoksa tek `topic`e düşülür (sunucu henüz dizi dönmüyor)', () => {
    render(<FeedPostCard post={post({ topic: 'Advice', topics: undefined })} />);
    expect(screen.getByText('#tavsiye')).toBeTruthy();
  });

  it('konu YOKSA blok hiç çizilmiyor — "#genel" UYDURULMUYOR', () => {
    render(<FeedPostCard post={post({ topic: undefined, topics: undefined })} />);
    expect(screen.queryByText('#genel')).toBeNull();
  });
});

/**
 * Gönderiye not butonu.
 *
 * Test edilen şey ÖLÜ BUTON: kapı tek koşul (`note.state === "Ok"`) ve kart
 * içinde hiçbir kural yeniden hesaplanmıyor. Alanın hiç gelmediği hâl ve
 * bilinmeyen bir `state` de "çizme" tarafında kalmak zorunda — aksi halde
 * buton sunucunun reddettiği bir yere basar ve kullanıcı hata duvarına yürür.
 */
describe('not butonu', () => {
  it('state Ok iken çiziliyor ve onNote çağrılıyor', () => {
    const onNote = jest.fn();
    render(
      <FeedPostCard
        post={post({ note: { state: 'Ok', availableModes: ['Friends'] } })}
        onNote={onNote}
      />,
    );
    fireEvent.press(screen.getByTestId('feed-post-note'));
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it('note alanı hiç gelmezse buton çizilmiyor (eski sunucu)', () => {
    render(<FeedPostCard post={post()} onNote={jest.fn()} />);
    expect(screen.queryByTestId('feed-post-note')).toBeNull();
  });

  it('AlreadySent ve AlreadySwiped hâllerinde çizilmiyor', () => {
    for (const state of ['AlreadySent', 'AlreadySwiped']) {
      const { unmount } = render(
        <FeedPostCard post={post({ note: { state } })} onNote={jest.fn()} />,
      );
      expect(screen.queryByTestId('feed-post-note')).toBeNull();
      unmount();
    }
  });

  it('bilinmeyen state çizdirmiyor', () => {
    render(
      <FeedPostCard post={post({ note: { state: 'SomethingNew' } })} onNote={jest.fn()} />,
    );
    expect(screen.queryByTestId('feed-post-note')).toBeNull();
  });

  it('onNote verilmezse çizilmiyor — basılacak yeri olmayan buton olmaz', () => {
    render(<FeedPostCard post={post({ note: { state: 'Ok', availableModes: ['Friends'] } })} />);
    expect(screen.queryByTestId('feed-post-note')).toBeNull();
  });
});

it('state Ok ama yazar null ise buton çizilmiyor (ölü buton)', () => {
  render(
    <FeedPostCard
      post={post({ author: null, note: { state: 'Ok', availableModes: ['Friends'] } })}
      onNote={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('feed-post-note')).toBeNull();
});
