export type ContentMode = "rewrite" | "summary" | "hybrid";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type PublishMode = "manual" | "interval" | "calendar";
export type BrandCommentStatus = "posted" | "skipped" | "blocked";
export type ApprovalTimeoutAction = "publish" | "skip";
export type PendingApprovalKind = "post" | "comment";

export interface TelegramAccount {
  id: string;
  name: string;
  apiId: number;
  apiHash: string;
  sessionString: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceChannel {
  id: string;
  channelRef: string;
  title?: string;
  fetchLimit: number;
  commentingEnabled: boolean;
  lastCommentedPostId?: number;
  lastCommentedAt?: string;
}

export interface SourceMessage {
  referenceId: string;
  channelRef: string;
  channelTitle: string;
  messageId: number;
  date: string;
  text: string;
  permalink?: string;
}

export interface GeneratedDraft {
  text: string;
  title?: string;
  imagePrompt?: string;
  imageDataUrl?: string;
  imageMimeType?: string;
  summary?: string;
  sourceMessages: SourceMessage[];
  sourceCursor: Record<string, number>;
  generatedAt: string;
  model: string;
  imageModel?: string;
  strategySummaryUsed?: string;
  safetyChecks?: string[];
}

export interface AutoPostConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt?: string;
}

export interface CalendarRule {
  id: string;
  days: Weekday[];
  times: string[];
}

export interface CalendarConfig {
  enabled: boolean;
  timezone: string;
  rawExpression: string;
  rules: CalendarRule[];
  lastTriggeredSlotKey?: string;
}

export interface ContentSafetyConfig {
  antiAdsEnabled: boolean;
  adConfidenceThreshold: number;
  antiSpamEnabled: boolean;
  spamConfidenceThreshold: number;
}

export interface CommentAutomationConfig {
  enabled: boolean;
  sendAsChannelRef?: string;
  styleNotes?: string;
  maxCommentsPerDay: number;
  minHoursBetweenComments: number;
}

export interface CommentModerationConfig {
  enabled: boolean;
  maxDeletesPerCycle: number;
  lookbackMessages: number;
}

export interface ApprovalRuleConfig {
  enabled: boolean;
  timeoutMinutes: number;
  onTimeout: ApprovalTimeoutAction;
}

export interface ApprovalConfig {
  posts: ApprovalRuleConfig;
  comments: ApprovalRuleConfig;
}

export interface PostMetricsSnapshot {
  collectedAt: string;
  views: number;
  forwards: number;
  reactions: number;
  replies: number;
  engagementRate: number;
  followerDelta?: number;
}

export interface PublishedPostRecord {
  id: string;
  channelRef: string;
  messageId: number;
  publishedAt: string;
  scheduledFor?: string;
  discussionPeerRef?: string;
  discussionRootMessageId?: number;
  lastModeratedCommentId?: number;
  sourceCursor: Record<string, number>;
  sourceMessageIds: Array<{
    referenceId: string;
    messageId: number;
  }>;
  draftSummary?: string;
  metricsHistory: PostMetricsSnapshot[];
}

export interface RecentPostInteractionMetric {
  messageId: number;
  views: number;
  forwards: number;
  reactions: number;
  replies: number;
}

export interface AnalyticsSnapshot {
  collectedAt: string;
  followersCurrent?: number;
  followersPrevious?: number;
  followerDelta?: number;
  viewsPerPost?: number;
  sharesPerPost?: number;
  reactionsPerPost?: number;
  growthSeries?: Array<{
    timestamp: string;
    value: number;
  }>;
  recentPosts: RecentPostInteractionMetric[];
}

export interface StrategyInsight {
  updatedAt: string;
  summary: string;
  doMoreOf: string[];
  avoid: string[];
  recommendedPostingWindows: string[];
}

export interface BrandCommentRecord {
  referenceId: string;
  referenceChannelRef: string;
  referencePostId: number;
  status: BrandCommentStatus;
  commentedAt: string;
  targetSendAsRef?: string;
  commentText?: string;
  postedCommentMessageId?: number;
  reason?: string;
}

export interface PendingPostApproval {
  id: string;
  kind: "post";
  createdAt: string;
  expiresAt: string;
  timeoutAction: ApprovalTimeoutAction;
  requestedBy: "autopost";
  draft: GeneratedDraft;
  targetId: string;
  targetTitle: string;
  sourceCount: number;
  calendarSlotKey?: string;
}

export interface PendingCommentApproval {
  id: string;
  kind: "comment";
  createdAt: string;
  expiresAt: string;
  timeoutAction: ApprovalTimeoutAction;
  requestedBy: "autocomment";
  targetId: string;
  targetTitle: string;
  referenceId: string;
  referenceChannelRef: string;
  referencePostId: number;
  sendAsRef: string;
  commentText: string;
}

export type PendingApproval = PendingPostApproval | PendingCommentApproval;

export interface TargetChannel {
  id: string;
  accountId: string;
  title: string;
  channelRef: string;
  language: string;
  tone: string;
  contentMode: ContentMode;
  includeImage: boolean;
  imageAspectRatio: string;
  styleNotes?: string;
  autoPost: AutoPostConfig;
  publishMode: PublishMode;
  calendar: CalendarConfig;
  safety: ContentSafetyConfig;
  approval: ApprovalConfig;
  comments: CommentAutomationConfig;
  moderation: CommentModerationConfig;
  referenceChannels: ReferenceChannel[];
  lastSourceMessageByReference: Record<string, number>;
  lastDraft?: GeneratedDraft;
  lastPublishedAt?: string;
  publishedPosts: PublishedPostRecord[];
  analyticsHistory: AnalyticsSnapshot[];
  strategyInsight?: StrategyInsight;
  brandCommentHistory: BrandCommentRecord[];
  pendingApprovals: PendingApproval[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  accounts: TelegramAccount[];
  targets: TargetChannel[];
}

export interface ChannelMeta {
  title: string;
  username?: string;
  id?: string;
}

export interface GeneratedContentPayload {
  title: string;
  summary: string;
  post: string;
  imagePrompt?: string;
}

export interface AdvertisingAssessment {
  isAdvertisement: boolean;
  confidence: number;
  reason: string;
}

export interface SpamAssessment {
  isSpam: boolean;
  confidence: number;
  reason: string;
}

export interface BrandCommentSuggestion {
  shouldComment: boolean;
  relevanceScore: number;
  reason: string;
  comment: string;
}

export interface StrategyAnalysis {
  summary: string;
  doMoreOf: string[];
  avoid: string[];
  recommendedPostingWindows: string[];
}

export interface DiscussionThreadInfo {
  discussionPeerRef: string;
  discussionRootMessageId: number;
}

export interface PublishedMessageResult {
  messageId: number;
  publishedAt: string;
  scheduledFor?: string;
  discussion?: DiscussionThreadInfo;
}
