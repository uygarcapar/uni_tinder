import { Text, View } from "react-native";
import { colors } from "@/shared/theme/colors";

/**
 * Composer'ların sol üstündeki bakiye rozeti — kalan hak.
 *
 * Gönderi ve yanıt composer'ları AYNI bileşeni kullanıyor: ikisinde de aynı
 * yerde, aynı ölçüde durması gerekiyor ve kopyalanan bir rozet ikinci dosyada
 * sessizce ayrışırdı.
 *
 * `label` null ise satır boş kalıyor — "0 hak" yazmak backend alanı
 * göndermediğinde yalan olurdu.
 *
 * ⚠️ GLİF YOK (istek). Bir ara solda akışın `square.and.pencil` glifi
 * duruyordu; native sembolün doğal yüksekliği `size`la birebir tutmadığı için
 * yazıyla hizası sürekli kayıyordu ve iki composer'da da kaldırıldı. Geri
 * eklenecekse hizalama kutu/satır yüksekliğinden değil, glifi metnin kapak
 * yüksekliğine oturtan ayrı bir kutudan çözülmeli.
 */
export default function FeedQuotaBadge({ label }: { label: string | null }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {!!label && (
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            lineHeight: 22,
          }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}
