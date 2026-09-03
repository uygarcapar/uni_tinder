import { File } from "expo-file-system";
import chatService from "@/features/chat/chatService";
import { VOICE_MAX_BYTES, VOICE_MIME } from "@/features/chat/voiceMessage";
import type { MessageDto } from "@/shared/types";

/** Dosya sunucunun 5 MB tavanını aşıyor — ağa hiç çıkmadan kesilir (UT-6602'nin yereli). */
export class VoiceTooLargeError extends Error {
  constructor() {
    super("voice-too-large");
  }
}

/**
 * Sesli mesaj gönderiminin üç adımı (backend rehberi):
 *   1) POST /messages/upload-url  → presigned PUT + kalıcı mediaUrl
 *   2) PUT  <uploadUrl>           → dosya DOĞRUDAN S3'e (backend'den geçmez)
 *   3) POST /messages/send        → mediaUrl + durationMs ile mesaj
 *
 * 2. adımın başarısı DOĞRULANMADAN 3. adıma geçilmez: yarım kalan yüklemede
 * sunucu dosyayı bulamayıp UT-6605 döner ve karşı tarafta sonsuza dek
 * oynatılamayan bir baloncuk kalırdı. uploadFileToS3 2xx dışını fırlatıyor.
 */
export async function sendVoiceMessage({
  conversationId,
  uri,
  durationMs,
  waveformPeaks,
  clientMessageId,
  replyToMessageId,
}: {
  conversationId: string;
  uri: string;
  durationMs: number;
  waveformPeaks?: string;
  clientMessageId: string;
  replyToMessageId?: string;
}): Promise<MessageDto> {
  const file = new File(uri);
  if (!file.exists) throw new Error("voice-file-missing");
  const sizeBytes = Number(file.size ?? 0);
  if (!sizeBytes) throw new Error("voice-file-empty");
  if (sizeBytes > VOICE_MAX_BYTES) throw new VoiceTooLargeError();

  const upload = await chatService.createUploadUrl({
    conversationId,
    contentType: VOICE_MIME,
    sizeBytes,
  });
  await chatService.uploadFileToS3(upload.uploadUrl, file, VOICE_MIME);

  return chatService.sendMessage({
    conversationId,
    content: "",
    clientMessageId,
    // Enum PascalCase string olarak gider (bkz. api wire sözleşmesi).
    contentType: "Voice",
    mediaUrl: upload.mediaUrl,
    durationMs,
    waveformPeaks,
    replyToMessageId,
  });
}
