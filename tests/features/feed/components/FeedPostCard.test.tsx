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

describe('normal gönderi', () => {
  it('yazar adı, yaşı ve üniversitesi çizilir', () => {
    render(<FeedPostCard post={post()} />);
    expect(screen.getByText('Esra, 21')).toBeTruthy();
    expect(screen.getByText('İTÜ')).toBeTruthy();
  });

  it('yaş gizliyse (null) yalnız isim çizilir', () => {
    render(
      <FeedPostCard post={post({ author: { ...post().author!, age: null } })} />,
    );
    expect(screen.getByText('Esra')).toBeTruthy();
  });

  it('üniversite gizliyse (null) satır hiç çizilmez', () => {
    render(
      <FeedPostCard
        post={post({ author: { ...post().author!, universityDisplay: null } })}
      />,
    );
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
    expect(screen.getByText(tr.feed.anonymous.Women)).toBeTruthy();
    expect(screen.queryByText('Esra, 21')).toBeNull();
    expect(screen.queryByText('İTÜ')).toBeNull();
  });

  it('authorCategory null ise sade "Anonim"', () => {
    render(<FeedPostCard post={post({ isAnonymous: true, authorCategory: null })} />);
    expect(screen.getByText(tr.feed.anonymous.plain)).toBeTruthy();
  });

  it('yazara dokunma profil AÇMAZ (anonimde açılacak profil yok)', () => {
    const onPressAuthor = jest.fn();
    render(
      <FeedPostCard
        post={post({ isAnonymous: true, authorCategory: 'Men', author: null })}
        onPressAuthor={onPressAuthor}
      />,
    );
    fireEvent.press(screen.getByText(tr.feed.anonymous.Men));
    expect(onPressAuthor).not.toHaveBeenCalled();
  });
});

describe('yanıt butonu — yalnız reply.state\'e göre', () => {
  it('Ok → "Yanıtla"', () => {
    render(<FeedPostCard post={withReply('Ok')} />);
    expect(screen.getByText(tr.feed.reply.button)).toBeTruthy();
  });

  it('AlreadyMatched → "Sohbete git" ve conversationId taşınır', () => {
    const onOpenChat = jest.fn();
    render(
      <FeedPostCard post={withReply('AlreadyMatched', '3f2a')} onOpenChat={onOpenChat} />,
    );
    fireEvent.press(screen.getByText(tr.feed.reply.goToChat));
    expect(onOpenChat).toHaveBeenCalledWith('3f2a');
  });

  it('⚠️ ANONİM gönderide sunucu Ok diyorsa "Yanıtla" — "Sohbete git" DEĞİL', () => {
    // Kimlik koruması: kart eşleşme durumunu kendi hesaplamıyor.
    render(
      <FeedPostCard
        post={post({
          isAnonymous: true,
          authorCategory: 'Women',
          reply: { state: 'Ok', conversationId: null },
        })}
      />,
    );
    expect(screen.getByText(tr.feed.reply.button)).toBeTruthy();
    expect(screen.queryByText(tr.feed.reply.goToChat)).toBeNull();
  });

  it('AlreadyReplied → pasif "Yanıtladın", basınca mutasyon tetiklenmez', () => {
    const onReply = jest.fn();
    render(<FeedPostCard post={withReply('AlreadyReplied')} onReply={onReply} />);
    fireEvent.press(screen.getByText(tr.feed.reply.replied));
    expect(onReply).not.toHaveBeenCalled();
  });

  it('OwnPost ve PreferenceMismatch → buton hiç çizilmez', () => {
    const { rerender } = render(<FeedPostCard post={withReply('OwnPost')} />);
    expect(screen.queryByText(tr.feed.reply.button)).toBeNull();

    rerender(<FeedPostCard post={withReply('PreferenceMismatch')} />);
    expect(screen.queryByText(tr.feed.reply.button)).toBeNull();
  });

  it('OtherUniversityRequiresPlus → kilitli buton, paywall çağrılır', () => {
    const onReplyPaywall = jest.fn();
    const onReply = jest.fn();
    render(
      <FeedPostCard
        post={withReply('OtherUniversityRequiresPlus')}
        onReply={onReply}
        onReplyPaywall={onReplyPaywall}
      />,
    );
    fireEvent.press(screen.getByText(tr.feed.reply.button));
    expect(onReplyPaywall).toHaveBeenCalled();
    expect(onReply).not.toHaveBeenCalled(); // composer AÇILMAZ
  });

  it('Restricted → pasif', () => {
    const onReply = jest.fn();
    render(<FeedPostCard post={withReply('Restricted')} onReply={onReply} />);
    fireEvent.press(screen.getByText(tr.feed.reply.restricted));
    expect(onReply).not.toHaveBeenCalled();
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
        statusTone="warning"
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
