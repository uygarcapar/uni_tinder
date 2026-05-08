import { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { Audio } from 'expo-av';

/**
 * Sesli mesaj inline player.
 * Tap → load + play, ikinci tap → pause/resume.
 * Sade waveform yok — minimal ilerleme bar'ı.
 */
export default function VoicePlayer({ uri, isOwn }) {
  const soundRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const togglePlay = async () => {
    if (!uri) return;
    try {
      if (!soundRef.current) {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPosition(status.positionMillis || 0);
            setDuration(status.durationMillis || 0);
            setPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setPlaying(false);
              setPosition(0);
              soundRef.current?.setPositionAsync(0).catch(() => {});
            }
          }
        );
        soundRef.current = sound;
        setLoading(false);
        return;
      }
      const status = await soundRef.current.getStatusAsync();
      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (err) {
      setLoading(false);
      console.warn('voice play err:', err?.message);
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const display = duration > 0 ? formatTime(duration - position) : '0:00';

  return (
    <TouchableOpacity
      onPress={togglePlay}
      activeOpacity={0.85}
      className="flex-row items-center bg-[#00000030] rounded-xl px-3 py-2 mb-1"
      style={{ minWidth: 180 }}
    >
      <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-2">
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : playing ? (
          <Pause size={16} color="#fff" />
        ) : (
          <Play size={16} color="#fff" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View className="h-1 rounded-full bg-white/20 overflow-hidden">
          <View
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              backgroundColor: '#fff',
            }}
          />
        </View>
        <Text className={`${isOwn ? 'text-white/80' : 'text-gray-300'} text-[11px] mt-1`}>
          {display}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
