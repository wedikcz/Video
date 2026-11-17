/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Sparkles,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Download,
  Layers,
  Flame,
  Film,
  RefreshCw,
  Share2,
  Bookmark,
  Plus,
  Trash2,
  Palette,
  Music,
  Sliders,
  X,
  CheckCircle2,
  ShieldAlert,
  TrendingUp,
  Cpu,
  ShieldCheck,
  Zap,
  Clock,
  Coins,
  LayoutGrid,
  List,
  Eye,
} from 'lucide-react';
import {
  FactoryAsset,
  VideoStoryboard,
  UserVideoTemplate,
  VideoTemplateCategory,
  TeamMember,
  SmartTrendAnalysisResult,
  MediaRenderStage,
  OpenGenModelSpec,
  OpenGenCreditsState,
  OpenGenCameraMotion,
  StructuredVideoPrompt,
  TemporalSceneBeat,
  BatchVideoQueueItem,
} from '../types/nexus.ts';
import { downloadVideoAsset } from '../utils/mediaDownload.ts';
import {
  smartVideoOrchestrator,
  SmartVideoProgressUpdate,
} from '../services/SmartVideoOrchestrator.ts';
import { copyTextSafely } from '../utils/clipboard.ts';
import { StructuredPromptBuilder } from './StructuredPromptBuilder.tsx';
import { MonetizationCheatsheetsPanel } from './MonetizationCheatsheetsPanel.tsx';
import { AssetReviewModal } from './AssetReviewModal.tsx';
import { BatchQueuePanel } from './BatchQueuePanel.tsx';
import {
  CAMERA_MOTION_LABELS,
  LIGHTING_LABELS,
  OPTICS_LABELS,
  PHASE_LABELS,
  VISUAL_STYLE_PALETTES,
  enhanceStructuredPromptLocally,
  parseStructuredPromptFromText,
} from '../utils/structuredVideoPrompt.ts';
import { resolveSelectedStyleTag } from '../utils/aiSmartEnhance.ts';
import {
  CreateBatchQueueItemInput,
  addBatchQueueItem,
  clearFinishedBatchItems,
  createBatchQueueItem,
  getNextPendingBatchItem,
  moveBatchQueueItem,
  removeBatchQueueItem,
  retryBatchQueueItem,
  updateBatchQueueItem,
} from '../utils/batchVideoQueue.ts';

interface FactoryViewProps {
  assets: FactoryAsset[];
  onRefreshAssets: () => void;
  initialTopic?: string;
  initialTemplateId?: string;
  onOpenPublish?: (
    videoTitle?: string,
    format?: '9:16' | '16:9',
    category?: VideoTemplateCategory,
    extra?: { assetId?: string; description?: string; tags?: string[] }
  ) => void;
  currentActor?: TeamMember;
}

const CATEGORY_LABELS: Record<'all' | VideoTemplateCategory, string> = {
  all: 'Všechny styly',
  tutorial: 'Tutoriály',
  vlog: 'Vlogy',
  news_short: 'Zpravodajské Shorts',
  animated_explainer: 'Animované Explainery',
  product_demo: 'Produktová Dema',
  viral_hook: 'Virální Hooky',
};

const VISUAL_STYLE_OPTIONS = [
  'Clean Studio Slate',
  'Warm Documentary Film',
  'Editorial Broadcast News',
  'Isometric Motion Vector',
  'High-Contrast Product Showcase',
  'Cyberpunk Neon',
  'Clean Minimalist',
  'Bold Viral Yellow',
];

export const FactoryView: React.FC<FactoryViewProps> = ({
  assets,
  onRefreshAssets,
  initialTopic,
  initialTemplateId,
  onOpenPublish,
  currentActor,
}) => {
  const [selectedLine, setSelectedLine] = useState<'video' | 'ad' | 'funnel'>('video');
  const [topic, setTopic] = useState(
    initialTopic || '5 AI automatizací, které vám ušetří 4 hodiny denně a jak je monetizovat'
  );
  const [format, setFormat] = useState<'9:16' | '16:9'>('9:16');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStoryboard, setCurrentStoryboard] = useState<VideoStoryboard | null>(null);
  const [currentMoviePyScript, setCurrentMoviePyScript] = useState<string>('');
  const [currentVideoAsset, setCurrentVideoAsset] = useState<FactoryAsset | null>(null);
  const [activeTab, setActiveTab] = useState<'storyboard' | 'script' | 'library'>('storyboard');
  const [copiedScript, setCopiedScript] = useState(false);

  // Video Styles & Templates Library State
  const [templates, setTemplates] = useState<UserVideoTemplate[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | VideoTemplateCategory>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId || 'tpl-tutorial-step');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'customize'>('create');
  const [templateSuccessMsg, setTemplateSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Template Form State (for both Create & Customize)
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<VideoTemplateCategory>('tutorial');
  const [tplDesc, setTplDesc] = useState('');
  const [tplAspectRatio, setTplAspectRatio] = useState<'9:16' | '16:9'>('16:9');
  const [tplStyle, setTplStyle] = useState('Clean Studio Slate');
  const [tplSubColor, setTplSubColor] = useState('#ffffff');
  const [tplHighlightColor, setTplHighlightColor] = useState('#38bdf8');
  const [tplFontSize, setTplFontSize] = useState(56);
  const [tplBpm, setTplBpm] = useState(120);
  const [tplBeatType, setTplBeatType] = useState('Minimal Focus Lo-Fi');
  const [tplStructure, setTplStructure] = useState('Hook → Kroky → Důkaz → CTA');

  // SmartVideoOrchestrator & Real-Time 202 Accepted Progress State
  const [renderProgress, setRenderProgress] = useState<SmartVideoProgressUpdate | null>(null);
  const [trendAnalysis, setTrendAnalysis] = useState<SmartTrendAnalysisResult | null>(null);
  const [selectedTrendId, setSelectedTrendId] = useState<string>('');
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [previewMode, setPreviewMode] = useState<'mp4' | 'canvas'>('canvas');
  const abortControllerRef = useRef<AbortController | null>(null);

  // OpenGen.ai/cs & Local Zero-API Structured Text-to-Video State
  const [studioMode, setStudioMode] = useState<'opengen' | 'moviepy'>('opengen');
  const [openGenModels, setOpenGenModels] = useState<OpenGenModelSpec[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('nexus-local-director');
  const [openGenMode, setOpenGenMode] = useState<'text_to_video' | 'image_to_video' | 'video_to_video'>('text_to_video');
  const [cameraMotion, setCameraMotion] = useState<OpenGenCameraMotion>('orbit_360');
  const [motionIntensity, setMotionIntensity] = useState<number>(7);
  const [fps, setFps] = useState<number>(30);
  const [qualityTier, setQualityTier] = useState<'720p' | '1080p' | '4K'>('1080p');
  const [promptMagic, setPromptMagic] = useState<boolean>(true);
  const [negativePrompt, setNegativePrompt] = useState<string>('artefakty, rozmazání, deformace, nízká kvalita, vodoznak');
  const [structuredPrompt, setStructuredPrompt] = useState<StructuredVideoPrompt>(() =>
    parseStructuredPromptFromText(
      initialTopic || '5 AI automatizací, které vám ušetří 4 hodiny denně a jak je monetizovat',
      {
        aspectRatio: '9:16',
        cameraMotion: 'orbit_360',
        motionIntensity: 7,
        fps: 30,
        negativePrompt: 'artefakty, rozmazání, deformace, nízká kvalita, vodoznak',
      }
    )
  );
  const [isStructuringPrompt, setIsStructuringPrompt] = useState(false);
  const [isAiEnhancing, setIsAiEnhancing] = useState(false);
  const [aiEnhanceNotes, setAiEnhanceNotes] = useState<string[] | null>(null);
  const [creditsState, setCreditsState] = useState<OpenGenCreditsState>({
    available: 350,
    monthlyQuota: 500,
    usedThisPeriod: 150,
    extraCredits: 50,
    plan: 'Creator Pro',
    expiresAt: new Date(Date.now() + 86400000 * 24).toISOString(),
  });
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [galleryLayout, setGalleryLayout] = useState<'grid' | 'row'>('grid');
  const [gallerySize, setGallerySize] = useState<'mini' | 'small' | 'medium' | 'large'>('medium');
  const [reviewModalAsset, setReviewModalAsset] = useState<FactoryAsset | null>(null);

  // Sequential Batch Processing Queue State
  const [batchQueue, setBatchQueue] = useState<BatchVideoQueueItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const batchQueueRef = useRef<BatchVideoQueueItem[]>([]);
  const isBatchRunningRef = useRef<boolean>(false);
  const batchAbortRef = useRef<AbortController | null>(null);
  const creditsAvailableRef = useRef<number>(350);

  useEffect(() => {
    creditsAvailableRef.current = creditsState.available;
  }, [creditsState.available]);

  const updateBatchQueueState = (
    updater: (prev: BatchVideoQueueItem[]) => BatchVideoQueueItem[]
  ) => {
    const next = updater(batchQueueRef.current);
    batchQueueRef.current = next;
    setBatchQueue(next);
  };

  // Video Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  const seekPreviewTime = (nextSec: number) => {
    currentTimeRef.current = nextSec;
    setCurrentTime(nextSec);
  };

  const canCreateVideos = !currentActor || currentActor.permissions.includes('create_edit_videos');
  const canManageTemplates = !currentActor || currentActor.permissions.includes('manage_templates');
  const canPublish = !currentActor || currentActor.permissions.includes('publish_videos');

  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
      setStructuredPrompt(
        parseStructuredPromptFromText(initialTopic, {
          aspectRatio: format,
          cameraMotion,
          motionIntensity,
          fps: fps === 24 || fps === 60 ? fps : 30,
          negativePrompt,
        })
      );
    }
  }, [initialTopic]);

  useEffect(() => {
    if (initialTemplateId && templates.length > 0) {
      const found = templates.find((t) => t.id === initialTemplateId);
      if (found) {
        handleApplyTemplate(found);
      }
    }
  }, [initialTemplateId, templates.length]);

  const fetchOpenGenData = async () => {
    try {
      const data = await smartVideoOrchestrator.getOpenGenModels();
      if (data.models && data.models.length > 0) {
        setOpenGenModels(data.models);
        if (!selectedModelId) setSelectedModelId(data.models[0].id);
      }
      if (data.credits) {
        setCreditsState(data.credits);
      }
    } catch (err) {
      console.error('Failed to fetch OpenGen models', err);
    }
  };

  const fetchTrendAnalysis = async (trendIdOverride?: string) => {
    setIsLoadingTrends(true);
    try {
      const result = await smartVideoOrchestrator.analyzeTrendingTopics({
        trendId: trendIdOverride || undefined,
        templateId: selectedTemplateId,
      });
      setTrendAnalysis(result);
      if (!trendIdOverride && result.selectedTrend?.id) {
        setSelectedTrendId(result.selectedTrend.id);
      }
    } catch (err) {
      console.error('Failed to analyze trending topics', err);
    } finally {
      setIsLoadingTrends(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchTrendAnalysis();
    fetchOpenGenData();
    return () => {
      abortControllerRef.current?.abort();
      isBatchRunningRef.current = false;
      batchAbortRef.current?.abort();
    };
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/v1/templates');
      if (res.ok) {
        const data: UserVideoTemplate[] = await res.json();
        setTemplates(data);
        if (!initialTemplateId && data.length > 0) {
          const defaultTpl = data.find((t) => t.id === selectedTemplateId) || data[0];
          setSelectedTemplateId(defaultTpl.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch user templates', err);
    }
  };

  useEffect(() => {
    const videoAsset = assets.find((a) => a.line === 'video' && a.videoStoryboard);
    if (videoAsset?.videoStoryboard) {
      setCurrentStoryboard(videoAsset.videoStoryboard);
      setCurrentMoviePyScript(videoAsset.moviePyScript || '');
      setCurrentVideoAsset(videoAsset);
      const assetStructured =
        videoAsset.structuredPrompt ||
        videoAsset.videoBrief?.structuredPrompt ||
        videoAsset.videoStoryboard.structuredPrompt;
      if (assetStructured) {
        setStructuredPrompt(assetStructured);
        setCameraMotion(assetStructured.camera.primaryMotion);
        setMotionIntensity(assetStructured.camera.motionIntensity);
      }
      if (videoAsset.status === 'ready' && videoAsset.streamUrl) {
        setPreviewMode('mp4');
      }
    } else if (assets.length === 0) {
      handleGenerate();
    }
  }, []);

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleApplyTemplate = (tpl: UserVideoTemplate) => {
    setSelectedTemplateId(tpl.id);
    setFormat(tpl.aspectRatio);

    if (currentStoryboard) {
      const updatedStoryboard: VideoStoryboard = {
        ...currentStoryboard,
        aspectRatio: tpl.aspectRatio,
        templateId: tpl.id,
        templateCategory: tpl.category,
        targetPlatform: tpl.aspectRatio === '9:16' ? 'YouTube Shorts' : 'YouTube Video',
        scenes: currentStoryboard.scenes.map((sc, idx) => {
          const tplScene =
            tpl.scenesTemplate.length > 0
              ? tpl.scenesTemplate[idx % tpl.scenesTemplate.length]
              : null;
          if (!tplScene) return sc;
          return {
            ...sc,
            durationSec: tplScene.durationSec,
            patternInterrupt: tplScene.patternInterrupt,
            bRollKeyword: tplScene.bRollKeyword,
            visual: `${tplScene.visualPrompt} (${tpl.visualStyle})`,
          };
        }),
      };
      setCurrentStoryboard(updatedStoryboard);
    }

    setTemplateSuccessMsg(`Šablona "${tpl.name}" (${CATEGORY_LABELS[tpl.category]}) byla aktivována.`);
    setTimeout(() => setTemplateSuccessMsg(null), 3000);
  };

  const openCreateTemplateModal = () => {
    setModalMode('create');
    setTplName('');
    setTplCategory(activeTemplate?.category || 'tutorial');
    setTplDesc('');
    setTplAspectRatio(format);
    setTplStyle(activeTemplate?.visualStyle || 'Clean Studio Slate');
    setTplSubColor(activeTemplate?.subtitleStyle.color || '#ffffff');
    setTplHighlightColor(activeTemplate?.subtitleStyle.highlightColor || '#38bdf8');
    setTplFontSize(activeTemplate?.subtitleStyle.fontSize || 56);
    setTplBpm(activeTemplate?.musicPreset.bpm || 120);
    setTplBeatType(activeTemplate?.musicPreset.beatType || 'Minimal Focus Lo-Fi');
    setTplStructure(activeTemplate?.structureArchetype || 'Hook → Kroky → Důkaz → CTA');
    setIsTemplateModalOpen(true);
  };

  const openCustomizeTemplateModal = (tpl: UserVideoTemplate) => {
    setModalMode('customize');
    setSelectedTemplateId(tpl.id);
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    setTplDesc(tpl.description);
    setTplAspectRatio(tpl.aspectRatio);
    setTplStyle(tpl.visualStyle);
    setTplSubColor(tpl.subtitleStyle.color);
    setTplHighlightColor(tpl.subtitleStyle.highlightColor);
    setTplFontSize(tpl.subtitleStyle.fontSize);
    setTplBpm(tpl.musicPreset.bpm);
    setTplBeatType(tpl.musicPreset.beatType);
    setTplStructure(tpl.structureArchetype);
    setIsTemplateModalOpen(true);
  };

  const handleTemplateFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) return;
    setErrorMsg(null);

    const payload = {
      name: tplName.trim(),
      category: tplCategory,
      description: tplDesc.trim() || 'Přizpůsobená šablona pro automatizovanou produkci videa.',
      aspectRatio: tplAspectRatio,
      visualStyle: tplStyle,
      subtitleStyle: {
        font: 'Plus-Jakarta-Sans-Bold',
        color: tplSubColor,
        highlightColor: tplHighlightColor,
        fontSize: Number(tplFontSize) || 56,
      },
      musicPreset: {
        beatType: tplBeatType,
        bpm: Number(tplBpm) || 120,
        sfxPack: 'Whoosh, UI Click, Transition Hit',
      },
      structureArchetype: tplStructure,
      scenesTemplate: activeTemplate?.scenesTemplate || [
        { durationSec: 4, visualPrompt: 'Silný úvodní hook', patternInterrupt: 'Zoom-in glitch', bRollKeyword: 'hook' },
        { durationSec: 12, visualPrompt: 'Hlavní vysvětlení / ukázka', patternInterrupt: 'Highlight box', bRollKeyword: 'demo' },
        { durationSec: 14, visualPrompt: 'Praktický postup krok za krokem', patternInterrupt: 'Step badge', bRollKeyword: 'steps' },
        { durationSec: 12, visualPrompt: 'Výsledek a výzva k akci', patternInterrupt: 'CTA banner', bRollKeyword: 'cta' },
      ],
    };

    try {
      const isPatch = modalMode === 'customize' && activeTemplate;
      const url = isPatch ? `/v1/templates/${activeTemplate.id}` : '/v1/templates';
      const method = isPatch ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const saved = await res.json();
      if (!res.ok) {
        setErrorMsg(saved.error || 'Nepodařilo se uložit šablonu.');
        return;
      }

      if (isPatch) {
        setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
        setTemplateSuccessMsg(`Šablona "${saved.name}" byla aktualizována!`);
      } else {
        setTemplates((prev) => [saved, ...prev]);
        setSelectedTemplateId(saved.id);
        setTemplateSuccessMsg(`Nová šablona "${saved.name}" byla uložena do knihovny!`);
      }

      handleApplyTemplate(saved);
      setIsTemplateModalOpen(false);
      setTimeout(() => setTemplateSuccessMsg(null), 3000);
    } catch {
      setErrorMsg('Chyba při komunikaci se serverem.');
    }
  };

  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    try {
      const res = await fetch(`/v1/templates/${templateId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Šablonu nelze smazat.');
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId && templates.length > 1) {
        const next = templates.find((t) => t.id !== templateId);
        if (next) setSelectedTemplateId(next.id);
      }
    } catch {
      setErrorMsg('Chyba při mazání šablony.');
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setErrorMsg(null);
    setRenderProgress(null);
    if (selectedLine === 'video') {
      setPreviewMode('canvas');
    }

    try {
      const result = await smartVideoOrchestrator.generateTemplateVideo(
        {
          line: selectedLine,
          topic,
          format,
          templateId: selectedTemplateId,
          structuredPrompt: {
            ...structuredPrompt,
            aspectRatio: format,
            rawPrompt: topic,
          },
        },
        {
          signal: controller.signal,
          pollIntervalMs: 300,
          onAccepted202: (initial) => {
            if (initial.storyboard) setCurrentStoryboard(initial.storyboard);
            if (initial.moviePyScript) setCurrentMoviePyScript(initial.moviePyScript);
            if (initial.asset) setCurrentVideoAsset(initial.asset);
            if (initial.structuredPrompt) setStructuredPrompt(initial.structuredPrompt);
          },
          onProgress: (update) => {
            setRenderProgress(update);
          },
        }
      );

      if (result.storyboard) {
        setCurrentStoryboard(result.storyboard);
      }
      if (result.moviePyScript) {
        setCurrentMoviePyScript(result.moviePyScript);
      }
      if (result.structuredPrompt) {
        setStructuredPrompt(result.structuredPrompt);
      }
      if (result.asset) {
        setCurrentVideoAsset(result.asset);
        if (result.asset.line === 'video' && result.asset.status === 'ready' && result.asset.streamUrl) {
          setPreviewMode('mp4');
        }
      }
      onRefreshAssets();
      seekPreviewTime(0);
      setIsPlaying(true);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setErrorMsg(err?.message || 'Nepodařilo se vygenerovat video asset.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSmartOrchestratorRun = async () => {
    if (isGenerating || !canCreateVideos) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setErrorMsg(null);
    setRenderProgress(null);
    setPreviewMode('canvas');

    try {
      const result = await smartVideoOrchestrator.analyzeTrendsAndTriggerMoviePy(
        {
          trendId: selectedTrendId || undefined,
          templateId: selectedTemplateId || undefined,
        },
        {
          signal: controller.signal,
          pollIntervalMs: 300,
          onAccepted202: (initial) => {
            if (initial.analysis) {
              setTrendAnalysis(initial.analysis);
              setTopic(`${initial.analysis.selectedTrend.keyword} — ${initial.analysis.selectedTrend.suggestedHook}`);
              setFormat(initial.analysis.recommendedFormat);
              setSelectedTemplateId(initial.analysis.recommendedTemplateId);
            }
            if (initial.storyboard) setCurrentStoryboard(initial.storyboard);
            if (initial.moviePyScript) setCurrentMoviePyScript(initial.moviePyScript);
            if (initial.asset) setCurrentVideoAsset(initial.asset);
          },
          onProgress: (update) => {
            setRenderProgress(update);
          },
        }
      );

      if (result.analysis) {
        setTrendAnalysis(result.analysis);
      }
      if (result.storyboard) {
        setCurrentStoryboard(result.storyboard);
      }
      if (result.moviePyScript) {
        setCurrentMoviePyScript(result.moviePyScript);
      }
      if (result.asset) {
        setCurrentVideoAsset(result.asset);
        if (result.asset.status === 'ready' && result.asset.streamUrl) {
          setPreviewMode('mp4');
        }
      }
      onRefreshAssets();
      seekPreviewTime(0);
      setIsPlaying(true);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setErrorMsg(err?.message || 'SmartVideoOrchestrator selhal při zpracování trendového videa.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStructuredPromptChange = (next: StructuredVideoPrompt) => {
    setStructuredPrompt(next);
    setCameraMotion(next.camera.primaryMotion);
    setMotionIntensity(next.camera.motionIntensity);
    setFps(next.fps);
    setFormat(next.aspectRatio);
    setNegativePrompt(next.style.negativePrompt);
  };

  const handleApplyMonetizedPrompt = (nextPrompt: StructuredVideoPrompt, notice: string) => {
    setTopic(nextPrompt.rawPrompt);
    handleStructuredPromptChange(nextPrompt);
    setTemplateSuccessMsg(notice);
    setTimeout(() => setTemplateSuccessMsg(null), 3500);
  };

  const handleLoadAssetIntoEditor = (asset: FactoryAsset) => {
    setCurrentVideoAsset(asset);
    if (asset.videoStoryboard) {
      setCurrentStoryboard(asset.videoStoryboard);
    }
    if (asset.moviePyScript) {
      setCurrentMoviePyScript(asset.moviePyScript);
    }
    const sp =
      asset.structuredPrompt ||
      asset.videoBrief?.structuredPrompt ||
      asset.videoStoryboard?.structuredPrompt;
    if (sp) {
      setTopic(sp.rawPrompt);
      handleStructuredPromptChange(sp);
    } else if (asset.title) {
      setTopic(asset.title);
    }
    if (asset.status === 'ready' && asset.streamUrl) {
      setPreviewMode('mp4');
    }
    setTemplateSuccessMsg(`Asset "${asset.title}" byl načten do editoru promptu.`);
    setTimeout(() => setTemplateSuccessMsg(null), 3000);
  };

  const handlePublishReviewedAsset = (asset: FactoryAsset) => {
    if (!onOpenPublish) return;
    const sp =
      asset.structuredPrompt ||
      asset.videoBrief?.structuredPrompt ||
      asset.videoStoryboard?.structuredPrompt;
    const resolvedFormat: '9:16' | '16:9' =
      asset.videoStoryboard?.aspectRatio ||
      sp?.aspectRatio ||
      (asset.resolution === '1280x720' ? '16:9' : format);
    const kit = sp?.monetizationKit || structuredPrompt.monetizationKit;
    const description = kit
      ? `${kit.hookLine}\n\n${asset.body}\n\n${kit.ctaLine}`
      : asset.body;
    const tags = kit?.brandSafeTags || asset.tags;
    onOpenPublish(
      kit?.seoTitle || asset.videoStoryboard?.title || asset.title,
      resolvedFormat,
      activeTemplate?.category || 'viral_hook',
      {
        assetId: asset.id,
        description,
        tags,
      }
    );
  };

  const handleSmartParsePrompt = async () => {
    if (!topic.trim() || isStructuringPrompt) return;
    setIsStructuringPrompt(true);
    setErrorMsg(null);
    const validFps: 24 | 30 | 60 = fps === 24 || fps === 60 ? fps : 30;
    try {
      const res = await smartVideoOrchestrator.parseStructuredPrompt({
        rawPrompt: topic,
        aspectRatio: format,
        fps: validFps,
        negativePrompt,
      });
      if (res.structuredPrompt) {
        handleStructuredPromptChange(res.structuredPrompt);
        setTemplateSuccessMsg(
          `Lokální NLP rozložilo zadání na ${res.structuredPrompt.temporal.beats.length} časové fáze (připravenost ${res.score.overall}/100).`
        );
        setTimeout(() => setTemplateSuccessMsg(null), 3500);
      }
    } catch {
      const localParsed = parseStructuredPromptFromText(topic, {
        aspectRatio: format,
        fps: validFps,
        negativePrompt,
      });
      handleStructuredPromptChange(localParsed);
    } finally {
      setIsStructuringPrompt(false);
    }
  };

  const handleSmartEnhancePrompt = async () => {
    if (!topic.trim() || isStructuringPrompt) return;
    setIsStructuringPrompt(true);
    setErrorMsg(null);
    try {
      const res = await smartVideoOrchestrator.enhanceStructuredPrompt({
        structuredPrompt: {
          ...structuredPrompt,
          rawPrompt: topic,
          aspectRatio: format,
          fps: fps === 24 || fps === 60 ? fps : 30,
        },
        rawPrompt: topic,
        cameraMotion,
        motionIntensity,
      });
      if (res.structuredPrompt) {
        handleStructuredPromptChange(res.structuredPrompt);
        setTemplateSuccessMsg(
          `Lokální režisér obohatil 4-pilířovou strukturu (${res.score.overall}/100) bez externího API.`
        );
        setTimeout(() => setTemplateSuccessMsg(null), 3500);
      }
    } catch {
      const localEnhanced = enhanceStructuredPromptLocally(structuredPrompt, {
        cameraMotion,
        motionIntensity,
      });
      handleStructuredPromptChange(localEnhanced.structuredPrompt);
    } finally {
      setIsStructuringPrompt(false);
    }
  };

  const handleAiSmartEnhancePrompt = async () => {
    if (!topic.trim() || isAiEnhancing || isStructuringPrompt) return;
    setIsAiEnhancing(true);
    setErrorMsg(null);

    const activeStyle = resolveSelectedStyleTag(structuredPrompt);
    try {
      const res = await smartVideoOrchestrator.aiSmartEnhancePrompt({
        structuredPrompt: {
          ...structuredPrompt,
          rawPrompt: topic,
          aspectRatio: format,
          fps: fps === 24 || fps === 60 ? fps : 30,
        },
        rawPrompt: topic,
        selectedStyleTagId: activeStyle.tagId,
      });

      if (res.structuredPrompt) {
        setTopic(res.expandedRawPrompt || res.structuredPrompt.rawPrompt);
        handleStructuredPromptChange(res.structuredPrompt);
        setAiEnhanceNotes(res.cinematicNotes || null);
        setTemplateSuccessMsg(
          `AI Smart Enhance (${res.model}) rozšířil scénu podle stylu „${res.selectedStyleTagLabel}“ (${res.score.overall}/100).`
        );
        setTimeout(() => setTemplateSuccessMsg(null), 4500);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'AI Smart Enhance selhal. Pro okamžité offline obohacení můžete použít tlačítko „Chytře vylepšit (Lokálně)“.'
      );
    } finally {
      setIsAiEnhancing(false);
    }
  };

  const handleAddCurrentToBatchQueue = () => {
    if (!topic.trim()) {
      setErrorMsg('Nejprve zadejte popis nebo prompt scény před zařazením do dávky.');
      return;
    }
    setErrorMsg(null);
    const activeModel = openGenModels.find((m) => m.id === selectedModelId);
    const modelName = activeModel?.name || 'Lokální Chytrý Režisér (Bez API)';
    const creditCost = activeModel ? activeModel.creditCost : 0;

    const item = createBatchQueueItem({
      prompt: topic,
      modelId: selectedModelId,
      modelName,
      creditCost,
      mode: openGenMode,
      format,
      durationSec: Math.min(
        activeModel?.maxDurationSec || 15,
        structuredPrompt.totalDurationSec || 6
      ),
      fps: fps === 24 || fps === 60 ? fps : 30,
      qualityTier,
      cameraMotion,
      motionIntensity,
      visualStyle: structuredPrompt.style.visualStyle,
      negativePrompt,
      promptMagic,
      templateId: selectedTemplateId,
      structuredPrompt: {
        ...structuredPrompt,
        rawPrompt: topic,
        aspectRatio: format,
        fps: fps === 24 || fps === 60 ? fps : 30,
      },
    });

    updateBatchQueueState((prev) => addBatchQueueItem(prev, item));
    setTemplateSuccessMsg(`Úloha „${item.title}“ přidána do sekvenční dávkové fronty.`);
    setTimeout(() => setTemplateSuccessMsg(null), 3000);
  };

  const handleAddCustomBatchTask = (input: CreateBatchQueueItemInput) => {
    setErrorMsg(null);
    const item = createBatchQueueItem(input);
    updateBatchQueueState((prev) => addBatchQueueItem(prev, item));
    setTemplateSuccessMsg(`Vlastní úloha „${item.title}“ zařazena do fronty.`);
    setTimeout(() => setTemplateSuccessMsg(null), 3000);
  };

  const handlePauseBatchQueue = () => {
    isBatchRunningRef.current = false;
    setIsBatchRunning(false);
    batchAbortRef.current?.abort();
    updateBatchQueueState((prev) =>
      prev.map((item) =>
        item.status === 'running'
          ? {
              ...item,
              status: 'cancelled',
              workerMessage: 'Pozastaveno uživatelem.',
            }
          : item
      )
    );
  };

  const handleStartBatchQueue = async () => {
    if (isBatchRunningRef.current || !canCreateVideos) return;
    if (!getNextPendingBatchItem(batchQueueRef.current)) return;

    isBatchRunningRef.current = true;
    setIsBatchRunning(true);
    setErrorMsg(null);

    try {
      while (isBatchRunningRef.current) {
        const nextItem = getNextPendingBatchItem(batchQueueRef.current);
        if (!nextItem) break;

        if (nextItem.creditCost > 0 && creditsAvailableRef.current < nextItem.creditCost) {
          updateBatchQueueState((prev) =>
            updateBatchQueueItem(prev, nextItem.id, {
              status: 'failed',
              progressPercent: 0,
              error: `Nedostatek kreditů (vyžaduje ${nextItem.creditCost}, dostupných ${creditsAvailableRef.current}).`,
              completedAt: new Date().toISOString(),
            })
          );
          continue;
        }

        const controller = new AbortController();
        batchAbortRef.current = controller;

        updateBatchQueueState((prev) =>
          updateBatchQueueItem(prev, nextItem.id, {
            status: 'running',
            progressPercent: 8,
            progressStage: 'queued',
            startedAt: new Date().toISOString(),
            error: undefined,
            workerMessage: 'Odesílání sekvenční úlohy do OpenGen workeru…',
          })
        );

        try {
          const result = await smartVideoOrchestrator.generateOpenGenVideo(
            {
              modelId: nextItem.modelId,
              mode: nextItem.mode,
              prompt: nextItem.prompt,
              negativePrompt: nextItem.negativePrompt || undefined,
              aspectRatio: nextItem.format,
              durationSec: nextItem.durationSec,
              cameraMotion: nextItem.cameraMotion,
              motionIntensity: nextItem.motionIntensity,
              fps: nextItem.fps,
              qualityTier: nextItem.qualityTier,
              promptMagic: nextItem.promptMagic,
              templateId: nextItem.templateId,
              structuredPrompt: nextItem.structuredPrompt,
            },
            {
              signal: controller.signal,
              pollIntervalMs: 300,
              onAccepted202: (initial) => {
                if (nextItem.creditCost > 0) {
                  creditsAvailableRef.current = Math.max(
                    0,
                    creditsAvailableRef.current - nextItem.creditCost
                  );
                  setCreditsState((prev) => ({
                    ...prev,
                    available: Math.max(0, prev.available - nextItem.creditCost),
                    usedThisPeriod: prev.usedThisPeriod + nextItem.creditCost,
                  }));
                }
                updateBatchQueueState((prev) =>
                  updateBatchQueueItem(prev, nextItem.id, {
                    progressPercent: initial.asset?.progressPercent ?? 15,
                    progressStage: initial.asset?.progressStage || 'queued',
                    workerMessage:
                      initial.asset?.workerMessage || 'Worker přijal úlohu (HTTP 202).',
                  })
                );
              },
              onProgress: (update) => {
                updateBatchQueueState((prev) =>
                  updateBatchQueueItem(prev, nextItem.id, {
                    progressPercent: update.progressPercent,
                    progressStage: update.progressStage,
                    workerMessage: update.workerMessage,
                  })
                );
              },
            }
          );

          if (!isBatchRunningRef.current) break;

          if (result.creditsRemaining !== undefined) {
            creditsAvailableRef.current = result.creditsRemaining;
            setCreditsState((prev) => ({ ...prev, available: result.creditsRemaining! }));
          }

          updateBatchQueueState((prev) =>
            updateBatchQueueItem(prev, nextItem.id, {
              status: 'completed',
              progressPercent: 100,
              progressStage: 'ready',
              workerMessage: 'MP4 video +faststart připraveno.',
              asset: result.asset,
              completedAt: new Date().toISOString(),
            })
          );

          if (result.asset) {
            setCurrentVideoAsset(result.asset);
            if (result.asset.videoStoryboard) setCurrentStoryboard(result.asset.videoStoryboard);
            if (result.asset.moviePyScript) setCurrentMoviePyScript(result.asset.moviePyScript);
            if (result.asset.status === 'ready' && result.asset.streamUrl) {
              setPreviewMode('mp4');
            }
          }
          onRefreshAssets();
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            updateBatchQueueState((prev) =>
              updateBatchQueueItem(prev, nextItem.id, {
                status: 'cancelled',
                workerMessage: 'Zpracování pozastaveno.',
              })
            );
            break;
          }
          updateBatchQueueState((prev) =>
            updateBatchQueueItem(prev, nextItem.id, {
              status: 'failed',
              error: err?.message || 'Generování úlohy v dávce selhalo.',
              workerMessage: 'Úloha selhala.',
              completedAt: new Date().toISOString(),
            })
          );
        }
      }
    } finally {
      batchAbortRef.current = null;
      isBatchRunningRef.current = false;
      setIsBatchRunning(false);
    }
  };

  const handleTopUpSubmit = async (pkg: 'starter' | 'creator' | 'studio') => {
    try {
      const res = await smartVideoOrchestrator.topUpCredits(pkg);
      if (res.credits) {
        setCreditsState(res.credits);
        setTemplateSuccessMsg(res.message || `+${res.addedCredits} kreditů připsáno!`);
        setIsTopUpModalOpen(false);
        setTimeout(() => setTemplateSuccessMsg(null), 3500);
      }
    } catch {
      setErrorMsg('Dobití kreditů se nezdařilo.');
    }
  };

  const handleOpenGenGenerate = async () => {
    if (!topic.trim() || isGenerating) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setErrorMsg(null);
    setRenderProgress(null);
    setPreviewMode('canvas');

    const activeModel = openGenModels.find((m) => m.id === selectedModelId) || openGenModels[0];
    const cost = activeModel ? activeModel.creditCost : 0;

    if (cost > 0 && creditsState.available < cost) {
      setErrorMsg(
        `Nedostatek kreditů pro ${activeModel?.name || 'tento model'}. Potřebujete ${cost} kreditů, máte k dispozici ${creditsState.available}.`
      );
      setIsGenerating(false);
      setIsTopUpModalOpen(true);
      return;
    }

    const syncedStructuredPrompt: StructuredVideoPrompt = {
      ...structuredPrompt,
      rawPrompt: topic,
      aspectRatio: format,
      fps: fps === 24 || fps === 60 ? fps : 30,
      camera: {
        ...structuredPrompt.camera,
        primaryMotion: cameraMotion,
        motionIntensity,
      },
      style: {
        ...structuredPrompt.style,
        negativePrompt,
      },
    };

    try {
      const result = await smartVideoOrchestrator.generateOpenGenVideo(
        {
          modelId: selectedModelId,
          mode: openGenMode,
          prompt: topic,
          negativePrompt: negativePrompt || undefined,
          aspectRatio: format,
          durationSec: Math.min(
            activeModel?.maxDurationSec || 15,
            syncedStructuredPrompt.totalDurationSec || 6
          ),
          cameraMotion,
          motionIntensity,
          fps,
          qualityTier,
          promptMagic,
          templateId: selectedTemplateId,
          structuredPrompt: syncedStructuredPrompt,
        },
        {
          signal: controller.signal,
          pollIntervalMs: 300,
          onAccepted202: (initial) => {
            if (initial.storyboard) setCurrentStoryboard(initial.storyboard);
            if (initial.moviePyScript) setCurrentMoviePyScript(initial.moviePyScript);
            if (initial.structuredPrompt) setStructuredPrompt(initial.structuredPrompt);
            if (initial.asset) setCurrentVideoAsset(initial.asset);
            if (cost > 0) {
              setCreditsState((prev) => ({
                ...prev,
                available: Math.max(0, prev.available - cost),
                usedThisPeriod: prev.usedThisPeriod + cost,
              }));
            }
          },
          onProgress: (update) => {
            setRenderProgress(update);
          },
        }
      );

      if (result.storyboard) setCurrentStoryboard(result.storyboard);
      if (result.moviePyScript) setCurrentMoviePyScript(result.moviePyScript);
      if (result.structuredPrompt) setStructuredPrompt(result.structuredPrompt);
      if (result.asset) {
        setCurrentVideoAsset(result.asset);
        if (result.asset.status === 'ready' && result.asset.streamUrl) {
          setPreviewMode('mp4');
        }
      }
      if (result.creditsRemaining !== undefined) {
        setCreditsState((prev) => ({ ...prev, available: result.creditsRemaining! }));
      }
      onRefreshAssets();
      seekPreviewTime(0);
      setIsPlaying(true);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setErrorMsg(err?.message || 'Generování videa selhalo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const playSynthSound = (frequency: number, type: OscillatorType = 'sine', duration = 0.09) => {
    if (isMuted) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context restricted before user gesture
    }
  };

  const activeStructuredPrompt =
    currentVideoAsset?.structuredPrompt || currentStoryboard?.structuredPrompt || structuredPrompt;
  const previewDuration = Math.max(4, activeStructuredPrompt?.totalDurationSec || 42);
  const activeStructuredPromptRef = useRef(activeStructuredPrompt);
  const previewDurationRef = useRef(previewDuration);
  const formatRef = useRef(format);
  const beatIntervalRef = useRef(60 / (activeTemplate?.musicPreset?.bpm || 128));

  activeStructuredPromptRef.current = activeStructuredPrompt;
  previewDurationRef.current = previewDuration;
  formatRef.current = format;
  beatIntervalRef.current = 60 / (activeTemplate?.musicPreset?.bpm || 128);
  isPlayingRef.current = isPlaying;

  const drawFrameRef = useRef<(timeSec: number) => void>(() => {});
  drawFrameRef.current = (timeSec: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const sp = activeStructuredPromptRef.current;
    const dur = previewDurationRef.current;
    const activeFormat = formatRef.current;
    const palette = VISUAL_STYLE_PALETTES[sp.style.visualStyle];

    const beats = sp.temporal.beats || [];
    let activeBeat: TemporalSceneBeat | null = null;
    let beatProgress = 0;
    let beatElapsed = 0;
    for (const b of beats) {
      if (timeSec >= b.startSec && timeSec < b.endSec) {
        activeBeat = b;
        beatElapsed = timeSec - b.startSec;
        beatProgress = Math.max(0, Math.min(1, beatElapsed / Math.max(0.2, b.durationSec)));
        break;
      }
    }
    if (!activeBeat && beats.length > 0) {
      activeBeat = beats[0];
    }

    const zoom = activeBeat
      ? activeBeat.cameraZoomStart +
        (activeBeat.cameraZoomEnd - activeBeat.cameraZoomStart) * beatProgress
      : 1.0;
    const panX = activeBeat ? activeBeat.cameraPanX * beatProgress * (width * 0.16) : 0;
    const panY = activeBeat ? activeBeat.cameraPanY * beatProgress * (height * 0.14) : 0;
    const isFpv = activeBeat?.cameraKeyframe === 'fpv_drone';
    const isOrbit = activeBeat?.cameraKeyframe === 'orbit_360';
    const bankAngle = isFpv
      ? Math.sin(timeSec * 3.1) * 0.045
      : isOrbit
      ? Math.sin(timeSec * 1.4) * 0.025
      : 0;

    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#07090e');
    grad.addColorStop(0.55, `${palette.accentColor}22`);
    grad.addColorStop(1, '#05070a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.translate(width / 2 - panX, height / 2 - panY);
    ctx.rotate(bankAngle);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    ctx.strokeStyle = `${palette.accentColor}24`;
    ctx.lineWidth = 1;
    const gridSize = 28;
    const offsetX = ((panX * 0.6) % gridSize + gridSize) % gridSize;
    const offsetY = ((panY * 0.6) % gridSize + gridSize) % gridSize;
    for (let x = -gridSize; x < width + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + offsetX, -gridSize);
      ctx.lineTo(x + offsetX, height + gridSize);
      ctx.stroke();
    }
    for (let y = -gridSize; y < height + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(-gridSize, y + offsetY);
      ctx.lineTo(width + gridSize, y + offsetY);
      ctx.stroke();
    }

    const focusRadius = Math.min(width, height) * 0.22;
    ctx.strokeStyle = `${palette.secondaryColor}55`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.44, focusRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (isOrbit) {
      const dotAngle = timeSec * 2.4;
      ctx.fillStyle = palette.accentColor;
      ctx.beginPath();
      ctx.arc(
        width / 2 + Math.cos(dotAngle) * focusRadius,
        height * 0.44 + Math.sin(dotAngle) * focusRadius,
        4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();

    if (activeBeat && beatElapsed < 0.22 && timeSec > 0.05) {
      const flashAlpha = (1 - beatElapsed / 0.22) * 0.35;
      ctx.fillStyle =
        activeBeat.transitionIn === 'glitch_flash'
          ? `rgba(6, 182, 212, ${flashAlpha})`
          : `rgba(255, 255, 255, ${flashAlpha * 0.7})`;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = `${palette.accentColor}66`;
    const numBars = 22;
    const barWidth = width / numBars - 3;
    for (let i = 0; i < numBars; i++) {
      const barHeight = Math.sin(timeSec * 7 + i * 0.55) * 14 + 18;
      ctx.fillRect(i * (barWidth + 3) + 2, height - barHeight - 12, barWidth, barHeight);
    }

    const boxY = height * 0.22;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.86)';
    ctx.strokeStyle = palette.accentColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(width * 0.07, boxY, width * 0.86, height * 0.46, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.accentColor;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const phaseLabel = activeBeat
      ? `${PHASE_LABELS[activeBeat.phase].toUpperCase()} · ${activeBeat.startSec.toFixed(1)}–${activeBeat.endSec.toFixed(1)}s`
      : `${sp.totalDurationSec}s`;
    ctx.fillText(phaseLabel, width / 2, boxY + 22);

    ctx.fillStyle = palette.secondaryColor;
    ctx.font = '10px monospace';
    const camShort = activeBeat
      ? `${CAMERA_MOTION_LABELS[activeBeat.cameraKeyframe].split('(')[0].trim()} · ${zoom.toFixed(2)}×`
      : CAMERA_MOTION_LABELS[sp.camera.primaryMotion].split('(')[0].trim();
    ctx.fillText(camShort, width / 2, boxY + 40);

    const safeTextWidth = width * 0.86 - 24;
    const wrapWords = (text: string, maxLines: number): string[] => {
      const words = text.trim().split(/\s+/);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= safeTextWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
          if (lines.length >= maxLines) break;
        }
      }
      if (current && lines.length < maxLines) lines.push(current);
      return lines.slice(0, maxLines);
    };

    ctx.fillStyle = '#ffffff';
    ctx.font = activeFormat === '9:16' ? 'bold 13px ui-sans-serif, system-ui' : 'bold 15px ui-sans-serif, system-ui';
    const headline = activeBeat?.kineticCaption || sp.subject.primarySubject;
    const headlineLines = wrapWords(headline, 2);
    headlineLines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, boxY + 68 + idx * 17);
    });

    ctx.fillStyle = 'rgba(228, 228, 231, 0.85)';
    ctx.font = '11px ui-sans-serif';
    const desc = activeBeat?.sceneDescription || sp.subject.subjectAction;
    const descLines = wrapWords(desc, 3);
    const descStartY = boxY + (headlineLines.length > 1 ? 110 : 98);
    descLines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, descStartY + idx * 15);
    });

    ctx.fillStyle = 'rgba(161, 161, 170, 0.92)';
    ctx.font = '9px monospace';
    const opticsShort = OPTICS_LABELS[sp.style.optics].split('(')[0].trim();
    const lightShort = LIGHTING_LABELS[sp.style.lighting].split('(')[0].trim();
    let footerText = `${opticsShort} · ${lightShort}`;
    while (ctx.measureText(footerText).width > safeTextWidth && footerText.length > 12) {
      footerText = `${footerText.slice(0, -4)}...`;
    }
    ctx.fillText(footerText, width / 2, boxY + height * 0.41);

    const progressPercent = Math.max(0, Math.min(1, timeSec / dur));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, width, 4);
    ctx.fillStyle = palette.accentColor;
    ctx.fillRect(0, 0, width * progressPercent, 4);
  };

  useEffect(() => {
    if (!isPlaying) {
      drawFrameRef.current(currentTimeRef.current);
      return;
    }

    let lastTimestamp: number | null = null;
    let lastHudBucket = Math.floor(currentTimeRef.current * 10);

    const step = (now: number) => {
      if (!isPlayingRef.current) return;
      const delta =
        lastTimestamp === null ? 0 : Math.max(0, Math.min(0.1, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      const prev = currentTimeRef.current;
      let next = Math.max(0, prev + delta);
      const beatInterval = beatIntervalRef.current;
      if (Math.floor(next / beatInterval) !== Math.floor(prev / beatInterval)) {
        playSynthSound(Math.floor(next) % 2 === 0 ? 150 : 210, 'triangle', 0.08);
      }
      if (next >= previewDurationRef.current) {
        next = 0;
      }
      currentTimeRef.current = next;
      drawFrameRef.current(next);

      const nextBucket = Math.floor(next * 10);
      if (nextBucket !== lastHudBucket) {
        lastHudBucket = nextBucket;
        setCurrentTime(next);
      }

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      drawFrameRef.current(currentTimeRef.current);
    }
  }, [isPlaying, currentTime, isMuted, currentStoryboard, format, activeTemplate, activeStructuredPrompt, previewDuration]);

  const copyScriptToClipboard = async () => {
    if (!currentMoviePyScript) return;
    const ok = await copyTextSafely(currentMoviePyScript);
    if (ok) {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const downloadPythonScript = () => {
    if (!currentMoviePyScript) return;
    const blob = new Blob([currentMoviePyScript], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_moviepy_pipeline_${format.replace(':', '_')}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredTemplates =
    categoryFilter === 'all'
      ? templates
      : templates.filter((t) => t.category === categoryFilter);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-zinc-950 p-4 sm:p-6 space-y-6">
      {/* OpenGen Suite Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 font-mono tracking-wider">
              LOKÁLNÍ CHYTRÝ REŽISÉR · ZERO-API + OPENGEN STUDIO
            </span>
            <span className="text-zinc-500 font-mono text-[11px] hidden sm:inline">
              Subjekt · Styl · Pohyb kamery · Časový vývoj scény · FFmpeg +faststart
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">
            Strukturované Text-to-Video Studio &amp; MoviePy Pipeline
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl font-mono">
            Plně lokální chytré generování bez externích či placených API. Strukturovaný prompt přesně řídí subjekt, optický styl, kinematografický pohyb kamery a fázový vývoj scény v čase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Studio Mode Switcher */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              type="button"
              onClick={() => setStudioMode('opengen')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 font-bold whitespace-nowrap transition ${
                studioMode === 'opengen'
                  ? 'bg-cyan-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>OpenGen AI Studio</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('moviepy')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 font-bold whitespace-nowrap transition ${
                studioMode === 'moviepy'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              <span>MoviePy Scénáře</span>
            </button>
          </div>

          {/* OpenGen Credits Meter & Top-Up Button */}
          <div className="flex items-center rounded-lg border border-amber-500/40 bg-amber-950/20 px-2.5 py-1 gap-2">
            <div className="flex items-center gap-1.5 text-amber-300">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-bold tabular-nums text-xs">{creditsState.available}</span>
              <span className="text-[10px] text-amber-400/80">kreditů</span>
            </div>
            <button
              type="button"
              onClick={() => setIsTopUpModalOpen(true)}
              className="rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold transition flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              <span>Dokoupit</span>
            </button>
          </div>

          {/* Format / Aspect Ratio Switcher */}
          <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-1">
            <button
              type="button"
              onClick={() => setFormat('9:16')}
              className={`rounded px-2.5 py-1 font-bold whitespace-nowrap transition text-[11px] ${
                format === '9:16'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              9:16 Shorts/TikTok
            </button>
            <button
              type="button"
              onClick={() => setFormat('16:9')}
              className={`rounded px-2.5 py-1 font-bold whitespace-nowrap transition text-[11px] ${
                format === '16:9'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              16:9 YouTube
            </button>
          </div>

          {currentVideoAsset && currentVideoAsset.line === 'video' && (
            <button
              type="button"
              onClick={() => downloadVideoAsset(currentVideoAsset)}
              className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-bold text-emerald-300 hover:bg-emerald-500/20 whitespace-nowrap transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Stáhnout MP4</span>
            </button>
          )}

          {currentVideoAsset && (
            <button
              type="button"
              data-testid="open-asset-review-btn"
              onClick={() => setReviewModalAsset(currentVideoAsset)}
              className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 font-bold text-cyan-300 hover:bg-cyan-500/20 whitespace-nowrap transition"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Zkontrolovat asset</span>
            </button>
          )}

          {onOpenPublish && (
            <button
              type="button"
              disabled={!canPublish}
              onClick={() =>
                onOpenPublish(
                  structuredPrompt.monetizationKit?.seoTitle || currentStoryboard?.title || topic,
                  format,
                  activeTemplate?.category || 'viral_hook',
                  {
                    assetId: currentVideoAsset?.id,
                    description: structuredPrompt.monetizationKit
                      ? `${structuredPrompt.monetizationKit.hookLine}\n\n${structuredPrompt.monetizationKit.ctaLine}`
                      : currentVideoAsset?.body,
                    tags: structuredPrompt.monetizationKit?.brandSafeTags || currentVideoAsset?.tags,
                  }
                )
              }
              className="flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black px-3.5 py-1.5 font-bold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition"
              title={canPublish ? 'Publikovat na YouTube, TikTok a Instagram Reels' : 'Chybí oprávnění publikace'}
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Publikovat video</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback / RBAC Notifications */}
      {templateSuccessMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-mono text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{templateSuccessMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs font-mono text-rose-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* OPENGEN MULTI-MODEL HUB (when studioMode === 'opengen') */}
      {studioMode === 'opengen' && (
        <div
          className="rounded-lg border border-cyan-500/30 bg-zinc-900/60 p-4 space-y-4 font-mono text-xs"
          data-testid="opengen-models-hub"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="font-bold text-white uppercase text-[11px]">
                REŽIM GENEROVÁNÍ ({openGenModels.length > 0 ? openGenModels.length : 11}) · LOKÁLNÍ REŽISÉR BEZ API &amp; MODELY
              </span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
              <span>Aktivní engine:</span>
              <span className="font-bold text-cyan-300">
                {openGenModels.find((m) => m.id === selectedModelId)?.name || 'Lokální Chytrý Režisér (Bez API)'}
              </span>
            </div>
          </div>

          {/* Featured Local Zero-API Director + Symmetrical 5x2 Multi-Model Grid */}
          {(() => {
            const allModels =
              openGenModels.length > 0
                ? openGenModels
                : [
                    {
                      id: 'nexus-local-director',
                      name: 'Lokální Chytrý Režisér (Bez API)',
                      provider: 'NEXUS Local Engine',
                      badge: 'ZERO-API LOCAL',
                      creditCost: 0,
                      description:
                        'Deterministický 4-pilířový režisér: subjekt, styl, pohyb kamery a časový vývoj scény bez externích či placených API.',
                      features: ['0 Kreditů', '4-Pillar NLP', 'FFmpeg +faststart'],
                    },
                    {
                      id: 'veo-3-1',
                      name: 'Google Veo 3.1',
                      provider: 'Google DeepMind',
                      badge: '4K CINEMA',
                      creditCost: 12,
                      description: 'Fotorealistická fyzika, světlo a kinematografická kamera.',
                      features: ['4K HDR', 'Prompt Magic', 'Camera Motion'],
                    },
                    {
                      id: 'runway-gen-4-5',
                      name: 'Runway Gen-4.5',
                      provider: 'Runway',
                      badge: 'DIRECTOR PRO',
                      creditCost: 14,
                      description: 'Hollywoodský režijní model s přesnou kontrolou klíčových snímků.',
                      features: ['Director Keyframes', 'Multi-Brush'],
                    },
                    {
                      id: 'minimax-hailuo-2-3',
                      name: 'MiniMax Hailuo 2.3',
                      provider: 'MiniMax',
                      badge: 'HYPER-FAST',
                      creditCost: 8,
                      description: 'Bleskurychlý lidský pohyb a bezkonkurenční mimika.',
                      features: ['Realistic Faces', 'Fast Render'],
                    },
                    {
                      id: 'kling-o3',
                      name: 'Kling 4.0 / O3',
                      provider: 'Kuaishou',
                      badge: 'MULTI-CAM',
                      creditCost: 10,
                      description: 'Multi-kamera simulace, fluidní dynamika a 3D trajektorie.',
                      features: ['Fluid Dynamics', '3D Motion'],
                    },
                    {
                      id: 'luma-ray-v3-2',
                      name: 'Luma Ray v3.2',
                      provider: 'Luma AI',
                      badge: 'SMOOTH MOTION',
                      creditCost: 7,
                      description: '3D volumetrické svícení a plynulý dronový průlet.',
                      features: ['Drone Paths', 'Loop Video'],
                    },
                    {
                      id: 'seedance-2-5',
                      name: 'Seedance 2.5',
                      provider: 'OpenGen',
                      badge: 'ACTION BEAT',
                      creditCost: 6,
                      description: 'Energický tanec, sportovní akce a kinetický střih.',
                      features: ['Music Sync', 'Sports Motion'],
                    },
                    {
                      id: 'gemini-omni-flash',
                      name: 'Gemini Omni Flash',
                      provider: 'Google',
                      badge: 'MULTIMODAL',
                      creditCost: 9,
                      description: 'Multimodální video reasoning s českým kontextem.',
                      features: ['Czech Nuance', 'Voice Sync'],
                    },
                    {
                      id: 'wan-2-1',
                      name: 'Wan 2.1 MoE',
                      provider: 'Alibaba Wan-AI',
                      badge: 'OPEN-WEIGHTS',
                      creditCost: 5,
                      description: 'Špičkový open-weights model s MoE architekturou.',
                      features: ['Open-Weights', 'Low Cost'],
                    },
                    {
                      id: 'hunyuan-video',
                      name: 'HunyuanVideo',
                      provider: 'Tencent',
                      badge: 'OPEN SOURCE',
                      creditCost: 5,
                      description: 'Velký open-source model s kinematografickou hloubkou.',
                      features: ['High Prompt Adherence', 'Open'],
                    },
                    {
                      id: 'flux-2-pro',
                      name: 'Flux 2 Pro',
                      provider: 'Black Forest Labs',
                      badge: 'IMAGE BASE',
                      creditCost: 3,
                      description: 'Fotorealistické klíčové snímky pro Image-to-Video.',
                      features: ['Photo Realism', 'Keyframe Anchor'],
                    },
                  ];

            const localEngine = allModels.find((m) => m.id === 'nexus-local-director');
            const cloudModels = allModels.filter((m) => m.id !== 'nexus-local-director');

            return (
              <div className="space-y-3">
                {localEngine && (
                  <button
                    type="button"
                    data-testid="model-card-nexus-local-director"
                    onClick={() => setSelectedModelId(localEngine.id)}
                    className={`w-full text-left rounded-lg border p-3.5 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                      selectedModelId === localEngine.id
                        ? 'border-emerald-400 bg-emerald-950/35 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-400/50'
                        : 'border-zinc-800 bg-zinc-950 hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Cpu className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="font-bold text-white text-sm">{localEngine.name}</span>
                        <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          {localEngine.badge || 'ZERO-API LOCAL'}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-400">
                          0 kreditů · Lokálně bez placených/externích API
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        {localEngine.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {localEngine.features.map((feat) => (
                        <span
                          key={feat}
                          className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] text-emerald-200 whitespace-nowrap"
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </button>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {cloudModels.map((model) => {
                    const isSelected = model.id === selectedModelId;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setSelectedModelId(model.id)}
                        className={`text-left rounded-lg border p-3 transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400/50'
                            : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-bold text-white text-xs truncate">{model.name}</span>
                            <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300 shrink-0">
                              {model.badge || 'PRO'}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 flex items-center justify-between">
                            <span className="truncate">{model.provider}</span>
                            <span
                              className={`font-bold shrink-0 ${
                                model.creditCost === 0 ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {model.creditCost === 0 ? '0 kreditů (Zdarma)' : `${model.creditCost} kreditů`}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                            {model.description}
                          </p>
                        </div>

                        <div className="mt-2 pt-2 border-t border-zinc-800/80 flex flex-wrap gap-1 text-[9px] text-zinc-500">
                          {model.features.slice(0, 2).map((feat) => (
                            <span
                              key={feat}
                              className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-zinc-400"
                            >
                              {feat}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* OPENGEN DIRECT GENERATION CONTROLS */}
          <div
            className="rounded-lg border border-zinc-800/90 bg-zinc-950/80 p-4 space-y-3.5"
            data-testid="opengen-studio-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              {/* Generation Mode (Text-to-Video / Image-to-Video / Video-to-Video) */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-zinc-500 font-bold uppercase mr-1">Režim:</span>
                {(
                  [
                    { id: 'text_to_video', label: 'Text-to-Video (T2V)' },
                    { id: 'image_to_video', label: 'Image-to-Video (I2V)' },
                    { id: 'video_to_video', label: 'AI Filtry (V2V)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOpenGenMode(m.id)}
                    className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                      openGenMode === m.id
                        ? 'bg-cyan-500 text-black'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Quality & FPS Controls */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5">
                  {(['720p', '1080p', '4K'] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQualityTier(q)}
                      className={`rounded px-2 py-0.5 font-bold transition ${
                        qualityTier === q ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5">
                  {([24, 30, 60] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={`rounded px-2 py-0.5 font-bold transition ${
                        fps === f ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  data-testid="toggle-prompt-magic"
                  onClick={() => setPromptMagic((v) => !v)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 font-bold transition ${
                    promptMagic
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Prompt Magic: {promptMagic ? 'ZAP' : 'VYP'}</span>
                </button>
              </div>
            </div>

            {/* 4-Pillar Structured Text-to-Video Engine Controls */}
            <StructuredPromptBuilder
              value={structuredPrompt}
              rawPrompt={topic}
              onRawPromptChange={(nextText) => setTopic(nextText)}
              onChange={handleStructuredPromptChange}
              onSmartParse={handleSmartParsePrompt}
              onSmartEnhance={handleSmartEnhancePrompt}
              onAiSmartEnhance={handleAiSmartEnhancePrompt}
              isProcessing={isStructuringPrompt}
              isAiEnhancing={isAiEnhancing}
              aiEnhanceNotes={aiEnhanceNotes}
            />

            {/* Action Row: Estimated Credits + Enqueue & Generate Buttons */}
            {(() => {
              const currentModel = openGenModels.find((m) => m.id === selectedModelId);
              const cost = currentModel ? currentModel.creditCost : 0;
              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 tabular-nums">
                    <span
                      className={`flex items-center gap-1 font-bold ${
                        cost === 0 ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      <Coins className="h-3.5 w-3.5" />
                      <span>
                        {cost === 0
                          ? 'Spotřeba: 0 kreditů (Lokální render bez API)'
                          : `Spotřeba: ${cost} kreditů`}
                      </span>
                    </span>
                    <span>·</span>
                    <span>
                      Zůstatek po generování:{' '}
                      {Math.max(0, creditsState.available - cost)} kreditů
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="opengen-enqueue-btn"
                      disabled={!canCreateVideos || !topic.trim()}
                      onClick={handleAddCurrentToBatchQueue}
                      className="flex items-center justify-center gap-1.5 rounded border border-cyan-500/50 bg-cyan-950/30 hover:bg-cyan-900/40 px-3.5 py-2.5 font-mono text-xs font-bold text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Do dávky</span>
                    </button>

                    <button
                      type="button"
                      data-testid="opengen-generate-btn"
                      disabled={!canCreateVideos || isGenerating || !topic.trim()}
                      onClick={handleOpenGenGenerate}
                      className="flex items-center justify-center gap-2 rounded bg-gradient-to-r from-cyan-400 to-emerald-400 px-6 py-2.5 font-mono text-xs font-bold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 shadow-lg shadow-cyan-950/40 whitespace-nowrap"
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>
                            {renderProgress?.httpStatus === 202
                              ? `WORKER ${renderProgress.progressPercent}%...`
                              : 'GENEROVÁNÍ VIDEA...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>
                            VYGENEROVAT VIDEO ·{' '}
                            {(currentModel?.name || 'LOKÁLNÍ CHYTRÝ REŽISÉR').toUpperCase()}{' '}
                            ({cost === 0 ? 'ZDARMA · 0 KREDITŮ' : `${cost} KREDITŮ`})
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* SEQUENTIAL BATCH PROCESSING QUEUE */}
      {studioMode === 'opengen' && (
        <BatchQueuePanel
          queue={batchQueue}
          isRunning={isBatchRunning}
          canCreateVideos={canCreateVideos}
          availableCredits={creditsState.available}
          models={openGenModels}
          defaultModelId={selectedModelId}
          defaultTemplateId={selectedTemplateId}
          onAddCurrentToQueue={handleAddCurrentToBatchQueue}
          onAddCustomTask={handleAddCustomBatchTask}
          onRemoveItem={(id) =>
            updateBatchQueueState((prev) => removeBatchQueueItem(prev, id))
          }
          onMoveItem={(id, dir) =>
            updateBatchQueueState((prev) => moveBatchQueueItem(prev, id, dir))
          }
          onRetryItem={(id) =>
            updateBatchQueueState((prev) => retryBatchQueueItem(prev, id))
          }
          onClearFinished={() =>
            updateBatchQueueState((prev) => clearFinishedBatchItems(prev))
          }
          onStartBatch={handleStartBatchQueue}
          onPauseBatch={handlePauseBatchQueue}
          onReviewAsset={(asset) => setReviewModalAsset(asset)}
        />
      )}

      {/* MONETIZATION CHEATSHEETS, 100% AUDIT & HARDCORE REALISM RIG */}
      {studioMode === 'opengen' && (
        <MonetizationCheatsheetsPanel
          structuredPrompt={structuredPrompt}
          currentAsset={currentVideoAsset}
          onApplyPrompt={handleApplyMonetizedPrompt}
          onSyncToPublish={
            onOpenPublish
              ? (title, fmt) =>
                  onOpenPublish(title, fmt, activeTemplate?.category || 'viral_hook', {
                    assetId: currentVideoAsset?.id,
                    description: structuredPrompt.monetizationKit
                      ? `${structuredPrompt.monetizationKit.hookLine}\n\n${structuredPrompt.monetizationKit.ctaLine}`
                      : undefined,
                    tags: structuredPrompt.monetizationKit?.brandSafeTags,
                  })
              : undefined
          }
        />
      )}

      {/* COMPREHENSIVE VIDEO STYLES & TEMPLATES LIBRARY (when studioMode === 'moviepy') */}
      {studioMode === 'moviepy' && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4 font-mono text-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-emerald-400" />
              <span className="font-bold text-white uppercase text-[11px]">
                KNIHOVNA STYLŮ A ŠABLON ({templates.length})
              </span>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1">
              {(Object.keys(CATEGORY_LABELS) as Array<'all' | VideoTemplateCategory>).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded px-2.5 py-1 text-[11px] whitespace-nowrap transition ${
                    categoryFilter === cat
                      ? 'bg-emerald-500 text-black font-bold'
                      : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-white'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {activeTemplate && (
                <button
                  type="button"
                  disabled={!canManageTemplates}
                  onClick={() => openCustomizeTemplateModal(activeTemplate)}
                  className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 whitespace-nowrap transition"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Přizpůsobit vybranou</span>
                </button>
              )}
              <button
                type="button"
                disabled={!canManageTemplates}
                onClick={openCreateTemplateModal}
                className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 whitespace-nowrap transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nová šablona</span>
              </button>
            </div>
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {filteredTemplates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <div
                  key={tpl.id}
                  className={`rounded-lg border p-3 transition flex flex-col justify-between ${
                    isSelected
                      ? 'border-emerald-500/60 bg-emerald-950/20'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="text-left w-full space-y-1.5 focus:outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white truncate text-xs">{tpl.name}</span>
                      <span className="text-[10px] text-emerald-400 font-bold shrink-0">{tpl.aspectRatio}</span>
                    </div>
                    <div className="text-[10px] text-cyan-400">
                      {CATEGORY_LABELS[tpl.category]} · {tpl.visualStyle}
                    </div>
                    <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">{tpl.description}</p>
                  </button>

                  <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] tabular-nums">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Palette className="h-3 w-3 text-cyan-400" />
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-zinc-700"
                          style={{ backgroundColor: tpl.subtitleStyle.highlightColor }}
                        />
                      </span>
                      <span className="flex items-center gap-1">
                        <Music className="h-3 w-3 text-amber-400" />
                        <span>{tpl.musicPreset.bpm} BPM</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!canManageTemplates}
                        onClick={() => openCustomizeTemplateModal(tpl)}
                        className="text-zinc-400 hover:text-cyan-400 disabled:opacity-40"
                        title={`Upravit šablonu ${tpl.name}`}
                      >
                        Upravit
                      </button>
                      {!tpl.isBuiltIn && (
                        <button
                          type="button"
                          disabled={!canManageTemplates}
                          onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                          className="p-0.5 text-zinc-500 hover:text-rose-400 disabled:opacity-40"
                          aria-label={`Smazat šablonu ${tpl.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SmartVideoOrchestrator: Trend Analysis & Autonomous MoviePy + FFmpeg (+faststart) Pipeline */}
      <div
        className="rounded-lg border border-cyan-500/30 bg-zinc-900/70 p-4 space-y-3 font-mono text-xs"
        data-testid="smart-video-orchestrator"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-white uppercase text-[11px]">
                  SmartVideoOrchestrator · Trend &amp; MoviePy Autopilot
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  -movflags +faststart · 202 Worker
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {trendAnalysis?.rationale ||
                  'Analyzuje virální trendy, spáruje optimální šablonu a spustí MoviePy + FFmpeg (+faststart) worker s ověřením integrity.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isLoadingTrends || isGenerating}
              onClick={() => fetchTrendAnalysis(selectedTrendId)}
              className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white disabled:opacity-40 transition"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingTrends ? 'animate-spin' : ''}`} />
              <span>Obnovit trendy</span>
            </button>
            <button
              type="button"
              data-testid="smart-orchestrator-run"
              disabled={!canCreateVideos || isGenerating}
              onClick={handleSmartOrchestratorRun}
              className="flex items-center gap-1.5 rounded bg-cyan-400 hover:bg-cyan-300 text-black px-3.5 py-1.5 font-bold text-[11px] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Analyzovat trendy &amp; Spustit MoviePy</span>
            </button>
          </div>
        </div>

        {trendAnalysis && trendAnalysis.trends.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {trendAnalysis.trends.map((trend) => {
              const isActiveTrend =
                (selectedTrendId || trendAnalysis.selectedTrend.id) === trend.id;
              return (
                <button
                  key={trend.id}
                  type="button"
                  onClick={() => {
                    setSelectedTrendId(trend.id);
                    fetchTrendAnalysis(trend.id);
                  }}
                  className={`text-left rounded-lg border p-2.5 transition space-y-1 ${
                    isActiveTrend
                      ? 'border-cyan-400/70 bg-cyan-950/30'
                      : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-cyan-300 uppercase">
                      {trend.platform}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 tabular-nums">
                      Velocity {trend.velocityScore}/100 · {trend.growth24h}
                    </span>
                  </div>
                  <div className="font-bold text-white text-xs line-clamp-1">{trend.keyword}</div>
                  <div className="text-[10px] text-zinc-400 line-clamp-1">
                    Hook: {trend.suggestedHook}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Real-Time Worker Progress Indicator (HTTP 202 Accepted -> 200 OK Ready) */}
      {renderProgress && (
        <div
          data-testid="factory-render-progress"
          className={`rounded-lg border p-4 space-y-3 font-mono text-xs ${
            renderProgress.status === 'failed'
              ? 'border-rose-500/50 bg-rose-950/30'
              : renderProgress.httpStatus === 200 && renderProgress.status === 'ready'
              ? 'border-emerald-500/50 bg-emerald-950/20'
              : 'border-amber-500/50 bg-zinc-900/90'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {renderProgress.httpStatus === 202 ? (
                <Clock className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
              ) : renderProgress.status === 'ready' ? (
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span className="font-bold text-white">
                {renderProgress.httpStatus === 202
                  ? 'HTTP 202 ACCEPTED · BACKGROUND WORKER ZPRACOVÁVÁ VIDEO'
                  : renderProgress.status === 'ready'
                  ? 'HTTP 200 OK · MP4 ATOMICKY OVĚŘENO & PŘIPRAVENO'
                  : 'RENDER WORKER SELHAL'}
              </span>
              <span className="rounded bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 tabular-nums">
                Asset: {renderProgress.assetId}
              </span>
              {renderProgress.httpStatus === 202 && (
                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-300 tabular-nums">
                  Poll #{renderProgress.pollAttempt} · Retry-After: {renderProgress.retryAfterSeconds || 1}s
                </span>
              )}
              {renderProgress.faststartVerified && (
                <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-300">
                  +faststart (moov před mdat) ✓
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="font-bold text-sm text-white tabular-nums">
                {renderProgress.progressPercent}%
              </span>
              {renderProgress.status === 'ready' && (
                <button
                  type="button"
                  onClick={() => setRenderProgress(null)}
                  className="text-zinc-400 hover:text-white"
                  aria-label="Skrýt indikátor renderu"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="w-full h-2 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                renderProgress.status === 'failed'
                  ? 'bg-rose-500'
                  : renderProgress.status === 'ready'
                  ? 'bg-emerald-500'
                  : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, renderProgress.progressPercent))}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
            {(
              [
                { key: 'queued', label: '1. Fronta (202)' },
                { key: 'compiling_storyboard', label: '2. MoviePy Scénář' },
                { key: 'rendering_ffmpeg', label: '3. FFmpeg H.264' },
                { key: 'optimizing_faststart', label: '4. +faststart Moov' },
                { key: 'ready', label: '5. SHA-256 Ready' },
              ] as Array<{ key: MediaRenderStage; label: string }>
            ).map((step, index) => {
              const stageOrder: Record<string, number> = {
                queued: 0,
                analyzing_brief: 0,
                compiling_storyboard: 1,
                rendering_ffmpeg: 2,
                optimizing_faststart: 3,
                verifying_integrity: 4,
                ready: 5,
                failed: -1,
              };
              const currentRank = stageOrder[renderProgress.progressStage] ?? 0;
              const isCompleted = renderProgress.status === 'ready' || currentRank > index;
              const isCurrent = renderProgress.status !== 'ready' && currentRank === index;
              return (
                <div
                  key={step.key}
                  className={`rounded border px-2 py-1.5 flex items-center gap-1.5 ${
                    isCompleted
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : isCurrent
                      ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-200 font-bold'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-500'
                  }`}
                >
                  <Cpu className="h-3 w-3 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-zinc-300">{renderProgress.workerMessage}</p>
        </div>
      )}

      {/* Production Lines & Prompt Input */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4" data-testid="factory-generate">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-3">
          <button
            type="button"
            onClick={() => setSelectedLine('video')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 font-mono text-xs transition ${
              selectedLine === 'video'
                ? 'bg-zinc-800 text-emerald-400 font-bold border border-emerald-500/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            <span>1. Linka: Video (YouTube / TikTok / Reels)</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLine('ad')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 font-mono text-xs transition ${
              selectedLine === 'ad'
                ? 'bg-zinc-800 text-cyan-400 font-bold border border-cyan-500/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            <span>2. Linka: Reklamní kreativy</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLine('funnel')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 font-mono text-xs transition ${
              selectedLine === 'funnel'
                ? 'bg-zinc-800 text-amber-400 font-bold border border-amber-500/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>3. Linka: Funnel & Opt-in</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            aria-label="Téma videa"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Zadejte téma videa (např. 'Jak nastavit AI workflow za 5 minut')..."
            className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 font-mono"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canCreateVideos || isGenerating || !topic.trim()}
            className="flex items-center justify-center gap-2 rounded bg-emerald-500 px-5 py-2 font-mono text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {renderProgress?.httpStatus === 202
                    ? `WORKER ${renderProgress.progressPercent}% (202)...`
                    : 'KOMPILUJI SCÉNÁŘ & MOVIEPY...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>VYGENEROVAT VIDEO PODLE ŠABLONY</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Studio Viewport (Preview Player + MoviePy Code + Storyboard) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" data-testid="factory-output">
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-2 font-mono text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-bold text-white">
              <Film className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                {previewMode === 'mp4' && currentVideoAsset?.status === 'ready' && currentVideoAsset?.streamUrl
                  ? `REÁLNÝ MP4 STREAM (${currentVideoAsset.resolution || format})`
                  : `LIVE ANIMOVANÝ NÁHLED (${activeTemplate?.name || format})`}
              </span>
            </span>
            <div className="flex items-center gap-1.5">
              {currentVideoAsset?.status === 'ready' && currentVideoAsset?.streamUrl && (
                <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('mp4')}
                    className={`rounded px-2 py-0.5 font-bold transition ${
                      previewMode === 'mp4' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    MP4 Stream
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('canvas')}
                    className={`rounded px-2 py-0.5 font-bold transition ${
                      previewMode === 'canvas' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Canvas
                  </button>
                </div>
              )}
              <span className="text-[10px] text-emerald-400 tabular-nums">
                VIRALITY: {currentStoryboard?.viralityScore || 94}%
              </span>
            </div>
          </div>

          {previewMode === 'mp4' &&
          currentVideoAsset?.status === 'ready' &&
          currentVideoAsset?.streamUrl ? (
            <div className="w-full flex flex-col items-center space-y-2">
              <div
                className={`relative rounded-xl border border-emerald-500/40 bg-black overflow-hidden shadow-2xl flex items-center justify-center ${
                  (currentVideoAsset.resolution === '1280x720' ? '16:9' : format) === '9:16'
                    ? 'w-[280px] h-[497px]'
                    : 'w-full max-w-[480px] h-[270px]'
                }`}
              >
                <video
                  key={currentVideoAsset.id}
                  data-testid="factory-video-player"
                  controls
                  playsInline
                  preload="metadata"
                  poster={
                    currentVideoAsset.posterUrl ||
                    `/api/v1/assets/${currentVideoAsset.id}/stream?format=poster`
                  }
                  src={currentVideoAsset.streamUrl}
                  className="w-full h-full object-contain bg-black"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-[480px] rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[10px] text-zinc-400 tabular-nums">
                <span className="text-emerald-400 font-bold">
                  {currentVideoAsset.faststartVerified ? 'FFmpeg -movflags +faststart ✓' : 'MP4 Stream Ready'}
                </span>
                <div className="flex items-center gap-2">
                  <span>
                    {currentVideoAsset.resolution || format} ·{' '}
                    {currentVideoAsset.sizeBytes
                      ? `${Math.round(currentVideoAsset.sizeBytes / 1024)} KB`
                      : 'H.264/AAC'}
                  </span>
                  <button
                    type="button"
                    data-testid="player-review-asset-btn"
                    onClick={() => setReviewModalAsset(currentVideoAsset)}
                    className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/25 whitespace-nowrap transition"
                  >
                    <Eye className="h-3 w-3" />
                    <span>Detail &amp; QA</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`relative rounded-xl border border-zinc-800 bg-black overflow-hidden shadow-2xl flex items-center justify-center ${
                  format === '9:16' ? 'w-[280px] h-[497px]' : 'w-full max-w-[480px] h-[270px]'
                }`}
              >
                <canvas
                  ref={canvasRef}
                  width={format === '9:16' ? 280 : 480}
                  height={format === '9:16' ? 497 : 270}
                  className="w-full h-full object-contain"
                />

                {!isPlaying && (
                  <button
                    type="button"
                    aria-label="Přehrát náhled videa"
                    onClick={() => setIsPlaying(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer backdrop-blur-[2px]"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg hover:scale-105 transition">
                      <Play className="h-6 w-6 fill-current ml-0.5" />
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-3 flex items-center gap-3 w-full max-w-[480px] rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 font-mono text-xs tabular-nums">
                <button
                  type="button"
                  aria-label={isPlaying ? 'Pozastavit video' : 'Přehrát video'}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500 text-black hover:bg-emerald-400 transition"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                </button>

                <span className="text-zinc-300 text-[11px] w-16 text-center">
                  {Math.floor(currentTime)}s / {Math.round(previewDuration)}s
                </span>

                <input
                  type="range"
                  aria-label="Časová osa videa"
                  min="0"
                  max={previewDuration}
                  step="0.5"
                  value={Math.min(currentTime, previewDuration)}
                  onChange={(e) => seekPreviewTime(parseFloat(e.target.value))}
                  className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-zinc-800 rounded"
                />

                <button
                  type="button"
                  aria-label={isMuted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('storyboard')}
                className={`rounded px-3 py-1 font-mono text-xs whitespace-nowrap transition ${
                  activeTab === 'storyboard'
                    ? 'bg-zinc-800 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Časová osa & Scénář ({currentStoryboard?.scenes.length || 5} scén)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('script')}
                className={`rounded px-3 py-1 font-mono text-xs whitespace-nowrap transition ${
                  activeTab === 'script'
                    ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                MoviePy 2.x Python Kód
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className={`rounded px-3 py-1 font-mono text-xs whitespace-nowrap transition ${
                  activeTab === 'library'
                    ? 'bg-zinc-800 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Knihovna Assetů ({assets.length})
              </button>
            </div>

            {activeTab === 'script' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={copyScriptToClipboard}
                  className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-300 hover:text-white transition"
                >
                  {copiedScript ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedScript ? 'Zkopírováno' : 'Kopírovat'}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadPythonScript}
                  className="flex items-center gap-1 rounded bg-emerald-500 px-2.5 py-1 text-xs font-mono font-bold text-black hover:bg-emerald-400 transition"
                >
                  <Download className="h-3 w-3" />
                  <span>Stáhnout .py</span>
                </button>
              </div>
            )}
          </div>

          {activeTab === 'storyboard' && currentStoryboard && (
            <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
              {activeStructuredPrompt && (
                <div
                  data-testid="storyboard-structured-summary"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-mono"
                >
                  <div className="rounded border border-emerald-500/30 bg-emerald-950/15 p-2.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-400 block">
                      1. Subjekt
                    </span>
                    <span className="text-zinc-200 line-clamp-2 mt-0.5 block">
                      {activeStructuredPrompt.subject.primarySubject}
                    </span>
                  </div>
                  <div className="rounded border border-cyan-500/30 bg-cyan-950/15 p-2.5">
                    <span className="text-[10px] font-bold uppercase text-cyan-400 block">
                      2. Styl &amp; Optika
                    </span>
                    <span className="text-zinc-200 line-clamp-2 mt-0.5 block">
                      {VISUAL_STYLE_PALETTES[activeStructuredPrompt.style.visualStyle].label} ·{' '}
                      {OPTICS_LABELS[activeStructuredPrompt.style.optics].split('(')[0].trim()}
                    </span>
                  </div>
                  <div className="rounded border border-amber-500/30 bg-amber-950/15 p-2.5">
                    <span className="text-[10px] font-bold uppercase text-amber-400 block">
                      3. Pohyb kamery
                    </span>
                    <span className="text-zinc-200 line-clamp-2 mt-0.5 block">
                      {CAMERA_MOTION_LABELS[activeStructuredPrompt.camera.primaryMotion].split('(')[0].trim()} ({activeStructuredPrompt.camera.motionIntensity}/10)
                    </span>
                  </div>
                  <div className="rounded border border-purple-500/30 bg-purple-950/15 p-2.5">
                    <span className="text-[10px] font-bold uppercase text-purple-400 block">
                      4. Časový vývoj
                    </span>
                    <span className="text-zinc-200 line-clamp-2 mt-0.5 block tabular-nums">
                      {activeStructuredPrompt.temporal.beats.length} fází · {activeStructuredPrompt.totalDurationSec}s @ {activeStructuredPrompt.fps}fps
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded border border-emerald-500/20 bg-emerald-950/15 p-3">
                  <span className="text-[10px] uppercase text-emerald-400 block font-bold">
                    ÚVODNÍ HOOK ({currentStoryboard.aspectRatio})
                  </span>
                  <p className="mt-1 text-zinc-200 font-semibold">{currentStoryboard.hook}</p>
                </div>
                <div className="rounded border border-cyan-500/20 bg-cyan-950/15 p-3">
                  <span className="text-[10px] uppercase text-cyan-400 block font-bold">
                    VÝZVA K AKCI & SMYČKA
                  </span>
                  <p className="mt-1 text-zinc-200">{currentStoryboard.cta}</p>
                </div>
              </div>

              <div className="space-y-2">
                {currentStoryboard.scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-1.5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
                      <span className="font-bold text-emerald-400">
                        Scéna #{scene.id} · {scene.timeRange} ({scene.durationSec}s)
                      </span>
                      <span className="text-[11px] text-zinc-400">{scene.bRollKeyword}</span>
                    </div>

                    <div className="text-zinc-200">
                      <span className="text-zinc-500">Vizuál:</span> {scene.visual}
                    </div>
                    <div className="text-zinc-300">
                      <span className="text-emerald-400">Voiceover:</span> &quot;{scene.audioVoiceover}&quot;
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500 pt-1">
                      <span>SFX: {scene.audioSfx}</span>
                      <span>·</span>
                      <span>Titulek: &quot;{scene.kineticText}&quot;</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'script' && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs overflow-x-auto max-h-[500px]">
              <pre className="text-emerald-400/90 leading-relaxed whitespace-pre-wrap">
                {currentMoviePyScript || '# Vygenerujte scénář pro zobrazení MoviePy kódu'}
              </pre>
            </div>
          )}

          {activeTab === 'library' && (
            <div className="space-y-3 font-mono text-xs">
              {/* OpenGen Gallery Controls: Layout & Size View Modes */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-[11px] font-bold text-zinc-300 uppercase">Rozvržení:</span>
                  <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5">
                    <button
                      type="button"
                      aria-label="Zobrazit mřížku"
                      onClick={() => setGalleryLayout('grid')}
                      className={`flex items-center gap-1 rounded px-2.5 py-0.5 transition ${
                        galleryLayout === 'grid'
                          ? 'bg-emerald-500 text-black font-bold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="h-3 w-3" />
                      <span className="text-[10px]">Mřížka</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Zobrazit řádky"
                      onClick={() => setGalleryLayout('row')}
                      className={`flex items-center gap-1 rounded px-2.5 py-0.5 transition ${
                        galleryLayout === 'row'
                          ? 'bg-emerald-500 text-black font-bold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <List className="h-3 w-3" />
                      <span className="text-[10px]">Řádky</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-[11px] font-bold text-zinc-300 uppercase">Velikost:</span>
                  <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5 gap-0.5">
                    {(['mini', 'small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setGallerySize(sz)}
                        className={`rounded px-2 py-0.5 text-[10px] uppercase font-bold transition ${
                          gallerySize === sz
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {sz === 'mini' ? 'Mini' : sz === 'small' ? 'Malá' : sz === 'medium' ? 'Střední' : 'Velká'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Asset List or Grid Rendering */}
              <div
                className={`overflow-y-auto max-h-[500px] pr-1 ${
                  galleryLayout === 'grid'
                    ? gallerySize === 'mini'
                      ? 'grid grid-cols-2 sm:grid-cols-4 gap-2'
                      : gallerySize === 'small'
                      ? 'grid grid-cols-1 sm:grid-cols-3 gap-2.5'
                      : gallerySize === 'large'
                      ? 'grid grid-cols-1 gap-4'
                      : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                    : 'space-y-3'
                }`}
              >
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`rounded-lg border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between transition hover:border-zinc-700 ${
                      gallerySize === 'mini' ? 'p-2 space-y-1.5 text-[11px]' : 'p-4 space-y-2'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-white truncate text-xs sm:text-sm">
                          {asset.title}
                        </span>
                        <span className="text-[10px] uppercase text-emerald-400 shrink-0">
                          {asset.line}
                        </span>
                      </div>
                      {gallerySize !== 'mini' && (
                        <p className="text-zinc-300 whitespace-pre-wrap text-xs mt-1 line-clamp-3">
                          {asset.body}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60 mt-2">
                      <span className="truncate max-w-[120px]">{asset.meta}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid={`review-asset-btn-${asset.id}`}
                          onClick={() => setReviewModalAsset(asset)}
                          className="flex items-center gap-1 rounded bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-cyan-300 hover:bg-cyan-500/25 whitespace-nowrap transition"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Náhled</span>
                        </button>
                        {asset.line === 'video' && (
                          <button
                            type="button"
                            onClick={() => downloadVideoAsset(asset)}
                            className="flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/25"
                          >
                            <Download className="h-3 w-3" />
                            <span>MP4</span>
                          </button>
                        )}
                        <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREATE / CUSTOMIZE TEMPLATE MODAL */}
      {isTemplateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modalMode === 'customize' ? 'Přizpůsobit šablonu' : 'Nová šablona videa'}
          data-testid="template-editor-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono text-xs"
        >
          <div className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-white">
                <Sliders className="h-4 w-4 text-emerald-400" />
                <span className="font-bold text-sm">
                  {modalMode === 'customize' ? `Přizpůsobit šablonu: ${tplName}` : 'Vytvořit novou šablonu videa'}
                </span>
              </div>
              <button
                type="button"
                aria-label="Zavřít editor šablony"
                data-testid="close-template-modal"
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleTemplateFormSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-zinc-400 mb-1">Název šablony *</span>
                  <input
                    type="text"
                    required
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="např. 'SaaS Tutoriál v2'"
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="block text-zinc-400 mb-1">Kategorie formátu</span>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as VideoTemplateCategory)}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="tutorial">Tutoriál (How-To)</option>
                    <option value="vlog">Vlog</option>
                    <option value="news_short">Zpravodajský Short (News)</option>
                    <option value="animated_explainer">Animovaný Explainer</option>
                    <option value="product_demo">Produktové Demo</option>
                    <option value="viral_hook">Virální Hook</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-zinc-400 mb-1">Popis a pokyny střihu</span>
                <input
                  type="text"
                  value={tplDesc}
                  onChange={(e) => setTplDesc(e.target.value)}
                  placeholder="Popište pacing, vizuální styl a účel šablony..."
                  className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-zinc-400 mb-1">Vizuální styl</span>
                  <select
                    value={tplStyle}
                    onChange={(e) => setTplStyle(e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    {VISUAL_STYLE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-zinc-400 mb-1">Poměr stran</span>
                  <select
                    value={tplAspectRatio}
                    onChange={(e) => setTplAspectRatio(e.target.value as '9:16' | '16:9')}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="9:16">9:16 (Shorts / TikTok / Reels)</option>
                    <option value="16:9">16:9 (YouTube Landscape)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-zinc-400 mb-1">Barva zvýraznění titulků</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={tplHighlightColor}
                      onChange={(e) => setTplHighlightColor(e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded border border-zinc-800 bg-zinc-900 p-1"
                    />
                    <span className="text-zinc-300">{tplHighlightColor}</span>
                  </div>
                </label>

                <label className="block">
                  <span className="block text-zinc-400 mb-1">Velikost písma (px)</span>
                  <input
                    type="number"
                    min="32"
                    max="96"
                    value={tplFontSize}
                    onChange={(e) => setTplFontSize(Number(e.target.value))}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-white"
                  />
                </label>

                <label className="block">
                  <span className="block text-zinc-400 mb-1">Tempo hudby (BPM)</span>
                  <input
                    type="number"
                    min="70"
                    max="180"
                    value={tplBpm}
                    onChange={(e) => setTplBpm(Number(e.target.value))}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-white"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-zinc-400 mb-1">Hudební podklad</span>
                  <input
                    type="text"
                    value={tplBeatType}
                    onChange={(e) => setTplBeatType(e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white"
                  />
                </label>
                <label className="block">
                  <span className="block text-zinc-400 mb-1">Struktura scénáře</span>
                  <input
                    type="text"
                    value={tplStructure}
                    onChange={(e) => setTplStructure(e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-white"
                  />
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-300 hover:text-white"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-500 px-4 py-2 font-bold text-black hover:bg-emerald-400"
                >
                  {modalMode === 'customize' ? 'Uložit úpravy šablony' : 'Vytvořit šablonu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OPENGEN CREDITS TOP-UP MODAL */}
      {isTopUpModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dokoupit kredity OpenGen AI"
          data-testid="topup-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono text-xs"
        >
          <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Dokoupit kredity · OpenGen.ai/cs
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Kredity platí pro všechny AI video a image modely bez časového omezení.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Zavřít okno dobití kreditů"
                data-testid="close-topup-modal"
                onClick={() => setIsTopUpModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Current Balance Banner */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3.5 flex flex-wrap items-center justify-between gap-3 text-amber-200">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-black tabular-nums text-amber-400">
                  {creditsState.available}
                </div>
                <div className="text-xs">
                  <div className="font-bold">Dostupných kreditů</div>
                  <div className="text-[10px] text-amber-400/80">
                    Aktivní plán: {creditsState.plan} ({creditsState.monthlyQuota} měsíčně)
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-right text-zinc-400">
                <div>Použito v tomto období: <span className="text-zinc-200 font-bold">{creditsState.usedThisPeriod}</span></div>
                <div className="text-[10px]">Obnova: {new Date(creditsState.expiresAt).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Packages Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Starter */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col justify-between hover:border-zinc-700 transition">
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    STARTER
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white">+100</span>
                    <span className="text-xs text-zinc-400">kreditů</span>
                  </div>
                  <div className="text-base font-bold text-zinc-200">149 Kč</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Vhodné pro otestování modelů Kling 4.0, Hailuo 2.3 a Flux 2 Pro.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="topup-pack-starter"
                  onClick={() => handleTopUpSubmit('starter')}
                  className="mt-4 w-full rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 text-xs transition border border-zinc-700"
                >
                  Dobít 100 kreditů
                </button>
              </div>

              {/* Creator Pro (Featured) */}
              <div className="relative rounded-xl border-2 border-amber-500/80 bg-amber-950/20 p-4 flex flex-col justify-between shadow-lg shadow-amber-500/5">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded bg-amber-500 text-black px-2 py-0.5 text-[9px] font-black tracking-wider uppercase shadow">
                  NEJPOPULÁRNĚJŠÍ · UŠETŘÍTE 33%
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                    CREATOR PRO
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-amber-300">+500</span>
                    <span className="text-xs text-amber-400/80">kreditů</span>
                  </div>
                  <div className="text-base font-bold text-white">499 Kč</div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Cca 40–50 videí přes Google Veo 3.1 &amp; MiniMax Hailuo 2.3 s Prompt Magic.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="topup-pack-creator"
                  onClick={() => handleTopUpSubmit('creator')}
                  className="mt-4 w-full rounded bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 text-xs transition shadow-md"
                >
                  Dobít 500 kreditů
                </button>
              </div>

              {/* Studio Ultra */}
              <div className="rounded-xl border border-purple-500/30 bg-purple-950/15 p-4 flex flex-col justify-between hover:border-purple-500/50 transition">
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                    STUDIO ULTRA
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-purple-300">+2 000</span>
                    <span className="text-xs text-purple-400/80">kreditů</span>
                  </div>
                  <div className="text-base font-bold text-white">1 490 Kč</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Pro agentury, marketingové kampaně a masovou 4K produkci bez čekání.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="topup-pack-studio"
                  onClick={() => handleTopUpSubmit('studio')}
                  className="mt-4 w-full rounded bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 text-xs transition shadow-md"
                >
                  Dobít 2 000 kreditů
                </button>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-1.5 text-[11px] text-zinc-400">
              <div className="font-bold text-zinc-200">Garantované výhody OpenGen AI:</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 list-disc list-inside">
                <li>Okamžité dobití s automatickým potvrzením</li>
                <li>Zakoupené kredity nikdy neexpirují</li>
                <li>Plný přístup k Google Veo 3.1, Kling O3 &amp; Hailuo</li>
                <li>H.264 MP4 export s FFmpeg faststart streamingem</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ASSET REVIEW & QA OVERLAY MODAL */}
      <AssetReviewModal
        isOpen={Boolean(reviewModalAsset)}
        asset={reviewModalAsset}
        onClose={() => setReviewModalAsset(null)}
        onPublishAsset={handlePublishReviewedAsset}
        onLoadIntoEditor={handleLoadAssetIntoEditor}
        canPublish={canPublish}
      />
    </div>
  );
};
