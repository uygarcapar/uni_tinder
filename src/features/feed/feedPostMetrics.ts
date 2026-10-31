/**
 * Gönderi kartının PAYLAŞILAN ölçüleri — saf sayılar, React yok.
 *
 * ⚠️ NİYE AYRI BİR DOSYA: bu dört sayıyı ÜÇ yüzey okuyor — kartın kendisi
 * (`FeedPostCard`), gövde bileşeni (`FeedPostBody`) ve iskelet
 * (`FeedSkeletonList`). Bir dönem hepsi `FeedPostCard`tan geliyordu, ama gövde
 * karttan çıkıp kendi dosyasına taşınınca bu DÖNGÜSEL BİR IMPORT oluyordu
 * (kart → gövde → kart). Sayılar yapraktan okunursa döngü yok.
 *
 * ⚠️ `FeedPostCard` bunları YİNE DIŞA AÇIYOR (re-export): eski import yolları
 * (`from "./FeedPostCard"`) çalışmaya devam ediyor. Yeni kod buradan okumalı.
 *
 * ⚠️ Yeni bir ölçünün iskeletin de bilmesi gerekiyorsa BURAYA yazılmalı, oraya
 * elle kopyalanmamalı. Elle kopya iki kez geri teptı: üniversite satırı karttan
 * kalkmıştı ama iskelet adın altına ikinci çubuğu çizmeye devam ediyordu, gövde
 * 15.5 → 16.5'e çıkınca da satır boyu eski kalmıştı — yükleme bitince liste
 * zıplıyordu.
 */

export const AVATAR = 34;

/**
 * Kartın üç bloğu (başlık · gövde · aksiyon satırı) arasındaki TEK pay.
 * İkisi de 12'ydi ve ayrı ayrı yazılıydı; tek sayı olması iskeletin dikey
 * hizasını kartla kilitliyor.
 */
export const BLOCK_GAP = 12;

/**
 * Gövde metninin ölçüsü.
 *
 * 15.5 → 16.5 (istek: "bi tık artır"). Gövde artık başlık satırından (15)
 * BÜYÜK ve bu bilinçli: kartın asıl içeriği yazının kendisi, isim/tarih onun
 * künyesi. `lineHeight` birlikte büyüdü — oran 1.36'da sabit tutuldu, yoksa
 * çok satırlı gövde sıkışık okunuyor.
 */
export const BODY_FONT_SIZE = 16.5;
export const BODY_LINE_HEIGHT = 22.5;
