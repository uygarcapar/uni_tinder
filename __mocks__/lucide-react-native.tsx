import React from 'react';
import { View } from 'react-native';

const icon = (name: string) =>
  ({ testID, ...p }: any) => (
    <View testID={testID ?? `icon-${name}`} {...p} />
  );

export const X = icon('X');
export const ChevronDown = icon('ChevronDown');
export const Check = icon('Check');
export const Heart = icon('Heart');
export const Star = icon('Star');
