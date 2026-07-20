import AppModal from "@/shared/components/AppModal";
import { useTranslation } from "react-i18next";

export default function EditModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  children,
}: any) {
  const { t } = useTranslation();
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={title}
      actionLabel={t('common.save')}
      onAction={onSave}
      actionLoading={saving}
    >
      {children}
    </AppModal>
  );
}
