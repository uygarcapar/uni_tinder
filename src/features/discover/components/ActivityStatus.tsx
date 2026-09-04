import { Text, View } from "react-native";
import { colors as theme } from "@/shared/theme/colors";

// "Bugün aktif" satırı — yeşil nokta + yeşil metin.
//
// DİL UYARISI (backend sözleşmesi): `isOnlineToday` 24 SAATLİK penceredir,
// anlık presence değil. Burada "Çevrimiçi" YAZMA — kullanıcı mesaj atıp anında
// yanıt bekler. Anlık online yalnız sohbette var (partnerIsOnline).
//
// Foto üstünde de, açılmış kartın chrome zemininde de, sticky şeritte de
// BİREBİR aynı çiziliyor: 9px nokta + sabit `success` yeşili. Önceden chrome
// tarafı 8px nokta + `successText` (açık modda koyulaşan ton) kullanıyordu;
// satır expand animasyonu boyunca yer değiştirirken renk/boy atlaması göze
// çarpıyordu. Açık modda `successText`in ekstra kontrastı bilinçli olarak tek
// görünüme feda edildi — değiştirmeden önce bunu bil.
//
// SwipeCard'ın içinde tanımlıydı; CardStickyHeader de aynı satırı çizmeye
// başlayınca buraya taşındı — şerit SwipeCard'dan import edilseydi iki modül
// birbirini çağırırdı (SwipeCard → CardStickyHeader → SwipeCard).
// 9 → 7 ve metin 13 → 11: satır artık kartın hiçbir yerinde tek başına
// durmuyor, sticky şeritte ismin YANINDA duruyor (bkz. CardStickyHeader). Orada
// isim 21pt ve bu satır ona eşlik eden bir dipnot — eski ölçüde ikinci bir
// başlık gibi okunuyordu. Noktayla metin birlikte küçüldü: ikisinin oranı
// (nokta ≈ metnin 2/3'ü) korunmalı, yoksa nokta ya lekeye ya toz tanesine
// dönüyor.
export const ACTIVITY_DOT_SIZE = 7;

export default function ActivityStatus({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {/* Nokta sakin: parlama/nabız YOK — o "şu an bağlı" sinyalidir. */}
      <View
        style={{
          width: ACTIVITY_DOT_SIZE,
          height: ACTIVITY_DOT_SIZE,
          borderRadius: ACTIVITY_DOT_SIZE / 2,
          backgroundColor: theme.success,
        }}
      />
      <Text className="font-[600] text-[11px]" style={{ color: theme.success }}>
        {label}
      </Text>
    </View>
  );
}
