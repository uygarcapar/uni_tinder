import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

// Gerçek AppModal'ın scroll context'i — useKeyboardAwareField gibi tüketiciler
// bu modülden import ediyor. Mock'ta da var olmalı, yoksa useContext patlar.
export const AppModalScrollContext = React.createContext<any>(null);

// Gerçek modüldeki köşe yarıçapı sabiti — tüketiciler (FilterModal,
// ProfileEditModal) bunu prop olarak geçiriyor.
export const SHEET_TOP_RADIUS_LARGE = 44;

// Seçici sheet'lerin (şehir / dil / üniversite / prompt) ortak detentleri —
// gerçek modüldeki sabitin aynısı; tüketiciler prop olarak geçiriyor.
export const SHEET_PICKER_SNAP_POINTS = ["75%", "100%"];

const AppModal = ({
  visible,
  title,
  onClose,
  actionLabel,
  onAction,
  actionLoading,
  actionDisabled,
  // İkon yolu (actionIcon="checkmark"): gerçek modülde yuvarlak cam ✓.
  // Mock'ta metni olmayan bir buton — erişilebilirlik etiketiyle (actionIconLabel)
  // birlikte aynı testID'den basılabilir.
  actionIcon,
  actionIconLabel,
  rightSlot,
  leftLabel,
  onLeftPress,
  // Sol slotun ikon yolu (leftIcon="arrow.counterclockwise"): gerçek modülde
  // yuvarlak cam ↺. Mock'ta — actionIcon'la aynı kural — metni olmayan bir
  // buton, erişilebilirlik etiketiyle (leftIconLabel) birlikte.
  leftIcon,
  leftIconLabel,
  children,
}: any) => {
  if (!visible) return null;
  return (
    <View testID="app-modal">
      <TouchableOpacity onPress={onClose} testID="modal-header-close">
        <Text>X</Text>
      </TouchableOpacity>
      {leftLabel ? (
        <TouchableOpacity onPress={onLeftPress} testID="modal-header-left">
          <Text>{leftLabel}</Text>
        </TouchableOpacity>
      ) : leftIcon ? (
        <TouchableOpacity
          onPress={onLeftPress}
          accessibilityRole="button"
          accessibilityLabel={leftIconLabel}
          testID="modal-header-left"
        >
          <Text>{leftIcon}</Text>
        </TouchableOpacity>
      ) : null}
      <Text>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity
          onPress={onAction}
          disabled={!!(actionLoading || actionDisabled)}
          testID="modal-header-action"
        >
          {actionLoading ? (
            <ActivityIndicator />
          ) : (
            <Text>{actionLabel}</Text>
          )}
        </TouchableOpacity>
      ) : actionIcon ? (
        <TouchableOpacity
          onPress={onAction}
          disabled={!!(actionLoading || actionDisabled)}
          accessibilityRole="button"
          accessibilityLabel={actionIconLabel}
          testID="modal-header-action"
        >
          {actionLoading ? <ActivityIndicator /> : <Text>{actionIcon}</Text>}
        </TouchableOpacity>
      ) : null}
      {rightSlot}
      {children}
    </View>
  );
};

export default AppModal;
