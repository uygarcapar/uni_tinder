import { useSyncExternalStore } from 'react';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from 'expo-network';

/**
 * Ağ durumu için TEK native listener + tek abonelik noktası.
 *
 * NEDEN expo-network'ün kendi useNetworkState()'i DEĞİL: o hook bileşen başına
 * bir native listener ve bir setState açıyor. TabNavigator lazy:false olduğu
 * için Discover/Likes/Messages/Profile aynı anda mount ve hepsi logoyu (yani
 * göstergeyi) render ediyor — hook doğrudan kullanılsa 4-5 paralel abonelik ve
 * her ağ olayında 4-5 ayrı setState olurdu.
 *
 * Burada tek kaynak var ve DEĞER DEĞİŞMEDİKÇE notify edilmiyor: sinyal
 * gürültüsü (aynı durumun peş peşe gelmesi, ki wifi↔LTE geçişlerinde olur)
 * render'a dönüşmüyor.
 */

let offline = false;
let started = false;
const subscribers = new Set<() => void>();

/**
 * `undefined` = HENÜZ BİLİNMİYOR, offline DEĞİL.
 *
 * getNetworkStateAsync ilk cevabı verene kadar NetworkState boş bir nesne
 * ({}) olur. Burada undefined'ı offline saysaydık her cold start'ta gösterge
 * bir frame yanıp sönerdi. Sadece açıkça `false` gelirse offline'ız.
 *
 * isInternetReachable ayrıca captive portal'ı yakalar: wifi'ye bağlısın
 * (isConnected true) ama internet yok — kullanıcı açısından bu da offline.
 */
const readOffline = (state: NetworkState) =>
  state.isConnected === false || state.isInternetReachable === false;

const set = (next: boolean) => {
  if (next === offline) return;
  offline = next;
  subscribers.forEach((fn) => fn());
};

/**
 * İlk abone geldiğinde başlar, bir daha durmaz. Listener bilerek remove
 * EDİLMİYOR: uygulama ömrü boyunca tek bir native abonelik, sürekli
 * kur/yık döngüsünden ucuz ve durum her zaman güncel kalıyor.
 */
const start = () => {
  if (started) return;
  started = true;
  getNetworkStateAsync()
    .then((state) => set(readOffline(state)))
    .catch(() => {
      // Durum okunamadıysa online varsayılır — yanlış alarm vermektense
      // göstergeyi hiç açmamak yeğdir.
    });
  addNetworkStateListener((state) => set(readOffline(state)));
};

const subscribe = (onStoreChange: () => void) => {
  start();
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
};

const getSnapshot = () => offline;

/** `true` → cihazda internet yok (ya da erişilemiyor). */
export function useIsOffline() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
