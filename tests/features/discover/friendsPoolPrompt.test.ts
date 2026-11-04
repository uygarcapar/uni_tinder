/**
 * "Bu kullanıcıya Friends havuz sorusu sorulmalı mı?" — kayıt SONRASI karar.
 *
 * Kayıt sırasında karar cinsiyet kataloğundan türetiliyordu
 * (isNonBinaryOnlyGender); burada TÜRETİLMİYOR. Profilde kategori saklanmıyor
 * ve `Transgender` iki kategoride birden görünüyor, yani istemcinin türetmesi
 * sıraya bağlı bir tahmin olurdu. Karar sunucunun: `friendsInterestedInLocked`.
 *
 * İki tuzak buradan geçiyor:
 *
 * 1. Bayrak HİÇ GELMEZSE (eski sunucu, alan yayınlanmamış) soru SORULMAMALI.
 *    `!locked` yazmak `undefined`ı "sor" diye okurdu ve sahadaki her kullanıcıya
 *    olmayan bir soru açardı. Karşılaştırma `=== false`.
 *
 * 2. Soru ULAŞILABİLİR olmalı ama HAPSETMEMELİ. Değeri boş kalan kullanıcı
 *    sheet'i kapatıp modu kullanmaya devam edebilmeli; `alreadyAsked` o oturum
 *    işareti. Kalıcı DEĞİL — bir sonraki açılışta tekrar soruluyor, çünkü soru
 *    cevaplanmadıkça deste kuralı eksik kalıyor.
 */

import { shouldAskFriendsPool } from '@/features/discover/friendsPoolPrompt';

const UNLOCKED = {
  modes: { friends: true },
  friendsInterestedInLocked: false,
  friendsInterestedIn: [],
};

describe('shouldAskFriendsPool', () => {
  it('kilit açık ve havuz boşken soruyor', () => {
    expect(shouldAskFriendsPool(UNLOCKED)).toBe(true);
  });

  it('kilit bayrağı HİÇ gelmezse sormuyor', () => {
    expect(shouldAskFriendsPool({ modes: { friends: true } })).toBe(false);
  });

  it('kilit true ise sormuyor', () => {
    expect(
      shouldAskFriendsPool({
        ...UNLOCKED,
        friendsInterestedInLocked: true,
      }),
    ).toBe(false);
  });

  it('kilit bayrağı bool olmayan bir değerle gelirse sormuyor', () => {
    // 'false' (string) ya da 0 gelirse `=== false` tutmaz — gevşek
    // karşılaştırma burada sahaya olmayan bir soru açardı.
    for (const bad of ['false', 0, null, undefined]) {
      expect(
        shouldAskFriendsPool({ ...UNLOCKED, friendsInterestedInLocked: bad }),
      ).toBe(false);
    }
  });

  it('havuz zaten doluysa sormuyor', () => {
    expect(
      shouldAskFriendsPool({ ...UNLOCKED, friendsInterestedIn: ['Women'] }),
    ).toBe(false);
  });

  it('bu oturumda zaten sorulduysa sormuyor', () => {
    expect(shouldAskFriendsPool(UNLOCKED, { alreadyAsked: true })).toBe(false);
  });

  it('Friends profili açık değilse sormuyor', () => {
    expect(
      shouldAskFriendsPool({ ...UNLOCKED, modes: { friends: false } }),
    ).toBe(false);
    expect(shouldAskFriendsPool({ ...UNLOCKED, modes: undefined })).toBe(false);
  });

  it('profil hiç gelmemişse sormuyor', () => {
    expect(shouldAskFriendsPool(null)).toBe(false);
    expect(shouldAskFriendsPool(undefined)).toBe(false);
  });
});
