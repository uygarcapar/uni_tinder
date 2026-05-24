import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import realtimeService from '../services/realtimeService';

/**
 * Hub bağlantı durumu banner'ı — 'reconnecting' state'inde top-bar olarak görünür.
 * 'connected' olunca 1 sn sonra fade-out.
 */
export default function ConnectionBanner() {
  const [state, setState] = useState('connected');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsub = realtimeService.on('__connectionStateChanged', (s) => {
      setState(s);
      // Connected'a dönünce kısa süre sonra gizle.
      if (s === 'connected') {
        setTimeout(() => setState((curr) => (curr === 'connected' ? 'hidden' : curr)), 1500);
      }
    });
    return unsub;
  }, []);

  if (state === 'connected' || state === 'hidden') return null;

  const isReconnecting = state === 'reconnecting';
  const bgColor = isReconnecting ? '#f59e0b' : '#dc2626';

  // Reconnecting durumunda sadece ince sarı şerit — text yok.
  if (isReconnecting) {
    return (
      <View
        style={{
          position: 'absolute',
          top: insets.top,
          left: 0,
          right: 0,
          backgroundColor: bgColor,
          height: 3,
          zIndex: 1000,
        }}
      />
    );
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        backgroundColor: bgColor,
        paddingVertical: 6,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Bağlantı koptu</Text>
    </View>
  );
}
