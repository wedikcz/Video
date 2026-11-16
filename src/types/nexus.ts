/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Agent {
  id: string;
  name: string;
  role: string;
  focus: string;
  confidence: number; // 81-94
  tasks: number; // 7-42
  status: 'active' | 'paused';
  systemPrompt?: string;
  avatarIcon?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  channel: 'Affiliate' | 'TikTok' | 'YouTube' | 'Meta Ads' | 'E-mail' | 'Produkt';
  projectionCzk: number;
  confidence: number;
  status: 'new' | 'active' | 'won' | 'paused' | 'closed';
  updatedAt: string;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  agent: string;
  timestamp: string;
  type: 'action' | 'decision' | 'system' | 'metric';
}

export interface MemoryRecord {
  id: string;
  kind: 'semantic' | 'episodic' | 'procedural' | 'decision' | 'trend';
  scope: 'user' | 'business' | 'campaign';
  content: string;
  importance: number; // 0 - 1
  sourceRunId?: string;
  createdAt: string;
  lastUsedAt: string;
  decayAt: string;
}

export interface StepPlanItem {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedAgent?: string;
}

export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  plan?: StepPlanItem[];
  suggestions?: string[];
  toolEvents?: Array<{
    tool: string;
    input: any;
    output: any;
    timestamp: string;
  }>;
  agentNotes?: Array<{
    agent: string;
    note: string;
  }>;
  sources?: string[];
  runId?: string;
  confidence?: number;
  generatedAssets?: FactoryAsset[];
  videoBrief?: VideoCreativeBrief;
  clarificationRequest?: VideoClarificationRequest;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messagesCount: number;
}

export interface BoardroomVote {
  agent: string;
  vote: 'pro' | 'proti' | 'kompromis';
  note: string;
  score?: number;
}

export interface BoardroomSession {
  id: string;
  topic: string;
  verdict: string;
  summary: string;
  consensusScore: number;
  rounds: {
    round1_positions: BoardroomVote[];
    round2_critique: BoardroomVote[];
    round3_compromise: BoardroomVote[];
  };
  votes: BoardroomVote[];
  createdAt: string;
  traceId: string;
}

export type MediaAssetStatus = 'queued' | 'rendering' | 'ready' | 'failed';

export type MediaRenderStage =
  | 'queued'
  | 'analyzing_brief'
  | 'compiling_storyboard'
  | 'rendering_ffmpeg'
  | 'optimizing_faststart'
  | 'verifying_integrity'
  | 'ready'
  | 'failed';

export interface FactoryAsset {
  id: string;
  threadId?: string;
  line: 'video' | 'ad' | 'funnel';
  title: string;
  prompt?: string;
  body: string;
  meta: string;
  tags?: string[];
  status?: MediaAssetStatus;
  progressPercent?: number;
  progressStage?: MediaRenderStage;
  workerMessage?: string;
  faststartVerified?: boolean;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  resolution?: string;
  sha256?: string;
  filePath?: string;
  streamUrl?: string;
  downloadUrl?: string;
  posterUrl?: string;
  signedStreamUrl?: string;
  moviePyScript?: string;
  videoStoryboard?: VideoStoryboard;
  videoBrief?: VideoCreativeBrief;
  createdAt: string;
  updatedAt?: string;
  dryRun?: boolean;
}

export interface AssetStatusResponse {
  assetId: string;
  status: MediaAssetStatus;
  progressPercent: number;
  progressStage: MediaRenderStage;
  workerMessage: string;
  faststartVerified: boolean;
  retryAfterSeconds?: number;
  asset: FactoryAsset;
}

export interface SmartTrendAnalysisResult {
  selectedTrend: ViralTrend;
  recommendedTemplateId: string;
  recommendedTemplateName: string;
  recommendedFormat: '9:16' | '16:9';
  brief: VideoCreativeBrief;
  rationale: string;
  trends: ViralTrend[];
}

export type VideoVisualStyle =
  | 'cyberpunk_neon'
  | 'fintech_emerald'
  | 'luxury_gold'
  | 'editorial_coral'
  | 'minimal_dark';

export type VideoTone = 'energetic' | 'educational' | 'humorous' | 'authoritative' | 'cinematic';

export interface VideoBriefScene {
  title: string;
  subtitle: string;
  visualCue: string;
  durationSec: number;
  kineticTag: string;
}

export interface VideoCreativeBrief {
  topic: string;
  title: string;
  hook: string;
  goal: 'viral_growth' | 'education' | 'product_demo' | 'sales_funnel' | 'news_alert' | 'brand_story';
  platform: 'YouTube Shorts' | 'TikTok' | 'Instagram Reels' | 'YouTube Video';
  aspectRatio: '9:16' | '16:9';
  durationSec: number;
  visualStyle: VideoVisualStyle;
  accentColor: string;
  secondaryColor: string;
  bgHex: string;
  tone: VideoTone;
  bpm: number;
  audience: string;
  cta: string;
  keyPoints: string[];
  scenes: VideoBriefScene[];
  completenessScore: number;
  missingFields: Array<'topic' | 'platform_format' | 'style_tone' | 'goal_cta' | 'duration'>;
  engineUsed: 'gemini-4-hydrogen+local-director' | 'local-director-nlp';
}

export interface VideoClarificationRequest {
  completenessScore: number;
  missingFields: string[];
  questions: string[];
  partialBrief: Partial<VideoCreativeBrief>;
  quickPresets: Array<{
    label: string;
    promptText: string;
  }>;
  proceedPrompt: string;
}

export interface VideoScene {
  id: number;
  timeRange: string;
  durationSec: number;
  visual: string;
  audioVoiceover: string;
  audioSfx: string;
  kineticText: string;
  patternInterrupt: string;
  bRollKeyword: string;
}

export interface VideoStoryboard {
  title: string;
  hook: string;
  aspectRatio: '9:16' | '16:9';
  viralityScore: number;
  estimatedRetentionRate: number;
  targetPlatform: 'YouTube Shorts' | 'YouTube Video' | 'TikTok' | 'Instagram Reels';
  templateId?: string;
  templateCategory?: VideoTemplateCategory;
  scenes: VideoScene[];
  cta: string;
  affiliateBridge: string;
}

export interface TraceSpan {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: 'ok' | 'error' | 'repaired';
  details?: any;
}

export interface RunTrace {
  id: string;
  threadId: string;
  goal: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCzk: number;
  latencyMs: number;
  createdAt: string;
  spans: TraceSpan[];
  toolCalls: Array<{
    tool: string;
    idempotencyKey?: string;
    arguments: any;
    result: any;
    durationMs: number;
  }>;
  criticRubric?: {
    goalFulfilled: boolean;
    concreteness: boolean;
    riskAwareness: boolean;
    noFictitiousMoney: boolean;
    repaired: boolean;
  };
}

export interface GoldenEvalCase {
  id: number;
  goal: string;
  expectedTools: string[];
  expectedFormat: string;
  category: string;
}

export interface EvalResult {
  evalId: number;
  goal: string;
  passed: boolean;
  score: number; // 0 - 100
  criteria: {
    goalFulfilled: boolean;
    concreteLanguage: boolean;
    noFictitiousMoney: boolean;
    czechLanguage: boolean;
    has6Suggestions: boolean;
    toolsInvoked: boolean;
  };
  latencyMs: number;
  tokens: number;
  timestamp: string;
}

export interface SystemPerformance {
  cpuUsagePercent: number;
  cpuCores?: number;
  loadAvg1m?: number;
  memoryUsageMb: number;
  memoryTotalMb: number;
  rssMb?: number;
  systemMemoryUsedMb?: number;
  systemMemoryTotalMb?: number;
  activeJobsCount: number;
  queuedJobsCount: number;
  renderWorkers: number;
  mediaVaultCount?: number;
  eventLoopLagMs?: number;
  uptimeSeconds: number;
  timestamp: string;
}

export interface SocialIntegration {
  id: string;
  name: string;
  platformKey?: 'YouTube' | 'TikTok' | 'Instagram Reels' | 'Storage' | 'CMS';
  category: 'cloud_storage' | 'social_publisher' | 'cms';
  connected: boolean;
  accountEmail?: string;
  handle?: string;
  authMethod: 'OAuth 2.0' | 'API Key';
  tokenExpiry?: string;
  status: 'active' | 'expired' | 'disconnected';
  icon: string;
}

export interface PublishTask {
  id: string;
  assetId: string;
  videoTitle: string;
  platforms: string[];
  scheduledFor?: string;
  publishedAt?: string;
  status: 'scheduled' | 'publishing' | 'published' | 'failed';
  destinationUrl?: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    privacy: 'public' | 'unlisted' | 'private';
  };
  createdAt: string;
}

export type VideoTemplateCategory =
  | 'tutorial'
  | 'vlog'
  | 'news_short'
  | 'animated_explainer'
  | 'product_demo'
  | 'viral_hook';

export interface UserVideoTemplate {
  id: string;
  name: string;
  category: VideoTemplateCategory;
  description: string;
  aspectRatio: '9:16' | '16:9';
  visualStyle: string;
  subtitleStyle: {
    font: string;
    color: string;
    highlightColor: string;
    fontSize: number;
  };
  musicPreset: {
    beatType: string;
    bpm: number;
    sfxPack: string;
  };
  structureArchetype: string;
  pacingNotes?: string;
  scenesTemplate: Array<{
    durationSec: number;
    visualPrompt: string;
    patternInterrupt: string;
    bRollKeyword: string;
  }>;
  isBuiltIn: boolean;
  createdAt: string;
}

export type VideoSharingPlatform = 'YouTube' | 'TikTok' | 'Instagram Reels';

export interface AnalyticsMetricSummary {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalWatchTimeHours: number;
  engagementRate: number;
  avgRetentionRate: number;
  avgCtr: number;
  estimatedRevenueCzk: number;
  rpmCzk: number;
}

export interface PlatformPerformanceMetric {
  platform: VideoSharingPlatform;
  connected: boolean;
  views: number;
  likes: number;
  comments: number;
  watchTimeHours: number;
  avgRetentionRate: number;
  engagementRate: number;
  growth24h: string;
  topFormat: string;
}

export interface PublishedVideoMetric {
  id: string;
  title: string;
  platform: VideoSharingPlatform;
  format: '9:16' | '16:9';
  templateCategory: VideoTemplateCategory;
  views: number;
  likes: number;
  comments: number;
  watchTimeHours: number;
  avgWatchSeconds: number;
  retentionRate: number;
  publishedAt: string;
  url: string;
}

export interface ContentRecommendation {
  id: string;
  basedOnVideoTitle: string;
  platform: VideoSharingPlatform;
  recommendedTopic: string;
  recommendedTemplateId: string;
  recommendedFormat: '9:16' | '16:9';
  rationale: string;
  expectedLift: string;
}

export interface ViralTrend {
  id: string;
  keyword: string;
  velocityScore: number; // 0 - 100
  searchVolume: string;
  suggestedHook: string;
  platform: 'YouTube Shorts' | 'TikTok' | 'Instagram Reels' | 'Meta Reels';
  growth24h: string;
}

export interface AnalyticsData {
  lastSyncedAt: string;
  summary: AnalyticsMetricSummary;
  platformBreakdown: PlatformPerformanceMetric[];
  publishedVideoPerformance: PublishedVideoMetric[];
  contentRecommendations: ContentRecommendation[];
  viewsTimeline: Array<{
    date: string;
    views: number;
    watchTimeHours: number;
    subscribersGained: number;
    likes: number;
    comments: number;
  }>;
  retentionCurve: Array<{
    second: number;
    retentionPercent: number;
    event?: string;
  }>;
  demographics: {
    ageGroups: Array<{ label: string; percent: number }>;
    gender: { male: number; female: number };
    topCountries: Array<{ country: string; code: string; percent: number }>;
  };
  viralTrends: ViralTrend[];
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export type RolePermission =
  | 'manage_team'
  | 'manage_integrations'
  | 'publish_videos'
  | 'create_edit_videos'
  | 'manage_templates'
  | 'view_analytics'
  | 'system_kill_switch';

export interface WorkspaceAccount {
  id: string;
  name: string;
  slug: string;
  plan: 'Creator Starter' | 'Studio Pro' | 'Enterprise Swarm';
  ownerEmail: string;
  defaultAspectRatio: '9:16' | '16:9';
  createdAt: string;
}

export interface TeamMember {
  id: string;
  accountId: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: RolePermission[];
  status: 'active' | 'invited' | 'suspended';
  invitedBy: string;
  joinedAt: string;
  lastActiveAt: string;
}

// -------------------------------------------------------------
// OPENGEN.AI/CS SUITE INTEGRATION TYPES
// -------------------------------------------------------------
export type OpenGenModelCategory = 'video' | 'image' | 'audio';

export type OpenGenCameraMotion =
  | 'static'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'orbit_360'
  | 'fpv_drone';

export interface OpenGenModelSpec {
  id: string;
  name: string;
  category: OpenGenModelCategory;
  provider: string;
  description: string;
  badge?: string;
  supportedModes: Array<'text_to_video' | 'image_to_video' | 'video_to_video'>;
  maxDurationSec: number;
  creditCost: number;
  defaultFps: number;
  resolutions: string[];
  aspectRatios: Array<'9:16' | '16:9' | '1:1' | '4:5' | '21:9'>;
  features: string[];
  avatarIcon: string;
}

export interface OpenGenCreditsState {
  available: number;
  monthlyQuota: number;
  usedThisPeriod: number;
  extraCredits: number;
  plan: 'Free' | 'Creator Pro' | 'Studio Ultra';
  expiresAt: string;
}

export interface OpenGenGenerationRequest {
  modelId: string;
  mode: 'text_to_video' | 'image_to_video' | 'video_to_video';
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5' | '21:9';
  durationSec?: number;
  cameraMotion?: OpenGenCameraMotion;
  motionIntensity?: number;
  fps?: number;
  qualityTier?: '720p' | '1080p' | '4K';
  startImageUrl?: string;
  endImageUrl?: string;
  promptMagic?: boolean;
  seed?: number;
  templateId?: string;
  threadId?: string;
  async?: boolean;
}

export interface OpenGenGenerationResponse {
  statusCode: number;
  status: 'accepted' | 'ready' | 'failed';
  retryAfterSeconds?: number;
  asset: FactoryAsset;
  job?: {
    assetId: string;
    status: string;
    progressPercent: number;
    progressStage: string;
    statusUrl: string;
    streamUrl: string;
  };
  creditsUsed: number;
  creditsRemaining: number;
  model: OpenGenModelSpec;
  enhancedPrompt?: string;
  storyboard?: VideoStoryboard;
  moviePyScript?: string;
}

