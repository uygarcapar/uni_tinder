import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@/shared/types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
