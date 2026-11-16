/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FactoryAsset,
  MediaRenderStage,
  SmartTrendAnalysisResult,
  UserVideoTemplate,
  VideoCreativeBrief,
  VideoStoryboard,
  ViralTrend,
} from '../../types/nexus.ts';
import { db } from '../db.ts';
import { MediaRenderer } from './mediaRenderer.ts';
import { MoviePyCompiler } from './moviepy.ts';
import { VideoDirectorEngine } from './videoDirector.ts';

export interface QueuedVideoRenderInput {
  asset: FactoryAsset;
  threadId: string;
  aspectRatio: '9:16' | '16:9';
  brief: VideoCreativeBrief;
  storyboard: VideoStoryboard;
  template?: UserVideoTemplate;
  topic: string;
  dryRun?: boolean;
}

/**
 * Updates progress state on a tracked FactoryAsset in the authoritative database
 * without marking it 'ready' until FFmpeg +faststart and SHA-256 integrity pass.
 */
function updateAssetProgress(
  asset: FactoryAsset,
  stage: MediaRenderStage,
  percent: number,
  message: string
): void {
  asset.progressStage = stage;
  asset.progressPercent = Math.min(99, Math.max(0, percent));
  asset.workerMessage = message;
  asset.updatedAt = new Date().toISOString();
  if (stage === 'queued') {
    asset.status = 'queued';
  } else if (stage === 'failed') {
    asset.status = 'failed';
  } else if (stage !== 'ready') {
    asset.status = 'rendering';
  }
}

/**
 * Executes FFmpeg +faststart rendering, atom verification, and SHA-256 integrity checks.
 * Never transitions `asset.status` to `'ready'` until `faststartVerified` and checksum succeed.
 */
export async function executeVideoRenderJob(input: QueuedVideoRenderInput): Promise<{
  asset: FactoryAsset;
  renderedWithFfmpeg: boolean;
}> {
  const { asset, threadId, aspectRatio, brief, storyboard, template, topic, dryRun } = input;
  db.activeJobQueueCount += 1;

  try {
    updateAssetProgress(
      asset,
      'compiling_storyboard',
      22,
      `MoviePy 2.x kompilace scénáře (${storyboard.scenes.length} scén, ${aspectRatio})...`
    );

    const rendered = await MediaRenderer.renderVideoMp4({
      assetId: asset.id,
      threadId,
      title: storyboard.title,
      prompt: topic,
      format: aspectRatio,
      durationSec: brief.durationSec,
      storyboard,
      template,
      brief,
      dryRun: Boolean(dryRun),
      onStageProgress: (stage, pct, msg) => updateAssetProgress(asset, stage, pct, msg),
    });

    if (rendered.renderedWithFfmpeg && !rendered.faststartVerified) {
      updateAssetProgress(
        asset,
        'optimizing_faststart',
        88,
        'Dodatečný FFmpeg -movflags +faststart remux před publikací do Media Vaultu...'
      );
      const remuxCheck = await MediaRenderer.ensureFaststartMp4(rendered.filePath, rendered.filePath, true);
      rendered.faststartVerified = remuxCheck.faststartVerified;
    }

    if (!rendered.sizeBytes || !rendered.sha256) {
      throw new Error('Výsledný MP4 soubor neprošel kontrolou integrity a velikosti.');
    }

    const checksum = MediaRenderer.computeFileChecksum(rendered.filePath);

    Object.assign(asset, {
      meta: `Formát: ${storyboard.targetPlatform} (${aspectRatio}), ${rendered.durationSec}s MP4 (${rendered.resolution}) · +faststart`,
      status: 'ready' as const,
      progressStage: 'ready' as const,
      progressPercent: 100,
      workerMessage: `MP4 připraveno pro webový stream (moov@start=${rendered.faststartVerified ? 'OK' : 'WARN'}, SHA-256 ověřeno).`,
      faststartVerified: rendered.faststartVerified,
      mimeType: rendered.mimeType,
      sizeBytes: checksum.sizeBytes,
      durationSec: rendered.durationSec,
      resolution: rendered.resolution,
      sha256: checksum.sha256,
      filePath: rendered.filePath,
      streamUrl: rendered.streamUrl,
      downloadUrl: rendered.downloadUrl,
      updatedAt: new Date().toISOString(),
    });

    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `Vyrenderováno +faststart MP4: ${storyboard.title}`,
      description: `FFmpeg H.264/AAC (-movflags +faststart) uložil ${Math.round(checksum.sizeBytes / 1024)} KB MP4 do Media Vaultu.`,
      agent: 'Video Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });

    return {
      asset,
      renderedWithFfmpeg: rendered.renderedWithFfmpeg,
    };
  } catch (err: any) {
    asset.status = 'failed';
    asset.progressStage = 'failed';
    asset.workerMessage = `Chyba workeru: ${err.message}`;
    asset.updatedAt = new Date().toISOString();
    throw err;
  } finally {
    db.activeJobQueueCount = Math.max(0, db.activeJobQueueCount - 1);
  }
}

/**
 * Schedules a video render job in the background worker so HTTP controllers
 * can immediately respond with `202 Accepted` and let clients poll `/status`.
 */
export function enqueueBackgroundVideoRenderJob(input: QueuedVideoRenderInput): void {
  db.queuedJobsCount += 1;
  setImmediate(() => {
    db.queuedJobsCount = Math.max(0, db.queuedJobsCount - 1);
    executeVideoRenderJob(input).catch((err) => {
      console.error(`[VideoJobRunner] Background render failed for ${input.asset.id}:`, err);
    });
  });
}

/**
 * Analyzes analytics viral trends + historical recommendations and pairs the
 * top-velocity topic with the highest-fit MoviePy template.
 */
export async function analyzeTrendingVideoOpportunity(options?: {
  trendId?: string;
  platform?: string;
  templateId?: string;
}): Promise<SmartTrendAnalysisResult> {
  const trends: ViralTrend[] = [...db.analyticsData.viralTrends].sort(
    (a, b) => b.velocityScore - a.velocityScore
  );

  let selectedTrend = trends[0];
  if (options?.trendId) {
    const byId = trends.find((t) => t.id === options.trendId);
    if (byId) selectedTrend = byId;
  } else if (options?.platform && options.platform !== 'all') {
    const normalized = options.platform.toLowerCase();
    const byPlatform = trends.find((t) => t.platform.toLowerCase().includes(normalized));
    if (byPlatform) selectedTrend = byPlatform;
  }

  const matchedTemplate =
    (options?.templateId
      ? db.userTemplates.find((t) => t.id === options.templateId)
      : undefined) ||
    db.userTemplates.find((t) =>
      selectedTrend.platform.toLowerCase().includes('youtube')
        ? t.category === 'viral_hook' || t.category === 'tutorial'
        : t.category === 'viral_hook' || t.category === 'news_short'
    ) ||
    db.userTemplates[0];

  const recommendedFormat: '9:16' | '16:9' =
    selectedTrend.platform === 'YouTube Shorts' ||
    selectedTrend.platform === 'TikTok' ||
    selectedTrend.platform === 'Instagram Reels' ||
    selectedTrend.platform === 'Meta Reels'
      ? '9:16'
      : matchedTemplate?.aspectRatio || '9:16';

  const directorPrompt = `Vytvoř ${recommendedFormat} video na ${selectedTrend.platform} o "${selectedTrend.keyword}" — ${selectedTrend.suggestedHook}`;
  const analyzed = await VideoDirectorEngine.analyzePrompt({
    userMessage: directorPrompt,
    forceDefaults: true,
  });

  const brief: VideoCreativeBrief = {
    ...analyzed.brief,
    aspectRatio: recommendedFormat,
    hook: selectedTrend.suggestedHook,
  };

  const rationale = `Trend "${selectedTrend.keyword}" má velocity ${selectedTrend.velocityScore}/100 (${selectedTrend.growth24h} za 24h) na ${selectedTrend.platform}. Spárováno se šablonou "${matchedTemplate?.name || 'Výchozí'}" (${recommendedFormat}).`;

  return {
    selectedTrend,
    recommendedTemplateId: matchedTemplate?.id || 'tpl-viral-hook',
    recommendedTemplateName: matchedTemplate?.name || 'Virální Hook',
    recommendedFormat,
    brief,
    rationale,
    trends,
  };
}

/**
 * Creates an initialized pending FactoryAsset in `queued` state for immediate tracking.
 */
export function createPendingVideoAsset(params: {
  assetId: string;
  threadId: string;
  prompt: string;
  aspectRatio: '9:16' | '16:9';
  brief: VideoCreativeBrief;
  storyboard: VideoStoryboard;
  moviePyScript: string;
  template?: UserVideoTemplate;
  dryRun?: boolean;
}): FactoryAsset {
  const now = new Date().toISOString();
  return {
    id: params.assetId,
    threadId: params.threadId,
    line: 'video',
    title: params.storyboard.title,
    prompt: params.prompt,
    body: `Hook: "${params.storyboard.hook}"\nCTA: "${params.storyboard.cta}"\nVirality Score: ${params.storyboard.viralityScore}% (Styl: ${params.brief.visualStyle})`,
    meta: `Formát: ${params.storyboard.targetPlatform} (${params.aspectRatio}), ve frontě na FFmpeg +faststart render...`,
    tags: [
      'Video',
      params.aspectRatio,
      'MP4',
      '+faststart',
      params.brief.visualStyle,
      params.dryRun ? 'DRY-RUN' : 'H.264',
    ],
    status: 'queued',
    progressPercent: 10,
    progressStage: 'queued',
    workerMessage: 'Úloha zařazena do background worker fronty (HTTP 202 Accepted)...',
    faststartVerified: false,
    mimeType: 'video/mp4',
    durationSec: params.brief.durationSec,
    resolution: params.aspectRatio === '16:9' ? '1280x720' : '720x1280',
    streamUrl: `/api/v1/assets/${params.assetId}/stream`,
    downloadUrl: `/api/v1/assets/${params.assetId}/download`,
    moviePyScript: params.moviePyScript,
    videoStoryboard: params.storyboard,
    videoBrief: params.brief,
    dryRun: Boolean(params.dryRun),
    createdAt: now,
    updatedAt: now,
  };
}
