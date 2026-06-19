import React from 'react';
import { View } from 'react-native';

const AppBottomSheet = ({ visible, children, ...rest }: any) => {
  if (!visible) return null;
  return (
    <View testID="app-bottom-sheet" {...rest}>
      {children}
    </View>
  );
};
export default AppBottomSheet;
