import React from 'react';
import { View, ScrollView } from 'react-native';

export const BottomSheetScrollView = ({ children, ...p }: any) => (
  <ScrollView {...p}>{children}</ScrollView>
);
export const BottomSheetBackdrop = (_p: any) => null;
export const BottomSheetModal = React.forwardRef(
  ({ children, onDismiss: _onDismiss, ...p }: any, _ref: any) => (
    <View {...p}>{children}</View>
  )
);
export const BottomSheetFooter = ({ children }: any) => <>{children}</>;
export const BottomSheetView = ({ children, ...p }: any) => <View {...p}>{children}</View>;
export const BottomSheetModalProvider = ({ children }: any) => <>{children}</>;
export const useBottomSheet = () => ({});
export const useBottomSheetModal = () => ({});
export default React.forwardRef(({ children, ...p }: any, _ref: any) => (
  <View {...p}>{children}</View>
));
