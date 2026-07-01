import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

const AppModal = ({
  visible,
  title,
  onClose,
  actionLabel,
  onAction,
  actionLoading,
  actionDisabled,
  rightSlot,
  children,
}: any) => {
  if (!visible) return null;
  return (
    <View testID="app-modal">
      <TouchableOpacity onPress={onClose} testID="modal-header-close">
        <Text>X</Text>
      </TouchableOpacity>
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
