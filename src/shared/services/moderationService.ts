import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';

export const ReportReason = {
  Spam: 'Spam',
  Harassment: 'Harassment',
  InappropriateContent: 'InappropriateContent',
  FakeProfile: 'FakeProfile',
  Underage: 'Underage',
  Scam: 'Scam',
  Other: 'Other',
} as const;

export type ReportReasonType = typeof ReportReason[keyof typeof ReportReason];

// Sebep etiketleri i18n'de: `moderation.report.reasons.<enum>` (tr.ts/en.ts).
// Burada sabit Türkçe map tutmak açık dil desteğini sessizce deliyordu.

/** GET /api/moderation/blocked-users item'ı. */
export interface BlockedUser {
  userId: string;
  displayName: string;
  age?: number | null;
  university?: string | null;
  photoUrl?: string | null;
  blockedAt: string;
}

interface ReportArgs {
  reportedUserId: string;
  reason: ReportReasonType;
  description?: string;
  messageId?: string;
  conversationId?: string;
  /**
   * Şikayet edilen NOT (yorumlu beğeni). Kartın `note.noteId`'sinden gelir ve
   * sayı tipindedir. Sunucu sahipliği doğruluyor: not gerçekten şikayet
   * edilenden şikayet edene gelmiş olmalı, eşleşmezse alan sessizce yok
   * sayılır — şikayet yine kaydedilir, yani yanlış id göndermek şikayeti
   * DÜŞÜRMEZ, yalnız moderatörün not metnini görmesini engeller.
   */
  noteId?: number | string | null;
  /**
   * Şikayetle birlikte engelleme yapılsın mı. AÇIKÇA gönderilir — varsayılan
   * uca göre değişiyor (`/api/swipe/Report` true, `/api/moderation/report`
   * false), aynı gövde iki uçta farklı sonuç verir.
   */
  alsoBlock: boolean;
}

export interface ReportResult {
  reportId?: string;
  /**
   * Şikayet kaydedildi ama engelleme başarısız olmuş olabilir. `false` görünce
   * "engellendi" DEME — kullanıcıya tekrar deneme imkânı sun.
   */
  blocked: boolean;
}

const moderationService = {
  async blockUser(userId: string): Promise<void> {
    await api.post(API_ENDPOINTS.MODERATION_BLOCK(userId));
  },
  async unblockUser(userId: string): Promise<void> {
    await api.delete(API_ENDPOINTS.MODERATION_BLOCK(userId));
  },
  async getBlockedUserIds(): Promise<string[]> {
    const res = await api.get(API_ENDPOINTS.MODERATION_BLOCKS);
    return (res as any).result || [];
  },
  /** Kart bilgileriyle engellenenler listesi (isim/yaş/üniversite/foto). */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    const res = await api.get(API_ENDPOINTS.MODERATION_BLOCKED_USERS);
    return (res as any).result || [];
  },
  async reportUser({
    reportedUserId,
    reason,
    description,
    messageId,
    conversationId,
    noteId,
    alsoBlock,
  }: ReportArgs): Promise<ReportResult> {
    const body: Record<string, any> = { reportedUserId, reason, alsoBlock: !!alsoBlock };
    if (description) body.description = description;
    if (messageId) body.messageId = messageId;
    if (conversationId) body.conversationId = conversationId;
    // `!= null` — id sayı geliyor ve truthy kontrolü 0'ı düşürürdü.
    if (noteId != null) body.noteId = noteId;
    const res = await api.post(API_ENDPOINTS.MODERATION_REPORT, body);
    const result = (res as any).result;
    return {
      reportId: result?.reportId,
      // Alan hiç gelmiyorsa (eski backend) engelleme talebimizi doğrulanmış
      // saymıyoruz: alsoBlock istenmişse "başarısız" muamelesi görür ve kullanıcı
      // engellemeyi elle tetikleyebilir. Sessizce "engellendi" demek en kötü hata.
      blocked: !!result?.blocked,
    };
  },
};

export default moderationService;
