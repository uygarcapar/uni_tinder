import { ScrollView, Text, TouchableOpacity } from "react-native";
import { colors, ink } from "@/shared/theme/colors";

// Tab filtre pilleri — MessagesScreen ve LikesScreen aynı görünümü paylaşıyor.
// tabs: [{ key, label }], activeTab: seçili key, onChange: (key) => void.
// Dış boşluk/animasyon çağıran ekranda yönetilir; burası sadece pill satırını
// render eder.
//
// Satır YATAY KAYDIRILABİLİR. Sabit `flex-row` iken 4. sekme ("Kaçırdıkların")
// dar ekranlarda taşıyordu — pill genişliği etiket uzunluğuna ve kullanıcının
// yazı tipi ölçeğine bağlı olduğu için bu, sekme sayısıyla sınırlı bir sorun
// da değil (Beğeniler artık 5 sekme taşıyor). İçerik sığdığında görünüm birebir
// aynı, sığmadığında pill'ler kırpılmak yerine serbestçe sürüklenebiliyor.
//
// `bounces` + `alwaysBounceHorizontal={false}` İKİSİ BİRDEN: bu ikili "yalnız
// içerik taşıyorsa yaylan" demek. Tek başına `bounces={false}` satırı uçlarda
// sert durduruyordu (sürükleme yarıda kesiliyormuş gibi); tek başına `bounces`
// ise sığan bir satırı da sağa sola oynatır, sekmeler kaydırılabilirmiş gibi
// yanlış bir ipucu verirdi.
//
// `bleed`: satırı SAYFANIN yan padding'inden kurtarır. Bu bileşen genelde
// padding'li bir liste/kabın içinde duruyor; o padding kaydırma alanını da
// daraltıyor, yani pill'ler ekranın kenarına varmadan 16px içeride kesiliyor ve
// satır "kırpılmış" gibi duruyordu. Çağıran kendi yan payını veriyor: kutu
// negatif marjla TAM GENİŞLİĞE açılıyor, aynı pay contentContainer'a padding
// olarak geri konuyor. Sonuç: duruşta hiza birebir aynı (pill'ler kartlarla
// aynı hattan başlar), sürüklerken pill'ler ekran kenarına kadar gider.
export default function FilterPills({
  tabs,
  activeTab,
  onChange,
  style,
  bleed = 0,
}: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces
      alwaysBounceHorizontal={false}
      overScrollMode="never"
      // Negatif marj ÖNCE, çağıranın style'ı SONRA: ekran kendi marjını
      // (ör. marginBottom) yazabilsin.
      style={[bleed ? { marginHorizontal: -bleed } : null, style]}
      contentContainerStyle={{
        flexDirection: "row",
        gap: 8,
        paddingLeft: bleed,
        // Sağda birkaç px fazladan: son pill sürüklemenin sonunda ekran
        // kenarına yapışmasın, satırın bittiği yer belli olsun.
        paddingRight: bleed + 4,
      }}
    >
      {tabs.map((tab: any) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={1}
            onPress={() => onChange(tab.key)}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 13,
              backgroundColor: isActive ? colors.inverseSurface : "transparent",
              borderWidth: 1,
              borderColor: ink(0.25),
            }}
          >
            <Text
              style={{
                color: isActive ? colors.onInverseSurface : colors.text,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
