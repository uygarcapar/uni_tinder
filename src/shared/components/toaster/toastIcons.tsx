import { Check, RotateCcw, MessageCircle } from '@/shared/icons';
import SFIcon from '../SFIcon';
import FireGlyph from '../FireGlyph';
import NoteGlyph from '../NoteGlyph';
import PremiumFlame from '../PremiumFlame';
import { badgeFireFill, badgeNeutralFill } from '../../theme/badge';
import {
  DEFAULT_APP_MODE,
  type AppMode,
} from '@/features/discover/modeTheme';

/**
 * Toast'ların solundaki ÜRÜN simgesi — hangi ürün hakkında konuşulduğu metni
 * okumadan anlaşılsın diye ("kredin yüklendi" tek başına hangi kredi olduğunu
 * söylemiyordu).
 *
 * Fire ve not, uygulama ikonundan sökülen KENDİ glyph'lerini kullanıyor
 * (FireGlyph / NoteGlyph) — SwipeCard'daki fire kalbi ve NoteBox ile
 * birebir aynı şekil. SF karşılıkları (`star.fill`, `bubble.left.fill`) bilerek
 * kullanılmıyor: ürünün işareti uygulama genelinde tek olmalı.
 */
export type ToastIconKind =
  | 'like'
  | 'fire'
  | 'note'
  | 'recovery'
  | 'message'
  | 'check'
  | 'premium';

/**
 * Simge dairesinin dolgusu — KURALIN KAYNAĞI BİLDİRİMLER EKRANI.
 *
 * Kanonik olan Bildirimler listesindeki tip rozeti (`TYPE_BADGES`); toast onu
 * birebir takip ediyor, ortak değerler `shared/theme/badge.ts`te. Aynı olayın
 * iki yerde farklı renk taşıması (Fire listede kırmızı, toast'ta koyu modda
 * başka bir kırmızı, açık modda siyah) aynı şeyi iki ayrı şey gibi gösteriyordu.
 *
 * ⚠️ Eski kural — "açık modda hepsi siyah, koyu modda ürünün rengi" — BİLEREK
 * kaldırıldı: renk artık temaya göre değil OLAYA göre seçiliyor. Açık modda
 * beyaz cam kartın üstünde kırmızı daire görmek beklenen davranış.
 *
 * Takip BİREBİR DEĞİL, tek istisna `message`: aynı glif Bildirimler'de gelen
 * mesajı, toast'ta ise mesaj HAKKINI anlatıyor — ikisi aynı olay olmadığı için
 * renk de aynı değil (gerekçe fonksiyonun içinde).
 */
export function toastIconBackground(kind: ToastIconKind): string {
  // Bildirimler'de renk taşıyan tek karşılığı olan tip Fire. Kalanların hepsi
  // orada nötr disk: beğeni, not, kaçırılan eşleşme (= kurtarma) ve kota tiki.
  if (kind === 'fire') return badgeFireFill();
  // ⚠️ `message` BİLEREK yeşil DEĞİL (Bildirimler'deki Message rozeti yeşil
  // olmaya devam ediyor). Oradaki rozet GELEN bir mesajı işaretliyor; bu
  // simgenin tek kullanıcısı ise sohbetteki mesaj HAKKI toast'ları
  // (chat.quota.*, bkz. ChatScreen) — yani iyi haber değil, kota haberi.
  // Yeşil daire "mesajın geldi" diye okunuyordu; kota ailesinin geri kalanı
  // (beğeni kotasının tiki) gibi nötr siyah diskte beyaz glif.
  // Premium'un Bildirimler'de karşılığı YOK — premium haberleri sistem
  // bildirimi sayılıyor ve rozet almıyor, yani kopyalanacak bir renk yok. Nötr
  // kovaya düşüyor; eskiden litPlus kırmızısıydı, ürün geri isterse tek satır.
  return badgeNeutralFill();
}

export function ToastIconGlyph({
  kind,
  size,
  color,
  mode = DEFAULT_APP_MODE,
}: {
  kind: ToastIconKind;
  size: number;
  color: string;
  /**
   * OLAYIN modu, ekranın seçili modu DEĞİL (gerekçe LikeToast > mode) —
   * `fire` ve `like` gliflerini seçiyor: Flört'te alev, Arkadaş'ta yıldız
   * (bkz. FireGlyph). Verilmezse Dating, yani modu bilmeyen çağıran (ör.
   * debug kataloğu) bugünkü şekli görür.
   *
   * ⚠️ DAİRENİN RENGİ BUNDAN ETKİLENMİYOR: dolgu Bildirimler listesindeki
   * rozetle tek kaynak ve o liste mod bilgisi taşımıyor (bkz.
   * toastIconBackground). Yalnız glif dönüyor.
   */
  mode?: AppMode;
}) {
  if (kind === 'fire') return <FireGlyph size={size} color={color} mode={mode} />;
  // Premium — isim yanındaki rozetle aynı alev glyph'i. `color` verildiği için
  // gradyan yerine DÜZ dolgu: daire zaten litPlus kırmızısı, rozetin kendi
  // kırmızı-turuncu gradyanı orada zemine gömülürdü (bkz. PremiumFlame).
  if (kind === 'premium') return <PremiumFlame size={size} color={color} />;
  // Balonun içindeki kalp DELİK (fillRule evenodd) — altındaki daire oradan
  // görünür, ikinci bir renk taşımıyoruz. Bkz. NoteGlyph.
  if (kind === 'note') return <NoteGlyph size={size} color={color} />;
  // Mesaj hakkı — ürünün kendi glif'i YOK, konuşulan şey sohbetin kendisi.
  // Dolu balon: içi boş çizgi glif, dolgulu dairenin içinde zayıf kalıyor.
  if (kind === 'message') {
    return (
      <SFIcon
        name="message.fill"
        fallback={MessageCircle}
        size={size}
        color={color}
        strokeWidth={2}
        fill={color}
      />
    );
  }
  // Onay işareti — uygulamanın her yerindeki `checkmark` + bold (seçili satır,
  // paywall madde listesi, kayıt adımları) ile aynı glif.
  if (kind === 'check') {
    return (
      <SFIcon
        name="checkmark"
        fallback={Check}
        size={size}
        color={color}
        strokeWidth={2.5}
        weight="bold"
      />
    );
  }
  // Beğeni — SF `heart.fill` / lucide `Heart` DEĞİL, ürünün kendi işareti
  // (FireGlyph): Likes sekmesi, kartın Fire butonu ve süper beğeni toast'ı
  // aynı şekli taşıyor; jenerik sistem kalbi aralarında yabancı kalıyordu.
  // Fire işaretini PAYLAŞTIĞI için modu da paylaşıyor: Arkadaş'ta burada da
  // yıldız çizilir, yoksa aynı yüzeyde iki ayrı glif dili olurdu.
  if (kind === 'like') return <FireGlyph size={size} color={color} mode={mode} />;
  return (
    <SFIcon
      name="arrow.counterclockwise"
      fallback={RotateCcw}
      size={size}
      color={color}
      strokeWidth={2}
      weight="semibold"
    />
  );
}
