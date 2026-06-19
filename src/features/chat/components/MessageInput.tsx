import { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Send, Paperclip, Mic, Trash2, Lock } from "lucide-react-native";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
import {
  Host,
  Button as SwiftUIButton,
  Menu,
  TextField,
  HStack,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  font,
  frame,
  onLongPressGesture,
  glassEffect,
  padding,
  foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import ReplyPreview from "@/features/chat/components/ReplyPreview";
import chatService from "@/features/chat/chatService";

const TYPING_DEBOUNCE_MS = 1500;
const MAX_VOICE_DURATION_MS = 60_000;
const IS_IOS = Platform.OS === "ios";

export default function MessageInput({
  conversationId,
  replyTo,
  onCancelReply,
  onSend,
  onTypingChange,
  disabled,
  quotaLocked,
  onLockedPress,
}: any) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef(null);
  const recordingStartRef = useRef(0);
  const cancelRecordingRef = useRef(false);

  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);
  const textFieldRef = useRef(null);

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
    setText("");
    textFieldRef.current?.clear().catch(() => {});
    onCancelReply?.();
  };

  const pickAndSendMedia = async (kind) => {
    if (disabled || uploading || isRecording) return;
    try {
      const permission =
        kind === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const mediaTypes =
        kind === "camera"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.All;

      const launcher =
        kind === "camera"
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;

      const result = await launcher({
        mediaTypes,
        allowsEditing: kind === "camera",
        quality: 0.85,
        videoMaxDuration: 60,
        exif: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const isVideo =
        asset.type === "video" || /\.(mp4|mov|webm)$/i.test(asset.uri);
      const contentType =
        asset.mimeType ||
        (isVideo ? guessVideoMime(asset.uri) : guessImageMime(asset.uri));
      await uploadAndSend(asset, contentType, isVideo ? 3 : 1);
    } catch (err) {
      console.warn("media pick failed:", err?.message);
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
      setText("");
      textFieldRef.current?.clear().catch(() => {});
      onCancelReply?.();
    } catch (err) {
      Alert.alert(
        "Yükleme başarısız",
        err?.response?.data?.message || err?.message || "Tekrar dene.",
      );
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (disabled || uploading || isRecording) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("İzin gerekli", "Sesli mesaj için mikrofon izni ver.");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      cancelRecordingRef.current = false;
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      recordingTimerRef.current = setInterval(() => {
        const ms = Date.now() - recordingStartRef.current;
        setRecordingDuration(ms);
        if (ms >= MAX_VOICE_DURATION_MS) {
          stopRecording(false);
        }
      }, 200);
    } catch (err) {
      console.warn("recording start failed:", err?.message);
      cleanupRecording();
    }
  };

  const stopRecording = async (cancelled = false) => {
    cancelRecordingRef.current = cancelled;
    if (!isRecording) {
      cleanupRecording();
      return;
    }

    try {
      await audioRecorder.stop();
    } catch {}
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const uri = audioRecorder.uri;
    const duration = Date.now() - recordingStartRef.current;

    cleanupRecording();
    Haptics.selectionAsync().catch(() => {});

    if (cancelled || duration < 500 || !uri) {
      return;
    }

    const contentType = "audio/m4a";
    setUploading(true);
    try {
      const upload = await chatService.createUploadUrl({
        conversationId,
        contentType,
        sizeBytes: 0,
      });
      await chatService.uploadToS3(upload.uploadUrl, uri, contentType);

      onSend({
        content: "",
        contentType: 2,
        mediaUrl: upload.mediaUrl,
        replyToMessageId: replyTo?.id,
        clientMessageId: cryptoRandomUUID(),
      });
      onCancelReply?.();
    } catch (err) {
      Alert.alert("Yükleme başarısız", err?.message || "Tekrar dene.");
    } finally {
      setUploading(false);
    }
  };

  const cleanupRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // ChatHeader progressive blur'unun aynısı, yön ters: üstte transparent → aşağı opak.
  const { colors: footerMaskColors, locations: footerMaskLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "transparent" },
          0.5: { color: "black" },
          1: { color: "rgba(0,0,0,0.99)" },
        },
      }),
    [],
  );

  const ProgressiveBlurBg = () => (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <MaskedView
        maskElement={
          <LinearGradient
            locations={footerMaskLocations}
            colors={footerMaskColors}
            style={StyleSheet.absoluteFill}
          />
        }
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={["rgba(0, 0, 0, 0.2)", "black"]}
          style={StyleSheet.absoluteFill}
        />
        <BlurView
          intensity={15}
          tint={IS_IOS ? "systemChromeMaterialDark" : "systemMaterialDark"}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </View>
  );

  if (isRecording) {
    return (
      <View style={{ paddingTop: 30, paddingBottom: insets.bottom }}>
        <ProgressiveBlurBg />
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
            style={{ backgroundColor: "#f57656" }}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const showSend = !!text.trim();

  return (
    <View style={{ paddingTop: 30, paddingBottom: insets.bottom }}>
      <ProgressiveBlurBg />
      {replyTo && (
        <ReplyPreview
          reply={replyTo}
          mode="composing"
          onCancel={onCancelReply}
        />
      )}
      <View className="flex-row items-center px-3 py-2" style={{ gap: 8 }}>
        {/* LEFT — liquid glass plus menu */}
        {IS_IOS ? (
          <Host style={{ width: 36, height: 36 }} ignoreSafeArea="keyboard">
            <Menu
              label=""
              systemImage="plus"
              modifiers={[
                buttonStyle("glass"),
                tint("#ffffff"),
                labelStyle("iconOnly"),
                font({ size: 20, weight: "medium" }),
                frame({ width: 36, height: 36 }),
              ]}
            >
              <SwiftUIButton
                label="Galeri"
                systemImage="photo"
                onPress={() => pickAndSendMedia("library")}
              />
              <SwiftUIButton
                label="Fotoğraf Çek"
                systemImage="camera"
                onPress={() => pickAndSendMedia("camera")}
              />
            </Menu>
          </Host>
        ) : (
          <TouchableOpacity
            onPress={() => pickAndSendMedia("library")}
            disabled={uploading || disabled}
            className="p-2"
            hitSlop={6}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#f57656" />
            ) : (
              <Paperclip size={22} color="#9ca3af" />
            )}
          </TouchableOpacity>
        )}

        {/* MIDDLE — liquid glass input area
            - Host: flex:1 (yatay genişlik) + matchContents vertical (SwiftUI'ın natural height'ı RN'e bildirilir → multiline grow)
            - HStack: padding(vertical) + frame(minHeight) yoksa TextField'ın 1 satırlık metnine küçülür
            - TextField: text prop'u omit (lib SwiftUI internal state'i yönetir); clear için ref kullan */}
        {IS_IOS ? (
          <View style={{ flex: 1, position: "relative" }}>
            <Host
              style={{ flex: 1 }}
              matchContents={{ vertical: true }}
              ignoreSafeArea="keyboard"
            >
              <HStack
                spacing={10}
                modifiers={[
                  frame({ maxWidth: "infinity", minHeight: 38 }),
                  padding({ horizontal: 14, vertical: 6 }),
                  glassEffect({
                    glass: { variant: "regular" },
                    shape: "capsule",
                  }),
                ]}
              >
                {quotaLocked && (
                  <SwiftUIImage
                    systemName="lock.fill"
                    size={14}
                    color="rgba(235,235,245,0.45)"
                  />
                )}
                <TextField
                  ref={textFieldRef}
                  placeholder={
                    quotaLocked
                      ? "Mesaj sınırına ulaştın"
                      : disabled
                        ? "Bu sohbet kapatıldı"
                        : "Mesaj"
                  }
                  onTextChange={handleChangeText}
                  axis="vertical"
                  maxLength={2000}
                  modifiers={[
                    foregroundStyle("#ffffff"),
                    font({ size: 16 }),
                    frame({ maxWidth: "infinity" }),
                  ]}
                />
              </HStack>
            </Host>
            {quotaLocked && (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onLockedPress}
              />
            )}
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              minHeight: 38,
              maxHeight: 120,
              borderRadius: 22,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {quotaLocked && (
              <Lock size={16} color="rgba(235,235,245,0.45)" />
            )}
            <TextInput
              value={text}
              onChangeText={handleChangeText}
              placeholder={
                quotaLocked
                  ? "Mesaj sınırına ulaştın"
                  : disabled
                    ? "Bu sohbet kapatıldı"
                    : "Mesaj"
              }
              placeholderTextColor="rgba(235,235,245,0.45)"
              editable={!disabled && !quotaLocked}
              multiline
              nativeID="chat-input"
              style={{
                flex: 1,
                color: "#fff",
                fontSize: 16,
                paddingTop: 0,
                paddingBottom: 0,
                lineHeight: 20,
              }}
              maxLength={2000}
            />
            {quotaLocked && (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onLockedPress}
              />
            )}
          </View>
        )}

        {/* RIGHT — liquid glass mic (idle) / send (text) */}
        {IS_IOS ? (
          <Host style={{ width: 36, height: 36 }} ignoreSafeArea="keyboard">
            {showSend ? (
              <SwiftUIButton
                label=""
                systemImage="arrow.up"
                onPress={handleSendText}
                modifiers={[
                  buttonStyle("glassProminent"),
                  tint("#f57656"),
                  labelStyle("iconOnly"),
                  font({ size: 18, weight: "semibold" }),
                  frame({ width: 36, height: 36 }),
                ]}
              />
            ) : (
              <SwiftUIButton
                label=""
                systemImage="mic.fill"
                modifiers={[
                  buttonStyle("glass"),
                  tint("#ffffff"),
                  labelStyle("iconOnly"),
                  font({ size: 18, weight: "medium" }),
                  frame({ width: 36, height: 36 }),
                  onLongPressGesture(() => {
                    if (!disabled && !uploading) startRecording();
                  }, 250),
                ]}
              />
            )}
          </Host>
        ) : showSend ? (
          <TouchableOpacity
            onPress={handleSendText}
            disabled={disabled}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: "#f57656" }}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onLongPress={startRecording}
            delayLongPress={250}
            disabled={disabled || uploading}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: "#262626" }}
          >
            <Mic size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
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
        backgroundColor: "#ef4444",
        opacity,
      }}
    />
  );
}

function formatRecordingTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function cryptoRandomUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function guessImageMime(uri) {
  const ext = uri.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

function guessVideoMime(uri) {
  const ext = uri.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    default:
      return "video/mp4";
  }
}
