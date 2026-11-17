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
  reasoningTrace?: ReasoningTrace;
  videoBatchSuite?: VideoBatchSuite;
}

export interface VideoBatchSuite {
  suiteTitle: string;
  totalDurationSec: number;
  episodesCount: number;
  platform: string;
  targetAudience: string;
  strategySummary: string;
}

export interface ReasoningTrace {
  durationMs: number;
  thinkingTitle: string;
  algorithmicStrategy: string;
  retentionModel: string;
  audioPacing: string;
  agentConsensus: Array<{ agent: string; perspective: string }>;
  structuredPillars: Array<{
    title: string;
    subject: string;
    style: string;
    camera: string;
    hookPacing: string;
  }>;
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
  structuredPrompt?: StructuredVideoPrompt;
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
  engineUsed:
    | 'gemini-4-hydrogen+local-director'
    | 'gemini-4-hydrogen+thinking-director'
    | 'local-director-nlp'
    | 'local-structured-director'
    | 'nexus-batch-director-suite';
  notebookStyle?: string;
  language?: string;
  structuredPrompt?: StructuredVideoPrompt;
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
  structuredPrompt?: StructuredVideoPrompt;
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
  structuredPrompt?: StructuredVideoPrompt;
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
  structuredPrompt?: StructuredVideoPrompt;
}

// -------------------------------------------------------------
// STRUCTURED TEXT-TO-VIDEO PROMPT ENGINE (LOCAL / ZERO-API)
// -------------------------------------------------------------

export type CameraComposition =
  | 'close_up'
  | 'medium_shot'
  | 'wide_establishing'
  | 'macro_detail'
  | 'pov_first_person';

export type LightingPreset =
  | 'volumetric_neon'
  | 'golden_hour'
  | 'studio_rim'
  | 'dramatic_chiaroscuro'
  | 'clean_daylight';

export type OpticsPreset =
  | '35mm_anamorphic'
  | '50mm_prime'
  | '85mm_portrait'
  | '16mm_wide_fpv'
  | 'macro_100mm';

export type AtmospherePreset =
  | 'rain_particles'
  | 'volumetric_dust'
  | 'light_streaks'
  | 'clean_studio'
  | 'data_grid';

export type CameraEasing =
  | 'linear'
  | 'ease_in_out'
  | 'whip_accelerate'
  | 'handheld_micro';

export type CameraStabilization =
  | 'gimbal_smooth'
  | 'tripod_locked'
  | 'dynamic_fpv'
  | 'cinematic_dolly';

export type BeatPhase =
  | 'opening_hook'
  | 'development'
  | 'climax_reveal'
  | 'closing_loop';

export type BeatTransition =
  | 'cut'
  | 'crossfade'
  | 'whip_pan'
  | 'zoom_punch'
  | 'glitch_flash';

export type TemporalPacing =
  | 'explosive_hook'
  | 'steady_narrative'
  | 'crescendo_build'
  | 'hypnotic_loop';

export interface TemporalSceneBeat {
  id: number;
  phase: BeatPhase;
  startSec: number;
  endSec: number;
  durationSec: number;
  beatTitle: string;
  sceneDescription: string;
  subjectEvolution: string;
  cameraKeyframe: OpenGenCameraMotion;
  cameraZoomStart: number;
  cameraZoomEnd: number;
  cameraPanX: number; // -1 to 1
  cameraPanY: number; // -1 to 1
  lightingShift: string;
  transitionIn: BeatTransition;
  kineticCaption: string;
  visualCue: string;
}

export interface HardcoreRealismProfile {
  cameraBody: string;
  shutterAngle: '180deg_cinematic' | '90deg_crisp_action' | '360deg_dreamy';
  colorPipeline: 'ACES_filmic' | 'ARRI_LogC4' | 'RED_IPP2' | 'Rec709_broadcast';
  audioLufsTarget: '-14_LUFS_social' | '-16_LUFS_youtube' | '-23_LUFS_cinema';
  sensorGrain: 'none' | 'fine_35mm' | 'anamorphic_halation';
}

export interface MonetizationKit {
  seoTitle: string;
  hookLine: string;
  ctaLine: string;
  brandSafeTags: string[];
  estimatedRpmTier: string;
}

export interface StructuredVideoPrompt {
  version: '2.0';
  engine: 'local-structured-director';
  seed: number;
  rawPrompt: string;
  aspectRatio: '9:16' | '16:9';
  totalDurationSec: number;
  fps: 24 | 30 | 60;
  subject: {
    primarySubject: string;
    subjectAction: string;
    environment: string;
    composition: CameraComposition;
  };
  style: {
    visualStyle: VideoVisualStyle;
    lighting: LightingPreset;
    optics: OpticsPreset;
    colorGrading: string;
    atmosphere: AtmospherePreset;
    accentColor: string;
    secondaryColor: string;
    bgHex: string;
    negativePrompt: string;
  };
  camera: {
    primaryMotion: OpenGenCameraMotion;
    motionIntensity: number; // 1 - 10
    easing: CameraEasing;
    stabilization: CameraStabilization;
  };
  temporal: {
    pacing: TemporalPacing;
    beats: TemporalSceneBeat[];
  };
  realismProfile?: HardcoreRealismProfile;
  monetizationKit?: MonetizationKit;
  activeTagIds?: string[];
}

export interface StructuredPromptScore {
  overall: number; // 0 - 100
  pillars: {
    subject: number; // 0 - 25
    style: number; // 0 - 25
    camera: number; // 0 - 25
    temporal: number; // 0 - 25
  };
  tips: string[];
}

export type PromptTagCategory = 'camera' | 'style' | 'optics' | 'lighting' | 'atmosphere' | 'realism' | 'monetization';

export interface PromptBuilderTag {
  id: string;
  category: PromptTagCategory;
  label: string;
  shortLabel: string;
  promptSnippet: string;
  description: string;
  cameraMotion?: OpenGenCameraMotion;
  motionIntensity?: number;
  visualStyle?: VideoVisualStyle;
  optics?: OpticsPreset;
  lighting?: LightingPreset;
  atmosphere?: AtmospherePreset;
  realismPatch?: Partial<HardcoreRealismProfile>;
  negativeAddition?: string;
}

export interface MonetizationCheatsheetBlueprint {
  id: string;
  title: string;
  platform: 'YouTube Shorts' | 'YouTube Video' | 'TikTok' | 'Instagram Reels';
  format: '9:16' | '16:9';
  rpmTier: string;
  hookFormula: string;
  retentionRule: string;
  adSafetyRule: string;
  cameraRecipe: string;
  checklist: string[];
  rawPrompt: string;
  structuredPreset: Partial<StructuredVideoPrompt>;
  monetizationKit: MonetizationKit;
}

export interface MonetizationCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  fixHint?: string;
}

export interface MonetizationAuditResult {
  score: number; // 0 - 100
  is100PercentMonetizable: boolean;
  adSafe: boolean;
  checks: MonetizationCheckItem[];
  recommendedFixLabels: string[];
}

// -------------------------------------------------------------
// BATCH PROCESSING QUEUE & AI SMART ENHANCE TYPES
// -------------------------------------------------------------
export type BatchQueueItemStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BatchVideoQueueItem {
  id: string;
  title: string;
  prompt: string;
  modelId: string;
  modelName: string;
  creditCost: number;
  mode: 'text_to_video' | 'image_to_video' | 'video_to_video';
  format: '9:16' | '16:9';
  durationSec: number;
  fps: 24 | 30 | 60;
  qualityTier: '720p' | '1080p' | '4K';
  cameraMotion: OpenGenCameraMotion;
  motionIntensity: number;
  visualStyle: VideoVisualStyle;
  selectedStyleLabel: string;
  negativePrompt: string;
  promptMagic: boolean;
  templateId?: string;
  structuredPrompt: StructuredVideoPrompt;
  status: BatchQueueItemStatus;
  progressPercent: number;
  progressStage: MediaRenderStage | 'idle';
  workerMessage: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  asset?: FactoryAsset;
  error?: string;
}

export interface AiSmartEnhanceResponse {
  engine: 'gemini-4-hydrogen';
  model: string;
  selectedStyleTagLabel: string;
  expandedRawPrompt: string;
  structuredPrompt: StructuredVideoPrompt;
  compiledText: string;
  cinematicNotes: string[];
  score: StructuredPromptScore;
}

// -------------------------------------------------------------
// SMART AI COMMENTING & 5-CORE GODTIER SWARM TYPES
// -------------------------------------------------------------
export type CommentIntent =
  | 'hot_lead'
  | 'question'
  | 'praise'
  | 'objection'
  | 'collab'
  | 'troll_spam';

export type CommentStatus =
  | 'pending'
  | 'ai_drafted'
  | 'auto_replied'
  | 'published_reply'
  | 'escalated_lead'
  | 'shield_blocked';

export type CommentReplyStrategy =
  | 'hormozi_hook'
  | 'sales_funnel'
  | 'authority_guide'
  | 'witty_shield';

export interface CommentReplyVariant {
  id: string;
  strategy: CommentReplyStrategy;
  label: string;
  toneBadge: string;
  replyText: string;
  predictedCtrLift: string;
  recommendedCta: string;
}

export interface CommentMultiCoreAnalysis {
  intentCore: {
    intent: CommentIntent;
    sentimentScore: number; // -100 to +100
    urgency: 'critical' | 'high' | 'medium' | 'low';
    viralMultiplier: number; // 0.5 to 3.5x
    conversionProbability: number; // 0 to 100
    detectedKeywords: string[];
  };
  voiceCore: {
    voicePersonaLabel: string;
    replyVariants: CommentReplyVariant[];
    pinnedCommentSuggestion: string;
  };
  shieldCore: {
    toxicityScore: number; // 0 to 100
    injectionAttempt: boolean;
    spamSignals: string[];
    action: 'allow' | 'neutralize_wit' | 'quarantine';
    complianceNote: string;
  };
  conversionCore: {
    leadDetected: boolean;
    funnelStage: 'awareness' | 'consideration' | 'hot_checkout' | 'none';
    dmTriggerKeyword?: string;
    suggestedOpportunityTitle?: string;
    estimatedValueCzk?: number;
    syncedOpportunityId?: string;
  };
  consensusCore: {
    engineUsed: 'gemini-4-hydrogen+5core-swarm' | 'nexus-godtier-5core-v2';
    confidenceScore: number; // 0 to 100
    coreWeights: {
      intent: number;
      voice: number;
      shield: number;
      conversion: number;
    };
    reasoningSummary: string;
    executionMs: number;
  };
}

export interface SocialComment {
  id: string;
  assetId?: string;
  videoTitle: string;
  platform: VideoSharingPlatform;
  authorHandle: string;
  authorBadge?: string;
  text: string;
  timestamp: string;
  likesCount: number;
  status: CommentStatus;
  selectedReply?: string;
  repliedByStrategy?: CommentReplyStrategy;
  repliedAt?: string;
  multiCoreAnalysis: CommentMultiCoreAnalysis;
}

export interface CommentAutopilotConfig {
  enabled: boolean;
  voicePersona: 'alex_hormozi_cz' | 'tech_educator' | 'witty_creator' | 'executive_b2b';
  brandCtaBridge: string;
  dmKeyword: string;
  trollShieldMode: 'strict_quarantine' | 'witty_aikido' | 'balanced';
  autoReplyThresholdConfidence: number; // 0 - 100
  autoSyncHotLeadsToCrm: boolean;
}

export interface CommentSwarmKpis {
  totalComments: number;
  pendingCount: number;
  repliedCount: number;
  hotLeadsCount: number;
  blockedSpamCount: number;
  avgSentimentScore: number;
  unlockedCrmValueCzk: number;
}

export interface PinnedCommentPack {
  videoTitle: string;
  platform: VideoSharingPlatform;
  pinnedText: string;
  dmTriggerKeyword: string;
  abAlternativeText: string;
  predictedEngagementBoost: string;
}





