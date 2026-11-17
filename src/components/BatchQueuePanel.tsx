/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  Eye,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  BatchVideoQueueItem,
  FactoryAsset,
  OpenGenCameraMotion,
  OpenGenModelSpec,
  VideoVisualStyle,
} from '../types/nexus.ts';
import {
  CAMERA_MOTION_LABELS,
  VISUAL_STYLE_PALETTES,
} from '../utils/structuredVideoPrompt.ts';
import {
  CreateBatchQueueItemInput,
  computeBatchQueueSummary,
} from '../utils/batchVideoQueue.ts';
import { downloadVideoAsset } from '../utils/mediaDownload.ts';

interface BatchQueuePanelProps {
  queue: BatchVideoQueueItem[];
  isRunning: boolean;
  canCreateVideos: boolean;
  availableCredits: number;
  models: OpenGenModelSpec[];
  defaultModelId: string;
  defaultTemplateId?: string;
  onAddCurrentToQueue: () => void;
  onAddCustomTask: (input: CreateBatchQueueItemInput) => void;
  onRemoveItem: (id: string) => void;
  onMoveItem: (id: string, direction: 'up' | 'down') => void;
  onRetryItem: (id: string) => void;
  onClearFinished: () => void;
  onStartBatch: () => void;
  onPauseBatch: () => void;
  onReviewAsset: (asset: FactoryAsset) => void;
}

const FALLBACK_MODELS: Array<{ id: string; name: string; creditCost: number }> = [
  { id: 'nexus-local-director', name: 'Lokální Chytrý Režisér (Bez API)', creditCost: 0 },
  { id: 'wan-2-2', name: 'Wan 2.2 Turbo (Open)', creditCost: 4 },
  { id: 'ltx-2-5', name: 'LTX-Video 2.5', creditCost: 4 },
  { id: 'veo-3-1', name: 'Google Veo 3.1', creditCost: 12 },
  { id: 'runway-gen-4-5', name: 'Runway Gen-4.5', creditCost: 14 },
  { id: 'minimax-hailuo-2-3', name: 'MiniMax Hailuo 2.3', creditCost: 8 },
  { id: 'kling-o3', name: 'Kling 4.0 / O3', creditCost: 10 },
  { id: 'luma-ray-v3-2', name: 'Luma Ray v3.2', creditCost: 7 },
];

export const BatchQueuePanel: React.FC<BatchQueuePanelProps> = ({
  queue,
  isRunning,
  canCreateVideos,
  availableCredits,
  models,
  defaultModelId,
  defaultTemplateId,
  onAddCurrentToQueue,
  onAddCustomTask,
  onRemoveItem,
  onMoveItem,
  onRetryItem,
  onClearFinished,
  onStartBatch,
  onPauseBatch,
  onReviewAsset,
}) => {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customModelId, setCustomModelId] = useState(defaultModelId || 'nexus-local-director');
  const [customFormat, setCustomFormat] = useState<'9:16' | '16:9'>('9:16');
  const [customVisualStyle, setCustomVisualStyle] = useState<VideoVisualStyle>('cyberpunk_neon');
  const [customCamera, setCustomCamera] = useState<OpenGenCameraMotion>('orbit_360');
  const [customFps, setCustomFps] = useState<24 | 30 | 60>(30);
  const [customQuality, setCustomQuality] = useState<'720p' | '1080p' | '4K'>('1080p');
  const [customDuration, setCustomDuration] = useState<number>(6);

  const summary = computeBatchQueueSummary(queue);
  const selectableModels =
    models.length > 0
      ? models.map((m) => ({ id: m.id, name: m.name, creditCost: m.creditCost }))
      : FALLBACK_MODELS;

  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;
    const chosenModel =
      selectableModels.find((m) => m.id === customModelId) || selectableModels[0];

    onAddCustomTask({
      prompt: customPrompt.trim(),
      modelId: chosenModel.id,
      modelName: chosenModel.name,
      creditCost: chosenModel.creditCost,
      format: customFormat,
      visualStyle: customVisualStyle,
      cameraMotion: customCamera,
      fps: customFps,
      qualityTier: customQuality,
      durationSec: customDuration,
      templateId: defaultTemplateId,
    });

    setCustomPrompt('');
    setIsComposerOpen(false);
  };

  const getStatusBadge = (item: BatchVideoQueueItem) => {
    switch (item.status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300 tabular-nums whitespace-nowrap">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>BĚŽÍ · {item.progressPercent}%</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3" />
            <span>HOTOVO · MP4 READY</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 whitespace-nowrap">
            <XCircle className="h-3 w-3" />
            <span>SELHALO</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 whitespace-nowrap">
            <Pause className="h-3 w-3" />
            <span>POZASTAVENO</span>
          </span>
        );
      case 'queued':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-zinc-300 whitespace-nowrap">
            <Clock className="h-3 w-3 text-zinc-400" />
            <span>VE FRONTĚ</span>
          </span>
        );
    }
  };

  return (
    <section
      data-testid="batch-queue-panel"
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4 font-mono text-xs"
    >
      {/* Header & Batch Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-400 shrink-0" />
            <h2 className="font-bold text-white uppercase tracking-wide text-[11px]">
              Sekvenční Batch Processing Fronta ({summary.total})
            </h2>
            {summary.total > 0 && (
              <span
                data-testid="batch-queue-stats"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-300 tabular-nums"
              >
                Čeká {summary.queued} · Běží {summary.running} · Hotovo {summary.completed}
                {summary.failed > 0 ? ` · Chyby ${summary.failed}` : ''}
              </span>
            )}
            {summary.remainingCreditCost > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/35 bg-amber-950/25 px-2 py-0.5 text-[10px] text-amber-300 tabular-nums">
                <Coins className="h-3 w-3" />
                <span>
                  Odhad fronty: {summary.remainingCreditCost} kr (máte {availableCredits})
                </span>
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-400">
            Zařaďte více videí s různými prompty, styly, pohyby kamery a formáty; systém je vykreslí přesně popořadě jeden po druhém.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="batch-add-current-btn"
            onClick={onAddCurrentToQueue}
            className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1.5 text-[11px] font-bold text-cyan-300 whitespace-nowrap transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Přidat aktuální nastavení</span>
          </button>

          <button
            type="button"
            data-testid="batch-toggle-composer-btn"
            onClick={() => setIsComposerOpen(!isComposerOpen)}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 hover:border-zinc-500 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 whitespace-nowrap transition"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            <span>{isComposerOpen ? 'Skrýt formulář úlohy' : 'Nová vlastní úloha'}</span>
          </button>

          {(summary.completed > 0 || summary.failed > 0 || summary.cancelled > 0) && (
            <button
              type="button"
              data-testid="batch-clear-finished-btn"
              onClick={onClearFinished}
              className="rounded border border-zinc-800 bg-zinc-950 hover:border-zinc-600 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-white whitespace-nowrap transition"
            >
              Vyčistit dokončené
            </button>
          )}

          {isRunning ? (
            <button
              type="button"
              data-testid="batch-pause-btn"
              onClick={onPauseBatch}
              className="flex items-center gap-1.5 rounded border border-rose-500/50 bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 text-[11px] font-bold text-rose-200 whitespace-nowrap transition"
            >
              <Pause className="h-3.5 w-3.5" />
              <span>Pozastavit dávku</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="batch-start-btn"
              disabled={!canCreateVideos || summary.queued === 0}
              onClick={onStartBatch}
              className="flex items-center gap-1.5 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 hover:opacity-90 px-3.5 py-1.5 text-[11px] font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span className="tabular-nums">Spustit dávku ({summary.queued})</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Custom Task Composer */}
      {isComposerOpen && (
        <form
          data-testid="batch-composer-form"
          onSubmit={handleComposerSubmit}
          className="rounded-lg border border-cyan-500/30 bg-zinc-950/90 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-cyan-300 uppercase">
              Nová úloha s vlastními parametry pro dávkovou frontu
            </span>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Prompt / zadání scény</span>
            <textarea
              data-testid="batch-composer-prompt-input"
              rows={2}
              required
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Např.: Ranní mlha nad zasněženými vrcholky Alp, pomalý nájezd dronu do východu slunce..."
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-y"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <label className="block space-y-1 lg:col-span-2">
              <span className="text-[10px] text-zinc-400">Model / Engine</span>
              <select
                data-testid="batch-composer-model-select"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
              >
                {selectableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.creditCost === 0 ? '0 kr' : `${m.creditCost} kr`})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">Vizuální styl</span>
              <select
                data-testid="batch-composer-style-select"
                value={customVisualStyle}
                onChange={(e) => setCustomVisualStyle(e.target.value as VideoVisualStyle)}
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
              >
                {(Object.keys(VISUAL_STYLE_PALETTES) as VideoVisualStyle[]).map((styleKey) => (
                  <option key={styleKey} value={styleKey}>
                    {VISUAL_STYLE_PALETTES[styleKey].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">Pohyb kamery</span>
              <select
                data-testid="batch-composer-camera-select"
                value={customCamera}
                onChange={(e) => setCustomCamera(e.target.value as OpenGenCameraMotion)}
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
              >
                {(Object.keys(CAMERA_MOTION_LABELS) as OpenGenCameraMotion[]).map((camKey) => (
                  <option key={camKey} value={camKey}>
                    {CAMERA_MOTION_LABELS[camKey].split('(')[0].trim()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">Formát &amp; Kvalita</span>
              <div className="grid grid-cols-2 gap-1">
                <select
                  data-testid="batch-composer-format-select"
                  value={customFormat}
                  onChange={(e) => setCustomFormat(e.target.value as '9:16' | '16:9')}
                  className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1.5 text-[11px] text-white"
                >
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                </select>
                <select
                  data-testid="batch-composer-quality-select"
                  value={customQuality}
                  onChange={(e) => setCustomQuality(e.target.value as '720p' | '1080p' | '4K')}
                  className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1.5 text-[11px] text-white"
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4K">4K</option>
                </select>
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">FPS &amp; Délka</span>
              <div className="grid grid-cols-2 gap-1">
                <select
                  data-testid="batch-composer-fps-select"
                  value={customFps}
                  onChange={(e) => setCustomFps(Number(e.target.value) as 24 | 30 | 60)}
                  className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1.5 text-[11px] text-white tabular-nums"
                >
                  <option value={24}>24 FPS</option>
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
                <input
                  type="number"
                  min={4}
                  max={15}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Math.max(4, Math.min(15, Number(e.target.value) || 6)))}
                  aria-label="Délka videa v sekundách"
                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-white text-right tabular-nums"
                />
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsComposerOpen(false)}
              className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-400 hover:text-white transition"
            >
              Zrušit
            </button>
            <button
              type="submit"
              data-testid="batch-composer-submit-btn"
              disabled={!customPrompt.trim()}
              className="flex items-center gap-1.5 rounded bg-cyan-400 hover:bg-cyan-300 px-3.5 py-1.5 text-[11px] font-bold text-black disabled:opacity-40 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Zařadit úlohu do fronty</span>
            </button>
          </div>
        </form>
      )}

      {/* Overall Batch Progress Bar */}
      {summary.total > 0 && (isRunning || summary.completed > 0 || summary.failed > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 tabular-nums">
            <span>Celkový průběh dávky</span>
            <span className="font-bold text-cyan-300">{summary.overallProgressPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-950 border border-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${summary.overallProgressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Queue Items List */}
      {queue.length === 0 ? (
        <div
          data-testid="batch-queue-empty"
          className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 p-4 text-center text-[11px] text-zinc-500"
        >
          Fronta je prázdná. Klikněte na <strong className="text-zinc-300">„Přidat aktuální nastavení“</strong> nebo{' '}
          <strong className="text-zinc-300">„+ Nová vlastní úloha“</strong> pro sekvenční zpracování více videí.
        </div>
      ) : (
        <div className="space-y-2" data-testid="batch-queue-list">
          {queue.map((item, idx) => (
            <div
              key={item.id}
              data-testid={`batch-queue-item-${idx}`}
              className={`rounded-lg border p-3 transition space-y-2 ${
                item.status === 'running'
                  ? 'border-cyan-500/60 bg-cyan-950/20'
                  : item.status === 'completed'
                  ? 'border-emerald-500/35 bg-emerald-950/15'
                  : item.status === 'failed'
                  ? 'border-rose-500/40 bg-rose-950/20'
                  : 'border-zinc-800 bg-zinc-950/85'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-500 tabular-nums">
                      #{idx + 1}
                    </span>
                    {getStatusBadge(item)}
                    <span className="font-bold text-white text-xs truncate max-w-[420px]">
                      {item.title}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 line-clamp-1">{item.prompt}</p>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400 tabular-nums">
                    <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-cyan-300">
                      {item.modelName}
                    </span>
                    <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-zinc-300">
                      {item.format} · {item.qualityTier} · {item.fps} FPS · {item.durationSec}s
                    </span>
                    <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-amber-200">
                      {CAMERA_MOTION_LABELS[item.cameraMotion].split('(')[0].trim()}
                    </span>
                    <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-purple-200">
                      {item.selectedStyleLabel}
                    </span>
                    <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-emerald-300">
                      {item.creditCost === 0 ? '0 kr' : `${item.creditCost} kr`}
                    </span>
                  </div>
                </div>

                {/* Per-Item Actions */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {item.status === 'queued' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onMoveItem(item.id, 'up')}
                        disabled={idx === 0}
                        aria-label={`Posunout úlohu ${idx + 1} výše`}
                        className="rounded border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(item.id, 'down')}
                        disabled={idx === queue.length - 1}
                        aria-label={`Posunout úlohu ${idx + 1} níže`}
                        className="rounded border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </>
                  )}

                  {(item.status === 'failed' || item.status === 'cancelled') && (
                    <button
                      type="button"
                      data-testid={`batch-retry-btn-${idx}`}
                      onClick={() => onRetryItem(item.id)}
                      className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Znovu</span>
                    </button>
                  )}

                  {item.status === 'completed' && item.asset && (
                    <>
                      <button
                        type="button"
                        data-testid={`batch-review-btn-${idx}`}
                        onClick={() => onReviewAsset(item.asset!)}
                        className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Náhled</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`batch-download-btn-${idx}`}
                        onClick={() => downloadVideoAsset(item.asset!)}
                        className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
                      >
                        <Download className="h-3 w-3" />
                        <span>MP4</span>
                      </button>
                    </>
                  )}

                  {item.status !== 'running' && (
                    <button
                      type="button"
                      data-testid={`batch-remove-btn-${idx}`}
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Odebrat úlohu ${idx + 1} z fronty`}
                      className="rounded border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-500 hover:text-rose-400 hover:border-rose-500/40 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Per-Item Progress or Error */}
              {item.status === 'running' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-cyan-300 tabular-nums">
                    <span>{item.workerMessage || 'Worker vykresluje snímky…'}</span>
                    <span className="font-bold">{item.progressPercent}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-300"
                      style={{ width: `${Math.max(4, item.progressPercent)}%` }}
                    />
                  </div>
                </div>
              )}

              {item.status === 'failed' && item.error && (
                <div className="text-[10px] text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded px-2.5 py-1.5">
                  {item.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
