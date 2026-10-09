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
 *
 * ── `mediaUrl` verilirse 1. ve 2. ADIM ATLANIR ──────────────────────────────
 * Yükleme tamamlandıktan sonra 3. adım patlarsa (ya da uygulama tam o anda
 * kapanırsa) elimizde kalıcı `mediaUrl` var ve backend'in açık ricası onu
 * yeniden kullanmak: her `upload-url` çağrısı YENİ bir S3 anahtarı üretiyor,
 * yani tekrar yüklemek yetim nesne bırakıyor (7 gün sonra temizlik işi
 * siliyor) ve bedava değil.
 *
 * Yan kazanç: bu dalda yerel dosyaya HİÇ bakılmıyor — iOS cache dizinini
 * boşalttıysa bile mesaj gidebiliyor, çünkü ses zaten S3'te.
 *
 * Nesne silinmişse (7 günden eski yetim) sunucu UT-6605 döner; çağıran o kodu
 * görünce `mediaUrl`'i düşürüp 1. adımdan başlatıyor (bkz. outbox).
 */
export async function sendVoiceMessage({
  conversationId,
  uri,
  mediaUrl,
  durationMs,
  waveformPeaks,
  clientMessageId,
  replyToMessageId,
  onUploaded,
}: {
  conversationId: string;
  /** Yerel kayıt. `mediaUrl` verilmişse gerekmiyor. */
  uri?: string | null;
  /** Tamamlanmış yüklemenin kalıcı anahtarı — varsa yükleme tekrarlanmaz. */
  mediaUrl?: string | null;
  durationMs: number;
  waveformPeaks?: string;
  clientMessageId: string;
  replyToMessageId?: string;
  /**
   * 2. adım bittiği ANDA çağrılır — 3. adımdan ÖNCE. Çağıran burada
   * `mediaUrl`'i kalıcı yere yazıyor; yoksa gönderim patladığında yükleme
   * bilgisi uçar ve tekrar denemede dosya ikinci kez yüklenirdi.
   */
  onUploaded?: (mediaUrl: string) => void;
}): Promise<MessageDto> {
  let key = mediaUrl ?? null;

  if (!key) {
    if (!uri) throw new Error("voice-file-missing");
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
    key = upload.mediaUrl;
    onUploaded?.(key);
  }

  return chatService.sendMessage({
    conversationId,
    content: "",
    clientMessageId,
    // Enum PascalCase string olarak gider (bkz. api wire sözleşmesi).
    contentType: "Voice",
    mediaUrl: key,
    durationMs,
    waveformPeaks,
    replyToMessageId,
  });
}
