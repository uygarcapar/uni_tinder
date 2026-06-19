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

export const REPORT_REASON_LABELS_TR: Record<ReportReasonType, string> = {
  Spam: 'Spam / Reklam',
  Harassment: 'Taciz / Hakaret',
  InappropriateContent: 'Müstehcen içerik',
  FakeProfile: 'Sahte profil',
  Underage: 'Yaş altı',
  Scam: 'Dolandırıcılık',
  Other: 'Diğer',
};

interface ReportArgs {
  reportedUserId: string;
  reason: ReportReasonType;
  description?: string;
  messageId?: string;
  conversationId?: string;
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
  async reportUser({ reportedUserId, reason, description, messageId, conversationId }: ReportArgs): Promise<string | undefined> {
    const body: Record<string, any> = { reportedUserId, reason };
    if (description) body.description = description;
    if (messageId) body.messageId = messageId;
    if (conversationId) body.conversationId = conversationId;
    const res = await api.post(API_ENDPOINTS.MODERATION_REPORT, body);
    return (res as any).result?.reportId;
  },
};

export default moderationService;
