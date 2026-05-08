import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Animated } from 'react-native';
import { Send, Paperclip, Camera, Mic, X, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import ReplyPreview from './ReplyPreview';
import chatService from '../services/chatService';

const TYPING_DEBOUNCE_MS = 1500;
const MAX_VOICE_DURATION_MS = 60_000; // 1 dk cap

/**
 * Mesaj composer — text + image + video + voice.
 *
 * Props:
 *   conversationId, replyTo, onCancelReply, onSend, onTypingChange, disabled
 *
 * Voice flow:
 *   Mic-on basılı tut → kayıt başlar
 *   Bırak → kayıt durur, S3'e yükle, SendMessage(Voice, mediaUrl)
 *   Kayıt esnasında parmağı sola sürükle → iptal (Telegram pattern)
 */
export default function MessageInput({
  conversationId,
  replyTo,
  onCancelReply,
  onSend,
  onTypingChange,
  disabled,
}) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingStartRef = useRef(0);
  const cancelRecordingRef = useRef(false);

  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (isTypingRef.current && onTypingChange) onTypingChange(false);
      cleanupRecording();
    };
  }, []);

  const handleChangeText = (val) => {
    setText(val);
    if (!onTypingChange) return;

    if (val.length > 0 && !isTypingRef.current) {
      isTypingRef.current = true;
      onTypingChange(true);
    }

    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingChange(false);
      }
    }, TYPING_DEBOUNCE_MS);
  };

  const handleSendText = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (isTypingRef.current && onTypingChange) {
      isTypingRef.current = false;
      onTypingChange(false);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);

    Haptics.selectionAsync().catch(() => {});

    onSend({
      content: trimmed,
      contentType: 0,
      mediaUrl: null,
      replyToMessageId: replyTo?.id,
      clientMessageId: cryptoRandomUUID(),
    });
    setText('');
    onCancelReply?.();
  };

  // ============ Image / Video picker ============

  const pickAndSendMedia = async (kind) => {
    if (disabled || uploading || isRecording) return;
    try {
      const permission = kind === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      // Camera image only; library: image+video.
      const mediaTypes = kind === 'camera'
        ? ImagePicker.MediaTypeOptions.Images
        : ImagePicker.MediaTypeOptions.All;

      const launcher = kind === 'camera'
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

      const result = await launcher({
        mediaTypes,
        allowsEditing: kind === 'camera',
        quality: 0.85,
        videoMaxDuration: 60,
        exif: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || /\.(mp4|mov|webm)$/i.test(asset.uri);
      const contentType = asset.mimeType
        || (isVideo ? guessVideoMime(asset.uri) : guessImageMime(asset.uri));
      await uploadAndSend(asset, contentType, isVideo ? 3 /* Video */ : 1 /* Image */);
    } catch (err) {
      console.warn('media pick failed:', err?.message);
    }
  };

  const uploadAndSend = async (asset, contentType, msgContentType) => {
    setUploading(true);
    try {
      const sizeBytes = asset.fileSize || 0;
      const upload = await chatService.createUploadUrl({
        conversationId,
        contentType,
        sizeBytes,
      });
      await chatService.uploadToS3(upload.uploadUrl, asset.uri, contentType);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onSend({
        content: text.trim(),
        contentType: msgContentType,
        mediaUrl: upload.mediaUrl,
        replyToMessageId: replyTo?.id,
        clientMessageId: cryptoRandomUUID(),
      });
      setText('');
      onCancelReply?.();
    } catch (err) {
      Alert.alert('Yükleme başarısız', err?.response?.data?.message || err?.message || 'Tekrar dene.');
    } finally {
      setUploading(false);
    }
  };

  // ============ Voice recording ============

  const startRecording = async () => {
    if (disabled || uploading || isRecording) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Sesli mesaj için mikrofon izni ver.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();

      recordingRef.current = recording;
      cancelRecordingRef.current = false;
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // Duration tick + auto-stop at MAX.
      recordingTimerRef.current = setInterval(() => {
        const ms = Date.now() - recordingStartRef.current;
        setRecordingDuration(ms);
        if (ms >= MAX_VOICE_DURATION_MS) {
          stopRecording(false); // auto-send at cap
        }
      }, 200);
    } catch (err) {
      console.warn('recording start failed:', err?.message);
      cleanupRecording();
    }
  };

  const stopRecording = async (cancelled = false) => {
    cancelRecordingRef.current = cancelled;
    const rec = recordingRef.current;
    if (!rec) {
      cleanupRecording();
      return;
    }

    try {
      await rec.stopAndUnloadAsync();
    } catch {}
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const uri = rec.getURI();
    const duration = Date.now() - recordingStartRef.current;

    cleanupRecording();
    Haptics.selectionAsync().catch(() => {});

    if (cancelled || duration < 500 || !uri) {
      // Çok kısa kayıt veya iptal — sessiz drop.
      return;
    }

    // S3'e yükle + SendMessage(Voice).
    const contentType = 'audio/m4a';
    setUploading(true);
    try {
      const upload = await chatService.createUploadUrl({
        conversationId,
        contentType,
        sizeBytes: 0, // size meta yoksa 0; backend whitelist yaklaşımı boyutu ikinci defa enforce eder
      });
      await chatService.uploadToS3(upload.uploadUrl, uri, contentType);

      onSend({
        content: '',
        contentType: 2, // Voice
        mediaUrl: upload.mediaUrl,
        replyToMessageId: replyTo?.id,
        clientMessageId: cryptoRandomUUID(),
      });
      onCancelReply?.();
    } catch (err) {
      Alert.alert('Yükleme başarısız', err?.message || 'Tekrar dene.');
    } finally {
      setUploading(false);
    }
  };

  const cleanupRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // ============ Render ============

  if (isRecording) {
    return (
      <View className="bg-[#0a0a0a] border-t border-[#1f1f1f]">
        <View className="flex-row items-center px-4 py-3">
          <TouchableOpacity
            onPress={() => stopRecording(true)}
            hitSlop={10}
            className="p-2"
          >
            <Trash2 size={22} color="#ef4444" />
          </TouchableOpacity>
          <View className="flex-1 flex-row items-center ml-2">
            <RecordingDot />
            <Text className="text-white text-sm ml-3">
              {formatRecordingTime(recordingDuration)}
            </Text>
            <Text className="text-gray-400 text-xs ml-3" numberOfLines={1}>
              Kaydı durdurmak için gönder
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => stopRecording(false)}
            className="ml-2 w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: '#f57656' }}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const showSend = !!text.trim();

  return (
    <View className="bg-[#0a0a0a] border-t border-[#1f1f1f]">
      {replyTo && (
        <ReplyPreview reply={replyTo} mode="composing" onCancel={onCancelReply} />
      )}
      <View className="flex-row items-end px-3 py-2">
        <TouchableOpacity
          onPress={() => pickAndSendMedia('library')}
          disabled={uploading || disabled}
          className="p-2 mr-1"
          hitSlop={6}
        >
          {uploading
            ? <ActivityIndicator size="small" color="#f57656" />
            : <Paperclip size={22} color="#9ca3af" />
          }
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => pickAndSendMedia('camera')}
          disabled={uploading || disabled}
          className="p-2 mr-1"
          hitSlop={6}
        >
          <Camera size={22} color="#9ca3af" />
        </TouchableOpacity>

        <View
          className="flex-1 bg-[#1f1f1f] rounded-2xl px-3 py-2"
          style={{ minHeight: 38, maxHeight: 120 }}
        >
          <TextInput
            value={text}
            onChangeText={handleChangeText}
            placeholder={disabled ? 'Bu sohbet kapatıldı' : 'Mesaj yaz…'}
            placeholderTextColor="#6b7280"
            editable={!disabled}
            multiline
            className="text-white text-base"
            style={{ paddingTop: 0, paddingBottom: 0 }}
            maxLength={2000}
          />
        </View>

        {showSend ? (
          <TouchableOpacity
            onPress={handleSendText}
            disabled={disabled}
            className="ml-2 w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: '#f57656' }}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onLongPress={startRecording}
            delayLongPress={250}
            disabled={disabled || uploading}
            className="ml-2 w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: '#262626' }}
          >
            <Mic size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Yanıp sönen kırmızı nokta — kayıt göstergesi.
function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ef4444',
        opacity,
      }}
    />
  );
}

function formatRecordingTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function cryptoRandomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function guessImageMime(uri) {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    default: return 'image/jpeg';
  }
}

function guessVideoMime(uri) {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov': return 'video/quicktime';
    case 'webm': return 'video/webm';
    default: return 'video/mp4';
  }
}
