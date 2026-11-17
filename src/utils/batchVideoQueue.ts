/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BatchSchedulerChunk,
  BatchSchedulerPlan,
  BatchVideoQueueItem,
  OpenGenCameraMotion,
  StructuredVideoPrompt,
  VideoVisualStyle,
} from '../types/nexus.ts';
import {
  VISUAL_STYLE_PALETTES,
  parseStructuredPromptFromText,
} from './structuredVideoPrompt.ts';
import { VISUAL_DRAG_TAGS } from './monetizationCheatsheets.ts';

export interface CreateBatchQueueItemInput {
  id?: string;
  title?: string;
  prompt: string;
  modelId: string;
  modelName: string;
  creditCost: number;
  mode?: 'text_to_video' | 'image_to_video' | 'video_to_video';
  format: '9:16' | '16:9';
  durationSec?: number;
  fps?: 24 | 30 | 60;
  qualityTier?: '720p' | '1080p' | '4K';
  cameraMotion?: OpenGenCameraMotion;
  motionIntensity?: number;
  visualStyle?: VideoVisualStyle;
  negativePrompt?: string;
  promptMagic?: boolean;
  templateId?: string;
  structuredPrompt?: StructuredVideoPrompt;
}

export interface BatchQueueSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  overallProgressPercent: number;
  remainingCreditCost: number;
}

export function createBatchQueueItem(input: CreateBatchQueueItemInput): BatchVideoQueueItem {
  const cleanPrompt = input.prompt.trim();
  const baseStructured: StructuredVideoPrompt = input.structuredPrompt
    ? structuredClone(input.structuredPrompt)
    : parseStructuredPromptFromText(cleanPrompt || 'Dynamická AI video scéna', {
        aspectRatio: input.format,
        durationSec: input.durationSec,
        fps: input.fps,
        visualStyle: input.visualStyle,
        cameraMotion: input.cameraMotion,
        motionIntensity: input.motionIntensity,
        negativePrompt: input.negativePrompt,
      });

  const resolvedStyle: VideoVisualStyle = input.visualStyle || baseStructured.style.visualStyle;
  const palette = VISUAL_STYLE_PALETTES[resolvedStyle];
  const resolvedFps: 24 | 30 | 60 =
    input.fps === 24 || input.fps === 60 || input.fps === 30 ? input.fps : baseStructured.fps;
  const resolvedCamera: OpenGenCameraMotion =
    input.cameraMotion || baseStructured.camera.primaryMotion;
  const resolvedIntensity = Math.max(
    1,
    Math.min(10, input.motionIntensity ?? baseStructured.camera.motionIntensity)
  );
  const resolvedDuration = Math.max(
    4,
    Math.min(15, input.durationSec ?? baseStructured.totalDurationSec ?? 6)
  );
  const resolvedNegative =
    input.negativePrompt?.trim() || baseStructured.style.negativePrompt;

  const syncedPrompt: StructuredVideoPrompt = {
    ...baseStructured,
    rawPrompt: cleanPrompt || baseStructured.rawPrompt,
    aspectRatio: input.format,
    fps: resolvedFps,
    totalDurationSec: resolvedDuration,
    style: {
      ...baseStructured.style,
      visualStyle: resolvedStyle,
      accentColor: palette.accentColor,
      secondaryColor: palette.secondaryColor,
      bgHex: palette.bgHex,
      colorGrading: palette.colorGrading,
      negativePrompt: resolvedNegative,
    },
    camera: {
      ...baseStructured.camera,
      primaryMotion: resolvedCamera,
      motionIntensity: resolvedIntensity,
    },
  };

  const activeStyleTag = (syncedPrompt.activeTagIds || [])
    .map((id) => VISUAL_DRAG_TAGS.find((t) => t.id === id && t.category === 'style'))
    .find(Boolean);

  const shortTitle =
    input.title?.trim() ||
    (syncedPrompt.rawPrompt.length > 48
      ? `${syncedPrompt.rawPrompt.slice(0, 45).trim()}…`
      : syncedPrompt.rawPrompt);

  return {
    id:
      input.id ||
      `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: shortTitle,
    prompt: syncedPrompt.rawPrompt,
    modelId: input.modelId,
    modelName: input.modelName,
    creditCost: Math.max(0, input.creditCost),
    mode: input.mode || 'text_to_video',
    format: input.format,
    durationSec: resolvedDuration,
    fps: resolvedFps,
    qualityTier: input.qualityTier || '1080p',
    cameraMotion: resolvedCamera,
    motionIntensity: resolvedIntensity,
    visualStyle: resolvedStyle,
    selectedStyleLabel: activeStyleTag?.label || palette.label,
    negativePrompt: resolvedNegative,
    promptMagic: input.promptMagic ?? true,
    templateId: input.templateId,
    structuredPrompt: syncedPrompt,
    status: 'queued',
    progressPercent: 0,
    progressStage: 'idle',
    workerMessage: 'Připraveno k sekvenčnímu zpracování ve frontě.',
    createdAt: new Date().toISOString(),
  };
}

export function addBatchQueueItem(
  queue: BatchVideoQueueItem[],
  item: BatchVideoQueueItem
): BatchVideoQueueItem[] {
  return [...queue, item];
}

export function removeBatchQueueItem(
  queue: BatchVideoQueueItem[],
  id: string
): BatchVideoQueueItem[] {
  return queue.filter((item) => !(item.id === id && item.status !== 'running'));
}

export function moveBatchQueueItem(
  queue: BatchVideoQueueItem[],
  id: string,
  direction: 'up' | 'down'
): BatchVideoQueueItem[] {
  const index = queue.findIndex((item) => item.id === id);
  if (index === -1 || queue[index].status !== 'queued') {
    return queue;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= queue.length) {
    return queue;
  }
  if (queue[targetIndex].status !== 'queued') {
    return queue;
  }

  const next = [...queue];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function updateBatchQueueItem(
  queue: BatchVideoQueueItem[],
  id: string,
  patch: Partial<BatchVideoQueueItem>
): BatchVideoQueueItem[] {
  return queue.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function retryBatchQueueItem(
  queue: BatchVideoQueueItem[],
  id: string
): BatchVideoQueueItem[] {
  return queue.map((item) =>
    item.id === id && (item.status === 'failed' || item.status === 'cancelled')
      ? {
          ...item,
          status: 'queued',
          progressPercent: 0,
          progressStage: 'idle',
          error: undefined,
          workerMessage: 'Zařazeno znovu do fronty.',
        }
      : item
  );
}

export function clearFinishedBatchItems(
  queue: BatchVideoQueueItem[]
): BatchVideoQueueItem[] {
  return queue.filter((item) => item.status === 'queued' || item.status === 'running');
}

export function getNextPendingBatchItem(
  queue: BatchVideoQueueItem[]
): BatchVideoQueueItem | undefined {
  return queue.find((item) => item.status === 'queued');
}

export function buildOptimizedBatchSchedule(
  queue: BatchVideoQueueItem[],
  options: { autoChunkOptimize?: boolean; maxChunkSize?: number } = {}
): BatchSchedulerPlan {
  const autoChunkOptimize = options.autoChunkOptimize ?? true;
  const maxChunkSize = Math.max(1, Math.min(8, Math.round(options.maxChunkSize ?? 3)));
  const queuedItems = queue.filter((item) => item.status === 'queued');

  if (queuedItems.length === 0) {
    return {
      autoChunkOptimize,
      maxChunkSize,
      totalQueuedTasks: 0,
      totalChunks: 0,
      estimatedOverheadSavedPercent: 0,
      optimizedExecutionOrder: [],
      chunks: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const chunks: BatchSchedulerChunk[] = [];

  if (!autoChunkOptimize) {
    // FIFO chunking by maxChunkSize without similarity regrouping
    for (let i = 0; i < queuedItems.length; i += maxChunkSize) {
      const slice = queuedItems.slice(i, i + maxChunkSize);
      const lead = slice[0];
      const pipelineKey = `${lead.modelId}::${lead.format}::${lead.visualStyle}::${lead.templateId || 'default'}`;
      chunks.push({
        chunkId: `chunk-fifo-${chunks.length + 1}`,
        chunkIndex: chunks.length + 1,
        pipelineKey,
        label: `FIFO Dávka #${chunks.length + 1} (${lead.format})`,
        modelId: lead.modelId,
        modelName: lead.modelName,
        format: lead.format,
        visualStyle: lead.visualStyle,
        templateId: lead.templateId,
        itemIds: slice.map((s) => s.id),
        itemCount: slice.length,
        totalCreditCost: slice.reduce((acc, s) => acc + s.creditCost, 0),
        estimatedSavingsPercent: 0,
      });
    }
  } else {
    // Group similar tasks by shared model, aspect ratio, visual style, and template to minimize pipeline warmups
    const groups = new Map<string, BatchVideoQueueItem[]>();
    for (const item of queuedItems) {
      const key = `${item.modelId}::${item.format}::${item.visualStyle}::${item.templateId || 'default'}`;
      const existing = groups.get(key) || [];
      existing.push(item);
      groups.set(key, existing);
    }

    // Order larger homogeneous groups first for maximum pipeline cache hit ratio
    const orderedGroups = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

    for (const [pipelineKey, groupItems] of orderedGroups) {
      for (let i = 0; i < groupItems.length; i += maxChunkSize) {
        const slice = groupItems.slice(i, i + maxChunkSize);
        const lead = slice[0];
        const paletteLabel = VISUAL_STYLE_PALETTES[lead.visualStyle]?.label || lead.selectedStyleLabel;
        // Each reused task after the first avoids FFmpeg filter-graph rebuild & model weight cold swap (~28% per extra task)
        const savings = slice.length > 1 ? Math.min(48, Math.round(((slice.length - 1) / slice.length) * 45)) : 0;
        chunks.push({
          chunkId: `chunk-opt-${chunks.length + 1}`,
          chunkIndex: chunks.length + 1,
          pipelineKey,
          label: `${lead.modelName} · ${lead.format} · ${paletteLabel}`,
          modelId: lead.modelId,
          modelName: lead.modelName,
          format: lead.format,
          visualStyle: lead.visualStyle,
          templateId: lead.templateId,
          itemIds: slice.map((s) => s.id),
          itemCount: slice.length,
          totalCreditCost: slice.reduce((acc, s) => acc + s.creditCost, 0),
          estimatedSavingsPercent: savings,
        });
      }
    }
  }

  const optimizedExecutionOrder = chunks.flatMap((c) => c.itemIds);
  const weightedSavings =
    chunks.length === 0
      ? 0
      : Math.round(
          chunks.reduce((acc, c) => acc + c.estimatedSavingsPercent * c.itemCount, 0) /
            queuedItems.length
        );

  return {
    autoChunkOptimize,
    maxChunkSize,
    totalQueuedTasks: queuedItems.length,
    totalChunks: chunks.length,
    estimatedOverheadSavedPercent: weightedSavings,
    optimizedExecutionOrder,
    chunks,
    generatedAt: new Date().toISOString(),
  };
}

export function getNextScheduledBatchItem(
  queue: BatchVideoQueueItem[],
  options: { autoChunkOptimize?: boolean; maxChunkSize?: number } = {}
): BatchVideoQueueItem | undefined {
  const plan = buildOptimizedBatchSchedule(queue, options);
  if (plan.optimizedExecutionOrder.length === 0) {
    return getNextPendingBatchItem(queue);
  }
  const nextId = plan.optimizedExecutionOrder[0];
  return queue.find((item) => item.id === nextId && item.status === 'queued') || getNextPendingBatchItem(queue);
}

export function computeBatchQueueSummary(
  queue: BatchVideoQueueItem[]
): BatchQueueSummary {
  const total = queue.length;
  let queued = 0;
  let running = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let progressSum = 0;
  let remainingCreditCost = 0;

  for (const item of queue) {
    if (item.status === 'queued') {
      queued += 1;
      remainingCreditCost += item.creditCost;
    } else if (item.status === 'running') {
      running += 1;
      progressSum += Math.max(5, Math.min(99, item.progressPercent));
    } else if (item.status === 'completed') {
      completed += 1;
      progressSum += 100;
    } else if (item.status === 'failed') {
      failed += 1;
      progressSum += 100;
    } else if (item.status === 'cancelled') {
      cancelled += 1;
      progressSum += 100;
    }
  }

  return {
    total,
    queued,
    running,
    completed,
    failed,
    cancelled,
    overallProgressPercent: total === 0 ? 0 : Math.round(progressSum / total),
    remainingCreditCost,
  };
}
