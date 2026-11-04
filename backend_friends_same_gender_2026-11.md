# Friends modu — **deste yalnız aynı cinsiyet**

> **Durum: BEKLİYOR.** İstemci tarafı bu planla yapılıyor, ama kuralı **FE
> kuramaz**: bugün Friends kaydında `InterestedInFlags` varsayılan (üç
> kategori) kalıyor ve deste karma geliyor. Aşağıdaki §2 ve §3 inmeden
> uygulama, kullanıcıya zaten verdiği sözü tutmamaya devam eder.

**Altı maddelik talep.** Yeni uç yok; biri yeni iki alan dışında mevcut
alanlar üzerinde çalışıyor:

1. `Mode=Friends` deste sorgusunda aynı-kategori kuralı (§2).
2. `/modes/friends/open` gövdesindeki `interestedIn` saklansın (§3).
3. Alt cinsiyet → kategori eşlemesi sunucuda sabitlensin (§4).
4. Geriye dönük doldurma; mevcut eşleşmeler korunsun (§5).
5. Cinsiyet değişiminde yeniden türetme (§6).
6. `GET /api/profile` iki yeni alan döndürsün (§7).

---

## 1. Gözlem — verilmiş ama tutulmamış söz

Mod seçici sheet'i kullanıcıya bugün şunu yazıyor:

- TR: "Kampüsten arkadaş bul — **yalnız aynı cinsiyetten kişiler**."
- EN: "Find friends on campus — **same gender only**."

Gerçek davranış bunun tersi. Friends kaydında `RegisterStep10` (InterestedIn)
adımı atlanıyor ve sunucu `InterestedInFlags`i varsayılan **7** (üç kategori)
bırakıyor. `/modes/friends/open` gövdesinde `interestedIn` gönderilse bile
sunucu onu yok sayıyor. Sonuç: Friends destesi karma.

Bu bir filtre eksikliği değil — modun tanımı. Kullanıcının gevşetebileceği bir
ayar olarak kurulamaz.

## 2. Talep A — deste sorgusunda aynı-kategori kuralı

`Mode=Friends` ile gelen aday sorgusu (`GET /api/swipe/GetPotentialMatches`)
kullanıcının **cinsiyet kategorisiyle** sınırlansın.

**Kurallar:**

1. **Birim kategori, alt cinsiyet DEĞİL.** `Male` ile `TransMale` aynı
   havuzda. Alt cinsiyet seviyesinde eşleştirmek "aynı cinsiyet" sözünü
   tutmaz, yalnız desteyi parçalar.
2. **`InterestedInFlags` kategori seviyesinde yorumlanır.** Friends dalında
   bayrak kullanıcının kimleri göreceğini söyler; hedefin kategorisi bu
   bayrağa düşüyorsa aday kümesinde kalır.
3. **Simetri sunucunun kararı.** İki ucun birbirini görmesi gerekip
   gerekmediği (A, B'yi görüyorsa B de A'yı görmeli mi) eşleşme mantığının
   mevcut kuralıyla aynı kalsın — bu talep yalnız aday kümesini daraltıyor.
4. **`WhoLikedMe` de süzülsün.** Kural yalnız desteye uygulanırsa kurala
   aykırı bir beğeni listeye düşüp çelişki yaratır.

## 3. Talep B — `/modes/friends/open` gövdesindeki `interestedIn` saklansın

`POST /api/profile/modes/friends/open` bugün `interestedIn`i yok sayıyor.
Artık saklansın.

**Kurallar:**

1. **İkili kategorilerde sunucu istemciden geleni YOK SAYAR.** Kullanıcının
   kategorisi Erkek ise değer `["Men"]`, Kadın ise `["Women"]` olarak sunucu
   tarafından yazılır — istemci ne gönderirse göndersin. Kural böylece eski
   istemcilere ve elle kurulmuş isteklere de uygular.
2. **Non-Binary kategorisinde istemciden gelen değer yazılır.** İstemci bu
   kullanıcıya tek seferlik bir havuz sorusu soruyor (Kadınlar / Erkekler /
   Non-Binary, çoklu seçim).
3. **Alan hiç gelmediyse** mevcut değer korunur; Non-Binary'de değer yoksa
   §5'teki geçiş davranışı geçerli.
4. **Dating dalı değişmiyor.** Orada `interestedIn` kullanıcının seçimi ve
   en az bir tane zorunlu (UT-2308).

## 4. Talep C — alt cinsiyet → kategori eşlemesi sabitlensin

`GET /api/common/genders` bugün `Transgender`ı **hem Erkek hem Kadın**
kategorisinde döndürüyor. Profilde ise yalnız alt cinsiyetin `enumName`i
saklanıyor — kategori hiç saklanmıyor.

İstemci kategoriyi "listede ilk hangi kategoride geçiyorsa o" diye türetiyor;
bu **sıraya bağlı bir tahmin** ve bir kuralın temeli olamaz.

**Talep:** Her alt cinsiyetin hangi havuza düştüğü sunucuda sabitlensin ve bu
karar yazılı olsun. İki kategoride görünen değerler için (`Transgender` ve
varsa benzerleri) hangi havuza düştüğü açıkça belirtilsin.

İstemci §7'deki bayrak sayesinde bu türetmeyi **hiç yapmayacak** — karar
tamamen sunucunun.

## 5. Talep D — geçiş: mevcut Friends kullanıcıları

1. **Var olan eşleşmeler ve sohbetler korunur.** Kural yalnız yeni deste
   kartlarına uygulanır; kimsenin arkadaşı bir güncellemede kaybolmaz.
2. **İkili kategorideki mevcut Friends kullanıcıları** için değer geriye
   dönük doldurulur (kendi cinsiyetinden). Kullanıcıdan bir şey istenmez.
3. **Non-Binary mevcut Friends kullanıcıları** için değer boş kalır. Boş
   değer bugünkü davranış (üç kategori) sayılsın — deste çökmesin. İstemci
   bu kullanıcılara havuz sorusunu Friends'e girişte tek seferlik bir
   sheet ile soruyor.

## 6. Talep E — cinsiyet değişiminde yeniden türetme

Kullanıcı cinsiyetini sonradan değiştirirse, **ikili kategorilerde** sunucu
`interestedIn` değerini yeniden türetip yazsın. Aksi hâlde kilitlenmiş değer
bayatlar ve kullanıcı eski kategorisinin havuzunda kalır.

Non-Binary'ye geçen kullanıcıda kilit açılır (§7) ve istemci havuz sorusunu
sorar.

## 7. Talep F — `GET /api/profile` iki yeni alan

```
friendsInterestedIn: string[]        // ör. ["Women"] — Friends profilinin havuzu
friendsInterestedInLocked: boolean   // true = sunucu türetti, istemci sormaz
```

**Neden şart:** İstemci kayıttan sonra kategori türetemez (§4). Soruyu kime
soracağını yalnız bu bayraktan okuyabilir.

**İstemcinin okuması:** `friendsInterestedInLocked === false` ise soru
sorulur. Alan hiç gelmezse (eski sunucu) **soru sorulmaz** ve bugünkü davranış
korunur — olmayan bir soruyu uydurmak, sormamaktan kötü.

`friendsInterestedInLocked` değeri:
- Erkek / Kadın kategorisi → `true`
- Non-Binary kategorisi → `false`

## 8. Hata kodları

Mod uçları UT-23xx ailesini kullanıyor. **2305 ve 2309 bilerek nötr**: karşı
tarafın modu ya da cinsiyeti bilgi sızıntısı sayılıyor.

Non-Binary'de havuzun boş gelmesi için bir doğrulama kodu eklenecekse aynı
kurala uysun: mesaj kullanıcının kendi eksiğini anlatsın, karşı taraf
hakkında hiçbir şey ima etmesin. İstemci bu durumu zaten gönderimden önce
engelliyor; kod yalnız ikinci savunma hattı.

## 9. İstemci durumu

Bu talebe karşılık gelen FE işi planlandı ve uygulanıyor:

- `openProfileMode` Friends dalı artık `interestedIn` gönderiyor.
- Filtre modalı mod-farkındalı: Friends'te cinsiyet bölümü çizilmiyor
  (tercih hesap seviyesinde tek olduğu için Friends'teki bir seçim Dating
  destesini bozardı).
- Non-Binary kullanıcıya havuz sorusu üç yüzeyde: kayıt adımı, mod kurulum
  sheet'i, mevcut kullanıcılar için Friends'e girişte tek seferlik sheet.
- İstemci hiçbir noktada **kapı değil**; sunucunun reddi kanonik.
