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
      // "Kaydet" YAZISI yerine onay işareti — header'ın bütün butonları
      // uygulamanın yuvarlak cam ikon dilinde (bkz. AppModal actionIcon).
      actionIcon="checkmark"
      actionIconLabel={t('common.save')}
      onAction={onSave}
      actionLoading={saving}
    >
      {children}
    </AppModal>
  );
}
