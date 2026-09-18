/**
 * DEV — toast galerisi. Katalogdaki her toast'ı gerçek `show*Toast` çağrısıyla
 * ekrana düşürür; "hepsini oynat" ile sırayla bir tur attırır.
 *
 * Neden ayrı bir ekran: toast ekranın ÜSTÜNE düşüyor, yani onu görebilmek için
 * altta duran şeyin ne olduğu önemsiz — ama bir yerden tetiklenmesi gerekiyor.
 * Burası o tetik; asıl bakılacak yer ekranın kendisi değil, üstünden geçen
 * banner.
 *
 * ⚠️ Yalnız `__DEV__`'de route'a bağlanıyor (bkz. AppNavigator) — release'de
 * ölü kod. Katalog da öyle.
 *
 * Tema düğmesi bilerek burada: cam kabuk iki modda farklı davranıyor (daire
 * dolguları polarite çeviriyor, bkz. toastIcons) ve Ayarlar'a gidip geri gelmek
 * akışı bozuyordu. Tema değişimi ağacı remount ediyor ama AppNavigator yığını
 * snapshot'ladığı için bu ekranda kalınıyor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from '@/shared/icons';
import { colors, ink } from '@/shared/theme/colors';
import { setThemePreference, useThemeMode } from '@/shared/theme/themeMode';
import { hideToast } from '@/shared/services/toaster';
import { ALL_TOAST_CASES, TOAST_CATALOG, type ToastCase } from './toastCatalog';

/**
 * Sıralı oynatmada iki toast arası. Banner'ın kendi süresi 5 sn (BANNER_MOTION)
 * ama sıradaki gösterim öncekini "reset" kuyruk moduyla ittiriyor: 300 ms
 * çıkış + 450 ms giriş, geriye ~1.8 sn seyir kalıyor. Daha kısası çıkış
 * animasyonunu yutuyor, daha uzunu turu gereksiz uzatıyor.
 */
const PLAY_INTERVAL_MS = 2600;

export default function ToastGalleryScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  // Tema değişince paletten okunan renkler tazelensin (colors mutasyona uğruyor).
  const mode = useThemeMode();

  // null = oynatmıyor. Sayı, sıradaki vakanın indeksi.
  const [playing, setPlaying] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(null);
    hideToast();
  }, []);

  // Ekrandan çıkarken kuyruk ölmeli: aksi halde başka bir ekranın üstünde
  // sahte toast'lar düşmeye devam ederdi.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (playing === null) return;
    if (playing >= ALL_TOAST_CASES.length) {
      stop();
      return;
    }
    ALL_TOAST_CASES[playing].run();
    timerRef.current = setTimeout(() => setPlaying((i) => (i === null ? null : i + 1)), PLAY_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, stop]);

  const rowBg = ink(0.06);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingBottom: 8,
          gap: 8,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ padding: 4 }}>
          <ChevronLeft size={26} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 }}>
          Toast galerisi · {ALL_TOAST_CASES.length}
        </Text>
        <Pressable
          onPress={() => setThemePreference(mode === 'dark' ? 'light' : 'dark')}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: rowBg,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
            {mode === 'dark' ? 'Koyu' : 'Açık'}
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
        <Pressable
          onPress={() => (playing === null ? setPlaying(0) : stop())}
          style={{
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: playing === null ? colors.primary : rowBg,
          }}
        >
          <Text
            style={{
              color: playing === null ? colors.onMedia : colors.text,
              fontSize: 15,
              fontWeight: '700',
            }}
          >
            {playing === null
              ? 'Hepsini sırayla oynat'
              : `Durdur · ${playing + 1}/${ALL_TOAST_CASES.length}`}
          </Text>
        </Pressable>
        <Text style={{ color: colors.neutral200, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
          {playing !== null
            ? ALL_TOAST_CASES[Math.min(playing, ALL_TOAST_CASES.length - 1)].label
            : // Dokunma davranışı da gerçeğin aynısı: mesaj toast'ı sahte bir
              // sohbet açar, beğeni toast'ı Beğeniler sekmesine gider.
              'Toast’a dokunmak gerçek hedefine gider — galeriden çıkarsın.'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 40 }}
        // Toast ekranın üstünde duruyor; listeye dokunurken kaydırma kilidi
        // istemiyoruz — banner'a dokunmak zaten notifier'ın kendi katmanı.
        keyboardShouldPersistTaps="handled"
      >
        {TOAST_CATALOG.map((group) => (
          <View key={group.title} style={{ marginTop: 18 }}>
            <Text
              style={{
                color: colors.neutral200,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginBottom: 6,
                marginLeft: 4,
              }}
            >
              {group.title}
            </Text>
            <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: rowBg }}>
              {group.cases.map((c, i) => (
                <Row key={c.id} item={c} first={i === 0} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Row({ item, first }: { item: ToastCase; first: boolean }) {
  return (
    <Pressable
      onPress={item.run}
      // ⚠️ Fonksiyon-stil (`style={({pressed}) => …}`) BU PROJEDE SESSİZCE
      // DÜŞÜYOR (NativeWind interop) — basılı hâli opaklıkla değil sabit
      // stille veriliyor.
      android_ripple={{ color: ink(0.1) }}
      style={{
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: ink(0.06),
      }}
    >
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{item.label}</Text>
      <Text style={{ color: colors.neutral200, fontSize: 11, marginTop: 2 }}>{item.from}</Text>
    </Pressable>
  );
}
