import AppModal from "@/shared/components/AppModal";

export default function EditModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  children,
}: any) {
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={title}
      actionLabel="Kaydet"
      onAction={onSave}
      actionLoading={saving}
    >
      {children}
    </AppModal>
  );
}
