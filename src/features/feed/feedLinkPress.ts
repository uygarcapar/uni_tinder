import { Alert, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { showInfoToast } from "@/shared/services/toaster";

/**
 * Akış gövdesindeki bir linke dokunmanın ve gövdeyi kopyalamanın yan etkileri.
 *
 * Bileşenden AYRI duruyor ki `FeedPostBody` saf render kalsın: kart listenin her
 * satırında yeniden çiziliyor ve içine `Alert`/`Linking` çağrısı gömmek o
 * dosyayı test ederken tüm platform yüzeyini mock'lamayı zorunlu kılıyordu.
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * ⚠️ ONAY KAPISI ATLANAMAZ. Dokunma tek başına hiçbir şey açmıyor; önce ALAN
 * ADINI gösteren diyalog geliyor. Politikanın tamamı bu: uzun bir adresin
 * kuyruğuna gömülmüş host, diyalogda başlı başına görünüyor — kullanıcının
 * "burası benim bildiğim yer mi" sorusunu sorabildiği tek an.
 *
 * ⚠️ `host` BURADA TÜRETİLMİYOR, çağırana ait (parseFeedLinks'ten geliyor).
 * İki yerde ayrı ayrı host çıkarmak, gösterilen alan adının açılan adresten
 * ayrışabileceği bir çatlak bırakırdı.
 */
export function confirmAndOpenFeedLink(
  url: string,
  host: string,
  t: Translate,
): void {
  Alert.alert(t("feed.link.confirmTitle"), host, [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("feed.link.open"),
      onPress: () => {
        /**
         * ⚠️ SESSİZ `.catch` DEĞİL. Repoda `Linking.openURL(...).catch(() => {})`
         * kalıbı var (FeedSupportSheet'in `tel:` butonları) ve orada sessizlik
         * bilinçli: sabit bir numarayı açamamak bir uyarı penceresini hak
         * etmiyor. Burada hedef KULLANICININ YAZDIĞI bir adres ve açılmaması
         * olağan bir sonuç — hiçbir şey olmaması uygulamanın donduğunu söyler.
         */
        Linking.openURL(url).catch(() => {
          showInfoToast({ message: t("feed.link.openFailed"), variant: "error" });
        });
      },
    },
  ]);
}

/**
 * Gövdeyi panoya al — KARTTA GÖRÜNEN hâli değil, kullanıcının yazdığı HAM metin.
 *
 * Link metinleri kartta kısaltılmış çiziliyor (`feedLinkDisplay`); kopyalanan
 * şey o olursa yapıştırılan adres çalışmaz.
 */
export function copyFeedPostBody(body: string, t: Translate): void {
  Clipboard.setStringAsync(body).catch(() => {});
  Haptics.selectionAsync().catch(() => {});
  showInfoToast({ message: t("feed.link.copied") });
}
