// ─── Auth / User ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName?: string;
  isMailVerified: boolean;
  isProfileCreated: boolean;
  isKvkkAccepted?: boolean;
  profileImageUrl?: string;
}

export interface RegistrationForm {
  firstName: string;
  gender: string;
  dateOfBirth: Date | null;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  needsVerification: boolean;
  pendingVerificationEmail: string | null;
  kvkkVersion: string | null;
  loading: boolean;
  error: string | null;
  registrationEmail: string | null;
  emailVerifiedToken: string | null;
  registrationForm: RegistrationForm;
}

// ─── Profile ───────────────────────────────────────────────────────────────────

export interface ProfileState {
  yearOfStudy: string;
  department: number | null;
  city: number | null;
  district: number | null;
  latitude: number | null;
  longitude: number | null;
  ageRangeMin: number;
  ageRangeMax: number;
  height: string;
  bio: string;
  interestedIn: number[];
  hobbies: string[];
  smokingStatus: string | null;
  zodiacSign: string | null;
  usagePurpose: string | null;
  photos: string[];
  mainPhotoIndex: number;
  loading: boolean;
  error: string | null;
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface ReactionDto {
  emoji: string;
  userId: string;
  reactedAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentType?: number;
  sentAt: string;
  readAt?: string | null;
  deliveredAt?: string | null;
  clientMessageId?: string;
  reactions?: ReactionDto[];
  isSystemMessage?: boolean;
  deletedAt?: string | null;
  deletedForEveryone?: boolean;
  mediaUrl?: string | null;
  replyToMessageId?: string | null;
  _pending?: boolean;
  _failed?: boolean;
  _selfUserId?: string;
}

export interface ConversationListItemDto {
  conversationId: string;
  matchId?: string;
  partnerUserId: string;
  partnerDisplayName: string;
  partnerProfileImageUrl?: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  lastMessageContentType?: number;
  unreadCount: number;
  isActive: boolean;
  partnerIsOnline: boolean;
}

export interface MessageBucket {
  messages: MessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
}

export interface TypingEntry {
  [userId: string]: number;
}

export interface PresenceEntry {
  isOnline: boolean;
  lastSeen: string | null;
}

export interface ChatQuotaStatus {
  bothPremium: boolean;
  isUnlocked: boolean;
  messageCount: number;
  freeMessageLimit: number;
  remainingMessages: number | null;
  requiresUnlock: boolean;
}

export interface ChatState {
  conversations: ConversationListItemDto[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  messagesByConv: Record<string, MessageBucket>;
  typingByConv: Record<string, TypingEntry>;
  presenceByUser: Record<string, PresenceEntry>;
  unreadTotal: number;
  activeConversationId: string | null;
  quotaByConv: Record<string, ChatQuotaStatus>;
}

// ─── Swipe ─────────────────────────────────────────────────────────────────────

export interface PotentialMatch {
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  age?: number;
  department?: string;
  yearOfStudy?: string;
  bio?: string;
  photos?: string[];
  distance?: number;
}

export interface SwipeStats {
  remainingSwipes: number | null;
  superLikesRemaining: number | null;
  swipeCountResetAt: string | null;
  superLikeCountResetAt: string | null;
  premiumExpiresAt: string | null;
  isPremium: boolean;
  totalSwipesToday: number;
  likesToday: number;
  passesToday: number;
  superLikesToday: number;
  matchesToday: number;
  remainingUndos: number | null;
  undoCountResetAt: string | null;
  remainingMissedMatchRecovery: number | null;
  missedMatchRecoveryResetAt: string | null;
}

export interface SwipeState extends SwipeStats {
  potentialMatches: PotentialMatch[];
  currentIndex: number;
  currentPage: number;
  hasNextPage: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  whoLikedMeCount: number;
}

// ─── Subscription ──────────────────────────────────────────────────────────────

export interface SubscriptionState {
  isPremium: boolean;
  expiresAt: string | null;
  loading: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
}
