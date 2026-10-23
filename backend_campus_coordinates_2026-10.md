# Üniversite koordinatları — kampüs noktası talebi

> **Durum (2026-10-21):** Backend talebi yanıtladı — 131 kayıt dolduruldu, eski 74 kaydın 31'i
> ≥1 km düzeltildi, 9 kayıt bilinçli olarak eksik bırakıldı. **Ancak değişiklik
> `api.lit.4ourstack.com` üzerinde CANLI DEĞİL:** uç nokta hâlâ 131 `isApproximate: true`
> döndürüyor, Sultanahmet yığını 29, `cankaya.edu.tr` hâlâ `39.83, 32.68`. Önbellek değil
> (başlıklarda cache yok; `?cb=` + `no-cache` ile bayt bayt aynı gövde). Dağıtım bekleniyor.
>
> İstemcide yapılacak iş YOK: kapı veriye bağlı (`isApproximate` → zoom 14 / zoom 11), veri
> düştüğü an kendiliğinden yakın ölçeğe geçer.
>
> Açık kalan iki istek: (a) `okan.edu.tr` teyit edilene kadar `isApproximate: true` olsun
> (~1 km belirsizlik + `false` damgası = zoom 14'te kampüs kadraj dışında);
> (b) canlıdaki 31 sapmalı kayıt (18 km'ye kadar) şu an `false` damgalı olduğu için
> dağıtımın önceliği bu.

**Endpoint:** `GET /api/common/universities` · ölçüm tarihi: 2026-10-20 · kayıt sayısı: 207

## Durum

- `isApproximate: true` → **131** kayıt (yani 63%). Bu kayıtlarda `lat`/`lon` kampüsün değil **ilin merkezi**.
- `isApproximate: false` → 76 kayıt. Bunlar gerçekten kampüste (Boğaziçi 41.0847,29.0509 · İTÜ 41.1055,29.024 · ODTÜ 39.891,32.783 doğru).
- Koordinatı boş/0 olan kayıt yok.

### En görünür sonuç: aynı noktaya yığılma

| koordinat | kaç üniversite | nerede |
|---|---|---|
| 41.0082,28.9784 | 29 | il merkezi |
| 39.9334,32.8597 | 11 | il merkezi |
| 37.8714,32.4846 | 4 | il merkezi |
| 38.7312,35.4787 | 3 | il merkezi |
| 37.0662,37.3833 | 3 | il merkezi |
| 38.4237,27.1428 | 3 | il merkezi |

En uçta **41.0082, 28.9784** (Sultanahmet) üstünde **29 İstanbul üniversitesi** birebir aynı noktada duruyor:

Altınbaş Üniversitesi, Ataşehir Adıgüzel Meslek Yüksekokulu, Beykoz Üniversitesi, Biruni Üniversitesi, Demiroğlu Bilim Üniversitesi, Doğuş Üniversitesi, Fenerbahçe Üniversitesi, Haliç Üniversitesi, Işık Üniversitesi, İstanbul 29 Mayıs Üniversitesi, İstanbul Arel Üniversitesi, İstanbul Atlas Üniversitesi, İstanbul Beykent Üniversitesi, İstanbul Esenyurt Üniversitesi, İstanbul Galata Üniversitesi, İstanbul Gedik Üniversitesi, İstanbul Gelişim Üniversitesi, İstanbul Kent Üniversitesi, İstanbul Nişantaşı Üniversitesi, İstanbul Rumeli Üniversitesi, İstanbul Sabahattin Zaim Üniversitesi, İstanbul Sağlık ve Sosyal Bilimler Meslek Yüksekokulu, İstanbul Sağlık ve Teknoloji Üniversitesi, İstanbul Şişli Meslek Yüksekokulu, İstanbul Ticaret Üniversitesi, İstanbul Topkapı Üniversitesi, İstanbul Yeni Yüzyıl Üniversitesi, İstinye Üniversitesi, Sağlık Bilimleri Üniversitesi.

## Neden şimdi önemli

Akış ekranında kampüs haritası artık **cadde ölçeğinde** (zoom 14) gösteriliyor ve kampüsün tam noktasına bir okul figürü konuyor. Şehir ölçeğinde (zoom 11) fark edilmeyen sapma bu ölçekte kullanıcının kendi kampüsünü tanıdığı yerde yanlış sokağı işaret ediyor.

İstemci şu an **yalan söylememek için** geri çekiliyor: `isApproximate: true` gelen kayıt şehir ölçeğinde çiziliyor. Yani bugün o 131 üniversitenin kullanıcısı yakın haritayı göremiyor.

## İstenen

1. **131 kayda gerçek kampüs koordinatı** (ana kampüsün merkezi ya da ana giriş) ve o kayıtlarda `isApproximate: false`.
2. **Hassasiyet: en az 4 ondalık** (~11 m). Şu anki `false` kayıtlar 3 ondalığa yuvarlanmış görünüyor (~110 m, zoom 14 için sınırda); 16 kayıt ise 2 ya da daha az ondalıkla geliyor (~1.1 km, bu ölçekte gözle yanlış):

   alanyauniversity.edu.tr (36.56,32.01) · anadolu.edu.tr (39.784,30.51) · ankara.edu.tr (39.94,32.83) · atilim.edu.tr (39.806,32.73) · bandirma.edu.tr (40.352,27.97) · cankaya.edu.tr (39.83,32.68) · eskisehir.edu.tr (39.814,30.5) · okan.edu.tr (40.83,29.334) · ieu.edu.tr (38.39,27.045) · ikc.edu.tr (38.46,27.077) · msgsu.edu.tr (41.03,28.985) · omu.edu.tr (41.362,36.19) · ozyegin.edu.tr (41.027,29.25) · tarsus.edu.tr (36.92,34.895) · tedu.edu.tr (39.92,32.856) · tau.edu.tr (41.11,29.125)

3. **`isApproximate` doğru kalsın.** İstemcinin tek kapısı bu: kampüs ölçeği ile şehir ölçeği arasında o karar veriyor. Gerçek kampüs koordinatı girilmeden `false` yapılırsa hata sessizce kullanıcıya gider.
4. **Alias domainler aynı koordinatı taşımaya devam etsin.** Şu an tutarlı (çoklu-domain grubu: 2, grup içi tutarsızlık: 0) — istemci alias listesinden (non-distinct) okuduğu için bu şart.

## Sözleşme değişikliği GEREKMİYOR

Alan adları aynı kalıyor: `lat`, `lon`, `isApproximate`. Sadece **veri** düzeltilince istemci kendiliğinden yakın ölçeğe geçiyor — uygulama sürümü çıkmasına gerek yok.

## Sorular

1. **Çok kampüslü üniversitelerde hangi nokta?** Bugün tek `lat`/`lon` var. Domain hangi kampüse aitse o mu, yoksa rektörlük mü? İleride kampüs bazlı bir liste (`campuses[]`) planlanıyor mu — akış/eşleşme kampüs bazına inerse buna ihtiyaç olacak.
2. 131 kaydı doldurmak için bir kaynağınız var mı (YÖK/OSM), yoksa liste olarak biz mi çıkaralım? Aşağıdaki tablo hazır.

## Eksik kayıtlar (131)

| domain | üniversite | şu anki lat | şu anki lon |
|---|---|---|---|
| agu.edu.tr | Abdullah Gül Üniversitesi | 38.7312 | 35.4787 |
| atu.edu.tr | Adana Alparslan Türkeş Bilim ve Teknoloji Üniversitesi | 37 | 35.3213 |
| adiyaman.edu.tr | Adıyaman Üniversitesi | 37.7648 | 38.2786 |
| aku.edu.tr | Afyon Kocatepe Üniversitesi | 38.7507 | 30.5567 |
| afsu.edu.tr | Afyonkarahisar Sağlık Bilimleri Üniversitesi | 38.7507 | 30.5567 |
| agri.edu.tr | Ağrı İbrahim Çeçen Üniversitesi | 39.7191 | 43.0503 |
| aksaray.edu.tr | Aksaray Üniversitesi | 38.3687 | 34.037 |
| altinbas.edu.tr | Altınbaş Üniversitesi | 41.0082 | 28.9784 |
| amasya.edu.tr | Amasya Üniversitesi | 40.6499 | 35.8353 |
| ankarabilim.edu.tr | Ankara Bilim Üniversitesi | 39.9334 | 32.8597 |
| hacibayram.edu.tr | Ankara Hacı Bayram Veli Üniversitesi | 39.9334 | 32.8597 |
| ankaramedipol.edu.tr | Ankara Medipol Üniversitesi | 39.9334 | 32.8597 |
| mgu.edu.tr | Ankara Müzik ve Güzel Sanatlar Üniversitesi | 39.9334 | 32.8597 |
| asbu.edu.tr | Ankara Sosyal Bilimler Üniversitesi | 39.9334 | 32.8597 |
| aybu.edu.tr | Ankara Yıldırım Beyazıt Üniversitesi | 39.9334 | 32.8597 |
| antalya.edu.tr | Antalya Bilim Üniversitesi | 36.8969 | 30.7133 |
| ardahan.edu.tr | Ardahan Üniversitesi | 41.1105 | 42.7022 |
| artvin.edu.tr | Artvin Çoruh Üniversitesi | 41.1828 | 41.8183 |
| adiguzel.edu.tr | Ataşehir Adıgüzel Meslek Yüksekokulu | 41.0082 | 28.9784 |
| avrasya.edu.tr | Avrasya Üniversitesi | 41.0015 | 39.7178 |
| adu.edu.tr | Aydın Adnan Menderes Üniversitesi | 37.856 | 27.8416 |
| balikesir.edu.tr | Balıkesir Üniversitesi | 39.6484 | 27.8826 |
| bartin.edu.tr | Bartın Üniversitesi | 41.6344 | 32.3375 |
| batman.edu.tr | Batman Üniversitesi | 37.8812 | 41.1351 |
| bayburt.edu.tr | Bayburt Üniversitesi | 40.2552 | 40.2249 |
| beykoz.edu.tr | Beykoz Üniversitesi | 41.0082 | 28.9784 |
| bilecik.edu.tr | Bilecik Şeyh Edebali Üniversitesi | 40.0567 | 30.0665 |
| bingol.edu.tr | Bingöl Üniversitesi | 38.8853 | 40.4983 |
| biruni.edu.tr | Biruni Üniversitesi | 41.0082 | 28.9784 |
| beu.edu.tr | Bitlis Eren Üniversitesi | 38.4006 | 42.1095 |
| ibu.edu.tr | Bolu Abant İzzet Baysal Üniversitesi | 40.7392 | 31.6089 |
| mehmetakif.edu.tr | Burdur Mehmet Akif Ersoy Üniversitesi | 37.7203 | 30.2908 |
| btu.edu.tr | Bursa Teknik Üniversitesi | 40.1885 | 29.061 |
| comu.edu.tr | Çanakkale Onsekiz Mart Üniversitesi | 40.1553 | 26.4142 |
| karatekin.edu.tr | Çankırı Karatekin Üniversitesi | 40.6013 | 33.6134 |
| demiroglu.bilim.edu.tr | Demiroğlu Bilim Üniversitesi | 41.0082 | 28.9784 |
| dicle.edu.tr | Dicle Üniversitesi | 37.9144 | 40.2306 |
| dogus.edu.tr | Doğuş Üniversitesi | 41.0082 | 28.9784 |
| duzce.edu.tr | Düzce Üniversitesi | 40.8438 | 31.1565 |
| erzincan.edu.tr | Erzincan Binali Yıldırım Üniversitesi | 39.75 | 39.5 |
| erzurum.edu.tr | Erzurum Teknik Üniversitesi | 39.9043 | 41.2679 |
| fbu.edu.tr | Fenerbahçe Üniversitesi | 41.0082 | 28.9784 |
| gibtu.edu.tr | Gaziantep İslam Bilim ve Teknoloji Üniversitesi | 37.0662 | 37.3833 |
| giresun.edu.tr | Giresun Üniversitesi | 40.9128 | 38.3895 |
| gumushane.edu.tr | Gümüşhane Üniversitesi | 40.4603 | 39.4814 |
| hakkari.edu.tr | Hakkari Üniversitesi | 37.5744 | 43.7408 |
| halic.edu.tr | Haliç Üniversitesi | 41.0082 | 28.9784 |
| harran.edu.tr | Harran Üniversitesi | 37.1591 | 38.7969 |
| hku.edu.tr | Hasan Kalyoncu Üniversitesi | 37.0662 | 37.3833 |
| mku.edu.tr | Hatay Mustafa Kemal Üniversitesi | 36.4018 | 36.3498 |
| hitit.edu.tr | Hitit Üniversitesi | 40.5506 | 34.9556 |
| igdir.edu.tr | Iğdır Üniversitesi | 39.9237 | 44.045 |
| isparta.edu.tr | Isparta Uygulamalı Bilimler Üniversitesi | 37.7648 | 30.5566 |
| isikun.edu.tr | Işık Üniversitesi | 41.0082 | 28.9784 |
| inonu.edu.tr | İnönü Üniversitesi | 38.3552 | 38.3095 |
| 29mayis.edu.tr | İstanbul 29 Mayıs Üniversitesi | 41.0082 | 28.9784 |
| arel.edu.tr | İstanbul Arel Üniversitesi | 41.0082 | 28.9784 |
| atlas.edu.tr | İstanbul Atlas Üniversitesi | 41.0082 | 28.9784 |
| beykent.edu.tr | İstanbul Beykent Üniversitesi | 41.0082 | 28.9784 |
| esenyurt.edu.tr | İstanbul Esenyurt Üniversitesi | 41.0082 | 28.9784 |
| galata.edu.tr | İstanbul Galata Üniversitesi | 41.0082 | 28.9784 |
| gedik.edu.tr | İstanbul Gedik Üniversitesi | 41.0082 | 28.9784 |
| gelisim.edu.tr | İstanbul Gelişim Üniversitesi | 41.0082 | 28.9784 |
| kent.edu.tr | İstanbul Kent Üniversitesi | 41.0082 | 28.9784 |
| nisantasi.edu.tr | İstanbul Nişantaşı Üniversitesi | 41.0082 | 28.9784 |
| rumeli.edu.tr | İstanbul Rumeli Üniversitesi | 41.0082 | 28.9784 |
| izu.edu.tr | İstanbul Sabahattin Zaim Üniversitesi | 41.0082 | 28.9784 |
| issb.edu.tr | İstanbul Sağlık ve Sosyal Bilimler Meslek Yüksekokulu | 41.0082 | 28.9784 |
| istun.edu.tr | İstanbul Sağlık ve Teknoloji Üniversitesi | 41.0082 | 28.9784 |
| sisli.edu.tr | İstanbul Şişli Meslek Yüksekokulu | 41.0082 | 28.9784 |
| ticaret.edu.tr | İstanbul Ticaret Üniversitesi | 41.0082 | 28.9784 |
| topkapi.edu.tr | İstanbul Topkapı Üniversitesi | 41.0082 | 28.9784 |
| yeniyuzyil.edu.tr | İstanbul Yeni Yüzyıl Üniversitesi | 41.0082 | 28.9784 |
| istinye.edu.tr | İstinye Üniversitesi | 41.0082 | 28.9784 |
| idu.edu.tr | İzmir Demokrasi Üniversitesi | 38.4237 | 27.1428 |
| kavram.edu.tr | İzmir Kavram Meslek Yüksekokulu | 38.4237 | 27.1428 |
| tinaztepe.edu.tr | İzmir Tınaztepe Üniversitesi | 38.4237 | 27.1428 |
| kafkas.edu.tr | Kafkas Üniversitesi | 40.6013 | 43.0975 |
| istiklal.edu.tr | Kahramanmaraş İstiklal Üniversitesi | 37.5858 | 36.9371 |
| ksu.edu.tr | Kahramanmaraş Sütçü İmam Üniversitesi | 37.5858 | 36.9371 |
| karabuk.edu.tr | Karabük Üniversitesi | 41.2061 | 32.6204 |
| kmu.edu.tr | Karamanoğlu Mehmetbey Üniversitesi | 37.1759 | 33.2287 |
| kastamonu.edu.tr | Kastamonu Üniversitesi | 41.3887 | 33.7827 |
| kayseri.edu.tr | Kayseri Üniversitesi | 38.7312 | 35.4787 |
| kku.edu.tr | Kırıkkale Üniversitesi | 39.8468 | 33.5153 |
| klu.edu.tr | Kırklareli Üniversitesi | 41.7333 | 27.2167 |
| ahievran.edu.tr | Kırşehir Ahi Evran Üniversitesi | 39.1425 | 34.1709 |
| kilis.edu.tr | Kilis 7 Aralık Üniversitesi | 36.7184 | 37.1212 |
| kocaelisaglik.edu.tr | Kocaeli Sağlık ve Teknoloji Üniversitesi | 40.8533 | 29.8815 |
| gidatarim.edu.tr | Konya Gıda ve Tarım Üniversitesi | 37.8714 | 32.4846 |
| ktun.edu.tr | Konya Teknik Üniversitesi | 37.8714 | 32.4846 |
| karatay.edu.tr | Kto Karatay Üniversitesi | 37.8714 | 32.4846 |
| dpu.edu.tr | Kütahya Dumlupınar Üniversitesi | 39.4242 | 29.9833 |
| ksbu.edu.tr | Kütahya Sağlık Bilimleri Üniversitesi | 39.4242 | 29.9833 |
| lokmanhekim.edu.tr | Lokman Hekim Üniversitesi | 39.9334 | 32.8597 |
| ozal.edu.tr | Malatya Turgut Özal Üniversitesi | 38.3552 | 38.3095 |
| cbu.edu.tr | Manisa Celâl Bayar Üniversitesi | 38.6191 | 27.4289 |
| artuklu.edu.tr | Mardin Artuklu Üniversitesi | 37.3212 | 40.7245 |
| mersin.edu.tr | Mersin Üniversitesi | 36.8121 | 34.6415 |
| munzur.edu.tr | Munzur Üniversitesi | 39.1079 | 39.5401 |
| alparslan.edu.tr | Muş Alparslan Üniversitesi | 38.9462 | 41.7539 |
| erbakan.edu.tr | Necmettin Erbakan Üniversitesi | 37.8714 | 32.4846 |
| nevsehir.edu.tr | Nevşehir Hacı Bektaş Veli Üniversitesi | 38.6939 | 34.6857 |
| ohu.edu.tr | Niğde Ömer Halisdemir Üniversitesi | 37.9667 | 34.6833 |
| nny.edu.tr | Nuh Naci Yazgan Üniversitesi | 38.7312 | 35.4787 |
| odu.edu.tr | Ordu Üniversitesi | 40.9839 | 37.8764 |
| osmaniye.edu.tr | Osmaniye Korkut Ata Üniversitesi | 37.0742 | 36.2464 |
| ostimteknik.edu.tr | Ostim Teknik Üniversitesi | 39.9334 | 32.8597 |
| erdogan.edu.tr | Recep Tayyip Erdoğan Üniversitesi | 41.0201 | 40.5234 |
| sbu.edu.tr | Sağlık Bilimleri Üniversitesi | 41.0082 | 28.9784 |
| subu.edu.tr | Sakarya Uygulamalı Bilimler Üniversitesi | 40.7569 | 30.3781 |
| samsun.edu.tr | Samsun Üniversitesi | 41.2867 | 36.33 |
| sanko.edu.tr | Sanko Üniversitesi | 37.0662 | 37.3833 |
| siirt.edu.tr | Siirt Üniversitesi | 37.9333 | 41.95 |
| sinop.edu.tr | Sinop Üniversitesi | 42.0231 | 35.1531 |
| sivas.edu.tr | Sivas Bilim ve Teknoloji Üniversitesi | 39.7477 | 37.0179 |
| cumhuriyet.edu.tr | Sivas Cumhuriyet Üniversitesi | 39.7477 | 37.0179 |
| sdu.edu.tr | Süleyman Demirel Üniversitesi | 37.7648 | 30.5566 |
| sirnak.edu.tr | Şırnak Üniversitesi | 37.5164 | 42.4611 |
| nku.edu.tr | Tekirdağ Namık Kemal Üniversitesi | 40.9833 | 27.5167 |
| gop.edu.tr | Tokat Gaziosmanpaşa Üniversitesi | 40.3167 | 36.55 |
| toros.edu.tr | Toros Üniversitesi | 36.8121 | 34.6415 |
| trabzon.edu.tr | Trabzon Üniversitesi | 41.0015 | 39.7178 |
| trakya.edu.tr | Trakya Üniversitesi | 41.6818 | 26.5623 |
| thk.edu.tr | Türk Hava Kurumu Üniversitesi | 39.9334 | 32.8597 |
| ufuk.edu.tr | Ufuk Üniversitesi | 39.9334 | 32.8597 |
| usak.edu.tr | Uşak Üniversitesi | 38.6823 | 29.4082 |
| yalova.edu.tr | Yalova Üniversitesi | 40.65 | 29.2667 |
| bozok.edu.tr | Yozgat Bozok Üniversitesi | 39.8181 | 34.8147 |
| hiu.edu.tr | Yüksek İhtisas Üniversitesi | 39.9334 | 32.8597 |
| beun.edu.tr | Zonguldak Bülent Ecevit Üniversitesi | 41.4564 | 31.7987 |
