import api from './api';
import { API_ENDPOINTS } from '../constants/api';

/**
 * Backend ModerationController ile birebir uyumlu wrapper.
 * Block: idempotent (zaten engellenmişse no-op).
 * Report: günde 1/pair cap (409 Conflict döner aşıldığında).
 */

export const ReportReason = {
  Spam: 'Spam',
  Harassment: 'Harassment',
  InappropriateContent: 'InappropriateContent',
  FakeProfile: 'FakeProfile',
  Underage: 'Underage',
  Scam: 'Scam',
  Other: 'Other',
};

export const REPORT_REASON_LABELS_TR = {
  Spam: 'Spam / Reklam',
  Harassment: 'Taciz / Hakaret',
  InappropriateContent: 'Müstehcen içerik',
  FakeProfile: 'Sahte profil',
  Underage: 'Yaş altı',
  Scam: 'Dolandırıcılık',
  Other: 'Diğer',
};

const moderationService = {
  async blockUser(userId) {
    await api.post(API_ENDPOINTS.MODERATION_BLOCK(userId));
  },
  async unblockUser(userId) {
    await api.delete(API_ENDPOINTS.MODERATION_BLOCK(userId));
  },
  async getBlockedUserIds() {
    const res = await api.get(API_ENDPOINTS.MODERATION_BLOCKS);
    return res.result || [];
  },
  async reportUser({ reportedUserId, reason, description, messageId, conversationId }) {
    const body = { reportedUserId, reason };
    if (description) body.description = description;
    if (messageId) body.messageId = messageId;
    if (conversationId) body.conversationId = conversationId;
    const res = await api.post(API_ENDPOINTS.MODERATION_REPORT, body);
    return res.result?.reportId;
  },
};

export default moderationService;
