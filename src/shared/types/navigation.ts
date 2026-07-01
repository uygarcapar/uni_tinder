export type RootStackParamList = {
  HomeTabs: undefined;
  Chat: {
    conversationId: string;
    partner?: {
      userId: string;
      displayName: string;
      profileImageUrl?: string;
    };
    isActive?: boolean;
  };
  Notifications: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  RegisterStep1: undefined;
  RegisterStep2: { email?: string; mode?: string; pending?: boolean } | undefined;
  RegisterStep3: undefined;
  RegisterStep5: undefined;
  RegisterStep6: undefined;
  RegisterStep7: undefined;
  RegisterStep8: undefined;
  RegisterStep9: undefined;
  RegisterStep10: undefined;
  RegisterStep12: undefined;
  RegisterStep13: undefined;
  RegisterStep14: undefined;
  RegisterStep15: undefined;
};

export type TabParamList = {
  Discover: undefined;
  Likes: undefined;
  Messages: undefined;
  Profile: undefined;
};
