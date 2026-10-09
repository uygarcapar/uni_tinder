import { useCallback } from "react";
import ReportModal from "@/shared/components/ReportModal";
import { useFeedReport } from "../feedQueries";
import type { FeedReportTargetType } from "../feedTypes";

/**
 * Akış şikayeti — `ReportModal`ın ince sarmalayıcısı.
 *
 * ⚠️ `moderationService.reportUser` GENİŞLETİLMEDİ ve genişletilmemeli:
 * `POST /api/feed/reports` ayrı bir uç, gövdesi farklı ve içinde
 * `reportedUserId` YOK. O servis onu zorunlu alıyor, üstelik `ReportModal`
 * ayrıca bir `blockUser(reportedUserId)` retry dalı koşuyor — anonim gönderide
 * ikisi de imkânsız. Paylaşılan şey FORM, değişen şey TRANSPORT.
 */

export interface FeedReportSheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: FeedReportTargetType;
  postId?: string | null;
  replyId?: string | null;
  /** Anonim gönderide engelleme satırı çizilmiyor (kimlik yok). */
  isAnonymousTarget?: boolean;
  /** `PreviewModal` gibi bir sheet'in ÜSTÜNDE açılıyorsa "push". */
  stackBehavior?: "push" | "switch" | "replace";
}

export default function FeedReportSheet({
  visible,
  onClose,
  targetType,
  postId,
  replyId,
  isAnonymousTarget = false,
  stackBehavior,
}: FeedReportSheetProps) {
  const report = useFeedReport();

  const submit = useCallback(
    (args: { reason: string; description?: string; alsoBlock: boolean }) =>
      report.mutateAsync({
        targetType,
        postId: targetType === "Post" ? (postId ?? null) : null,
        replyId: targetType === "Reply" ? (replyId ?? null) : null,
        reason: args.reason,
        description: args.description,
        // Anonim hedefte sunucuya da `false` gidiyor: engellenecek bir kimlik
        // olmadığını istemci de iddia etmesin.
        alsoBlock: isAnonymousTarget ? false : args.alsoBlock,
      }),
    [report, targetType, postId, replyId, isAnonymousTarget],
  );

  return (
    <ReportModal
      visible={visible}
      onClose={onClose}
      submit={submit}
      showBlockRow={!isAnonymousTarget}
      stackBehavior={stackBehavior}
    />
  );
}
