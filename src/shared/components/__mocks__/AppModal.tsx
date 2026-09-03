import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

// Gerçek AppModal'ın scroll context'i — useKeyboardAwareField gibi tüketiciler
// bu modülden import ediyor. Mock'ta da var olmalı, yoksa useContext patlar.
export const AppModalScrollContext = React.createContext<any>(null);

// Gerçek modüldeki köşe yarıçapı sabiti — tüketiciler (FilterModal,
// ProfileEditModal) bunu prop olarak geçiriyor.
export const SHEET_TOP_RADIUS_LARGE = 44;

const AppModal = ({
  visible,
  title,
  onClose,
  actionLabel,
  onAction,
  actionLoading,
  actionDisabled,
  rightSlot,
  leftLabel,
  onLeftPress,
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
      ) : null}
      {rightSlot}
      {children}
    </View>
  );
};

export default AppModal;
